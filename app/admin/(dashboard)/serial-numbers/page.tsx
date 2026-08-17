'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, Play, QrCode, Sparkles, Link2 } from 'lucide-react'
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
  Th,
  formatDate,
  formatDateTime,
} from '@/components/admin/ui'
import { SN_DISPLAY_STATUS_LABEL, snDisplayStatus } from '@/lib/warranty'
import { useApiList } from '@/lib/use-api-list'
import { snPatternHint } from '@/lib/sn-format'

type Product = { id: number; name: string }

type Scheme = {
  id: number
  label: string
  prefix: string
  model_code: string
  next_sequence: number
}

type Serial = {
  id: number
  sn: string
  sn_status: string
  category: string | null
  product_name: string | null
  created_at: string
  registration_id: number | null
  phone: string | null
  customer_name: string | null
  registered_at: string | null
  warranty_start: string | null
  warranty_end: string | null
  days_left: number | null
  warranty_status: 'not_started' | 'active' | 'expired' | null
}

type ListResponse = {
  serials: Serial[]
  categories: string[]
  meta: { total: number; page: number; total_pages: number }
}

const SN_STATUS_TONE = { available: 'slate', started: 'brand', registered: 'green', void: 'red' } as const
const EMPTY_META = { total: 0, page: 1, total_pages: 1 }

export default function SerialNumbersPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [schemes, setSchemes] = useState<Scheme[]>([])
  const [genForm, setGenForm] = useState({ scheme_id: '', quantity: '100', category: '' })
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState<{ batch_id: string; quantity: number } | null>(null)
  const [error, setError] = useState('')

  const [filters, setFilters] = useState({ search: '', status: '', product_id: '', category: '' })
  const [page, setPage] = useState(1)

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showStartModal, setShowStartModal] = useState(false)
  const [modalDate, setModalDate] = useState('')
  const [starting, setStarting] = useState(false)
  const [startMessage, setStartMessage] = useState('')

  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignProductId, setAssignProductId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignMessage, setAssignMessage] = useState('')

  useEffect(() => {
    fetch('/api/products')
      .then((res) => res.json())
      .then((data) => setProducts(data.products ?? []))
      .catch(() => setError('โหลดรายการผลิตภัณฑ์ไม่สำเร็จ'))

    fetch('/api/admin/sn-setup')
      .then((res) => res.json())
      .then((data) => setSchemes(data.schemes ?? []))
      .catch(() => setError('โหลดรูปแบบรหัส SN ไม่สำเร็จ'))
  }, [])

  const url = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), per_page: '20' })
    if (filters.search) params.set('search', filters.search)
    if (filters.status) params.set('status', filters.status)
    if (filters.product_id) params.set('product_id', filters.product_id)
    if (filters.category) params.set('category', filters.category)
    return `/api/admin/sn?${params}`
  }, [page, filters])

  // เปลี่ยนหน้า/ตัวกรองแล้วเลิกเลือก กัน id ค้างจากชุดข้อมูลเก่า
  useEffect(() => {
    void Promise.resolve().then(() => setSelected(new Set()))
  }, [url])

  const { data, loading, error: listError, reload } = useApiList<ListResponse>(url)
  const serials = data?.serials ?? []
  const meta = data?.meta ?? EMPTY_META

  // เลือกได้ทั้ง SN ที่ยังไม่ผูกผลิตภัณฑ์ (รอผูก) และที่ผูกแล้วแต่ยังไม่เริ่มประกัน (รอเริ่ม)
  // ยกเว้นตัวที่เริ่มไปแล้ว หมดประกันแล้ว หรือถูกยกเลิก
  function isSelectable(s: Serial) {
    return s.sn_status !== 'void' && s.warranty_status !== 'active' && s.warranty_status !== 'expired'
  }

  const selectableIds = serials.filter(isSelectable).map((s) => s.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds))
  }

  function toggleOne(serialId: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(serialId)) next.delete(serialId)
      else next.add(serialId)
      return next
    })
  }

  async function handleGenerate(event: React.FormEvent) {
    event.preventDefault()
    if (!genForm.scheme_id) {
      setError('กรุณาเลือกรูปแบบรหัส SN')
      return
    }
    if (!genForm.category.trim()) {
      setError('กรุณากรอกหมวดหมู่')
      return
    }
    setError('')
    setGenResult(null)
    setGenerating(true)
    try {
      const res = await fetch('/api/admin/sn/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genForm),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'สร้าง SN ไม่สำเร็จ')
        return
      }
      setGenResult(body)
      setPage(1)
      reload()
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setGenerating(false)
    }
  }

  function openStartModal() {
    setModalDate('')
    setShowStartModal(true)
  }

  async function confirmStartWarranty() {
    if (selected.size === 0) return
    setError('')
    setStartMessage('')
    setStarting(true)
    try {
      const res = await fetch('/api/admin/registrations/start-warranty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // ไม่เลือกวันที่ (modalDate ว่าง) = เริ่มทันที ณ วันที่กดยืนยัน
        body: JSON.stringify({
          serial_number_ids: [...selected],
          start_date: modalDate || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'เริ่มประกันไม่สำเร็จ')
        return
      }
      setStartMessage(
        body.skipped > 0
          ? `เริ่มประกันสำเร็จ ${body.started} รายการ (ข้าม ${body.skipped} รายการที่เริ่มไปแล้วหรือยังไม่ผูกผลิตภัณฑ์)`
          : `เริ่มประกันสำเร็จ ${body.started} รายการ`
      )
      setSelected(new Set())
      setShowStartModal(false)
      reload()
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setStarting(false)
    }
  }

  function openAssignModal() {
    setAssignProductId('')
    setShowAssignModal(true)
  }

  async function confirmAssignProduct() {
    if (selected.size === 0 || !assignProductId) return
    setError('')
    setAssignMessage('')
    setAssigning(true)
    try {
      const res = await fetch('/api/admin/sn/assign-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial_number_ids: [...selected],
          product_id: assignProductId,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'ผูกผลิตภัณฑ์ไม่สำเร็จ')
        return
      }
      setAssignMessage(
        body.skipped > 0
          ? `ผูกผลิตภัณฑ์สำเร็จ ${body.assigned} รายการ (ข้าม ${body.skipped} รายการที่ผูกผลิตภัณฑ์ไปแล้ว)`
          : `ผูกผลิตภัณฑ์สำเร็จ ${body.assigned} รายการ`
      )
      setSelected(new Set())
      setShowAssignModal(false)
      reload()
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setAssigning(false)
    }
  }

  function exportUrl() {
    const params = new URLSearchParams()
    if (filters.status) params.set('status', filters.status)
    if (filters.product_id) params.set('product_id', filters.product_id)
    if (filters.category) params.set('category', filters.category)
    return `/api/admin/sn/export?${params}`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">Serial Number</h1>
        <p className="mt-0.5 text-sm text-navy-400">
          สร้าง Serial Number จากรูปแบบรหัสที่ตั้งไว้ก่อน แล้วค่อยผูกผลิตภัณฑ์ทีหลังได้
        </p>
      </div>

      {(error || listError) && <Alert tone="error">{error || listError}</Alert>}
      {startMessage && <Alert tone="success">{startMessage}</Alert>}
      {assignMessage && <Alert tone="success">{assignMessage}</Alert>}

      <Card>
        <CardHeader
          title="สร้าง Serial Number แบบชุด"
          description="เลือกรูปแบบรหัส SN ที่ตั้งไว้ที่หน้า 'ตั้งค่ารหัส SN' ระบบจะสร้างเลขเรียงลำดับให้อัตโนมัติ โดยยังไม่ผูกผลิตภัณฑ์ — ไปผูกผลิตภัณฑ์ทีหลังได้ที่ตารางด้านล่าง"
        />

        <datalist id="sn-category-options">
          {(data?.categories ?? []).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <form onSubmit={handleGenerate} className="space-y-4">
          <Field
            label="รูปแบบรหัส SN"
            required
            hint={
              schemes.length === 0
                ? 'ยังไม่มีรูปแบบรหัส SN — ไปสร้างที่หน้า "ตั้งค่ารหัส SN" ก่อน'
                : undefined
            }
          >
            <Select
              value={genForm.scheme_id}
              onChange={(e) => setGenForm({ ...genForm, scheme_id: e.target.value })}
              required
            >
              <option value="">— เลือกรูปแบบรหัส SN —</option>
              {schemes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({snPatternHint(s.prefix, s.model_code)})
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="หมวดหมู่" required hint="เช่น เครื่องมือวินิจฉัย, อุปกรณ์ช่วยชีวิต">
              <Input
                list="sn-category-options"
                value={genForm.category}
                onChange={(e) => setGenForm({ ...genForm, category: e.target.value })}
                placeholder="กรอกหมวดหมู่"
                maxLength={100}
                required
              />
            </Field>
            <Field label="จำนวน" required hint="สูงสุด 1,000 ตัวต่อครั้ง">
              <Input
                type="number"
                min={1}
                max={1000}
                value={genForm.quantity}
                onChange={(e) => setGenForm({ ...genForm, quantity: e.target.value })}
                required
              />
            </Field>
            <Button type="submit" disabled={generating || schemes.length === 0} className="h-[42px]">
              <Sparkles className="h-4 w-4" />
              {generating ? 'กำลังสร้าง…' : 'สร้าง SN'}
            </Button>
          </div>
        </form>

        {genResult && (
          <div className="mt-4 space-y-3">
            <Alert tone="success">สร้าง SN สำเร็จ {genResult.quantity.toLocaleString('th-TH')} ตัว</Alert>
            <a href={`/api/admin/sn/export?batch_id=${genResult.batch_id}`}>
              <Button variant="secondary">
                <Download className="h-4 w-4" />
                ดาวน์โหลด Excel ของชุดนี้ (สำหรับพิมพ์สติกเกอร์)
              </Button>
            </a>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="ค้นหา / ผูกผลิตภัณฑ์ / เริ่มระยะเวลาประกัน"
          description="เลือกได้หลายแถว ทั้งที่ยังไม่ผูกผลิตภัณฑ์และที่ผูกแล้วรอเริ่มประกัน"
          action={
            <a href={exportUrl()}>
              <Button variant="secondary">
                <Download className="h-4 w-4" />
                Export Excel ตามตัวกรอง
              </Button>
            </a>
          }
        />

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            value={filters.search}
            onChange={(e) => {
              setPage(1)
              setFilters({ ...filters, search: e.target.value.toUpperCase() })
            }}
            placeholder="ค้นหาด้วย SN…"
            className="font-mono"
          />
          <Select
            value={filters.status}
            onChange={(e) => {
              setPage(1)
              setFilters({ ...filters, status: e.target.value })
            }}
          >
            <option value="">ทุกสถานะ</option>
            <option value="available">ยังไม่ลงทะเบียน</option>
            <option value="started">เริ่มประกันแล้ว (ยังไม่มีลูกค้า)</option>
            <option value="registered">ลงทะเบียนแล้ว</option>
            <option value="void">ยกเลิก</option>
          </Select>
          <Select
            value={filters.product_id}
            onChange={(e) => {
              setPage(1)
              setFilters({ ...filters, product_id: e.target.value })
            }}
          >
            <option value="">ทุกผลิตภัณฑ์</option>
            <option value="unassigned">ยังไม่ผูกผลิตภัณฑ์</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </Select>
          <Select
            value={filters.category}
            onChange={(e) => {
              setPage(1)
              setFilters({ ...filters, category: e.target.value })
            }}
          >
            <option value="">ทุกหมวดหมู่</option>
            {(data?.categories ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>

        {selected.size > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
            <span className="text-sm font-medium text-navy-700">เลือกแล้ว {selected.size} รายการ</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setSelected(new Set())} disabled={starting || assigning}>
                ยกเลิก
              </Button>
              <Button variant="secondary" onClick={openAssignModal} disabled={starting || assigning}>
                <Link2 className="h-4 w-4" />
                ผูกกับผลิตภัณฑ์
              </Button>
              <Button onClick={openStartModal} disabled={starting || assigning}>
                <Play className="h-4 w-4" />
                {`เริ่มประกัน (${selected.size})`}
              </Button>
            </div>
          </div>
        )}

        <div className="scrollbar-thin -mx-6 overflow-x-auto px-6">
          <table className="w-full min-w-[1180px] text-sm">
            <thead>
              <tr className="border-b border-navy-100">
                <Th>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={selectableIds.length === 0}
                    aria-label="เลือกทั้งหมดในหน้านี้"
                    className="h-4 w-4 rounded border-navy-300 text-brand-600 focus:ring-brand-300"
                  />
                </Th>
                <Th>Serial Number</Th>
                <Th>ผลิตภัณฑ์</Th>
                <Th>หมวดหมู่</Th>
                <Th>สถานะ</Th>
                <Th>ลูกค้า</Th>
                <Th>วันลงทะเบียน</Th>
                <Th>วันเริ่ม</Th>
                <Th>วันที่สิ้นสุด</Th>
                <Th>เหลือ</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {loading && <TableLoading colSpan={10} />}
              {!loading && serials.length === 0 && (
                <TableEmpty colSpan={10}>
                  <QrCode className="mx-auto mb-2 h-8 w-8 text-navy-200" strokeWidth={1.5} />
                  ไม่พบข้อมูล
                </TableEmpty>
              )}
              {!loading &&
                serials.map((serial) => {
                  const selectable = isSelectable(serial)
                  return (
                    <tr key={serial.id} className="transition hover:bg-brand-50/40">
                      <Td>
                        {selectable && (
                          <input
                            type="checkbox"
                            checked={selected.has(serial.id)}
                            onChange={() => toggleOne(serial.id)}
                            aria-label={`เลือก ${serial.sn}`}
                            className="h-4 w-4 rounded border-navy-300 text-brand-600 focus:ring-brand-300"
                          />
                        )}
                      </Td>
                      <Td className="font-mono font-medium text-navy-900">{serial.sn}</Td>
                      <Td>
                        {serial.product_name ?? (
                          <Badge tone="amber">ยังไม่ผูกผลิตภัณฑ์</Badge>
                        )}
                      </Td>
                      <Td className="text-navy-500">
                        {serial.category || <span className="text-navy-300">—</span>}
                      </Td>
                      <Td>
                        <Badge tone={SN_STATUS_TONE[snDisplayStatus(serial.sn_status, serial.phone)]}>
                          {SN_DISPLAY_STATUS_LABEL[snDisplayStatus(serial.sn_status, serial.phone)]}
                        </Badge>
                      </Td>
                      <Td>
                        {serial.phone ? (
                          <>
                            <div>{serial.customer_name || '—'}</div>
                            <div className="tabular text-xs text-navy-400">{serial.phone}</div>
                          </>
                        ) : (
                          <span className="text-navy-300">—</span>
                        )}
                      </Td>
                      <Td className="text-navy-500 whitespace-nowrap">
                        {serial.registered_at ? formatDateTime(serial.registered_at) : '—'}
                      </Td>
                      <Td className="text-navy-500 whitespace-nowrap">
                        {serial.warranty_start ? (
                          formatDate(serial.warranty_start)
                        ) : (
                          <span className="text-navy-300">—</span>
                        )}
                      </Td>
                      <Td className="text-navy-500 whitespace-nowrap">
                        {serial.warranty_end ? (
                          formatDate(serial.warranty_end)
                        ) : (
                          <span className="text-navy-300">—</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {serial.warranty_status === 'active' ? (
                          <span className="text-xs font-medium text-emerald-600">
                            เหลือ {serial.days_left} วัน
                          </span>
                        ) : serial.warranty_status === 'expired' ? (
                          <span className="text-xs font-medium text-rose-600">หมดประกันแล้ว</span>
                        ) : serial.warranty_status === 'not_started' ? (
                          <span className="text-xs font-medium text-amber-600">ยังไม่เริ่ม</span>
                        ) : (
                          <span className="text-navy-300">—</span>
                        )}
                      </Td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        <Pagination meta={meta} onChange={setPage} />
      </Card>

      {showAssignModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4"
          onClick={() => !assigning && setShowAssignModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-soft-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-navy-900">ผูกผลิตภัณฑ์ {selected.size} รายการ</h3>
            <p className="mt-1 text-sm text-navy-500">
              เลือกผลิตภัณฑ์ที่จะผูกกับ SN ที่เลือกไว้ — ใช้ได้เฉพาะ SN ที่ยังไม่มีผลิตภัณฑ์เท่านั้น
            </p>

            <div className="mt-4">
              <Field label="ผลิตภัณฑ์" required>
                <Select
                  value={assignProductId}
                  onChange={(e) => setAssignProductId(e.target.value)}
                  disabled={assigning}
                >
                  <option value="">— เลือกผลิตภัณฑ์ —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowAssignModal(false)} disabled={assigning}>
                ยกเลิก
              </Button>
              <Button onClick={confirmAssignProduct} disabled={assigning || !assignProductId}>
                <Link2 className="h-4 w-4" />
                {assigning ? 'กำลังผูก…' : 'ผูกผลิตภัณฑ์'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showStartModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4"
          onClick={() => !starting && setShowStartModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-soft-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-navy-900">เริ่มประกัน {selected.size} รายการ</h3>
            <p className="mt-1 text-sm text-navy-500">
              เลือกวันที่เริ่มประกัน หรือปล่อยว่างไว้เพื่อเริ่มทันที ณ ตอนที่กดยืนยัน (ใช้ได้เฉพาะ SN ที่ผูกผลิตภัณฑ์แล้ว)
            </p>

            <div className="mt-4">
              <Field label="วันที่เริ่มประกัน" hint="ไม่ระบุ = เริ่มวันนี้">
                <Input
                  type="date"
                  value={modalDate}
                  onChange={(e) => setModalDate(e.target.value)}
                  disabled={starting}
                />
              </Field>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setShowStartModal(false)}
                disabled={starting}
              >
                ยกเลิก
              </Button>
              <Button onClick={confirmStartWarranty} disabled={starting}>
                <Play className="h-4 w-4" />
                {starting ? 'กำลังเริ่ม…' : modalDate ? 'เริ่มประกันตามวันที่เลือก' : 'เริ่มประกันทันที'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
