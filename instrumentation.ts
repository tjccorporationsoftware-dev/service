// Next.js เรียก register() ครั้งเดียวตอน server เริ่มทำงาน
// ใช้พิมพ์ว่า process นี้ต่อฐานข้อมูลไหน — กันเหตุ "แก้ข้อมูลฐานหนึ่ง แต่ dev server ชี้อีกฐาน"
// พิมพ์เฉพาะตอน dev/test เท่านั้น — production ไม่ log ชื่อฐานออก console
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NODE_ENV === 'production') return

  // import แบบ dynamic เพื่อไม่ให้ mysql2 ถูกดึงเข้า runtime อื่น (mysql2 อยู่ใน serverExternalPackages)
  // createPool ไม่ได้เปิดคอนเนกชันทันที การ import ตรงนี้จึงไม่ทำให้ boot ช้าลง
  const { dbTarget } = await import('@/lib/db')

  const rateLimit = process.env.RATE_LIMIT_ENABLED ?? '(ไม่ได้ตั้ง — ปิดตอน dev)'
  console.log(`\n  ⚑ ฐานข้อมูล: ${dbTarget}  ·  RATE_LIMIT_ENABLED=${rateLimit}\n`)
}
