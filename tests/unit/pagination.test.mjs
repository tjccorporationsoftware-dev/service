// Unit test ของ lib/pagination.ts
// สำคัญเป็นพิเศษเพราะ LIMIT/OFFSET ถูกแปะลง SQL ตรง ๆ (mysql2 ไม่รับ placeholder ตรงนั้น)
// ค่าที่หลุดออกจากฟังก์ชันนี้ต้องเป็นจำนวนเต็มในช่วงที่กำหนดเสมอ ไม่มีข้อยกเว้น
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parsePagination, meta } from '../../lib/pagination.ts'

const parse = (qs) => parsePagination(new URLSearchParams(qs))

/** ทุกค่าที่จะถูกต่อลง SQL ต้องเป็นจำนวนเต็มจริง ๆ */
function assertSqlSafe(p) {
  for (const key of ['page', 'perPage', 'offset']) {
    assert.equal(typeof p[key], 'number', `${key} ต้องเป็น number`)
    assert.ok(Number.isInteger(p[key]), `${key} ต้องเป็นจำนวนเต็ม ได้ ${p[key]}`)
    assert.ok(Number.isFinite(p[key]), `${key} ต้องเป็นค่าจำกัด`)
    assert.ok(p[key] >= 0, `${key} ต้องไม่ติดลบ ได้ ${p[key]}`)
  }
}

describe('ค่าปกติ', () => {
  test('page=1 per_page=20', () => {
    assert.deepEqual(parse('page=1&per_page=20'), { page: 1, perPage: 20, offset: 0 })
  })

  test('คำนวณ offset ถูกต้อง', () => {
    assert.deepEqual(parse('page=3&per_page=20'), { page: 3, perPage: 20, offset: 40 })
    assert.deepEqual(parse('page=5&per_page=50'), { page: 5, perPage: 50, offset: 200 })
  })

  test('ไม่ส่งอะไรเลย → ค่าเริ่มต้น page=1 per_page=20', () => {
    assert.deepEqual(parse(''), { page: 1, perPage: 20, offset: 0 })
  })

  test('เปลี่ยน default per_page ได้', () => {
    assert.deepEqual(parsePagination(new URLSearchParams(''), 50), {
      page: 1,
      perPage: 50,
      offset: 0,
    })
  })
})

describe('ค่าติดลบและศูนย์ — ต้อง clamp ไม่ใช่ปล่อยผ่าน', () => {
  test('page=0 → 1', () => {
    assert.equal(parse('page=0').page, 1)
  })

  test('page=-5 → 1', () => {
    assert.equal(parse('page=-5').page, 1)
  })

  test('per_page=0 → 1', () => {
    assert.equal(parse('per_page=0').perPage, 1)
  })

  test('per_page=-100 → 1', () => {
    assert.equal(parse('per_page=-100').perPage, 1)
  })

  test('ค่าติดลบทั้งคู่ยังได้ offset ไม่ติดลบ', () => {
    const p = parse('page=-9&per_page=-9')
    assert.equal(p.offset, 0)
    assertSqlSafe(p)
  })
})

describe('ค่าเกินขอบเขต — ต้อง clamp เพดาน', () => {
  test('page=999999999 → 100000', () => {
    assert.equal(parse('page=999999999').page, 100_000)
  })

  test('per_page=9999 → 200', () => {
    assert.equal(parse('per_page=9999').perPage, 200)
  })

  test('per_page=201 → 200', () => {
    assert.equal(parse('per_page=201').perPage, 200)
  })

  test('per_page=200 ผ่านพอดี', () => {
    assert.equal(parse('per_page=200').perPage, 200)
  })

  test('offset ใหญ่สุดยังเป็นจำนวนเต็มที่ปลอดภัย', () => {
    const p = parse('page=999999999&per_page=9999')
    assert.deepEqual(p, { page: 100_000, perPage: 200, offset: 19_999_800 })
    assertSqlSafe(p)
  })
})

describe('ค่าที่ไม่ใช่ตัวเลข — ต้อง fallback ไม่ใช่ NaN', () => {
  // หมายเหตุ: '1e5000' ไม่อยู่ในลิสต์นี้เพราะ parseInt อ่านเลข 1 ข้างหน้าได้ → ได้ 1 ไม่ใช่ NaN
  // ซึ่งยังปลอดภัยกับ SQL อยู่ (ดูเทสต์ "ตัวเลขปนตัวอักษร" ด้านล่าง)
  const bad = ['abc', '', ' ', 'null', 'undefined', 'NaN', 'Infinity', '-Infinity', '٣']

  test('page ที่ parse ไม่ได้ → 1', () => {
    for (const v of bad) {
      const p = parse(`page=${encodeURIComponent(v)}`)
      assert.equal(p.page, 1, `page=${JSON.stringify(v)} ควรได้ 1 แต่ได้ ${p.page}`)
      assertSqlSafe(p)
    }
  })

  test('per_page ที่ parse ไม่ได้ → 20', () => {
    for (const v of bad) {
      const p = parse(`per_page=${encodeURIComponent(v)}`)
      assert.equal(p.perPage, 20, `per_page=${JSON.stringify(v)} ควรได้ 20 แต่ได้ ${p.perPage}`)
      assertSqlSafe(p)
    }
  })

  test('ทศนิยมถูกตัดเป็นจำนวนเต็ม', () => {
    assert.equal(parse('per_page=1.5').perPage, 1)
    assert.equal(parse('page=3.9').page, 3)
  })

  test('ตัวเลขปนตัวอักษร — parseInt อ่านส่วนหน้า', () => {
    assert.equal(parse('page=12abc').page, 12)
    assert.equal(parse('per_page=1e5000').perPage, 1)
    assertSqlSafe(parse('page=12abc&per_page=1e5000'))
  })

  test('ส่งพารามิเตอร์ซ้ำหลายตัว ใช้ตัวแรก', () => {
    assert.equal(parse('page=2&page=99').page, 2)
  })
})

describe('SQL injection ผ่าน LIMIT/OFFSET — ต้องเหลือแต่ตัวเลข', () => {
  const payloads = [
    '20; DROP TABLE serial_numbers--',
    "1 UNION SELECT * FROM admins",
    '1 OR 1=1',
    "1'; DELETE FROM registrations; --",
    '1/**/UNION/**/SELECT/**/1',
    '0x31',
  ]

  test('per_page ที่มี payload ไม่หลุดอักขระใด ๆ ออกไป', () => {
    for (const v of payloads) {
      const p = parse(`per_page=${encodeURIComponent(v)}`)
      assertSqlSafe(p)
      assert.ok(
        !String(p.perPage).match(/[^0-9]/),
        `perPage ต้องมีแต่ตัวเลข ได้ ${JSON.stringify(p.perPage)}`
      )
    }
  })

  test('page ที่มี payload ไม่หลุดอักขระใด ๆ ออกไป', () => {
    for (const v of payloads) {
      const p = parse(`page=${encodeURIComponent(v)}`)
      assertSqlSafe(p)
      assert.ok(!String(p.page).match(/[^0-9]/), `page ต้องมีแต่ตัวเลข ได้ ${JSON.stringify(p.page)}`)
    }
  })

  test('ประกอบเป็น SQL แล้วต้องไม่มีอักขระแปลกปลอม', () => {
    const p = parse('page=1 UNION SELECT&per_page=20; DROP TABLE x--')
    const sql = `SELECT * FROM t LIMIT ${p.perPage} OFFSET ${p.offset}`
    assert.equal(sql, 'SELECT * FROM t LIMIT 20 OFFSET 0')
  })
})

describe('meta — ข้อมูลหน้าที่ส่งกลับ client', () => {
  test('คำนวณจำนวนหน้าปกติ', () => {
    assert.deepEqual(meta(45, { page: 1, perPage: 20, offset: 0 }), {
      total: 45,
      page: 1,
      per_page: 20,
      total_pages: 3,
    })
  })

  test('ไม่มีข้อมูลเลย total_pages ต้องเป็น 1 ไม่ใช่ 0', () => {
    assert.equal(meta(0, { page: 1, perPage: 20, offset: 0 }).total_pages, 1)
  })

  test('พอดีหน้าเดียว', () => {
    assert.equal(meta(20, { page: 1, perPage: 20, offset: 0 }).total_pages, 1)
  })

  test('เกินไป 1 แถวต้องเพิ่มอีกหน้า', () => {
    assert.equal(meta(21, { page: 1, perPage: 20, offset: 0 }).total_pages, 2)
  })
})
