import { query } from '@/lib/db'
import { formatDuration, toDuration } from '@/lib/warranty'

export async function GET() {
  const rows = await query(
    `SELECT id, name, code, brand, model, warranty_years, warranty_months, warranty_days
     FROM products
     WHERE is_active = 1
     ORDER BY name`
  )

  const products = rows.map((row) => ({
    ...row,
    warranty_text: formatDuration(toDuration(row)),
  }))

  return Response.json({ products })
}
