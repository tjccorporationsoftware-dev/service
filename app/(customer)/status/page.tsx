'use client'

import { useState } from 'react'
import { Inbox, Phone, QrCode, Search } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  IconCircle,
  ISSUE_STATUS_TONE,
  InputWithIcon,
  formatDate,
  formatDateTime,
} from '@/components/ui'
import { ISSUE_STATUS_LABEL } from '@/lib/warranty'

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
  attachments: Attachment[]
}

type Result = {
  registration: {
    sn: string
    product_name: string
    phone: string
    registered_at: string
    warranty_start: string | null
    warranty_end: string | null
    days_left: number | null
    warranty_status: 'active' | 'expired' | 'not_started'
  }
  issues: Issue[]
}

export default function StatusPage() {
  const [form, setForm] = useState({ sn: '', phone: '' })
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setResult(null)
    setLoading(true)
    try {
      const params = new URLSearchParams({ sn: form.sn, phone: form.phone })
      const res = await fetch(`/api/issues/status?${params}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'ค้นหาไม่สำเร็จ')
        return
      }
      setResult(data)
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <IconCircle icon={Search} />
        <div>
          <h1 className="text-2xl font-bold text-navy-900">ตรวจสอบสถานะ</h1>
          <p className="mt-1 text-sm text-navy-500">ค้นหาด้วย Serial Number และหมายเลขโทรศัพท์ที่ใช้ลงทะเบียน</p>
        </div>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Serial Number" required>
            <InputWithIcon
              icon={QrCode}
              value={form.sn}
              onChange={(e) => setForm({ ...form, sn: e.target.value.toUpperCase() })}
              placeholder="WR-XXXX-XXXXXX"
              className="font-mono"
              required
            />
          </Field>
          <Field label="หมายเลขโทรศัพท์" required>
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
          <Button type="submit" disabled={loading} className="h-[42px]">
            {loading ? 'กำลังค้นหา…' : 'ค้นหา'}
          </Button>
        </form>
        {error && (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
      </Card>

      {result && (
        <>
          <Card>
            <h2 className="mb-4 font-semibold text-navy-900">ข้อมูลการรับประกันสินค้า</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Serial Number" value={result.registration.sn} mono />
              <Detail label="ผลิตภัณฑ์" value={result.registration.product_name} />
            </dl>
            <div className="mt-5 space-y-4 border-t border-navy-100 pt-5">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="วันที่ลงทะเบียน" value={formatDate(result.registration.registered_at)} />
                <Detail
                  label="วันที่เริ่มรับประกัน"
                  value={
                    result.registration.warranty_start
                      ? formatDate(result.registration.warranty_start)
                      : 'รอเจ้าหน้าที่ยืนยัน'
                  }
                />
              </dl>
              <div>
                <dt className="text-xs text-navy-400">สถานะการรับประกัน</dt>
                <dd className="mt-1">
                  {result.registration.warranty_status === 'active' ? (
                    <Badge tone="green">อยู่ในระยะรับประกัน • คงเหลือ {result.registration.days_left} วัน</Badge>
                  ) : result.registration.warranty_status === 'expired' ? (
                    <Badge tone="red">หมดประกันแล้ว</Badge>
                  ) : (
                    <Badge tone="slate">ยังไม่เริ่มประกัน</Badge>
                  )}
                  {result.registration.warranty_end && (
                    <p className="mt-1 text-xs text-navy-400">
                      สิ้นสุดวันที่ {formatDate(result.registration.warranty_end)}
                    </p>
                  )}
                </dd>
              </div>
            </div>
          </Card>

          <div className="space-y-3">
            <h2 className="font-semibold text-navy-900">ประวัติคำขอรับบริการ ({result.issues.length})</h2>
            {result.issues.length === 0 ? (
              <Card className="flex flex-col items-center py-10 text-center">
                <Inbox className="mb-3 h-9 w-9 text-navy-200" strokeWidth={1.5} />
                <p className="text-sm text-navy-400">ยังไม่มีรายการแจ้งปัญหาสำหรับสินค้านี้</p>
              </Card>
            ) : (
              result.issues.map((issue) => (
                <Card key={issue.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-navy-900">{issue.case_number}</span>
                    <div className="flex items-center gap-2">
                      {!issue.in_warranty && <Badge tone="amber">นอกประกัน</Badge>}
                      <Badge tone={ISSUE_STATUS_TONE[issue.status]}>{ISSUE_STATUS_LABEL[issue.status]}</Badge>
                    </div>
                  </div>

                  <p className="mt-3 text-sm whitespace-pre-wrap text-navy-700">{issue.description}</p>

                  {issue.attachments.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {issue.attachments.map((file) =>
                        file.type === 'image' ? (
                          <a key={file.url} href={file.url} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={file.url}
                              alt="ไฟล์แนบ"
                              className="h-20 w-20 rounded-xl border border-navy-100 object-cover shadow-soft transition hover:opacity-80"
                            />
                          </a>
                        ) : (
                          <video
                            key={file.url}
                            src={file.url}
                            controls
                            className="h-20 rounded-xl border border-navy-100 shadow-soft"
                          />
                        )
                      )}
                    </div>
                  )}

                  {issue.admin_note && (
                    <div className="mt-4 rounded-xl bg-navy-50/60 p-3.5">
                      <p className="text-xs font-medium text-navy-400">หมายเหตุ</p>
                      <p className="mt-1 text-sm whitespace-pre-wrap text-navy-700">{issue.admin_note}</p>
                    </div>
                  )}

                  <p className="mt-3 text-xs text-navy-300">
                    ส่งคำขอเมื่อ {formatDateTime(issue.created_at)} · อัปเดตล่าสุด{' '}
                    {formatDateTime(issue.updated_at)}
                  </p>
                </Card>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-navy-400">{label}</dt>
      <dd className={`mt-0.5 text-navy-900 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
