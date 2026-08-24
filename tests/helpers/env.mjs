// โหลดค่าจาก .env.test เข้ามาใน process ของตัวเทสต์เอง
// (คนละ process กับ dev server — ตัวนี้แค่ต้องรู้ว่าจะต่อฐานไหนและ JWT_SECRET ตัวไหน)
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

try {
  process.loadEnvFile(path.join(ROOT, '.env.test'))
} catch {
  throw new Error('อ่าน .env.test ไม่ได้ — ต้องมีไฟล์นี้ที่ root ก่อนรันเทสต์')
}

if (process.env.DB_NAME !== 'warranty_test') {
  throw new Error(`.env.test ต้องตั้ง DB_NAME=warranty_test (ตอนนี้ได้ "${process.env.DB_NAME}")`)
}

export const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
export const JWT_SECRET = process.env.JWT_SECRET
export const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? 'admin'
export const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin1234'

export const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
  dateStrings: ['DATE'],
}
