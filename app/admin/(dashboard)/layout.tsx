import { getSession } from '@/lib/auth'
import { AdminShell } from '@/components/admin/sidebar'

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts กันไว้อีกชั้นแล้ว — session ต้องมีอยู่เสมอตรงนี้
  const session = await getSession()

  return (
    <AdminShell
      session={{
        username: session?.username ?? '',
        displayName: session?.displayName ?? null,
        role: session?.role ?? 'staff',
      }}
    >
      {children}
    </AdminShell>
  )
}
