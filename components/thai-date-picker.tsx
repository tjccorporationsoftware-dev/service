'use client'

// ช่องวันที่แบบ พ.ศ. ใช้แทน <input type="date"> ของเบราว์เซอร์ (ซึ่งแสดงปี ค.ศ. เสมอ ควบคุมไม่ได้)
//
// สัญญาเดียวกับ input เดิม: `value` / `onChange` เป็น 'YYYY-MM-DD' ค.ศ. หรือ '' — พ.ศ. มีอยู่บนหน้าจอเท่านั้น
// ดังนั้น state ของฟอร์ม, Zod, API, DB ไม่ต้องรู้จัก พ.ศ. เลย
//
// ใช้ผ่าน `DateInput` ของ UI kit แต่ละฝั่ง (components/ui.tsx, components/admin/ui.tsx) ซึ่งส่ง controlClass ของตัวเองมาทาง
// `inputClassName` — ไฟล์นี้จึงไม่ผูกกับสไตล์ฝั่งใด และไม่ควร import UI kit เข้ามา

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  BE_OFFSET,
  THAI_MONTHS,
  THAI_WEEKDAYS_SHORT,
  daysInMonth,
  formatIso,
  isWithinRange,
  isoToThai,
  maskThaiDateInput,
  parseIso,
  shiftMonth,
  thaiToIso,
  todayIso,
  dateToParts,
} from '@/lib/thai-date'

export type ThaiDatePickerProps = {
  /** 'YYYY-MM-DD' ค.ศ. หรือ '' */
  value: string
  onChange: (iso: string) => void
  /** ขอบเขตแบบ ISO ค.ศ. เหมือน <input type="date"> — วันนอกช่วงกดเลือกไม่ได้ และพิมพ์แล้วถือว่าไม่ถูกต้อง */
  min?: string
  max?: string
  required?: boolean
  disabled?: boolean
  /** class ของช่องกรอก — UI kit แต่ละฝั่งส่ง controlClass ของตัวเองมา */
  inputClassName?: string
  placeholder?: string
  id?: string
  name?: string
  'aria-label'?: string
}

const POPUP_HEIGHT = 340

/** ช่วงปีใน dropdown — กว้างพอสำหรับวันซื้อย้อนหลังและวันหมดประกันในอนาคต */
const YEAR_BACK = 60
const YEAR_FORWARD = 20
const YEAR_HARD_LIMIT = 200

export function ThaiDatePicker({
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  inputClassName = '',
  placeholder = 'วว/ดด/ปปปป',
  id,
  name,
  'aria-label': ariaLabel,
}: ThaiDatePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<string | null>(null)
  const dialogId = useId()

  // ข้อความในช่องเป็น state ของตัวเอง เพราะระหว่างพิมพ์ยังแปลงเป็น ISO ไม่ได้
  const [text, setText] = useState(() => isoToThai(value))
  const [open, setOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const [view, setView] = useState(() => {
    const p = parseIso(value) ?? dateToParts(new Date())
    return { year: p.year, month: p.month }
  })

  /** ISO ที่ข้อความปัจจุบันหมายถึง — ต้องเป็นวันจริงและอยู่ในช่วง min/max ถึงจะนับ */
  function toValidIso(t: string): string | null {
    const iso = thaiToIso(t)
    return iso && isWithinRange(iso, min, max) ? iso : null
  }

  // ซิงก์ข้อความเมื่อ `value` ถูกเปลี่ยนจากข้างนอก (เลือกจากปฏิทิน / ฟอร์มถูก reset) — ทำตอน render ตามแบบ
  // "adjusting state when a prop changes" ของ React ไม่ใช้ effect (กฎ react-hooks ห้าม setState ใน effect)
  // ถ้าข้อความที่พิมพ์อยู่หมายถึง value นี้อยู่แล้ว (หรือกำลังพิมพ์ค้างและ value ว่าง) ไม่ทับ — กันตัวหนังสือหายกลางคัน
  const [syncedValue, setSyncedValue] = useState(value)
  if (value !== syncedValue) {
    setSyncedValue(value)
    if (toValidIso(text) !== (value || null)) setText(isoToThai(value))
  }

  const invalid = text !== '' && toValidIso(text) === null
  const today = todayIso()
  const selected = parseIso(value) ? value : ''

  function emit(iso: string) {
    if (iso !== value) onChange(iso)
  }

  function openCalendar(focusIso?: string) {
    if (disabled) return
    const rect = rootRef.current?.getBoundingClientRect()
    setOpenUp(!!rect && rect.bottom + POPUP_HEIGHT > window.innerHeight && rect.top > POPUP_HEIGHT)
    const base = parseIso(selected) ?? parseIso(focusIso ?? '') ?? dateToParts(new Date())
    setView({ year: base.year, month: base.month })
    pendingFocus.current = focusIso ?? (selected || null)
    setOpen(true)
  }

  function closeCalendar(refocus = true) {
    setOpen(false)
    if (refocus) inputRef.current?.focus()
  }

  function pick(iso: string) {
    emit(iso)
    setText(isoToThai(iso))
    closeCalendar()
  }

  // ปิดเมื่อคลิกนอกกล่อง
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [open])

  // ย้ายโฟกัสไปยังวันที่ที่ขอไว้หลังปฏิทิน render (เปิดครั้งแรก / เลื่อนเดือนด้วยคีย์บอร์ด)
  useEffect(() => {
    if (!open || !gridRef.current) return
    const target = pendingFocus.current
    pendingFocus.current = null
    const el =
      (target && gridRef.current.querySelector<HTMLButtonElement>(`[data-iso="${target}"]`)) ||
      gridRef.current.querySelector<HTMLButtonElement>('[data-iso]:not(:disabled)')
    el?.focus()
  }, [open, view])

  function handleTextChange(raw: string) {
    const masked = maskThaiDateInput(raw)
    setText(masked)
    emit(toValidIso(masked) ?? '')
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      openCalendar()
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      closeCalendar()
    }
  }

  function handleGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const iso = (event.target as HTMLElement).dataset.iso
    const p = parseIso(iso ?? '')
    if (!p) return
    const d = new Date(p.year, p.month - 1, p.day)
    switch (event.key) {
      case 'ArrowLeft': d.setDate(d.getDate() - 1); break
      case 'ArrowRight': d.setDate(d.getDate() + 1); break
      case 'ArrowUp': d.setDate(d.getDate() - 7); break
      case 'ArrowDown': d.setDate(d.getDate() + 7); break
      case 'Home': d.setDate(1); break
      case 'End': d.setDate(daysInMonth(p.year, p.month)); break
      case 'PageUp': d.setMonth(d.getMonth() - 1); break
      case 'PageDown': d.setMonth(d.getMonth() + 1); break
      default: return
    }
    event.preventDefault()
    const next = dateToParts(d)
    pendingFocus.current = formatIso(next)
    setView({ year: next.year, month: next.month })
  }

  // ปีใน dropdown — ขยายให้ครอบ min/max และปีที่กำลังดู เพื่อไม่ให้ค่าหายไปจากตัวเลือก
  // แต่ไม่เกิน ±YEAR_HARD_LIMIT จากปีนี้ (กัน max="9999-12-31" ที่ใส่ไว้กันปี 5 หลัก กลายเป็นตัวเลือกหลายพันรายการ)
  const yearAnchor = dateToParts(new Date()).year
  let yearStart = yearAnchor - YEAR_BACK
  let yearEnd = yearAnchor + YEAR_FORWARD
  for (const bound of [parseIso(min ?? '')?.year, parseIso(max ?? '')?.year, view.year]) {
    if (bound === undefined) continue
    yearStart = Math.max(Math.min(yearStart, bound), yearAnchor - YEAR_HARD_LIMIT)
    yearEnd = Math.min(Math.max(yearEnd, bound), yearAnchor + YEAR_HARD_LIMIT)
  }
  const years: number[] = []
  for (let y = yearStart; y <= yearEnd; y++) years.push(y)

  const firstWeekday = new Date(view.year, view.month - 1, 1).getDay()
  const dayCount = daysInMonth(view.year, view.month)
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: dayCount }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const todayAllowed = isWithinRange(today, min, max)
  const invalidClass = invalid ? ' border-rose-400 focus:border-rose-400 focus:ring-rose-100' : ''
  const headerControl =
    'rounded-lg border border-navy-100 bg-white px-1.5 py-1 text-sm text-navy-800 outline-none transition ' +
    'focus:border-brand-400 focus:ring-2 focus:ring-brand-100'
  const navButton =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-navy-500 transition hover:bg-navy-50 ' +
    'hover:text-navy-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200'

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        onClick={() => !open && openCalendar()}
        onKeyDown={handleInputKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-haspopup="dialog"
        aria-controls={open ? dialogId : undefined}
        className={`${inputClassName}${invalidClass} pr-10`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => (open ? closeCalendar() : openCalendar())}
        disabled={disabled}
        aria-label="เปิดปฏิทิน"
        className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-navy-400 transition hover:bg-navy-50 hover:text-brand-600 disabled:pointer-events-none disabled:opacity-50"
      >
        <CalendarDays className="h-4 w-4" />
      </button>

      {/* ตัวถือค่า ISO สำหรับ HTML validation ของฟอร์ม (required) — ซ่อนไว้แต่ต้อง focus ได้ ไม่งั้นเบราว์เซอร์จะไม่แสดง bubble */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => {}}
          className="pointer-events-none absolute bottom-0 left-3 h-px w-px opacity-0"
        />
      )}

      {open && (
        <div
          id={dialogId}
          role="dialog"
          aria-label="เลือกวันที่"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              closeCalendar()
            }
          }}
          className={`absolute left-0 z-50 w-72 rounded-2xl border border-navy-100 bg-white p-3 shadow-soft-lg ${
            openUp ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          <div className="mb-2 flex items-center gap-1">
            <button type="button" onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))} aria-label="เดือนก่อนหน้า" className={navButton}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <select
              value={view.month}
              onChange={(e) => setView((v) => ({ ...v, month: Number(e.target.value) }))}
              aria-label="เดือน"
              className={`${headerControl} min-w-0 flex-1`}
            >
              {THAI_MONTHS.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={view.year}
              onChange={(e) => setView((v) => ({ ...v, year: Number(e.target.value) }))}
              aria-label="ปี พ.ศ."
              className={`${headerControl} w-[76px] tabular-nums`}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y + BE_OFFSET}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))} aria-label="เดือนถัดไป" className={navButton}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium text-navy-400">
            {THAI_WEEKDAYS_SHORT.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div ref={gridRef} onKeyDown={handleGridKeyDown} className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (day === null) return <div key={`blank-${i}`} />
              const iso = formatIso({ year: view.year, month: view.month, day })
              const allowed = isWithinRange(iso, min, max)
              const isSelected = iso === selected
              const isToday = iso === today
              return (
                <button
                  key={iso}
                  type="button"
                  data-iso={iso}
                  disabled={!allowed}
                  onClick={() => pick(iso)}
                  aria-label={`${day} ${THAI_MONTHS[view.month - 1]} ${view.year + BE_OFFSET}`}
                  aria-pressed={isSelected}
                  className={
                    'flex h-9 items-center justify-center rounded-lg text-sm tabular-nums transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ' +
                    (isSelected
                      ? 'bg-brand-500 font-semibold text-white hover:bg-brand-600'
                      : allowed
                        ? `text-navy-800 hover:bg-brand-50 ${isToday ? 'font-semibold text-brand-600 ring-1 ring-brand-300 ring-inset' : ''}`
                        : 'cursor-not-allowed text-navy-200')
                  }
                >
                  {day}
                </button>
              )
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-navy-50 pt-2 text-xs">
            <button
              type="button"
              onClick={() => pick(today)}
              disabled={!todayAllowed}
              className="rounded-lg px-2 py-1 font-medium text-brand-600 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:text-navy-300"
            >
              วันนี้
            </button>
            <button
              type="button"
              onClick={() => {
                emit('')
                setText('')
                closeCalendar()
              }}
              className="rounded-lg px-2 py-1 text-navy-500 transition hover:bg-navy-50 hover:text-navy-800"
            >
              ล้าง
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
