import { execute } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { firstIssueMessage, warrantyCardTextsSchema } from '@/lib/validations'
import {
  DEFAULT_WARRANTY_CARD_TEXTS,
  getWarrantyCardTexts,
  isMissingTable,
  saveWarrantyCardTexts,
} from '@/lib/warranty-card'

/** ข้อความบนใบรับประกันที่ใช้อยู่ + ค่าตั้งต้น (ไว้ให้ปุ่ม "คืนค่าเริ่มต้น") */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const texts = await getWarrantyCardTexts()
    return Response.json({ texts, defaults: DEFAULT_WARRANTY_CARD_TEXTS })
  } catch (err) {
    console.error('warranty card settings load failed:', err)
    return Response.json({ error: 'โหลดข้อความใบรับประกันไม่สำเร็จ' }, { status: 500 })
  }
}

/** บันทึกเป็นค่าเริ่มต้นของใบต่อ ๆ ไป */
export async function PUT(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const parsed = warrantyCardTextsSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  }

  try {
    await saveWarrantyCardTexts(parsed.data, auth.session.id)
  } catch (err) {
    if (isMissingTable(err)) {
      return Response.json(
        { error: 'ฐานข้อมูลยังไม่ได้อัปเดต — ผู้ดูแลระบบต้องรัน npm run db:init ก่อน จึงจะบันทึกได้' },
        { status: 503 }
      )
    }
    console.error('warranty card settings save failed:', err)
    return Response.json({ error: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
  }

  await execute('INSERT INTO audit_logs (admin_id, action, detail) VALUES (?, ?, ?)', [
    auth.session.id,
    'warranty_card.update',
    'แก้ข้อความเงื่อนไข/หมายเหตุบนใบรับประกัน',
  ])

  return Response.json({ texts: parsed.data })
}
