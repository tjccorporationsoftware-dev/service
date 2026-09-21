// แปลงวันที่ระหว่างรูปแบบที่ระบบใช้ (ISO 'YYYY-MM-DD' ค.ศ. — DB / API / <input type="date"> เดิม)
// กับรูปแบบที่ผู้ใช้เห็นในช่องวันที่ ('DD/MM/ปี พ.ศ.')
//
// pure module — ไม่พึ่ง node / db / react ใช้ได้ทั้ง client และ server และเทสต์ตรง ๆ ได้
// พ.ศ. มีอยู่เฉพาะตอนแสดงผลบนหน้าจอเท่านั้น ค่าที่วิ่งในระบบ (state, API, DB, addDuration, รหัส SN) เป็น ค.ศ. เสมอ
// ใช้ local time ตามกฎของโปรเจกต์ — ห้าม toISOString() / getUTC*

export const BE_OFFSET = 543

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
] as const

/** หัวคอลัมน์ปฏิทิน เริ่มวันอาทิตย์ (ตรงกับ Date.getDay()) */
export const THAI_WEEKDAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const

/** ค.ศ. เสมอ · month = 1–12 */
export type DateParts = { year: number; month: number; day: number }

/** ปี ค.ศ. ที่รับได้เมื่อผู้ใช้พิมพ์เอง — ต่ำกว่านี้ถือว่าพิมพ์ผิด */
const MIN_CE_YEAR = 1900
/** ปี 4 หลักตั้งแต่ค่านี้ขึ้นไปตีความเป็น พ.ศ. (ต่ำกว่า = ผู้ใช้เผลอพิมพ์ ค.ศ. ตามนิสัย ก็รับให้) */
const BE_THRESHOLD = 2400

export function daysInMonth(year: number, month: number): number {
  // วันที่ 0 ของเดือนถัดไป = วันสุดท้ายของเดือนนี้ (month เป็น 1–12 จึงส่งเข้า Date ได้ตรง ๆ)
  return new Date(year, month, 0).getDate()
}

function isValidParts({ year, month, day }: DateParts): boolean {
  return (
    Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day) &&
    month >= 1 && month <= 12 &&
    day >= 1 && day <= daysInMonth(year, month)
  )
}

/** 'YYYY-MM-DD' → ส่วนประกอบ · คืน null ถ้ารูปแบบผิดหรือไม่ใช่วันที่จริง (เช่น 31 ก.พ.) */
export function parseIso(value: string | null | undefined): DateParts | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const parts = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
  return isValidParts(parts) ? parts : null
}

export function formatIso({ year, month, day }: DateParts): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function dateToParts(date: Date): DateParts {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }
}

export function todayIso(now = new Date()): string {
  return formatIso(dateToParts(now))
}

/** 'YYYY-MM-DD' (ค.ศ.) → 'DD/MM/ปี พ.ศ.' · ค่าว่าง/ผิดรูปแบบ → '' */
export function isoToThai(iso: string | null | undefined): string {
  const p = parseIso(iso)
  if (!p) return ''
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${p.year + BE_OFFSET}`
}

/**
 * ข้อความที่ผู้ใช้พิมพ์ ('18/09/2569', '18/9/2569', '18092569') → 'YYYY-MM-DD' ค.ศ.
 * ปี 4 หลัก ≥ 2400 ตีความเป็น พ.ศ. · 1900–2399 ตีความเป็น ค.ศ. (กันคนพิมพ์ ค.ศ. ตามนิสัยแล้วได้ปีเพี้ยน 543 ปี)
 * คืน null ถ้ายังพิมพ์ไม่ครบหรือไม่ใช่วันที่จริง
 */
export function thaiToIso(text: string | null | undefined): string | null {
  if (!text) return null
  const trimmed = text.trim()
  let day: number, month: number, year: number
  const withSlash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
  if (withSlash) {
    day = Number(withSlash[1]); month = Number(withSlash[2]); year = Number(withSlash[3])
  } else if (/^\d{8}$/.test(trimmed)) {
    day = Number(trimmed.slice(0, 2)); month = Number(trimmed.slice(2, 4)); year = Number(trimmed.slice(4))
  } else {
    return null
  }
  if (year >= BE_THRESHOLD) year -= BE_OFFSET
  if (year < MIN_CE_YEAR) return null
  const parts = { year, month, day }
  return isValidParts(parts) ? formatIso(parts) : null
}

/** จัดรูปข้อความระหว่างพิมพ์ — เก็บเฉพาะตัวเลข สูงสุด 8 หลัก แล้วแทรก '/' เป็น DD/MM/YYYY ให้เอง */
export function maskThaiDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

/** เลื่อนเดือนไปข้างหน้า/หลัง (delta ติดลบได้) แล้วปรับปีให้ถูก */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/** วันที่อยู่ในช่วง [min, max] ไหม — ISO ที่ถูกต้องเทียบเป็น string ได้ตรง ๆ · min/max ว่าง = ไม่จำกัดด้านนั้น */
export function isWithinRange(iso: string, min?: string, max?: string): boolean {
  if (min && parseIso(min) && iso < min) return false
  if (max && parseIso(max) && iso > max) return false
  return true
}
