import type { ComponentProps, ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border border-navy-100 bg-white shadow-soft ${
        padded ? 'p-6' : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold text-navy-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-navy-400">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-navy-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-navy-400">{hint}</span>}
    </label>
  )
}

const controlClass =
  'w-full rounded-xl border border-navy-100 bg-white px-3.5 py-2.5 text-[0.925rem] text-navy-900 ' +
  'placeholder:text-navy-300 outline-none transition ' +
  'focus:border-brand-400 focus:ring-4 focus:ring-brand-100 ' +
  'disabled:bg-navy-50 disabled:text-navy-300'

export function Input({ className = '', ...props }: ComponentProps<'input'>) {
  return <input className={`${controlClass} ${className}`} {...props} />
}

export function Select({ className = '', ...props }: ComponentProps<'select'>) {
  return <select className={`${controlClass} ${className}`} {...props} />
}

export function Textarea({ className = '', ...props }: ComponentProps<'textarea'>) {
  return <textarea className={`${controlClass} ${className}`} {...props} />
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const variants = {
    // disabled ใช้พื้น 100 + ตัวหนังสือ 400 (ไม่ใช่ขาวบน 200) — palette ที่ไล่จาก BRAND_COLOR_PRIMARY สีอ่อนจะยังอ่านออก
    primary:
      'bg-brand-600 text-white shadow-soft hover:bg-brand-700 active:bg-brand-800 ' +
      'disabled:bg-brand-100 disabled:text-brand-400 disabled:shadow-none',
    secondary:
      'border border-navy-200 bg-white text-navy-700 hover:border-brand-300 hover:bg-brand-50/60 hover:text-brand-700 ' +
      'disabled:text-navy-300 disabled:hover:border-navy-200 disabled:hover:bg-white',
    danger: 'bg-rose-600 text-white shadow-soft hover:bg-rose-700 disabled:bg-rose-200 disabled:shadow-none',
    ghost: 'text-navy-500 hover:bg-navy-50 hover:text-navy-800',
  }
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export function Alert({
  tone,
  children,
}: {
  tone: 'error' | 'success' | 'warning' | 'info'
  children: ReactNode
}) {
  const tones = {
    error: 'border-rose-100 border-l-rose-500 bg-rose-50 text-rose-800',
    success: 'border-emerald-100 border-l-emerald-500 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-100 border-l-amber-500 bg-amber-50 text-amber-900',
    info: 'border-brand-100 border-l-brand-500 bg-brand-50 text-brand-800',
  }
  return (
    <div
      className={`rounded-xl border border-l-4 px-4 py-3 text-sm leading-relaxed ${tones[tone]}`}
      role="status"
    >
      {children}
    </div>
  )
}

const badgeTones = {
  brand: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200',
  green: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  red: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
  amber: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
  slate: 'bg-navy-50 text-navy-600 ring-1 ring-inset ring-navy-200',
} as const

export function Badge({
  tone = 'slate',
  children,
}: {
  tone?: keyof typeof badgeTones
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${badgeTones[tone]}`}
    >
      {children}
    </span>
  )
}

export const ISSUE_STATUS_TONE: Record<string, keyof typeof badgeTones> = {
  pending: 'amber',
  in_progress: 'brand',
  resolved: 'green',
  closed: 'slate',
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold tracking-wide text-navy-400 uppercase">
      {children}
    </th>
  )
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3.5 align-top text-navy-700 ${className}`}>{children}</td>
}

export function TableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 text-center text-sm text-navy-300">
        {children}
      </td>
    </tr>
  )
}

export function TableLoading({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 text-center">
        <span className="inline-flex items-center gap-2 text-sm text-navy-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          กำลังโหลด…
        </span>
      </td>
    </tr>
  )
}

export function Pagination({
  meta,
  onChange,
}: {
  meta: { total: number; page: number; total_pages: number }
  onChange: (page: number) => void
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-navy-50 pt-4 text-sm">
      <span className="text-navy-400">
        ทั้งหมด <span className="font-medium text-navy-600">{meta.total.toLocaleString('th-TH')}</span>{' '}
        รายการ · หน้า {meta.page} / {meta.total_pages}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={meta.page <= 1} onClick={() => onChange(meta.page - 1)}>
          <ChevronLeft className="h-4 w-4" />
          ก่อนหน้า
        </Button>
        <Button
          variant="secondary"
          disabled={meta.page >= meta.total_pages}
          onClick={() => onChange(meta.page + 1)}
        >
          ถัดไป
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

const statTones = {
  brand: { bg: 'bg-brand-50', icon: 'text-brand-600' },
  green: { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
  amber: { bg: 'bg-amber-50', icon: 'text-amber-600' },
  red: { bg: 'bg-rose-50', icon: 'text-rose-600' },
  slate: { bg: 'bg-navy-50', icon: 'text-navy-500' },
} as const

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'slate',
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  label: string
  value: number
  hint?: string
  tone?: keyof typeof statTones
}) {
  const t = statTones[tone]
  return (
    <Card className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-navy-400">{label}</p>
        <p className="tabular mt-1.5 text-3xl font-bold tracking-tight text-navy-900">
          {value.toLocaleString('th-TH')}
        </p>
        {hint && <p className="mt-1 truncate text-xs text-navy-400">{hint}</p>}
      </div>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${t.bg}`}>
        <Icon className={`h-5 w-5 ${t.icon}`} strokeWidth={2} />
      </div>
    </Card>
  )
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
