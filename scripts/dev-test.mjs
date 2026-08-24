// สตาร์ต dev server โดยชี้ไปที่ฐานข้อมูลทดสอบ (warranty_test) — รันด้วย: npm run dev:test
//
// ทำไมต้องมีไฟล์นี้: `next dev` บังคับ NODE_ENV=development เสมอ Next.js จึงโหลด .env.local
// (= ฐานจริง warranty_db) และไม่เคยแตะ .env.test เลย ไฟล์นี้จึงอ่าน .env.test ใส่ process.env
// ก่อน แล้วค่อย spawn `next dev` เป็นลูก — ตัวโหลด env ของ Next จะไม่เขียนทับตัวแปรที่มีค่าอยู่
// ใน process.env อยู่แล้ว ค่าจาก .env.test จึงชนะ .env.local
//
// ไม่ใช้ cross-env เพื่อไม่ต้องเพิ่ม dependency — วิธีนี้ทำงานได้ทั้ง PowerShell / cmd / bash
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TEST_ENV = path.join(root, '.env.test')
const LOCAL_ENV = path.join(root, '.env.local')

/** อ่านค่าเดียวจากไฟล์ env แบบไม่ยุ่งกับ process.env (ใช้เทียบ JWT_SECRET) */
function peekEnv(file, key) {
  try {
    const line = readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.trimStart().startsWith(`${key}=`))
    return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : undefined
  } catch {
    return undefined
  }
}

try {
  process.loadEnvFile(TEST_ENV)
} catch {
  console.error(`✗ อ่าน ${TEST_ENV} ไม่ได้ — ต้องมีไฟล์ .env.test อยู่ที่ root ของโปรเจกต์`)
  process.exit(1)
}

// กันพลาด: ถ้า .env.test ดันชี้ฐานจริง หรือใช้ JWT_SECRET ตัวเดียวกับของจริง ให้หยุดทันที
// (secret ซ้ำกัน = cookie ที่ออกจากฐานเทสต์เอาไปใช้กับระบบจริงได้ ซึ่งไม่ควรเกิด)
if (!process.env.DB_NAME || process.env.DB_NAME === 'warranty_db') {
  console.error(`✗ .env.test ตั้ง DB_NAME=${process.env.DB_NAME || '(ไม่ได้ตั้ง)'} — ต้องเป็นฐานทดสอบเท่านั้น`)
  process.exit(1)
}
if (!process.env.JWT_SECRET) {
  console.error('✗ .env.test ไม่ได้ตั้ง JWT_SECRET')
  process.exit(1)
}
if (process.env.JWT_SECRET === peekEnv(LOCAL_ENV, 'JWT_SECRET')) {
  console.error('✗ JWT_SECRET ใน .env.test ซ้ำกับ .env.local — ต้องใช้คนละตัวกับของจริง')
  process.exit(1)
}

console.log(
  `\n  ⚑ dev:test — DB=${process.env.DB_NAME} · RATE_LIMIT_ENABLED=${process.env.RATE_LIMIT_ENABLED}\n`
)

// เรียก bin ของ next ผ่าน node ตรง ๆ ไม่ผ่าน shell — เลี่ยงปัญหา .cmd/.ps1 บน Windows
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
const child = spawn(process.execPath, [nextBin, 'dev', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
