// API ฝั่ง public: /api/products, /api/warranty/check, /api/issues, /api/issues/status
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { get, post, freshIp } from '../helpers/client.mjs'
import { assertTestDatabase } from '../helpers/guard.mjs'
import {
  closeDb,
  resetAll,
  createProduct,
  createScheme,
  q,
  db,
  getRegistrationBySn,
} from '../helpers/db.mjs'

const IP = freshIp()

/** สร้าง SN ตรงใน DB (ไม่ผ่าน API) เพื่อตั้งฉากให้เทสต์ public */
async function makeSerial({ sn, productId = null, status = 'available' }) {
  const [res] = await db().query(
    'INSERT INTO serial_numbers (sn, product_id, status, category) VALUES (?, ?, ?, ?)',
    [sn, productId, status, 'TEST']
  )
  return res.insertId
}

let product

before(async () => {
  await assertTestDatabase()
  await resetAll()
  product = await createProduct({ name: 'TEST ผลิตภัณฑ์ public', warranty_years: 1, warranty_months: 6 })
})

after(async () => {
  await resetAll()
  await closeDb()
})

describe('GET /api/products', () => {
  test('คืน 200 พร้อมรายการผลิตภัณฑ์', async () => {
    const res = await get('/api/products', {})
    assert.equal(res.status, 200)
    const list = Array.isArray(res.json) ? res.json : res.json.products
    assert.ok(Array.isArray(list))
    assert.ok(list.length >= 6, 'อย่างน้อยต้องมีผลิตภัณฑ์ seed 6 ตัว')
  })

  test('มี warranty_text เป็นข้อความไทย', async () => {
    const res = await get('/api/products', {})
    const list = Array.isArray(res.json) ? res.json : res.json.products
    const found = list.find((p) => p.id === product.id)
    assert.ok(found, 'ต้องเจอผลิตภัณฑ์ที่เพิ่งสร้าง')
    assert.equal(found.warranty_text, '1 ปี 6 เดือน')
  })

  test('ไม่คืนผลิตภัณฑ์ที่ปิดใช้งาน', async () => {
    const off = await createProduct({ name: 'TEST ปิดใช้งาน', is_active: 0 })
    const res = await get('/api/products', {})
    const list = Array.isArray(res.json) ? res.json : res.json.products
    assert.ok(!list.some((p) => p.id === off.id), 'ผลิตภัณฑ์ is_active=0 ไม่ควรโผล่ในหน้า public')
  })

  test('ไม่มีข้อมูลส่วนบุคคลหลุดออกมา', async () => {
    const res = await get('/api/products', {})
    assert.ok(!/phone|customer|email/i.test(res.text), 'endpoint public ไม่ควรมีฟิลด์ข้อมูลลูกค้า')
  })
})

describe('GET /api/warranty/check', () => {
  test('ไม่ส่ง sn → 400', async () => {
    const res = await get('/api/warranty/check', {})
    assert.equal(res.status, 400)
    assert.match(res.json.error, /Serial Number/)
  })

  test('sn สั้นกว่า 5 ตัว → 400', async () => {
    const res = await get('/api/warranty/check?sn=AB', {})
    assert.equal(res.status, 400)
  })

  test('sn ไม่มีในระบบ → 404', async () => {
    const res = await get('/api/warranty/check?sn=NOTEXIST00001', {})
    assert.equal(res.status, 404)
  })

  test('SN ที่ยังไม่ผูกผลิตภัณฑ์ → 409', async () => {
    await makeSerial({ sn: 'TESTPUB0000001' })
    const res = await get('/api/warranty/check?sn=TESTPUB0000001', {})
    assert.equal(res.status, 409)
    assert.match(res.json.error, /ยังไม่พร้อม/)
  })

  test('SN ที่ผูกผลิตภัณฑ์แล้วแต่ยังไม่มีใครลงทะเบียน → 200 registered:false', async () => {
    await makeSerial({ sn: 'TESTPUB0000002', productId: product.id })
    const res = await get('/api/warranty/check?sn=TESTPUB0000002', {})
    assert.equal(res.status, 200)
    assert.equal(res.json.registered, false)
    assert.equal(res.json.warranty_text, '1 ปี 6 เดือน')
  })

  test('รับ sn ตัวพิมพ์เล็กแล้วแปลงเป็นพิมพ์ใหญ่ให้', async () => {
    const res = await get('/api/warranty/check?sn=testpub0000002', {})
    assert.equal(res.status, 200, 'snSchema มี toUpperCase ควรหาเจอ')
    assert.equal(res.json.sn, 'TESTPUB0000002')
  })

  test('ปิดบังเบอร์โทรตาม PDPA เมื่อมีการลงทะเบียนแล้ว', async () => {
    const id = await makeSerial({ sn: 'TESTPUB0000003', productId: product.id, status: 'registered' })
    await q(
      `INSERT INTO registrations (serial_number_id, phone, customer_name, email, warranty_start, warranty_end)
       VALUES (?, '0812345678', 'ทดสอบ', 't@example.com', '2026-08-01', '2028-02-01')`,
      [id]
    )
    const res = await get('/api/warranty/check?sn=TESTPUB0000003', {})
    assert.equal(res.status, 200)
    assert.ok(!res.text.includes('0812345678'), 'เบอร์เต็มต้องไม่หลุดออกหน้า public')
    assert.ok(!res.text.includes('t@example.com'), 'อีเมลต้องไม่หลุดออกหน้า public')
  })
})

describe('GET /api/issues/status', () => {
  test('ขาดพารามิเตอร์ → 400', async () => {
    assert.equal((await get('/api/issues/status', {})).status, 400)
    assert.equal((await get('/api/issues/status?sn=TESTPUB0000003', {})).status, 400)
    assert.equal((await get('/api/issues/status?phone=0812345678', {})).status, 400)
  })

  test('เบอร์ผิดรูปแบบ → 400', async () => {
    const res = await get('/api/issues/status?sn=TESTPUB0000003&phone=812345678', {})
    assert.equal(res.status, 400)
  })

  test('ไม่พบคู่ SN + เบอร์ → 404', async () => {
    const res = await get('/api/issues/status?sn=TESTPUB0000003&phone=0899999999', {})
    assert.equal(res.status, 404)
  })

  test('คู่ที่ถูกต้อง → 200', async () => {
    const res = await get('/api/issues/status?sn=TESTPUB0000003&phone=0812345678', {})
    assert.equal(res.status, 200)
  })
})

describe('POST /api/register — เคสพัง', () => {
  const base = {
    customer_name: 'ทดสอบ ระบบ',
    phone: '0812345678',
    email: 'test@example.com',
    product_id: 0,
    sn: '',
    customer_reported_warranty_start: '2026-08-01',
    customer_reported_warranty_end: '2028-02-01',
    consent: true,
  }

  test('body ไม่ใช่ JSON → 400', async () => {
    const res = await post('/api/register', { body: 'ไม่ใช่ json' })
    assert.equal(res.status, 400)
    assert.equal(res.json.error, 'รูปแบบข้อมูลไม่ถูกต้อง')
  })

  test('ไม่ยอมรับ consent → 400 และไม่บันทึกอะไร', async () => {
    const before = (await q('SELECT COUNT(*) n FROM registrations'))[0].n
    const res = await post('/api/register', {
      body: { ...base, product_id: product.id, sn: 'TESTPUB0000002', consent: false },
    })
    assert.equal(res.status, 400)
    assert.equal((await q('SELECT COUNT(*) n FROM registrations'))[0].n, before)
  })

  test('เบอร์ไม่ขึ้นต้นด้วย 0 → 400', async () => {
    const res = await post('/api/register', {
      body: { ...base, product_id: product.id, sn: 'TESTPUB0000002', phone: '812345678' },
    })
    assert.equal(res.status, 400)
  })

  test('อีเมลผิดรูปแบบ → 400', async () => {
    const res = await post('/api/register', {
      body: { ...base, product_id: product.id, sn: 'TESTPUB0000002', email: 'ไม่ใช่อีเมล' },
    })
    assert.equal(res.status, 400)
  })

  test('SN ไม่มีในระบบ → 404', async () => {
    const res = await post('/api/register', {
      body: { ...base, product_id: product.id, sn: 'NOTEXIST99999' },
    })
    assert.equal(res.status, 404)
  })

  test('SN ที่ยังไม่ผูกผลิตภัณฑ์ → 409', async () => {
    const res = await post('/api/register', {
      body: { ...base, product_id: product.id, sn: 'TESTPUB0000001' },
    })
    assert.equal(res.status, 409)
    assert.match(res.json.error, /ยังไม่พร้อมให้ลงทะเบียน/)
  })

  test('SN ที่ลงทะเบียนไปแล้ว → 409', async () => {
    const res = await post('/api/register', {
      body: { ...base, product_id: product.id, sn: 'TESTPUB0000003' },
    })
    assert.equal(res.status, 409)
  })

  test('product_id ไม่ตรงกับเจ้าของ SN → 409 พร้อมชื่อผลิตภัณฑ์จริง', async () => {
    const other = await createProduct({ name: 'TEST ผลิตภัณฑ์อื่น' })
    const res = await post('/api/register', {
      body: { ...base, product_id: other.id, sn: 'TESTPUB0000002' },
    })
    assert.equal(res.status, 409)
    assert.match(res.json.error, /TEST ผลิตภัณฑ์ public/)
  })

  test('SN ที่ถูกยกเลิก (void) → 409', async () => {
    await makeSerial({ sn: 'TESTPUB0000004', productId: product.id, status: 'void' })
    const res = await post('/api/register', {
      body: { ...base, product_id: product.id, sn: 'TESTPUB0000004' },
    })
    assert.equal(res.status, 409)
    assert.match(res.json.error, /ยกเลิก/)
  })

  test('ลงทะเบียนสำเร็จ → 201 และ warranty_start/end ต้องยังเป็น null', async () => {
    await makeSerial({ sn: 'TESTPUB0000005', productId: product.id })
    const res = await post('/api/register', {
      body: { ...base, product_id: product.id, sn: 'TESTPUB0000005' },
    })
    assert.equal(res.status, 201)
    assert.equal(res.json.registration.warranty_start, null)
    assert.equal(res.json.registration.warranty_end, null)

    const row = await getRegistrationBySn('TESTPUB0000005')
    assert.equal(row.warranty_start, null, 'DB ต้องเก็บ NULL รอแอดมินกดเริ่มประกัน')
    assert.ok(row.consent_accepted_at, 'ต้องบันทึกเวลาที่ยอมรับเงื่อนไข (PDPA)')
  })

  test('ลงทะเบียนซ้ำ SN เดิม → 409', async () => {
    const res = await post('/api/register', {
      body: { ...base, product_id: product.id, sn: 'TESTPUB0000005' },
    })
    assert.equal(res.status, 409)
    assert.match(res.json.error, /ลงทะเบียนไปแล้ว/)
  })
})

describe('POST /api/issues — เคสพัง', () => {
  const form = (fields = {}) => {
    const f = new FormData()
    f.set('sn', fields.sn ?? 'TESTPUB0000003')
    f.set('phone', fields.phone ?? '0812345678')
    f.set('description', fields.description ?? 'มีปัญหาเครื่องไม่ทำงานเลยครับ ช่วยตรวจสอบให้ด้วย')
    for (const img of fields.images ?? []) f.append('images', img)
    for (const v of fields.videos ?? []) f.append('video', v)
    return f
  }
  const file = (name, type, size = 1024) =>
    new File([new Uint8Array(size)], name, { type })

  test('ไม่ใช่ multipart → 400', async () => {
    const res = await post('/api/issues', { body: { sn: 'x' } })
    assert.equal(res.status, 400)
  })

  test('description สั้นเกินไป → 400', async () => {
    const res = await post('/api/issues', { form: form({ description: 'สั้น' }) })
    assert.equal(res.status, 400)
  })

  test('แนบรูปเกิน 5 ไฟล์ → 400', async () => {
    const images = Array.from({ length: 6 }, (_, i) => file(`a${i}.jpg`, 'image/jpeg'))
    const res = await post('/api/issues', { form: form({ images }) })
    assert.equal(res.status, 400)
    assert.match(res.json.error, /5 รูป/)
  })

  test('แนบวิดีโอเกิน 1 คลิป → 400', async () => {
    const videos = [file('a.mp4', 'video/mp4'), file('b.mp4', 'video/mp4')]
    const res = await post('/api/issues', { form: form({ videos }) })
    assert.equal(res.status, 400)
    assert.match(res.json.error, /1 คลิป/)
  })

  test('ไฟล์ชนิดไม่รองรับ → 400', async () => {
    const res = await post('/api/issues', {
      form: form({ images: [file('a.pdf', 'application/pdf')] }),
    })
    assert.equal(res.status, 400)
  })

  test('ไฟล์รูปใหญ่เกิน 5MB → 400', async () => {
    const big = file('big.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1)
    const res = await post('/api/issues', { form: form({ images: [big] }) })
    assert.equal(res.status, 400)
  })

  test('SN ไม่มีในระบบ → 404', async () => {
    const res = await post('/api/issues', { form: form({ sn: 'NOTEXIST99999' }) })
    assert.equal(res.status, 404)
  })

  test('เบอร์ไม่ตรงกับเจ้าของ registration → 403', async () => {
    const res = await post('/api/issues', { form: form({ phone: '0899999999' }) })
    assert.equal(res.status, 403)
  })

  test('SN ที่ยังไม่เริ่มประกัน → 409 (กติกาแกนของระบบ)', async () => {
    const res = await post('/api/issues', {
      form: form({ sn: 'TESTPUB0000005', phone: '0812345678' }),
    })
    assert.equal(res.status, 409)
    assert.match(res.json.error, /ยังไม่เริ่มระยะเวลาประกัน/)
  })
})
