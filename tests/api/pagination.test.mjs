// parsePagination ที่ระดับ API — LIMIT/OFFSET ถูกต่อลง SQL ตรง ๆ จึงต้องยิงของจริงยืนยัน
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { get, freshIp, loginAdmin } from '../helpers/client.mjs'
import { assertTestDatabase } from '../helpers/guard.mjs'
import { closeDb, resetAll, createProduct, countRows, db } from '../helpers/db.mjs'

const IP = freshIp()
let cookie

const ENDPOINTS = ['/api/admin/sn', '/api/admin/registrations', '/api/admin/issues']

before(async () => {
  await assertTestDatabase()
  await resetAll()
  cookie = await loginAdmin()

  const product = await createProduct({ name: 'TEST ผลิตภัณฑ์ pagination' })
  const rows = Array.from({ length: 25 }, (_, i) => [
    `TESTPAG${String(i).padStart(6, '0')}`,
    product.id,
    'TEST',
  ])
  await db().query('INSERT INTO serial_numbers (sn, product_id, category) VALUES ?', [rows])
})

after(async () => {
  await resetAll()
  await closeDb()
})

describe('ค่า pagination ปกติ', () => {
  for (const ep of ENDPOINTS) {
    test(`${ep} — page/per_page สะท้อนกลับใน meta`, async () => {
      const res = await get(`${ep}?page=2&per_page=10`, { cookie })
      assert.equal(res.status, 200)
      assert.equal(res.json.meta.page, 2)
      assert.equal(res.json.meta.per_page, 10)
    })
  }

  test('/api/admin/sn — per_page=10 คืนไม่เกิน 10 แถว', async () => {
    const res = await get('/api/admin/sn?per_page=10', { cookie })
    const rows = res.json.data ?? res.json.serials ?? []
    assert.ok(rows.length <= 10, `ได้ ${rows.length} แถว`)
  })

  test('total_pages ไม่เคยเป็น 0', async () => {
    const res = await get('/api/admin/issues', { cookie })
    assert.ok(res.json.meta.total_pages >= 1)
  })
})

describe('ค่าติดลบ / เกินขอบเขต / ไม่ใช่เลข — ต้อง clamp ไม่ใช่ 500', () => {
  const cases = [
    ['page=0', { page: 1 }],
    ['page=-5', { page: 1 }],
    ['page=abc', { page: 1 }],
    ['page=999999999', { page: 100000 }],
    ['per_page=0', { per_page: 1 }],
    ['per_page=-100', { per_page: 1 }],
    ['per_page=9999', { per_page: 200 }],
    ['per_page=abc', { per_page: 20 }],
    ['per_page=1.5', { per_page: 1 }],
    ['per_page=', { per_page: 20 }],
  ]

  for (const ep of ENDPOINTS) {
    for (const [qs, expected] of cases) {
      test(`${ep}?${qs}`, async () => {
        const res = await get(`${ep}?${qs}`, { cookie })
        assert.equal(res.status, 200, `ต้องไม่ 500 — ได้ ${res.status}: ${res.text.slice(0, 200)}`)
        for (const [k, v] of Object.entries(expected)) {
          assert.equal(res.json.meta[k], v, `${k} ควรเป็น ${v}`)
        }
      })
    }
  }
})

describe('SQL injection ผ่าน LIMIT/OFFSET', () => {
  const payloads = [
    '20; DROP TABLE serial_numbers--',
    "1 UNION SELECT * FROM admins",
    '1 OR 1=1',
    "1'; DELETE FROM registrations; --",
  ]

  for (const ep of ENDPOINTS) {
    for (const payload of payloads) {
      test(`${ep} — per_page=${payload.slice(0, 25)}…`, async () => {
        const res = await get(`${ep}?per_page=${encodeURIComponent(payload)}`, { cookie })
        assert.equal(res.status, 200, 'ต้องตอบปกติ ไม่ใช่ 500 จาก SQL error')
        assert.ok(!/admins|password_hash/i.test(res.text), 'ต้องไม่มีข้อมูลตาราง admins หลุดออกมา')
      })

      test(`${ep} — page=${payload.slice(0, 25)}…`, async () => {
        const res = await get(`${ep}?page=${encodeURIComponent(payload)}`, { cookie })
        assert.equal(res.status, 200)
        assert.ok(!/password_hash/i.test(res.text))
      })
    }
  }

  test('ตารางทั้งหมดยังอยู่ครบหลังยิง payload ทั้งชุด', async () => {
    assert.ok((await countRows('serial_numbers')) >= 25, 'serial_numbers ต้องไม่ถูกลบ')
    assert.ok((await countRows('admins')) >= 1, 'admins ต้องไม่ถูกลบ')
  })
})

describe('SQL injection ผ่าน search (คนละทางกับ pagination — ตัวนี้ใช้ prepared statement)', () => {
  test('search ที่เป็น payload ไม่คืนทั้งตาราง', async () => {
    const all = await get('/api/admin/sn', { cookie })
    const inject = await get(`/api/admin/sn?search=${encodeURIComponent("' OR '1'='1")}`, {
      cookie,
    })
    assert.equal(inject.status, 200)
    assert.ok(inject.json.meta.total < all.json.meta.total)
  })

  test('search=% ไม่ควรกลายเป็น wildcard คืนทุกแถว', async () => {
    // ควรจะเป็น: % ที่ผู้ใช้พิมพ์ควรถูก escape ก่อนใส่ LIKE ไม่ใช่ทำหน้าที่เป็น wildcard
    const all = await get('/api/admin/sn', { cookie })
    const pct = await get('/api/admin/sn?search=%25', { cookie })
    assert.ok(
      pct.json.meta.total < all.json.meta.total,
      `search=% คืน ${pct.json.meta.total} จากทั้งหมด ${all.json.meta.total} — % ไม่ถูก escape`
    )
  })
})
