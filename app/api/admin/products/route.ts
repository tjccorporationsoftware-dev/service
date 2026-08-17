import { execute, query, queryOne } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { productSchema, firstIssueMessage } from '@/lib/validations'
import { formatDuration, resolveWarrantyDuration, toDuration } from '@/lib/warranty'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  // นับ SN ที่ผูกอยู่ เพื่อบอกแอดมินว่าผลิตภัณฑ์นี้ถูกใช้งานไปแล้วแค่ไหน
  const rows = await query(
    `SELECT p.id, p.name, p.code, p.brand, p.model, p.source_type,
            p.warranty_years, p.warranty_months, p.warranty_days,
            p.warranty_start_date, p.warranty_end_date,
            p.is_active, p.created_at,
            (SELECT COUNT(*) FROM serial_numbers s WHERE s.product_id = p.id) AS serial_count
     FROM products p
     ORDER BY p.is_active DESC, p.name`
  )

  const products = rows.map((row) => ({
    ...row,
    warranty_text: formatDuration(toDuration(row)),
  }))

  return Response.json({ products })
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

  const parsed = productSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  }
  const { name, brand, model, source_type, warranty_years, warranty_months, warranty_days } =
    parsed.data
  // เว้นว่าง = NULL ไม่ใช่ '' เพราะคอลัมน์เป็น UNIQUE (ดู db/schema.sql)
  const code = parsed.data.code || null
  const startDate = parsed.data.warranty_start_date || null
  const endDate = parsed.data.warranty_end_date || null

  // กรอกช่วงวันมาครบทั้งคู่ = ให้ช่วงวันเป็นตัวตั้ง ระยะประกันคำนวณตามนั้น
  const duration = resolveWarrantyDuration(
    { years: warranty_years, months: warranty_months, days: warranty_days },
    startDate,
    endDate
  )

  // ไม่มีรหัสก็ไม่ต้องเช็คซ้ำ — ผลิตภัณฑ์ไร้รหัสมีกี่ตัวก็ได้
  if (code) {
    const existing = await queryOne<{ id: number }>('SELECT id FROM products WHERE code = ?', [code])
    if (existing) {
      return Response.json({ error: `รหัส "${code}" ถูกใช้กับผลิตภัณฑ์อื่นแล้ว` }, { status: 409 })
    }
  }

  const result = await execute(
    `INSERT INTO products (name, code, brand, model, source_type,
                           warranty_years, warranty_months, warranty_days,
                           warranty_start_date, warranty_end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      code,
      brand || null,
      model || null,
      source_type,
      duration.years,
      duration.months,
      duration.days,
      startDate,
      endDate,
    ]
  )

  await execute('INSERT INTO audit_logs (admin_id, action, detail) VALUES (?, ?, ?)', [
    auth.session.id,
    'product.create',
    `เพิ่มผลิตภัณฑ์ "${name}" (${code ?? 'ไม่ระบุรหัส'}, ${
      source_type === 'in_house' ? 'ผลิตเอง' : 'ซื้อมาขายต่อ'
    }, ประกัน ${formatDuration(duration)})`,
  ])

  return Response.json(
    {
      product: {
        id: result.insertId,
        name,
        code,
        brand: brand || null,
        model: model || null,
        source_type,
        warranty_years: duration.years,
        warranty_months: duration.months,
        warranty_days: duration.days,
        warranty_start_date: startDate,
        warranty_end_date: endDate,
        warranty_text: formatDuration(duration),
      },
    },
    { status: 201 }
  )
}
