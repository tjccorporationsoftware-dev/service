import type { RowDataPacket } from 'mysql2'
import { execute, query, queryOne, withTransaction } from '@/lib/db'
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
  unused_sn_count: number
}

type SchemeLockRow = RowDataPacket & {
  id: number
  label: string
  prefix: string
  model_code: string
}

// is_unused กลับมาเป็น 1/0 จาก MySQL ไม่ใช่ boolean
type SnLockRow = RowDataPacket & { id: number; is_unused: number }

// SN ที่ยัง "ไม่ถูกใช้" = ยังไม่ผูกผลิตภัณฑ์ ยังไม่มีใครลงทะเบียน และยังไม่ถูก void
// (void แปลว่าเคยออกไปแล้วจึงต้องเก็บไว้เป็นหลักฐาน) — เงื่อนไขเดียวกันนี้ใช้ทั้งตอนแสดงผลและตอนลบ
const UNUSED_SN_CONDITION = `sn.status = 'available' AND sn.product_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM registrations r WHERE r.serial_number_id = sn.id)`

function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && err.code === 'ER_DUP_ENTRY')
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const schemes = await query<SchemeRow>(
    `SELECT s.id, s.label, s.prefix, s.model_code, s.next_sequence,
            (SELECT COUNT(*) FROM serial_numbers sn WHERE sn.scheme_id = s.id) AS sn_count,
            (SELECT COUNT(*) FROM serial_numbers sn
              WHERE sn.scheme_id = s.id AND ${UNUSED_SN_CONDITION}) AS unused_sn_count
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
      {
        scheme: {
          id: result.insertId,
          label,
          prefix,
          model_code,
          next_sequence,
          sn_count: 0,
          unused_sn_count: 0,
        },
      },
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

export async function DELETE(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const id = Number(new URL(request.url).searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'ไม่พบรหัสรูปแบบที่จะลบ' }, { status: 400 })
  }

  try {
    const outcome = await withTransaction(async (conn) => {
      const [schemeRows] = await conn.execute<SchemeLockRow[]>(
        'SELECT id, label, prefix, model_code FROM sn_schemes WHERE id = ? FOR UPDATE',
        [id]
      )
      const scheme = schemeRows[0]
      if (!scheme) return { status: 404 as const, error: 'ไม่พบรูปแบบรหัส SN นี้' }

      // ล็อก SN ทุกตัวของรูปแบบนี้ก่อนตรวจ กันมีคนผูกผลิตภัณฑ์หรือลงทะเบียนแทรกระหว่างตรวจกับลบ
      const [snRows] = await conn.execute<SnLockRow[]>(
        `SELECT sn.id, (${UNUSED_SN_CONDITION}) AS is_unused
         FROM serial_numbers sn
         WHERE sn.scheme_id = ?
         FOR UPDATE`,
        [id]
      )

      // SN ที่ถูกใช้ไปแล้วต้องสืบย้อนกลับมาที่รูปแบบเดิมได้เสมอ — มีแม้ตัวเดียวก็ลบทั้งรูปแบบไม่ได้
      const usedCount = snRows.filter((row) => !row.is_unused).length
      if (usedCount > 0) {
        return {
          status: 409 as const,
          error: `รูปแบบนี้มี SN ที่ถูกใช้งานแล้ว ${usedCount.toLocaleString('th-TH')} ตัว จากทั้งหมด ${snRows.length.toLocaleString('th-TH')} ตัว จึงลบไม่ได้ — แก้ไขรูปแบบแทนได้`,
        }
      }

      // SN ที่เหลือยังไม่ถูกใช้ทั้งหมด ลบทิ้งพร้อมรูปแบบได้ (FK บังคับให้ลบลูกก่อนแม่)
      if (snRows.length > 0) {
        await conn.execute('DELETE FROM serial_numbers WHERE scheme_id = ?', [id])
      }
      await conn.execute('DELETE FROM sn_schemes WHERE id = ?', [id])

      return { status: 200 as const, scheme, deletedSn: snRows.length }
    })

    if (outcome.status !== 200) {
      return Response.json({ error: outcome.error }, { status: outcome.status })
    }

    const { scheme, deletedSn } = outcome
    await execute('INSERT INTO audit_logs (admin_id, action, detail) VALUES (?, ?, ?)', [
      auth.session.id,
      'sn_scheme.delete',
      `ลบรูปแบบรหัส SN #${id} "${scheme.label}" (${snPatternHint(scheme.prefix, scheme.model_code)})` +
        (deletedSn > 0 ? ` พร้อม SN ที่ยังไม่ถูกใช้ ${deletedSn} ตัว` : ''),
    ])

    return Response.json({ ok: true, deleted_sn: deletedSn })
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ER_ROW_IS_REFERENCED_2') {
      return Response.json(
        { error: 'รูปแบบนี้ถูกใช้งานอยู่ในระบบ จึงลบไม่ได้ — แก้ไขรูปแบบแทนได้' },
        { status: 409 }
      )
    }
    console.error('delete sn scheme failed:', err)
    return Response.json({ error: 'ลบรูปแบบรหัส SN ไม่สำเร็จ' }, { status: 500 })
  }
}
