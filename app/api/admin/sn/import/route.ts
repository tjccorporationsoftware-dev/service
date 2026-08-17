import { randomUUID } from 'node:crypto'
import type { ResultSetHeader } from 'mysql2'
import { execute, pool, queryOne } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { snImportSchema, firstIssueMessage } from '@/lib/validations'

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const parsed = snImportSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  }
  const { product_id, category } = parsed.data
  // ตัด SN ซ้ำกันเองในชุดที่วางเข้ามาออกก่อน (ไม่นับเป็น error แค่ไม่ใส่ซ้ำ)
  const sns = [...new Set(parsed.data.sns)]

  const product = await queryOne<{ id: number; name: string }>(
    'SELECT id, name FROM products WHERE id = ? AND is_active = 1',
    [product_id]
  )
  if (!product) {
    return Response.json({ error: 'ไม่พบผลิตภัณฑ์ที่เลือก' }, { status: 404 })
  }

  const batchId = randomUUID()

  try {
    const rows = sns.map((sn) => [sn, product_id, batchId, category, auth.session.id])
    // นำเข้า SN ที่มีอยู่จริงของผลิตภัณฑ์นี้ — ผูกผลิตภัณฑ์ทันที ไม่ผ่านรูปแบบรหัสอัตโนมัติ
    const [result] = await pool.query(
      'INSERT IGNORE INTO serial_numbers (sn, product_id, batch_id, category, generated_by) VALUES ?',
      [rows]
    )
    const imported = (result as ResultSetHeader).affectedRows
    const skipped = sns.length - imported

    await execute('INSERT INTO audit_logs (admin_id, action, detail) VALUES (?, ?, ?)', [
      auth.session.id,
      'sn.import',
      `นำเข้า SN เอง ${imported} ตัว สำหรับ "${product.name}" หมวดหมู่ "${category}" (batch ${batchId})${
        skipped > 0 ? ` ข้าม ${skipped} ตัวที่ซ้ำกับที่มีอยู่แล้ว` : ''
      }`,
    ])

    const [serials] = await pool.execute(
      'SELECT id, sn FROM serial_numbers WHERE batch_id = ? ORDER BY id',
      [batchId]
    )

    return Response.json(
      { batch_id: batchId, product: { id: product.id, name: product.name }, category, imported, skipped, serials },
      { status: 201 }
    )
  } catch (err) {
    console.error('import sn failed:', err)
    return Response.json({ error: 'นำเข้า SN ไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
  }
}
