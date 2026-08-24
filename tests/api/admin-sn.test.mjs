// /api/admin/sn-setup, /api/admin/sn/generate, /import, /assign-product, /api/admin/sn, /export
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { get, post, patch, freshIp, loginAdmin, AUTH_FAILURE_CASES, cookieFor } from '../helpers/client.mjs'
import { assertTestDatabase } from '../helpers/guard.mjs'
import {
  closeDb,
  resetAll,
  createProduct,
  createScheme,
  getScheme,
  getSerial,
  countRows,
  getAuditLogs,
  q,
} from '../helpers/db.mjs'
import { snDateCode } from '../../lib/sn-format.ts'

const IP = freshIp()
let cookie
let product

before(async () => {
  await assertTestDatabase()
  await resetAll()
  cookie = await loginAdmin()
  product = await createProduct({ name: 'TEST ผลิตภัณฑ์ SN', warranty_years: 2 })
})
after(async () => {
  await resetAll()
  await closeDb()
})

describe('auth มาตรฐานของทุก endpoint SN', () => {
  const endpoints = [
    ['GET', '/api/admin/sn-setup'],
    ['POST', '/api/admin/sn-setup'],
    ['PATCH', '/api/admin/sn-setup'],
    ['POST', '/api/admin/sn/generate'],
    ['POST', '/api/admin/sn/import'],
    ['POST', '/api/admin/sn/assign-product'],
    ['GET', '/api/admin/sn'],
    ['GET', '/api/admin/sn/export'],
  ]

  for (const [method, path] of endpoints) {
    for (const c of AUTH_FAILURE_CASES) {
      test(`${method} ${path} — ${c.name} → 401`, async () => {
        const fn = method === 'GET' ? get : method === 'POST' ? post : patch
        // GET แนบ body ไม่ได้ — fetch จะ throw ก่อนถึง server
        const opts = { cookie: await cookieFor(c) }
        if (method !== 'GET') opts.body = {}
        const res = await fn(path, opts)
        assert.equal(res.status, 401)
      })
    }
  }
})

describe('POST /api/admin/sn-setup — สร้างรูปแบบรหัส', () => {
  test('สร้างสำเร็จ → 201', async () => {
    const res = await post('/api/admin/sn-setup', {
      cookie,
      body: { label: 'TEST scheme A', prefix: 'TA', model_code: '01', next_sequence: 1 },
    })
    assert.equal(res.status, 201)
  })

  test('prefix มีอักขระต้องห้าม → 400', async () => {
    for (const prefix of ['T-', 'T A', 'ก', '']) {
      const res = await post('/api/admin/sn-setup', {
        cookie,
        body: { label: 'TEST bad', prefix, model_code: '01', next_sequence: 1 },
      })
      assert.equal(res.status, 400, `prefix=${JSON.stringify(prefix)} ควรถูกปฏิเสธ`)
    }
  })

  test('next_sequence ต่ำกว่า 1 → 400', async () => {
    const res = await post('/api/admin/sn-setup', {
      cookie,
      body: { label: 'TEST bad seq', prefix: 'TB', model_code: '01', next_sequence: 0 },
    })
    assert.equal(res.status, 400)
  })

  test('คู่ prefix+model_code ซ้ำ → 409', async () => {
    const res = await post('/api/admin/sn-setup', {
      cookie,
      body: { label: 'TEST ซ้ำ', prefix: 'TA', model_code: '01', next_sequence: 1 },
    })
    assert.equal(res.status, 409)
  })
})

describe('PATCH /api/admin/sn-setup', () => {
  test('ไม่ส่ง id → 400', async () => {
    const res = await patch('/api/admin/sn-setup', {
      cookie,
      body: { label: 'TEST x', prefix: 'TC', model_code: '01', next_sequence: 1 },
    })
    assert.equal(res.status, 400)
  })

  test('id ไม่มีจริง → 404', async () => {
    const res = await patch('/api/admin/sn-setup', {
      cookie,
      body: { id: 9999999, label: 'TEST x', prefix: 'TC', model_code: '01', next_sequence: 1 },
    })
    assert.equal(res.status, 404)
  })

  test('แก้ไขสำเร็จ → 200', async () => {
    const s = await createScheme({ label: 'TEST แก้ได้', prefix: 'TD', model_code: '01' })
    const res = await patch('/api/admin/sn-setup', {
      cookie,
      body: { id: s.id, label: 'TEST แก้แล้ว', prefix: 'TD', model_code: '01', next_sequence: 5 },
    })
    assert.equal(res.status, 200)
    assert.equal((await getScheme(s.id)).next_sequence, 5)
  })
})

describe('POST /api/admin/sn/generate', () => {
  let scheme

  before(async () => {
    scheme = await createScheme({ label: 'TEST gen', prefix: 'TG', model_code: '01', next_sequence: 1 })
  })

  test('quantity = 0 → 400', async () => {
    const res = await post('/api/admin/sn/generate', {
      cookie,
      body: { scheme_id: scheme.id, quantity: 0, category: 'TEST' },
    })
    assert.equal(res.status, 400)
  })

  test('quantity > 1000 → 400', async () => {
    const res = await post('/api/admin/sn/generate', {
      cookie,
      body: { scheme_id: scheme.id, quantity: 1001, category: 'TEST' },
    })
    assert.equal(res.status, 400)
  })

  test('category ว่าง → 400', async () => {
    const res = await post('/api/admin/sn/generate', {
      cookie,
      body: { scheme_id: scheme.id, quantity: 1, category: '   ' },
    })
    assert.equal(res.status, 400)
  })

  test('scheme_id ไม่มีจริง → 404', async () => {
    const res = await post('/api/admin/sn/generate', {
      cookie,
      body: { scheme_id: 9999999, quantity: 1, category: 'TEST' },
    })
    assert.equal(res.status, 404)
  })

  test('สร้างสำเร็จ → 201 พร้อม batch_id และ SN ตามสูตร', async () => {
    const res = await post('/api/admin/sn/generate', {
      cookie,
      body: { scheme_id: scheme.id, quantity: 3, category: 'TEST หมวด' },
    })
    assert.equal(res.status, 201)
    assert.ok(res.json.batch_id)
    assert.equal(res.json.serials.length, 3)

    const yymm = snDateCode()
    assert.equal(res.json.serials[0].sn, `TG01${yymm}000001`)
    assert.equal(res.json.serials[2].sn, `TG01${yymm}000003`)
  })

  test('SN ที่สร้างใหม่ยังไม่ผูกผลิตภัณฑ์และสถานะ available', async () => {
    const row = await getSerial(`TG01${snDateCode()}000001`)
    assert.equal(row.product_id, null)
    assert.equal(row.status, 'available')
    assert.equal(row.category, 'TEST หมวด')
  })

  test('next_sequence เดินหน้าตามจำนวนที่สร้าง', async () => {
    assert.equal((await getScheme(scheme.id)).next_sequence, 4)
  })

  test('บันทึก audit log', async () => {
    const logs = await getAuditLogs('sn.generate')
    assert.ok(logs.length >= 1, 'ต้องมี audit log ของการ generate')
  })

  test('SN ทั้งชุดได้ YYMM เดียวกัน', async () => {
    const res = await post('/api/admin/sn/generate', {
      cookie,
      body: { scheme_id: scheme.id, quantity: 50, category: 'TEST ชุดใหญ่' },
    })
    const codes = new Set(res.json.serials.map((s) => s.sn.slice(4, 8)))
    assert.equal(codes.size, 1, 'ต้องตรึงวันที่ครั้งเดียวต่อชุด')
  })

  test('ยิงพร้อมกัน 2 request ไม่ทำให้เลขลำดับชนกัน', async () => {
    const s = await createScheme({ label: 'TEST race', prefix: 'TR', model_code: '01', next_sequence: 1 })
    const [a, b] = await Promise.all([
      post('/api/admin/sn/generate', {
        cookie,
        body: { scheme_id: s.id, quantity: 20, category: 'TEST race' },
      }),
      post('/api/admin/sn/generate', {
        cookie,
        body: { scheme_id: s.id, quantity: 20, category: 'TEST race' },
      }),
    ])
    assert.equal(a.status, 201)
    assert.equal(b.status, 201)

    const all = [...a.json.serials, ...b.json.serials].map((x) => x.sn)
    assert.equal(new Set(all).size, 40, 'SN ต้องไม่ซ้ำกันเลย')
    assert.equal((await getScheme(s.id)).next_sequence, 41)
  })

  test('เลขลำดับที่ชนกับ SN เดิม → 500 พร้อมข้อความให้ไปแก้', async () => {
    const s = await createScheme({ label: 'TEST dup', prefix: 'TU', model_code: '01', next_sequence: 1 })
    await post('/api/admin/sn/generate', {
      cookie,
      body: { scheme_id: s.id, quantity: 2, category: 'TEST' },
    })
    await q('UPDATE sn_schemes SET next_sequence = 1 WHERE id = ?', [s.id])

    const res = await post('/api/admin/sn/generate', {
      cookie,
      body: { scheme_id: s.id, quantity: 2, category: 'TEST' },
    })
    assert.equal(res.status, 500)
    assert.match(res.json.error, /เลขลำดับ/)
  })
})

describe('POST /api/admin/sn/import', () => {
  test('sns ว่าง → 400', async () => {
    const res = await post('/api/admin/sn/import', {
      cookie,
      body: { product_id: product.id, sns: [], category: 'TEST' },
    })
    assert.equal(res.status, 400)
  })

  test('product_id ไม่มีจริง → 404', async () => {
    const res = await post('/api/admin/sn/import', {
      cookie,
      body: { product_id: 9999999, sns: ['TESTIMP00001'], category: 'TEST' },
    })
    assert.equal(res.status, 404)
  })

  test('นำเข้าสำเร็จ → 201 และผูกผลิตภัณฑ์ทันที', async () => {
    const res = await post('/api/admin/sn/import', {
      cookie,
      body: { product_id: product.id, sns: ['TESTIMP00001', 'TESTIMP00002'], category: 'TEST นอก' },
    })
    assert.equal(res.status, 201)
    assert.equal(res.json.imported, 2)
    assert.equal(res.json.skipped, 0)

    const row = await getSerial('TESTIMP00001')
    assert.equal(row.product_id, product.id, 'import ต้องผูกผลิตภัณฑ์ทันที ไม่เหมือน generate')
    assert.equal(row.scheme_id, null)
  })

  test('SN ซ้ำถูกข้าม ไม่ error (INSERT IGNORE)', async () => {
    const res = await post('/api/admin/sn/import', {
      cookie,
      body: { product_id: product.id, sns: ['TESTIMP00001', 'TESTIMP00003'], category: 'TEST นอก' },
    })
    assert.equal(res.status, 201)
    assert.equal(res.json.imported, 1)
    assert.equal(res.json.skipped, 1)
  })
})

describe('POST /api/admin/sn/assign-product', () => {
  test('รายการว่าง → 400', async () => {
    const res = await post('/api/admin/sn/assign-product', {
      cookie,
      body: { serial_number_ids: [], product_id: product.id },
    })
    assert.equal(res.status, 400)
  })

  test('เกิน 500 รายการ → 400', async () => {
    const res = await post('/api/admin/sn/assign-product', {
      cookie,
      body: {
        serial_number_ids: Array.from({ length: 501 }, (_, i) => i + 1),
        product_id: product.id,
      },
    })
    assert.equal(res.status, 400)
  })

  test('product_id ไม่มีจริง → 404', async () => {
    const sn = await getSerial(`TG01${snDateCode()}000001`)
    const res = await post('/api/admin/sn/assign-product', {
      cookie,
      body: { serial_number_ids: [sn.id], product_id: 9999999 },
    })
    assert.equal(res.status, 404)
  })

  test('ผูกสำเร็จ → 200', async () => {
    const a = await getSerial(`TG01${snDateCode()}000001`)
    const b = await getSerial(`TG01${snDateCode()}000002`)
    const res = await post('/api/admin/sn/assign-product', {
      cookie,
      body: { serial_number_ids: [a.id, b.id], product_id: product.id },
    })
    assert.equal(res.status, 200)
    assert.equal((await getSerial(a.sn)).product_id, product.id)
  })
})

describe('GET /api/admin/sn', () => {
  test('คืน 200 พร้อม meta', async () => {
    const res = await get('/api/admin/sn?page=1&per_page=20', { cookie })
    assert.equal(res.status, 200)
    assert.ok(res.json.meta, 'ต้องมี meta')
    assert.equal(res.json.meta.page, 1)
    assert.equal(res.json.meta.per_page, 20)
  })

  test('กรองด้วย category ได้', async () => {
    const res = await get('/api/admin/sn?category=TEST%20%E0%B8%99%E0%B8%AD%E0%B8%81', {
      cookie,
    })
    assert.equal(res.status, 200)
  })

  test('search ที่เป็น SQL injection ไม่คืนทั้งตาราง', async () => {
    const all = await get('/api/admin/sn', { cookie })
    const inject = await get(`/api/admin/sn?search=${encodeURIComponent("' OR '1'='1")}`, {
      cookie,
    })
    assert.equal(inject.status, 200)
    assert.ok(
      inject.json.meta.total < all.json.meta.total,
      'payload injection ต้องไม่ทำให้คืนทั้งตาราง'
    )
  })

  test('ตารางยังอยู่ครบหลังยิง injection', async () => {
    assert.ok((await countRows('serial_numbers')) > 0)
  })
})

describe('GET /api/admin/sn/export', () => {
  test('คืนไฟล์ xlsx', async () => {
    const res = await get('/api/admin/sn/export', { cookie, raw: true })
    assert.equal(res.status, 200)
    assert.match(res.contentType, /spreadsheetml|octet-stream/)
    assert.equal(res.buffer.subarray(0, 2).toString(), 'PK', 'xlsx เป็นไฟล์ zip ต้องขึ้นต้นด้วย PK')
  })

  test('ค่าที่ขึ้นต้นด้วย = ต้องไม่กลายเป็นสูตร (formula injection)', async () => {
    const evil = await createProduct({ name: '=HYPERLINK("http://evil.example.com","x")' })
    await post('/api/admin/sn/import', {
      cookie,
      body: { product_id: evil.id, sns: ['TESTEVIL0001'], category: '@SUM(1+1)' },
    })

    const res = await get('/api/admin/sn/export', { cookie, raw: true })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(res.buffer)
    const sheet = wb.getWorksheet('Serial Number')

    let checked = 0
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === 'string' && /^[=+\-@]/.test(cell.value)) {
          checked++
          assert.equal(
            cell.type,
            ExcelJS.ValueType.String,
            `cell ที่ขึ้นต้นด้วยอักขระสูตรต้องเป็น string ไม่ใช่ formula: ${cell.value}`
          )
          assert.ok(!cell.formula, `cell ต้องไม่มี formula: ${cell.value}`)
        }
      })
    })
    assert.ok(checked > 0, 'ต้องมี cell ที่ขึ้นต้นด้วยอักขระสูตรให้ตรวจอย่างน้อย 1 ตัว')
  })

  test('SN ที่เป็นตัวเลขล้วนยังเก็บ 0 นำหน้าไว้', async () => {
    await post('/api/admin/sn/import', {
      cookie,
      body: { product_id: product.id, sns: ['0012608000001'], category: 'TEST zero' },
    })
    const res = await get('/api/admin/sn/export', { cookie, raw: true })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(res.buffer)
    const sheet = wb.getWorksheet('Serial Number')

    let found = false
    sheet.eachRow((row) => {
      const v = row.getCell(2).value
      if (String(v) === '0012608000001') found = true
    })
    assert.ok(found, '0 นำหน้าต้องไม่หาย')
  })

  test('มีชีต "ข้อมูลการส่งออก" พร้อมชื่อผู้ส่งออก', async () => {
    const res = await get('/api/admin/sn/export', { cookie, raw: true })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(res.buffer)
    assert.ok(wb.getWorksheet('ข้อมูลการส่งออก'), 'ต้องมีชีตข้อมูลการส่งออก')
  })

  test('export ตอนไม่มีข้อมูลเลยก็เปิดไฟล์ได้', async () => {
    const res = await get('/api/admin/sn/export?batch_id=ไม่มีอยู่จริง', {
      cookie,
      raw: true,
    })
    assert.equal(res.status, 200)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(res.buffer)
    assert.ok(wb.getWorksheet('Serial Number'))
  })
})
