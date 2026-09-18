import type { NextConfig } from 'next'

// dev server บล็อก request ข้าม origin โดยดีฟอลต์ (กันโดนโจมตีจากเว็บอื่น)
// ถ้าจะเปิดให้เครื่องอื่นในวง LAN เข้าถึงตอน `npm run dev` ให้ตั้ง DEV_ALLOWED_ORIGINS ใน .env.local
// คั่นหลายค่าด้วย comma เช่น DEV_ALLOWED_ORIGINS=192.168.1.20,192.168.1.21 แล้ว restart dev server
// ไม่ตั้ง = รับเฉพาะ localhost — ไม่ hardcode IP ไว้ในไฟล์นี้เพราะ repo เป็น public
const devAllowedOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const nextConfig: NextConfig = {
  // mysql2 และ bcryptjs โหลดโมดูลแบบ dynamic — ปล่อยให้ Node require ตรง ๆ แทนการ bundle
  serverExternalPackages: ['mysql2', 'bcryptjs'],

  ...(devAllowedOrigins.length > 0 && { allowedDevOrigins: devAllowedOrigins }),
}

export default nextConfig
