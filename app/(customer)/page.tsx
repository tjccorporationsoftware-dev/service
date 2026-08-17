import { CalendarClock, FileSignature, MessageCircleQuestion, Search, ShieldCheck } from 'lucide-react'
import { Card, LinkButton } from '@/components/ui'

const BENEFITS = [
  {
    icon: CalendarClock,
    text: 'ตรวจสอบวันหมดประกันอัตโนมัติ ไม่ต้องจดจำวันหมดประกันด้วยตนเอง',
  },
  {
    icon: ShieldCheck,
    text: 'แจ้งปัญหาได้สะดวกยิ่งขึ้น ลงทะเบียนครั้งเดียว ใช้ข้อมูลอ้างอิงได้ทุกครั้ง',
  },
  {
    icon: MessageCircleQuestion,
    text: 'ติดตามสถานะการให้บริการ ตรวจสอบความคืบหน้าได้ตลอดเวลา ไม่ต้องโทรสอบถาม',
  },
]

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="text-center sm:text-left">
        <div className="mx-auto max-w-2xl space-y-4 sm:mx-0">
          <h1 className="text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">
            ดูแลการรับประกันของคุณได้ง่าย ๆ ในที่เดียว
          </h1>
          <p className="leading-relaxed text-navy-500">
            ลงทะเบียนรับประกันสินค้าเพื่อรับบริการตามเงื่อนไข พร้อมแจ้งปัญหาและติดตามสถานะคำขอบริการได้อย่างสะดวก
            ทุกขั้นตอนดำเนินการออนไลน์และใช้เวลาเพียงไม่กี่นาที
          </p>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-4 sm:justify-start">
          <LinkButton href="/register" size="xl">
            <FileSignature className="h-5 w-5" />
            ลงทะเบียนตอนนี้
          </LinkButton>
          <LinkButton href="/status" variant="secondary" size="xl">
            <Search className="h-5 w-5" />
            เช็คสถานะ
          </LinkButton>
        </div>
      </section>

      <Card className="bg-brand-50/50">
        <h2 className="font-semibold text-navy-900">ทำไมต้องลงทะเบียน</h2>
        <ul className="mt-4 space-y-4">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" strokeWidth={2} />
              <span className="text-sm leading-relaxed text-navy-600">{text}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
