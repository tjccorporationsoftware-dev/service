import { execute, query, queryOne } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { snSchemeSchema, firstIssueMessage } from '@/lib/validations'
import { snPatternHint } from '@/lib/sn-format'

type SchemeRow = {
  id: number
  label: string
  prefix: string
  model_code: string
  next_sequence: number
  sn_count: number
}

function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && err.code === 'ER_DUP_ENTRY')
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const schemes = await query<SchemeRow>(
    `SELECT s.id, s.label, s.prefix, s.model_code, s.next_sequence,
            (SELECT COUNT(*) FROM serial_numbers sn WHERE sn.scheme_id = s.id) AS sn_count
     FROM sn_schemes s
     ORDER BY s.created_at DESC`
  )

  return Response.json({ schemes })
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

  const parsed = snSchemeSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  }
  const { label, prefix, model_code, next_sequence } = parsed.data

  try {
    const result = await execute(
      `INSERT INTO sn_schemes (label, prefix, model_code, next_sequence) VALUES (?, ?, ?, ?)`,
      [label, prefix, model_code, next_sequence]
    )

    await execute('INSERT INTO audit_logs (admin_id, action, detail) VALUES (?, ?, ?)', [
      auth.session.id,
      'sn_scheme.create',
      `สร้างรูปแบบรหัส SN "${label}" (${snPatternHint(prefix, model_code)}) เริ่มจากลำดับ ${next_sequence}`,
    ])

    return Response.json(
      { scheme: { id: result.insertId, label, prefix, model_code, next_sequence, sn_count: 0 } },
      { status: 201 }
    )
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return Response.json(
        { error: `ตัวนำหน้า+รหัสรุ่น "${prefix}${model_code}" นี้มีรูปแบบใช้อยู่แล้ว กรุณาใช้ค่าอื่น` },
        { status: 409 }
      )
    }
    console.error('create sn scheme failed:', err)
    return Response.json({ error: 'สร้างรูปแบบรหัส SN ไม่สำเร็จ' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const parsed = snSchemeSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  }
  const { id, label, prefix, model_code, next_sequence } = parsed.data
  if (!id) {
    return Response.json({ error: 'ไม่พบรหัสรูปแบบที่จะแก้ไข' }, { status: 400 })
  }

  const existing = await queryOne<{ id: number }>('SELECT id FROM sn_schemes WHERE id = ?', [id])
  if (!existing) {
    return Response.json({ error: 'ไม่พบรูปแบบรหัส SN นี้' }, { status: 404 })
  }

  try {
    await execute(
      `UPDATE sn_schemes SET label = ?, prefix = ?, model_code = ?, next_sequence = ? WHERE id = ?`,
      [label, prefix, model_code, next_sequence, id]
    )

    await execute('INSERT INTO audit_logs (admin_id, action, detail) VALUES (?, ?, ?)', [
      auth.session.id,
      'sn_scheme.update',
      `แก้ไขรูปแบบรหัส SN #${id} เป็น "${label}" (${snPatternHint(prefix, model_code)}) ลำดับถัดไป ${next_sequence}`,
    ])

    return Response.json({ scheme: { id, label, prefix, model_code, next_sequence } })
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return Response.json(
        { error: `ตัวนำหน้า+รหัสรุ่น "${prefix}${model_code}" นี้มีรูปแบบใช้อยู่แล้ว กรุณาใช้ค่าอื่น` },
        { status: 409 }
      )
    }
    console.error('update sn scheme failed:', err)
    return Response.json({ error: 'บันทึกไม่สำเร็จ' }, { status: 500 })
  }
}
