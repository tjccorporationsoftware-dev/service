import { stat } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { queryOne } from '@/lib/db'
import { requireServiceKey } from '@/lib/service-api'
import { checkRateLimit } from '@/lib/rate-limit'
import { CONTENT_TYPE_BY_EXT, resolveUploadPath } from '@/lib/uploads'

/**
 * GET /api/service/issues/[id]/files/[fileId] — ดาวน์โหลดไฟล์ที่ลูกค้าแนบมากับเคส
 *
 * มีเส้นทางนี้แยกจาก /api/files/* เพราะเส้นทางนั้นยังไม่มีการตรวจสิทธิ์ (ใครรู้ path ก็เปิดได้)
 * เมื่อจะให้ระบบอื่นดึงไฟล์ข้ามเครื่อง ควรผ่านทางที่ตรวจ key และผูกกับเคสจริง
 *
 * path ของไฟล์มาจากฐาน ไม่ได้มาจากผู้เรียก และยังผ่าน resolveUploadPath() อีกชั้น
 * ผู้เรียกจึงระบุได้แค่ "ไฟล์ไหนของเคสไหน" ไม่ใช่ "path ไหนบนดิสก์"
 */

export async function GET(
  request: Request,
  ctx: RouteContext<'/api/service/issues/[id]/files/[fileId]'>
) {
  const limited = checkRateLimit(request, 'service-api-files', 240, 60_000)
  if (limited) return limited

  const auth = requireServiceKey(request)
  if (!auth.ok) return auth.response

  const params = await ctx.params
  const issueId = Number(params.id)
  const fileId = Number(params.fileId)
  if (!Number.isInteger(issueId) || issueId <= 0 || !Number.isInteger(fileId) || fileId <= 0) {
    return Response.json({ error: 'รหัสไม่ถูกต้อง' }, { status: 400 })
  }

  const row = await queryOne<{ file_path: string; original_name: string | null }>(
    'SELECT file_path, original_name FROM issue_attachments WHERE id = ? AND issue_report_id = ?',
    [fileId, issueId]
  )
  if (!row) {
    return Response.json({ error: 'ไม่พบไฟล์แนบที่ระบุ' }, { status: 404 })
  }

  const filePath = resolveUploadPath(row.file_path.split('/'))
  if (!filePath) {
    return Response.json({ error: 'เส้นทางไฟล์ไม่ถูกต้อง' }, { status: 403 })
  }

  const ext = path.extname(filePath).slice(1).toLowerCase()
  const contentType = CONTENT_TYPE_BY_EXT[ext]
  if (!contentType) {
    return Response.json({ error: 'ชนิดไฟล์ไม่รองรับ' }, { status: 404 })
  }

  try {
    const info = await stat(filePath)
    if (!info.isFile()) {
      return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 })
    }
    const data = await readFile(filePath)
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(info.size),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 })
  }
}
