// รูปแบบรหัส Serial Number — โมดูลบริสุทธิ์ ไม่พึ่ง node/db จึง import ได้ทั้งฝั่ง server และ client
// แยกออกมาจาก sn-generator.ts เพื่อให้หน้าจอแอดมินแสดงตัวอย่างด้วยสูตรเดียวกับตอนสร้างจริง
//
// โครงสร้าง: ตัวนำหน้า + รหัสรุ่น + ปี(ค.ศ. 2 หลัก) + เดือน(2 หลัก) + เลขลำดับ 6 หลัก
//   B      01        26        08        000001      ->  B012608000001

export const SEQUENCE_PAD = 6

/**
 * ปี ค.ศ. 2 หลักต่อด้วยเดือน 2 หลัก จาก "เวลาท้องถิ่น" ของเครื่อง
 * ใช้ getFullYear/getMonth ไม่ใช่ตัว UTC เพราะไทยเป็น UTC+7 —
 * ถ้าใช้ UTC การสร้าง SN ช่วงเที่ยงคืนถึงตี 7 จะได้เดือนของเมื่อวาน
 */
export function snDateCode(date: Date = new Date()): string {
  const yy = String(date.getFullYear() % 100).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${yy}${mm}`
}

/** ประกอบรหัส SN หนึ่งตัว เช่น buildStructuredSn('B', '01', 1) -> 'B012608000001' */
export function buildStructuredSn(
  prefix: string,
  modelCode: string,
  sequence: number,
  date: Date = new Date()
): string {
  return `${prefix}${modelCode}${snDateCode(date)}${String(sequence).padStart(SEQUENCE_PAD, '0')}`
}

/** ตัวอย่างรูปแบบสำหรับโชว์ในหน้าจอ/audit log เช่น 'B012608xxxxxx' */
export function snPatternHint(
  prefix: string,
  modelCode: string,
  date: Date = new Date()
): string {
  return `${prefix}${modelCode}${snDateCode(date)}${'x'.repeat(SEQUENCE_PAD)}`
}
