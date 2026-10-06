import { execute, query } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { firstIssueMessage, warrantyCardIssueSchema } from '@/lib/validations'
import { isMissingTable } from '@/lib/warranty-card'

/**
 * บันทึกว่าออกใบรับประกันแล้ว — หน้าพิมพ์เรียกหลังปิดหน้าต่างพิมพ์ และผู้ใช้กดยืนยันว่า "พิมพ์แล้ว"
 * (เบราว์เซอร์ไม่บอกว่ากดพิมพ์จริงหรือกดยกเลิก จึงต้องให้ผู้ใช้ยืนยันเอง)
 */
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const parsed = warrantyCardIssueSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  }
  const sns = [...new Set(parsed.data.sns)]

  try {
    // เฉพาะ SN ที่ออกใบได้จริง (ผูกผลิตภัณฑ์แล้ว และไม่ถูกยกเลิก) — ตัวอื่นข้ามไป
    const targets = await query<{ id: number }>(
      `SELECT id FROM serial_numbers
        WHERE sn IN (${sns.map(() => '?').join(',')})
          AND product_id IS NOT NULL AND status <> 'void'`,
      sns
    )
    if (targets.length === 0) {
      return Response.json({ error: 'ไม่พบ SN ที่ออกใบรับประกันได้' }, { status: 404 })
    }

    await execute(
      `INSERT INTO warranty_card_prints (serial_number_id, printed_by)
       VALUES ${targets.map(() => '(?, ?)').join(',')}`,
      targets.flatMap((t) => [t.id, auth.session.id])
    )

    await execute('INSERT INTO audit_logs (admin_id, action, detail) VALUES (?, ?, ?)', [
      auth.session.id,
      'warranty_card.print',
      `ออกใบรับประกัน ${targets.length} ใบ`,
    ])

    return Response.json({ recorded: targets.length, skipped: sns.length - targets.length })
  } catch (err) {
    if (isMissingTable(err)) {
      return Response.json(
        { error: 'ฐานข้อมูลยังไม่ได้อัปเดต — ผู้ดูแลระบบต้องรัน npm run db:init ก่อน' },
        { status: 503 }
      )
    }
    console.error('warranty card issue failed:', err)
    return Response.json({ error: 'บันทึกการออกใบไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
  }
}
