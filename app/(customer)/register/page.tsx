'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, FileSignature, Mail, Package, Phone, QrCode, User } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  Field,
  IconCircle,
  Input,
  InputWithIcon,
  LinkButton,
  formatDate,
} from '@/components/ui'

type Product = {
  id: number
  name: string
  brand: string | null
  model: string | null
  warranty_text: string
}

type Success = {
  sn: string
  customer_name: string
  email: string
  product_name: string
  brand: string | null
  model: string | null
  warranty_text: string
  warranty_start: string | null
  warranty_end: string | null
}

type FieldErrors = { warranty_start?: boolean; warranty_end?: boolean }

const EMPTY_FORM = {
  customer_name: '',
  phone: '',
  email: '',
  product_id: '',
  sn: '',
  customer_reported_warranty_start: '',
  customer_reported_warranty_end: '',
  consent: false,
}

// ฉบับร่าง — โปรดให้ฝ่ายกฎหมาย/ผู้ดูแลระบบตรวจสอบและแก้ไขเนื้อหาจริงก่อนใช้งานจริง
const TERMS_TEXT = `เงื่อนไขการรับประกัน
1. การรับประกันครอบคลุมเฉพาะความเสียหายอันเกิดจากข้อบกพร่องของการผลิต ไม่ครอบคลุมความเสียหายจากอุบัติเหตุ การใช้งานผิดวิธี ภัยธรรมชาติ หรือการดัดแปลง/ซ่อมแซมโดยผู้ไม่ได้รับอนุญาต
2. ระยะเวลารับประกันเริ่มนับตั้งแต่วันที่เจ้าหน้าที่ยืนยันเริ่มการรับประกัน ซึ่งอาจไม่ใช่วันเดียวกับวันที่ลงทะเบียน
3. กรุณาเก็บ Serial Number และข้อมูลการลงทะเบียนไว้เป็นหลักฐานในการแจ้งปัญหาหรือขอรับบริการ
4. บริษัทขอสงวนสิทธิ์ในการเปลี่ยนแปลงเงื่อนไขการรับประกันโดยจะแจ้งให้ทราบล่วงหน้าตามความเหมาะสม

ประกาศความเป็นส่วนตัว
เราจัดเก็บชื่อ เบอร์โทรศัพท์ อีเมล และข้อมูลสินค้าของท่าน เพื่อวัตถุประสงค์ในการลงทะเบียนรับประกัน ติดต่อกลับกรณีแจ้งปัญหา และให้บริการหลังการขาย ข้อมูลจะถูกเก็บรักษาเท่าที่จำเป็นตามวัตถุประสงค์ดังกล่าว และจะไม่เปิดเผยต่อบุคคลภายนอกโดยไม่ได้รับอนุญาต เว้นแต่ตามที่กฎหมายกำหนด ท่านมีสิทธิขอเข้าถึง แก้ไข หรือขอให้ลบข้อมูลส่วนบุคคลของท่านได้ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล (PDPA)`

export default function RegisterPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [nameQuery, setNameQuery] = useState('')
  const [brandQuery, setBrandQuery] = useState('')
  const [modelQuery, setModelQuery] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [success, setSuccess] = useState<Success | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/products')
      .then((res) => res.json())
      .then((data) => setProducts(data.products ?? []))
      .catch(() => setError('โหลดรายการผลิตภัณฑ์ไม่สำเร็จ'))
  }, [])

  const selected = products.find((p) => String(p.id) === form.product_id)

  // กรองจากทั้ง 3 ช่องพร้อมกัน — พิมพ์ช่องไหนก็ช่วยกรองรายการเดียวกัน
  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(nameQuery.toLowerCase()) &&
      (product.brand ?? '').toLowerCase().includes(brandQuery.toLowerCase()) &&
      (product.model ?? '').toLowerCase().includes(modelQuery.toLowerCase())
  )

  function selectProduct(product: Product) {
    setForm((f) => ({ ...f, product_id: String(product.id) }))
    setNameQuery(product.name)
    setBrandQuery(product.brand ?? '')
    setModelQuery(product.model ?? '')
  }

  function clearProductSelection() {
    setForm((f) => ({ ...f, product_id: '' }))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!form.product_id) {
      setError('กรุณาเลือกสินค้าจากรายการที่ค้นหา')
      return
    }
    setError('')
    setFieldErrors({})
    setSubmitting(true)
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'ลงทะเบียนไม่สำเร็จ')
        setFieldErrors(data.field_errors ?? {})
        return
      }
      setSuccess(data.registration)
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <IconCircle icon={CheckCircle2} tone="green" size="lg" className="mx-auto" />
        <div>
          <h1 className="text-2xl font-bold text-navy-900">ลงทะเบียนสำเร็จ</h1>
          <p className="mt-1 text-sm text-navy-500">กรุณาเก็บข้อมูลนี้ไว้อ้างอิงเมื่อต้องแจ้งปัญหา</p>
        </div>

        <Card className="text-left">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="ชื่อผู้ซื้อ/หน่วยงาน" value={success.customer_name} />
            <Detail label="อีเมล" value={success.email} />
            <Detail
              label="ชื่อสินค้า ยี่ห้อ และรุ่น"
              value={[success.product_name, success.brand, success.model].filter(Boolean).join(' · ')}
            />
            <Detail label="Serial Number" value={success.sn} mono />
            {success.warranty_end ? (
              <>
                <Detail
                  label="วันที่เริ่มรับประกัน"
                  value={`${formatDate(success.warranty_start)} (${success.warranty_text})`}
                />
                <Detail label="วันที่สิ้นสุด" value={formatDate(success.warranty_end)} highlight />
              </>
            ) : (
              <Detail label="ระยะประกัน" value={success.warranty_text} />
            )}
          </dl>

          {!success.warranty_end && (
            <div className="mt-5">
              <Alert tone="info">
                ลงทะเบียนเรียบร้อยแล้ว แต่ยังรอเจ้าหน้าที่เริ่มระยะเวลาประกันให้ก่อน
                จึงจะแจ้งปัญหาได้ — ลองเช็คสถานะอีกครั้งภายหลัง
              </Alert>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setSuccess(null)
                setForm(EMPTY_FORM)
                setNameQuery('')
                setBrandQuery('')
                setModelQuery('')
              }}
            >
              ลงทะเบียนเครื่องอื่น
            </Button>
            <LinkButton href="/status" variant="secondary">
              ไปหน้าเช็คสถานะ
            </LinkButton>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-start gap-4">
        <IconCircle icon={FileSignature} />
        <div>
          <h1 className="text-2xl font-bold text-navy-900">ลงทะเบียนผลิตภัณฑ์</h1>
          <p className="mt-1 text-sm text-navy-500">
            กรุณากรอกข้อมูลให้ครบถ้วน เพื่อใช้เป็นข้อมูลประกอบการรับประกันและบริการหลังการขาย
          </p>
        </div>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <Alert tone="error">{error}</Alert>}

          <Field label="ชื่อผู้ซื้อหรือชื่อหน่วยงาน" required>
            <InputWithIcon
              icon={User}
              value={form.customer_name}
              onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
              placeholder="เช่น สมชาย ใจดี หรือ บริษัท เอบีซี จำกัด"
              maxLength={255}
              required
            />
          </Field>

          <Field label="เบอร์โทรศัพท์ที่ติดต่อได้" required hint="ตัวเลข 10 หลัก ขึ้นต้นด้วย 0 เช่น 0812345678">
            <InputWithIcon
              icon={Phone}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })}
              inputMode="numeric"
              maxLength={10}
              placeholder="0812345678"
              required
            />
          </Field>

          <Field label="อีเมล" required>
            <InputWithIcon
              icon={Mail}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="name@example.com"
              maxLength={255}
              required
            />
          </Field>

          <Field
            label="ชื่อสินค้า"
            required
            hint={selected ? `ระยะประกัน ${selected.warranty_text} นับจากวันที่เจ้าหน้าที่เริ่มประกัน` : undefined}
          >
            <ProductCombobox
              filtered={filteredProducts}
              selectedId={form.product_id}
              query={nameQuery}
              onQueryChange={(value) => {
                setNameQuery(value)
                clearProductSelection()
              }}
              onSelect={selectProduct}
              placeholder="พิมพ์ค้นหาชื่อสินค้า…"
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="ยี่ห้อ">
              <ProductCombobox
                filtered={filteredProducts}
                selectedId={form.product_id}
                query={brandQuery}
                onQueryChange={(value) => {
                  setBrandQuery(value)
                  clearProductSelection()
                }}
                onSelect={selectProduct}
                placeholder="พิมพ์ค้นหายี่ห้อ…"
              />
            </Field>
            <Field label="รุ่น">
              <ProductCombobox
                filtered={filteredProducts}
                selectedId={form.product_id}
                query={modelQuery}
                onQueryChange={(value) => {
                  setModelQuery(value)
                  clearProductSelection()
                }}
                onSelect={selectProduct}
                placeholder="พิมพ์ค้นหารุ่น…"
              />
            </Field>
          </div>

          <Field label="Serial Number" required hint="ดูได้จากสติกเกอร์บนตัวเครื่อง เช่น WR-BED01-A3F9K2">
            <InputWithIcon
              icon={QrCode}
              value={form.sn}
              onChange={(e) => setForm({ ...form, sn: e.target.value.toUpperCase() })}
              placeholder="WR-XXXX-XXXXXX"
              className="tabular font-mono"
              maxLength={50}
              required
            />
          </Field>

          <Field label="วันที่เริ่มประกัน / วันที่สิ้นสุดประกัน" required>
            <div className="rounded-xl border border-dashed border-navy-200 bg-navy-50/40 px-3.5 py-2.5 text-sm text-navy-500">
              {selected
                ? `ระยะประกันของรุ่นนี้: ${selected.warranty_text} — ระบบจะคำนวณวันที่เริ่มและสิ้นสุดให้อัตโนมัติ หลังเจ้าหน้าที่ยืนยันเริ่มการรับประกัน`
                : 'กรุณาเลือกสินค้าด้านบนก่อน เพื่อดูระยะเวลารับประกันของรุ่นนี้'}
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-navy-400">
              กรุณากรอกวันที่เริ่มและสิ้นสุดประกันตามที่ทราบ (เช่น จากใบรับประกันที่ได้รับ)
              ระบบจะใช้เทียบกับวันที่เจ้าหน้าที่กดยืนยันจริงเท่านั้น ไม่ได้ใช้แทนการยืนยันจากเจ้าหน้าที่
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span
                  className={`mb-1 block text-xs ${fieldErrors.warranty_start ? 'font-medium text-rose-600' : 'text-navy-700'}`}
                >
                  วันที่เริ่มประกัน
                </span>
                <Input
                  type="date"
                  value={form.customer_reported_warranty_start}
                  onChange={(e) => {
                    setForm({ ...form, customer_reported_warranty_start: e.target.value })
                    setFieldErrors((f) => ({ ...f, warranty_start: false }))
                  }}
                  className={fieldErrors.warranty_start ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-100' : ''}
                  required
                />
                {fieldErrors.warranty_start && (
                  <span className="mt-1 block text-xs text-rose-600">วันที่นี้ไม่ตรงกับที่เจ้าหน้าที่ยืนยันไว้</span>
                )}
              </label>
              <label className="block">
                <span
                  className={`mb-1 block text-xs ${fieldErrors.warranty_end ? 'font-medium text-rose-600' : 'text-navy-700'}`}
                >
                  วันที่สิ้นสุดประกัน
                </span>
                <Input
                  type="date"
                  value={form.customer_reported_warranty_end}
                  onChange={(e) => {
                    setForm({ ...form, customer_reported_warranty_end: e.target.value })
                    setFieldErrors((f) => ({ ...f, warranty_end: false }))
                  }}
                  className={fieldErrors.warranty_end ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-100' : ''}
                  required
                />
                {fieldErrors.warranty_end && (
                  <span className="mt-1 block text-xs text-rose-600">วันที่นี้ไม่ตรงกับที่เจ้าหน้าที่ยืนยันไว้</span>
                )}
              </label>
            </div>
          </Field>

          <Field label="เงื่อนไขการรับประกันและประกาศความเป็นส่วนตัว" required>
            <div className="max-h-40 overflow-y-auto rounded-xl border border-navy-100 bg-navy-50/40 p-3.5 text-xs leading-relaxed whitespace-pre-line text-navy-500">
              {TERMS_TEXT}
            </div>
            <label className="mt-2.5 flex items-start gap-2.5 text-sm text-navy-700">
              <input
                type="checkbox"
                checked={form.consent}
                onChange={(e) => setForm({ ...form, consent: e.target.checked })}
                required
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-navy-300 text-brand-600 focus:ring-brand-300"
              />
              ข้าพเจ้ายอมรับเงื่อนไขการรับประกันและรับทราบประกาศความเป็นส่วนตัวข้างต้น
            </label>
          </Field>

          <Button type="submit" size="lg" className="w-full" disabled={submitting || !form.consent}>
            {submitting ? 'กำลังบันทึก…' : 'ลงทะเบียนผลิตภัณฑ์'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

/**
 * ช่องพิมพ์ค้นหาสินค้า — ใช้ซ้ำได้ทั้งช่อง ชื่อ/ยี่ห้อ/รุ่น
 * รายการที่กรองแล้ว (filtered) มาจาก parent เพราะ parent รวมเงื่อนไขจากทั้ง 3 ช่องเข้าด้วยกัน
 */
function ProductCombobox({
  filtered,
  selectedId,
  query,
  onQueryChange,
  onSelect,
  placeholder,
}: {
  filtered: Product[]
  selectedId: string
  query: string
  onQueryChange: (value: string) => void
  onSelect: (product: Product) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function selectProduct(product: Product) {
    onSelect(product)
    setOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'Enter') {
        event.preventDefault()
        setOpen(true)
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (filtered[highlighted]) selectProduct(filtered[highlighted])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <Package className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-navy-300" />
      <Input
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value)
          setOpen(true)
          setHighlighted(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="pr-9 pl-10"
        autoComplete="off"
      />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-navy-300" />

      {open && (
        <div className="absolute z-20 mt-1.5 max-h-60 w-full overflow-y-auto rounded-xl border border-navy-100 bg-white py-1.5 shadow-soft-lg">
          {filtered.length === 0 ? (
            <div className="px-3.5 py-2.5 text-sm text-navy-400">ไม่พบสินค้าที่ตรงกับคำค้นหา</div>
          ) : (
            filtered.map((product, index) => (
              <button
                key={product.id}
                type="button"
                onClick={() => selectProduct(product)}
                onMouseEnter={() => setHighlighted(index)}
                className={`block w-full px-3.5 py-2.5 text-left text-sm transition ${
                  index === highlighted ? 'bg-brand-50 text-brand-700' : 'text-navy-700'
                } ${String(product.id) === selectedId ? 'font-medium' : ''}`}
              >
                {[product.name, product.brand, product.model].filter(Boolean).join(' · ')}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function Detail({
  label,
  value,
  mono,
  highlight,
}: {
  label: string
  value: string
  mono?: boolean
  highlight?: boolean
}) {
  return (
    <div>
      <dt className="text-xs text-navy-400">{label}</dt>
      <dd
        className={`mt-0.5 ${mono ? 'font-mono' : ''} ${
          highlight ? 'font-semibold text-brand-700' : 'text-navy-900'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
