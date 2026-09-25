import { query } from '@/lib/db'
import { requireServiceKey } from '@/lib/service-api'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * GET /api/service/issues — รายการเคสที่ลูกค้าแจ้งและยังไม่ปิด
 *
 * ใช้โดยระบบแจ้งซ่อม (tjc-api-server) เพื่อขึ้นกล่องแจ้งเตือนให้พนักงานเปิดใบงาน
 * คืนชุดข้อมูลเดียวกับที่ฝั่งนั้นเคยอ่านจากฐานโดยตรง เพื่อให้สลับไปมาได้โดยหน้าจอไม่เปลี่ยน
 *
 * เอาเฉพาะ pending / in_progress — ที่ resolved/closed ถือว่าจบที่ฝั่งนี้แล้ว
 */

type IssueRow = {
  id: number
  description: string
  status: string
  in_warranty: number
  created_at: string
  customer_name: string | null
  phone: string | null
  email: string | null
  warranty_start: string | null
  warranty_end: string | null
  sn: string
  product_name: string | null
  brand: string | null
  model: string | null
  file_count: number
}

const MAX_LIMIT = 200

export async function GET(request: Request) {
  // key รั่วแล้วโดนยิงรัว ๆ ยังจำกัดความเสียหายได้ระดับหนึ่ง
  const limited = checkRateLimit(request, 'service-api', 120, 60_000)
  if (limited) return limited

  const auth = requireServiceKey(request)
  if (!auth.ok) return auth.response

  const raw = Number(new URL(request.url).searchParams.get('limit'))
  // ต่อลง SQL ตรง ๆ ไม่ได้ถ้าไม่ clamp ก่อน (mysql2 ไม่รับ placeholder ใน LIMIT)
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), MAX_LIMIT) : 50

  const rows = await query<IssueRow>(
    `SELECT ir.id, ir.description, ir.status, ir.in_warranty, ir.created_at,
            r.customer_name, r.phone, r.email, r.warranty_start, r.warranty_end,
            s.sn,
            p.name AS product_name, p.brand, p.model,
            (SELECT COUNT(*) FROM issue_attachments ia WHERE ia.issue_report_id = ir.id) AS file_count
     FROM issue_reports ir
     JOIN registrations r  ON ir.registration_id = r.id
     JOIN serial_numbers s ON r.serial_number_id = s.id
     LEFT JOIN products p  ON s.product_id = p.id
     WHERE ir.status IN ('pending', 'in_progress')
     ORDER BY ir.created_at DESC
     LIMIT ${limit}`
  )

  return Response.json({ issues: rows })
}
