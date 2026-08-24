// POST /api/admin/login และ POST /api/admin/logout
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { post, freshIp, decodeJwt, SESSION_COOKIE } from '../helpers/client.mjs'
import { assertTestDatabase } from '../helpers/guard.mjs'
import { closeDb, resetAll } from '../helpers/db.mjs'
import { ADMIN_USERNAME, ADMIN_PASSWORD } from '../helpers/env.mjs'

const IP = freshIp()

before(async () => {
  await assertTestDatabase()
})
after(async () => {
  await resetAll()
  await closeDb()
})

describe('POST /api/admin/login', () => {
  test('body ไม่ใช่ JSON → 400', async () => {
    const res = await post('/api/admin/login', { body: 'nope' })
    assert.equal(res.status, 400)
    assert.equal(res.json.error, 'รูปแบบข้อมูลไม่ถูกต้อง')
  })

  test('ขาด field → 400', async () => {
    assert.equal((await post('/api/admin/login', { body: {} })).status, 400)
    assert.equal(
      (await post('/api/admin/login', { body: { username: 'admin' } })).status,
      400
    )
  })

  test('รหัสผ่านผิด → 401', async () => {
    const res = await post('/api/admin/login', {
      body: { username: ADMIN_USERNAME, password: 'ผิดแน่นอน' },
    })
    assert.equal(res.status, 401)
  })

  test('ไม่มี user นี้ → 401', async () => {
    const res = await post('/api/admin/login', {
      body: { username: 'ไม่มีคนนี้แน่นอน', password: 'อะไรก็ได้' },
    })
    assert.equal(res.status, 401)
  })

  test('ข้อความ error ของสองเคสต้องเหมือนกันเป๊ะ (กัน user enumeration)', async () => {
    const wrongPass = await post('/api/admin/login', {
      body: { username: ADMIN_USERNAME, password: 'ผิด' },
    })
    const noUser = await post('/api/admin/login', {
      body: { username: 'ไม่มีคนนี้', password: 'ผิด' },
    })
    assert.equal(wrongPass.json.error, noUser.json.error)
    assert.equal(wrongPass.status, noUser.status)
  })

  test('เวลาตอบกลับสองเคสใกล้เคียงกัน (กัน timing attack)', async () => {
    const timeIt = async (username) => {
      const samples = []
      for (let i = 0; i < 8; i++) {
        const t0 = performance.now()
        await post('/api/admin/login', { body: { username, password: 'ผิดแน่ ๆ' } })
        samples.push(performance.now() - t0)
      }
      samples.sort((a, b) => a - b)
      return samples[Math.floor(samples.length / 2)]
    }
    const existing = await timeIt(ADMIN_USERNAME)
    const missing = await timeIt('ไม่มีคนนี้เลย')
    const ratio = Math.max(existing, missing) / Math.min(existing, missing)
    assert.ok(
      ratio < 2,
      `เวลาต่างกันเกินไป — user มีจริง ${existing.toFixed(1)}ms vs ไม่มี ${missing.toFixed(1)}ms (ratio ${ratio.toFixed(2)})`
    )
  })

  test('login สำเร็จ → 200 พร้อม cookie ที่ตั้งค่าถูกต้อง', async () => {
    const res = await post('/api/admin/login', {
      body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    })
    assert.equal(res.status, 200)
    assert.equal(res.json.admin.username, ADMIN_USERNAME)
    assert.ok(!('password_hash' in res.json.admin), 'ห้ามส่ง password_hash กลับ')

    const cookie = res.setCookie.find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    assert.ok(cookie, 'ต้องมี Set-Cookie')
    assert.match(cookie, /HttpOnly/i)
    assert.match(cookie, /SameSite=Lax/i)
    assert.match(cookie, /Path=\//i)
    assert.match(cookie, /Max-Age=28800/i)
  })

  test('JWT มี claim ครบและอายุ 8 ชั่วโมง', async () => {
    const res = await post('/api/admin/login', {
      body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    })
    const cookie = res.setCookie.find((c) => c.startsWith(`${SESSION_COOKIE}=`)).split(';')[0]
    const payload = decodeJwt(cookie)
    for (const key of ['id', 'username', 'role', 'displayName', 'iat', 'exp']) {
      assert.ok(key in payload, `JWT ต้องมี claim ${key}`)
    }
    assert.equal(payload.exp - payload.iat, 8 * 60 * 60)
    assert.ok(!('password_hash' in payload), 'JWT ต้องไม่มี hash')
  })

  test('username ที่มีช่องว่างหัวท้ายถูก trim', async () => {
    const res = await post('/api/admin/login', {
      body: { username: `  ${ADMIN_USERNAME}  `, password: ADMIN_PASSWORD },
    })
    assert.equal(res.status, 200)
  })
})

describe('POST /api/admin/logout', () => {
  test('เรียกตอนไม่มี session ก็ได้ 200 (ไม่ผ่าน proxy โดยตั้งใจ)', async () => {
    const res = await post('/api/admin/logout', {})
    assert.equal(res.status, 200)
  })

  test('ลบ cookie ทิ้ง', async () => {
    const res = await post('/api/admin/logout', {})
    const cookie = res.setCookie.find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    assert.ok(cookie, 'ต้องมี Set-Cookie เพื่อล้างค่า')
    assert.ok(
      /Max-Age=0/i.test(cookie) || /Expires=Thu, 01 Jan 1970/i.test(cookie),
      `cookie ต้องถูกสั่งให้หมดอายุ ได้: ${cookie}`
    )
  })
})
