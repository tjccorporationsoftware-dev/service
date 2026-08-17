'use client'

import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  ImagePlus,
  Phone,
  QrCode,
  Trash2,
  Video as VideoIcon,
  Wrench,
} from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  Field,
  IconCircle,
  InputWithIcon,
  LinkButton,
  Textarea,
  formatDate,
} from '@/components/ui'
import { UPLOAD_LIMITS } from '@/lib/validations'

type WarrantyInfo = {
  registered: boolean
  claimed?: boolean
  product_name: string
  warranty_end?: string
  days_left?: number
  status?: 'active' | 'expired' | 'not_started'
}

type Success = {
  case_number: string
  product_name: string
  in_warranty: boolean
  attachments: number
}

export default function ReportPage() {
  const [form, setForm] = useState({ sn: '', phone: '', description: '' })
  const [images, setImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [video, setVideo] = useState<File | null>(null)
  const [videoPreview, setVideoPreview] = useState('')
  const [warranty, setWarranty] = useState<WarrantyInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<Success | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  // สร้าง object URL ไว้แสดงพรีวิว แล้วคืนหน่วยความจำทุกครั้งที่ไฟล์เปลี่ยนหรือออกจากหน้า
  useEffect(() => {
    const urls = images.map((file) => URL.createObjectURL(file))
    void Promise.resolve().then(() => setImagePreviews(urls))
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [images])

  useEffect(() => {
    if (!video) {
      void Promise.resolve().then(() => setVideoPreview(''))
      return
    }
    const url = URL.createObjectURL(video)
    void Promise.resolve().then(() => setVideoPreview(url))
    return () => URL.revokeObjectURL(url)
  }, [video])

  async function checkWarranty() {
    if (!form.sn.trim()) return
    setChecking(true)
    setWarranty(null)
    try {
      const res = await fetch(`/api/warranty/check?sn=${encodeURIComponent(form.sn)}`)
      const data = await res.json()
      setWarranty(res.ok ? data : null)
      if (!res.ok) setError(data.error ?? 'ตรวจสอบ Serial Number ไม่สำเร็จ')
      else setError('')
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ')
    } finally {
      setChecking(false)
    }
  }

  function addImages(fileList: FileList | null) {
    const incoming = Array.from(fileList ?? [])
    if (incoming.length === 0) return
    const combined = [...images, ...incoming]
    if (combined.length > UPLOAD_LIMITS.image.maxCount) {
      setError(UPLOAD_LIMITS.image.label)
      return
    }
    const tooBig = incoming.find((f) => f.size > UPLOAD_LIMITS.image.maxSize)
    if (tooBig) {
      setError(`รูป "${tooBig.name}" ใหญ่เกิน 5MB`)
      return
    }
    setError('')
    setImages(combined)
  }

  function removeImage(index: number) {
    setImages(images.filter((_, i) => i !== index))
  }

  function setSingleVideo(fileList: FileList | null) {
    const file = fileList?.[0] ?? null
    if (file && file.size > UPLOAD_LIMITS.video.maxSize) {
      setError(`วิดีโอ "${file.name}" ใหญ่เกิน 50MB`)
      return
    }
    setError('')
    setVideo(file)
  }

  function handleDrop(kind: 'image' | 'video') {
    return (event: React.DragEvent<HTMLButtonElement>) => {
      event.preventDefault()
      if (kind === 'image') addImages(event.dataTransfer.files)
      else setSingleVideo(event.dataTransfer.files)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    const body = new FormData()
    body.set('sn', form.sn)
    body.set('phone', form.phone)
    body.set('description', form.description)
    images.forEach((file) => body.append('images', file))
    if (video) body.append('video', video)

    try {
      const res = await fetch('/api/issues', { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'แจ้งปัญหาไม่สำเร็จ')
        return
      }
      setSuccess(data.issue)
    } catch {
      setError('ส่งข้อมูลไม่สำเร็จ — ไฟล์อาจมีขนาดใหญ่เกินไป')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <IconCircle icon={CheckCircle2} tone="green" size="lg" className="mx-auto" />
        <div>
          <h1 className="text-2xl font-bold text-navy-900">รับเรื่องเรียบร้อย</h1>
          <p className="mt-1 text-sm text-navy-500">กรุณาเก็บเลขที่เคสไว้เพื่อติดตามสถานะ</p>
        </div>

        <Card className="text-left">
          <p className="text-sm text-navy-400">เลขที่เคส</p>
          <p className="font-mono text-2xl font-bold text-brand-700">{success.case_number}</p>
          <p className="mt-2 text-sm text-navy-600">
            ผลิตภัณฑ์: {success.product_name} · แนบไฟล์ {success.attachments} รายการ
          </p>
          {!success.in_warranty && (
            <div className="mt-4">
              <Alert tone="warning">
                สินค้าอยู่นอกระยะประกันแล้ว ทีมงานจะแจ้งค่าใช้จ่ายให้ทราบก่อนดำเนินการ
              </Alert>
            </div>
          )}
          <div className="mt-6">
            <LinkButton href="/status" variant="secondary">
              ติดตามสถานะเคส
            </LinkButton>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-start gap-4">
        <IconCircle icon={Wrench} tone="amber" />
        <div>
          <h1 className="text-2xl font-bold text-navy-900">แจ้งปัญหาการใช้งาน</h1>
          <p className="mt-1 text-sm text-navy-500">
            กรุณาลงทะเบียนผลิตภัณฑ์ก่อนส่งคำขอรับบริการ และตรวจสอบสิทธิ์การรับประกันด้วยหมายเลขประจำเครื่อง
            และใช้หมายเลขโทรศัพท์เดียวกับที่ลงทะเบียนไว้
          </p>
        </div>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <Alert tone="error">{error}</Alert>}

          <Field label="Serial Number" required>
            <div className="flex gap-2">
              <InputWithIcon
                icon={QrCode}
                value={form.sn}
                onChange={(e) => setForm({ ...form, sn: e.target.value.toUpperCase() })}
                onBlur={checkWarranty}
                placeholder="WR-XXXX-XXXXXX"
                className="font-mono"
                maxLength={50}
                required
              />
              <Button type="button" variant="secondary" onClick={checkWarranty} disabled={checking}>
                {checking ? 'กำลังตรวจ…' : 'ตรวจสอบ'}
              </Button>
            </div>
          </Field>

          {warranty && !warranty.registered && (
            <Alert tone="warning">
              Serial Number นี้ยังไม่ถูกลงทะเบียน กรุณา{' '}
              <a href="/register" className="font-medium underline">
                ลงทะเบียนรับประกัน
              </a>{' '}
              ก่อนแจ้งปัญหา
            </Alert>
          )}
          {warranty?.registered && !warranty.claimed && (
            <Alert tone="warning">
              {warranty.product_name} · เจ้าหน้าที่เปิดใช้งานประกันไว้แล้ว แต่ยังไม่มีใครลงทะเบียนผูกข้อมูลติดต่อ
              — กรุณา{' '}
              <a href="/register" className="font-medium underline">
                ลงทะเบียน
              </a>{' '}
              ผูกเบอร์โทรของท่านก่อนจึงจะแจ้งปัญหาได้
            </Alert>
          )}
          {warranty?.registered && warranty.claimed && warranty.status === 'not_started' && (
            <Alert tone="warning">
              {warranty.product_name} · ลงทะเบียนแล้ว แต่ยังรอเจ้าหน้าที่เริ่มระยะเวลาประกัน —
              กรุณาติดต่อเจ้าหน้าที่ก่อนจึงจะแจ้งปัญหาได้
            </Alert>
          )}
          {warranty?.registered && warranty.claimed && warranty.status === 'active' && (
            <Alert tone="success">
              {warranty.product_name} · อยู่ในประกันถึง {formatDate(warranty.warranty_end)} (เหลือ{' '}
              {warranty.days_left} วัน)
            </Alert>
          )}
          {warranty?.registered && warranty.claimed && warranty.status === 'expired' && (
            <Alert tone="warning">
              {warranty.product_name} · หมดประกันแล้วเมื่อ {formatDate(warranty.warranty_end)} —
              ยังแจ้งปัญหาได้ แต่จะถือเป็นเคสนอกประกัน
            </Alert>
          )}

          <Field label="หมายเลขโทรศัพท์ที่ใช้ลงทะเบียน" required>
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

          <Field
            label="รายละเอียดอาการหรือปัญหา"
            required
            hint="กรุณาอธิบายอาการที่พบอย่างละเอียด อย่างน้อย 10 ตัวอักษร"
          >
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={5}
              placeholder="เช่น เปิดเครื่องแล้วไม่มีภาพ มีเสียงดังผิดปกติจากด้านหลังเครื่อง…"
              required
            />
          </Field>

          <Field label="แนบรูปถ่าย" hint={UPLOAD_LIMITS.image.label}>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png"
              multiple
              onChange={(e) => {
                addImages(e.target.files)
                e.target.value = ''
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              onDrop={handleDrop('image')}
              onDragOver={(e) => e.preventDefault()}
              disabled={images.length >= UPLOAD_LIMITS.image.maxCount}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-navy-200 bg-navy-50/40 px-4 py-4 text-sm text-navy-400 transition hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ImagePlus className="h-4 w-4" />
              คลิกหรือลากรูปมาวางตรงนี้
            </button>

            {imagePreviews.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {imagePreviews.map((url, index) => (
                  <div key={url} className="group relative h-20 w-20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`ตัวอย่างรูปที่ ${index + 1}`}
                      className="h-full w-full rounded-xl border border-navy-100 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      aria-label="ลบรูปนี้"
                      className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white shadow-soft transition hover:bg-rose-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Field>

          <Field label="แนบวิดีโอ" hint={UPLOAD_LIMITS.video.label}>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4"
              onChange={(e) => {
                setSingleVideo(e.target.files)
                e.target.value = ''
              }}
              className="hidden"
            />
            {!video ? (
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                onDrop={handleDrop('video')}
                onDragOver={(e) => e.preventDefault()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-navy-200 bg-navy-50/40 px-4 py-4 text-sm text-navy-400 transition hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-600"
              >
                <VideoIcon className="h-4 w-4" />
                คลิกหรือลากวิดีโอมาวางตรงนี้
              </button>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-navy-100 bg-navy-50/40 p-3">
                <video src={videoPreview} className="h-14 w-20 rounded-lg object-cover" muted />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-navy-700">{video.name}</p>
                  <p className="text-xs text-navy-400">{(video.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <button
                  type="button"
                  onClick={() => setVideo(null)}
                  aria-label="ลบวิดีโอนี้"
                  className="shrink-0 rounded-lg p-1.5 text-navy-400 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </Field>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={
              submitting ||
              (!!warranty?.registered && (!warranty.claimed || warranty.status === 'not_started'))
            }
          >
            {submitting ? 'กำลังส่ง…' : 'ส่งคำขอรับบริการ'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
