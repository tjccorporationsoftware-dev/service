'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Anuphan } from 'next/font/google'
import { ArrowLeft, FileText, Printer, RotateCcw, Save } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Pagination,
  Select,
  TableEmpty,
  TableLoading,
  Td,
  Textarea,
  Th,
  formatDate,
  formatDateTime,
} from '@/components/admin/ui'
import { useApiList } from '@/lib/use-api-list'

// ฟอนต์ของใบ: Anuphan (Google Fonts, OFL ใช้งานบริษัทได้) แทน Anantason SemiCondensed Light ในแบบ ซึ่งเป็นฟอนต์มีลิขสิทธิ์
// ทั้งใบเป็นตัว Light ตามแบบ · ขนาดตัวอักษรเทียบจากความกว้างข้อความจริงใน PDF
const anuphan = Anuphan({ subsets: ['thai', 'latin'], weight: ['300', '600'], display: 'swap' })

type Serial = {
  id: number
  sn: string
  product_name: string
  brand: string | null
  model: string | null
  warranty_text: string
  warranty_start: string | null
  warranty_end: string | null
  customer_name: string | null
  phone: string | null
  print_count: number
  last_printed_at: string | null
}

type ListResponse = { serials: Serial[]; meta: { total: number; page: number; total_pages: number } }

type Texts = { conditions: string; footnote: string; company: string }

/** ข้อมูลลูกค้าบนใบแต่ละใบ — แอดมินแก้ได้ก่อนพิมพ์ ไม่บันทึกลงระบบ */
type CardInput = { customerName: string; address: string; contact: string }

const STATUS_FILTERS = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'registered', label: 'ลงทะเบียนแล้ว' },
  { value: 'unregistered', label: 'ยังไม่ลงทะเบียน' },
  { value: 'issued', label: 'ออกใบรับประกันแล้ว' },
  { value: 'not_issued', label: 'ยังไม่ออกใบรับประกัน' },
]

const EMPTY_META = { total: 0, page: 1, total_pages: 1 }

/** API รับได้ครั้งละไม่เกินนี้ (warrantyCardIssueSchema) */
const MAX_CARDS = 200

/** A4 สูง 297mm ที่ 96dpi — ใช้เตือนเมื่อเนื้อหาใบใดล้นเกิน 1 หน้า */
const A4_HEIGHT_PX = (297 / 25.4) * 96

export function WarrantyPrint({ header }: { header: string | null }) {
  const [filters, setFilters] = useState({ search: '', status: '' })
  const [page, setPage] = useState(1)

  // เก็บทั้งแถว (ไม่ใช่แค่ id) — เลือกข้ามหน้า/ข้ามตัวกรองได้ แล้วยังมีข้อมูลครบไว้แสดงบนใบ
  const [selected, setSelected] = useState<Map<string, Serial>>(new Map())
  const [mode, setMode] = useState<'list' | 'preview'>('list')
  const [cards, setCards] = useState<Record<string, CardInput>>({})

  const [texts, setTexts] = useState<Texts | null>(null)
  const [savedTexts, setSavedTexts] = useState<Texts | null>(null)
  const [defaultTexts, setDefaultTexts] = useState<Texts | null>(null)
  const [textsError, setTextsError] = useState('')
  const [textsNotice, setTextsNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState('')
  const [printNotice, setPrintNotice] = useState('')
  const [printedOnce, setPrintedOnce] = useState(false)
  const [confirmPrinted, setConfirmPrinted] = useState(false)

  const url = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), per_page: '20' })
    if (filters.search) params.set('search', filters.search)
    if (filters.status) params.set('status', filters.status)
    return `/api/admin/warranty-print?${params}`
  }, [page, filters])

  const { data, loading, error: listError, reload } = useApiList<ListResponse>(url)
  const serials = data?.serials ?? []
  const meta = data?.meta ?? EMPTY_META

  useEffect(() => {
    fetch('/api/admin/warranty-print/settings')
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? 'โหลดข้อความใบรับประกันไม่สำเร็จ')
        setTexts(body.texts)
        setSavedTexts(body.texts)
        setDefaultTexts(body.defaults)
      })
      .catch((err: Error) => setTextsError(err.message || 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ'))
  }, [])

  const allOnPageSelected = serials.length > 0 && serials.every((s) => selected.has(s.sn))

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Map(prev)
      for (const s of serials) {
        if (allOnPageSelected) next.delete(s.sn)
        else next.set(s.sn, s)
      }
      return next
    })
  }

  function toggleOne(serial: Serial) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(serial.sn)) next.delete(serial.sn)
      else next.set(serial.sn, serial)
      return next
    })
  }

  function openPreview() {
    const initial: Record<string, CardInput> = {}
    for (const s of selected.values()) {
      initial[s.sn] = cards[s.sn] ?? { customerName: s.customer_name ?? '', address: '', contact: s.phone ?? '' }
    }
    setCards(initial)
    setPrintError('')
    setPrintNotice('')
    setMode('preview')
    window.scrollTo(0, 0)
  }

  function backToList() {
    setMode('list')
    // พิมพ์ไปแล้ว — ล้างที่เลือกไว้ กันกดออกใบชุดเดิมซ้ำโดยไม่ตั้งใจ
    if (printedOnce) {
      setSelected(new Map())
      setCards({})
      setPrintedOnce(false)
    }
    reload()
  }

  function updateCard(sn: string, patch: Partial<CardInput>) {
    setCards((prev) => ({ ...prev, [sn]: { ...prev[sn], ...patch } }))
  }

  /**
   * เปิดหน้าต่างพิมพ์ แล้วค่อยถามว่าพิมพ์ออกมาจริงไหม — เบราว์เซอร์ไม่บอกว่าผู้ใช้กด "พิมพ์" หรือ "ยกเลิก"
   * ถ้าบันทึกตั้งแต่กดปุ่ม คนที่แค่เปิดดูตัวอย่างแล้วยกเลิกจะได้สถานะ "ออกแล้ว" ทั้งที่ยังไม่ได้พิมพ์
   */
  async function printAll() {
    setPrintError('')
    setPrintNotice('')
    // รอฟอนต์ของใบโหลดให้ครบก่อน ไม่งั้นใบแรก ๆ อาจพิมพ์ออกเป็นฟอนต์สำรอง
    await document.fonts.ready
    window.print()
    setConfirmPrinted(true)
  }

  async function recordIssued() {
    setPrinting(true)
    try {
      const res = await fetch('/api/admin/warranty-print/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sns: [...selected.keys()] }),
      })
      const body = await res.json()
      if (!res.ok) {
        setPrintError(body.error ?? 'บันทึกการออกใบไม่สำเร็จ')
        return
      }
      setPrintedOnce(true)
      setPrintNotice(`บันทึกการออกใบรับประกันแล้ว ${body.recorded} ใบ`)
    } catch {
      setPrintError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setPrinting(false)
      setConfirmPrinted(false)
    }
  }

  async function saveTexts() {
    if (!texts) return
    setTextsError('')
    setTextsNotice('')
    setSaving(true)
    try {
      const res = await fetch('/api/admin/warranty-print/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(texts),
      })
      const body = await res.json()
      if (!res.ok) {
        setTextsError(body.error ?? 'บันทึกไม่สำเร็จ')
        return
      }
      setTexts(body.texts)
      setSavedTexts(body.texts)
      setTextsNotice('บันทึกแล้ว — ใบรับประกันครั้งต่อไปจะใช้ข้อความนี้')
    } catch {
      setTextsError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const dirty =
    texts !== null &&
    savedTexts !== null &&
    (texts.conditions !== savedTexts.conditions ||
      texts.footnote !== savedTexts.footnote ||
      texts.company !== savedTexts.company)

  const selectedList = [...selected.values()]

  return (
    <div className="space-y-6 print:space-y-0">
      {/* @page มีผลเฉพาะตอนเปิดหน้านี้ — หน้าอื่นพิมพ์ด้วยขอบกระดาษปกติของเบราว์เซอร์ */}
      <style>{'@page { size: A4; margin: 0; }'}</style>

      {!header && (
        <div className="print:hidden">
          <Alert tone="warning">
            ยังไม่มีรูปหัวกระดาษบนเครื่องนี้ — ใบรับประกันจะพิมพ์โดยไม่มีโลโก้ ผู้ดูแลระบบต้องวางไฟล์{' '}
            <code>template/warranty-header.png</code> ในโฟลเดอร์โปรเจกต์ของเว็บนี้
          </Alert>
        </div>
      )}

      {mode === 'list' && (
        <Card>
          <CardHeader
            title="พิมพ์ใบรับประกัน"
            description="ติ๊กเลือก SN ที่จะออกใบ (เลือกได้หลายรายการ ข้ามหน้าได้) แล้วกด &quot;ออกใบรับประกัน&quot; — แสดงเฉพาะ SN ที่ผูกผลิตภัณฑ์แล้ว"
          />

          <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_240px]">
            <Input
              value={filters.search}
              onChange={(e) => {
                setPage(1)
                setFilters({ ...filters, search: e.target.value })
              }}
              placeholder="ค้นหา SN / ชื่อลูกค้า / เบอร์โทร…"
            />
            <Select
              value={filters.status}
              onChange={(e) => {
                setPage(1)
                setFilters({ ...filters, status: e.target.value })
              }}
              aria-label="กรองสถานะ"
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </div>

          {selected.size > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
              <span className="text-sm font-medium text-navy-700">
                เลือกแล้ว {selected.size.toLocaleString('th-TH')} รายการ
                {selected.size > MAX_CARDS && (
                  <span className="ml-2 text-rose-600">— ออกได้ครั้งละไม่เกิน {MAX_CARDS} ใบ</span>
                )}
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setSelected(new Map())}>
                  ล้างที่เลือก
                </Button>
                <Button onClick={openPreview} disabled={selected.size > MAX_CARDS}>
                  <FileText className="h-4 w-4" />
                  {`ออกใบรับประกัน (${selected.size})`}
                </Button>
              </div>
            </div>
          )}

          {listError && (
            <div className="mb-4">
              <Alert tone="error">{listError}</Alert>
            </div>
          )}

          <div className="scrollbar-thin -mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-navy-100">
                  <Th>
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleAllOnPage}
                      disabled={serials.length === 0}
                      aria-label="เลือกทั้งหมดในหน้านี้"
                      className="h-4 w-4 rounded border-navy-300 text-brand-600 focus:ring-brand-300"
                    />
                  </Th>
                  <Th>Serial Number</Th>
                  <Th>ผลิตภัณฑ์</Th>
                  <Th>ลูกค้า</Th>
                  <Th>ระยะประกัน</Th>
                  <Th>ใบรับประกัน</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {loading && <TableLoading colSpan={6} />}
                {!loading && serials.length === 0 && (
                  <TableEmpty colSpan={6}>
                    <Printer className="mx-auto mb-2 h-8 w-8 text-navy-200" strokeWidth={1.5} />
                    ไม่พบข้อมูล
                  </TableEmpty>
                )}
                {!loading &&
                  serials.map((serial) => (
                    <tr
                      key={serial.sn}
                      onClick={() => toggleOne(serial)}
                      className={`cursor-pointer transition hover:bg-brand-50/40 ${
                        selected.has(serial.sn) ? 'bg-brand-50/60' : ''
                      }`}
                    >
                      <Td>
                        <input
                          type="checkbox"
                          checked={selected.has(serial.sn)}
                          onChange={() => toggleOne(serial)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`เลือก ${serial.sn}`}
                          className="h-4 w-4 rounded border-navy-300 text-brand-600 focus:ring-brand-300"
                        />
                      </Td>
                      <Td className="font-mono font-medium text-navy-900">{serial.sn}</Td>
                      <Td>
                        <div className="text-navy-800">{serial.product_name}</div>
                        {(serial.brand || serial.model) && (
                          <div className="text-xs text-navy-400">
                            {[serial.brand, serial.model].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </Td>
                      <Td>
                        {serial.phone ? (
                          <>
                            <div>{serial.customer_name || '—'}</div>
                            <div className="tabular text-xs text-navy-400">{serial.phone}</div>
                          </>
                        ) : (
                          <Badge tone="slate">ยังไม่ลงทะเบียน</Badge>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {serial.warranty_start && serial.warranty_end ? (
                          <span className="text-navy-600">
                            {formatDate(serial.warranty_start)} – {formatDate(serial.warranty_end)}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-amber-600">
                            ยังไม่เริ่ม ({serial.warranty_text})
                          </span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {serial.print_count > 0 ? (
                          <>
                            <Badge tone="green">ออกแล้ว</Badge>
                            <div className="mt-1 text-xs text-navy-400">
                              {serial.print_count} ครั้ง · ล่าสุด {formatDateTime(serial.last_printed_at)}
                            </div>
                          </>
                        ) : (
                          <Badge tone="amber">ยังไม่ออก</Badge>
                        )}
                      </Td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <Pagination meta={meta} onChange={setPage} />
        </Card>
      )}

      {mode === 'preview' && (
        <>
          <Card className="print:hidden">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={backToList} disabled={printing}>
                <ArrowLeft className="h-4 w-4" />
                กลับไปรายการ
              </Button>
              <div className="min-w-0">
                <h2 className="font-semibold text-navy-900">ออกใบรับประกัน {selectedList.length} ใบ</h2>
                <p className="text-sm text-navy-400">
                  ตรวจข้อมูลแต่ละใบ เติมที่อยู่ลูกค้า แล้วกดพิมพ์ — 1 ใบต่อ 1 หน้า A4 (บันทึกเป็น PDF จากหน้าต่างพิมพ์ได้)
                </p>
              </div>
              <Button onClick={printAll} disabled={printing || !texts} className="ml-auto">
                <Printer className="h-4 w-4" />
                {`พิมพ์ทั้งหมด (${selectedList.length})`}
              </Button>
            </div>
            {selectedList.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-navy-100 pt-4">
                <span className="self-center text-sm text-navy-400">ไปที่ใบ:</span>
                {selectedList.map((s, i) => (
                  <a
                    key={s.sn}
                    href={`#card-${i + 1}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-navy-200 bg-white px-3 py-1 text-xs text-navy-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                  >
                    <span className="font-bold text-brand-700">{i + 1}</span>
                    <span className="font-mono">{s.sn}</span>
                  </a>
                ))}
              </div>
            )}
            {printError && (
              <div className="mt-4">
                <Alert tone="error">{printError}</Alert>
              </div>
            )}
            {printNotice && (
              <div className="mt-4">
                <Alert tone="success">{printNotice}</Alert>
              </div>
            )}
          </Card>

          <details className="group rounded-2xl border border-navy-100 bg-white shadow-soft print:hidden">
            <summary className="cursor-pointer list-none px-6 py-4">
              <span className="font-semibold text-navy-900">ข้อความบนใบ (ใช้กับทุกใบ)</span>
              <span className="ml-2 text-sm text-navy-400 group-open:hidden">— กดเพื่อแก้เงื่อนไขการรับประกัน / หมายเหตุท้ายใบ</span>
            </summary>
            <div className="space-y-4 border-t border-navy-100 px-6 py-5">
              {texts ? (
                <>
                  <Field
                    label="เงื่อนไขการรับประกัน"
                    hint='ขึ้นต้นด้วย "1." เป็นข้อหลัก, "2.1)" เป็นข้อย่อย (ระบบจัดย่อหน้าให้เอง) — บรรทัดที่ไม่มีเลขข้อ = ขึ้นบรรทัดใหม่ภายในข้อก่อนหน้า'
                  >
                    <Textarea
                      rows={8}
                      value={texts.conditions}
                      onChange={(e) => setTexts({ ...texts, conditions: e.target.value })}
                    />
                  </Field>
                  <Field label="ข้อมูลบริษัท (มุมขวาบน)" hint="บรรทัดละรายการ — บรรทัดแรกคือชื่อบริษัท (ตัวใหญ่และหนากว่า)">
                    <Textarea
                      rows={6}
                      value={texts.company}
                      onChange={(e) => setTexts({ ...texts, company: e.target.value })}
                    />
                  </Field>
                  <Field label="หมายเหตุท้ายใบ">
                    <Textarea
                      rows={3}
                      value={texts.footnote}
                      onChange={(e) => setTexts({ ...texts, footnote: e.target.value })}
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={saveTexts} disabled={saving || !dirty}>
                      <Save className="h-4 w-4" />
                      {saving ? 'กำลังบันทึก…' : 'บันทึกเป็นค่าเริ่มต้น'}
                    </Button>
                    {dirty && (
                      <Button variant="ghost" onClick={() => setTexts(savedTexts)} disabled={saving}>
                        ยกเลิกการแก้ไข
                      </Button>
                    )}
                    {defaultTexts && (
                      <Button variant="ghost" onClick={() => setTexts(defaultTexts)} disabled={saving}>
                        <RotateCcw className="h-4 w-4" />
                        ใช้ข้อความตั้งต้น
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                !textsError && <p className="text-sm text-navy-400">กำลังโหลด…</p>
              )}
              {textsError && <Alert tone="error">{textsError}</Alert>}
              {textsNotice && <Alert tone="success">{textsNotice}</Alert>}
            </div>
          </details>

          {/* แต่ละใบอยู่ในกรอบของตัวเอง มีแถบหัวบอกลำดับ — ตอนพิมพ์กรอบ/แถบหายหมด เหลือแค่กระดาษ ใบละหน้า */}
          <div className="space-y-10 print:space-y-0">
            {selectedList.map((serial, i) => {
              const card = cards[serial.sn]
              if (!card) return null
              const last = i === selectedList.length - 1
              return (
                <section
                  key={serial.sn}
                  id={`card-${i + 1}`}
                  className={`scroll-mt-20 rounded-2xl border-2 border-brand-200 bg-brand-50/40 p-4 md:scroll-mt-6 print:rounded-none print:border-0 print:bg-transparent print:p-0 ${
                    last ? '' : 'print:break-after-page'
                  }`}
                >
                  <header className="mb-4 flex flex-wrap items-center gap-3 border-b border-brand-200 pb-4 print:hidden">
                    <span className="flex h-10 min-w-10 items-center justify-center rounded-full bg-brand-600 px-2 text-base font-bold text-white shadow-soft">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-navy-900">
                        ใบที่ {i + 1} / {selectedList.length} · <span className="font-mono">{serial.sn}</span>
                      </div>
                      <div className="truncate text-sm text-navy-500">
                        {serial.product_name} · {serial.customer_name || 'ยังไม่ลงทะเบียน'}
                      </div>
                    </div>
                    <div className="ml-auto flex gap-3 text-sm">
                      {i > 0 && (
                        <a href={`#card-${i}`} className="font-medium text-brand-600 hover:text-brand-700">
                          ↑ ใบก่อนหน้า
                        </a>
                      )}
                      {!last && (
                        <a href={`#card-${i + 2}`} className="font-medium text-brand-600 hover:text-brand-700">
                          ใบถัดไป ↓
                        </a>
                      )}
                    </div>
                  </header>

                  {/* วางช่องกรอกข้างใบ (และลอยตามตอนเลื่อน) เฉพาะจอกว้างพอ — จอแคบวางไว้เหนือใบเฉย ๆ ไม่ให้ลอยไปบังใบ */}
                  <div className="grid items-start gap-4 min-[1400px]:grid-cols-[minmax(220px,1fr)_auto] print:block">
                    <Card className="space-y-4 min-[1400px]:sticky min-[1400px]:top-6 print:hidden">
                      <p className="text-sm text-navy-400">
                        สินค้า / SN / วันประกันดึงจากระบบ — ช่องด้านล่างใช้เฉพาะใบนี้ ไม่บันทึกลงระบบ
                      </p>
                      <Field label="หน่วยงาน / ชื่อลูกค้า">
                        <Input
                          value={card.customerName}
                          onChange={(e) => updateCard(serial.sn, { customerName: e.target.value })}
                        />
                      </Field>
                      <Field label="ที่อยู่" hint="แอดมินกรอกเองตอนพิมพ์ — เว้นว่างได้ถ้าจะเขียนด้วยมือ">
                        <Textarea
                          rows={3}
                          value={card.address}
                          onChange={(e) => updateCard(serial.sn, { address: e.target.value })}
                        />
                      </Field>
                      <Field label="ผู้ติดต่อ" hint="เติมเบอร์โทรที่ลูกค้าลงทะเบียนไว้ให้ แก้เป็นชื่อ + เบอร์ได้">
                        <Input
                          value={card.contact}
                          onChange={(e) => updateCard(serial.sn, { contact: e.target.value })}
                        />
                      </Field>
                    </Card>

                    <SheetFrame>
                      <WarrantySheet
                        header={header}
                        data={serial}
                        customerName={card.customerName}
                        address={card.address}
                        contact={card.contact}
                        texts={texts}
                      />
                    </SheetFrame>
                  </div>
                </section>
              )
            })}
          </div>

          {selectedList.length > 1 && (
            <Card className="print:hidden">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-navy-500">ครบ {selectedList.length} ใบแล้ว</span>
                <a href="#card-1" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                  ↑ กลับไปใบแรก
                </a>
                <Button onClick={printAll} disabled={printing || !texts} className="ml-auto">
                  <Printer className="h-4 w-4" />
                  {`พิมพ์ทั้งหมด (${selectedList.length})`}
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      {confirmPrinted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4 print:hidden">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-soft-lg">
            <h3 className="text-lg font-semibold text-navy-900">พิมพ์ใบรับประกันออกมาแล้วใช่ไหม?</h3>
            <p className="mt-1 text-sm text-navy-500">
              ถ้าพิมพ์แล้ว ระบบจะบันทึกสถานะ &quot;ออกแล้ว&quot; ให้ {selectedList.length} ใบ — ถ้ากดยกเลิกในหน้าต่างพิมพ์
              หรือแค่เปิดดูตัวอย่าง ให้กด &quot;ยังไม่ได้พิมพ์&quot;
            </p>
            {printError && (
              <div className="mt-4">
                <Alert tone="error">{printError}</Alert>
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setPrintError('')
                  setConfirmPrinted(false)
                }}
                disabled={printing}
              >
                ยังไม่ได้พิมพ์
              </Button>
              <Button onClick={recordIssued} disabled={printing}>
                {printing ? 'กำลังบันทึก…' : 'พิมพ์แล้ว — บันทึกสถานะ'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** กระดาษ A4 หนึ่งแผ่น + เตือนบนจอเมื่อเนื้อหาล้นเกิน 1 หน้า */
function SheetFrame({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState(false)

  useEffect(() => {
    const sheet = ref.current
    if (!sheet) return
    const observer = new ResizeObserver(() => setOverflow(sheet.scrollHeight > A4_HEIGHT_PX + 1))
    observer.observe(sheet)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="max-w-full overflow-x-auto print:overflow-visible">
      {overflow && (
        <div className="mb-2 print:hidden">
          <Alert tone="warning">ใบนี้ยาวเกิน 1 หน้า A4 — ลองย่อข้อความเงื่อนไขหรือที่อยู่ให้สั้นลง</Alert>
        </div>
      )}
      {/* ไม่มี padding ที่นี่ — ตำแหน่งทุกอย่างใน WarrantySheet วัดจากขอบกระดาษตามแบบ PDF (หน่วย pt) */}
      <div
        ref={ref}
        className={`${anuphan.className} relative box-border flex min-h-[297mm] flex-col bg-white font-light text-black shadow-soft-lg ring-1 ring-navy-100 print:min-h-[296mm] print:shadow-none print:ring-0`}
        style={{ width: '210mm' }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * ตัวใบรับประกัน — จัดตามแบบ template/ASCENT - ใบรับประกันสินค้า.pdf (A4 = 595 × 842 pt)
 * ตัวเลขตำแหน่ง/ขนาดวัดจาก PDF ต้นฉบับ: หัวข้อกึ่งกลางที่ 172/201pt, ช่องข้อมูลห่างกัน 36pt เริ่มที่ 236pt,
 * กล่องเงื่อนไขพื้น #e2edf1 ที่ 556pt, หมายเหตุชิดล่างห่างขอบ 19.5pt
 * รูปหัวกระดาษ (ลายคลื่น + โลโก้ + ข้อมูลบริษัท) วางทับเต็มความกว้างที่มุมบน
 */
function WarrantySheet({
  header,
  data,
  customerName,
  address,
  contact,
  texts,
}: {
  header: string | null
  data: Serial
  customerName: string
  address: string
  contact: string
  texts: Texts | null
}) {
  return (
    <>
      {header && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={header} alt="" className="pointer-events-none absolute top-0 left-0 z-0 w-full select-none" />
      )}

      {/* ข้อมูลบริษัทมุมขวาบน — บรรทัดแรก (ชื่อบริษัท) ตัวใหญ่และหนากว่า ตำแหน่งตามแบบ */}
      {texts?.company && (
        <div
          className="absolute z-10 whitespace-nowrap"
          style={{ left: '350pt', top: '31.4pt', fontSize: '10.8pt', lineHeight: '17.1pt' }}
        >
          {texts.company.split('\n').map((line, i) => (
            <div key={i} style={i === 0 ? { fontSize: '12.6pt', fontWeight: 600 } : undefined}>
              {line}
            </div>
          ))}
        </div>
      )}

      <div className="relative z-10 flex flex-1 flex-col" style={{ padding: '0 28pt 19.5pt' }}>
        <div className="text-center" style={{ paddingTop: '157.5pt', lineHeight: '29pt' }}>
          <div style={{ fontSize: '15.5pt' }}>WARRANTY CERTIFICATE</div>
          <div style={{ fontSize: '16.7pt' }}>(ใบรับประกันสินค้า)</div>
        </div>

        <div style={{ marginTop: '11.5pt', fontSize: '11.6pt', lineHeight: '18pt' }} className="space-y-[18pt]">
          <Row label="สินค้า/Product :">{data.product_name}</Row>
          <Row label="ยี่ห้อ/Brand :">{data.brand}</Row>
          <Row label="รุ่น/Model :">{data.model}</Row>
          <Row label="Serial number :">{data.sn}</Row>
          <Row label="ระยะรับประกันสินค้า :">
            {data.warranty_text}
            <span style={{ marginLeft: '9pt' }}>ตั้งแต่วันที่ </span>
            <DateOrBlank value={data.warranty_start} />
            <span> ถึงวันที่ </span>
            <DateOrBlank value={data.warranty_end} />
          </Row>
          <p className="underline underline-offset-[3pt]">Customer Information</p>
          <Row label="หน่วยงาน/Name :">{customerName}</Row>
          <Row label="ที่อยู่/Address :">
            <span className="whitespace-pre-wrap">{address}</span>
          </Row>
          <Row label="ผู้ติดต่อ :">{contact}</Row>
        </div>

        {/* พื้นสีต้องสั่ง print-color-adjust ไม่งั้นเบราว์เซอร์ตัดพื้นหลังทิ้งตอนพิมพ์ (ถ้าไม่ได้ติ๊ก "กราฟิกพื้นหลัง") */}
        <div
          style={{
            marginTop: '23.35pt',
            marginLeft: '-8.86pt',
            marginRight: '-10.69pt',
            padding: '12.5pt 10pt 10.7pt',
            background: '#e2edf1',
            lineHeight: '21pt',
            printColorAdjust: 'exact',
            WebkitPrintColorAdjust: 'exact',
          }}
        >
          {/* ข้อความทั้งก้อนอยู่กึ่งกลางกรอบ (ซ้าย-ขวาเท่ากันตามบรรทัดที่ยาวที่สุด) ส่วนในก้อนยังชิดซ้ายและเยื้องตามเลขข้อ */}
          <div style={{ width: 'fit-content', maxWidth: '100%', margin: '0 auto' }}>
            <p className="font-semibold underline underline-offset-[3pt]" style={{ fontSize: '11.7pt' }}>
              เงื่อนไขการรับประกันสินค้า:
            </p>
            <div style={{ fontSize: '10.3pt' }}>{texts && <ConditionLines text={texts.conditions} />}</div>
          </div>
        </div>

        {texts?.footnote && (
          <p
            className="whitespace-pre-wrap"
            style={{ marginTop: 'auto', paddingTop: '16pt', marginLeft: '-6pt', fontSize: '11.5pt', lineHeight: '17pt' }}
          >
            {texts.footnote}
          </p>
        )}
      </div>
    </>
  )
}

/**
 * วันที่ (ถ้าเริ่มประกันแล้ว) หรือเส้นว่างไว้เขียนเอง — ใช้ตัว "_" เรียงกันแบบในแบบ ยาว ~103pt
 * (เส้นจาก border/พื้นหลังบางเกินไปจะออกเป็นจุดหรือสีจาง ตัวอักษรพิมพ์ออกดำเสมอ)
 */
function DateOrBlank({ value }: { value: string | null }) {
  if (value) return <span>{formatFullDate(value)}</span>
  return (
    <span className="inline-block overflow-hidden align-bottom whitespace-nowrap" style={{ width: '103pt' }}>
      {'_'.repeat(40)}
    </span>
  )
}

/** วันที่บนใบรับประกันใช้ชื่อเดือนเต็ม (17 สิงหาคม 2569) — ตารางบนจอยังใช้ formatDate แบบย่อ */
function formatFullDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex">
      <span className="shrink-0 pr-2" style={{ minWidth: '108pt' }}>
        {label}
      </span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  )
}

/**
 * เงื่อนไขบรรทัดละข้อ — ใช้รูปแบบเลขข้อแทนการเว้นวรรคนำหน้า เพราะ textarea ตัดช่องว่างหน้าบรรทัดได้ง่ายและผู้ใช้มองไม่เห็น
 * - "1." ข้อหลัก: เลขอยู่คอลัมน์ซ้ายกว้าง 18.6pt บรรทัดที่ตัดขึ้นใหม่เยื้องตรงกับข้อความ (ไม่กลับไปใต้ตัวเลข)
 * - "2.1)" ข้อย่อย: เริ่มตรงแนวข้อความของข้อหลัก (18.6pt) บรรทัดที่ตัดขึ้นใหม่เยื้องตรงกับข้อความหลังเลขข้อย่อย
 * - บรรทัดที่ไม่มีเลขข้อ = ขึ้นบรรทัดใหม่ภายในข้อก่อนหน้า (ผู้ใช้กำหนดจุดตัดบรรทัดเองได้ เช่น ตัดก่อนคำว่า "โดย")
 */
type ConditionBlock = { kind: 'main' | 'sub' | 'plain'; num: string; lines: string[] } | { kind: 'blank' }

function parseConditions(text: string): ConditionBlock[] {
  const blocks: ConditionBlock[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) {
      blocks.push({ kind: 'blank' })
      continue
    }
    const sub = line.match(/^(\d+\.\d+\)?)\s+(.*)$/)
    const main = sub ? null : line.match(/^(\d+\.)\s+(.*)$/)
    if (sub) blocks.push({ kind: 'sub', num: sub[1], lines: [sub[2]] })
    else if (main) blocks.push({ kind: 'main', num: main[1], lines: [main[2]] })
    else {
      const prev = blocks[blocks.length - 1]
      if (prev && prev.kind !== 'blank') prev.lines.push(line)
      else blocks.push({ kind: 'plain', num: '', lines: [line] })
    }
  }
  return blocks
}

function ConditionLines({ text }: { text: string }) {
  return (
    <>
      {parseConditions(text).map((block, i) => {
        if (block.kind === 'blank') return <div key={i} style={{ height: '0.5em' }} />
        const body = block.lines.map((l, j) => (
          <span key={j}>
            {j > 0 && <br />}
            {l}
          </span>
        ))
        if (block.kind === 'plain') return <p key={i}>{body}</p>
        return (
          <p key={i} className="flex" style={block.kind === 'sub' ? { paddingLeft: '18.6pt' } : undefined}>
            <span
              className="shrink-0"
              style={block.kind === 'sub' ? { paddingRight: '0.3em' } : { width: '18.6pt' }}
            >
              {block.num}
            </span>
            <span className="min-w-0 flex-1">{body}</span>
          </p>
        )
      })}
    </>
  )
}
