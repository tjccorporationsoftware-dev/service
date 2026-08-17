import { stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { CONTENT_TYPE_BY_EXT, resolveUploadPath } from '@/lib/uploads'

export async function GET(_request: Request, ctx: RouteContext<'/api/files/[...path]'>) {
  const { path: segments } = await ctx.params

  const filePath = resolveUploadPath(segments)
  if (!filePath) {
    return new Response('Forbidden', { status: 403 })
  }

  const ext = path.extname(filePath).slice(1).toLowerCase()
  const contentType = CONTENT_TYPE_BY_EXT[ext]
  if (!contentType) {
    return new Response('Not Found', { status: 404 })
  }

  let fileStat
  try {
    fileStat = await stat(filePath)
  } catch {
    return new Response('Not Found', { status: 404 })
  }
  if (!fileStat.isFile()) {
    return new Response('Not Found', { status: 404 })
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream

  return new Response(stream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(fileStat.size),
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
