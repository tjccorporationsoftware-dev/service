// Unit test ของ lib/warranty.ts — ไม่แตะ DB และไม่แตะ dev server
// รัน: node --test tests/unit/
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  addMonths,
  addDuration,
  durationBetween,
  normalizeDuration,
  formatDuration,
  toDuration,
  toDateString,
  fromDateString,
  resolveWarrantyDuration,
  daysLeft,
  isInWarranty,
  warrantyState,
  maskPhone,
  caseNumber,
  snDisplayStatus,
} from '../../lib/warranty.ts'

/** สร้าง Date จากส่วนประกอบ "เวลาท้องถิ่น" เสมอ — ห้ามใช้ new Date('2026-08-18') ที่ตีความเป็น UTC */
const local = (y, m, d, hh = 0, mm = 0) => new Date(y, m - 1, d, hh, mm)

describe('addMonths — บวกเดือนแบบไม่ให้วันล้นเดือน', () => {
  test('บวกปกติ', () => {
    assert.equal(toDateString(addMonths(local(2026, 8, 15), 2)), '2026-10-15')
  })

  test('31 ม.ค. + 1 เดือน = 28 ก.พ. (ปีปกติ)', () => {
    assert.equal(toDateString(addMonths(local(2026, 1, 31), 1)), '2026-02-28')
  })

  test('31 ม.ค. + 1 เดือน = 29 ก.พ. (ปีอธิกสุรทิน 2028)', () => {
    assert.equal(toDateString(addMonths(local(2028, 1, 31), 1)), '2028-02-29')
  })

  test('31 พ.ค. + 1 เดือน = 30 มิ.ย.', () => {
    assert.equal(toDateString(addMonths(local(2026, 5, 31), 1)), '2026-06-30')
  })

  test('ข้ามปี', () => {
    assert.equal(toDateString(addMonths(local(2026, 11, 15), 3)), '2027-02-15')
  })

  test('บวก 0 เดือน = วันเดิม', () => {
    assert.equal(toDateString(addMonths(local(2026, 8, 18), 0)), '2026-08-18')
  })

  test('ไม่แก้ Date ตัวที่ส่งเข้าไป (ไม่ mutate)', () => {
    const original = local(2026, 1, 31)
    addMonths(original, 1)
    assert.equal(toDateString(original), '2026-01-31')
  })
})

describe('addDuration — บวกปี+เดือนก่อน แล้วค่อยบวกวัน', () => {
  test('1 ปี 6 เดือน จาก 1 ส.ค. 2026', () => {
    assert.equal(toDateString(addDuration(local(2026, 8, 1), { years: 1, months: 6, days: 0 })), '2028-02-01')
  })

  test('ลำดับการบวกสำคัญ — 31 ม.ค. + 1 เดือน 1 วัน = 1 มี.ค. (ผ่าน 28 ก.พ. ก่อน)', () => {
    assert.equal(toDateString(addDuration(local(2026, 1, 31), { years: 0, months: 1, days: 1 })), '2026-03-01')
  })

  test('บวกวันอย่างเดียวข้ามเดือน', () => {
    assert.equal(toDateString(addDuration(local(2026, 8, 25), { years: 0, months: 0, days: 10 })), '2026-09-04')
  })

  test('ระยะเป็น 0 ทั้งหมด = วันเดิม', () => {
    assert.equal(toDateString(addDuration(local(2026, 8, 18), { years: 0, months: 0, days: 0 })), '2026-08-18')
  })

  test('2 ปีข้าม 29 ก.พ.', () => {
    assert.equal(toDateString(addDuration(local(2028, 2, 29), { years: 1, months: 0, days: 0 })), '2029-02-28')
  })
})

describe('durationBetween — อินเวอร์สของ addDuration', () => {
  test('1 ม.ค. ถึง 31 ธ.ค. = 11 เดือน 30 วัน ไม่ใช่ 1 ปี', () => {
    assert.deepEqual(durationBetween(local(2026, 1, 1), local(2026, 12, 31)), {
      years: 0,
      months: 11,
      days: 30,
    })
  })

  test('ครบ 1 ปีพอดี', () => {
    assert.deepEqual(durationBetween(local(2026, 8, 1), local(2027, 8, 1)), {
      years: 1,
      months: 0,
      days: 0,
    })
  })

  test('ยังไม่ครบเดือน — 15 ม.ค. ถึง 10 ก.พ.', () => {
    assert.deepEqual(durationBetween(local(2026, 1, 15), local(2026, 2, 10)), {
      years: 0,
      months: 0,
      days: 26,
    })
  })

  test('end ก่อน start = 0 ทั้งหมด', () => {
    assert.deepEqual(durationBetween(local(2026, 8, 18), local(2026, 8, 1)), {
      years: 0,
      months: 0,
      days: 0,
    })
  })

  test('วันเดียวกัน = 0 ทั้งหมด', () => {
    assert.deepEqual(durationBetween(local(2026, 8, 18), local(2026, 8, 18)), {
      years: 0,
      months: 0,
      days: 0,
    })
  })

  test('คุณสมบัติอินเวอร์ส — addDuration(start, durationBetween(start, end)) = end', () => {
    const pairs = [
      [local(2026, 8, 1), local(2028, 2, 1)],
      [local(2026, 1, 1), local(2026, 12, 31)],
      [local(2026, 3, 15), local(2029, 7, 20)],
    ]
    for (const [start, end] of pairs) {
      assert.equal(
        toDateString(addDuration(start, durationBetween(start, end))),
        toDateString(end),
        `${toDateString(start)} → ${toDateString(end)}`
      )
    }
  })
})

describe('normalizeDuration / formatDuration', () => {
  test('18 เดือน → 1 ปี 6 เดือน', () => {
    assert.deepEqual(normalizeDuration({ years: 0, months: 18, days: 0 }), {
      years: 1,
      months: 6,
      days: 0,
    })
  })

  test('รวมปีกับเดือนก่อนทด', () => {
    assert.deepEqual(normalizeDuration({ years: 1, months: 13, days: 5 }), {
      years: 2,
      months: 1,
      days: 5,
    })
  })

  test('ข้อความไทยครบ 3 หน่วย', () => {
    assert.equal(formatDuration({ years: 1, months: 6, days: 15 }), '1 ปี 6 เดือน 15 วัน')
  })

  test('ตัดหน่วยที่เป็น 0 ออก', () => {
    assert.equal(formatDuration({ years: 2, months: 0, days: 0 }), '2 ปี')
    assert.equal(formatDuration({ years: 0, months: 6, days: 0 }), '6 เดือน')
  })

  test('ทดเดือนก่อนแสดงผล', () => {
    assert.equal(formatDuration({ years: 0, months: 18, days: 0 }), '1 ปี 6 เดือน')
  })

  test('ไม่มีระยะประกันเลย → —', () => {
    assert.equal(formatDuration({ years: 0, months: 0, days: 0 }), '—')
  })
})

describe('toDuration — อ่านระยะประกันจากแถว DB', () => {
  test('อ่านค่าปกติ', () => {
    assert.deepEqual(toDuration({ warranty_years: 1, warranty_months: 6, warranty_days: 0 }), {
      years: 1,
      months: 6,
      days: 0,
    })
  })

  test('null กลายเป็น 0', () => {
    assert.deepEqual(toDuration({ warranty_years: null, warranty_months: null, warranty_days: null }), {
      years: 0,
      months: 0,
      days: 0,
    })
  })

  test('ไม่มี field เลยก็ได้ 0', () => {
    assert.deepEqual(toDuration({}), { years: 0, months: 0, days: 0 })
  })

  test('ค่าที่มาเป็น string จาก driver ถูกแปลงเป็นตัวเลข', () => {
    assert.deepEqual(toDuration({ warranty_years: '2', warranty_months: '3', warranty_days: '4' }), {
      years: 2,
      months: 3,
      days: 4,
    })
  })
})

describe('toDateString — timezone UTC+7 (จุดที่พังง่ายที่สุด)', () => {
  test('เที่ยงคืนครึ่งตามเวลาท้องถิ่น ต้องได้วันของท้องถิ่น', () => {
    assert.equal(toDateString(local(2026, 8, 18, 0, 30)), '2026-08-18')
  })

  test('ตี 6 ครึ่ง (ยังอยู่ในช่วงที่ UTC เป็นเมื่อวานสำหรับ UTC+7)', () => {
    assert.equal(toDateString(local(2026, 8, 18, 6, 30)), '2026-08-18')
  })

  test('เกือบเที่ยงคืน 23:59 ยังเป็นวันเดิม', () => {
    assert.equal(toDateString(local(2026, 8, 18, 23, 59)), '2026-08-18')
  })

  test('วันแรกของเดือน ตี 2 — ต้องไม่ตกไปเดือนก่อน', () => {
    assert.equal(toDateString(local(2026, 9, 1, 2, 0)), '2026-09-01')
  })

  test('วันแรกของปี ตี 2 — ต้องไม่ตกไปปีก่อน', () => {
    assert.equal(toDateString(local(2026, 1, 1, 2, 0)), '2026-01-01')
  })

  test('เติม 0 นำหน้าเดือนและวันเสมอ', () => {
    assert.equal(toDateString(local(2026, 1, 5)), '2026-01-05')
  })

  test('ต่างจากผลของ toISOString จริง เมื่อเครื่องอยู่โซนบวก (พิสูจน์ว่ากับดักมีอยู่จริง)', (t) => {
    const d = local(2026, 8, 18, 0, 30)
    // getTimezoneOffset() ติดลบ = โซนบวก เช่น ไทย UTC+7 ได้ -420
    if (d.getTimezoneOffset() >= 0) {
      t.skip('เครื่องนี้ไม่ได้อยู่โซน UTC บวก จึงไม่เกิดกับดักนี้')
      return
    }
    assert.notEqual(d.toISOString().slice(0, 10), toDateString(d))
    assert.equal(toDateString(d), '2026-08-18')
  })
})

describe('fromDateString', () => {
  test('แปลงค่าถูกต้องเป็นเวลาท้องถิ่น (ไม่ใช่ UTC)', () => {
    const d = fromDateString('2026-08-18')
    assert.equal(d.getFullYear(), 2026)
    assert.equal(d.getMonth(), 7)
    assert.equal(d.getDate(), 18)
    assert.equal(d.getHours(), 0)
  })

  test('ไป-กลับกับ toDateString ได้ค่าเดิม', () => {
    assert.equal(toDateString(fromDateString('2028-02-29')), '2028-02-29')
  })

  test('รูปแบบผิด → null', () => {
    for (const bad of ['18/08/2026', '2026-8-18', '2026-08-18T00:00:00', 'abc', '']) {
      assert.equal(fromDateString(bad), null, `ควรได้ null สำหรับ ${JSON.stringify(bad)}`)
    }
  })

  test('null / undefined → null', () => {
    assert.equal(fromDateString(null), null)
    assert.equal(fromDateString(undefined), null)
  })

  test('วันที่ไม่มีจริง 2026-02-30 → ควรได้ null', () => {
    // 30 ก.พ. ไม่มีอยู่จริง ฟังก์ชันที่ทำหน้าที่ parse วันที่ควรปฏิเสธ ไม่ใช่เลื่อนไปเป็น 2 มี.ค.
    assert.equal(fromDateString('2026-02-30'), null)
  })
})

describe('resolveWarrantyDuration — ช่วงวันที่ชนะค่าปี/เดือน/วัน', () => {
  const fallback = { years: 9, months: 9, days: 9 }

  test('กรอกช่วงวันครบคู่ → คำนวณจากช่วงนั้น', () => {
    assert.deepEqual(resolveWarrantyDuration(fallback, '2026-08-01', '2027-08-01'), {
      years: 1,
      months: 0,
      days: 0,
    })
  })

  test('กรอกมาแค่วันเริ่ม → ใช้ค่าปี/เดือน/วันเดิม', () => {
    assert.deepEqual(resolveWarrantyDuration(fallback, '2026-08-01', null), fallback)
  })

  test('ไม่กรอกช่วงวันเลย → ใช้ค่าเดิม', () => {
    assert.deepEqual(resolveWarrantyDuration(fallback, null, null), fallback)
  })

  test('วันสิ้นสุดก่อนวันเริ่ม → ใช้ค่าเดิม', () => {
    assert.deepEqual(resolveWarrantyDuration(fallback, '2027-08-01', '2026-08-01'), fallback)
  })

  test('รูปแบบวันที่ผิด → ใช้ค่าเดิม', () => {
    assert.deepEqual(resolveWarrantyDuration(fallback, 'abc', '2027-08-01'), fallback)
  })
})

describe('daysLeft / isInWarranty / warrantyState', () => {
  test('วันหมดประกันวันนี้ = ยังอยู่ในประกัน (เหลือ 0 วัน)', () => {
    assert.equal(daysLeft('2026-08-18', local(2026, 8, 18, 15, 0)), 0)
    assert.equal(isInWarranty('2026-08-18', local(2026, 8, 18, 15, 0)), true)
  })

  test('วันถัดจากวันหมดประกัน = หมดแล้ว', () => {
    assert.equal(daysLeft('2026-08-18', local(2026, 8, 19, 1, 0)), -1)
    assert.equal(isInWarranty('2026-08-18', local(2026, 8, 19, 1, 0)), false)
  })

  test('ตี 1 ของวันหมดประกัน ยังอยู่ในประกัน (เทียบระดับวัน ไม่ใช่เวลา)', () => {
    assert.equal(isInWarranty('2026-08-18', local(2026, 8, 18, 1, 0)), true)
  })

  test('นับวันคงเหลือข้ามเดือน', () => {
    assert.equal(daysLeft('2026-09-01', local(2026, 8, 18, 12, 0)), 14)
  })

  test('warrantyState ครบ 3 สถานะ', () => {
    assert.equal(warrantyState(null), 'not_started')
    assert.equal(warrantyState('2026-08-18', local(2026, 8, 18)), 'active')
    assert.equal(warrantyState('2026-08-17', local(2026, 8, 18)), 'expired')
  })
})

describe('maskPhone — PDPA', () => {
  test('เบอร์ 10 หลักถูกปิดบัง', () => {
    assert.equal(maskPhone('0812345678'), '08x-xxx-5678')
  })

  test('ตัวเลข 4 ตัวท้ายยังเห็นได้', () => {
    assert.ok(maskPhone('0899999999').endsWith('9999'))
  })

  test('เลข 3 หลักกลางต้องไม่หลุด', () => {
    assert.ok(!maskPhone('0812345678').includes('234'))
  })

  test('ความยาวไม่ใช่ 10 → คืนค่าเดิม', () => {
    assert.equal(maskPhone('123'), '123')
    assert.equal(maskPhone(''), '')
  })
})

describe('caseNumber / snDisplayStatus', () => {
  test('caseNumber เติม 0 ครบ 6 หลัก', () => {
    assert.equal(caseNumber(12), 'CASE-000012')
    assert.equal(caseNumber(1), 'CASE-000001')
    assert.equal(caseNumber(1234567), 'CASE-1234567')
  })

  test('void และ available ไม่สนใจ phone', () => {
    assert.equal(snDisplayStatus('void', '0812345678'), 'void')
    assert.equal(snDisplayStatus('available', null), 'available')
  })

  test('registered + มีเบอร์ = ลูกค้าลงทะเบียนเองแล้ว', () => {
    assert.equal(snDisplayStatus('registered', '0812345678'), 'registered')
  })

  test('registered + ไม่มีเบอร์ = แอดมินเริ่มประกันตรง ยังไม่มีคน claim', () => {
    assert.equal(snDisplayStatus('registered', null), 'started')
  })
})
