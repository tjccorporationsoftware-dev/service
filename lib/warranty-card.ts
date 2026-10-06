import { stat } from 'node:fs/promises'
import path from 'node:path'
import { execute, query } from './db'

/**
 * ใบรับประกันที่พิมพ์จากหน้า /admin/warranty-print
 *
 * - รูปหัวกระดาษ (ลายคลื่น + โลโก้ กว้างเต็ม A4 พื้นโปร่งใส) อ่านจาก template/warranty-header.png
 *   ไม่อยู่ใน git เหมือน manual/ — แต่ละบริษัทใช้หัวกระดาษของตัวเอง ต้องคัดลอกขึ้นเซิร์ฟเวอร์เอง
 *   เสิร์ฟผ่าน /api/admin/warranty-print/header (ไฟล์ ~1MB ไม่ฝังเป็น data URI — พิมพ์หลายใบจะได้โหลดครั้งเดียว)
 * - ข้อความเงื่อนไข / หมายเหตุท้ายใบ / ข้อมูลบริษัทมุมขวาบน แอดมินแก้ได้จากหน้าเว็บ เก็บในตาราง app_settings ของแต่ละบริษัท
 *   ยังไม่เคยบันทึก (หรือฐานยังไม่มีตาราง) = ใช้ข้อความตั้งต้นด้านล่าง ซึ่งยกมาจากแบบใบรับประกันของ ASCENT (template/ASCENT - ใบรับประกันสินค้า.pdf)
 */
export const WARRANTY_HEADER_PATH = path.join(process.cwd(), 'template', 'warranty-header.png')

export type WarrantyCardTexts = { conditions: string; footnote: string; company: string }

export const DEFAULT_WARRANTY_CARD_TEXTS: WarrantyCardTexts = {
  conditions: [
    // บรรทัดที่ไม่มีเลขข้อ = ขึ้นบรรทัดใหม่ภายในข้อก่อนหน้า — ตัดก่อนคำว่า "โดย" ตามแบบ
    '1. ความเสียหายอันเกิดจากความบกพร่อง หรือผิดพลาดจากโรงงานผู้ผลิต ทางบริษัทฯ รับประกันการซ่อมและเปลี่ยนอะไหล่ให้ฟรี',
    'โดยไม่คิดมูลค่าภายในระยะเวลาประกันสินค้านับจากวันที่ซื้อสินค้า',
    '2. การรับประกันนี้ไม่ครอบคลุมถึงความชำรุดเสียหาย ในกรณีดังต่อไปนี้',
    '2.1) การซ่อม ดัดแปลง แก้ไข โดยบุคคลอื่น ซึ่งไม่ใช่ช่างของบริษัทฯ',
    '2.2) การใช้สินค้าผิดประเภท หรืออุบัติเหตุ การขนส่ง ความประมาทเกี่ยวกับการรักษาผิดวิธี ภัยธรรมชาติ ฯลฯ',
    '2.3) ใช้งานผิดวัตถุประสงค์และไม่ปฏิบัติตามคำแนะนำในคู่มือการใช้งาน',
    '2.4) สินค้ามีสภาพผิดปกติไปจากเดิมทางรูปทรงได้แก่ แตก, หัก, บิ่น, งอ, ยุบ, เบี้ยว, ร้าว, ทะลุ และมีบางส่วนขาดหายไป',
  ].join('\n'),
  footnote: [
    '*หากอุปกรณ์ไม่สามารถใช้งานได้ตามปกติ หรือมีข้อสงสัยในการใช้งาน',
    'สามารถติดต่อได้ที่เบอร์ 090-618-7997 ต่อ 2',
  ].join('\n'),
  company: [
    'ASCENT CORPORATION CO., LTD',
    '214/201, Moo 5, Mae Hia Subdistrict Mueang',
    'Chiang Mai District, Chiang Mai Province 50100',
    'Email: ascentcorp.info@gmail.com',
    'Tel : +66 90618 7997',
    'www.ascent-corporation.co.th',
  ].join('\n'),
}

const SETTING_KEYS: Record<keyof WarrantyCardTexts, string> = {
  conditions: 'warranty_card.conditions',
  footnote: 'warranty_card.footnote',
  company: 'warranty_card.company',
}

/** ตารางใหม่ (app_settings / warranty_card_prints) ยังไม่ถูกสร้าง — ฐานของบริษัทนั้นยังไม่ได้รัน npm run db:init หลังอัปเดต */
export function isMissingTable(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && err.code === 'ER_NO_SUCH_TABLE')
}

/** ข้อความที่บันทึกไว้ (ไม่มี = ค่าตั้งต้น) — ฐานยังไม่มีตารางก็ยังพิมพ์ได้ด้วยค่าตั้งต้น */
export async function getWarrantyCardTexts(): Promise<WarrantyCardTexts> {
  let rows: { setting_key: string; setting_value: string }[] = []
  try {
    rows = await query<{ setting_key: string; setting_value: string }>(
      'SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?, ?, ?)',
      [SETTING_KEYS.conditions, SETTING_KEYS.footnote, SETTING_KEYS.company]
    )
  } catch (err) {
    if (!isMissingTable(err)) throw err
  }
  const saved = new Map(rows.map((r) => [r.setting_key, r.setting_value]))
  return {
    conditions: saved.get(SETTING_KEYS.conditions) ?? DEFAULT_WARRANTY_CARD_TEXTS.conditions,
    footnote: saved.get(SETTING_KEYS.footnote) ?? DEFAULT_WARRANTY_CARD_TEXTS.footnote,
    company: saved.get(SETTING_KEYS.company) ?? DEFAULT_WARRANTY_CARD_TEXTS.company,
  }
}

export async function saveWarrantyCardTexts(texts: WarrantyCardTexts, adminId: number): Promise<void> {
  for (const key of ['conditions', 'footnote', 'company'] as const) {
    await execute(
      `INSERT INTO app_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
      [SETTING_KEYS[key], texts[key], adminId]
    )
  }
}

/** URL รูปหัวกระดาษ (ต่อท้ายเวลาแก้ไขไฟล์ กัน cache รูปเก่า) — null ถ้าเครื่องนี้ยังไม่ได้วางไฟล์ */
export async function warrantyHeaderUrl(): Promise<string | null> {
  try {
    const info = await stat(WARRANTY_HEADER_PATH)
    return info.isFile() ? `/api/admin/warranty-print/header?v=${Math.floor(info.mtimeMs)}` : null
  } catch {
    return null
  }
}
