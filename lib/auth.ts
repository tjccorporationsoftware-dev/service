import { cookies } from 'next/headers'
import {
  SESSION_COOKIE,
  SESSION_HOURS,
  signSession,
  verifySession,
  type AdminSession,
} from './session-token'

export { SESSION_COOKIE, signSession, verifySession }
export type { AdminSession }

/** อ่าน session จาก cookie (Server Component / Route Handler) */
export async function getSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySession(token)
}

export async function setSessionCookie(token: string) {
  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_HOURS * 60 * 60,
  })
}

export async function clearSessionCookie() {
  ;(await cookies()).delete(SESSION_COOKIE)
}

/**
 * ใช้ต้น Route Handler ฝั่งแอดมิน:
 *   const auth = await requireAdmin()
 *   if (!auth.ok) return auth.response
 */
export async function requireAdmin(): Promise<
  { ok: true; session: AdminSession } | { ok: false; response: Response }
> {
  const session = await getSession()
  if (!session) {
    return {
      ok: false,
      response: Response.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 }),
    }
  }
  return { ok: true, session }
}
