import { readFile } from 'node:fs/promises'
import { requireAdmin } from '@/lib/auth'
import { WARRANTY_HEADER_PATH } from '@/lib/warranty-card'

/** รูปหัวกระดาษใบรับประกัน (template/warranty-header.png) — URL มี ?v=<เวลาแก้ไขไฟล์> จึง cache นานได้ */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  let png: Buffer
  try {
    png = await readFile(WARRANTY_HEADER_PATH)
  } catch {
    return Response.json({ error: 'ยังไม่มีรูปหัวกระดาษบนเครื่องนี้' }, { status: 404 })
  }

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(png.length),
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
