import type { ComponentProps, ReactNode } from 'react'
import Link from 'next/link'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-navy-100 bg-white p-6 shadow-soft ${className}`}>
      {children}
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
  'w-full rounded-xl border border-navy-100 bg-white px-3.5 py-2.5 text-[0.95rem] text-navy-900 ' +
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

/** Input พร้อมไอคอนนำหน้า — ใช้กับเบอร์โทร / Serial Number ให้ดูมีทิศทางว่ากรอกอะไร */
export function InputWithIcon({
  icon: Icon,
  className = '',
  ...props
}: ComponentProps<'input'> & { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-navy-300" />
      <Input className={`pl-10 ${className}`} {...props} />
    </div>
  )
}

function buttonClasses(
  variant: 'primary' | 'secondary' | 'danger',
  size: 'md' | 'lg' | 'xl',
  className: string
) {
  const variants = {
    // disabled ใช้พื้น 100 + ตัวหนังสือ 400 (ไม่ใช่ขาวบน 200) — palette ที่ไล่จาก BRAND_COLOR_PRIMARY สีอ่อนจะยังอ่านออก
    primary:
      'bg-brand-600 text-white shadow-soft hover:bg-brand-700 active:bg-brand-800 ' +
      'disabled:bg-brand-100 disabled:text-brand-400 disabled:shadow-none',
    secondary:
      'border border-navy-200 bg-white text-navy-700 hover:border-brand-300 hover:bg-brand-50/60 hover:text-brand-700 ' +
      'disabled:text-navy-300 disabled:hover:border-navy-200 disabled:hover:bg-white',
    danger: 'bg-rose-600 text-white shadow-soft hover:bg-rose-700 disabled:bg-rose-200',
  }
  const sizes = {
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3.5 text-base',
    xl: 'px-8 py-4 text-lg',
  }
  return `inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: 'primary' | 'secondary' | 'danger'; size?: 'md' | 'lg' | 'xl' }) {
  return <button className={buttonClasses(variant, size, className)} {...props} />
}

/** ปุ่มที่เป็นลิงก์จริง (next/link) — กัน <button> ซ้อนใน <a> ซึ่งผิดสเปก HTML */
export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  className = '',
  children,
}: {
  href: string
  variant?: 'primary' | 'secondary'
  size?: 'md' | 'lg' | 'xl'
  className?: string
  children: ReactNode
}) {
  return (
    <Link href={href} className={buttonClasses(variant, size, className)}>
      {children}
    </Link>
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
  green: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  red: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
  amber: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
  blue: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200',
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
  in_progress: 'blue',
  resolved: 'green',
  closed: 'slate',
}

const iconCircleTones = {
  brand: 'bg-brand-50 text-brand-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
} as const

/** วงกลมไอคอน — ใช้กับหัวการ์ดฟีเจอร์หน้าแรก, หน้าสำเร็จ, หัวข้อฟอร์ม */
export function IconCircle({
  icon: Icon,
  tone = 'brand',
  size = 'md',
  className = '',
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  tone?: keyof typeof iconCircleTones
  size?: 'md' | 'lg'
  className?: string
}) {
  const sizes = { md: 'h-11 w-11', lg: 'h-14 w-14' }
  const iconSizes = { md: 'h-5 w-5', lg: 'h-6 w-6' }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-2xl ${sizes[size]} ${iconCircleTones[tone]} ${className}`}
    >
      <Icon className={iconSizes[size]} strokeWidth={2} />
    </div>
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
