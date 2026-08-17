import { query, queryOne, type SqlParams } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { parsePagination, meta } from '@/lib/pagination'
import { caseNumber } from '@/lib/warranty'
import { fileUrl } from '@/lib/uploads'

type Row = {
  id: number
  registration_id: number
  description: string
  status: string
  in_warranty: number
  admin_note: string | null
  created_at: string
  updated_at: string
  sn: string
  phone: string
  customer_name: string | null
  warranty_end: string
  product_name: string
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
    where.push('(s.sn LIKE ? OR r.phone LIKE ? OR i.description LIKE ?)')
    values.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }

  const status = params.get('status')
  if (status && ['pending', 'in_progress', 'resolved', 'closed'].includes(status)) {
    where.push('i.status = ?')
    values.push(status)
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM issue_reports i
     JOIN registrations r ON r.id = i.registration_id
     JOIN serial_numbers s ON s.id = r.serial_number_id
     ${clause}`,
    values
  )

  const rows = await query<Row>(
    `SELECT i.id, i.registration_id, i.description, i.status, i.in_warranty,
            i.admin_note, i.created_at, i.updated_at,
            s.sn, r.phone, r.customer_name, r.warranty_end, p.name AS product_name
     FROM issue_reports i
     JOIN registrations r ON r.id = i.registration_id
     JOIN serial_numbers s ON s.id = r.serial_number_id
     JOIN products p ON p.id = s.product_id
     ${clause}
     ORDER BY i.created_at DESC
     LIMIT ${page.perPage} OFFSET ${page.offset}`,
    values
  )

  const attachments = rows.length
    ? await query<{ issue_report_id: number; file_type: string; file_path: string }>(
        `SELECT issue_report_id, file_type, file_path
         FROM issue_attachments
         WHERE issue_report_id IN (${rows.map(() => '?').join(',')})
         ORDER BY id`,
        rows.map((r) => r.id)
      )
    : []

  return Response.json({
    issues: rows.map((row) => ({
      ...row,
      case_number: caseNumber(row.id),
      in_warranty: Boolean(row.in_warranty),
      attachments: attachments
        .filter((a) => a.issue_report_id === row.id)
        .map((a) => ({ type: a.file_type, url: fileUrl(a.file_path) })),
    })),
    meta: meta(total?.count ?? 0, page),
  })
}
