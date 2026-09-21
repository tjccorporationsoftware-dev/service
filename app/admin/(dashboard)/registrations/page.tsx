'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardList, ListFilter, TriangleAlert } from 'lucide-react'
import {
  Alert,
  Badge,
  Card,
  CardHeader,
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
import { ThaiDatePicker } from '@/components/thai-date-picker'
import { useApiList } from '@/lib/use-api-list'

type Product = { id: number; name: string }

type Registration = {
  id: number
  sn: string
  phone: string | null
  customer_name: string | null
  registered_at: string
  warranty_start: string | null
  warranty_end: string | null
  customer_reported_warranty_start: string | null
  customer_reported_warranty_end: string | null
  warranty_mismatch: boolean
  product_name: string
  model: string | null
  issue_count: number
  days_left: number | null
  warranty_status: 'not_started' | 'active' | 'expired'
}

type ListResponse = {
  registrations: Registration[]
  meta: { total: number; page: number; total_pages: number }
}

const EMPTY_META = { total: 0, page: 1, total_pages: 1 }

export default function RegistrationsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [filters, setFilters] = useState({
    search: '',
    product_id: '',
    warranty_status: '',
    registered_from: '',
    registered_to: '',
    warranty_start_from: '',
    warranty_start_to: '',
  })
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetch('/api/products')
      .then((res) => res.json())
      .then((data) => setProducts(data.products ?? []))
      .catch(() => {})
  }, [])

  const url = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), per_page: '20' })
    if (filters.search) params.set('search', filters.search)
    if (filters.product_id) params.set('product_id', filters.product_id)
    if (filters.warranty_status) params.set('warranty_status', filters.warranty_status)
    if (filters.registered_from) params.set('registered_from', filters.registered_from)
    if (filters.registered_to) params.set('registered_to', filters.registered_to)
    if (filters.warranty_start_from) params.set('warranty_start_from', filters.warranty_start_from)
    if (filters.warranty_start_to) params.set('warranty_start_to', filters.warranty_start_to)
    return `/api/admin/registrations?${params}`
  }, [page, filters])

  function updateFilter(key: keyof typeof filters, value: string) {
    setPage(1)
    setFilters((f) => ({ ...f, [key]: value }))
  }

  const { data, loading, error } = useApiList<ListResponse>(url)
  const rows = data?.registrations ?? []
  const meta = data?.meta ?? EMPTY_META

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">การลงทะเบียนผลิตภัณฑ์</h1>
        <p className="mt-0.5 text-sm text-navy-400">ข้อมูลลูกค้าที่ลงทะเบียน พร้อมสถานะการรับประกัน</p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <CardHeader title="รายการลงทะเบียน" />

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Input
            value={filters.search}
            onChange={(e) => {
              setPage(1)
              setFilters({ ...filters, search: e.target.value })
            }}
            placeholder="ค้นหา SN / เบอร์โทร / ชื่อลูกค้า…"
          />
          <Select
            value={filters.product_id}
            onChange={(e) => {
              setPage(1)
              setFilters({ ...filters, product_id: e.target.value })
            }}
          >
            <option value="">ทุกผลิตภัณฑ์</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </Select>
          <Select
            value={filters.warranty_status}
            onChange={(e) => {
              setPage(1)
              setFilters({ ...filters, warranty_status: e.target.value })
            }}
          >
            <option value="">ทุกสถานะประกัน</option>
            <option value="not_started">ยังไม่เริ่มประกัน</option>
            <option value="active">อยู่ในประกัน</option>
            <option value="expired">หมดประกันแล้ว</option>
          </Select>
        </div>

        <div className="scrollbar-thin -mx-6 overflow-x-auto px-6">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-navy-100">
                <Th>Serial Number</Th>
                <Th>ผลิตภัณฑ์</Th>
                <Th>ลูกค้า</Th>
                <DateFilterTh
                  label="วันลงทะเบียน"
                  from={filters.registered_from}
                  to={filters.registered_to}
                  onFromChange={(v) => updateFilter('registered_from', v)}
                  onToChange={(v) => updateFilter('registered_to', v)}
                />
                <DateFilterTh
                  label="ระยะประกัน"
                  hint="กรองวันที่เริ่มประกัน"
                  from={filters.warranty_start_from}
                  to={filters.warranty_start_to}
                  onFromChange={(v) => updateFilter('warranty_start_from', v)}
                  onToChange={(v) => updateFilter('warranty_start_to', v)}
                />
                <Th>สถานะ</Th>
                <Th>เคส</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {loading && <TableLoading colSpan={7} />}
              {!loading && rows.length === 0 && (
                <TableEmpty colSpan={7}>
                  <ClipboardList className="mx-auto mb-2 h-8 w-8 text-navy-200" strokeWidth={1.5} />
                  ไม่พบข้อมูลการลงทะเบียน
                </TableEmpty>
              )}
              {!loading &&
                rows.map((row) => (
                  <tr key={row.id} className="transition hover:bg-brand-50/40">
                    <Td className="font-mono font-medium text-navy-900">{row.sn}</Td>
                    <Td>
                      <div>{row.product_name}</div>
                      {row.model && <div className="text-xs text-navy-400">{row.model}</div>}
                    </Td>
                    <Td>
                      {row.phone ? (
                        <>
                          <div>{row.customer_name || '—'}</div>
                          <div className="tabular text-xs text-navy-400">{row.phone}</div>
                        </>
                      ) : (
                        <span className="text-xs text-navy-300">ยังไม่มีลูกค้าลงทะเบียน</span>
                      )}
                    </Td>
                    <Td className="text-navy-500">{formatDateTime(row.registered_at)}</Td>
                    <Td className="text-navy-500">
                      {row.warranty_start && row.warranty_end ? (
                        <>
                          {formatDate(row.warranty_start)} – {formatDate(row.warranty_end)}
                        </>
                      ) : (
                        <span className="text-navy-300">ยังไม่เริ่ม</span>
                      )}
                      {row.warranty_mismatch && (
                        <div className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600">
                          <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                          ไม่ตรงกับที่ลูกค้ากรอก
                          {row.customer_reported_warranty_start && (
                            <span className="text-rose-400">
                              ({formatDate(row.customer_reported_warranty_start)}
                              {row.customer_reported_warranty_end &&
                                ` – ${formatDate(row.customer_reported_warranty_end)}`}
                              )
                            </span>
                          )}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {row.warranty_status === 'active' ? (
                        <Badge tone="green">เหลือ {row.days_left} วัน</Badge>
                      ) : row.warranty_status === 'expired' ? (
                        <Badge tone="red">หมดประกันแล้ว</Badge>
                      ) : (
                        <Badge tone="amber">ยังไม่เริ่มประกัน</Badge>
                      )}
                    </Td>
                    <Td className="tabular">
                      {row.issue_count > 0 ? (
                        <Badge tone="amber">{row.issue_count}</Badge>
                      ) : (
                        <span className="text-navy-300">—</span>
                      )}
                    </Td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <Pagination meta={meta} onChange={setPage} />
      </Card>
    </div>
  )
}

/**
 * หัวคอลัมน์ที่มีตัวกรองช่วงวันที่ (จาก-ถึง) ซ่อนอยู่ในตัว
 * ปกติโชว์แค่ป้ายชื่อ + ปุ่มไอคอนเล็ก ๆ กดแล้วค่อยกางช่องกรอกวันที่ออกมาเป็น popover
 * ใช้กับ วันลงทะเบียน / วันที่เริ่มประกัน
 */
function DateFilterTh({
  label,
  hint,
  from,
  to,
  onFromChange,
  onToChange,
}: {
  label: string
  hint?: string
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const active = Boolean(from || to)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const dateInputClass =
    'w-[140px] rounded-lg border border-navy-100 px-1.5 py-1 text-xs font-normal normal-case text-navy-700 ' +
    'outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100'

  return (
    <th className="px-4 py-3 text-left">
      <div className="relative inline-block" ref={containerRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase transition ${
            active ? 'text-brand-600' : 'text-navy-400 hover:text-navy-600'
          }`}
        >
          <span className="whitespace-nowrap">{label}</span>
          <ListFilter className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
          {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
        </button>

        {open && (
          <div className="absolute top-full left-0 z-20 mt-2 w-max rounded-xl border border-navy-100 bg-white p-3 shadow-soft-lg">
            {hint && <p className="mb-2 text-xs font-normal normal-case text-navy-400">{hint}</p>}
            <div className="flex items-center gap-1.5">
              <ThaiDatePicker
                value={from}
                onChange={onFromChange}
                inputClassName={dateInputClass}
                aria-label={`${label} จากวันที่`}
              />
              <span className="text-xs text-navy-300">ถึง</span>
              <ThaiDatePicker
                value={to}
                onChange={onToChange}
                inputClassName={dateInputClass}
                aria-label={`${label} ถึงวันที่`}
              />
            </div>
            {active && (
              <button
                type="button"
                onClick={() => {
                  onFromChange('')
                  onToChange('')
                }}
                className="mt-2 text-xs font-normal text-navy-400 underline transition hover:text-rose-600"
              >
                ล้างตัวกรอง
              </button>
            )}
          </div>
        )}
      </div>
    </th>
  )
}
