import { timingSafeEqual } from 'node:crypto'

/**
 * ยืนยันตัวตนสำหรับ "เครื่องคุยกับเครื่อง" — ใช้โดย /api/service/* ซึ่งระบบแจ้งซ่อม (PHP) เรียกเข้ามา
 *
 * แยกจาก requireAdmin() โดยเจตนา: ตรงนั้นเป็น JWT ใน cookie ของ "คน" ที่ล็อกอินหน้าเว็บ
 * ส่วนตรงนี้เป็นระบบอื่นเรียกมา ไม่มี session ไม่มีเบราว์เซอร์ จึงใช้ key คงที่ใน env แทน
 *
 * ไม่ตั้ง SERVICE_API_KEY = ปิดช่องทางนี้ทั้งหมด (ตอบ 503) — ค่าเริ่มต้นจึงปลอดภัยเสมอ
 * deploy ที่ยังไม่ได้ใช้ API จะไม่มีทางเปิดรูไว้โดยไม่ตั้งใจ
 */

/** ความยาวขั้นต่ำของ key — สั้นกว่านี้เดาได้ง่ายเกินไป */
const MIN_KEY_LENGTH = 32

export type ServiceAuthResult = { ok: true } | { ok: false; response: Response }

function unauthorized(): Response {
  // ไม่บอกว่าผิดเพราะไม่มี header หรือ key ไม่ตรง — กันคนเดาว่าเดามาถูกทางแล้ว
  return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })
}

/** เทียบ key แบบใช้เวลาเท่ากันทุกกรณี กันเดาทีละตัวอักษรจากเวลาที่ตอบกลับ */
function keysMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    // ยาวไม่เท่ากันก็ยังต้องเทียบให้เสียเวลาพอ ๆ กัน ไม่ใช่ตอบกลับทันที
    timingSafeEqual(a, a)
    return false
  }
  return timingSafeEqual(a, b)
}

export function requireServiceKey(request: Request): ServiceAuthResult {
  const expected = process.env.SERVICE_API_KEY

  if (!expected) {
    return {
      ok: false,
      response: Response.json(
        { error: 'ช่องทางนี้ยังไม่เปิดใช้งาน — ผู้ดูแลระบบต้องตั้งค่า SERVICE_API_KEY ก่อน' },
        { status: 503 }
      ),
    }
  }

  if (expected.length < MIN_KEY_LENGTH) {
    // ตั้ง key สั้นเกินไป = อันตรายกว่าปิดไว้ ให้ถือว่ายังไม่เปิดใช้งาน และบอกให้ไปแก้
    console.error(
      `SERVICE_API_KEY สั้นเกินไป (${expected.length} ตัวอักษร) — ต้องอย่างน้อย ${MIN_KEY_LENGTH} ตัว จึงยังไม่เปิดใช้งานช่องทางนี้`
    )
    return {
      ok: false,
      response: Response.json({ error: 'ช่องทางนี้ยังไม่เปิดใช้งาน' }, { status: 503 }),
    }
  }

  const header = request.headers.get('authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!given || !keysMatch(given, expected)) {
    return { ok: false, response: unauthorized() }
  }

  return { ok: true }
}
