import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import { Prompt } from 'next/font/google'
import { getBrand } from '@/lib/brand'
import './globals.css'

// ทุกหน้า render ตอน request ไม่ prerender ตอน build — ค่าแบรนด์มาจาก .env.local ของแต่ละชุด deploy
// ถ้าปล่อยให้ prerender (เดิม /, /register, /report, /status, /admin/login เป็น static) สีจากเครื่องที่ build
// จะถูกฝังลง HTML แล้วทุกชุดได้สีเดียวกัน — ตั้งไว้ที่ root layout จึงครอบทุก route อย่าถอดออก
export const dynamic = 'force-dynamic'

const prompt = Prompt({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-prompt',
})

export const metadata: Metadata = {
  title: 'ระบบลงทะเบียนรับประกันสินค้า',
  description: 'ลงทะเบียนรับประกัน แจ้งปัญหาตัวเครื่อง และตรวจสอบสถานะเคส',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // ตั้ง --color-brand-* ทับค่าใน globals.css — undefined เมื่อไม่ได้ตั้ง BRAND_COLOR_PRIMARY (ไม่ใส่ style เลย)
  const brand = getBrand()

  return (
    <html
      lang="th"
      className={`h-full antialiased ${prompt.variable}`}
      style={brand.cssVars as CSSProperties | undefined}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
