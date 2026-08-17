import { queryOne } from '@/lib/db'
import { snSchema } from '@/lib/validations'
import { daysLeft, formatDuration, maskPhone, toDuration, warrantyState } from '@/lib/warranty'
import { checkRateLimit } from '@/lib/rate-limit'

type Row = {
  sn: string
  sn_status: string
  product_id: number | null
  product_name: string | null
  model: string | null
  warranty_years: number | null
  warranty_months: number | null
  warranty_days: number | null
  registration_id: number | null
  phone: string | null
  registered_at: string | null
  warranty_start: string | null
  warranty_end: string | null
}

export async function GET(request: Request) {
  const limited = checkRateLimit(request, 'warranty-check', 30, 60_000)
  if (limited) return limited

  const raw = new URL(request.url).searchParams.get('sn') ?? ''
  const parsed = snSchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json({ error: 'กรุณากรอก Serial Number' }, { status: 400 })
  }

  const row = await queryOne<Row>(
    `SELECT s.sn, s.status AS sn_status, s.product_id, p.name AS product_name, p.model,
            p.warranty_years, p.warranty_months, p.warranty_days,
            r.id AS registration_id, r.phone, r.registered_at, r.warranty_start, r.warranty_end
     FROM serial_numbers s
     LEFT JOIN products p ON p.id = s.product_id
     LEFT JOIN registrations r ON r.serial_number_id = s.id
     WHERE s.sn = ?`,
    [parsed.data]
  )

  if (!row) {
    return Response.json({ error: 'ไม่พบ Serial Number นี้ในระบบ' }, { status: 404 })
  }
  if (!row.product_id) {
    return Response.json(
      { error: 'Serial Number นี้ยังไม่พร้อมใช้งาน กรุณาติดต่อเจ้าหน้าที่' },
      { status: 409 }
    )
  }

  if (!row.registration_id) {
    return Response.json({
      sn: row.sn,
      registered: false,
      product_name: row.product_name,
      model: row.model,
      warranty_text: formatDuration(toDuration(row)),
    })
  }

  const state = warrantyState(row.warranty_end)
  // มี registration แต่ยังไม่มีเบอร์โทร = แอดมินเริ่มประกันตรง ยังไม่มีลูกค้า "รับ" (claim)
  const claimed = Boolean(row.phone)

  return Response.json({
    sn: row.sn,
    registered: true,
    claimed,
    status: state,
    product_name: row.product_name,
    model: row.model,
    warranty_text: formatDuration(toDuration(row)),
    phone: claimed ? maskPhone(row.phone ?? '') : null,
    registered_at: row.registered_at,
    warranty_start: row.warranty_start,
    warranty_end: row.warranty_end,
    days_left: row.warranty_end ? daysLeft(row.warranty_end) : null,
  })
}
