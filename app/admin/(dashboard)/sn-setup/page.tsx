'use client'

import { useEffect, useState } from 'react'
import { Pencil, Sparkles, Trash2, X } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  TableEmpty,
  TableLoading,
  Td,
  Th,
} from '@/components/admin/ui'
import { useApiList } from '@/lib/use-api-list'
import { buildStructuredSn, snDateCode, SEQUENCE_PAD } from '@/lib/sn-format'

type Scheme = {
  id: number
  label: string
  prefix: string
  model_code: string
  next_sequence: number
  sn_count: number
  /** SN ที่ยังไม่ผูกผลิตภัณฑ์ ไม่มีใครลงทะเบียน และไม่ถูก void — ลบพร้อมรูปแบบได้ */
  unused_sn_count: number
}

type ListResponse = { schemes: Scheme[] }

const EMPTY_FORM = { label: '', prefix: '', model_code: '', next_sequence: '1' }

/** SN ที่ถูกใช้ไปแล้ว — มีแม้ตัวเดียวก็ลบรูปแบบไม่ได้ */
function usedSnCount(scheme: Scheme): number {
  return scheme.sn_count - scheme.unused_sn_count
}

export default function SnSetupPage() {
  const { data, loading, error: listError, reload } = useApiList<ListResponse>('/api/admin/sn-setup')
  const schemes = data?.schemes ?? []

  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Scheme | null>(null)
  const [deleting, setDeleting] = useState(false)

  function startCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
    setSuccess('')
  }

  function startEdit(scheme: Scheme) {
    setEditingId(scheme.id)
    setForm({
      label: scheme.label,
      prefix: scheme.prefix,
      model_code: scheme.model_code,
      next_sequence: String(scheme.next_sequence),
    })
    setError('')
    setSuccess('')
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      const res = await fetch('/api/admin/sn-setup', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'บันทึกไม่สำเร็จ')
        return
      }
      setSuccess(editingId ? 'แก้ไขรูปแบบเรียบร้อย' : 'สร้างรูปแบบรหัส SN ใหม่เรียบร้อย')
      setEditingId(null)
      setForm(EMPTY_FORM)
      reload()
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setError('')
    setSuccess('')
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/sn-setup?id=${deleteTarget.id}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'ลบไม่สำเร็จ')
        return
      }
      const deletedSn = Number(body.deleted_sn) || 0
      setSuccess(
        `ลบรูปแบบ "${deleteTarget.label}" เรียบร้อย` +
          (deletedSn > 0 ? ` พร้อม SN ที่ยังไม่ถูกใช้ ${deletedSn.toLocaleString('th-TH')} ตัว` : '')
      )
      // ถ้ากำลังแก้ไขแถวที่เพิ่งลบอยู่ ต้องเคลียร์ฟอร์มกลับเป็นโหมดสร้างใหม่
      if (editingId === deleteTarget.id) {
        setEditingId(null)
        setForm(EMPTY_FORM)
      }
      setDeleteTarget(null)
      reload()
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setDeleting(false)
    }
  }

  // ปี/เดือนต้องคิดจากนาฬิกาฝั่ง client หลัง mount เท่านั้น — ถ้าคำนวณตอน render ฝั่งเซิร์ฟเวอร์ด้วย
  // แล้ว timezone เซิร์ฟเวอร์ต่างจากเบราว์เซอร์ ข้อความจะไม่ตรงกันตอน hydrate
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    void Promise.resolve().then(() => setNow(new Date()))
  }, [])

  const prefix = form.prefix.trim().toUpperCase()
  const modelCode = form.model_code.trim().toUpperCase()
  const sequence = Number(form.next_sequence) || 1
  const dateCode = now ? snDateCode(now) : ''
  const preview =
    now && prefix && modelCode ? buildStructuredSn(prefix, modelCode, sequence, now) : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">ตั้งค่ารหัส Serial Number</h1>
        <p className="mt-0.5 text-sm text-navy-400">
          สร้างรูปแบบรหัส SN ไว้ล่วงหน้า (ตัวนำหน้า + รุ่น + ปี + เดือน + เลขลำดับการผลิต) โดยยังไม่ต้องผูกกับผลิตภัณฑ์ —
          ไปสร้าง Serial Number จริงที่หน้า Serial Number แล้วค่อยผูกผลิตภัณฑ์ทีหลังได้
        </p>
      </div>

      {(error || listError) && <Alert tone="error">{error || listError}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      <Card>
        <CardHeader
          title={editingId ? `แก้ไขรูปแบบ #${editingId}` : 'สร้างรูปแบบใหม่'}
          action={
            editingId ? (
              <Button variant="secondary" onClick={startCreate}>
                <X className="h-4 w-4" />
                ยกเลิกแก้ไข
              </Button>
            ) : undefined
          }
        />
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="ชื่อเรียก" required hint="เช่น เตียงผู้ป่วยไฟฟ้า">
            <Input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="เตียงผู้ป่วยไฟฟ้า"
              maxLength={255}
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="ตัวนำหน้า" required hint="เช่น B">
              <Input
                value={form.prefix}
                onChange={(e) => setForm({ ...form, prefix: e.target.value.toUpperCase() })}
                placeholder="B"
                maxLength={10}
                className="font-mono uppercase"
                required
              />
            </Field>
            <Field label="รุ่น" required hint="เช่น 01">
              <Input
                value={form.model_code}
                onChange={(e) => setForm({ ...form, model_code: e.target.value.toUpperCase() })}
                placeholder="01"
                maxLength={10}
                className="font-mono uppercase"
                required
              />
            </Field>
            <Field label="เลขลำดับการผลิตเริ่มต้น" required hint="SN ตัวถัดไปจะเริ่มจากเลขนี้">
              <Input
                type="number"
                min={1}
                value={form.next_sequence}
                onChange={(e) => setForm({ ...form, next_sequence: e.target.value })}
                className="tabular"
                required
              />
            </Field>
          </div>

          {preview && (
            <div className="rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm">
              <div>
                <span className="text-navy-500">ตัวอย่าง SN ตัวถัดไป: </span>
                <span className="font-mono text-base font-semibold tracking-wide text-brand-700">
                  {preview}
                </span>
              </div>

              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                {[
                  { part: prefix, label: 'ตัวนำหน้า' },
                  { part: modelCode, label: 'รุ่น' },
                  { part: dateCode.slice(0, 2), label: 'ปี (ค.ศ.)' },
                  { part: dateCode.slice(2), label: 'เดือน' },
                  { part: String(sequence).padStart(SEQUENCE_PAD, '0'), label: 'ลำดับการผลิต' },
                ].map(({ part, label }) => (
                  <div key={label} className="flex items-baseline gap-1.5">
                    <dt className="font-mono font-semibold text-navy-700">{part}</dt>
                    <dd className="text-navy-400">{label}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-2.5 text-xs leading-relaxed text-navy-400">
                ปีและเดือนระบบใส่ให้อัตโนมัติจากวันที่กดสร้าง SN จริง ไม่ต้องกรอกและไม่ต้องกลับมาแก้ทุกเดือน
                ส่วนเลขลำดับนับต่อเนื่องไปเรื่อย ๆ ไม่รีเซ็ตเมื่อขึ้นเดือนใหม่
              </p>
            </div>
          )}

          <Button type="submit" disabled={saving}>
            <Sparkles className="h-4 w-4" />
            {saving ? 'กำลังบันทึก…' : editingId ? 'บันทึกการแก้ไข' : 'สร้างรูปแบบ'}
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="รูปแบบรหัส SN ที่มีอยู่" />
        <div className="scrollbar-thin -mx-6 overflow-x-auto px-6">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-navy-100">
                <Th>ชื่อเรียก</Th>
                <Th>ตัวนำหน้า</Th>
                <Th>รุ่น</Th>
                <Th>ลำดับถัดไป</Th>
                <Th>SN ที่สร้างแล้ว</Th>
                <Th>{''}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {loading && <TableLoading colSpan={6} />}
              {!loading && schemes.length === 0 && (
                <TableEmpty colSpan={6}>ยังไม่มีรูปแบบรหัส SN</TableEmpty>
              )}
              {!loading &&
                schemes.map((s) => (
                  <tr key={s.id} className="transition hover:bg-brand-50/40">
                    <Td className="font-medium text-navy-900">{s.label}</Td>
                    <Td className="font-mono">{s.prefix}</Td>
                    <Td className="font-mono">{s.model_code}</Td>
                    <Td className="tabular">{s.next_sequence}</Td>
                    <Td className="tabular">
                      {s.sn_count > 0 ? (
                        <Badge tone="brand">{s.sn_count}</Badge>
                      ) : (
                        <span className="text-navy-300">0</span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => startEdit(s)}>
                          <Pencil className="h-3.5 w-3.5" />
                          แก้ไข
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => setDeleteTarget(s)}
                          disabled={usedSnCount(s) > 0}
                          title={
                            usedSnCount(s) > 0
                              ? `รูปแบบนี้มี SN ที่ถูกใช้งานแล้ว ${usedSnCount(s).toLocaleString('th-TH')} ตัว จึงลบไม่ได้`
                              : 'ลบรูปแบบนี้'
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          ลบ
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-soft-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-navy-900">
              ลบรูปแบบ &ldquo;{deleteTarget.label}&rdquo;?
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-navy-500">
              รูปแบบ{' '}
              <span className="font-mono font-semibold text-navy-700">
                {deleteTarget.prefix}
                {deleteTarget.model_code}
              </span>{' '}
              จะถูกลบถาวรและกู้คืนไม่ได้
            </p>

            {deleteTarget.unused_sn_count > 0 && (
              <div className="mt-3">
                <Alert tone="warning">
                  SN ที่สร้างจากรูปแบบนี้และยังไม่ถูกใช้อีก{' '}
                  <span className="font-semibold">
                    {deleteTarget.unused_sn_count.toLocaleString('th-TH')} ตัว
                  </span>{' '}
                  จะถูกลบไปพร้อมกัน (ทั้งหมดยังไม่ผูกผลิตภัณฑ์และยังไม่มีใครลงทะเบียน)
                </Alert>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                ยกเลิก
              </Button>
              <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
                <Trash2 className="h-4 w-4" />
                {deleting ? 'กำลังลบ…' : 'ลบรูปแบบ'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
