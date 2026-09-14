'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  ClipboardList,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  MessageSquareWarning,
  Package,
  QrCode,
  ScanLine,
  ShieldCheck,
  X,
} from 'lucide-react'

const LINKS = [
  { href: '/admin/dashboard', label: 'ภาพรวม', icon: LayoutDashboard },
  { href: '/admin/products', label: 'ผลิตภัณฑ์', icon: Package },
    { href: '/admin/sn-setup', label: 'ตั้งค่ารหัส SN', icon: ListOrdered },
  { href: '/admin/serial-numbers', label: 'Serial Number', icon: QrCode },
  { href: '/admin/registrations', label: 'การลงทะเบียน', icon: ClipboardList },
  { href: '/admin/issues', label: 'คำขอรับบริการ', icon: MessageSquareWarning },
  { href: '/admin/qrcode', label: 'สร้าง QR Code', icon: ScanLine },
]

type Session = { username: string; displayName: string | null; role: 'admin' | 'staff' }

function initialOf(session: Session) {
  return (session.displayName || session.username || '?').trim().slice(0, 1).toUpperCase()
}

export function AdminShell({ session, children }: { session: Session; children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen bg-app-canvas">
      {/* แถบบนสำหรับจอเล็ก — เปิด sidebar แบบ overlay */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-navy-100 bg-white px-4 md:hidden">
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-navy-500 transition hover:bg-navy-50"
          aria-label="เปิดเมนู"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold text-navy-900">ระบบหลังบ้าน</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
          {initialOf(session)}
        </div>
      </div>

      {open && (
        <button
          aria-label="ปิดเมนู"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-navy-900/40 backdrop-blur-[1px] md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-64 flex-col border-r border-navy-100 bg-white/90 shadow-soft-lg backdrop-blur-sm transition-transform duration-200 ease-out md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white shadow-soft">
              <ShieldCheck className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <p className="text-xs text-navy-400">ASCENT CARE</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-navy-400 transition hover:bg-navy-50 md:hidden"
            aria-label="ปิดเมนู"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pt-1">
          {LINKS.map((link) => {
            const active = pathname === link.href
            const Icon = link.icon
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active ? 'bg-brand-50 text-brand-700' : 'text-navy-500 hover:bg-navy-50 hover:text-navy-800'
                }`}
              >
                {active && (
                  <span className="absolute top-1.5 bottom-1.5 left-0 w-1 rounded-full bg-brand-500" />
                )}
                <Icon
                  className={`h-[18px] w-[18px] shrink-0 ${
                    active ? 'text-brand-600' : 'text-navy-400 group-hover:text-brand-600'
                  }`}
                  strokeWidth={2}
                />
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-navy-100 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-navy-50/70 px-3 py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
              {initialOf(session)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-navy-900">
                {session.displayName || session.username}
              </p>
              <p className="text-xs text-navy-400">{session.role === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงาน'}</p>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <div className="flex min-h-screen flex-col pt-14 md:pt-0 md:pl-64">
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  )
}

export function LogoutButton() {
  const router = useRouter()

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.replace('/admin/login')
    router.refresh()
  }

  return (
    <button
      onClick={logout}
      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-navy-500 transition hover:bg-rose-50 hover:text-rose-600"
    >
      <LogOut className="h-[18px] w-[18px]" strokeWidth={2} />
      ออกจากระบบ
    </button>
  )
}
