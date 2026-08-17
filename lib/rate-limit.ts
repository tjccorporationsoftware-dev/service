/**
 * Rate limiter แบบ fixed window เก็บใน memory
 * เพียงพอสำหรับ deploy แบบ instance เดียว — ถ้า scale หลาย instance ให้ย้ายไป Redis
 */
type Bucket = { count: number; resetAt: number }

const globalForLimiter = globalThis as unknown as { warrantyBuckets?: Map<string, Bucket> }
const buckets = globalForLimiter.warrantyBuckets ?? new Map<string, Bucket>()
globalForLimiter.warrantyBuckets = buckets

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (bucket.count >= limit) return false

  bucket.count++
  return true
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

/**
 * เปิด/ปิด rate limit
 * ค่าเริ่มต้น: ปิดตอน development (ไม่ให้ขัดจังหวะตอนทดสอบ) เปิดตอน production
 * บังคับได้ด้วย RATE_LIMIT_ENABLED=true/false ใน .env.local
 */
function isEnabled(): boolean {
  const flag = process.env.RATE_LIMIT_ENABLED
  if (flag === 'true') return true
  if (flag === 'false') return false
  return process.env.NODE_ENV === 'production'
}

/** คืน Response 429 ถ้าเกินโควตา, คืน null ถ้าผ่าน */
export function checkRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number
): Response | null {
  if (!isEnabled()) return null
  if (rateLimit(`${scope}:${clientIp(request)}`, limit, windowMs)) return null
  return Response.json(
    { error: 'มีการเรียกใช้งานถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' },
    { status: 429 }
  )
}
