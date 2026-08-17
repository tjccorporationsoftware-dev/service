import bcrypt from 'bcryptjs'
import { queryOne } from '@/lib/db'
import { adminLoginSchema, firstIssueMessage } from '@/lib/validations'
import { signSession, setSessionCookie } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const limited = checkRateLimit(request, 'admin-login', 10, 5 * 60_000)
  if (limited) return limited

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const parsed = adminLoginSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  }
  const { username, password } = parsed.data

  const admin = await queryOne<{
    id: number
    username: string
    password_hash: string
    display_name: string | null
    role: 'admin' | 'staff'
  }>('SELECT id, username, password_hash, display_name, role FROM admins WHERE username = ?', [
    username,
  ])

  // ข้อความเดียวกันทั้งกรณีไม่พบ user และรหัสผิด — ไม่บอกใบ้ว่ามี username นี้อยู่จริง
  const invalid = Response.json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 })
  if (!admin) {
    await bcrypt.compare(password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva')
    return invalid
  }
  if (!(await bcrypt.compare(password, admin.password_hash))) return invalid

  const session = {
    id: admin.id,
    username: admin.username,
    role: admin.role,
    displayName: admin.display_name,
  }
  await setSessionCookie(await signSession(session))

  return Response.json({ admin: session })
}
