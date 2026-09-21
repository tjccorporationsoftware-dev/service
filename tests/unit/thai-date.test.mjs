// Unit test ของ lib/thai-date.ts — ไม่แตะ DB และไม่แตะ dev server
// รัน: node --test tests/unit/
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  BE_OFFSET,
  daysInMonth,
  parseIso,
  formatIso,
  todayIso,
  isoToThai,
  thaiToIso,
  maskThaiDateInput,
  shiftMonth,
  isWithinRange,
} from '../../lib/thai-date.ts'

describe('parseIso / formatIso', () => {
  test('อ่าน ISO ที่ถูกต้อง', () => {
    assert.deepEqual(parseIso('2026-09-18'), { year: 2026, month: 9, day: 18 })
  })
  test('ปฏิเสธรูปแบบผิดและวันที่ที่ไม่มีจริง', () => {
    for (const bad of ['', null, undefined, '2026-9-18', '18/09/2026', '2026-13-01', '2026-02-30', '2026-04-31', '2025-02-29']) {
      assert.equal(parseIso(bad), null, `ต้องปฏิเสธ ${JSON.stringify(bad)}`)
    }
  })
  test('ปีอธิกสุรทิน 29 ก.พ. ผ่าน', () => {
    assert.deepEqual(parseIso('2024-02-29'), { year: 2024, month: 2, day: 29 })
    assert.equal(daysInMonth(2024, 2), 29)
    assert.equal(daysInMonth(2100, 2), 28, 'ปี 2100 หาร 100 ลงตัวแต่ไม่หาร 400 → ไม่ใช่อธิกสุรทิน')
  })
  test('formatIso เติมศูนย์ให้ครบ', () => {
    assert.equal(formatIso({ year: 2026, month: 1, day: 5 }), '2026-01-05')
    assert.equal(formatIso(parseIso('2026-09-18')), '2026-09-18')
  })
  test('todayIso ใช้ local time ไม่ใช่ UTC', () => {
    // 00:30 ตามเวลาเครื่อง — ถ้าใช้ toISOString() จะได้วันก่อนหน้า (เครื่องอยู่ UTC+7)
    assert.equal(todayIso(new Date(2026, 8, 18, 0, 30)), '2026-09-18')
    assert.equal(todayIso(new Date(2026, 11, 31, 23, 59)), '2026-12-31')
  })
})

describe('isoToThai — แสดงเป็น พ.ศ.', () => {
  test('บวก 543 และเรียง วัน/เดือน/ปี', () => {
    assert.equal(BE_OFFSET, 543)
    assert.equal(isoToThai('2026-09-18'), '18/09/2569')
    assert.equal(isoToThai('2026-01-05'), '05/01/2569')
  })
  test('ค่าว่างหรือผิดรูปแบบ → ข้อความว่าง (ไม่ throw)', () => {
    assert.equal(isoToThai(''), '')
    assert.equal(isoToThai(null), '')
    assert.equal(isoToThai('2026-02-30'), '')
  })
})

describe('thaiToIso — อ่านสิ่งที่ผู้ใช้พิมพ์', () => {
  test('พ.ศ. → ค.ศ.', () => {
    assert.equal(thaiToIso('18/09/2569'), '2026-09-18')
    assert.equal(thaiToIso('05/01/2569'), '2026-01-05')
  })
  test('ยอมให้ไม่เติมศูนย์ / ตัวเลขล้วน 8 หลัก / มีช่องว่างรอบ', () => {
    assert.equal(thaiToIso('5/1/2569'), '2026-01-05')
    assert.equal(thaiToIso('18092569'), '2026-09-18')
    assert.equal(thaiToIso('  18/09/2569  '), '2026-09-18')
  })
  test('ผู้ใช้เผลอพิมพ์ ค.ศ. → รับให้ ไม่ลบ 543 ซ้ำ', () => {
    assert.equal(thaiToIso('18/09/2026'), '2026-09-18')
    assert.equal(thaiToIso('01/01/1999'), '1999-01-01')
  })
  test('ยังพิมพ์ไม่ครบ / ไม่ใช่วันที่จริง / ปีต่ำเกิน → null', () => {
    for (const bad of ['', null, '18/09', '18/09/25', '18/09/256', '30/02/2569', '31/04/2569', '32/01/2569', '00/01/2569', '18/13/2569', '01/01/1800', 'abc']) {
      assert.equal(thaiToIso(bad), null, `ต้องปฏิเสธ ${JSON.stringify(bad)}`)
    }
  })
  test('ไป-กลับได้ค่าเดิม', () => {
    for (const iso of ['2026-09-18', '2024-02-29', '2000-01-01', '2099-12-31']) {
      assert.equal(thaiToIso(isoToThai(iso)), iso)
    }
  })
})

describe('maskThaiDateInput — จัดรูประหว่างพิมพ์', () => {
  test('แทรก / ให้เองตามจำนวนหลัก', () => {
    assert.equal(maskThaiDateInput(''), '')
    assert.equal(maskThaiDateInput('1'), '1')
    assert.equal(maskThaiDateInput('18'), '18')
    assert.equal(maskThaiDateInput('180'), '18/0')
    assert.equal(maskThaiDateInput('1809'), '18/09')
    assert.equal(maskThaiDateInput('18092'), '18/09/2')
    assert.equal(maskThaiDateInput('18092569'), '18/09/2569')
  })
  test('ทิ้งตัวอักษรที่ไม่ใช่ตัวเลขและตัดเกิน 8 หลัก', () => {
    assert.equal(maskThaiDateInput('18/09/2569'), '18/09/2569')
    assert.equal(maskThaiDateInput('18-09-2569'), '18/09/2569')
    assert.equal(maskThaiDateInput('18/09/25699'), '18/09/2569')
    assert.equal(maskThaiDateInput('ab18cd09'), '18/09')
  })
})

describe('shiftMonth', () => {
  test('ข้ามปีทั้งสองทิศ', () => {
    assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 })
    assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 })
    assert.deepEqual(shiftMonth(2026, 9, 0), { year: 2026, month: 9 })
    assert.deepEqual(shiftMonth(2026, 9, -24), { year: 2024, month: 9 })
    assert.deepEqual(shiftMonth(2026, 3, -3), { year: 2025, month: 12 })
  })
})

describe('isWithinRange', () => {
  test('เทียบกับ min/max แบบรวมขอบ', () => {
    assert.equal(isWithinRange('2026-09-18', '2026-09-18', '2026-09-18'), true)
    assert.equal(isWithinRange('2026-09-17', '2026-09-18', undefined), false)
    assert.equal(isWithinRange('2026-09-19', undefined, '2026-09-18'), false)
    assert.equal(isWithinRange('2026-09-18'), true)
  })
  test('min/max ที่ผิดรูปแบบถูกมองข้าม ไม่ทำให้ทุกวันใช้ไม่ได้', () => {
    assert.equal(isWithinRange('2026-09-18', 'garbage', ''), true)
  })
})
