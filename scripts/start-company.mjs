// รัน production build ของ "ชุดบริษัท" ที่เลือก จากโฟลเดอร์เดียว — ใช้ทดสอบหลายบริษัทพร้อมกันบนเครื่อง dev
//
//   node scripts/start-company.mjs tjc                      ชุดเดียว
//   node scripts/start-company.mjs tjc art tangjai ascent   หลายชุดพร้อมกัน (log ขึ้นต้นด้วย [ชื่อชุด])
//
// แต่ละชุดอ่านค่าจาก .env.<ชุด> (DB_NAME, PORT, BRAND_COLOR_PRIMARY, JWT_SECRET ...) แล้ว spawn `next start`
// ทุกชุดใช้ .next เดียวกัน = build ครั้งเดียวใช้ได้ทุกบริษัท ซึ่งเป็นสิ่งที่ต้องการพิสูจน์ก่อน deploy จริง
// (ตัวโหลด env ของ Next ไม่เขียนทับตัวแปรที่มีใน process.env อยู่แล้ว ค่าจาก .env.<ชุด> จึงชนะ .env.local)
//
// ต้อง `npm run build` ก่อน — ถ้าแก้โค้ดต้อง build ใหม่ทุกครั้ง (นี่คือ production mode ไม่มี HMR)
// ข้อจำกัดของการรันจากโฟลเดอร์เดียว: โฟลเดอร์ uploads/ ใช้ร่วมกันทุกชุด (deploy จริงแยกโฟลเดอร์จึงไม่ปน)
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const names = process.argv.slice(2)

if (names.length === 0) {
  console.error('ใช้: node scripts/start-company.mjs <ชุด> [ชุด ...]   เช่น  tjc art tangjai ascent')
  process.exit(1)
}
if (!existsSync(path.join(root, '.next', 'BUILD_ID'))) {
  console.error('✗ ยังไม่มี production build — รัน `npm run build` ก่อน')
  process.exit(1)
}

/** อ่านไฟล์ env แบบง่าย (KEY=VALUE ต่อบรรทัด ข้ามคอมเมนต์) โดยไม่แตะ process.env ของตัวเอง */
function readEnvFile(file) {
  const vars = {}
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    vars[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  }
  return vars
}

const localSecret = existsSync(path.join(root, '.env.local'))
  ? readEnvFile(path.join(root, '.env.local')).JWT_SECRET
  : undefined

const sets = names.map((name) => {
  const file = path.join(root, `.env.${name}`)
  if (!existsSync(file)) {
    console.error(`✗ ไม่พบ ${file}`)
    process.exit(1)
  }
  const vars = readEnvFile(file)

  // กันพลาด: ชุดทดสอบต้องไม่ชี้ฐานจริง และต้องไม่ใช้ secret เดียวกับของจริง (cookie ข้ามระบบได้)
  if (!vars.DB_NAME || vars.DB_NAME === 'warranty_db') {
    console.error(`✗ .env.${name} ตั้ง DB_NAME=${vars.DB_NAME || '(ไม่ได้ตั้ง)'} — ต้องเป็นฐานของชุดนั้นเท่านั้น`)
    process.exit(1)
  }
  if (!vars.JWT_SECRET) {
    console.error(`✗ .env.${name} ไม่ได้ตั้ง JWT_SECRET`)
    process.exit(1)
  }
  if (localSecret && vars.JWT_SECRET === localSecret) {
    console.error(`✗ .env.${name} ใช้ JWT_SECRET ซ้ำกับ .env.local — ต้องคนละตัวกับของจริง`)
    process.exit(1)
  }
  const port = Number(vars.PORT)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error(`✗ .env.${name} ตั้ง PORT=${vars.PORT ?? '(ไม่ได้ตั้ง)'} — ต้องเป็นเลขพอร์ต 1024–65535`)
    process.exit(1)
  }
  return { name, port, vars }
})

const dupPorts = sets.filter((s, i) => sets.findIndex((o) => o.port === s.port) !== i)
if (dupPorts.length) {
  console.error(`✗ พอร์ตซ้ำกัน: ${dupPorts.map((s) => `${s.name}=${s.port}`).join(', ')}`)
  process.exit(1)
}

console.log('\n  ⚑ start-company — build ครั้งเดียว รันหลายชุดจากโฟลเดอร์นี้\n')
for (const { name, port, vars } of sets) {
  console.log(
    `  [${name.padEnd(8)}] http://localhost:${port}  DB=${vars.DB_NAME}  BRAND_COLOR_PRIMARY=${vars.BRAND_COLOR_PRIMARY ?? '(ไม่ได้ตั้ง = ธีมเริ่มต้น)'}`
  )
}
console.log('\n  เข้าผ่าน http://localhost:<พอร์ต> เท่านั้น (cookie เป็น secure ในโหมด production เบราว์เซอร์ยอมให้เฉพาะ localhost)')
console.log('  กด Ctrl+C หยุดทุกชุดพร้อมกัน\n')

const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
const width = Math.max(...sets.map((s) => s.name.length))

const children = sets.map(({ name, port, vars }) => {
  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
    cwd: root,
    env: { ...process.env, ...vars, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const tag = `[${name.padEnd(width)}] `
  const pipe = (stream, out) => {
    let buffer = ''
    stream.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) if (line.trim()) out.write(tag + line + '\n')
    })
  }
  pipe(child.stdout, process.stdout)
  pipe(child.stderr, process.stderr)
  child.on('exit', (code, signal) => {
    process.stdout.write(`${tag}หยุดแล้ว (${signal ?? `exit ${code}`})\n`)
  })
  return child
})

function stopAll() {
  for (const child of children) if (child.exitCode === null) child.kill()
}
process.on('SIGINT', () => {
  stopAll()
  process.exit(0)
})
process.on('SIGTERM', () => {
  stopAll()
  process.exit(0)
})
