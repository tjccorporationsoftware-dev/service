'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Alert, Button, Card, Field, Input } from '@/components/admin/ui'

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next') || '/admin/dashboard'

  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'เข้าสู่ระบบไม่สำเร็จ')
        return
      }
      router.replace(nextPath)
      router.refresh()
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy-900 px-4">
      {/* วงกลมฟ้าจางซ้อนชั้นให้พื้นหลังมีมิติ ไม่ใช้ gradient ฉูดฉาด */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -bottom-24 h-80 w-80 rounded-full bg-brand-400/10 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-soft-lg">
            <ShieldCheck className="h-6 w-6" strokeWidth={2.25} />
          </div>
          <h1 className="text-xl font-bold text-white">ระบบจัดการรับประกันสินค้า</h1>
          <p className="mt-1 text-sm text-navy-300">ASCENT WARRANTY</p>
        </div>

        <Card className="shadow-soft-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}

            <Field label="ชื่อผู้ใช้" required>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                autoComplete="username"
                autoFocus
                required
              />
            </Field>

            <Field label="รหัสผ่าน" required>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="current-password"
                required
              />
            </Field>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-navy-400">
          <Link
            href="/"
            className="inline-flex items-center gap-1 transition hover:text-navy-200 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            กลับหน้าลูกค้า
          </Link>
        </p>
      </div>
    </div>
  )
}
