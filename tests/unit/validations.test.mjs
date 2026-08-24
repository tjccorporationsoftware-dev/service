// Unit test ของ lib/validations.ts — ครอบคลุม "SN รูปแบบผิด" ที่ sn-format.ts ไม่ได้ตรวจ
// (sn-format.ts เป็นตัวประกอบรหัสอย่างเดียว การตรวจรูปแบบอยู่ที่ zod ในไฟล์นี้)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  phoneSchema,
  snSchema,
  snSchemeSchema,
  snGenerateSchema,
  snImportSchema,
  snAssignProductSchema,
  registerSchema,
  startWarrantySchema,
  issueUpdateSchema,
  productSchema,
  UPLOAD_LIMITS,
  firstIssueMessage,
} from '../../lib/validations.ts'

const ok = (schema, value) => schema.safeParse(value).success
const err = (schema, value) => {
  const r = schema.safeParse(value)
  assert.equal(r.success, false, `ควรไม่ผ่าน: ${JSON.stringify(value)}`)
  return firstIssueMessage(r.error)
}

describe('snSchema — รูปแบบ Serial Number', () => {
  test('ค่าปกติผ่าน', () => {
    assert.equal(snSchema.parse('B012608000001'), 'B012608000001')
  })

  test('ตัดช่องว่างหัวท้ายและแปลงเป็นตัวพิมพ์ใหญ่', () => {
    assert.equal(snSchema.parse('  b012608000001  '), 'B012608000001')
  })

  test('สั้นกว่า 5 ตัว → ไม่ผ่าน', () => {
    for (const bad of ['', 'A', 'AB12', '   ']) {
      err(snSchema, bad)
    }
  })

  test('ยาวเกิน 50 ตัว → ไม่ผ่าน', () => {
    err(snSchema, 'A'.repeat(51))
  })

  test('ยาว 50 ตัวพอดี → ผ่าน', () => {
    assert.ok(ok(snSchema, 'A'.repeat(50)))
  })

  test('ชนิดข้อมูลผิด → ไม่ผ่าน', () => {
    for (const bad of [null, undefined, 123, {}, []]) {
      assert.equal(ok(snSchema, bad), false, `${JSON.stringify(bad)} ไม่ควรผ่าน`)
    }
  })
})

describe('snSchemeSchema — รูปแบบรหัส SN ที่แอดมินตั้ง', () => {
  const base = { label: 'ทดสอบ', prefix: 'B', model_code: '01', next_sequence: 1 }

  test('ค่าปกติผ่าน', () => {
    assert.ok(ok(snSchemeSchema, base))
  })

  test('แปลงเป็นตัวพิมพ์ใหญ่ให้', () => {
    assert.equal(snSchemeSchema.parse({ ...base, prefix: 'b' }).prefix, 'B')
  })

  test('prefix ที่มีอักขระต้องห้าม → ไม่ผ่าน', () => {
    for (const bad of ['B-', 'B 1', 'B_1', 'ก', 'B!', '']) {
      err(snSchemeSchema, { ...base, prefix: bad })
    }
  })

  test('model_code ที่มีอักขระต้องห้าม → ไม่ผ่าน', () => {
    for (const bad of ['0 1', '0-1', 'ก1', '']) {
      err(snSchemeSchema, { ...base, model_code: bad })
    }
  })

  test('prefix ยาวเกิน 10 → ไม่ผ่าน', () => {
    err(snSchemeSchema, { ...base, prefix: 'ABCDEFGHIJK' })
  })

  test('next_sequence ต่ำกว่า 1 → ไม่ผ่าน', () => {
    err(snSchemeSchema, { ...base, next_sequence: 0 })
    err(snSchemeSchema, { ...base, next_sequence: -1 })
  })

  test('label ว่าง → ไม่ผ่าน', () => {
    err(snSchemeSchema, { ...base, label: '   ' })
  })
})

describe('snGenerateSchema / snImportSchema / snAssignProductSchema — ขอบเขตจำนวน', () => {
  test('generate: quantity 1–1000 เท่านั้น', () => {
    assert.ok(ok(snGenerateSchema, { scheme_id: 1, quantity: 1, category: 'x' }))
    assert.ok(ok(snGenerateSchema, { scheme_id: 1, quantity: 1000, category: 'x' }))
    err(snGenerateSchema, { scheme_id: 1, quantity: 0, category: 'x' })
    err(snGenerateSchema, { scheme_id: 1, quantity: 1001, category: 'x' })
  })

  test('generate: scheme_id ต้องเป็นจำนวนเต็มบวก', () => {
    err(snGenerateSchema, { scheme_id: 0, quantity: 1, category: 'x' })
    err(snGenerateSchema, { scheme_id: -1, quantity: 1, category: 'x' })
  })

  test('generate: category ว่างไม่ได้', () => {
    err(snGenerateSchema, { scheme_id: 1, quantity: 1, category: '  ' })
  })

  test('import: sns ต้องมีอย่างน้อย 1 และไม่เกิน 1000', () => {
    assert.ok(ok(snImportSchema, { product_id: 1, sns: ['EXT-0001'], category: 'x' }))
    err(snImportSchema, { product_id: 1, sns: [], category: 'x' })
    err(snImportSchema, { product_id: 1, sns: Array(1001).fill('EXT-0001'), category: 'x' })
  })

  test('import: SN ในรายการที่รูปแบบผิดทำให้ทั้งชุดไม่ผ่าน', () => {
    err(snImportSchema, { product_id: 1, sns: ['EXT-0001', 'AB'], category: 'x' })
  })

  test('assign-product: เลือกได้ 1–500 รายการ', () => {
    assert.ok(ok(snAssignProductSchema, { serial_number_ids: [1], product_id: 1 }))
    err(snAssignProductSchema, { serial_number_ids: [], product_id: 1 })
    err(snAssignProductSchema, {
      serial_number_ids: Array.from({ length: 501 }, (_, i) => i + 1),
      product_id: 1,
    })
  })
})

describe('phoneSchema — เบอร์ไทย', () => {
  test('เบอร์ถูกต้อง', () => {
    assert.equal(phoneSchema.parse('0812345678'), '0812345678')
  })

  test('ไม่ขึ้นต้นด้วย 0 → ไม่ผ่าน', () => {
    err(phoneSchema, '812345678')
  })

  test('ความยาวไม่ใช่ 10 → ไม่ผ่าน', () => {
    err(phoneSchema, '081234567')
    err(phoneSchema, '08123456789')
  })

  test('มีขีดหรือเว้นวรรค → ไม่ผ่าน', () => {
    err(phoneSchema, '081-234-5678')
    err(phoneSchema, '081 234 5678')
  })

  test('ตัวเลขอารบิกอื่นหรือตัวอักษร → ไม่ผ่าน', () => {
    err(phoneSchema, '08123456ab')
  })
})

describe('registerSchema — ฟอร์มลงทะเบียนลูกค้า', () => {
  const valid = {
    customer_name: 'ทดสอบ ระบบ',
    phone: '0812345678',
    email: 'test@example.com',
    product_id: 1,
    sn: 'B012608000001',
    customer_reported_warranty_start: '2026-08-01',
    customer_reported_warranty_end: '2028-08-01',
    consent: true,
  }

  test('ค่าครบถ้วนผ่าน', () => {
    assert.ok(ok(registerSchema, valid))
  })

  test('consent ต้องเป็น true เท่านั้น', () => {
    err(registerSchema, { ...valid, consent: false })
    err(registerSchema, { ...valid, consent: undefined })
  })

  test('อีเมลผิดรูปแบบ → ไม่ผ่าน', () => {
    for (const bad of ['abc', 'a@', '@b.com', 'a b@c.com']) {
      err(registerSchema, { ...valid, email: bad })
    }
  })

  test('ชื่อว่าง → ไม่ผ่าน', () => {
    err(registerSchema, { ...valid, customer_name: '   ' })
  })

  test('วันที่ต้องเป็น YYYY-MM-DD', () => {
    for (const bad of ['01/08/2026', '2026-8-1', '', 'วันนี้']) {
      err(registerSchema, { ...valid, customer_reported_warranty_start: bad })
    }
  })

  test('วันที่สิ้นสุดก่อนวันเริ่ม — ควรถูกปฏิเสธ', () => {
    // ควรจะเป็น: ฟอร์มไม่ควรรับช่วงวันที่กลับหัว
    const r = registerSchema.safeParse({
      ...valid,
      customer_reported_warranty_start: '2028-08-01',
      customer_reported_warranty_end: '2026-08-01',
    })
    assert.equal(r.success, false, 'ช่วงวันที่กลับหัวไม่ควรผ่าน validation')
  })
})

describe('startWarrantySchema', () => {
  test('ไม่ส่ง start_date ได้ (= เริ่มวันนี้)', () => {
    assert.ok(ok(startWarrantySchema, { serial_number_ids: [1] }))
  })

  test('start_date ต้องเป็น YYYY-MM-DD', () => {
    err(startWarrantySchema, { serial_number_ids: [1], start_date: '01/08/2026' })
  })

  test('วันที่ไม่มีจริงควรถูกปฏิเสธตั้งแต่ schema', () => {
    // ควรจะเป็น: 30 ก.พ. ไม่มีอยู่จริง ไม่ควรผ่าน validation ไปให้ route handler จับ
    const r = startWarrantySchema.safeParse({ serial_number_ids: [1], start_date: '2026-02-30' })
    assert.equal(r.success, false, '2026-02-30 ไม่ควรผ่าน schema')
  })

  test('รายการว่าง / เกิน 500 → ไม่ผ่าน', () => {
    err(startWarrantySchema, { serial_number_ids: [] })
    err(startWarrantySchema, {
      serial_number_ids: Array.from({ length: 501 }, (_, i) => i + 1),
    })
  })
})

describe('productSchema', () => {
  const valid = { name: 'สินค้าทดสอบ', source_type: 'in_house' }

  test('ชื่ออย่างเดียวก็พอ', () => {
    assert.ok(ok(productSchema, { name: 'สินค้าทดสอบ' }))
  })

  test('source_type ไม่ส่ง → default in_house', () => {
    assert.equal(productSchema.parse({ name: 'x' }).source_type, 'in_house')
  })

  test('source_type นอก enum → ไม่ผ่าน', () => {
    err(productSchema, { ...valid, source_type: 'other' })
  })

  test('code ต้องเป็น A-Z 0-9 ยาว 2–10', () => {
    assert.ok(ok(productSchema, { ...valid, code: 'AB12' }))
    err(productSchema, { ...valid, code: 'A' })
    err(productSchema, { ...valid, code: 'AB-12' })
    err(productSchema, { ...valid, code: 'ABCDEFGHIJK' })
  })

  test('code ว่างได้ (จะถูกแปลงเป็น NULL ที่ฝั่ง API)', () => {
    assert.ok(ok(productSchema, { ...valid, code: '' }))
  })

  test('วันสิ้นสุดก่อนวันเริ่ม → ไม่ผ่าน', () => {
    const msg = err(productSchema, {
      ...valid,
      warranty_start_date: '2027-01-01',
      warranty_end_date: '2026-01-01',
    })
    assert.match(msg, /สิ้นสุด/)
  })

  test('ขอบเขตระยะประกัน', () => {
    err(productSchema, { ...valid, warranty_years: 51 })
    err(productSchema, { ...valid, warranty_months: 601 })
    err(productSchema, { ...valid, warranty_days: 3651 })
    err(productSchema, { ...valid, warranty_years: -1 })
  })
})

describe('issueUpdateSchema', () => {
  test('สถานะใน enum ผ่านทั้ง 4 ค่า', () => {
    for (const s of ['pending', 'in_progress', 'resolved', 'closed']) {
      assert.ok(ok(issueUpdateSchema, { status: s }))
    }
  })

  test('สถานะนอก enum → ไม่ผ่าน', () => {
    err(issueUpdateSchema, { status: 'done' })
  })

  test('admin_note ยาวเกิน 5000 → ไม่ผ่าน', () => {
    err(issueUpdateSchema, { status: 'pending', admin_note: 'ก'.repeat(5001) })
  })
})

describe('UPLOAD_LIMITS — ข้อจำกัดไฟล์แนบ', () => {
  test('รูปภาพ 5MB สูงสุด 5 รูป jpg/png', () => {
    assert.equal(UPLOAD_LIMITS.image.maxCount, 5)
    assert.equal(UPLOAD_LIMITS.image.maxSize, 5 * 1024 * 1024)
    assert.deepEqual([...UPLOAD_LIMITS.image.mimeTypes], ['image/jpeg', 'image/png'])
  })

  test('วิดีโอ 50MB 1 คลิป mp4', () => {
    assert.equal(UPLOAD_LIMITS.video.maxCount, 1)
    assert.equal(UPLOAD_LIMITS.video.maxSize, 50 * 1024 * 1024)
    assert.deepEqual([...UPLOAD_LIMITS.video.mimeTypes], ['video/mp4'])
  })
})

describe('firstIssueMessage', () => {
  test('คืนข้อความของ issue ตัวแรก', () => {
    const r = phoneSchema.safeParse('x')
    assert.equal(typeof firstIssueMessage(r.error), 'string')
    assert.ok(firstIssueMessage(r.error).length > 0)
  })
})
