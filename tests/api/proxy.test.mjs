// proxy.ts — การป้องกัน /admin/* และ /api/admin/*
// รวมเคส role ที่ระบบ "ควรจะ" จำกัดแต่ยังไม่ได้ทำ (finding #1 ใน TEST-PLAN.md)
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { get, post, freshIp, forgeCookie, loginAdmin, AUTH_FAILURE_CASES, cookieFor } from '../helpers/client.mjs'
import { assertTestDatabase } from '../helpers/guard.mjs'
import { closeDb, resetAll, createAdmin, createScheme } from '../helpers/db.mjs'

const IP = freshIp()

const ADMIN_PAGES = [
  '/admin',
  '/admin/dashboard',
  '/admin/products',
  '/admin/serial-numbers',
  '/admin/sn-setup',
  '/admin/registrations',
  '/admin/issues',
  '/admin/qrcode',
]

before(async () => {
  await assertTestDatabase()
})
after(async () => {
  await resetAll()
  await closeDb()
})

describe('หน้า /admin/* เมื่อไม่มี session', () => {
  for (const page of ADMIN_PAGES) {
    test(`${page} → redirect ไป /admin/login?next=${page}`, async () => {
      const res = await get(page, {})
      assert.ok([302, 307, 308].includes(res.status), `ควร redirect ได้ ${res.status}`)
      const loc = new URL(res.location, 'http://localhost:3000')
      assert.equal(loc.pathname, '/admin/login')
      assert.equal(loc.searchParams.get('next'), page)
    })
  }

  test('/admin/login เข้าได้โดยไม่ต้อง login', async () => {
    const res = await get('/admin/login', {})
    assert.equal(res.status, 200)
  })
})

describe('หน้าลูกค้าไม่ถูก proxy แตะ', () => {
  for (const page of ['/', '/register', '/report', '/status']) {
    test(`${page} เข้าได้โดยไม่ต้อง login`, async () => {
      const res = await get(page, {})
      assert.equal(res.status, 200)
    })
  }
})

describe('/api/admin/* เมื่อ token ใช้ไม่ได้ → 401 JSON ไม่ใช่ redirect', () => {
  for (const c of AUTH_FAILURE_CASES) {
    test(c.name, async () => {
      const res = await get('/api/admin/stats', { cookie: await cookieFor(c) })
      assert.equal(res.status, 401, `${c.name} ควรได้ 401`)
      assert.equal(res.json?.error, 'กรุณาเข้าสู่ระบบ')
      assert.equal(res.location, null, 'endpoint API ต้องไม่ redirect')
    })
  }
})

describe('หน้า /admin/* เมื่อ token ใช้ไม่ได้ → redirect', () => {
  for (const c of AUTH_FAILURE_CASES) {
    test(c.name, async () => {
      const res = await get('/admin/dashboard', { cookie: await cookieFor(c) })
      assert.ok([302, 307, 308].includes(res.status), `${c.name} ควร redirect ได้ ${res.status}`)
      assert.match(res.location, /\/admin\/login/)
    })
  }
})

describe('endpoint ที่ยกเว้นจาก proxy', () => {
  test('POST /api/admin/login ผ่านได้โดยไม่มี cookie', async () => {
    const res = await post('/api/admin/login', { body: {} })
    assert.equal(res.status, 400, 'ต้องถึง handler แล้วตอบ 400 ไม่ใช่ 401 จาก proxy')
  })

  test('POST /api/admin/logout ผ่านได้โดยไม่มี cookie', async () => {
    const res = await post('/api/admin/logout', {})
    assert.equal(res.status, 200)
  })
})

describe('token ที่ถูกต้อง', () => {
  test('เข้าถึง API แอดมินได้', async () => {
    const cookie = await loginAdmin()
    const res = await get('/api/admin/stats', { cookie })
    assert.equal(res.status, 200)
  })

  test('เข้าหน้าแอดมินได้ ไม่ถูก redirect', async () => {
    const cookie = await loginAdmin()
    const res = await get('/admin/dashboard', { cookie })
    assert.equal(res.status, 200)
  })

  test('token ที่ปลอมโดยแก้ role เป็น admin โดยไม่มี secret → ถูกปฏิเสธ', async () => {
    const cookie = await forgeCookie('tampered', { role: 'admin' })
    const res = await get('/api/admin/stats', { cookie })
    assert.equal(res.status, 401)
  })
})

describe('role — สิทธิ์ที่ระบบควรจำกัดแต่ยังไม่ได้ทำ (finding #1)', () => {
  let staffCookie
  let scheme

  before(async () => {
    await createAdmin({ username: 'test_staff', password: 'staffpass123', role: 'staff' })
    staffCookie = await loginAdmin('test_staff', 'staffpass123')
    scheme = await createScheme({ label: 'TEST role scheme', prefix: 'R', model_code: '01' })
  })

  test('R1 — staff login ได้และ JWT มี role=staff', async () => {
    const { decodeJwt } = await import('../helpers/client.mjs')
    assert.equal(decodeJwt(staffCookie).role, 'staff')
  })

  test('R2 — staff ไม่ควร generate SN ได้ → ควรเป็น 403', async () => {
    const res = await post('/api/admin/sn/generate', {
      cookie: staffCookie,
      body: { scheme_id: scheme.id, quantity: 1, category: 'TEST role' },
    })
    assert.equal(
      res.status,
      403,
      `staff ไม่ควรสร้าง SN ได้ แต่ได้ ${res.status} — ระบบไม่มีการตรวจ role เลย`
    )
  })

  test('R3 — staff ไม่ควรแก้ผลิตภัณฑ์ได้ → ควรเป็น 403', async () => {
    const res = await post('/api/admin/products', {
      cookie: staffCookie,
      body: { name: 'TEST staff สร้างได้ไหม' },
    })
    assert.equal(
      res.status,
      403,
      `staff ไม่ควรสร้างผลิตภัณฑ์ได้ แต่ได้ ${res.status} — ระบบไม่มีการตรวจ role เลย`
    )
  })

  test('R4 — ปลอม JWT แก้ role เป็น admin ไม่ได้ (ลายเซ็นพัง)', async () => {
    const cookie = await forgeCookie('wrong-secret', { role: 'admin' })
    const res = await get('/api/admin/stats', { cookie })
    assert.equal(res.status, 401)
  })
})
