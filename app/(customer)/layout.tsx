import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { CustomerNav } from '@/components/customer-nav'

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-app-canvas">
      <header className="sticky top-0 z-10 border-b border-navy-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white shadow-soft">
              <ShieldCheck className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <span className="text-[15px] font-semibold text-navy-900">ASCENT CARE</span>
          </Link>
          <CustomerNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">{children}</main>

      <footer className="border-t border-navy-100 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-5 text-center text-xs text-navy-400">
          ระบบลงทะเบียนรับประกันสินค้า ·{' '}
          <Link href="/admin/login" className="transition hover:text-navy-600 hover:underline">
            สำหรับเจ้าหน้าที่
          </Link>
        </div>
      </footer>
    </div>
  )
}
