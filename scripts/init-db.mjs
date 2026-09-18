// สร้างฐานข้อมูล + ตาราง + migration + แอดมินคนแรก (ผลิตภัณฑ์ตัวอย่างเฉพาะเมื่อ SEED_PRODUCTS=true)
// รันด้วย: npm run db:init
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'

// ห้ามมี fallback ชื่อ DB ตรงนี้ — เคยเป็น `|| 'warranty_db'` ซึ่งแปลว่าถ้าลืมส่ง --env-file
// สคริปต์จะเงียบ ๆ ไปลงมือกับฐานข้อมูลตัวจริง ต้องบังคับให้ระบุมาเสมอ
const DB_NAME = process.env.DB_NAME

const connectionConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true,
}

const SEED_PRODUCTS = [
  { name: 'เตียงผู้ป่วยไฟฟ้า 3 ไก', code: 'BED01', brand: 'MediCare', model: 'HB-300E', years: 2, months: 0, days: 0 },
  { name: 'เครื่องเอกซเรย์เคลื่อนที่', code: 'XRAY01', brand: 'RadiTech', model: 'MX-500', years: 3, months: 0, days: 0 },
  { name: 'เครื่องช่วยหายใจ', code: 'VENT01', brand: 'PulmoCare', model: 'VT-750', years: 2, months: 0, days: 0 },
  { name: 'เครื่องอัลตราซาวด์', code: 'USND01', brand: 'SonoMed', model: 'US-9000', years: 3, months: 0, days: 0 },
  { name: 'เครื่องฟอกไต', code: 'DIAL01', brand: 'RenalPlus', model: 'DX-200', years: 2, months: 0, days: 0 },
  { name: 'เครื่องมอนิเตอร์สัญญาณชีพ', code: 'MON01', brand: 'VitalWatch', model: 'PM-100', years: 1, months: 0, days: 0 },
]

/** เพิ่มคอลัมน์ที่มาทีหลังให้ DB ที่สร้างไว้ก่อนแล้ว (รันซ้ำได้) */
const MIGRATIONS = [
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_years INT NOT NULL DEFAULT 0 AFTER model',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_days INT NOT NULL DEFAULT 0 AFTER warranty_months',
  // เดิม default เป็น 12 (สมัยที่เก็บเป็นเดือนอย่างเดียว) — ให้ตรงกับ schema.sql ปัจจุบัน
  'ALTER TABLE products MODIFY warranty_months INT NOT NULL DEFAULT 0',
  // เดิมบังคับ NOT NULL เพราะคำนวณตอนลงทะเบียนทันที — ตอนนี้แอดมินเป็นคนกด "เริ่มประกัน" แยกทีหลัง
  'ALTER TABLE registrations MODIFY warranty_start DATE NULL',
  'ALTER TABLE registrations MODIFY warranty_end DATE NULL',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(100) AFTER code',
  'ALTER TABLE registrations ADD COLUMN IF NOT EXISTS email VARCHAR(255) AFTER customer_name',
  'ALTER TABLE registrations ADD COLUMN IF NOT EXISTS consent_accepted_at DATETIME AFTER warranty_end',
  // เดิมบังคับ NOT NULL เพราะลูกค้าลงทะเบียนเองเสมอ — ตอนนี้แอดมินเริ่มประกันตรงได้โดยยังไม่มีลูกค้า
  'ALTER TABLE registrations MODIFY phone VARCHAR(15) NULL',
  // วันที่ลูกค้ากรอกเองตอนลงทะเบียน ใช้เทียบกับวันที่แอดมินกดเริ่มประกันจริงเท่านั้น
  'ALTER TABLE registrations ADD COLUMN IF NOT EXISTS customer_reported_warranty_start DATE AFTER consent_accepted_at',
  'ALTER TABLE registrations ADD COLUMN IF NOT EXISTS customer_reported_warranty_end DATE AFTER customer_reported_warranty_start',
  // หมวดหมู่ที่แอดมินกรอกตอนสร้าง SN แต่ละชุด (ไม่ใช่ของตัวสินค้า)
  'ALTER TABLE serial_numbers ADD COLUMN IF NOT EXISTS category VARCHAR(100) AFTER batch_id',
  // ย้ายรูปแบบรหัส SN ออกจากตัวผลิตภัณฑ์ ไปเป็นตาราง sn_schemes อิสระแทน (สร้าง SN ก่อนแล้วค่อยผูกผลิตภัณฑ์ทีหลัง)
  'ALTER TABLE products DROP COLUMN IF EXISTS sn_prefix',
  'ALTER TABLE products DROP COLUMN IF EXISTS sn_model_code',
  'ALTER TABLE products DROP COLUMN IF EXISTS sn_next_sequence',
  // SN สร้างได้ก่อนมีผลิตภัณฑ์ — ผูกผลิตภัณฑ์ทีหลังผ่านหน้า Serial Number
  'ALTER TABLE serial_numbers MODIFY product_id INT NULL',
  'ALTER TABLE serial_numbers ADD COLUMN IF NOT EXISTS scheme_id INT AFTER category',
  // ช่วงวันประกันแบบตายตัวของตัวผลิตภัณฑ์ (ไม่บังคับ) — กรอกครบทั้งคู่แล้วระบบคำนวณระยะประกันให้
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_start_date DATE AFTER warranty_days',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_end_date DATE AFTER warranty_start_date',
  // รหัสผลิตภัณฑ์ไม่บังคับแล้ว — เว้นว่างเก็บเป็น NULL (UNIQUE ยอมให้ NULL ซ้ำได้ แต่ '' ซ้ำไม่ได้)
  'ALTER TABLE products MODIFY code VARCHAR(10) NULL',
  // แยกประเภทว่าผลิตเองหรือซื้อมาขายต่อ — ของเดิมที่มีอยู่ก่อนถือเป็น "ผลิตเอง" ตาม DEFAULT
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS source_type ENUM('in_house','resale') NOT NULL DEFAULT 'in_house' AFTER model`,
]

async function main() {
  if (!DB_NAME) {
    throw new Error(
      'ไม่ได้ตั้งค่า DB_NAME — สั่งด้วย `node --env-file=.env.local scripts/init-db.mjs` ' +
        '(หรือ .env.test สำหรับฐานข้อมูลทดสอบ)'
    )
  }
  // ชื่อ DB ถูกแปะลง SQL ตรง ๆ ด้านล่าง (placeholder ใช้กับ CREATE DATABASE ไม่ได้) จึงต้องจำกัดรูปแบบก่อน
  if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) {
    throw new Error(`DB_NAME "${DB_NAME}" ใช้ไม่ได้ — ต้องเป็น A–Z a–z 0–9 และ _ เท่านั้น`)
  }

  const conn = await mysql.createConnection(connectionConfig)

  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  )
  await conn.changeUser({ database: DB_NAME })
  console.log(`✓ database "${DB_NAME}" พร้อมใช้งาน`)

  const schema = await readFile(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8')
  await conn.query(schema)
  console.log('✓ สร้างตารางครบแล้ว')

  for (const sql of MIGRATIONS) await conn.query(sql)
  console.log('✓ อัปเดตโครงสร้างตารางเป็นเวอร์ชันล่าสุด')

  // ผลิตภัณฑ์ตัวอย่าง 6 รายการ ใส่เฉพาะเมื่อตั้ง SEED_PRODUCTS=true — ค่าเริ่มต้นคือ "ไม่ใส่"
  // เพราะฐานของบริษัทจริงต้องเริ่มว่าง: ลืมตั้ง flag แล้วเทสต์ล้ม ดีกว่าได้ของปลอมติดไปฐานจริงโดยไม่มีใครสังเกต
  // (ฐานทดสอบ warranty_test ต้องตั้ง — เทสต์ public นับขั้นต่ำ 6 รายการ)
  if (process.env.SEED_PRODUCTS === 'true') {
    // INSERT IGNORE — seed เฉพาะตอนยังไม่มี code นั้น ห้ามแตะแถวที่มีอยู่แล้วเด็ดขาด
    // ของเดิมใช้ ON DUPLICATE KEY UPDATE name/brand/model ซึ่งทำให้การรัน db:init
    // ย้อนชื่อ/แบรนด์/รุ่นที่แอดมินแก้ไว้เองกลับเป็นค่า seed โดยไม่มีใครสังเกต
    for (const p of SEED_PRODUCTS) {
      await conn.execute(
        `INSERT IGNORE INTO products (name, code, brand, model, warranty_years, warranty_months, warranty_days)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [p.name, p.code, p.brand, p.model, p.years, p.months, p.days]
      )
    }
    console.log(`✓ seed ผลิตภัณฑ์ตัวอย่าง ${SEED_PRODUCTS.length} รายการ (SEED_PRODUCTS=true)`)
  } else {
    console.log('- ข้ามผลิตภัณฑ์ตัวอย่าง (ตั้ง SEED_PRODUCTS=true ถ้าต้องการ เช่นฐานทดสอบ)')
  }

  const username = process.env.SEED_ADMIN_USERNAME || 'admin'
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin1234'
  const [existing] = await conn.execute('SELECT id FROM admins WHERE username = ?', [username])
  if (existing.length === 0) {
    const hash = await bcrypt.hash(password, 10)
    await conn.execute(
      `INSERT INTO admins (username, password_hash, display_name, role) VALUES (?, ?, ?, 'admin')`,
      [username, hash, 'ผู้ดูแลระบบ']
    )
    console.log(`✓ สร้างแอดมิน "${username}" (รหัสผ่าน: ${password}) — กรุณาเปลี่ยนรหัสผ่าน`)
  } else {
    console.log(`- แอดมิน "${username}" มีอยู่แล้ว ข้ามการสร้าง`)
  }

  await conn.end()
  console.log('\nเสร็จสิ้น')
}

main().catch((err) => {
  console.error('init-db ล้มเหลว:', err.message)
  process.exit(1)
})
