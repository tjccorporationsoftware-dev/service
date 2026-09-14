// Next.js เรียก register() ครั้งเดียวตอน server เริ่มทำงาน
// ใช้พิมพ์ว่า process นี้ต่อฐานข้อมูลไหน — กันเหตุ "แก้ข้อมูลฐานหนึ่ง แต่ dev server ชี้อีกฐาน"
// พิมพ์เฉพาะตอน dev/test เท่านั้น — production ไม่ log ชื่อฐานออก console
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // ตรวจ BRAND_COLOR_PRIMARY ตั้งแต่ boot ทุกโหมด (รวม production) — hex ผิดรูปแบบจะ throw ตรงนี้ทันที
  // Next จะพิมพ์ error ลง log ตอนสตาร์ตและตอบ 500 ทุก request (process ไม่ตาย) — เห็นใน err.log ได้ทันที
  // โดยไม่ต้องรอใครเปิดหน้าเว็บ ขั้นนี้ไม่ log ค่าอื่นออกไป
  const { getBrand } = await import('@/lib/brand')
  const brand = getBrand()

  if (process.env.NODE_ENV === 'production') return

  // import แบบ dynamic เพื่อไม่ให้ mysql2 ถูกดึงเข้า runtime อื่น (mysql2 อยู่ใน serverExternalPackages)
  // createPool ไม่ได้เปิดคอนเนกชันทันที การ import ตรงนี้จึงไม่ทำให้ boot ช้าลง
  const { dbTarget } = await import('@/lib/db')

  const rateLimit = process.env.RATE_LIMIT_ENABLED ?? '(ไม่ได้ตั้ง — ปิดตอน dev)'
  const theme = brand.configured
    ? `BRAND_COLOR_PRIMARY=${brand.colorPrimary}${brand.adjusted ? ` (ปรับเฉด 500 เป็น ${brand.shades[500]})` : ''}`
    : '(ไม่ได้ตั้ง — ใช้ palette เริ่มต้นจาก globals.css)'
  console.log(
    `\n  ⚑ ฐานข้อมูล: ${dbTarget}  ·  RATE_LIMIT_ENABLED=${rateLimit}\n  ⚑ ธีมสี: ${theme}\n`
  )
}
