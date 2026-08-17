import type { Metadata } from 'next'
import { Prompt } from 'next/font/google'
import './globals.css'

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
  return (
    <html lang="th" className={`h-full antialiased ${prompt.variable}`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
