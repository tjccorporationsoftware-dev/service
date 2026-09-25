import { query, queryOne, execute } from '@/lib/db'
import { requireServiceKey } from '@/lib/service-api'
import { checkRateLimit } from '@/lib/rate-limit'
import { serviceIssuePatchSchema, firstIssueMessage } from '@/lib/validations'

/**
 * GET   /api/service/issues/[id] — ข้อมูลเต็มของเคสเดียว พร้อมรายการไฟล์แนบ
 * PATCH /api/service/issues/[id] — เปลี่ยนสถานะเคส (ระบบแจ้งซ่อมเรียกเมื่อรับเรื่อง/ปิดงาน)
 */

type DetailRow = {
  id: number
  description: string
  status: string
  in_warranty: number
  admin_note: string | null
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
}

type AttachmentRow = {
  id: number
  file_type: 'image' | 'video'
  file_path: string
  original_name: string | null
  file_size: number | null
}

async function loadIssue(id: number) {
  return queryOne<DetailRow>(
    `SELECT ir.id, ir.description, ir.status, ir.in_warranty, ir.admin_note, ir.created_at,
            r.customer_name, r.phone, r.email, r.warranty_start, r.warranty_end,
            s.sn,
            p.name AS product_name, p.brand, p.model
     FROM issue_reports ir
     JOIN registrations r  ON ir.registration_id = r.id
     JOIN serial_numbers s ON r.serial_number_id = s.id
     LEFT JOIN products p  ON s.product_id = p.id
     WHERE ir.id = ?`,
    [id]
  )
}

function parseId(value: string): number | null {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(request: Request, ctx: RouteContext<'/api/service/issues/[id]'>) {
  const limited = checkRateLimit(request, 'service-api', 120, 60_000)
  if (limited) return limited

  const auth = requireServiceKey(request)
  if (!auth.ok) return auth.response

  const id = parseId((await ctx.params).id)
  if (id === null) {
    return Response.json({ error: 'รหัสเคสไม่ถูกต้อง' }, { status: 400 })
  }

  const issue = await loadIssue(id)
  if (!issue) {
    return Response.json({ error: 'ไม่พบเคสที่ระบุ' }, { status: 404 })
  }

  const attachments = await query<AttachmentRow>(
    `SELECT id, file_type, file_path, original_name, file_size
     FROM issue_attachments WHERE issue_report_id = ? ORDER BY id`,
    [id]
  )

  // ส่ง id ของไฟล์ไปด้วย ให้ผู้เรียกดาวน์โหลดผ่าน /api/service/issues/<id>/files/<file_id>
  // ซึ่งตรวจ key เหมือนกัน — ไม่ต้องพึ่ง /api/files/* ที่เปิดให้ใครก็โหลดได้
  return Response.json({ issue, attachments })
}

export async function PATCH(request: Request, ctx: RouteContext<'/api/service/issues/[id]'>) {
  const limited = checkRateLimit(request, 'service-api', 120, 60_000)
  if (limited) return limited

  const auth = requireServiceKey(request)
  if (!auth.ok) return auth.response

  const id = parseId((await ctx.params).id)
  if (id === null) {
    return Response.json({ error: 'รหัสเคสไม่ถูกต้อง' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const parsed = serviceIssuePatchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  }
  const { status, only_if_status } = parsed.data

  type IssueStatus = 'pending' | 'in_progress' | 'resolved' | 'closed'
  const current = await queryOne<{ status: IssueStatus }>(
    'SELECT status FROM issue_reports WHERE id = ?',
    [id]
  )
  if (!current) {
    return Response.json({ error: 'ไม่พบเคสที่ระบุ' }, { status: 404 })
  }

  // only_if_status = เปลี่ยนเฉพาะเมื่อสถานะปัจจุบันยังเป็นค่าที่ผู้เรียกคาดไว้
  // ระบบแจ้งซ่อมใช้เงื่อนไขนี้เพื่อไม่ทับสถานะที่แอดมินฝั่งนี้ตั้งเองไว้
  if (only_if_status && !only_if_status.includes(current.status)) {
    return Response.json({ changed: false, status: current.status })
  }

  if (current.status === status) {
    return Response.json({ changed: false, status: current.status })
  }

  await execute('UPDATE issue_reports SET status = ? WHERE id = ?', [status, id])
  return Response.json({ changed: true, status })
}
