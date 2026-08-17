import { query, queryOne, type SqlParams } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { parsePagination, meta } from '@/lib/pagination'
import { daysLeft, warrantyState } from '@/lib/warranty'

type Row = {
  id: number
  sn: string
  phone: string
  customer_name: string | null
  registered_at: string
  warranty_start: string | null
  warranty_end: string | null
  customer_reported_warranty_start: string | null
  customer_reported_warranty_end: string | null
  product_name: string
  model: string | null
  issue_count: number
}

export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const params = new URL(request.url).searchParams
  const page = parsePagination(params)

  const where: string[] = []
  const values: SqlParams = []

  // ค้นได้ทั้ง SN, เบอร์โทร และชื่อลูกค้า
  const search = params.get('search')?.trim()
  if (search) {
    where.push('(s.sn LIKE ? OR r.phone LIKE ? OR r.customer_name LIKE ?)')
    values.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }

  const productId = Number.parseInt(params.get('product_id') ?? '', 10)
  if (Number.isFinite(productId)) {
    where.push('s.product_id = ?')
    values.push(productId)
  }

  const warrantyStatus = params.get('warranty_status')
  if (warrantyStatus === 'active') where.push('r.warranty_end >= CURDATE()')
  if (warrantyStatus === 'expired') where.push('r.warranty_end < CURDATE()')
  if (warrantyStatus === 'not_started') where.push('r.warranty_start IS NULL')

  // ตัวกรองช่วงวันที่ — วันลงทะเบียน และ วันที่เริ่มประกัน แยกกัน
  const registeredFrom = params.get('registered_from')
  if (registeredFrom) {
    where.push('DATE(r.registered_at) >= ?')
    values.push(registeredFrom)
  }
  const registeredTo = params.get('registered_to')
  if (registeredTo) {
    where.push('DATE(r.registered_at) <= ?')
    values.push(registeredTo)
  }
  const warrantyStartFrom = params.get('warranty_start_from')
  if (warrantyStartFrom) {
    where.push('r.warranty_start >= ?')
    values.push(warrantyStartFrom)
  }
  const warrantyStartTo = params.get('warranty_start_to')
  if (warrantyStartTo) {
    where.push('r.warranty_start <= ?')
    values.push(warrantyStartTo)
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM registrations r
     JOIN serial_numbers s ON s.id = r.serial_number_id
     ${clause}`,
    values
  )

  const rows = await query<Row>(
    `SELECT r.id, s.sn, r.phone, r.customer_name, r.registered_at,
            r.warranty_start, r.warranty_end,
            r.customer_reported_warranty_start, r.customer_reported_warranty_end,
            p.name AS product_name, p.model,
            (SELECT COUNT(*) FROM issue_reports i WHERE i.registration_id = r.id) AS issue_count
     FROM registrations r
     JOIN serial_numbers s ON s.id = r.serial_number_id
     JOIN products p ON p.id = s.product_id
     ${clause}
     ORDER BY r.registered_at DESC
     LIMIT ${page.perPage} OFFSET ${page.offset}`,
    values
  )

  return Response.json({
    registrations: rows.map((row) => ({
      ...row,
      days_left: row.warranty_end ? daysLeft(row.warranty_end) : null,
      warranty_status: warrantyState(row.warranty_end),
      // เทียบวันที่ลูกค้ากรอกเองกับวันที่แอดมินกดเริ่มประกันจริง — เตือนเฉพาะตอนมีทั้งคู่แล้วไม่ตรงกัน
      warranty_mismatch: Boolean(
        (row.warranty_start &&
          row.customer_reported_warranty_start &&
          row.warranty_start !== row.customer_reported_warranty_start) ||
          (row.warranty_end &&
            row.customer_reported_warranty_end &&
            row.warranty_end !== row.customer_reported_warranty_end)
      ),
    })),
    meta: meta(total?.count ?? 0, page),
  })
}
