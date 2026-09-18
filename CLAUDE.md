# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ระบบลงทะเบียนรับประกันสินค้า (Warranty Registration System) — Next.js 16 App Router + MariaDB
ข้อความที่ผู้ใช้เห็นทั้งหมด (error, label, ปุ่ม) เป็น **ภาษาไทย** — เขียนโค้ดใหม่ให้ตามนี้เสมอ

## คำสั่ง

```bash
npm run dev        # dev server → ฐานจริง warranty_db (ต้องเปิด MariaDB ใน XAMPP ก่อน)
npm run dev:test   # dev server → ฐานทดสอบ warranty_test + เปิด rate limit
npm run build      # production build
npm start          # รัน production build — อ่าน PORT/HOST จาก .env.local ผ่าน scripts/start.mjs (Next ไม่อ่าน PORT จากไฟล์ env เอง)
npm run db:init    # สร้าง DB + ตาราง + migration + แอดมินคนแรก — รันซ้ำได้ ไม่ลบข้อมูลเดิม (ผลิตภัณฑ์ตัวอย่างเฉพาะเมื่อ SEED_PRODUCTS=true)
npm run start:company -- tjc art tangjai ascent   # รัน production build หลายชุดบริษัทพร้อมกันจากโฟลเดอร์นี้ (อ่าน .env.<ชุด> ต้อง build ก่อน)
npm run admin:password -- <username> <password>   # ตั้งรหัสผ่านแอดมิน (bcrypt)

npx tsc --noEmit   # typecheck
npx eslint .       # lint  (`npm run lint` เรียก eslint เปล่า ๆ ไม่ระบุ path)
```

**ไม่มี test framework ในโปรเจกต์นี้** — การตรวจก่อนส่งงานคือ `tsc --noEmit` + `eslint` + `npm run build` ให้ผ่านทั้งสามตัว

`db:init` และ `admin:password` รันด้วย `node --env-file=.env.local` — ตัวแปรที่ต้องมีคือ `DB_*`, `JWT_SECRET`,
`RATE_LIMIT_ENABLED`, `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`

`BRAND_COLOR_PRIMARY=rrggbb` (ไม่บังคับ **ไม่ใส่ #**) ตั้งสีแบรนด์ต่อชุด deploy โดยไม่ต้อง build ใหม่ — ดูหัวข้อ *ธีมสีต่อบริษัท*
`SEED_PRODUCTS=true` ให้ `db:init` ใส่ผลิตภัณฑ์ตัวอย่าง 6 รายการ — ต้องตั้งใน `.env.test` (เทสต์ public นับขั้นต่ำ 6) ห้ามตั้งกับฐานบริษัทจริง · `PORT`/`HOST` ใช้โดย `npm start` เท่านั้น

`next.config.ts` มี `allowedDevOrigins` ฝัง IP ของเครื่องพัฒนาไว้ — ถ้าเข้าจากเครื่องอื่นใน LAN ตอน dev แล้วโดนบล็อก ให้เพิ่ม IP ตรงนั้นแล้ว restart

### สตาร์ต dev server ให้ชี้ฐานที่ถูกต้อง

มี 2 ฐานบนเครื่องเดียวกัน — **`warranty_db` = ข้อมูลจริง**, **`warranty_test` = ข้อมูลทดสอบ** เลือกด้วยคำสั่งที่ใช้สตาร์ต:

| คำสั่ง | ฐาน | JWT_SECRET | rate limit | ไฟล์ env |
|---|---|---|---|---|
| `npm run dev` | `warranty_db` | ของจริง | ปิด | `.env.local` |
| `npm run dev:test` | `warranty_test` | คนละตัวกับของจริง | เปิด | `.env.test` ทับ `.env.local` |

`next dev` บังคับ `NODE_ENV=development` เสมอ Next.js จึงโหลด **`.env.local` เท่านั้น** และ**ไม่เคยแตะ `.env.test`**
(ไฟล์ `.env.test` ถูกโหลดอัตโนมัติเฉพาะตอน `NODE_ENV=test` ซึ่ง dev server ไม่มีทางเป็น)

`dev:test` จึงต้องผ่าน `scripts/dev-test.mjs` ซึ่ง `process.loadEnvFile('.env.test')` ใส่ `process.env` **ก่อน** spawn `next dev`
— ตัวโหลด env ของ Next ไม่เขียนทับตัวแปรที่มีค่าใน `process.env` อยู่แล้ว ค่าจาก `.env.test` จึงชนะ ส่วนตัวที่ `.env.test` ไม่ได้ตั้งก็ยังตกมาจาก `.env.local` ตามปกติ
(ไม่ใช้ `cross-env` เพื่อไม่เพิ่ม dependency และให้รันได้ทั้ง PowerShell / cmd / bash)

สคริปต์จะ **หยุดทันที** ถ้าไม่มีไฟล์ `.env.test`, `.env.test` ชี้ `DB_NAME=warranty_db` หรือ `JWT_SECRET` ซ้ำกับ `.env.local`
(secret ซ้ำ = cookie จากฐานเทสต์ใช้กับระบบจริงได้) — `.env*` อยู่ใน `.gitignore` เครื่องใหม่จึงต้องสร้าง `.env.test` เองก่อนใช้ `dev:test`

**เช็คว่าตอนนี้ชี้ฐานไหน** — เรียงจากง่ายไปแน่นอนที่สุด:

1. ดูบรรทัดที่ `instrumentation.ts` พิมพ์ตอน server boot (dev/test เท่านั้น ไม่พิมพ์ตอน production):
   ```
   ⚑ ฐานข้อมูล: root@127.0.0.1:3306/warranty_test  ·  RATE_LIMIT_ENABLED=true
   ```
   บรรทัด `- Environments: .env.local` ของ Next **ไม่ใช่คำตอบ** — มันบอกแค่ว่าอ่านไฟล์ไหน ไม่ได้บอกว่าค่าไหนชนะ
2. ยิง endpoint ที่สะท้อนข้อมูลจริง แล้วเทียบกับ DB ตรง ๆ เช่น `curl -s localhost:3000/api/products` แล้วนับจำนวนเทียบกับ
   `SELECT COUNT(*) FROM products WHERE is_active=1` ของแต่ละฐาน

ถ้า login ไม่ผ่านทั้งที่ hash ถูก — ให้สงสัยเรื่อง "แก้ hash คนละฐานกับที่ dev server ต่ออยู่" ก่อนเสมอ
ตั้งรหัสผ่านให้ฐานทดสอบด้วย `node --env-file=.env.test scripts/set-admin-password.mjs <username> <password>`
(`npm run admin:password` ผูกกับ `.env.local` = ฐานจริงเสมอ)

Next 16 ยอมให้รัน dev server ได้ **ครั้งละตัวต่อโฟลเดอร์** — ต้องปิดตัวเดิมก่อนสลับไปอีกโหมด

## Domain model — วงจรชีวิตของ SN และการรับประกัน

นี่คือแกนของทั้งระบบ อ่านส่วนนี้ก่อนแตะโค้ดที่เกี่ยวกับ SN / registration / warranty

```
sn_schemes (prefix + model_code + next_sequence)
   │ POST /api/admin/sn/generate  ── ล็อกแถว scheme ด้วย FOR UPDATE
   ▼
serial_numbers (product_id = NULL, status = 'available')
   │ POST /api/admin/sn/assign-product  ── ผูกผลิตภัณฑ์ทีหลัง
   ▼
serial_numbers (ผูกผลิตภัณฑ์แล้ว)
   │
   ├─ ทางที่ 1: ลูกค้าลงทะเบียนก่อน — POST /api/register
   │     สร้าง registration พร้อมข้อมูลติดต่อ แต่ warranty_start/end = NULL (สถานะ not_started)
   │     แล้วรอแอดมินกด "เริ่มประกัน"
   │
   └─ ทางที่ 2: แอดมินเริ่มประกันก่อน — POST /api/admin/registrations/start-warranty
         สร้าง registration "เปล่า" (phone/customer_name/email = NULL) พร้อมวันประกัน
         แล้วรอลูกค้ามา claim ผ่าน /api/register (เติมข้อมูลติดต่อลงแถวเดิม)
```

กติกาที่ต้องรักษาไว้เมื่อแก้โค้ดส่วนนี้:

- **ระยะประกันเริ่มนับเมื่อแอดมินกด "เริ่มประกัน" เท่านั้น** ไม่ใช่ตอนลูกค้าลงทะเบียน — เพื่อผูกวันเริ่มกับหลักฐานจริง (ใบเสร็จ) แอดมินจึงเลือกวันย้อนหลังได้
- `warranty_end` = `warranty_start` + ระยะประกันของ **ผลิตภัณฑ์** คำนวณด้วย `addDuration()` (บวกปี+เดือนก่อน แล้วค่อยบวกวัน; เดือนไม่ล้น — 31 ม.ค. + 1 เดือน = 28 ก.พ.)
- `start-warranty` ทำงานที่ระดับ `serial_numbers` ไม่ใช่ `registrations` เพราะบางแถวยังไม่มีใครลงทะเบียน และมัน **ข้าม** SN ที่ `void` หรือมี `warranty_start` แล้ว (กันกดซ้ำทับวันเดิม)
- ตอน claim ถ้าแอดมินเริ่มประกันไว้แล้ว วันที่ลูกค้ากรอก (`customer_reported_warranty_*`) ต้องตรงกับ `warranty_start/end` ในระบบ ไม่งั้นตอบ 409 และ **ไม่อัปเดตอะไรเลย** — คอลัมน์ `customer_reported_*` เป็นค่าที่ลูกค้าอ้าง ไม่เคยถูกใช้คำนวณ
- `POST /api/issues` ตอบ 409 ถ้า `warranty_end` ยังเป็น `NULL` — แจ้งปัญหาก่อนเริ่มประกันไม่ได้
- 1 SN ลงทะเบียนได้ครั้งเดียว (`registrations.serial_number_id` เป็น UNIQUE)
- `products.source_type` ตัดสินว่าใครออกรหัส SN — `in_house` = เราสร้างเองจากหน้าตั้งค่ารหัส SN, `resale` = SN ติดมากับสินค้าแล้ว นำเข้าผ่าน `/api/admin/sn/import`

## สถาปัตยกรรม

### Next.js 16 — จุดที่ต่างจากเวอร์ชันเก่า

- **`proxy.ts` ที่ root คือ middleware** (Next 16 เปลี่ยนชื่อ) ป้องกัน `/admin/*` และ `/api/admin/*` — ยกเว้น `/admin/login`, `/api/admin/login`, `/api/admin/logout`
- `lib/session-token.ts` ถูกแยกออกจาก `lib/auth.ts` **โดยเจตนา**: proxy แตะ `next/headers` ไม่ได้ ไฟล์นี้จึงมีแต่ jose (sign/verify JWT) ล้วน ๆ ส่วน `lib/auth.ts` เป็นฝั่งที่ใช้ cookie ได้ (`getSession`, `setSessionCookie`, `requireAdmin`)
- `serverExternalPackages: ['mysql2', 'bcryptjs']` ใน `next.config.ts` — สองตัวนี้โหลดโมดูลแบบ dynamic ห้าม bundle
- route group: `app/(customer)/` = หน้าลูกค้า, `app/admin/(dashboard)/` = หน้าที่ต้อง login (แยกออกมาเพื่อให้ `/admin/login` ไม่ติด layout นี้)
- `instrumentation.ts` ที่ root — Next เรียก `register()` ครั้งเดียวตอน server boot ตอนนี้ใช้พิมพ์ปลายทาง DB (`dbTarget` จาก `lib/db.ts`) ออก console เฉพาะตอน dev/test ถ้าจะเพิ่มอะไรในนี้ ต้องคง guard `NEXT_RUNTIME === 'nodejs'` + ไม่ทำงานตอน production ไว้
  ข้อยกเว้นเดียวคือ `getBrand()` ที่เรียก**ก่อน** guard production โดยเจตนา — `BRAND_COLOR_PRIMARY` ผิดรูปแบบจะถูก log เป็น error ตั้งแต่ boot และทุก request ตอบ 500 (process ไม่ตาย) ไม่ต้องรอใครเปิดหน้าเว็บถึงจะรู้ (ขั้นนั้นไม่ log ค่าอื่น)

### Data layer — `lib/db.ts`

`query` / `queryOne` / `execute` / `withTransaction` ครอบ mysql2 pool (pool เก็บบน `globalThis` กัน HMR สร้างซ้ำ)

- ใช้ prepared statement ทุกที่ **ยกเว้น LIMIT/OFFSET** ที่ mysql2 ไม่รับ placeholder — ต้องผ่าน `parsePagination()` ใน `lib/pagination.ts` ซึ่ง clamp เป็นจำนวนเต็มก่อนต่อลง string เสมอ ห้ามต่อค่าจาก request ลง SQL ทางอื่น
- `IN (...)` สร้าง placeholder ด้วย `ids.map(() => '?').join(',')` แล้ว spread ค่าเข้าไป
- pool ตั้ง `dateStrings: ['DATE']` — คอลัมน์ `DATE` กลับมาเป็น string `'YYYY-MM-DD'` ไม่ใช่ `Date` object จึงเทียบกันตรง ๆ ได้
- งานที่แตะหลายตารางหรือมีเงื่อนไขแข่งกัน ให้ห่อ `withTransaction` + `SELECT ... FOR UPDATE` (ดูตัวอย่างใน `app/api/register/route.ts`, `app/api/admin/registrations/start-warranty/route.ts`, `lib/sn-generator.ts`)

### แก้ schema ต้องแก้ 2 ที่

1. `db/schema.sql` — ความจริงสำหรับ DB ที่สร้างใหม่
2. อาร์เรย์ `MIGRATIONS` ใน `scripts/init-db.mjs` — `ALTER TABLE ... IF NOT EXISTS` สำหรับ DB ที่มีอยู่แล้ว ต้อง idempotent (รันซ้ำได้) และ **ต่อท้ายเท่านั้น ห้ามแก้รายการเดิม**

ไม่มี migration tool อื่น `npm run db:init` คือทั้งหมด

### Route handler conventions

ทุกตัวใน `app/api/**/route.ts` ทำตามลำดับนี้:

```ts
const limited = checkRateLimit(request, 'scope', 10, 60_000)   // เฉพาะ endpoint public
if (limited) return limited

const auth = await requireAdmin()                              // เฉพาะ endpoint แอดมิน
if (!auth.ok) return auth.response

const parsed = someSchema.safeParse(body)                      // schema อยู่ใน lib/validations.ts
if (!parsed.success) return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
```

- ตอบด้วย `Response.json` (Web API) ไม่ใช่ `NextResponse` — `NextResponse` ใช้เฉพาะใน `proxy.ts`
- error body เป็น `{ error: '<ข้อความไทย>' }` เสมอ บาง endpoint เพิ่ม `field_errors` ได้
- `catch` ปิดท้ายด้วย `console.error('<ชื่องาน> failed:', err)` แล้วตอบข้อความกลาง ๆ 500 — ห้ามส่งรายละเอียด error ออกไปหาผู้ใช้
- การกระทำสำคัญของแอดมิน (generate SN, เริ่มประกัน, อัปเดตเคส) เขียนลง `audit_logs` **นอก** transaction หลัก
- `requireAdmin()` ซ้อนกับ `proxy.ts` โดยตั้งใจ — เป็น defense in depth อย่าถอดออกเพราะคิดว่า proxy กันแล้ว

### SN generation — `lib/sn-format.ts` + `lib/sn-generator.ts`

รูปแบบ: `prefix + model_code + YY + MM + ลำดับ 6 หลัก` → `B012608000001`

- `sn-format.ts` เป็น **pure module** ไม่พึ่ง node/db — import ได้ทั้ง client และ server เพื่อให้หน้าจอแอดมินโชว์ตัวอย่างด้วยสูตรเดียวกับตอนสร้างจริง อย่าเพิ่ม dependency ฝั่ง node เข้าไฟล์นี้
- `generateSerialBatch()` ล็อกแถว `sn_schemes` ด้วย `FOR UPDATE` กันเลขลำดับชนกัน และตรึง `new Date()` ไว้ครั้งเดียวต่อชุด (กันสร้างคร่อมเที่ยงคืนสิ้นเดือนแล้วได้เดือนคนละค่าในชุดเดียวกัน)
- `ER_DUP_ENTRY` ถูกแปลงเป็นข้อความไทยที่บอกให้ไปแก้เลขลำดับเริ่มต้น — เก็บพฤติกรรมนี้ไว้

### วันที่ / timezone

ไทยเป็น UTC+7 — โค้ดใช้ **local time ทุกจุด**: `getFullYear/getMonth/getDate` และ `toDateString()` ใน `lib/warranty.ts`

**ห้ามใช้ `toISOString()`** เพื่อทำ `YYYY-MM-DD` และห้ามใช้ `getUTC*` — จะได้วันที่เพี้ยนไป 1 วันในช่วงเที่ยงคืนถึงตี 7
แปลง string เป็น Date ด้วย `new Date(dateStr + 'T00:00:00')` (ไม่มี `Z`)

`lib/warranty.ts` ยังมี `durationBetween()` (อินเวอร์สของ `addDuration`), `normalizeDuration()` (18 เดือน → 1 ปี 6 เดือน), `formatDuration()` (ข้อความไทย) และฟังก์ชัน mask เบอร์โทรตาม PDPA — หน้า public ต้องปิดบังเบอร์เสมอ

### ไฟล์อัปโหลด — `lib/uploads.ts`

เก็บที่ `uploads/` **นอก `public/`** (ไฟล์ที่อัปโหลดหลัง build จะไม่ถูกเสิร์ฟถ้าอยู่ใน `public/`) แล้วเสิร์ฟผ่าน `/api/files/*` ซึ่งเผื่อเพิ่มการตรวจสิทธิ์ได้ภายหลัง ใน DB เก็บแค่ relative path

ชื่อไฟล์ตั้งใหม่เป็น UUID เสมอ ไม่แตะชื่อจากผู้ใช้ และ `resolveUploadPath()` ยืนยันว่า path ที่คลี่แล้วยังอยู่ใน `UPLOAD_ROOT` (กัน traversal)
ข้อจำกัดอยู่ที่ `UPLOAD_LIMITS` ใน `lib/validations.ts` — jpg/png ≤ 5MB สูงสุด 5 รูป, mp4 ≤ 50MB 1 คลิป

### UI

มี UI kit **สองชุดแยกกันโดยตั้งใจ** — `components/ui.tsx` (ฝั่งลูกค้า) และ `components/admin/ui.tsx` (ฝั่งแอดมิน มี `Th/Td/Pagination/StatCard/TableLoading` เพิ่ม)
ชื่อ export ซ้ำกัน (`Card`, `Button`, `Field`, `formatDate`) แต่คนละสไตล์ — import ให้ตรงฝั่ง อย่ารวมเป็นไฟล์เดียว

หน้าตารางฝั่งแอดมินใช้ `useApiList(url)` จาก `lib/use-api-list.ts` — derive `loading` จากการเทียบ url ที่โหลดสำเร็จ (ไม่ `setLoading(true)` ในเอฟเฟกต์ ตามกฎ react-hooks) และมี `reload()` สำหรับโหลดซ้ำหลังบันทึกโดยตารางไม่กะพริบ

Tailwind v4 ผ่าน `@tailwindcss/postcss` — ไม่มีไฟล์ `tailwind.config` ตั้งค่าใน `app/globals.css`

### ธีมสีต่อบริษัท — `lib/brand.ts`

โค้ดชุดเดียว deploy หลายชุด (คนละบริษัท คนละ `.env.local`) เปลี่ยนสีแบรนด์ด้วย `BRAND_COLOR_PRIMARY=rrggbb` ตัวเดียว **ไม่ต้อง build ใหม่**

**กับดัก:** ในไฟล์ env ห้ามเขียน `=#rrggbb` โดยไม่ครอบเครื่องหมายคำพูด — dotenv (ที่ Next ใช้) และ `process.loadEnvFile` ตีความ `#` ขึ้นต้นค่าเป็นคอมเมนต์ ได้ค่าว่างเงียบ ๆ แล้วเว็บขึ้นสีเริ่มต้น `getBrand()` ตรวจ `.env.local` ตรง ๆ แล้ว throw ตั้งแต่ boot ถ้าเจอรูปแบบนี้ รูปแบบที่ถูกคือไม่มี `#` (หรือครอบ `"#rrggbb"`)

- Tailwind v4 compile `bg-brand-500` เป็น `var(--color-brand-500)` (ไม่ฝัง hex) ค่าเริ่มต้นอยู่ใน `@theme` ของ `app/globals.css`
  `app/layout.tsx` ตั้งตัวแปรชุดเดียวกันทับบน `<html style>` ซึ่งชนะ `:root` เสมอ — ไม่ตั้ง env = ไม่ตั้งทับ = palette เดิมเป๊ะ
- `buildBrandPalette()` ไล่ 10 เฉดใน OKLCH จากบันไดความสว่างที่ calibrate จาก palette เริ่มต้น (ใส่ `#3985c4` ได้ของเดิมคืน)
  เฉด 600 ขึ้นไปสว่างไม่เกิน L 0.512 จึงรับประกันตัวหนังสือขาวผ่าน 4.5:1 ทุกโทน — สีที่ตั้งมาอ่อน/เข้มเกินจะถูกเลื่อนความสว่าง (`adjusted`) พร้อม warn ตอน boot
- root layout ตั้ง `dynamic = 'force-dynamic'` **โดยเจตนา** — ถ้าปล่อย prerender ค่าจากเครื่องที่ build จะฝังลง HTML แล้วทุกชุดได้สีเดียวกัน อย่าถอดออก
- **ห้าม** ใช้ `NEXT_PUBLIC_*` กับค่าแบรนด์ (ฝังตอน build) และ **ห้าม** ใช้ `sky-*`/`blue-*` ของ Tailwind ตรง ๆ — ใช้ `brand-*` สำหรับสีแบรนด์, `navy-*` สำหรับสีกลาง, `emerald/amber/rose` สำหรับสถานะเท่านั้น
- class ที่มี opacity (เช่น `bg-brand-500/20`) มี hex fallback ฝังไว้สำหรับเบราว์เซอร์ที่ไม่รู้จัก `color-mix()` (ก่อนปี 2023) — จุดพวกนั้นบนเบราว์เซอร์เก่าจะยังเป็นสีเริ่มต้น ยอมรับได้
- Excel export (`sn/export`) อ่าน `getBrand().shades[600]` เป็นสีหัวตาราง เพราะ ExcelJS ต้องการ ARGB จริง
- unit test: `tests/unit/brand.test.mjs`

### Rate limit

`lib/rate-limit.ts` เป็น fixed window เก็บใน memory — **ปิดอัตโนมัติตอน development** เปิดตอน production บังคับได้ด้วย `RATE_LIMIT_ENABLED=true/false`
โควตาปัจจุบัน: ลงทะเบียน 10/นาที, แจ้งปัญหา 5/นาที, login 10/5 นาที
ถ้า deploy หลาย instance ต้องย้ายไป Redis ก่อน

### ความปลอดภัยที่ทำไว้แล้ว (อย่าถอดออกตอน refactor)

Zod validate ทั้ง client และ server · prepared statement ทุก query · bcrypt + ข้อความ error เดียวกันทั้งกรณี user ผิดและรหัสผิด (พร้อม compare กับ hash หลอกเมื่อไม่พบ user เพื่อกัน timing attack) · audit log · mask เบอร์โทรหน้า public

สิ่งที่ **ยังไม่มี** (README เก่าอาจทำให้เข้าใจผิด):
- **ไม่มีการตรวจ `role`** ที่ route ไหนเลย — `staff` ทำได้ทุกอย่างเท่า `admin`
- **`/api/files/*` ไม่มี auth** — กันแค่ path traversal ใครรู้ path ก็เปิดไฟล์แนบได้
- **export ไม่มี escape กัน formula injection** — ย้ายจาก CSV มาเป็น `.xlsx` (ExcelJS) แล้ว ค่าถูกเขียนเป็น string cell จึงไม่กลายเป็นสูตร แต่ถ้าจะเพิ่ม CSV export กลับมาต้อง escape เอง

## เอกสารอื่นในรีโป

- `README.md` — ตาราง URL/API ครบทุกเส้นทาง + เหตุผลเชิงออกแบบ อ่านก่อนถ้าต้องหา endpoint
- `DEPLOYMENT-PLAN.md` / `DEPLOYMENT-SURVEY.md` — แผนขึ้น production บน Windows Server + Apache reverse proxy (ทั้งคู่อยู่ใน `.gitignore` จึงมีเฉพาะเครื่องนี้)
