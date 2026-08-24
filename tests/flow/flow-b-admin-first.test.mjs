// Flow B — แอดมินเริ่มประกันก่อนที่จะมีลูกค้า แล้วลูกค้าค่อยมา "รับ" (claim) ทีหลัง
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { get, post, freshIp, loginAdmin } from '../helpers/client.mjs'
import { assertTestDatabase } from '../helpers/guard.mjs'
import { closeDb, resetAll, getSerial, getRegistrationBySn } from '../helpers/db.mjs'

const IP = freshIp()
let cookie
let productId
let serial

const claimBody = (overrides = {}) => ({
  customer_name: 'ทดสอบ Flow B',
  phone: '0823456789',
  email: 'flowb@example.com',
  product_id: productId,
  sn: serial.sn,
  customer_reported_warranty_start: '2026-08-01',
  customer_reported_warranty_end: '2028-02-01',
  consent: true,
  ...overrides,
})

before(async () => {
  await assertTestDatabase()
  await resetAll()
  cookie = await loginAdmin()
})
after(async () => {
  await resetAll()
  await closeDb()
})

describe('Flow B — แอดมินเริ่มประกันก่อน ลูกค้ามา claim ทีหลัง', () => {
  test('B1 — เตรียม scheme + product + SN ที่ผูกผลิตภัณฑ์แล้ว', async () => {
    const scheme = await post('/api/admin/sn-setup', {
      cookie,
      body: { label: 'TEST flow B', prefix: 'FB', model_code: '01', next_sequence: 1 },
    })
    assert.equal(scheme.status, 201)
    const schemeId = scheme.json.scheme?.id ?? scheme.json.id

    const product = await post('/api/admin/products', {
      cookie,
      body: {
        name: 'TEST flow B product',
        code: 'FLOWB1',
        source_type: 'in_house',
        warranty_years: 1,
        warranty_months: 6,
      },
    })
    assert.equal(product.status, 201)
    productId = product.json.product?.id ?? product.json.id

    const gen = await post('/api/admin/sn/generate', {
      cookie,
      body: { scheme_id: schemeId, quantity: 1, category: 'TEST flow B' },
    })
    assert.equal(gen.status, 201)
    serial = gen.json.serials[0]

    const assign = await post('/api/admin/sn/assign-product', {
      cookie,
      body: { serial_number_ids: [serial.id], product_id: productId },
    })
    assert.equal(assign.status, 200)
  })

  test('B2 — แอดมินเริ่มประกันทั้งที่ยังไม่มีใครลงทะเบียน', async () => {
    const res = await post('/api/admin/registrations/start-warranty', {
      cookie,
      body: { serial_number_ids: [serial.id], start_date: '2026-08-01' },
    })
    assert.equal(res.status, 200)
    assert.equal(res.json.started, 1)
  })

  test('B3 — เกิด registration เปล่าที่ยังไม่มีข้อมูลลูกค้า', async () => {
    const reg = await getRegistrationBySn(serial.sn)
    assert.ok(reg, 'ต้องมี registration ถูกสร้างให้')
    assert.equal(reg.phone, null)
    assert.equal(reg.customer_name, null)
    assert.equal(reg.email, null)
    assert.equal(reg.warranty_start, '2026-08-01')
    assert.equal(reg.warranty_end, '2028-02-01')
    assert.equal((await getSerial(serial.sn)).status, 'registered')
  })

  test('B4 — warranty/check → registered:true แต่ claimed:false', async () => {
    const res = await get(`/api/warranty/check?sn=${serial.sn}`, {})
    assert.equal(res.status, 200)
    assert.equal(res.json.registered, true)
    assert.equal(res.json.claimed, false, 'ยังไม่มีลูกค้ามารับ')
  })

  test('B5 — แอดมินเห็นแถวที่ยังไม่มีลูกค้าในรายการลงทะเบียน', async () => {
    const res = await get('/api/admin/registrations', { cookie })
    assert.equal(res.status, 200)
    const rows = res.json.data ?? res.json.registrations ?? []
    assert.ok(rows.some((r) => r.sn === serial.sn))
  })

  test('B6 — claim ด้วยวันที่ผิด → 409 พร้อม field_errors และ DB ต้องไม่เปลี่ยน', async () => {
    const res = await post('/api/register', {
      body: claimBody({ customer_reported_warranty_start: '2026-07-01' }),
    })
    assert.equal(res.status, 409)
    assert.ok(res.json.field_errors, 'ต้องบอกว่าช่องไหนผิด')
    assert.equal(res.json.field_errors.warranty_start, true)

    const reg = await getRegistrationBySn(serial.sn)
    assert.equal(reg.phone, null, 'claim ที่ล้มเหลวต้องไม่เขียนข้อมูลลูกค้าลงไป')
    assert.equal(reg.customer_name, null)
    assert.equal(reg.warranty_start, '2026-08-01', 'วันประกันเดิมต้องไม่ถูกแตะ')
  })

  test('B6b — claim ด้วยวันสิ้นสุดผิด → 409 เช่นกัน', async () => {
    const res = await post('/api/register', {
      body: claimBody({ customer_reported_warranty_end: '2029-01-01' }),
    })
    assert.equal(res.status, 409)
    assert.equal(res.json.field_errors.warranty_end, true)
    assert.equal((await getRegistrationBySn(serial.sn)).phone, null)
  })

  test('B7 — claim ด้วยวันที่ถูก → 201 เติมข้อมูลลูกค้าลงแถวเดิม', async () => {
    const res = await post('/api/register', { body: claimBody() })
    assert.equal(res.status, 201)
    assert.equal(res.json.registration.warranty_start, '2026-08-01')
    assert.equal(res.json.registration.warranty_end, '2028-02-01')

    const reg = await getRegistrationBySn(serial.sn)
    assert.equal(reg.phone, '0823456789')
    assert.equal(reg.customer_name, 'ทดสอบ Flow B')
    assert.equal(reg.email, 'flowb@example.com')
    assert.ok(reg.consent_accepted_at)
    assert.equal(reg.warranty_start, '2026-08-01', 'วันประกันที่แอดมินตั้งไว้ต้องไม่ถูกคำนวณใหม่')
    assert.equal(reg.warranty_end, '2028-02-01')
  })

  test('B8 — warranty/check → claimed:true', async () => {
    const res = await get(`/api/warranty/check?sn=${serial.sn}`, {})
    assert.equal(res.json.claimed, true)
  })

  test('B9 — แจ้งปัญหาได้แล้ว → 201', async () => {
    const form = new FormData()
    form.set('sn', serial.sn)
    form.set('phone', '0823456789')
    form.set('description', 'เครื่องใช้งานได้ไม่ครบฟังก์ชัน รบกวนตรวจสอบให้ด้วยครับ')
    const res = await post('/api/issues', { form })
    assert.equal(res.status, 201)
  })

  test('B10 — claim ซ้ำอีกครั้งด้วยคนอื่น → 409', async () => {
    const res = await post('/api/register', {
      body: claimBody({ customer_name: 'คนอื่น', phone: '0899999999', email: 'x@example.com' }),
    })
    assert.equal(res.status, 409)
    assert.equal((await getRegistrationBySn(serial.sn)).phone, '0823456789')
  })
})
