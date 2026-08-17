import type { RowDataPacket } from 'mysql2'
import { execute, withTransaction } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { snAssignProductSchema, firstIssueMessage } from '@/lib/validations'

type SerialRow = RowDataPacket & {
  id: number
  product_id: number | null
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

  const parsed = snAssignProductSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  }
  const { serial_number_ids, product_id } = parsed.data

  const product = await withTransaction(async (conn) => {
    const [productRows] = await conn.execute<RowDataPacket[]>(
      'SELECT id, name FROM products WHERE id = ? AND is_active = 1',
      [product_id]
    )
    return productRows[0] as { id: number; name: string } | undefined
  })
  if (!product) {
    return Response.json({ error: 'ไม่พบผลิตภัณฑ์ที่เลือก' }, { status: 404 })
  }

  try {
    const { assigned, requested } = await withTransaction(async (conn) => {
      const placeholders = serial_number_ids.map(() => '?').join(',')
      const [rows] = await conn.execute<SerialRow[]>(
        `SELECT id, product_id FROM serial_numbers WHERE id IN (${placeholders}) FOR UPDATE`,
        serial_number_ids
      )

      // ผูกได้เฉพาะ SN ที่ยังไม่มีผลิตภัณฑ์เท่านั้น — กันผูกทับของเดิมโดยไม่ตั้งใจ
      const unassignedIds = rows.filter((r) => r.product_id === null).map((r) => r.id)
      if (unassignedIds.length === 0) {
        return { assigned: 0, requested: serial_number_ids.length }
      }

      const assignPlaceholders = unassignedIds.map(() => '?').join(',')
      await conn.execute(
        `UPDATE serial_numbers SET product_id = ? WHERE id IN (${assignPlaceholders})`,
        [product_id, ...unassignedIds]
      )

      return { assigned: unassignedIds.length, requested: serial_number_ids.length }
    })

    await execute('INSERT INTO audit_logs (admin_id, action, detail) VALUES (?, ?, ?)', [
      auth.session.id,
      'sn.assign_product',
      `ผูก SN ${assigned}/${requested} รายการ เข้ากับผลิตภัณฑ์ "${product.name}"`,
    ])

    return Response.json({ assigned, skipped: requested - assigned })
  } catch (err) {
    console.error('assign product to sn failed:', err)
    return Response.json({ error: 'ผูกผลิตภัณฑ์ไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
  }
}
