import { stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { requireAdmin } from '@/lib/auth'
import { MANUAL_CONTENT_TYPE, resolveManualFile } from '@/lib/manual'

export async function GET(_request: Request, ctx: RouteContext<'/api/admin/manual/[file]'>) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { file } = await ctx.params
  const filePath = resolveManualFile(file)
  if (!filePath) {
    return Response.json({ error: 'ไม่พบไฟล์คู่มือ' }, { status: 404 })
  }

  try {
    let fileStat
    try {
      fileStat = await stat(filePath)
    } catch {
      return Response.json({ error: 'ไม่พบไฟล์คู่มือ' }, { status: 404 })
    }
    if (!fileStat.isFile()) {
      return Response.json({ error: 'ไม่พบไฟล์คู่มือ' }, { status: 404 })
    }

    const ext = path.extname(filePath).slice(1).toLowerCase()
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream

    return new Response(stream, {
      headers: {
        'Content-Type': MANUAL_CONTENT_TYPE[ext],
        'Content-Length': String(fileStat.size),
        'Content-Disposition': 'inline',
        // URL มี ?v=<version> ของฉบับนั้นอยู่แล้ว — ออกฉบับใหม่ = URL ใหม่ จึง cache นานได้
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    console.error('manual file failed:', err)
    return Response.json({ error: 'เปิดไฟล์คู่มือไม่สำเร็จ' }, { status: 500 })
  }
}
