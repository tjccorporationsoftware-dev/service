import mysql from 'mysql2/promise'
import type { ExecuteValues } from 'mysql2'

/** ค่าที่ส่งเป็น placeholder ของ prepared statement ได้ */
export type SqlParams = ExecuteValues[]

// เก็บ pool ไว้บน globalThis เพื่อไม่ให้ HMR ตอน dev สร้าง pool ใหม่ทุกครั้ง
const globalForDb = globalThis as unknown as { warrantyPool?: mysql.Pool }

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'warranty_db',
}

/** ปลายทางที่ pool นี้ต่ออยู่ (ไม่มีรหัสผ่าน) — ใช้พิมพ์ log ตอน boot ใน instrumentation.ts */
export const dbTarget = `${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`

export const pool =
  globalForDb.warrantyPool ??
  mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4_unicode_ci',
    dateStrings: ['DATE'],
  })

if (process.env.NODE_ENV !== 'production') globalForDb.warrantyPool = pool

/** SELECT ที่คืนหลายแถว */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: SqlParams = []
): Promise<T[]> {
  const [rows] = await pool.execute(sql, params)
  return rows as T[]
}

/** SELECT ที่คาดว่าได้แถวเดียว */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: SqlParams = []
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

/** INSERT / UPDATE / DELETE */
export async function execute(sql: string, params: SqlParams = []) {
  const [result] = await pool.execute(sql, params)
  return result as mysql.ResultSetHeader
}

/** รันหลายคำสั่งใน transaction เดียว */
export async function withTransaction<T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}
