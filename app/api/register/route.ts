import type { RowDataPacket, ResultSetHeader } from 'mysql2'
import { withTransaction } from '@/lib/db'
import { registerSchema, firstIssueMessage } from '@/lib/validations'
import { formatDuration, toDuration } from '@/lib/warranty'
import { checkRateLimit } from '@/lib/rate-limit'

type SerialRow = RowDataPacket & {
  id: number
  status: 'available' | 'registered' | 'void'
  product_id: number | null
  product_name: string | null
  brand: string | null
  model: string | null
  warranty_years: number | null
  warranty_months: number | null
  warranty_days: number | null
  registration_id: number | null
  reg_phone: string | null
  reg_warranty_start: string | null
  reg_warranty_end: string | null
}

export async function POST(request: Request) {
  const limited = checkRateLimit(request, 'register', 10, 60_000)
  if (limited) return limited

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  }
  // consent ผ่านการตรวจจาก zod แล้วว่าต้องเป็น true เสมอ ไม่ต้องอ้างอิงต่อในนี้
  const {
    customer_name,
    phone,
    email,
    product_id,
    sn,
    customer_reported_warranty_start,
    customer_reported_warranty_end,
  } = parsed.data

  try {
    const result = await withTransaction(async (conn) => {
      // ล็อกแถว SN ไว้ กันสองคนลงทะเบียน SN เดียวกันพร้อมกัน
      const [rows] = await conn.execute<SerialRow[]>(
        `SELECT s.id, s.status, s.product_id, p.name AS product_name, p.brand, p.model,
                p.warranty_years, p.warranty_months, p.warranty_days,
                r.id AS registration_id, r.phone AS reg_phone,
                r.warranty_start AS reg_warranty_start, r.warranty_end AS reg_warranty_end
         FROM serial_numbers s
         LEFT JOIN products p ON p.id = s.product_id
         LEFT JOIN registrations r ON r.serial_number_id = s.id
         WHERE s.sn = ?
         FOR UPDATE`,
        [sn]
      )

      const serial = rows[0]
      if (!serial) return { error: 'ไม่พบ Serial Number นี้ในระบบ', status: 404 } as const
      if (serial.status === 'void') {
        return { error: 'Serial Number นี้ถูกยกเลิกแล้ว', status: 409 } as const
      }
      if (!serial.product_id) {
        return {
          error: 'Serial Number นี้ยังไม่พร้อมให้ลงทะเบียน กรุณาติดต่อเจ้าหน้าที่',
          status: 409,
        } as const
      }
      if (serial.status === 'registered' && serial.reg_phone) {
        return { error: 'Serial Number นี้ถูกลงทะเบียนไปแล้ว', status: 409 } as const
      }
      if (serial.product_id !== product_id) {
        return {
          error: `Serial Number นี้เป็นของ "${serial.product_name}" ไม่ตรงกับผลิตภัณฑ์ที่เลือก`,
          status: 409,
        } as const
      }

      const duration = toDuration(serial)

      // แอดมินเริ่มประกันไว้ล่วงหน้าแล้ว (registration ถูกสร้างไว้แต่ยังไม่มีลูกค้าผูกข้อมูล)
      // ลูกค้าคนนี้คือคน "รับ" (claim) — เติมข้อมูลติดต่อ ไม่แตะวันประกันที่เริ่มไปแล้ว
      if (serial.registration_id) {
        // ถ้าแอดมินเริ่มประกันไว้แล้ว วันที่ลูกค้ากรอกต้องตรงกับที่ยืนยันไว้จริงก่อน ถึงจะ claim สำเร็จ
        // ไม่ตรง = ไม่อัปเดตอะไรเลย ปล่อยให้ registration ค้างไว้แบบเดิม รอลูกค้าแก้ไขแล้วส่งใหม่
        if (serial.reg_warranty_start) {
          const startWrong = customer_reported_warranty_start !== serial.reg_warranty_start
          const endWrong = customer_reported_warranty_end !== serial.reg_warranty_end
          if (startWrong || endWrong) {
            return {
              error:
                'วันที่ประกันที่ท่านกรอกไม่ตรงกับวันที่เจ้าหน้าที่ยืนยันไว้ในระบบ กรุณาติดต่อเจ้าหน้าที่เพื่อตรวจสอบ',
              status: 409,
              field_errors: { warranty_start: startWrong, warranty_end: endWrong },
            } as const
          }
        }

        await conn.execute(
          `UPDATE registrations
           SET phone = ?, customer_name = ?, email = ?, consent_accepted_at = NOW(),
               customer_reported_warranty_start = ?, customer_reported_warranty_end = ?
           WHERE id = ?`,
          [
            phone,
            customer_name,
            email,
            customer_reported_warranty_start,
            customer_reported_warranty_end,
            serial.registration_id,
          ]
        )

        return {
          registration: {
            id: serial.registration_id,
            sn,
            customer_name,
            email,
            product_name: serial.product_name,
            brand: serial.brand,
            model: serial.model,
            warranty_text: formatDuration(duration),
            warranty_start: serial.reg_warranty_start,
            warranty_end: serial.reg_warranty_end,
          },
        }
      }

      // warranty_start/end เว้นว่างไว้ก่อน — แอดมินเป็นคนกด "เริ่มประกัน" ทีหลังจากหน้า Serial Number
      // consent ผ่าน zod มาแล้วว่าเป็น true เสมอ — บันทึกเวลาที่ยอมรับไว้เป็นหลักฐาน (PDPA)
      const [inserted] = await conn.execute<ResultSetHeader>(
        `INSERT INTO registrations
           (serial_number_id, phone, customer_name, email, warranty_start, warranty_end, consent_accepted_at,
            customer_reported_warranty_start, customer_reported_warranty_end)
         VALUES (?, ?, ?, ?, NULL, NULL, NOW(), ?, ?)`,
        [
          serial.id,
          phone,
          customer_name,
          email,
          customer_reported_warranty_start ?? null,
          customer_reported_warranty_end ?? null,
        ]
      )

      await conn.execute(`UPDATE serial_numbers SET status = 'registered' WHERE id = ?`, [serial.id])

      return {
        registration: {
          id: inserted.insertId,
          sn,
          customer_name,
          email,
          product_name: serial.product_name,
          brand: serial.brand,
          model: serial.model,
          warranty_text: formatDuration(duration),
          warranty_start: null,
          warranty_end: null,
        },
      }
    })

    if ('error' in result) {
      const fieldErrors = 'field_errors' in result ? result.field_errors : undefined
      return Response.json({ error: result.error, field_errors: fieldErrors }, { status: result.status })
    }
    return Response.json(result, { status: 201 })
  } catch (err) {
    console.error('register failed:', err)
    return Response.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' }, { status: 500 })
  }
}
