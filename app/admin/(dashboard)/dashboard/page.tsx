'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  ListChecks,
  Loader2,
  PackageCheck,
  ShieldCheck,
  Timer,
} from 'lucide-react'
import { Badge, Card, ISSUE_STATUS_TONE, StatCard, formatDateTime } from '@/components/admin/ui'
import { ISSUE_STATUS_LABEL } from '@/lib/warranty'

type Stats = {
  serials: { total: number; available: number; registered: number; void: number }
  warranty: { total: number; not_started: number; active: number; expiring_soon: number }
  issues: { total: number; pending: number; in_progress: number; resolved: number; closed: number }
  recent_issues: { id: number; status: string; created_at: string; sn: string; product_name: string }[]
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/stats')
      .then((res) => res.json())
      .then((data) => (data.error ? setError(data.error) : setStats(data)))
      .catch(() => setError('โหลดข้อมูลไม่สำเร็จ'))
  }, [])

  if (error) return <Card>{error}</Card>
  if (!stats) {
    return (
      <Card className="flex items-center justify-center gap-2 py-12 text-navy-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        กำลังโหลด…
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">ภาพรวมทั้งหมด</h1>
        <p className="mt-0.5 text-sm text-navy-400">สรุปสถานะ การรับประกัน และคำขอรับบริการ</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Boxes} label="ผลิตภัณฑ์ทั้งหมด" value={stats.serials.total} tone="slate" />
        <StatCard
          icon={PackageCheck}
          label="รอลงทะเบียน"
          value={stats.serials.available}
          hint={`ลงทะเบียนแล้ว ${stats.serials.registered.toLocaleString('th-TH')}`}
          tone="brand"
        />
        <StatCard
          icon={ShieldCheck}
          label="อยู่ระหว่างรับประกัน"
          value={stats.warranty.active}
          hint={`จากทั้งหมด ${stats.warranty.total.toLocaleString('th-TH')} เครื่อง`}
          tone="green"
        />
        <StatCard
          icon={AlertTriangle}
          label="ใกล้สิ้นสุดการรับประกัน"
          value={stats.warranty.expiring_soon}
          tone={stats.warranty.expiring_soon > 0 ? 'amber' : 'slate'}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Clock}
          label="คำขอรับบริการใหม่"
          value={stats.issues.pending}
          tone={stats.issues.pending > 0 ? 'amber' : 'slate'}
        />
        <StatCard icon={Timer} label="กำลังดำเนินการ" value={stats.issues.in_progress} tone="brand" />
        <StatCard icon={CheckCircle2} label="ดำเนินการเสร็จสิ้น" value={stats.issues.resolved} tone="green" />
        <StatCard icon={ListChecks} label="คำขอรับบริการทั้งหมด" value={stats.issues.total} tone="slate" />
      </section>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-navy-900">คำขอทั้งหมด</h2>
          <Link
            href="/admin/issues"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 transition hover:text-brand-700"
          >
            ดูทั้งหมด
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {stats.recent_issues.length === 0 ? (
          <p className="py-6 text-center text-sm text-navy-300">ยังไม่มีเคสแจ้งเข้ามา</p>
        ) : (
          <ul className="divide-y divide-navy-50">
            {stats.recent_issues.map((issue) => (
              <li key={issue.id} className="flex flex-wrap items-center justify-between gap-2 py-3.5">
                <div>
                  <span className="font-mono text-sm font-medium text-navy-900">{issue.sn}</span>
                  <span className="ml-2 text-sm text-navy-400">{issue.product_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-navy-300">{formatDateTime(issue.created_at)}</span>
                  <Badge tone={ISSUE_STATUS_TONE[issue.status]}>
                    {ISSUE_STATUS_LABEL[issue.status]}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
