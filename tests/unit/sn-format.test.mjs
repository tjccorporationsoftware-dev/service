// Unit test ของ lib/sn-format.ts — โมดูลบริสุทธิ์ ไม่แตะ DB
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  SEQUENCE_PAD,
  snDateCode,
  buildStructuredSn,
  snPatternHint,
} from '../../lib/sn-format.ts'

const local = (y, m, d, hh = 0, mm = 0) => new Date(y, m - 1, d, hh, mm)

describe('snDateCode — YYMM จากเวลาท้องถิ่น', () => {
  test('ส.ค. 2026 → 2608', () => {
    assert.equal(snDateCode(local(2026, 8, 18)), '2608')
  })

  test('เติม 0 หน้าเดือนเลขหลักเดียว', () => {
    assert.equal(snDateCode(local(2026, 1, 15)), '2601')
    assert.equal(snDateCode(local(2026, 9, 15)), '2609')
  })

  test('ธ.ค. ไม่ทดเป็นเดือน 13', () => {
    assert.equal(snDateCode(local(2026, 12, 31)), '2612')
  })

  test('ปี 2000 → 00', () => {
    assert.equal(snDateCode(local(2000, 5, 1)), '0005')
  })

  // ── กับดัก timezone UTC+7 ───────────────────────────────────────────
  test('ตี 2 ของวันที่ 1 ก.ย. ต้องได้ 2609 ไม่ใช่ 2608', () => {
    // ถ้าโค้ดใช้ getUTCMonth() เครื่องไทย (UTC+7) จะยังเป็น 31 ส.ค. ตามเวลา UTC → ได้ 2608 ผิด
    assert.equal(snDateCode(local(2026, 9, 1, 2, 0)), '2609')
  })

  test('ตี 2 ของวันที่ 1 ม.ค. ต้องได้ปีใหม่ ไม่ใช่ปีเก่า', () => {
    assert.equal(snDateCode(local(2027, 1, 1, 2, 0)), '2701')
  })

  test('23:59 ของวันสิ้นเดือน ยังเป็นเดือนเดิม', () => {
    assert.equal(snDateCode(local(2026, 8, 31, 23, 59)), '2608')
  })
})

describe('buildStructuredSn — ประกอบรหัส SN', () => {
  test('รูปแบบตามเอกสาร B + 01 + 2608 + 000001', () => {
    assert.equal(buildStructuredSn('B', '01', 1, local(2026, 8, 18)), 'B012608000001')
  })

  test('เลขลำดับถูกเติม 0 ครบ 6 หลัก', () => {
    assert.equal(buildStructuredSn('B', '01', 42, local(2026, 8, 18)), 'B012608000042')
    assert.equal(buildStructuredSn('B', '01', 999999, local(2026, 8, 18)), 'B012608999999')
  })

  test('เลขลำดับเกิน 6 หลักไม่ถูกตัด (ยาวขึ้นแทน)', () => {
    assert.equal(buildStructuredSn('B', '01', 1000000, local(2026, 8, 18)), 'B0126081000000')
  })

  test('prefix / model_code หลายตัวอักษร', () => {
    assert.equal(buildStructuredSn('AB', 'XY9', 7, local(2026, 8, 18)), 'ABXY92608000007')
  })

  test('ความยาวมาตรฐาน = prefix + model + 4 + 6', () => {
    const sn = buildStructuredSn('B', '01', 1, local(2026, 8, 18))
    assert.equal(sn.length, 1 + 2 + 4 + SEQUENCE_PAD)
  })

  test('SN ในชุดเดียวกันเรียงต่อเนื่องและไม่ซ้ำ', () => {
    const stamped = local(2026, 8, 18)
    const list = Array.from({ length: 100 }, (_, i) => buildStructuredSn('B', '01', 1 + i, stamped))
    assert.equal(new Set(list).size, 100)
    assert.equal(list[0], 'B012608000001')
    assert.equal(list[99], 'B012608000100')
  })

  test('ตรึงวันที่ครั้งเดียวต่อชุด — SN ทุกตัวได้ YYMM เดียวกันแม้คร่อมสิ้นเดือน', () => {
    const stamped = local(2026, 8, 31, 23, 59)
    const list = Array.from({ length: 10 }, (_, i) => buildStructuredSn('B', '01', 1 + i, stamped))
    assert.ok(list.every((sn) => sn.slice(3, 7) === '2608'))
  })
})

describe('snPatternHint — ตัวอย่างที่โชว์ในหน้าจอ', () => {
  test('แทนเลขลำดับด้วย x ครบ 6 ตัว', () => {
    assert.equal(snPatternHint('B', '01', local(2026, 8, 18)), 'B012608xxxxxx')
  })

  test('ความยาวเท่ากับ SN จริงเสมอ (พรีวิวไม่หลอกตา)', () => {
    const d = local(2026, 8, 18)
    assert.equal(snPatternHint('AB', 'XY9', d).length, buildStructuredSn('AB', 'XY9', 1, d).length)
  })
})

describe('SN รูปแบบผิด — สิ่งที่โมดูลนี้ไม่ได้ตรวจ', () => {
  test('buildStructuredSn ไม่ตรวจ prefix ที่มีอักขระต้องห้าม', () => {
    // บันทึกพฤติกรรมจริง: การตรวจรูปแบบอยู่ที่ snSchemeSchema (zod) ไม่ใช่ที่นี่
    // ถ้าเรียกตรง ๆ ด้วยค่าสกปรก มันจะประกอบให้เฉย ๆ — ดู tests/unit/validations.test.mjs
    assert.equal(buildStructuredSn('B-', '0 1', 1, new Date(2026, 7, 18)), 'B-0 12608000001')
  })

  test('เลขลำดับติดลบไม่ถูกปฏิเสธ (ขอบเขตของ zod ไม่ใช่ของโมดูลนี้)', () => {
    // padStart เติม 0 ข้างหน้า '-1' → '0000-1' ทำให้ได้ SN ที่มีขีดกลางคาอยู่
    assert.equal(buildStructuredSn('B', '01', -1, new Date(2026, 7, 18)), 'B0126080000-1')
  })
})
