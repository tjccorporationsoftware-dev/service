import { query, queryOne, type SqlParams } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { parsePagination, meta } from '@/lib/pagination'
import { daysLeft, formatDuration, toDuration, warrantyState } from '@/lib/warranty'

type Row = {
  id: number
  sn: string
  sn_status: string
  category: string | null
  product_name: string | null
  model: string | null
  warranty_years: number | null
  warranty_months: number | null
  warranty_days: number | null
  created_at: string
  registration_id: number | null
  phone: string | null
  customer_name: string | null
  registered_at: string | null
  warranty_start: string | null
  warranty_end: string | null
}

export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const params = new URL(request.url).searchParams
  const page = parsePagination(params)

  const where: string[] = []
  const values: SqlParams = []

  const search = params.get('search')?.trim()
  if (search) {
    where.push('s.sn LIKE ?')
    values.push(`%${search}%`)
  }

  // 'started'/'registered' ทั้งคู่เก็บเป็น s.status = 'registered' เหมือนกันในฐานข้อมูล
  // ต่างกันตรงที่มีเบอร์โทรผูกไว้หรือยัง (r.phone) — ใช้แยกกรองว่าลูกค้า claim แล้วหรือแอดมินเริ่มไว้เฉย ๆ
  const status = params.get('status')
  if (status === 'available' || status === 'void') {
    where.push('s.status = ?')
    values.push(status)
  } else if (status === 'started') {
    where.push("s.status = 'registered' AND r.phone IS NULL")
  } else if (status === 'registered') {
    where.push("s.status = 'registered' AND r.phone IS NOT NULL")
  }

  const productIdParam = params.get('product_id')
  if (productIdParam === 'unassigned') {
    where.push('s.product_id IS NULL')
  } else {
    const productId = Number.parseInt(productIdParam ?? '', 10)
    if (Number.isFinite(productId)) {
      where.push('s.product_id = ?')
      values.push(productId)
    }
  }

  const category = params.get('category')?.trim()
  if (category) {
    where.push('s.category = ?')
    values.push(category)
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM serial_numbers s
     LEFT JOIN registrations r ON r.serial_number_id = s.id
     ${clause}`,
    values
  )

  const rows = await query<Row>(
    `SELECT s.id, s.sn, s.status AS sn_status, s.category, s.created_at,
            p.name AS product_name, p.model,
            p.warranty_years, p.warranty_months, p.warranty_days,
            r.id AS registration_id, r.phone, r.customer_name, r.registered_at,
            r.warranty_start, r.warranty_end
     FROM serial_numbers s
     LEFT JOIN products p ON p.id = s.product_id
     LEFT JOIN registrations r ON r.serial_number_id = s.id
     ${clause}
     ORDER BY s.id DESC
     LIMIT ${page.perPage} OFFSET ${page.offset}`,
    values
  )

  const categories = await query<{ category: string }>(
    `SELECT DISTINCT category FROM serial_numbers WHERE category IS NOT NULL ORDER BY category`
  )

  return Response.json({
    serials: rows.map((row) => ({
      ...row,
      // ยังไม่ผูกผลิตภัณฑ์ = ไม่รู้ระยะประกัน
      warranty_text: row.product_name ? formatDuration(toDuration(row)) : null,
      days_left: row.warranty_end ? daysLeft(row.warranty_end) : null,
      // ไม่มี registration_id เลย = ยังไม่ลงทะเบียน (ต่างจาก "ลงทะเบียนแล้วแต่ยังไม่เริ่มประกัน")
      warranty_status: row.registration_id ? warrantyState(row.warranty_end) : null,
    })),
    categories: categories.map((c) => c.category),
    meta: meta(total?.count ?? 0, page),
  })
}
