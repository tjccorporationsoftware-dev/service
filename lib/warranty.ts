/** ยูทิลิตี้เกี่ยวกับวันประกันและข้อมูลส่วนบุคคล */

/** บวกเดือนแบบไม่ให้วันล้นเดือน (31 ม.ค. + 1 เดือน = 28/29 ก.พ.) */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  const targetDay = result.getDate()
  result.setDate(1)
  result.setMonth(result.getMonth() + months)
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(targetDay, lastDay))
  return result
}

/** ระยะประกันที่แอดมินกรอกไว้ — รวม 3 หน่วยเป็นระยะเวลาเดียว */
export type WarrantyDuration = { years: number; months: number; days: number }

/**
 * บวกระยะประกันเข้ากับวันเริ่มต้น
 * บวกปี+เดือนก่อน (ให้ตกวันเดียวกันของเดือนปลายทาง) แล้วค่อยบวกวันเป็นลำดับสุดท้าย
 */
export function addDuration(date: Date, duration: WarrantyDuration): Date {
  const withMonths = addMonths(date, duration.years * 12 + duration.months)
  withMonths.setDate(withMonths.getDate() + duration.days)
  return withMonths
}

/**
 * ระยะห่างระหว่างสองวันในรูป ปี/เดือน/วัน — เป็นอินเวอร์สของ addDuration
 * addDuration(start, durationBetween(start, end)) จะได้ end กลับมา
 * (ยกเว้นกรณีวันล้นเดือนที่ addMonths ตัดให้ เช่น 31 ม.ค. + 1 เดือน = 28 ก.พ.)
 *
 * นับแบบผลต่างตรง ๆ ไม่บวกวันสุดท้ายเพิ่ม เพื่อให้ตรงกับ addDuration ที่ระบบใช้
 * คำนวณ warranty_end ตอนเริ่มประกัน — 1 ม.ค. ถึง 31 ธ.ค. จึงได้ 11 เดือน 30 วัน ไม่ใช่ 1 ปี
 */
export function durationBetween(start: Date, end: Date): WarrantyDuration {
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  // ถอยหนึ่งเดือนถ้าบวกแล้วเลย end ไป (เช่น 15 ม.ค. → 10 ก.พ. ยังไม่ครบ 1 เดือน)
  if (addMonths(start, months) > end) months--
  if (months < 0) return { years: 0, months: 0, days: 0 }

  const afterMonths = addMonths(start, months)
  const days = Math.max(0, Math.round((end.getTime() - afterMonths.getTime()) / 86_400_000))
  return { years: Math.floor(months / 12), months: months % 12, days }
}

/** ทดเดือนเกิน 12 ขึ้นเป็นปี — 18 เดือน → 1 ปี 6 เดือน */
export function normalizeDuration(duration: WarrantyDuration): WarrantyDuration {
  const totalMonths = duration.years * 12 + duration.months
  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days: duration.days,
  }
}

/** แสดงระยะประกันเป็นข้อความไทย เช่น "1 ปี 6 เดือน 15 วัน" (ตัดหน่วยที่เป็น 0 ออก) */
export function formatDuration(duration: WarrantyDuration): string {
  const { years, months, days } = normalizeDuration(duration)
  const parts: string[] = []
  if (years > 0) parts.push(`${years} ปี`)
  if (months > 0) parts.push(`${months} เดือน`)
  if (days > 0) parts.push(`${days} วัน`)
  return parts.length > 0 ? parts.join(' ') : '—'
}

/** ดึงระยะประกันออกจากแถวข้อมูลที่ query มา */
export function toDuration(row: {
  warranty_years?: number | null
  warranty_months?: number | null
  warranty_days?: number | null
}): WarrantyDuration {
  return {
    years: Number(row.warranty_years ?? 0),
    months: Number(row.warranty_months ?? 0),
    days: Number(row.warranty_days ?? 0),
  }
}

/** yyyy-mm-dd ตามเวลาท้องถิ่น (ไม่ใช้ toISOString เพราะจะเพี้ยนตาม timezone) */
export function toDateString(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** yyyy-mm-dd → Date เวลาท้องถิ่น (คืน null ถ้ารูปแบบไม่ถูกต้อง) */
export function fromDateString(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * ระยะประกันที่จะบันทึกจริงของผลิตภัณฑ์
 * ถ้าแอดมินกรอกทั้งวันเริ่มและวันสิ้นสุด ให้คำนวณจากช่วงวันนั้นแทนค่าที่กรอกในช่อง ปี/เดือน/วัน
 * ใช้ร่วมกันทั้งฝั่ง client (พรีวิว) และ API เพื่อให้ได้ผลลัพธ์ตรงกันเสมอ
 */
export function resolveWarrantyDuration(
  duration: WarrantyDuration,
  startDate: string | null,
  endDate: string | null
): WarrantyDuration {
  const start = fromDateString(startDate)
  const end = fromDateString(endDate)
  if (!start || !end || end < start) return duration
  return durationBetween(start, end)
}

/** จำนวนวันคงเหลือจนหมดประกัน (ติดลบ = หมดแล้ว) */
export function daysLeft(warrantyEnd: string, from = new Date()): number {
  const end = new Date(`${warrantyEnd}T00:00:00`)
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

export function isInWarranty(warrantyEnd: string, from = new Date()): boolean {
  return daysLeft(warrantyEnd, from) >= 0
}

export type WarrantyState = 'not_started' | 'active' | 'expired'

/** warranty_end เป็น null หมายถึงลงทะเบียนแล้วแต่แอดมินยังไม่กด "เริ่มประกัน" */
export function warrantyState(warrantyEnd: string | null, from = new Date()): WarrantyState {
  if (!warrantyEnd) return 'not_started'
  return isInWarranty(warrantyEnd, from) ? 'active' : 'expired'
}

export const WARRANTY_STATE_LABEL: Record<WarrantyState, string> = {
  not_started: 'ยังไม่เริ่มประกัน',
  active: 'อยู่ในประกัน',
  expired: 'หมดประกันแล้ว',
}

/** PDPA: ปิดบังเบอร์โทรก่อนแสดงในหน้า public — 0812345678 → 08x-xxx-5678 */
export function maskPhone(phone: string): string {
  if (phone.length !== 10) return phone
  return `${phone.slice(0, 2)}x-xxx-${phone.slice(6)}`
}

/** เลขที่เคสสำหรับแสดงผล — 12 → CASE-000012 */
export function caseNumber(id: number): string {
  return `CASE-${String(id).padStart(6, '0')}`
}

export const ISSUE_STATUS_LABEL: Record<string, string> = {
  pending: 'รอดำเนินการ',
  in_progress: 'กำลังดำเนินการ',
  resolved: 'แก้ไขแล้ว',
  closed: 'ปิดเคส',
}

export const SN_STATUS_LABEL: Record<string, string> = {
  available: 'ยังไม่ลงทะเบียน',
  registered: 'ลงทะเบียนแล้ว',
  void: 'ยกเลิก',
}

export type SnDisplayStatus = 'available' | 'started' | 'registered' | 'void'

/**
 * สถานะที่ควรโชว์ให้แอดมินดู — ต่างจาก serial_numbers.status ดิบตรงที่แยก
 * "แอดมินเริ่มประกันตรง ยังไม่มีลูกค้า" (started) ออกจาก "ลูกค้าลงทะเบียนเองแล้ว" (registered)
 * แม้ทั้งคู่จะเก็บเป็น status = 'registered' เหมือนกันในฐานข้อมูลก็ตาม
 */
export function snDisplayStatus(snStatus: string, phone: string | null): SnDisplayStatus {
  if (snStatus === 'void') return 'void'
  if (snStatus === 'available') return 'available'
  return phone ? 'registered' : 'started'
}

export const SN_DISPLAY_STATUS_LABEL: Record<SnDisplayStatus, string> = {
  available: 'ยังไม่ลงทะเบียน',
  started: 'เริ่มประกันแล้ว',
  registered: 'ลงทะเบียนแล้ว',
  void: 'ยกเลิก',
}
