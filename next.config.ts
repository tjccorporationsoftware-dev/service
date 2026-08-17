import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // mysql2 และ bcryptjs โหลดโมดูลแบบ dynamic — ปล่อยให้ Node require ตรง ๆ แทนการ bundle
  serverExternalPackages: ['mysql2', 'bcryptjs'],

  // dev server บล็อก request ข้าม origin โดยดีฟอลต์ (กันโดนโจมตีจากเว็บอื่น)
  // ต้องเพิ่ม IP ที่นี่ถ้าจะเปิดให้เครื่องอื่นในวง LAN เข้าถึงตอน `npm run dev`
  // ถ้า IP เครื่องเปลี่ยน (เช่น DHCP จ่ายใหม่) ให้แก้ตรงนี้แล้ว restart dev server
  // IP เครื่องนี้เด้งกลับไปมาระหว่าง 2 ค่านี้จาก DHCP เลยใส่ไว้ทั้งคู่กันพัง
  allowedDevOrigins: ['192.168.103.87'],
}

export default nextConfig
