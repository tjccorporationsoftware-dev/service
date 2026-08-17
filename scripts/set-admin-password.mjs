// ตั้ง/รีเซ็ตรหัสผ่านแอดมิน — hash ด้วย bcrypt ให้อัตโนมัติ
// รันด้วย: npm run admin:password -- <username> <password>
//
// อย่าแก้ช่อง password_hash ผ่าน phpMyAdmin โดยตรง เพราะต้องเก็บเป็น bcrypt hash
// ไม่ใช่รหัสผ่านดิบ มิฉะนั้นจะ login ไม่ได้
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'

const [username, password] = process.argv.slice(2)

if (!username || !password) {
  console.error('ใช้: npm run admin:password -- <username> <password>')
  process.exit(1)
}
if (password.length < 8) {
  console.error('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร')
  process.exit(1)
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'warranty_db',
})

const hash = await bcrypt.hash(password, 10)
const [result] = await conn.execute('UPDATE admins SET password_hash = ? WHERE username = ?', [
  hash,
  username,
])

if (result.affectedRows === 0) {
  console.error(`ไม่พบแอดมินชื่อ "${username}"`)
  await conn.end()
  process.exit(1)
}

console.log(`✓ ตั้งรหัสผ่านใหม่ให้ "${username}" เรียบร้อย`)
await conn.end()
