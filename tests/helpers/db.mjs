// เข้าถึงฐานทดสอบตรง ๆ สำหรับ setup / ยืนยันผล / ล้างข้อมูลระหว่างเทสต์
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { DB_CONFIG } from './env.mjs'

let pool

export function db() {
  pool ??= mysql.createPool({ ...DB_CONFIG, connectionLimit: 5 })
  return pool
}

export async function closeDb() {
  if (pool) {
    await pool.end()
    pool = undefined
  }
}

export async function q(sql, params = []) {
  const [rows] = await db().query(sql, params)
  return rows
}

export async function q1(sql, params = []) {
  const rows = await q(sql, params)
  return rows[0] ?? null
}

/**
 * ล้างข้อมูลธุรกรรมทั้งหมด เหลือแต่ products/admins/sn_schemes
 * เรียงลำดับตาม foreign key
 */
export async function resetTransactionalData() {
  await q('DELETE FROM issue_attachments')
  await q('DELETE FROM issue_reports')
  await q('DELETE FROM registrations')
  await q('DELETE FROM serial_numbers')
  await q('DELETE FROM audit_logs')
}

/** ล้างของที่เทสต์สร้างขึ้นเองทั้งหมด รวม products/schemes ที่ตั้งชื่อขึ้นต้นด้วย TEST */
export async function resetAll() {
  await resetTransactionalData()
  await q("DELETE FROM sn_schemes WHERE label LIKE 'TEST%'")
  await q("DELETE FROM products WHERE name LIKE 'TEST%'")
  await q("DELETE FROM admins WHERE username LIKE 'test_%'")
}

export async function createProduct(overrides = {}) {
  const p = {
    name: `TEST สินค้า ${Math.floor(performance.now() * 1000)}`,
    code: null,
    brand: 'TESTBRAND',
    model: 'T-1',
    source_type: 'in_house',
    warranty_years: 1,
    warranty_months: 6,
    warranty_days: 0,
    is_active: 1,
    ...overrides,
  }
  const [res] = await db().query(
    `INSERT INTO products (name, code, brand, model, source_type, warranty_years, warranty_months, warranty_days, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [p.name, p.code, p.brand, p.model, p.source_type, p.warranty_years, p.warranty_months, p.warranty_days, p.is_active]
  )
  return { id: res.insertId, ...p }
}

export async function createScheme(overrides = {}) {
  const s = {
    label: `TEST scheme ${Math.floor(performance.now() * 1000)}`,
    prefix: 'T',
    model_code: String(Math.floor(Math.abs(Math.sin(performance.now()) * 89) + 10)),
    next_sequence: 1,
    ...overrides,
  }
  const [res] = await db().query(
    'INSERT INTO sn_schemes (label, prefix, model_code, next_sequence) VALUES (?, ?, ?, ?)',
    [s.label, s.prefix, s.model_code, s.next_sequence]
  )
  return { id: res.insertId, ...s }
}

/** สร้าง admin เพิ่มเพื่อทดสอบเรื่อง role */
export async function createAdmin({ username, password, role = 'staff' }) {
  const hash = await bcrypt.hash(password, 10)
  await q('DELETE FROM admins WHERE username = ?', [username])
  const [res] = await db().query(
    'INSERT INTO admins (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
    [username, hash, `TEST ${role}`, role]
  )
  return { id: res.insertId, username, password, role }
}

export const getSerial = (sn) => q1('SELECT * FROM serial_numbers WHERE sn = ?', [sn])
export const getSerialById = (id) => q1('SELECT * FROM serial_numbers WHERE id = ?', [id])
export const getRegistrationBySn = (sn) =>
  q1(
    `SELECT r.* FROM registrations r JOIN serial_numbers s ON s.id = r.serial_number_id WHERE s.sn = ?`,
    [sn]
  )
export const getScheme = (id) => q1('SELECT * FROM sn_schemes WHERE id = ?', [id])
export const countRows = async (table) => (await q1(`SELECT COUNT(*) n FROM \`${table}\``)).n
export const getAuditLogs = (action) =>
  q('SELECT * FROM audit_logs WHERE action = ? ORDER BY id DESC', [action])
