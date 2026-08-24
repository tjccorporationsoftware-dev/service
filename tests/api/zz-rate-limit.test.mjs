// Rate limit — ตั้งชื่อขึ้นต้น zz เพื่อให้รันท้ายสุด
// เทสต์กลุ่มนี้จงใจยิงจนเต็มโควตา ถ้ารันก่อนไฟล์อื่นจะทำให้ไฟล์อื่นโดน 429 ปนเปื้อน
//
// ต้องมี RATE_LIMIT_ENABLED=true (ตั้งไว้ใน .env.test แล้ว)
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { get, post, freshIp } from '../helpers/client.mjs'
import { assertTestDatabase } from '../helpers/guard.mjs'
import { closeDb, resetAll } from '../helpers/db.mjs'
import { ADMIN_USERNAME } from '../helpers/env.mjs'

before(async () => {
  await assertTestDatabase()
})
after(async () => {
  await resetAll()
  await closeDb()
})

/** ยิงซ้ำจาก IP เดียวจนกว่าจะเจอ 429 หรือครบจำนวน */
async function fireUntilLimited(fn, attempts) {
  const statuses = []
  for (let i = 0; i < attempts; i++) {
    statuses.push((await fn(i)).status)
  }
  return statuses
}

describe('โควตาของแต่ละ endpoint', () => {
  test('POST /api/register — 10 ครั้ง/นาที', async () => {
    const ip = freshIp()
    const body = {
      customer_name: 'ทดสอบ',
      phone: '0812345678',
      email: 't@example.com',
      product_id: 1,
      sn: 'NOTEXIST00001',
      customer_reported_warranty_start: '2026-08-01',
      customer_reported_warranty_end: '2028-08-01',
      consent: true,
    }
    const statuses = await fireUntilLimited(() => post('/api/register', { ip, body }), 11)
    assert.ok(
      statuses.slice(0, 10).every((s) => s !== 429),
      `10 ครั้งแรกต้องไม่โดน 429 — ได้ ${statuses.join(',')}`
    )
    assert.equal(statuses[10], 429, `ครั้งที่ 11 ต้องได้ 429 — ได้ ${statuses.join(',')}`)
  })

  test('POST /api/issues — 5 ครั้ง/นาที', async () => {
    const ip = freshIp()
    const form = () => {
      const f = new FormData()
      f.set('sn', 'NOTEXIST00001')
      f.set('phone', '0812345678')
      f.set('description', 'ข้อความยาวพอสำหรับผ่าน validation ของระบบแล้วครับ')
      return f
    }
    const statuses = await fireUntilLimited(() => post('/api/issues', { ip, form: form() }), 6)
    assert.ok(statuses.slice(0, 5).every((s) => s !== 429), `5 ครั้งแรกต้องผ่าน — ได้ ${statuses.join(',')}`)
    assert.equal(statuses[5], 429)
  })

  test('GET /api/warranty/check — 30 ครั้ง/นาที', async () => {
    const ip = freshIp()
    const statuses = await fireUntilLimited(() => get('/api/warranty/check?sn=NOTEXIST00001', { ip }), 31)
    assert.ok(statuses.slice(0, 30).every((s) => s !== 429))
    assert.equal(statuses[30], 429)
  })

  test('GET /api/issues/status — 30 ครั้ง/นาที', async () => {
    const ip = freshIp()
    const statuses = await fireUntilLimited(
      () => get('/api/issues/status?sn=NOTEXIST00001&phone=0812345678', { ip }),
      31
    )
    assert.ok(statuses.slice(0, 30).every((s) => s !== 429))
    assert.equal(statuses[30], 429)
  })

  test('POST /api/admin/login — 10 ครั้ง/5 นาที', async () => {
    const ip = freshIp()
    const statuses = await fireUntilLimited(
      () => post('/api/admin/login', { ip, body: { username: ADMIN_USERNAME, password: 'ผิด' } }),
      11
    )
    assert.ok(statuses.slice(0, 10).every((s) => s !== 429))
    assert.equal(statuses[10], 429)
  })
})

describe('พฤติกรรมของ limiter', () => {
  test('ข้อความ 429 เป็นภาษาไทย', async () => {
    const ip = freshIp()
    let res
    for (let i = 0; i < 11; i++) {
      res = await get('/api/warranty/check?sn=NOTEXIST00001', { ip })
      if (res.status === 429) break
    }
    // ยิงต่อจนโดนแน่ ๆ
    for (let i = 0; i < 31 && res.status !== 429; i++) {
      res = await get('/api/warranty/check?sn=NOTEXIST00001', { ip })
    }
    assert.equal(res.status, 429)
    assert.match(res.json.error, /ถี่เกินไป/)
  })

  test('คนละ IP นับแยก bucket', async () => {
    const ipA = freshIp()
    const ipB = freshIp()
    for (let i = 0; i < 31; i++) await get('/api/warranty/check?sn=NOTEXIST00001', { ip: ipA })

    const blocked = await get('/api/warranty/check?sn=NOTEXIST00001', { ip: ipA })
    const fresh = await get('/api/warranty/check?sn=NOTEXIST00001', { ip: ipB })
    assert.equal(blocked.status, 429)
    assert.notEqual(fresh.status, 429, 'IP ใหม่ต้องไม่ถูกจำกัดตาม IP เดิม')
  })

  test('X-Forwarded-For ที่ client ส่งเองข้าม rate limit ได้ (finding #4)', async () => {
    // ควรจะเป็น: ผู้ใช้ปลายทางไม่ควรกำหนด IP ที่ใช้นับโควตาเองได้
    // reverse proxy ต้องเขียนทับ X-Forwarded-For เสมอ ไม่งั้นสุ่ม header ก็ยิงได้ไม่จำกัด
    const ip = freshIp()
    for (let i = 0; i < 31; i++) await get('/api/warranty/check?sn=NOTEXIST00001', { ip })
    assert.equal((await get('/api/warranty/check?sn=NOTEXIST00001', { ip })).status, 429)

    // เปลี่ยน header แล้วยิงใหม่ — ถ้าผ่าน แปลว่าข้ามโควตาได้
    const evaded = await get('/api/warranty/check?sn=NOTEXIST00001', { ip: freshIp() })
    assert.equal(
      evaded.status,
      429,
      'เปลี่ยน X-Forwarded-For แล้วยิงต่อได้ = ข้าม rate limit ได้ ต้องผูกกับ IP จริงจาก reverse proxy'
    )
  })
})
