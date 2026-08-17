import { execute, queryOne } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { snGenerateSchema, firstIssueMessage } from '@/lib/validations'
import { generateSerialBatch } from '@/lib/sn-generator'

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const parsed = snGenerateSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  }
  const { scheme_id, quantity, category } = parsed.data

  const scheme = await queryOne<{ id: number; label: string; prefix: string; model_code: string }>(
    'SELECT id, label, prefix, model_code FROM sn_schemes WHERE id = ?',
    [scheme_id]
  )
  if (!scheme) {
    return Response.json({ error: 'ไม่พบรูปแบบรหัส SN ที่เลือก' }, { status: 404 })
  }

  try {
    const batch = await generateSerialBatch({
      schemeId: scheme.id,
      adminId: auth.session.id,
      quantity,
      category,
    })

    await execute('INSERT INTO audit_logs (admin_id, action, detail) VALUES (?, ?, ?)', [
      auth.session.id,
      'sn.generate',
      `สร้าง SN ${quantity} ตัว จากรูปแบบ "${scheme.label}" หมวดหมู่ "${category}" (batch ${batch.batchId}) — ยังไม่ผูกผลิตภัณฑ์`,
    ])

    return Response.json(
      {
        batch_id: batch.batchId,
        scheme: { id: scheme.id, label: scheme.label, prefix: scheme.prefix, model_code: scheme.model_code },
        category,
        quantity: batch.serials.length,
        serials: batch.serials,
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('generate sn failed:', err)
    const message = err instanceof Error ? err.message : 'สร้าง SN ไม่สำเร็จ'
    return Response.json({ error: message }, { status: 500 })
  }
}
