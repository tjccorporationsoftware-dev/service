import { z } from 'zod'

/** เบอร์ไทย 10 หลัก ขึ้นต้นด้วย 0 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^0\d{9}$/, 'เบอร์โทรต้องเป็นตัวเลข 10 หลัก และขึ้นต้นด้วย 0')

export const snSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(5, 'กรุณากรอก Serial Number')
  .max(50, 'Serial Number ยาวเกินไป')

export const registerSchema = z.object({
  customer_name: z
    .string()
    .trim()
    .min(1, 'กรุณากรอกชื่อผู้ซื้อหรือชื่อหน่วยงาน')
    .max(255),
  phone: phoneSchema,
  email: z.string().trim().min(1, 'กรุณากรอกอีเมล').email('รูปแบบอีเมลไม่ถูกต้อง').max(255),
  product_id: z.coerce.number().int().positive('กรุณาเลือกผลิตภัณฑ์'),
  sn: snSchema,
  // วันที่ลูกค้ากรอกเอง (เช่น จำจากใบรับประกันกระดาษ) ไว้เทียบกับวันที่แอดมินกดเริ่มประกันจริง — บังคับกรอกเพื่อให้เช็คได้ทุกครั้ง
  customer_reported_warranty_start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'กรุณากรอกวันที่เริ่มประกัน'),
  customer_reported_warranty_end: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'กรุณากรอกวันที่สิ้นสุดประกัน'),
  consent: z.boolean().refine((v) => v === true, {
    message: 'กรุณายอมรับเงื่อนไขการรับประกันและประกาศความเป็นส่วนตัว',
  }),
})

export const issueReportSchema = z.object({
  sn: snSchema,
  phone: phoneSchema,
  description: z
    .string()
    .trim()
    .min(10, 'กรุณาอธิบายปัญหาอย่างน้อย 10 ตัวอักษร')
    .max(5000, 'รายละเอียดยาวเกินไป'),
})

export const issueStatusQuerySchema = z.object({
  sn: snSchema,
  phone: phoneSchema,
})

export const adminLoginSchema = z.object({
  username: z.string().trim().min(1, 'กรุณากรอกชื่อผู้ใช้'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
})

// สร้าง SN จาก "รูปแบบรหัส" (scheme) โดยตรง ไม่ต้องผูกผลิตภัณฑ์ตั้งแต่ตอนสร้าง
export const snGenerateSchema = z.object({
  scheme_id: z.coerce.number().int().positive('กรุณาเลือกรูปแบบรหัส SN'),
  quantity: z.coerce
    .number()
    .int()
    .min(1, 'จำนวนอย่างน้อย 1')
    .max(1000, 'สร้างได้สูงสุด 1,000 ตัวต่อครั้ง'),
  category: z.string().trim().min(1, 'กรุณากรอกหมวดหมู่').max(100),
})

// นำเข้า SN ที่มีอยู่แล้วจริงของผลิตภัณฑ์หนึ่ง ๆ (เช่น สินค้านอกที่ซื้อมาขายต่อ มี SN ติดมากับตัวสินค้าจากโรงงานเดิม)
// กรอก/วางเองทีละตัวหรือหลายตัวพร้อมกันตอนเพิ่ม/จัดการผลิตภัณฑ์นั้น — ผูกผลิตภัณฑ์ทันที ไม่ผ่านตัวสร้างรหัสอัตโนมัติ
export const snImportSchema = z.object({
  product_id: z.coerce.number().int().positive('กรุณาเลือกผลิตภัณฑ์'),
  sns: z
    .array(snSchema)
    .min(1, 'กรุณากรอก Serial Number อย่างน้อย 1 รายการ')
    .max(1000, 'นำเข้าได้สูงสุด 1,000 รายการต่อครั้ง'),
  category: z.string().trim().min(1, 'กรุณากรอกหมวดหมู่').max(100),
})

// รูปแบบรหัส SN แบบเรียงลำดับ — ไม่ผูกกับผลิตภัณฑ์ใด ๆ ตั้งไว้ล่วงหน้าได้เลย
export const snSchemeSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  label: z.string().trim().min(1, 'กรุณากรอกชื่อเรียกรูปแบบ').max(255),
  prefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,10}$/, 'ตัวนำหน้าต้องเป็น A–Z และ 0–9 ยาว 1–10 ตัว'),
  model_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,10}$/, 'รหัสรุ่นต้องเป็น A–Z และ 0–9 ยาว 1–10 ตัว'),
  next_sequence: z.coerce.number().int().min(1, 'เลขลำดับการผลิตต้องเริ่มจาก 1 ขึ้นไป'),
})

// ผูก SN ที่สร้างไว้ล่วงหน้า (ยังไม่มีเจ้าของ) เข้ากับผลิตภัณฑ์ทีหลัง
export const snAssignProductSchema = z.object({
  serial_number_ids: z
    .array(z.coerce.number().int().positive())
    .min(1, 'กรุณาเลือกอย่างน้อย 1 รายการ')
    .max(500, 'เลือกได้สูงสุด 500 รายการต่อครั้ง'),
  product_id: z.coerce.number().int().positive('กรุณาเลือกผลิตภัณฑ์'),
})

export const productSchema = z.object({
  name: z.string().trim().min(1, 'กรุณากรอกชื่อผลิตภัณฑ์').max(255),
  // รหัสสินค้าอ้างอิงทั่วไป (SKU) — ไม่เกี่ยวกับรูปแบบ SN แล้ว (แยกไปตั้งที่หน้า "ตั้งค่ารหัส SN")
  // ไม่บังคับ: เว้นว่างได้ ('' จะถูกแปลงเป็น NULL ที่ฝั่ง API ก่อนบันทึก)
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,10}$/, 'รหัสต้องเป็น A–Z และ 0–9 ยาว 2–10 ตัว ห้ามมีขีดหรือเว้นวรรค')
    .optional()
    .or(z.literal('')),
  brand: z.string().trim().max(100).optional().or(z.literal('')),
  model: z.string().trim().max(100).optional().or(z.literal('')),
  // ที่มาของสินค้า — ตัดสินว่าใครออกรหัส SN (ดูคำอธิบายเต็มใน db/schema.sql)
  // ไม่ส่งมาถือว่าผลิตเอง เพื่อให้ client เดิมที่ยังไม่ส่งฟิลด์นี้ยังใช้งานได้
  source_type: z
    .enum(['in_house', 'resale'], { error: 'กรุณาเลือกประเภทผลิตภัณฑ์ (ผลิตเอง หรือ ซื้อมาขายต่อ)' })
    .default('in_house'),
  // ระยะประกันไม่บังคับ — เว้นว่างได้ถ้ายังไม่รู้ หรือกรอกช่วงวันที่ด้านล่างแทน
  warranty_years: z.coerce.number().int().min(0).max(50, 'ปีต้องไม่เกิน 50').default(0),
  warranty_months: z.coerce.number().int().min(0).max(600, 'เดือนต้องไม่เกิน 600').default(0),
  warranty_days: z.coerce.number().int().min(0).max(3650, 'วันต้องไม่เกิน 3,650').default(0),
  // ช่วงวันประกันแบบตายตัวของตัวผลิตภัณฑ์ (ไม่บังคับ) — ถ้ากรอกครบทั้งคู่
  // ระบบจะคำนวณระยะประกันจากช่วงนี้แทนค่าที่กรอกในช่อง ปี/เดือน/วัน
  warranty_start_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่เริ่มประกันไม่ถูกต้อง')
    .optional()
    .or(z.literal('')),
  warranty_end_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่สิ้นสุดประกันไม่ถูกต้อง')
    .optional()
    .or(z.literal('')),
  is_active: z.coerce.boolean().optional(),
})
  .refine(
    // เทียบ yyyy-mm-dd เป็นสตริงได้ตรง ๆ เพราะเรียงตามลำดับเวลาอยู่แล้ว
    (p) => !p.warranty_start_date || !p.warranty_end_date || p.warranty_end_date >= p.warranty_start_date,
    { message: 'วันที่สิ้นสุดประกันต้องไม่ก่อนวันที่เริ่มประกัน', path: ['warranty_end_date'] }
  )

export const startWarrantySchema = z.object({
  // ใช้ serial_numbers.id แทน registration id เพราะบางแถวยังไม่มีลูกค้าลงทะเบียนเลย
  // (แอดมินเริ่มประกันตรงได้ ระบบจะสร้าง registration เปล่าให้เอง รอลูกค้ามาผูกข้อมูลทีหลัง)
  serial_number_ids: z
    .array(z.coerce.number().int().positive())
    .min(1, 'กรุณาเลือกอย่างน้อย 1 รายการ')
    .max(500, 'เลือกได้สูงสุด 500 รายการต่อครั้ง'),
  // ไม่ระบุ = เริ่มวันนี้
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง')
    .optional(),
})

export const issueUpdateSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'resolved', 'closed']),
  admin_note: z.string().trim().max(5000).optional().or(z.literal('')),
})

/**
 * PATCH /api/service/issues/[id] — ระบบแจ้งซ่อมเปลี่ยนสถานะเคส
 * `only_if_status` ให้เปลี่ยนเฉพาะเมื่อสถานะปัจจุบันยังเป็นค่าใดค่าหนึ่งในนี้
 * (ระบบแจ้งซ่อมใช้กันไม่ให้ไปทับสถานะที่แอดมินฝั่งนี้ตั้งเองไว้)
 */
export const serviceIssuePatchSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'resolved', 'closed'], {
    message: 'สถานะไม่ถูกต้อง — ต้องเป็น pending, in_progress, resolved หรือ closed',
  }),
  only_if_status: z
    .array(
      z.enum(['pending', 'in_progress', 'resolved', 'closed'], {
        message: 'only_if_status มีค่าที่ไม่รู้จัก',
      })
    )
    .min(1, 'only_if_status ต้องมีอย่างน้อย 1 ค่า')
    .optional(),
})

/** ข้อจำกัดไฟล์แนบ */
export const UPLOAD_LIMITS = {
  image: {
    // 30 รูป/25MB ต่อรูป — ตั้งให้สูงพอที่ลูกค้าจริงจะไม่ชนเพดาน แต่ยังมีเพดานอยู่
    // เพราะ saveUpload() อ่านไฟล์เข้าหน่วยความจำทั้งก้อน ถ้าปล่อยไม่จำกัดเลย
    // คำขอเดียวที่แนบมาหลายร้อยไฟล์ทำให้เซิร์ฟเวอร์ล่มได้
    maxCount: 30,
    maxSize: 25 * 1024 * 1024, // 25MB — รูปจากมือถือรุ่นใหม่ใหญ่ได้ถึง ~15MB
    // heic/heif = รูปจาก iPhone · webp = รูปจาก Android บางรุ่นและภาพที่เซฟจากเว็บ
    mimeTypes: ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'],
    label: 'รูปภาพ (jpg/png/heic/webp) ไม่เกิน 25MB ต่อรูป สูงสุด 30 รูป',
  },
  video: {
    maxCount: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
    mimeTypes: ['video/mp4'],
    label: 'วิดีโอ (mp4) ไม่เกิน 50MB จำนวน 1 คลิป',
  },
  /**
   * เพดานรวมทั้งคำขอ — กันคนแนบ 30 รูป × 25MB (750MB) พร้อมกันจนหน่วยความจำหมด
   * ผู้ใช้จริงไม่มีทางชน ตัวเลขนี้จึงเป็นตาข่ายกันเซิร์ฟเวอร์ล่ม ไม่ใช่ข้อจำกัดการใช้งาน
   */
  totalMaxSize: 200 * 1024 * 1024, // 200MB
} as const

/** แปลง ZodError เป็นข้อความเดียวสำหรับแสดงผล */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง'
}
