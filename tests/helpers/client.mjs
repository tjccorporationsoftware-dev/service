// HTTP client สำหรับยิง API จริงที่ dev server
//
// เรื่อง rate limit: .env.test ตั้ง RATE_LIMIT_ENABLED=true เพื่อให้ทดสอบเคส 429 ได้
// แต่ bucket ถูกคีย์ด้วย IP จาก X-Forwarded-For (lib/rate-limit.ts → clientIp)
// ถ้าทุกเทสต์ยิงจาก IP เดียวกัน เทสต์ที่ไม่เกี่ยวกับ rate limit จะโดน 429 ปนเปื้อน
// จึงให้แต่ละไฟล์เทสต์ใช้ IP ปลอมของตัวเอง → ได้ bucket แยกกัน
//
// หมายเหตุ: การที่ client กำหนด X-Forwarded-For เองได้แบบนี้ = finding #4 ใน TEST-PLAN.md
// (ข้าม rate limit ได้ถ้าไม่มี reverse proxy เขียนทับ header) เทสต์ rate-limit.test.mjs พิสูจน์ไว้
import { SignJWT } from 'jose'
import { BASE_URL, JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD } from './env.mjs'

export const SESSION_COOKIE = 'warranty_session'

// node --test รันแต่ละไฟล์คนละ process ถ้าเริ่มนับจาก 0 เหมือนกันหมด ทุกไฟล์จะได้ IP ชุดเดียวกัน
// แล้ว bucket ฝั่ง server (โดยเฉพาะ login 10 ครั้ง/5 นาที) จะสะสมข้ามไฟล์จนเต็มแล้วตอบ 429
// จึงต้องหว่านจุดเริ่มด้วย pid ให้แต่ละ process ได้ช่วง IP ของตัวเอง
const IP_SPACE = 16_777_216
let ipCounter = (process.pid * 7919) % IP_SPACE

/** IP ปลอมไม่ซ้ำกัน สำหรับแยก bucket ของ rate limiter */
export function freshIp() {
  ipCounter = (ipCounter + 1) % IP_SPACE
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`
}

/**
 * ยิง request ไปที่ dev server
 * @param {string} method
 * @param {string} path
 * @param {{body?: any, form?: FormData, cookie?: string, ip?: string, headers?: Record<string,string>, raw?: boolean}} opts
 */
export async function api(method, path, opts = {}) {
  const headers = { ...(opts.headers ?? {}) }
  headers['X-Forwarded-For'] = opts.ip ?? freshIp()
  if (opts.cookie) headers['Cookie'] = opts.cookie

  let body
  if (opts.form) {
    body = opts.form // ปล่อยให้ fetch ตั้ง Content-Type + boundary เอง
  } else if (opts.body !== undefined) {
    body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)
    headers['Content-Type'] ??= 'application/json'
  }

  const res = await fetch(new URL(path, BASE_URL), { method, headers, body, redirect: 'manual' })

  const out = {
    status: res.status,
    headers: res.headers,
    location: res.headers.get('location'),
    setCookie: res.headers.getSetCookie?.() ?? [],
    contentType: res.headers.get('content-type') ?? '',
  }

  if (opts.raw) {
    out.buffer = Buffer.from(await res.arrayBuffer())
    return out
  }

  const text = await res.text()
  out.text = text
  try {
    out.json = JSON.parse(text)
  } catch {
    out.json = null
  }
  return out
}

export const get = (path, opts) => api('GET', path, opts)
export const post = (path, opts) => api('POST', path, opts)
export const patch = (path, opts) => api('PATCH', path, opts)

/** login แล้วคืน cookie header ที่พร้อมใช้ */
export async function loginAdmin(username = ADMIN_USERNAME, password = ADMIN_PASSWORD) {
  const res = await post('/api/admin/login', { body: { username, password } })
  if (res.status !== 200) {
    throw new Error(`login ไม่สำเร็จ (${res.status}): ${res.text}`)
  }
  const raw = res.setCookie.find((c) => c.startsWith(`${SESSION_COOKIE}=`))
  if (!raw) throw new Error('login สำเร็จแต่ไม่มี Set-Cookie กลับมา')
  return raw.split(';')[0]
}

const enc = (s) => new TextEncoder().encode(s)

/** สร้าง JWT ปลอมแบบต่าง ๆ เพื่อทดสอบ proxy.ts */
export async function forgeCookie(kind, payloadOverrides = {}) {
  const payload = {
    id: 1,
    username: 'admin',
    role: 'admin',
    displayName: 'ผู้ดูแลระบบ',
    ...payloadOverrides,
  }

  if (kind === 'garbage') return `${SESSION_COOKIE}=not-a-jwt-at-all`

  if (kind === 'alg-none') {
    // header alg:none + ไม่มีลายเซ็น — ต้องถูกปฏิเสธ
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
    return `${SESSION_COOKIE}=${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`
  }

  if (kind === 'tampered') {
    const valid = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(enc(JWT_SECRET))
    const [h, p, s] = valid.split('.')
    const decoded = JSON.parse(Buffer.from(p, 'base64url').toString())
    decoded.id = 999
    const swapped = Buffer.from(JSON.stringify(decoded)).toString('base64url')
    return `${SESSION_COOKIE}=${h}.${swapped}.${s}`
  }

  const secret = kind === 'wrong-secret' ? enc('a-completely-different-secret-value') : enc(JWT_SECRET)
  const exp = kind === 'expired' ? Math.floor(Date.now() / 1000) - 60 : Math.floor(Date.now() / 1000) + 3600
  const iat = kind === 'expired' ? Math.floor(Date.now() / 1000) - 7200 : Math.floor(Date.now() / 1000)

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(secret)
  return `${SESSION_COOKIE}=${token}`
}

/** ถอด payload ของ JWT ออกมาดูโดยไม่ตรวจลายเซ็น */
export function decodeJwt(cookie) {
  const token = cookie.replace(`${SESSION_COOKIE}=`, '')
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
}

/** ชุดเคส auth มาตรฐานที่ทุก endpoint แอดมินต้องผ่าน (§2.0 ของ TEST-PLAN.md) */
export const AUTH_FAILURE_CASES = [
  { name: 'ไม่ส่ง cookie เลย', cookie: undefined },
  { name: 'cookie เป็นสตริงมั่ว', kind: 'garbage' },
  { name: 'JWT เซ็นด้วย secret อื่น', kind: 'wrong-secret' },
  { name: 'JWT หมดอายุ', kind: 'expired' },
  { name: 'JWT alg=none', kind: 'alg-none' },
  { name: 'JWT ถูกแก้ payload ไม่ได้เซ็นใหม่', kind: 'tampered' },
]

export async function cookieFor(testCase) {
  if (!testCase.kind) return undefined
  return forgeCookie(testCase.kind)
}
