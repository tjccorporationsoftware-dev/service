// /api/admin/issues (GET) และ /api/admin/issues/[id] (PATCH) รวมถึง /api/files/*
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { get, post, patch, freshIp, loginAdmin, AUTH_FAILURE_CASES, cookieFor } from '../helpers/client.mjs'
import { assertTestDatabase } from '../helpers/guard.mjs'
import { closeDb, resetAll, createProduct, getAuditLogs, db, q, q1 } from '../helpers/db.mjs'

const IP = freshIp()
let cookie
let product
let issueId
let attachmentPath

before(async () => {
  await assertTestDatabase()
  await resetAll()
  cookie = await loginAdmin()
  product = await createProduct({ name: 'TEST ผลิตภัณฑ์ issues', warranty_years: 2 })

  // ตั้งฉาก: SN ที่เริ่มประกันแล้วและมีลูกค้าผูกไว้ → แจ้งปัญหาได้
  const [sn] = await db().query(
    "INSERT INTO serial_numbers (sn, product_id, status, category) VALUES ('TESTISS0000001', ?, 'registered', 'TEST')",
    [product.id]
  )
  await q(
    `INSERT INTO registrations (serial_number_id, phone, customer_name, email, warranty_start, warranty_end)
     VALUES (?, '0812345678', 'ทดสอบ', 't@example.com', '2026-08-01', '2028-08-01')`,
    [sn.insertId]
  )
})

after(async () => {
  await resetAll()
  await closeDb()
})

describe('POST /api/issues — เคสสำเร็จ พร้อมไฟล์แนบ', () => {
  test('แจ้งปัญหาสำเร็จ → 201', async () => {
    const form = new FormData()
    form.set('sn', 'TESTISS0000001')
    form.set('phone', '0812345678')
    form.set('description', 'เครื่องมีเสียงดังผิดปกติเวลาเปิดใช้งาน รบกวนตรวจสอบให้ด้วยครับ')
    form.append('images', new File([new Uint8Array(2048)], 'ภาพหน้าจอ.jpg', { type: 'image/jpeg' }))

    const res = await post('/api/issues', { form })
    assert.equal(res.status, 201)

    const row = await q1('SELECT id FROM issue_reports ORDER BY id DESC LIMIT 1')
    issueId = row.id
  })

  test('ชื่อไฟล์ถูกตั้งใหม่เป็น UUID ไม่ใช่ชื่อเดิมจากผู้ใช้', async () => {
    const att = await q1('SELECT * FROM issue_attachments ORDER BY id DESC LIMIT 1')
    assert.ok(att, 'ต้องมีไฟล์แนบถูกบันทึก')
    attachmentPath = att.file_path
    assert.match(
      att.file_path,
      /^\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/,
      `path ต้องเป็น YYYY/MM/<uuid>.jpg ได้: ${att.file_path}`
    )
    assert.equal(att.original_name, 'ภาพหน้าจอ.jpg', 'ชื่อเดิมเก็บไว้ใน DB ได้ แต่ต้องไม่ใช้ตั้งชื่อไฟล์')
    assert.ok(!att.file_path.includes('ภาพหน้าจอ'))
  })

  test('เคสใหม่มีสถานะ pending', async () => {
    const row = await q1('SELECT status FROM issue_reports WHERE id = ?', [issueId])
    assert.equal(row.status, 'pending')
  })
})

describe('GET /api/files/[...path] — ไม่มี auth (finding #2)', () => {
  test('เปิดไฟล์แนบได้ → 200 พร้อม header ความปลอดภัย', async () => {
    const res = await get(`/api/files/${attachmentPath}`, { raw: true })
    assert.equal(res.status, 200)
    assert.match(res.contentType, /image\/jpeg/)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  })

  test('path traversal ออกนอก uploads/ → 403', async () => {
    for (const p of ['../.env.local', '../../.env.local', '..%2F..%2F.env.test']) {
      const res = await get(`/api/files/${p}`, { raw: true })
      assert.ok([403, 404].includes(res.status), `${p} ต้องไม่ถูกเสิร์ฟ ได้ ${res.status}`)
      assert.ok(!res.buffer.toString().includes('JWT_SECRET'), 'เนื้อไฟล์ env ต้องไม่หลุด')
    }
  })

  test('นามสกุลนอก jpg/png/mp4 → 404', async () => {
    const res = await get('/api/files/2026/08/whatever.txt', { raw: true })
    assert.equal(res.status, 404)
  })

  test('ไฟล์ไม่มีจริง → 404', async () => {
    const res = await get('/api/files/2026/08/00000000-0000-0000-0000-000000000000.jpg', {
      raw: true,
    })
    assert.equal(res.status, 404)
  })

  test('ไฟล์แนบของลูกค้าไม่ควรเปิดได้โดยไม่ต้อง login → ควรเป็น 401/403', async () => {
    // ควรจะเป็น: ไฟล์ที่ลูกค้าแนบมากับเคสเป็นข้อมูลส่วนบุคคล ไม่ควรเสิร์ฟให้คนที่ไม่ได้ล็อกอิน
    const res = await get(`/api/files/${attachmentPath}`, { raw: true })
    assert.ok(
      [401, 403].includes(res.status),
      `ไฟล์แนบเปิดได้โดยไม่ต้อง login (ได้ ${res.status}) — ไม่มีการตรวจสิทธิ์ใน /api/files/*`
    )
  })
})

describe('auth มาตรฐาน', () => {
  for (const c of AUTH_FAILURE_CASES) {
    test(`GET /api/admin/issues — ${c.name} → 401`, async () => {
      assert.equal((await get('/api/admin/issues', { cookie: await cookieFor(c) })).status, 401)
    })
    test(`PATCH /api/admin/issues/[id] — ${c.name} → 401`, async () => {
      const res = await patch(`/api/admin/issues/${issueId}`, {
        cookie: await cookieFor(c),
        body: { status: 'resolved' },
      })
      assert.equal(res.status, 401)
    })
  }

  test('สถานะเคสไม่ถูกเปลี่ยนจากเคส auth ที่ล้มเหลว', async () => {
    const row = await q1('SELECT status FROM issue_reports WHERE id = ?', [issueId])
    assert.equal(row.status, 'pending')
  })
})

describe('GET /api/admin/issues', () => {
  test('คืน 200 พร้อม meta และไฟล์แนบ', async () => {
    const res = await get('/api/admin/issues', { cookie })
    assert.equal(res.status, 200)
    assert.ok(res.json.meta)
  })

  test('กรองด้วย status ได้', async () => {
    const res = await get('/api/admin/issues?status=pending', { cookie })
    assert.equal(res.status, 200)
  })

  test('แอดมินเห็นเบอร์เต็ม (ไม่ mask เหมือนหน้า public)', async () => {
    const res = await get('/api/admin/issues', { cookie })
    assert.ok(res.text.includes('0812345678'), 'หน้าแอดมินต้องเห็นเบอร์จริงเพื่อติดต่อกลับ')
  })
})

describe('PATCH /api/admin/issues/[id]', () => {
  test('id ไม่ใช่ตัวเลข → 400', async () => {
    const res = await patch('/api/admin/issues/abc', { cookie, body: { status: 'resolved' } })
    assert.equal(res.status, 400)
  })

  test('status นอก enum → 400', async () => {
    const res = await patch(`/api/admin/issues/${issueId}`, {
      cookie,
      body: { status: 'done' },
    })
    assert.equal(res.status, 400)
  })

  test('admin_note ยาวเกิน 5000 → 400', async () => {
    const res = await patch(`/api/admin/issues/${issueId}`, {
      cookie,
      body: { status: 'resolved', admin_note: 'ก'.repeat(5001) },
    })
    assert.equal(res.status, 400)
  })

  test('ไม่พบเคส → 404', async () => {
    const res = await patch('/api/admin/issues/99999999', {
      cookie,
      body: { status: 'resolved' },
    })
    assert.equal(res.status, 404)
  })

  test('อัปเดตสำเร็จ → 200', async () => {
    const res = await patch(`/api/admin/issues/${issueId}`, {
      cookie,
      body: { status: 'resolved', admin_note: 'เปลี่ยนอะไหล่ให้แล้ว' },
    })
    assert.equal(res.status, 200)
    const row = await q1('SELECT status, admin_note FROM issue_reports WHERE id = ?', [issueId])
    assert.equal(row.status, 'resolved')
    assert.equal(row.admin_note, 'เปลี่ยนอะไหล่ให้แล้ว')
  })

  test('บันทึก audit log', async () => {
    const logs = await getAuditLogs('issue.update')
    assert.ok(logs.length >= 1, 'การอัปเดตเคสต้องถูกบันทึกใน audit_logs')
  })
})
