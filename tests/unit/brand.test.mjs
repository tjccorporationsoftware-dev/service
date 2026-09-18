// Unit test ของ lib/brand.ts — ตัวไล่เฉดสีแบรนด์ ไม่แตะ DB
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { writeFileSync } from 'node:fs'
import {
  BRAND_SHADES,
  DEFAULT_BRAND_PALETTE,
  buildBrandPalette,
  findCommentedHex,
  lightnessOf,
  normalizeHex,
  resolveBrand,
  whiteContrast,
} from '../../lib/brand.ts'

const HEX = /^#[0-9a-f]{6}$/
const channels = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))

// โทนสีหลากหลายรวมสุดขั้ว — เหลืองสด (chroma สูงสุด), เทา (chroma ศูนย์), ขาว, ดำ
const SAMPLE_COLORS = [
  '#3985c4', // ฟ้า ASCENT (ค่าเริ่มต้น)
  '#dc2626', // แดง
  '#ea580c', // ส้ม
  '#facc15', // เหลืองสด
  '#16a34a', // เขียว
  '#0891b2', // ฟ้าอมเขียว
  '#7c3aed', // ม่วง
  '#db2777', // ชมพู
  '#6b7280', // เทา
  '#ffffff',
  '#000000',
]

describe('normalizeHex', () => {
  test('รับทั้งแบบมีและไม่มี # คืนตัวพิมพ์เล็กเสมอ', () => {
    assert.equal(normalizeHex('#3985C4'), '#3985c4')
    assert.equal(normalizeHex('3985C4'), '#3985c4')
    assert.equal(normalizeHex('  #3985c4 '), '#3985c4')
  })

  test('รูปแบบผิด throw พร้อมข้อความไทย', () => {
    for (const bad of ['#fff', 'blue', '#12345g', '', '#1234567']) {
      assert.throws(() => normalizeHex(bad), /BRAND_COLOR_PRIMARY/)
    }
  })
})

describe('buildBrandPalette', () => {
  test('ใส่สี ASCENT แล้วได้ palette เริ่มต้นกลับมา (ต่างกันไม่เกิน 10/255 ต่อช่องสี)', () => {
    const { shades, adjusted } = buildBrandPalette('#3985c4')
    assert.equal(adjusted, false)
    assert.equal(shades[500], '#3985c4')
    for (const shade of BRAND_SHADES) {
      const got = channels(shades[shade])
      const want = channels(DEFAULT_BRAND_PALETTE[shade])
      got.forEach((v, i) =>
        assert.ok(
          Math.abs(v - want[i]) <= 10,
          `เฉด ${shade}: ได้ ${shades[shade]} คาด ${DEFAULT_BRAND_PALETTE[shade]}`
        )
      )
    }
  })

  test('ได้ครบ 10 เฉด รูปแบบ #rrggbb ทุกโทน', () => {
    for (const color of SAMPLE_COLORS) {
      const { shades } = buildBrandPalette(color)
      for (const shade of BRAND_SHADES) assert.match(shades[shade], HEX, `${color} เฉด ${shade}`)
    }
  })

  test('ความสว่างไล่ลงจาก 50 ไป 900 ทุกโทน (hover/active ต้องเข้มขึ้นจริง)', () => {
    for (const color of SAMPLE_COLORS) {
      const { shades } = buildBrandPalette(color)
      for (let i = 1; i < BRAND_SHADES.length; i++) {
        const lighter = lightnessOf(shades[BRAND_SHADES[i - 1]])
        const darker = lightnessOf(shades[BRAND_SHADES[i]])
        assert.ok(
          lighter - darker > 0.02,
          `${color}: เฉด ${BRAND_SHADES[i - 1]} (${lighter.toFixed(3)}) ต้องสว่างกว่า ${BRAND_SHADES[i]} (${darker.toFixed(3)}) ชัดเจน`
        )
      }
    }
  })

  test('ตัวหนังสือขาวบนเฉด 600/700/800 ผ่าน contrast 4.5:1 ทุกโทน (ปุ่มหลัก, กล่องโลโก้, หัวตาราง Excel)', () => {
    for (const color of SAMPLE_COLORS) {
      const { shades } = buildBrandPalette(color)
      for (const shade of [600, 700, 800]) {
        const ratio = whiteContrast(shades[shade])
        assert.ok(ratio >= 4.5, `${color} เฉด ${shade} = ${shades[shade]} ได้ ${ratio.toFixed(2)}:1`)
      }
    }
  })

  test('สีที่สว่างพอดีถูกใช้เป็นเฉด 500 ตรง ๆ — อ่อนหรือเข้มเกินจะถูกปรับและติดธง adjusted', () => {
    assert.equal(buildBrandPalette('#dc2626').adjusted, false)
    assert.equal(buildBrandPalette('#dc2626').shades[500], '#dc2626')

    const light = buildBrandPalette('#facc15')
    assert.equal(light.adjusted, true)
    assert.notEqual(light.shades[500], '#facc15')

    const dark = buildBrandPalette('#1a3855')
    assert.equal(dark.adjusted, true)
    assert.notEqual(dark.shades[500], '#1a3855')
  })
})

describe('resolveBrand', () => {
  test('ไม่ตั้ง env = ไม่ตั้งทับ — cssVars เป็น undefined และ shades เท่ากับค่าเริ่มต้น', () => {
    for (const env of [{}, { BRAND_COLOR_PRIMARY: '' }, { BRAND_COLOR_PRIMARY: '   ' }]) {
      const brand = resolveBrand(env)
      assert.equal(brand.configured, false)
      assert.equal(brand.colorPrimary, null)
      assert.equal(brand.cssVars, undefined)
      assert.deepEqual(brand.shades, DEFAULT_BRAND_PALETTE)
    }
  })

  test('ตั้ง env แล้วได้ cssVars ครบ 10 ตัว ชื่อตรงกับ token ใน globals.css', () => {
    const brand = resolveBrand({ BRAND_COLOR_PRIMARY: '#DC2626' })
    assert.equal(brand.configured, true)
    assert.equal(brand.colorPrimary, '#dc2626')
    assert.deepEqual(
      Object.keys(brand.cssVars),
      BRAND_SHADES.map((s) => `--color-brand-${s}`)
    )
    assert.equal(brand.cssVars['--color-brand-500'], '#dc2626')
    assert.equal(brand.cssVars['--color-brand-600'], brand.shades[600])
  })

  test('hex ผิดรูปแบบ throw ตั้งแต่ตอนอ่านค่า', () => {
    assert.throws(() => resolveBrand({ BRAND_COLOR_PRIMARY: 'blue' }), /BRAND_COLOR_PRIMARY/)
  })
})

describe('findCommentedHex — กับดัก # ในไฟล์ env', () => {
  const tmp = (content) => {
    const file = path.join(os.tmpdir(), `brand-env-${process.pid}-${Math.random().toString(36).slice(2)}.env`)
    writeFileSync(file, content)
    return file
  }

  test('=#rrggbb แบบไม่ครอบเครื่องหมายคำพูด ต้องถูกจับได้ (ทั้ง LF และ CRLF)', () => {
    assert.equal(findCommentedHex(tmp('DB_NAME=x\nBRAND_COLOR_PRIMARY=#B8860B\nPORT=1\n')), '#B8860B')
    assert.equal(findCommentedHex(tmp('DB_NAME=x\r\nBRAND_COLOR_PRIMARY=#b8860b\r\n')), '#b8860b')
  })

  test('รูปแบบที่ตัวโหลดอ่านได้ ต้องไม่ถูกจับ', () => {
    assert.equal(findCommentedHex(tmp('BRAND_COLOR_PRIMARY=B8860B\n')), null)
    assert.equal(findCommentedHex(tmp('BRAND_COLOR_PRIMARY="#B8860B"\n')), null)
    assert.equal(findCommentedHex(tmp('# BRAND_COLOR_PRIMARY=#B8860B (คอมเมนต์จริง)\n')), null)
  })

  test('ไม่มีไฟล์ = null', () => {
    assert.equal(findCommentedHex(path.join(os.tmpdir(), 'no-such-file.env')), null)
  })
})
