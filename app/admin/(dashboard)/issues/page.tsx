'use client'

import { useMemo, useState } from 'react'
import { Inbox, PencilLine } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  ISSUE_STATUS_TONE,
  Pagination,
  Select,
  Textarea,
  formatDate,
  formatDateTime,
} from '@/components/admin/ui'
import { ISSUE_STATUS_LABEL } from '@/lib/warranty'
import { useApiList } from '@/lib/use-api-list'

type Attachment = { type: string; url: string }

type Issue = {
  id: number
  case_number: string
  description: string
  status: string
  in_warranty: boolean
  admin_note: string | null
  created_at: string
  updated_at: string
  sn: string
  phone: string
  customer_name: string | null
  warranty_end: string
  product_name: string
  attachments: Attachment[]
}

type ListResponse = {
  issues: Issue[]
  meta: { total: number; page: number; total_pages: number }
}

const EMPTY_META = { total: 0, page: 1, total_pages: 1 }

export default function IssuesPage() {
  const [filters, setFilters] = useState({ search: '', status: '' })
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState({ status: '', admin_note: '' })
  const [saving, setSaving] = useState(false)

  const url = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), per_page: '10' })
    if (filters.search) params.set('search', filters.search)
    if (filters.status) params.set('status', filters.status)
    return `/api/admin/issues?${params}`
  }, [page, filters])

  const { data, loading, error: listError, reload } = useApiList<ListResponse>(url)
  const issues = data?.issues ?? []
  const meta = data?.meta ?? EMPTY_META

  function startEdit(issue: Issue) {
    setEditing(issue.id)
    setDraft({ status: issue.status, admin_note: issue.admin_note ?? '' })
  }

  async function save(issueId: number) {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/issues/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'อัปเดตไม่สำเร็จ')
        return
      }
      setError('')
      setEditing(null)
      reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">คำขอรับบริการ</h1>
        <p className="mt-0.5 text-sm text-navy-400">
          ตรวจสอบและจัดการคำขอรับบริการจากลูกค้า พร้อมอัปเดตสถานะและบันทึกผลการดำเนินงาน
        </p>
      </div>

      {(error || listError) && <Alert tone="error">{error || listError}</Alert>}

      <Card>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Input
            value={filters.search}
            onChange={(e) => {
              setPage(1)
              setFilters({ ...filters, search: e.target.value })
            }}
            placeholder="ค้นหา SN / เบอร์โทร / รายละเอียดปัญหา…"
          />
          <Select
            value={filters.status}
            onChange={(e) => {
              setPage(1)
              setFilters({ ...filters, status: e.target.value })
            }}
          >
            <option value="">ทุกสถานะ</option>
            {Object.entries(ISSUE_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {loading && (
        <Card className="flex items-center justify-center py-12 text-sm text-navy-400">
          กำลังโหลด…
        </Card>
      )}
      {!loading && issues.length === 0 && (
        <Card className="flex flex-col items-center py-12 text-center">
          <Inbox className="mb-3 h-9 w-9 text-navy-200" strokeWidth={1.5} />
          <p className="text-sm text-navy-400">ไม่พบเคสตามเงื่อนไขที่เลือก</p>
        </Card>
      )}

      {!loading &&
        issues.map((issue) => (
          <Card key={issue.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold text-navy-900">{issue.case_number}</span>
                  <Badge tone={ISSUE_STATUS_TONE[issue.status]}>
                    {ISSUE_STATUS_LABEL[issue.status]}
                  </Badge>
                  {!issue.in_warranty && <Badge tone="amber">นอกประกัน</Badge>}
                </div>
                <p className="mt-1.5 text-sm text-navy-500">
                  <span className="font-mono">{issue.sn}</span> · {issue.product_name}
                </p>
                <p className="text-sm text-navy-500">
                  {issue.customer_name || 'ไม่ระบุชื่อ'} · <span className="tabular">{issue.phone}</span> ·
                  ประกันถึง {formatDate(issue.warranty_end)}
                </p>
              </div>
              <div className="text-right text-xs text-navy-300">
                <div>แจ้ง {formatDateTime(issue.created_at)}</div>
                <div>อัปเดต {formatDateTime(issue.updated_at)}</div>
              </div>
            </div>

            <p className="mt-4 rounded-xl bg-navy-50/60 p-3.5 text-sm whitespace-pre-wrap text-navy-700">
              {issue.description}
            </p>

            {issue.attachments.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {issue.attachments.map((file) =>
                  file.type === 'image' ? (
                    <a key={file.url} href={file.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={file.url}
                        alt="ไฟล์แนบ"
                        className="h-24 w-24 rounded-xl border border-navy-100 object-cover shadow-soft transition hover:opacity-80"
                      />
                    </a>
                  ) : (
                    <video
                      key={file.url}
                      src={file.url}
                      controls
                      className="h-24 rounded-xl border border-navy-100 shadow-soft"
                    />
                  )
                )}
              </div>
            )}

            {editing === issue.id ? (
              <div className="mt-4 space-y-3 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
                <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-navy-700">สถานะ</span>
                    <Select
                      value={draft.status}
                      onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                    >
                      {Object.entries(ISSUE_STATUS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-navy-700">
                      หมายเหตุ (ลูกค้าเห็นข้อความนี้)
                    </span>
                    <Textarea
                      rows={3}
                      value={draft.admin_note}
                      onChange={(e) => setDraft({ ...draft, admin_note: e.target.value })}
                      placeholder="เช่น นัดรับเครื่องวันที่ … / เปลี่ยนอะไหล่เรียบร้อยแล้ว"
                    />
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => save(issue.id)} disabled={saving}>
                    {saving ? 'กำลังบันทึก…' : 'บันทึก'}
                  </Button>
                  <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
                    ยกเลิก
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={() => startEdit(issue)}>
                  <PencilLine className="h-4 w-4" />
                  อัปเดตสถานะ / หมายเหตุ
                </Button>
                {issue.admin_note && (
                  <p className="text-sm text-navy-400">
                    หมายเหตุ: <span className="text-navy-700">{issue.admin_note}</span>
                  </p>
                )}
              </div>
            )}
          </Card>
        ))}

      {!loading && issues.length > 0 && (
        <Card>
          <Pagination meta={meta} onChange={setPage} />
        </Card>
      )}
    </div>
  )
}
