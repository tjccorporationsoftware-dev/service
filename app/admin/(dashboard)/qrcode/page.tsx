'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, Download } from 'lucide-react'
import { Alert, Button, Card, CardHeader, Field, Input, Select } from '@/components/admin/ui'

const DESTINATIONS = [
  { value: 'register', label: 'ลงทะเบียนผลิตภัณฑ์', path: '/register' },
  { value: 'report', label: 'แจ้งปัญหาการใช้งาน', path: '/report' },
  { value: 'status', label: 'ตรวจสอบสถานะ', path: '/status' },
  { value: 'home', label: 'หน้าแรก', path: '/' },
  { value: 'custom', label: 'กำหนดเอง…', path: '' },
] as const

type Destination = (typeof DESTINATIONS)[number]['value']

const SIZE_OPTIONS = [240, 320, 480, 640]

export default function QrCodePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState<Destination>('register')
  const [customPath, setCustomPath] = useState('/register')
  const [size, setSize] = useState(320)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  // window ใช้ได้เฉพาะฝั่ง client — ต้องรอ mount ก่อนถึงจะรู้ origin จริง
  // (เช่น http://localhost:3000 ตอน dev หรือ IP วง LAN ตอนทดสอบสแกนจากมือถือ)
  useEffect(() => {
    void Promise.resolve().then(() => setOrigin(window.location.origin))
  }, [])

  const rawPath =
    destination === 'custom' ? customPath.trim() : DESTINATIONS.find((d) => d.value === destination)!.path
  const isFullUrl = /^https?:\/\//i.test(rawPath)
  const targetUrl = !origin
    ? ''
    : isFullUrl
      ? rawPath
      : `${origin}${rawPath.startsWith('/') ? rawPath : `/${rawPath}`}`

  useEffect(() => {
    if (!canvasRef.current || !targetUrl) return
    setError('')
    QRCode.toCanvas(canvasRef.current, targetUrl, {
      width: size,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#101823', light: '#ffffff' },
    }).catch(() => setError('สร้าง QR Code ไม่สำเร็จ — ลิงก์อาจไม่ถูกต้อง'))
  }, [targetUrl, size])

  function downloadPng() {
    const canvas = canvasRef.current
    if (!canvas || !targetUrl) return
    const link = document.createElement('a')
    link.download = `qrcode-${destination}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  async function copyLink() {
    if (!targetUrl) return
    await navigator.clipboard.writeText(targetUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900">สร้าง QR Code</h1>
        <p className="mt-0.5 text-sm text-navy-400">
          สร้างคิวอาร์โค้ดสำหรับพิมพ์บนฉลากสินค้า เอกสาร หรือใบรับประกัน
          เพื่อให้ลูกค้าเข้าถึงบริการที่กำหนดได้อย่างรวดเร็ว
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="ตั้งค่าปลายทาง" />
          <div className="space-y-4">
            <Field label="หน้าที่ต้องการเชื่อมโยง" required>
              <Select
                value={destination}
                onChange={(e) => setDestination(e.target.value as Destination)}
              >
                {DESTINATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>

            {destination === 'custom' && (
              <Field label="พาธหรือ URL" hint="เช่น /register หรือ https://example.com/promo">
                <Input
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder="/register"
                />
              </Field>
            )}

            <Field
              label="ขนาด (พิกเซล)"
              hint="ยิ่งใหญ่ยิ่งพิมพ์คมชัด แนะนำ 320px ขึ้นไปสำหรับพิมพ์สติกเกอร์"
            >
              <Select value={String(size)} onChange={(e) => setSize(Number(e.target.value))}>
                {SIZE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s} × {s}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3">
              <p className="text-xs font-medium text-navy-400">ลิงก์ปลายทางของ QR Code</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-mono text-sm text-navy-800">
                  {targetUrl || '—'}
                </p>
                <button
                  onClick={copyLink}
                  disabled={!targetUrl}
                  className="shrink-0 text-navy-400 transition hover:text-brand-600 disabled:opacity-40"
                  aria-label="คัดลอกลิงก์"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col items-center gap-4">
          <canvas ref={canvasRef} className="rounded-xl border border-navy-100 shadow-soft" />
          <Button onClick={downloadPng} disabled={!targetUrl} className="w-full">
            <Download className="h-4 w-4" />
            ดาวน์โหลด PNG
          </Button>
        </Card>
      </div>
    </div>
  )
}
