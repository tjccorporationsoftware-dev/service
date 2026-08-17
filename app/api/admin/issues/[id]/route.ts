import { execute, queryOne } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { issueUpdateSchema, firstIssueMessage } from '@/lib/validations'
import { caseNumber } from '@/lib/warranty'

export async function PATCH(request: Request, ctx: RouteContext<'/api/admin/issues/[id]'>) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const issueId = Number.parseInt(id, 10)
  if (!Number.isFinite(issueId)) {
    return Response.json({ error: 'รหัสเคสไม่ถูกต้อง' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const parsed = issueUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  }
  const { status, admin_note } = parsed.data

  const existing = await queryOne<{ id: number; status: string }>(
    'SELECT id, status FROM issue_reports WHERE id = ?',
    [issueId]
  )
  if (!existing) {
    return Response.json({ error: 'ไม่พบเคสนี้' }, { status: 404 })
  }

  await execute('UPDATE issue_reports SET status = ?, admin_note = ? WHERE id = ?', [
    status,
    admin_note || null,
    issueId,
  ])

  await execute('INSERT INTO audit_logs (admin_id, action, detail) VALUES (?, ?, ?)', [
    auth.session.id,
    'issue.update',
    `${caseNumber(issueId)}: ${existing.status} → ${status}`,
  ])

  return Response.json({ issue: { id: issueId, status, admin_note: admin_note || null } })
}
