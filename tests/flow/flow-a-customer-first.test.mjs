// Flow A — ลูกค้าลงทะเบียนก่อน แล้วแอดมินค่อยกด "เริ่มประกัน"
// generate SN → assign-product → register → warranty/check → start-warranty → issues → export
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { get, post, patch, freshIp, loginAdmin } from '../helpers/client.mjs'
import { assertTestDatabase } from '../helpers/guard.mjs'
import {
  closeDb,
  resetAll,
  getSerial,
  getRegistrationBySn,
  getScheme,
  q1,
} from '../helpers/db.mjs'

const IP = freshIp()
let cookie
let schemeId
let productId
let batchId
let serials = []
const SN = () => serials[0].sn

before(async () => {
  await assertTestDatabase()
  await resetAll()
  cookie = await loginAdmin()
})
after(async () => {
  await resetAll()
  await closeDb()
})

describe('Flow A — ลูกค้าลงทะเบียนก่อน', () => {
  test('A0 — สร้างรูปแบบรหัส SN', async () => {
    const res = await post('/api/admin/sn-setup', {
      cookie,
      body: { label: 'TEST flow A', prefix: 'FA', model_code: '01', next_sequence: 1 },
    })
    assert.equal(res.status, 201)
    schemeId = res.json.scheme?.id ?? res.json.id
    assert.ok(schemeId, `ต้องได้ id ของ scheme กลับมา: ${res.text}`)
  })

  test('A1 — generate SN 3 ตัว', async () => {
    const res = await post('/api/admin/sn/generate', {
      cookie,
      body: { scheme_id: schemeId, quantity: 3, category: 'TEST flow A' },
    })
    assert.equal(res.status, 201)
    batchId = res.json.batch_id
    serials = res.json.serials
    assert.equal(serials.length, 3)

    const row = await getSerial(SN())
    assert.equal(row.product_id, null, 'เพิ่ง generate ต้องยังไม่ผูกผลิตภัณฑ์')
    assert.equal(row.status, 'available')
    assert.equal((await getScheme(schemeId)).next_sequence, 4)
  })

  test('A2 — warranty/check ตอนยังไม่ผูกผลิตภัณฑ์ → 409', async () => {
    const res = await get(`/api/warranty/check?sn=${SN()}`, {})
    assert.equal(res.status, 409)
  })

  test('A3 — register ตอนยังไม่ผูกผลิตภัณฑ์ → 409', async () => {
    const res = await post('/api/register', {
      body: {
        customer_name: 'ทดสอบ Flow A',
        phone: '0812345678',
        email: 'flowa@example.com',
        product_id: 1,
        sn: SN(),
        customer_reported_warranty_start: '2026-08-01',
        customer_reported_warranty_end: '2028-02-01',
        consent: true,
      },
    })
    assert.equal(res.status, 409)
    assert.match(res.json.error, /ยังไม่พร้อมให้ลงทะเบียน/)
  })

  test('A4 — สร้างผลิตภัณฑ์ประกัน 1 ปี 6 เดือน', async () => {
    const res = await post('/api/admin/products', {
      cookie,
      body: {
        name: 'TEST flow A product',
        code: 'FLOWA1',
        brand: 'TESTBRAND',
        model: 'FA-1',
        source_type: 'in_house',
        warranty_years: 1,
        warranty_months: 6,
        warranty_days: 0,
      },
    })
    assert.equal(res.status, 201)
    productId = res.json.product?.id ?? res.json.id
    assert.ok(productId, `ต้องได้ id ของผลิตภัณฑ์: ${res.text}`)
  })

  test('A5 — assign-product ทั้ง 3 ตัว', async () => {
    const res = await post('/api/admin/sn/assign-product', {
      cookie,
      body: { serial_number_ids: serials.map((s) => s.id), product_id: productId },
    })
    assert.equal(res.status, 200)
    assert.equal((await getSerial(SN())).product_id, productId)
  })

  test('A6 — warranty/check → registered:false พร้อมระยะประกัน', async () => {
    const res = await get(`/api/warranty/check?sn=${SN()}`, {})
    assert.equal(res.status, 200)
    assert.equal(res.json.registered, false)
    assert.equal(res.json.warranty_text, '1 ปี 6 เดือน')
  })

  test('A7 — ลูกค้าลงทะเบียน → 201 และวันประกันยังเป็น null', async () => {
    const res = await post('/api/register', {
      body: {
        customer_name: 'ทดสอบ Flow A',
        phone: '0812345678',
        email: 'flowa@example.com',
        product_id: productId,
        sn: SN(),
        customer_reported_warranty_start: '2026-08-01',
        customer_reported_warranty_end: '2028-02-01',
        consent: true,
      },
    })
    assert.equal(res.status, 201)
    assert.equal(res.json.registration.warranty_start, null)
    assert.equal(res.json.registration.warranty_end, null)

    const reg = await getRegistrationBySn(SN())
    assert.equal(reg.warranty_start, null)
    assert.ok(reg.consent_accepted_at)
    assert.equal(reg.customer_reported_warranty_start, '2026-08-01')
  })

  test('A8 — อยู่ในรายการ warranty_status=not_started', async () => {
    const res = await get('/api/admin/registrations?warranty_status=not_started', { cookie })
    assert.equal(res.status, 200)
    const rows = res.json.data ?? res.json.registrations ?? []
    assert.ok(rows.some((r) => r.sn === SN()), 'ต้องเจอ SN นี้ในรายการรอเริ่มประกัน')
  })

  test('A9 — แจ้งปัญหาก่อนเริ่มประกัน → 409', async () => {
    const form = new FormData()
    form.set('sn', SN())
    form.set('phone', '0812345678')
    form.set('description', 'เครื่องเสียตั้งแต่แกะกล่อง รบกวนช่วยตรวจสอบให้ด้วยครับ')
    const res = await post('/api/issues', { form })
    assert.equal(res.status, 409)
    assert.match(res.json.error, /ยังไม่เริ่มระยะเวลาประกัน/)
  })

  test('A10 — ลงทะเบียนซ้ำ SN เดิม → 409', async () => {
    const res = await post('/api/register', {
      body: {
        customer_name: 'คนอื่น',
        phone: '0899999999',
        email: 'other@example.com',
        product_id: productId,
        sn: SN(),
        customer_reported_warranty_start: '2026-08-01',
        customer_reported_warranty_end: '2028-02-01',
        consent: true,
      },
    })
    assert.equal(res.status, 409)
    assert.equal((await getRegistrationBySn(SN())).phone, '0812345678', 'ข้อมูลเดิมต้องไม่ถูกทับ')
  })

  test('A11 — แอดมินเริ่มประกัน 1 ส.ค. 2026 → หมด 1 ก.พ. 2028', async () => {
    const serialId = (await getSerial(SN())).id
    const res = await post('/api/admin/registrations/start-warranty', {
      cookie,
      body: { serial_number_ids: [serialId], start_date: '2026-08-01' },
    })
    assert.equal(res.status, 200)
    assert.equal(res.json.started, 1)

    const reg = await getRegistrationBySn(SN())
    assert.equal(reg.warranty_start, '2026-08-01')
    assert.equal(reg.warranty_end, '2028-02-01')
  })

  test('A12 — warranty/check → registered:true claimed:true', async () => {
    const res = await get(`/api/warranty/check?sn=${SN()}`, {})
    assert.equal(res.status, 200)
    assert.equal(res.json.registered, true)
    assert.equal(res.json.claimed, true)
    assert.ok(!res.text.includes('0812345678'), 'เบอร์ต้องถูก mask ในหน้า public')
  })

  test('A13 — แจ้งปัญหาพร้อมแนบรูป 2 ไฟล์ → 201', async () => {
    const form = new FormData()
    form.set('sn', SN())
    form.set('phone', '0812345678')
    form.set('description', 'เครื่องมีเสียงดังผิดปกติ รบกวนช่วยตรวจสอบให้ด้วยครับ')
    form.append('images', new File([new Uint8Array(1024)], 'รูป1.jpg', { type: 'image/jpeg' }))
    form.append('images', new File([new Uint8Array(1024)], 'รูป2.png', { type: 'image/png' }))

    const res = await post('/api/issues', { form })
    assert.equal(res.status, 201)

    const att = await q1(
      'SELECT COUNT(*) n FROM issue_attachments WHERE issue_report_id = (SELECT MAX(id) FROM issue_reports)'
    )
    assert.equal(att.n, 2)
  })

  test('A14 — ลูกค้าเช็คสถานะเคสได้', async () => {
    const res = await get(`/api/issues/status?sn=${SN()}&phone=0812345678`, {})
    assert.equal(res.status, 200)
  })

  test('A15 — แอดมินอัปเดตเคสเป็น resolved', async () => {
    const issue = await q1('SELECT id FROM issue_reports ORDER BY id DESC LIMIT 1')
    const res = await patch(`/api/admin/issues/${issue.id}`, {
      cookie,
      body: { status: 'resolved', admin_note: 'เปลี่ยนอะไหล่แล้ว' },
    })
    assert.equal(res.status, 200)
  })

  test('A16 — export batch นี้ได้ 3 แถว', async () => {
    const res = await get(`/api/admin/sn/export?batch_id=${batchId}`, { cookie, raw: true })
    assert.equal(res.status, 200)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(res.buffer)
    const sheet = wb.getWorksheet('Serial Number')
    assert.equal(sheet.rowCount, 4, 'หัวตาราง 1 แถว + ข้อมูล 3 แถว')

    const snCells = []
    sheet.eachRow((row, i) => {
      if (i > 1) snCells.push(String(row.getCell(2).value))
    })
    assert.deepEqual(snCells.sort(), serials.map((s) => s.sn).sort())
  })

  test('A17 — กดเริ่มประกันซ้ำ → skipped และวันเดิมไม่เปลี่ยน', async () => {
    const serialId = (await getSerial(SN())).id
    const res = await post('/api/admin/registrations/start-warranty', {
      cookie,
      body: { serial_number_ids: [serialId], start_date: '2027-01-01' },
    })
    assert.equal(res.json.started, 0)
    assert.equal(res.json.skipped, 1)
    assert.equal((await getRegistrationBySn(SN())).warranty_start, '2026-08-01')
  })
})
