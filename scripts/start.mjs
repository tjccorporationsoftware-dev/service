// npm start — รัน production build โดยอ่าน PORT (และ HOST ถ้ามี) จาก .env.local
//
// ทำไมต้องมีไฟล์นี้: Next เปิดพอร์ตก่อนโหลดไฟล์ env ค่า PORT ใน .env.local จึงไม่มีผลกับ `next start` ตรง ๆ
// ไฟล์นี้โหลด .env.local เข้า process.env ก่อน แล้วส่ง -p / -H ให้ next start
// ค่าที่มีใน process.env อยู่แล้ว (เช่น ตั้งจาก NSSM หรือ shell) ชนะค่าในไฟล์ — loadEnvFile ไม่เขียนทับ
// ไม่ตั้ง PORT = 3000 (ค่าเริ่มต้นของ Next), ไม่ตั้ง HOST = ฟังทุก interface
// อาร์กิวเมนต์อื่นส่งต่อให้ next start ตามเดิม และ -p/-H ที่ส่งมาเองจะทับค่าจากไฟล์ เช่น `npm start -- -p 4000`
//
// deploy จริง: NSSM ชี้มาที่ไฟล์นี้ แล้วเลขพอร์ตอยู่ใน .env.local ของชุดนั้นที่เดียว (กับ Apache vhost)
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envFile = path.join(root, '.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const extra = process.argv.slice(2)
const has = (...flags) => flags.some((f) => extra.includes(f))
const args = ['start']

if (!has('-p', '--port')) {
  const port = process.env.PORT ?? '3000'
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    console.error(`✗ PORT=${port} ใน .env.local ใช้ไม่ได้ — ต้องเป็นเลขพอร์ต 1–65535`)
    process.exit(1)
  }
  args.push('-p', port)
}
if (process.env.HOST && !has('-H', '--hostname')) args.push('-H', process.env.HOST)
args.push(...extra)

// เรียก bin ของ next ผ่าน node ตรง ๆ ไม่ผ่าน shell — เลี่ยงปัญหา .cmd/.ps1 บน Windows (แบบเดียวกับ dev-test.mjs)
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
const child = spawn(process.execPath, [nextBin, ...args], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
