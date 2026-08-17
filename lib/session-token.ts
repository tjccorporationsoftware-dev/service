import { SignJWT, jwtVerify } from 'jose'

// แยกออกจาก lib/auth.ts เพราะ proxy.ts ใช้ไฟล์นี้ได้ แต่แตะ next/headers ไม่ได้
export const SESSION_COOKIE = 'warranty_session'
export const SESSION_HOURS = 8

export type AdminSession = {
  id: number
  username: string
  role: 'admin' | 'staff'
  displayName: string | null
}

function secretKey() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('ยังไม่ได้ตั้งค่า JWT_SECRET ใน .env.local')
  return new TextEncoder().encode(secret)
}

export async function signSession(session: AdminSession): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secretKey())
}

export async function verifySession(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey())
    return {
      id: payload.id as number,
      username: payload.username as string,
      role: payload.role as 'admin' | 'staff',
      displayName: (payload.displayName as string | null) ?? null,
    }
  } catch {
    return null
  }
}
