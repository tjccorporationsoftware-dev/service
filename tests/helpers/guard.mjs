// ยามกันยิงใส่ฐานจริง — ทุกไฟล์เทสต์ที่แตะ API ต้องเรียกตัวนี้ใน before()
//
// วิธีพิสูจน์: หย่อน "canary" ผลิตภัณฑ์ที่มีเฉพาะใน warranty_test ลงไป แล้วถาม API ว่าเห็นไหม
// การนับจำนวนเฉย ๆ ไม่พอ เพราะสองฐานมีผลิตภัณฑ์ seed ชุดเดียวกันครบทั้ง 6 ตัว
import assert from 'node:assert/strict'
import { db, q } from './db.mjs'
import { get } from './client.mjs'
import { BASE_URL } from './env.mjs'

let verified = false

export async function assertTestDatabase() {
  if (verified) return

  const canaryCode = `CANARY${Math.floor(performance.now()).toString(36).toUpperCase().slice(-4)}`
  const canaryName = `TEST canary ${canaryCode}`

  let insertedId
  try {
    const [res] = await db().query(
      `INSERT INTO products (name, code, brand, model, warranty_years, is_active)
       VALUES (?, ?, 'CANARY', 'CANARY', 1, 1)`,
      [canaryName, canaryCode]
    )
    insertedId = res.insertId

    const res2 = await get('/api/products')
    assert.equal(res2.status, 200, `เรียก ${BASE_URL}/api/products ไม่สำเร็จ — dev server รันอยู่ไหม`)

    const list = Array.isArray(res2.json) ? res2.json : (res2.json?.products ?? [])
    const found = list.some((p) => p.code === canaryCode)

    assert.ok(
      found,
      `\n\n  ⛔ dev server ที่ ${BASE_URL} ไม่ได้ต่อฐาน warranty_test\n` +
        `     หย่อน canary "${canaryCode}" ลง warranty_test แล้ว แต่ API มองไม่เห็น\n` +
        `     API คืนมา ${list.length} รายการ: ${list.map((p) => p.code || '(ไม่มีรหัส)').join(', ')}\n\n` +
        `     ให้ปิด dev server ตัวเดิมแล้วสตาร์ตใหม่ด้วย: npm run dev:test\n` +
        `     boot log ต้องขึ้น "⚑ ฐานข้อมูล: root@127.0.0.1:3306/warranty_test"\n`
    )
    verified = true
  } finally {
    if (insertedId) await q('DELETE FROM products WHERE id = ?', [insertedId])
  }
}
