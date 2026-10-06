import { query, queryOne, type SqlParams } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { parsePagination, meta } from '@/lib/pagination'
import { formatDuration, toDuration } from '@/lib/warranty'
import { isMissingTable } from '@/lib/warranty-card'

type Row = {
  id: number
  sn: string
  product_name: string
  brand: string | null
  model: string | null
  warranty_years: number | null
  warranty_months: number | null
  warranty_days: number | null
  customer_name: string | null
  phone: string | null
  warranty_start: string | null
  warranty_end: string | null
  print_count: number
  last_printed_at: string | null
}

/**
 * รายการ SN ที่ออกใบรับประกันได้ (ผูกผลิตภัณฑ์แล้ว และไม่ถูกยกเลิก) — ยังไม่เริ่มประกันก็ออกได้ วันที่เว้นว่าง
 *
 * status: registered = ลูกค้าลงทะเบียนแล้ว (มีเบอร์) · unregistered = ยังไม่มีลูกค้าลงทะเบียน
 *         issued = เคยออกใบแล้ว · not_issued = ยังไม่เคยออก
 */
export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const params = new URL(request.url).searchParams
  const page = parsePagination(params)

  const where: string[] = ["s.status <> 'void'"]
  const values: SqlParams = []

  const search = params.get('search')?.trim()
  if (search) {
    where.push('(s.sn LIKE ? OR r.customer_name LIKE ? OR r.phone LIKE ?)')
    values.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }

  const printed = 'EXISTS (SELECT 1 FROM warranty_card_prints w WHERE w.serial_number_id = s.id)'
  const status = params.get('status')
  if (status === 'registered') where.push('r.phone IS NOT NULL')
  else if (status === 'unregistered') where.push('r.phone IS NULL')
  else if (status === 'issued') where.push(printed)
  else if (status === 'not_issued') where.push(`NOT ${printed}`)

  const clause = `WHERE ${where.join(' AND ')}`
  const from = `FROM serial_numbers s
     JOIN products p ON p.id = s.product_id
     LEFT JOIN registrations r ON r.serial_number_id = s.id`

  try {
    const total = await queryOne<{ count: number }>(`SELECT COUNT(*) AS count ${from} ${clause}`, values)

    const rows = await query<Row>(
      `SELECT s.id, s.sn,
              p.name AS product_name, p.brand, p.model,
              p.warranty_years, p.warranty_months, p.warranty_days,
              r.customer_name, r.phone, r.warranty_start, r.warranty_end,
              (SELECT COUNT(*) FROM warranty_card_prints w WHERE w.serial_number_id = s.id) AS print_count,
              (SELECT MAX(w.printed_at) FROM warranty_card_prints w WHERE w.serial_number_id = s.id) AS last_printed_at
       ${from}
       ${clause}
       ORDER BY s.id DESC
       LIMIT ${page.perPage} OFFSET ${page.offset}`,
      values
    )

    return Response.json({
      serials: rows.map(({ warranty_years, warranty_months, warranty_days, ...row }) => ({
        ...row,
        print_count: Number(row.print_count),
        warranty_text: formatDuration(toDuration({ warranty_years, warranty_months, warranty_days })),
      })),
      meta: meta(total?.count ?? 0, page),
    })
  } catch (err) {
    if (isMissingTable(err)) {
      return Response.json(
        { error: 'ฐานข้อมูลยังไม่ได้อัปเดต — ผู้ดูแลระบบต้องรัน npm run db:init ก่อนใช้หน้านี้' },
        { status: 503 }
      )
    }
    console.error('warranty print list failed:', err)
    return Response.json({ error: 'โหลดรายการไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
  }
}
