// /api/admin/products (GET, POST) และ /api/admin/products/[id] (PATCH)
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { get, post, patch, freshIp, loginAdmin, AUTH_FAILURE_CASES, cookieFor } from '../helpers/client.mjs'
import { assertTestDatabase } from '../helpers/guard.mjs'
import { closeDb, resetAll, createProduct, q1, db } from '../helpers/db.mjs'

const IP = freshIp()
let cookie

before(async () => {
  await assertTestDatabase()
  await resetAll()
  cookie = await loginAdmin()
})
after(async () => {
  await resetAll()
  await closeDb()
})

describe('auth มาตรฐาน', () => {
  for (const c of AUTH_FAILURE_CASES) {
    test(`GET /api/admin/products — ${c.name} → 401`, async () => {
      const res = await get('/api/admin/products', { cookie: await cookieFor(c) })
      assert.equal(res.status, 401)
    })
    test(`POST /api/admin/products — ${c.name} → 401`, async () => {
      const res = await post('/api/admin/products', {
        cookie: await cookieFor(c),
        body: { name: 'TEST ไม่ควรถูกสร้าง' },
      })
      assert.equal(res.status, 401)
    })
  }

  test('ไม่มีอะไรถูกสร้างจากเคส auth ที่ล้มเหลว', async () => {
    const row = await q1("SELECT id FROM products WHERE name = 'TEST ไม่ควรถูกสร้าง'")
    assert.equal(row, null)
  })
})

describe('GET /api/admin/products', () => {
  test('คืน 200 และรวมผลิตภัณฑ์ที่ปิดใช้งานด้วย (ต่างจาก public)', async () => {
    const off = await createProduct({ name: 'TEST ปิดอยู่', is_active: 0 })
    const res = await get('/api/admin/products', { cookie })
    assert.equal(res.status, 200)
    const list = Array.isArray(res.json) ? res.json : res.json.products
    assert.ok(list.some((p) => p.id === off.id), 'แอดมินต้องเห็นผลิตภัณฑ์ที่ปิดใช้งาน')
  })
})

describe('POST /api/admin/products', () => {
  test('body ไม่ใช่ JSON → 400', async () => {
    const res = await post('/api/admin/products', { cookie, body: 'nope' })
    assert.equal(res.status, 400)
  })

  test('ไม่มีชื่อ → 400', async () => {
    const res = await post('/api/admin/products', { cookie, body: { name: '  ' } })
    assert.equal(res.status, 400)
  })

  test('สร้างสำเร็จ → 201', async () => {
    const res = await post('/api/admin/products', {
      cookie,
      body: {
        name: 'TEST สร้างผ่าน API',
        code: 'TSTAPI',
        brand: 'TESTBRAND',
        model: 'T-9',
        source_type: 'in_house',
        warranty_years: 1,
        warranty_months: 6,
        warranty_days: 0,
      },
    })
    assert.equal(res.status, 201)
  })

  test('code ผิดรูปแบบ → 400', async () => {
    for (const code of ['A', 'AB-12', 'ABCDEFGHIJK', 'ab 12']) {
      const res = await post('/api/admin/products', {
        cookie,
        body: { name: `TEST code ${code}`, code },
      })
      assert.equal(res.status, 400, `code=${code} ควรถูกปฏิเสธ`)
    }
  })

  test('code ซ้ำ → 409', async () => {
    const res = await post('/api/admin/products', {
      cookie,
      body: { name: 'TEST code ซ้ำ', code: 'TSTAPI' },
    })
    assert.equal(res.status, 409)
    assert.match(res.json.error, /TSTAPI/)
  })

  test('code ว่าง → เก็บเป็น NULL และสร้างซ้ำได้หลายตัว', async () => {
    const a = await post('/api/admin/products', {
      cookie,
      body: { name: 'TEST ไร้รหัส 1', code: '' },
    })
    const b = await post('/api/admin/products', {
      cookie,
      body: { name: 'TEST ไร้รหัส 2', code: '' },
    })
    assert.equal(a.status, 201)
    assert.equal(b.status, 201, 'ผลิตภัณฑ์ไร้รหัสตัวที่สองต้องสร้างได้ (NULL ซ้ำได้ แต่ "" ซ้ำไม่ได้)')

    const row = await q1("SELECT code FROM products WHERE name = 'TEST ไร้รหัส 1'")
    assert.equal(row.code, null, "ต้องเก็บเป็น NULL ไม่ใช่ ''")
  })

  test('ไม่ส่ง source_type → default in_house', async () => {
    await post('/api/admin/products', { cookie, body: { name: 'TEST default source' } })
    const row = await q1("SELECT source_type FROM products WHERE name = 'TEST default source'")
    assert.equal(row.source_type, 'in_house')
  })

  test('source_type นอก enum → 400', async () => {
    const res = await post('/api/admin/products', {
      cookie,
      body: { name: 'TEST source ผิด', source_type: 'other' },
    })
    assert.equal(res.status, 400)
  })

  test('วันสิ้นสุดก่อนวันเริ่ม → 400', async () => {
    const res = await post('/api/admin/products', {
      cookie,
      body: {
        name: 'TEST ช่วงวันกลับหัว',
        warranty_start_date: '2027-01-01',
        warranty_end_date: '2026-01-01',
      },
    })
    assert.equal(res.status, 400)
  })

  test('กรอกช่วงวันครบคู่ → คำนวณระยะประกันให้เอง', async () => {
    await post('/api/admin/products', {
      cookie,
      body: {
        name: 'TEST คำนวณจากช่วงวัน',
        warranty_years: 9,
        warranty_months: 9,
        warranty_days: 9,
        warranty_start_date: '2026-08-01',
        warranty_end_date: '2027-08-01',
      },
    })
    const row = await q1(
      "SELECT warranty_years, warranty_months, warranty_days FROM products WHERE name = 'TEST คำนวณจากช่วงวัน'"
    )
    assert.deepEqual(
      { y: row.warranty_years, m: row.warranty_months, d: row.warranty_days },
      { y: 1, m: 0, d: 0 },
      'ช่วงวันที่ต้องชนะค่าปี/เดือน/วันที่กรอกมา'
    )
  })
})

describe('PATCH /api/admin/products/[id]', () => {
  let product

  before(async () => {
    product = await createProduct({ name: 'TEST สำหรับแก้ไข', code: 'TSTPCH' })
  })

  test('id ไม่ใช่ตัวเลข → 400', async () => {
    const res = await patch('/api/admin/products/abc', {
      cookie,
      body: { name: 'TEST x' },
    })
    assert.equal(res.status, 400)
  })

  test('ไม่พบผลิตภัณฑ์ → 404', async () => {
    const res = await patch('/api/admin/products/99999999', {
      cookie,
      body: { name: 'TEST x' },
    })
    assert.equal(res.status, 404)
  })

  test('แก้ไขสำเร็จ → 200', async () => {
    const res = await patch(`/api/admin/products/${product.id}`, {
      cookie,
      body: { name: 'TEST แก้ชื่อแล้ว', code: 'TSTPCH', warranty_years: 2 },
    })
    assert.equal(res.status, 200)
    const row = await q1('SELECT name FROM products WHERE id = ?', [product.id])
    assert.equal(row.name, 'TEST แก้ชื่อแล้ว')
  })

  test('code ชนกับผลิตภัณฑ์อื่น → 409', async () => {
    const res = await patch(`/api/admin/products/${product.id}`, {
      cookie,
      body: { name: 'TEST แก้ชื่อแล้ว', code: 'TSTAPI' },
    })
    assert.equal(res.status, 409)
  })

  test('แก้ code ไม่ได้ถ้ามี SN ผูกอยู่แล้ว → 409', async () => {
    await db().query(
      "INSERT INTO serial_numbers (sn, product_id, category) VALUES ('TESTPCH0000001', ?, 'TEST')",
      [product.id]
    )
    const res = await patch(`/api/admin/products/${product.id}`, {
      cookie,
      body: { name: 'TEST แก้ชื่อแล้ว', code: 'TSTNEW' },
    })
    assert.equal(res.status, 409)
    assert.match(res.json.error, /Serial Number/)
  })

  test('ผลิตภัณฑ์ที่เดิมไม่มีรหัส เติมรหัสครั้งแรกได้แม้มี SN แล้ว', async () => {
    const noCode = await createProduct({ name: 'TEST ไร้รหัสมี SN', code: null })
    await db().query(
      "INSERT INTO serial_numbers (sn, product_id, category) VALUES ('TESTPCH0000002', ?, 'TEST')",
      [noCode.id]
    )
    const res = await patch(`/api/admin/products/${noCode.id}`, {
      cookie,
      body: { name: 'TEST ไร้รหัสมี SN', code: 'TSTFST' },
    })
    assert.equal(res.status, 200, 'ผลิตภัณฑ์ไร้รหัสต้องไม่ติดล็อกถาวร')
  })
})
