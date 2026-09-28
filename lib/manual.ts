import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

/**
 * คู่มือการใช้งานหลังบ้าน (รูปทีละหน้า + PDF) — วางไว้ที่ manual/ ข้างโฟลเดอร์โปรเจกต์ แล้วเสิร์ฟผ่าน /api/admin/manual/*
 *
 * ไม่อยู่ใน git โดยเจตนา: repo เป็น public แต่ภาพคู่มือมีหน้าจอระบบภายใน (ระบบแจ้งซ่อม)
 * และแต่ละชุด deploy ใช้คู่มือของบริษัทตัวเอง — ต้องคัดลอกโฟลเดอร์นี้ขึ้นเซิร์ฟเวอร์เอง
 */
export const MANUAL_ROOT = path.join(process.cwd(), 'manual')

/** ชื่อไฟล์ในโฟลเดอร์คู่มือ — ภาษาอังกฤษตัวเล็ก/ตัวเลขล้วน กัน path traversal และไม่ต้อง encode ใน URL */
const MANUAL_FILE = /^[a-z0-9_-]+\.(png|jpg|webp|pdf)$/

export const MANUAL_CONTENT_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
}

const manualSchema = z.object({
  title: z.string().min(1),
  /** วันที่ออกฉบับนี้ 'YYYY-MM-DD' */
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** เปลี่ยนทุกครั้งที่ออกฉบับใหม่ — ต่อท้าย URL รูปเพื่อไม่ให้เบราว์เซอร์ใช้รูปเก่าจาก cache */
  version: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/),
  pdf: z.string().regex(MANUAL_FILE).nullable(),
  pages: z.array(z.object({ file: z.string().regex(MANUAL_FILE), title: z.string().min(1) })).min(1),
})

export type Manual = z.infer<typeof manualSchema>

/** อ่าน manual/manual.json — คืน null ถ้าเครื่องนี้ยังไม่มีคู่มือหรือไฟล์ผิดรูปแบบ */
export async function readManual(): Promise<Manual | null> {
  let raw: string
  try {
    raw = await readFile(path.join(MANUAL_ROOT, 'manual.json'), 'utf8')
  } catch {
    return null
  }
  try {
    const parsed = manualSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      console.error('manual.json invalid:', parsed.error.issues)
      return null
    }
    return parsed.data
  } catch (err) {
    console.error('manual.json invalid:', err)
    return null
  }
}

/** path จริงของไฟล์คู่มือ — null ถ้าชื่อไม่ผ่านรูปแบบ (จึงหลุดออกนอก MANUAL_ROOT ไม่ได้) */
export function resolveManualFile(name: string): string | null {
  if (!MANUAL_FILE.test(name)) return null
  return path.join(MANUAL_ROOT, name)
}
