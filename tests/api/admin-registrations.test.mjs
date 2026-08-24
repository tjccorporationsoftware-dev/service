// /api/admin/registrations, /start-warranty และ /api/admin/stats
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { get, post, freshIp, loginAdmin, AUTH_FAILURE_CASES, cookieFor } from '../helpers/client.mjs'
import { assertTestDatabase } from '../helpers/guard.mjs'
import {
  closeDb,
  resetAll,
  createProduct,
  getSerial,
  getRegistrationBySn,
  getAuditLogs,
  db,
  q,
} from '../helpers/db.mjs'
import { toDateString } from '../../lib/warranty.ts'

const IP = freshIp()
let cookie
let product

async function makeSerial(sn, { productId, status = 'available' } = {}) {
  const [res] = await db().query(
    'INSERT INTO serial_numbers (sn, product_id, status, category) VALUES (?, ?, ?, ?)',
    [sn, productId ?? null, status, 'TEST']
  )
  return res.insertId
}

before(async () => {
  await assertTestDatabase()
  await resetAll()
  cookie = await loginAdmin()
  product = await createProduct({
    name: 'TEST ผลิตภัณฑ์ reg',
    warranty_years: 1,
    warranty_months: 6,
    warranty_days: 0,
  })
})
after(async () => {
  await resetAll()
  await closeDb()
})

describe('auth มาตรฐาน', () => {
  for (const c of AUTH_FAILURE_CASES) {
    test(`GET /api/admin/registrations — ${c.name} → 401`, async () => {
      assert.equal((await get('/api/admin/registrations', { cookie: await cookieFor(c) })).status, 401)
    })
    test(`POST /start-warranty — ${c.name} → 401`, async () => {
      const res = await post('/api/admin/registrations/start-warranty', {
        cookie: await cookieFor(c),
        body: { serial_number_ids: [1] },
      })
      assert.equal(res.status, 401)
    })
    test(`GET /api/admin/stats — ${c.name} → 401`, async () => {
      assert.equal((await get('/api/admin/stats', { cookie: await cookieFor(c) })).status, 401)
    })
  }
})

describe('GET /api/admin/stats', () => {
  test('คืน 200 พร้อมตัวเลขสรุป', async () => {
    const res = await get('/api/admin/stats', { cookie })
    assert.equal(res.status, 200)
    assert.equal(typeof res.json, 'object')
  })
})

describe('POST /api/admin/registrations/start-warranty', () => {
  test('รายการว่าง → 400', async () => {
    const res = await post('/api/admin/registrations/start-warranty', {
      cookie,
      body: { serial_number_ids: [] },
    })
    assert.equal(res.status, 400)
  })

  test('เกิน 500 รายการ → 400', async () => {
    const res = await post('/api/admin/registrations/start-warranty', {
      cookie,
      body: { serial_number_ids: Array.from({ length: 501 }, (_, i) => i + 1) },
    })
    assert.equal(res.status, 400)
  })

  test('start_date ผิดรูปแบบ → 400', async () => {
    const res = await post('/api/admin/registrations/start-warranty', {
      cookie,
      body: { serial_number_ids: [1], start_date: '01/08/2026' },
    })
    assert.equal(res.status, 400)
  })

  test('วันที่ไม่มีจริง 2026-02-30 → ควรเป็น 400', async () => {
    const id = await makeSerial('TESTREG0000009', { productId: product.id })
    const res = await post('/api/admin/registrations/start-warranty', {
      cookie,
      body: { serial_number_ids: [id], start_date: '2026-02-30' },
    })
    assert.equal(res.status, 400, `30 ก.พ. ไม่มีอยู่จริง ต้องถูกปฏิเสธ ไม่ใช่เลื่อนเป็น 2 มี.ค. เงียบ ๆ`)
  })

  test('SN ที่มี registration รออยู่ → อัปเดตแถวเดิม', async () => {
    const id = await makeSerial('TESTREG0000001', { productId: product.id, status: 'registered' })
    await q(
      `INSERT INTO registrations (serial_number_id, phone, customer_name, email)
       VALUES (?, '0812345678', 'ทดสอบ', 't@example.com')`,
      [id]
    )
    const res = await post('/api/admin/registrations/start-warranty', {
      cookie,
      body: { serial_number_ids: [id], start_date: '2026-08-01' },
    })
    assert.equal(res.status, 200)
    assert.equal(res.json.started, 1)

    const reg = await getRegistrationBySn('TESTREG0000001')
    assert.equal(reg.warranty_start, '2026-08-01')
    assert.equal(reg.warranty_end, '2028-02-01', '1 ปี 6 เดือน จาก 1 ส.ค. 2026')
    assert.equal(reg.phone, '0812345678', 'ข้อมูลลูกค้าต้องไม่ถูกแตะ')
  })

  test('SN ที่ยังไม่มีใครลงทะเบียน → สร้าง registration เปล่า', async () => {
    const id = await makeSerial('TESTREG0000002', { productId: product.id })
    const res = await post('/api/admin/registrations/start-warranty', {
      cookie,
      body: { serial_number_ids: [id], start_date: '2026-08-01' },
    })
    assert.equal(res.json.started, 1)

    const reg = await getRegistrationBySn('TESTREG0000002')
    assert.equal(reg.phone, null)
    assert.equal(reg.customer_name, null)
    assert.equal(reg.email, null)
    assert.equal(reg.warranty_start, '2026-08-01')
    assert.equal((await getSerial('TESTREG0000002')).status, 'registered')
  })

  test('กดซ้ำรอบสอง → skipped และไม่ทับวันเดิม', async () => {
    const id = (await getSerial('TESTREG0000002')).id
    const res = await post('/api/admin/registrations/start-warranty', {
      cookie,
      body: { serial_number_ids: [id], start_date: '2027-01-01' },
    })
    assert.equal(res.json.started, 0)
    assert.equal(res.json.skipped, 1)
    assert.equal((await getRegistrationBySn('TESTREG0000002')).warranty_start, '2026-08-01')
  })

  test('SN สถานะ void → skipped', async () => {
    const id = await makeSerial('TESTREG0000003', { productId: product.id, status: 'void' })
    const res = await post('/api/admin/registrations/start-warranty', {
      cookie,
      body: { serial_number_ids: [id], start_date: '2026-08-01' },
    })
    assert.equal(res.json.started, 0)
    assert.equal(res.json.skipped, 1)
    assert.equal(await getRegistrationBySn('TESTREG0000003'), null)
  })

  test('SN ที่ยังไม่ผูกผลิตภัณฑ์ → skipped', async () => {
    const id = await makeSerial('TESTREG0000004')
    const res = await post('/api/admin/registrations/start-warranty', {
      cookie,
      body: { serial_number_ids: [id], start_date: '2026-08-01' },
    })
    assert.equal(res.json.started, 0)
    assert.equal(res.json.skipped, 1)
  })

  test('ส่ง 3 id แต่ใช้ได้ตัวเดียว → started 1 skipped 2', async () => {
    const good = await makeSerial('TESTREG0000005', { productId: product.id })
    const voided = await makeSerial('TESTREG0000006', { productId: product.id, status: 'void' })
    const unlinked = await makeSerial('TESTREG0000007')
    const res = await post('/api/admin/registrations/start-warranty', {
      cookie,
      body: { serial_number_ids: [good, voided, unlinked], start_date: '2026-08-01' },
    })
    assert.equal(res.json.started, 1)
    assert.equal(res.json.skipped, 2)
  })

  test('ไม่ส่ง start_date → ใช้วันนี้ตามเวลาไทย', async () => {
    const id = await makeSerial('TESTREG0000008', { productId: product.id })
    const res = await post('/api/admin/registrations/start-warranty', {
      cookie,
      body: { serial_number_ids: [id] },
    })
    assert.equal(res.json.start_date, toDateString(new Date()))
    assert.equal((await getRegistrationBySn('TESTREG0000008')).warranty_start, toDateString(new Date()))
  })

  test('บันทึก audit log', async () => {
    const logs = await getAuditLogs('registration.start_warranty')
    assert.ok(logs.length >= 1)
  })
})

describe('GET /api/admin/registrations', () => {
  test('คืน 200 พร้อม meta', async () => {
    const res = await get('/api/admin/registrations', { cookie })
    assert.equal(res.status, 200)
    assert.ok(res.json.meta)
  })

  test('warranty_status=not_started คืนเฉพาะแถวที่ยังไม่เริ่มประกัน', async () => {
    const id = await makeSerial('TESTREG0000010', { productId: product.id, status: 'registered' })
    await q(
      `INSERT INTO registrations (serial_number_id, phone, customer_name, email)
       VALUES (?, '0898888888', 'ยังไม่เริ่ม', 'n@example.com')`,
      [id]
    )
    const res = await get('/api/admin/registrations?warranty_status=not_started', { cookie })
    assert.equal(res.status, 200)
    const rows = res.json.data ?? res.json.registrations ?? []
    assert.ok(rows.length >= 1)
    assert.ok(
      rows.every((r) => !r.warranty_start),
      'ทุกแถวที่คืนมาต้องมี warranty_start เป็นค่าว่าง'
    )
  })

  test('warranty_status ที่ไม่รู้จักถูกละเว้น ไม่ใช่ 500', async () => {
    const res = await get('/api/admin/registrations?warranty_status=ไม่มีสถานะนี้', { cookie })
    assert.equal(res.status, 200)
  })

  test('กรองด้วยช่วงวันที่ได้', async () => {
    const res = await get(
      '/api/admin/registrations?warranty_start_from=2026-01-01&warranty_start_to=2026-12-31',
      { cookie }
    )
    assert.equal(res.status, 200)
  })
})
