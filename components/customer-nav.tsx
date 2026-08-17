'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileSignature, Search, Wrench } from 'lucide-react'

const NAV = [
  { href: '/register', label: 'ลงทะเบียนผลิตภัณฑ์', icon: FileSignature },
  { href: '/report', label: 'แจ้งปัญหา', icon: Wrench },
  { href: '/status', label: 'เช็คสถานะ', icon: Search },
]

export function CustomerNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {NAV.map((item) => {
        const active = pathname === item.href
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-medium transition ${
              active ? 'bg-brand-50 text-brand-700' : 'text-navy-500 hover:bg-navy-50 hover:text-navy-800'
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
