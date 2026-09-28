import { BookOpen, Download, Maximize2 } from 'lucide-react'
import { Alert, Button, Card, CardHeader, formatDate } from '@/components/admin/ui'
import { readManual } from '@/lib/manual'

// อ่านไฟล์จาก manual/ ทุกครั้งที่เปิด — วางคู่มือฉบับใหม่แล้วเห็นทันทีโดยไม่ต้อง build ใหม่
export const dynamic = 'force-dynamic'

export default async function ManualPage() {
  const manual = await readManual()

  if (!manual) {
    return (
      <Card>
        <CardHeader title="คู่มือการใช้งาน" />
        <Alert tone="warning">
          ยังไม่มีคู่มือบนเครื่องนี้ — ผู้ดูแลระบบต้องคัดลอกโฟลเดอร์ <code>manual</code> (มีไฟล์ manual.json
          และรูปแต่ละหน้า) ไปวางไว้ในโฟลเดอร์โปรเจกต์ของเว็บนี้ก่อน
        </Alert>
      </Card>
    )
  }

  const fileUrl = (file: string) => `/api/admin/manual/${file}?v=${encodeURIComponent(manual.version)}`

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={manual.title}
          description={`ฉบับวันที่ ${formatDate(manual.updated)} · ${manual.pages.length} หน้า — กดที่ชื่อหน้าเพื่อข้ามไปดู`}
          action={
            manual.pdf && (
              <a href={fileUrl(manual.pdf)} download={`${manual.title}.pdf`}>
                <Button variant="secondary">
                  <Download className="h-4 w-4" />
                  ดาวน์โหลด PDF
                </Button>
              </a>
            )
          }
        />

        <ol className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {manual.pages.map((page, i) => (
            <li key={page.file}>
              {/* ไม่ใส่เลขลำดับหน้าหน้าชื่อ — ชื่อมี "ขั้นตอนที่ N" อยู่แล้ว เลขสองชุดจะชวนสับสน */}
              <a
                href={`#page-${i + 1}`}
                className="block rounded-lg px-2 py-1.5 text-sm text-navy-600 transition hover:bg-brand-50 hover:text-brand-700"
              >
                {page.title}
              </a>
            </li>
          ))}
        </ol>
      </Card>

      {manual.pages.map((page, i) => (
        <Card key={page.file} padded={false} className="overflow-hidden">
          <figure id={`page-${i + 1}`} className="scroll-mt-20 md:scroll-mt-6">
            <figcaption className="flex items-center justify-between gap-3 border-b border-navy-100 px-5 py-3">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-navy-800">
                <BookOpen className="h-4 w-4 shrink-0 text-brand-600" />
                <span className="truncate">{page.title}</span>
              </span>
              <a
                href={fileUrl(page.file)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600 transition hover:text-brand-700"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                เปิดรูปเต็ม
              </a>
            </figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fileUrl(page.file)}
              alt={page.title}
              loading={i < 2 ? 'eager' : 'lazy'}
              className="block h-auto w-full"
            />
          </figure>
        </Card>
      ))}
    </div>
  )
}
