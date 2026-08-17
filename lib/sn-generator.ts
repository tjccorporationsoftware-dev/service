import { randomUUID } from 'node:crypto'
import { withTransaction } from './db'
import { buildStructuredSn } from './sn-format'
import type { RowDataPacket } from 'mysql2'

export { buildStructuredSn, snDateCode, snPatternHint, SEQUENCE_PAD } from './sn-format'

export type GeneratedBatch = {
  batchId: string
  serials: { id: number; sn: string }[]
}

/**
 * สร้าง SN จาก "รูปแบบรหัส" (sn_schemes) แบบเรียงลำดับ — ยังไม่ผูกผลิตภัณฑ์ (product_id = NULL)
 * ผูกผลิตภัณฑ์ทีหลังผ่าน /api/admin/sn/assign-product
 * ล็อกแถว sn_schemes ไว้กันสร้างพร้อมกันแล้วได้เลขลำดับซ้ำ
 */
export async function generateSerialBatch(params: {
  schemeId: number
  adminId: number
  quantity: number
  category: string
}): Promise<GeneratedBatch> {
  const { schemeId, adminId, quantity, category } = params
  const batchId = randomUUID()

  return withTransaction(async (conn) => {
    const [rows] = await conn.execute<
      (RowDataPacket & { prefix: string; model_code: string; next_sequence: number })[]
    >('SELECT prefix, model_code, next_sequence FROM sn_schemes WHERE id = ? FOR UPDATE', [
      schemeId,
    ])
    const scheme = rows[0]
    if (!scheme) {
      throw new Error('ไม่พบรูปแบบรหัส SN ที่เลือก')
    }

    const startSequence = scheme.next_sequence
    // ตรึงวันที่ไว้ครั้งเดียวต่อชุด — ถ้าสร้างคร่อมเที่ยงคืนสิ้นเดือน SN ทั้งชุดจะยังได้ปี/เดือนเดียวกัน
    const stampedAt = new Date()
    const values = Array.from({ length: quantity }, (_, i) => [
      buildStructuredSn(scheme.prefix, scheme.model_code, startSequence + i, stampedAt),
      schemeId,
      adminId,
      batchId,
      category,
    ])

    try {
      await conn.query(
        'INSERT INTO serial_numbers (sn, scheme_id, generated_by, batch_id, category) VALUES ?',
        [values]
      )
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ER_DUP_ENTRY') {
        throw new Error(
          'เลขลำดับที่ตั้งไว้ชนกับ SN ที่มีอยู่แล้ว กรุณาไปแก้เลขลำดับเริ่มต้นที่หน้าตั้งค่ารหัส SN'
        )
      }
      throw err
    }

    await conn.execute('UPDATE sn_schemes SET next_sequence = ? WHERE id = ?', [
      startSequence + quantity,
      schemeId,
    ])

    const [serials] = await conn.execute<(RowDataPacket & { id: number; sn: string })[]>(
      'SELECT id, sn FROM serial_numbers WHERE batch_id = ? ORDER BY id',
      [batchId]
    )

    return { batchId, serials }
  })
}
