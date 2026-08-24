// Flow C — สินค้าซื้อมาขายต่อ (resale): SN ติดมากับสินค้าแล้ว นำเข้าผ่าน /api/admin/sn/import
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { get, post, freshIp, loginAdmin } from '../helpers/client.mjs'
import { assertTestDatabase } from '../helpers/guard.mjs'
import { closeDb, resetAll, getSerial, getRegistrationBySn, q1 } from '../helpers/db.mjs'

const IP = freshIp()
let cookie
let productId

before(async () => {
  await assertTestDatabase()
  await resetAll()
  cookie = await loginAdmin()
})
after(async () => {
  await resetAll()
  await closeDb()
})

describe('Flow C — สินค้าซื้อมาขายต่อ', () => {
  test('C1 — สร้างผลิตภัณฑ์ source_type=resale', async () => {
    const res = await post('/api/admin/products', {
      cookie,
      body: {
        name: 'TEST flow C resale',
        code: 'FLOWC1',
        source_type: 'resale',
        warranty_years: 2,
      },
    })
    assert.equal(res.status, 201)
    productId = res.json.product?.id ?? res.json.id

    const row = await q1('SELECT source_type FROM products WHERE id = ?', [productId])
    assert.equal(row.source_type, 'resale')
  })

  test('C2 — import SN ที่มากับสินค้า → ผูกผลิตภัณฑ์ทันที', async () => {
    const res = await post('/api/admin/sn/import', {
      cookie,
      body: {
        product_id: productId,
        sns: ['EXT-FLOWC-0001', 'EXT-FLOWC-0002'],
        category: 'TEST flow C',
      },
    })
    assert.equal(res.status, 201)
    assert.equal(res.json.imported, 2)

    const row = await getSerial('EXT-FLOWC-0001')
    assert.equal(row.product_id, productId, 'import ต้องผูกผลิตภัณฑ์ทันที ต่างจาก generate')
    assert.equal(row.scheme_id, null, 'ไม่ได้มาจากรูปแบบรหัสอัตโนมัติ')
    assert.equal(row.status, 'available')
  })

  test('C3 — ลูกค้าลงทะเบียนด้วย SN ที่ import มา ใช้ flow เดียวกับ SN ที่ generate เอง', async () => {
    const res = await post('/api/register', {
      body: {
        customer_name: 'ทดสอบ Flow C',
        phone: '0834567890',
        email: 'flowc@example.com',
        product_id: productId,
        sn: 'EXT-FLOWC-0001',
        customer_reported_warranty_start: '2026-08-01',
        customer_reported_warranty_end: '2028-08-01',
        consent: true,
      },
    })
    assert.equal(res.status, 201)
    assert.equal(res.json.registration.warranty_start, null, 'ยังต้องรอแอดมินกดเริ่มประกันเหมือนกัน')
  })

  test('C4 — import SN ซ้ำถูกข้าม ไม่ error', async () => {
    const res = await post('/api/admin/sn/import', {
      cookie,
      body: {
        product_id: productId,
        sns: ['EXT-FLOWC-0001', 'EXT-FLOWC-0003'],
        category: 'TEST flow C',
      },
    })
    assert.equal(res.status, 201)
    assert.equal(res.json.imported, 1, 'ตัวที่ซ้ำต้องถูกข้าม')
    assert.equal(res.json.skipped, 1)
  })

  test('C4b — SN ที่ซ้ำต้องไม่ถูกย้ายไปผูกผลิตภัณฑ์อื่น', async () => {
    const other = await post('/api/admin/products', {
      cookie,
      body: { name: 'TEST flow C ผลิตภัณฑ์อื่น', source_type: 'resale', warranty_years: 1 },
    })
    const otherId = other.json.product?.id ?? other.json.id

    await post('/api/admin/sn/import', {
      cookie,
      body: { product_id: otherId, sns: ['EXT-FLOWC-0001'], category: 'TEST แย่ง' },
    })

    const row = await getSerial('EXT-FLOWC-0001')
    assert.equal(row.product_id, productId, 'SN ที่มีเจ้าของแล้วต้องไม่ถูกย้ายผลิตภัณฑ์')
  })

  test('C5 — เริ่มประกันแล้วคำนวณ 2 ปีถูกต้อง', async () => {
    const serial = await getSerial('EXT-FLOWC-0001')
    const res = await post('/api/admin/registrations/start-warranty', {
      cookie,
      body: { serial_number_ids: [serial.id], start_date: '2026-08-01' },
    })
    assert.equal(res.json.started, 1)

    const reg = await getRegistrationBySn('EXT-FLOWC-0001')
    assert.equal(reg.warranty_end, '2028-08-01')
  })

  test('C6 — warranty/check ใช้งานได้เหมือน SN ปกติ', async () => {
    const res = await get('/api/warranty/check?sn=EXT-FLOWC-0001', {})
    assert.equal(res.status, 200)
    assert.equal(res.json.registered, true)
    assert.equal(res.json.claimed, true)
  })
})
