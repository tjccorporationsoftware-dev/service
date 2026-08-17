import type { RowDataPacket } from 'mysql2'
import { execute, withTransaction } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { startWarrantySchema, firstIssueMessage } from '@/lib/validations'
import { addDuration, toDateString, toDuration } from '@/lib/warranty'

type SerialRow = RowDataPacket & {
  serial_id: number
  sn_status: 'available' | 'registered' | 'void'
  registration_id: number | null
  warranty_start: string | null
  warranty_years: number
  warranty_months: number
  warranty_days: number
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const parsed = startWarrantySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  }
  const { serial_number_ids, start_date } = parsed.data

  const startDate = start_date ?? toDateString(new Date())
  const startDateObj = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(startDateObj.getTime())) {
    return Response.json({ error: 'วันที่ไม่ถูกต้อง' }, { status: 400 })
  }

  try {
    const { started, requested } = await withTransaction(async (conn) => {
      // ทำงานที่ระดับ serial_numbers ไม่ใช่ registrations เพราะบางแถวยังไม่มีใครลงทะเบียนเลย
      const placeholders = serial_number_ids.map(() => '?').join(',')
      const [rows] = await conn.execute<SerialRow[]>(
        `SELECT s.id AS serial_id, s.status AS sn_status,
                r.id AS registration_id, r.warranty_start,
                p.warranty_years, p.warranty_months, p.warranty_days
         FROM serial_numbers s
         JOIN products p ON p.id = s.product_id
         LEFT JOIN registrations r ON r.serial_number_id = s.id
         WHERE s.id IN (${placeholders})
         FOR UPDATE`,
        serial_number_ids
      )

      let started = 0
      for (const row of rows) {
        // ข้าม SN ที่ถูกยกเลิก หรือเริ่มประกันไปแล้ว (กันกดซ้ำทับวันเดิมโดยไม่ตั้งใจ)
        if (row.sn_status === 'void' || row.warranty_start) continue

        const warrantyEnd = toDateString(addDuration(startDateObj, toDuration(row)))

        if (row.registration_id) {
          // มีลูกค้าลงทะเบียนไว้แล้ว รอเริ่มประกันอยู่ (flow ปกติ)
          await conn.execute(
            'UPDATE registrations SET warranty_start = ?, warranty_end = ? WHERE id = ?',
            [startDate, warrantyEnd, row.registration_id]
          )
        } else {
          // ยังไม่มีลูกค้าลงทะเบียนเลย — แอดมินเริ่มประกันตรง
          // สร้าง registration เปล่าไว้ก่อน รอลูกค้ามา "รับ" (claim) ทีหลังผ่านหน้าลงทะเบียน
          await conn.execute(
            `INSERT INTO registrations (serial_number_id, phone, customer_name, email, warranty_start, warranty_end)
             VALUES (?, NULL, NULL, NULL, ?, ?)`,
            [row.serial_id, startDate, warrantyEnd]
          )
          await conn.execute(`UPDATE serial_numbers SET status = 'registered' WHERE id = ?`, [
            row.serial_id,
          ])
        }
        started++
      }

      return { started, requested: serial_number_ids.length }
    })

    await execute('INSERT INTO audit_logs (admin_id, action, detail) VALUES (?, ?, ?)', [
      auth.session.id,
      'registration.start_warranty',
      `เริ่มประกัน ${started}/${requested} รายการ (วันที่เริ่ม ${startDate})`,
    ])

    return Response.json({ started, skipped: requested - started, start_date: startDate })
  } catch (err) {
    console.error('start-warranty failed:', err)
    return Response.json({ error: 'เริ่มประกันไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
  }
}
