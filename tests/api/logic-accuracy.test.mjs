// ตรวจ "ความถูกต้องของค่าที่คำนวณ/บันทึก" ไม่ใช่แค่ว่า endpoint ตอบ 200
// ครอบคลุม: ตัวเลขสรุปในหน้า dashboard, ตัวกรองต่าง ๆ, offset ของ pagination,
// ผลการค้นหา, และ flag in_warranty ตอนบันทึกเคส
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { get, post, loginAdmin } from '../helpers/client.mjs'
import { assertTestDatabase } from '../helpers/guard.mjs'
import { closeDb, resetAll, createProduct, db, q, q1 } from '../helpers/db.mjs'
import { toDateString } from '../../lib/warranty.ts'

let cookie
let product

const plusDays = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return toDateString(d)
}

/** สร้าง SN + registration ตามสถานะที่ต้องการ */
async function seed(sn, { status = 'available', phone = null, start = null, end = null } = {}) {
  const [s] = await db().query(
    'INSERT INTO serial_numbers (sn, product_id, status, category) VALUES (?, ?, ?, ?)',
    [sn, product.id, status, 'TEST acc']
  )
  if (status === 'registered') {
    await q(
      `INSERT INTO registrations (serial_number_id, phone, customer_name, email, warranty_start, warranty_end)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [s.insertId, phone, phone ? 'ทดสอบ' : null, phone ? 't@example.com' : null, start, end]
    )
  }
  return s.insertId
}

before(async () => {
  await assertTestDatabase()
  await resetAll()
  cookie = await loginAdmin()
  product = await createProduct({ name: 'TEST ผลิตภัณฑ์ accuracy', warranty_years: 2 })

  // ฉากที่ควบคุมได้ทั้งหมด — รวม 10 SN / 6 registration
  await seed('TESTACC0000001')                                                            // available
  await seed('TESTACC0000002')                                                            // available
  await seed('TESTACC0000003')                                                            // available
  await seed('TESTACC0000004', { status: 'void' })                                        // void
  await seed('TESTACC0000005', { status: 'registered', start: '2026-01-01', end: '2030-01-01' }) // started (ไม่มีเบอร์)
  await seed('TESTACC0000006', { status: 'registered', start: '2026-01-01', end: '2030-01-01' }) // started
  await seed('TESTACC0000007', { status: 'registered', phone: '0811111111', start: '2026-01-01', end: '2030-01-01' }) // active
  await seed('TESTACC0000008', { status: 'registered', phone: '0822222222', start: '2026-01-01', end: plusDays(10) }) // active + ใกล้หมด
  await seed('TESTACC0000009', { status: 'registered', phone: '0833333333', start: '2020-01-01', end: '2021-01-01' }) // หมดอายุ
  await seed('TESTACC0000010', { status: 'registered', phone: '0844444444' })             // ยังไม่เริ่มประกัน
})

after(async () => {
  await resetAll()
  await closeDb()
})

describe('GET /api/admin/stats — ตัวเลขต้องตรงกับความจริงใน DB', () => {
  test('สรุป serial_numbers', async () => {
    const { json } = await get('/api/admin/stats', { cookie })
    assert.deepEqual(json.serials, { total: 10, available: 3, registered: 6, void: 1 })
  })

  test('สรุปการรับประกัน', async () => {
    const { json } = await get('/api/admin/stats', { cookie })
    assert.equal(json.warranty.total, 6, 'registration ทั้งหมด')
    assert.equal(json.warranty.not_started, 1, 'ยังไม่เริ่มประกัน')
    assert.equal(json.warranty.active, 4, 'อยู่ในประกัน (ไม่นับที่ยังไม่เริ่มและที่หมดแล้ว)')
    assert.equal(json.warranty.expiring_soon, 1, 'ใกล้หมดใน 30 วัน')
  })

  test('ที่ยังไม่เริ่มประกันต้องไม่ถูกนับเป็น active', async () => {
    const { json } = await get('/api/admin/stats', { cookie })
    assert.ok(
      json.warranty.active + json.warranty.not_started <= json.warranty.total,
      'active + not_started ต้องไม่เกินทั้งหมด'
    )
  })

  test('ผลรวมย่อยของ serial ต้องเท่ากับ total', async () => {
    const { json } = await get('/api/admin/stats', { cookie })
    assert.equal(
      json.serials.available + json.serials.registered + json.serials.void,
      json.serials.total
    )
  })

  test('เป็นตัวเลขจริง ไม่ใช่ string จาก SUM()', async () => {
    const { json } = await get('/api/admin/stats', { cookie })
    for (const [k, v] of Object.entries(json.serials)) {
      assert.equal(typeof v, 'number', `serials.${k} ต้องเป็น number`)
    }
    for (const [k, v] of Object.entries(json.warranty)) {
      assert.equal(typeof v, 'number', `warranty.${k} ต้องเป็น number`)
    }
  })

  test('สรุปเคสตอนยังไม่มีเคสเลย ต้องเป็น 0 ไม่ใช่ null', async () => {
    const { json } = await get('/api/admin/stats', { cookie })
    assert.deepEqual(json.issues, {
      total: 0,
      pending: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0,
    })
  })
})

describe('ตัวกรองของ /api/admin/registrations ต้องคัดถูกจริง', () => {
  const totalOf = async (qs) => (await get(`/api/admin/registrations?${qs}`, { cookie })).json.meta.total

  test('ไม่กรอง = 6', async () => {
    assert.equal(await totalOf(''), 6)
  })

  test('warranty_status=active = 4', async () => {
    assert.equal(await totalOf('warranty_status=active'), 4)
  })

  test('warranty_status=expired = 1', async () => {
    assert.equal(await totalOf('warranty_status=expired'), 1)
  })

  test('warranty_status=not_started = 1', async () => {
    assert.equal(await totalOf('warranty_status=not_started'), 1)
  })

  test('สามสถานะรวมกันต้องได้ครบทุกแถว ไม่ซ้ำไม่ขาด', async () => {
    const sum =
      (await totalOf('warranty_status=active')) +
      (await totalOf('warranty_status=expired')) +
      (await totalOf('warranty_status=not_started'))
    assert.equal(sum, 6, 'ทุก registration ต้องตกอยู่ในสถานะใดสถานะหนึ่งพอดี')
  })

  test('กรองด้วยช่วงวันเริ่มประกันคัดถูก', async () => {
    assert.equal(await totalOf('warranty_start_from=2026-01-01&warranty_start_to=2026-12-31'), 4)
    assert.equal(await totalOf('warranty_start_from=2019-01-01&warranty_start_to=2021-12-31'), 1)
  })

  test('กรองด้วย product_id ที่ไม่มีจริง = 0', async () => {
    assert.equal(await totalOf('product_id=99999999'), 0)
  })
})

describe('ตัวกรองของ /api/admin/sn ต้องคัดถูกจริง', () => {
  const totalOf = async (qs) => (await get(`/api/admin/sn?${qs}`, { cookie })).json.meta.total

  test('ไม่กรอง = 10', async () => {
    assert.equal(await totalOf(''), 10)
  })

  test('status=available = 3', async () => {
    assert.equal(await totalOf('status=available'), 3)
  })

  test('status=void = 1', async () => {
    assert.equal(await totalOf('status=void'), 1)
  })

  test('status=started = 2 (แอดมินเริ่มประกันไว้ ยังไม่มีลูกค้า)', async () => {
    assert.equal(await totalOf('status=started'), 2)
  })

  test('status=registered = 4 (ลูกค้าผูกข้อมูลแล้ว)', async () => {
    assert.equal(await totalOf('status=registered'), 4)
  })

  test('สี่สถานะรวมกันต้องได้ 10 พอดี', async () => {
    const sum =
      (await totalOf('status=available')) +
      (await totalOf('status=void')) +
      (await totalOf('status=started')) +
      (await totalOf('status=registered'))
    assert.equal(sum, 10)
  })

  test('product_id=unassigned คัดเฉพาะที่ยังไม่ผูกผลิตภัณฑ์', async () => {
    await db().query(
      "INSERT INTO serial_numbers (sn, product_id, category) VALUES ('TESTACC0000099', NULL, 'TEST acc')"
    )
    assert.equal(await totalOf('product_id=unassigned'), 1)
    await q("DELETE FROM serial_numbers WHERE sn = 'TESTACC0000099'")
  })

  test('กรองด้วย category คัดถูก', async () => {
    assert.equal(await totalOf('category=TEST%20acc'), 10)
    assert.equal(await totalOf('category=ไม่มีหมวดนี้'), 0)
  })
})

describe('การค้นหาต้องคืนผลที่ตรงจริง', () => {
  test('ค้นด้วยส่วนหนึ่งของ SN เจอทุกตัวที่ตรง', async () => {
    const res = await get('/api/admin/sn?search=TESTACC', { cookie })
    assert.equal(res.json.meta.total, 10)
  })

  test('ค้นด้วย SN เต็มเจอตัวเดียว และเป็นตัวที่ถูก', async () => {
    const res = await get('/api/admin/sn?search=TESTACC0000007', { cookie })
    assert.equal(res.json.meta.total, 1)
    const rows = res.json.data ?? res.json.serials ?? []
    assert.equal(rows[0].sn, 'TESTACC0000007')
  })

  test('ค้นสิ่งที่ไม่มี = 0', async () => {
    assert.equal((await get('/api/admin/sn?search=ไม่มีแน่นอน', { cookie })).json.meta.total, 0)
  })

  test('ค้นด้วยตัวพิมพ์เล็กก็ต้องเจอ', async () => {
    const res = await get('/api/admin/sn?search=testacc0000007', { cookie })
    assert.equal(res.json.meta.total, 1, 'การค้นหา SN ควรไม่แคร์ตัวพิมพ์')
  })
})

describe('pagination — offset ต้องถูก ไม่ซ้ำไม่ขาด', () => {
  test('แบ่ง 10 แถวเป็นหน้าละ 4 แล้วรวมกลับได้ครบ ไม่มีตัวซ้ำ', async () => {
    const seen = []
    for (const page of [1, 2, 3]) {
      const res = await get(`/api/admin/sn?page=${page}&per_page=4`, { cookie })
      const rows = res.json.data ?? res.json.serials ?? []
      seen.push(...rows.map((r) => r.sn))
    }
    assert.equal(seen.length, 10, 'สามหน้ารวมกันต้องได้ครบ 10 แถว')
    assert.equal(new Set(seen).size, 10, 'ต้องไม่มีแถวซ้ำข้ามหน้า')
  })

  test('meta.total_pages คำนวณถูก', async () => {
    const res = await get('/api/admin/sn?per_page=4', { cookie })
    assert.equal(res.json.meta.total, 10)
    assert.equal(res.json.meta.total_pages, 3)
  })

  test('ขอหน้าที่เกินจำนวนจริง คืนรายการว่าง ไม่ error', async () => {
    const res = await get('/api/admin/sn?page=99&per_page=4', { cookie })
    assert.equal(res.status, 200)
    const rows = res.json.data ?? res.json.serials ?? []
    assert.equal(rows.length, 0)
  })
})

describe('in_warranty — flag ตอนบันทึกเคสต้องสะท้อนความจริง', () => {
  const report = async (sn, phone) => {
    const form = new FormData()
    form.set('sn', sn)
    form.set('phone', phone)
    form.set('description', 'ข้อความยาวพอสำหรับผ่านการตรวจของระบบแล้วครับ ทดสอบ')
    return post('/api/issues', { form })
  }

  test('แจ้งตอนยังอยู่ในประกัน → in_warranty = 1', async () => {
    const res = await report('TESTACC0000007', '0811111111')
    assert.equal(res.status, 201)
    const row = await q1('SELECT in_warranty FROM issue_reports ORDER BY id DESC LIMIT 1')
    assert.equal(Number(row.in_warranty), 1)
  })

  test('แจ้งตอนหมดประกันแล้ว → ยังแจ้งได้ แต่ in_warranty = 0', async () => {
    const res = await report('TESTACC0000009', '0833333333')
    assert.equal(res.status, 201, 'หมดประกันแล้วยังควรแจ้งเรื่องได้')
    const row = await q1('SELECT in_warranty FROM issue_reports ORDER BY id DESC LIMIT 1')
    assert.equal(Number(row.in_warranty), 0, 'ต้องบันทึกว่าอยู่นอกประกัน')
  })

  test('สรุปเคสใน stats ขยับตามจริง', async () => {
    const { json } = await get('/api/admin/stats', { cookie })
    assert.equal(json.issues.total, 2)
    assert.equal(json.issues.pending, 2)
  })

  test('recent_issues คืนข้อมูลที่ join ครบ ไม่มี null', async () => {
    const { json } = await get('/api/admin/stats', { cookie })
    assert.equal(json.recent_issues.length, 2)
    for (const i of json.recent_issues) {
      assert.ok(i.sn, 'ต้องมี sn')
      assert.ok(i.product_name, 'ต้องมีชื่อผลิตภัณฑ์')
    }
  })
})
