# ระบบลงทะเบียนรับประกันสินค้า (Warranty Registration System)

Next.js 16 (App Router) + MariaDB — ครอบคลุมทั้งฝั่งลูกค้าและฝั่งแอดมิน

## เริ่มใช้งาน

ต้องเปิด **MariaDB ใน XAMPP** ไว้ก่อน จากนั้น:

```bash
npm install
npm run db:init    # สร้าง database + ตาราง + แอดมินคนแรก (ผลิตภัณฑ์ตัวอย่างเฉพาะเมื่อ SEED_PRODUCTS=true)
npm run dev        # http://localhost:3000
```

บัญชีแอดมินเริ่มต้น: **admin / admin1234** — ตั้งค่าได้ใน `.env.local` ก่อนรัน `db:init`

### เปลี่ยนรหัสผ่านแอดมิน

```bash
npm run admin:password -- admin รหัสผ่านใหม่
```

> ⚠️ **ห้ามแก้ช่อง `password_hash` ผ่าน phpMyAdmin โดยตรง**
> ช่องนี้เก็บ **bcrypt hash** (60 ตัวอักษร ขึ้นต้นด้วย `$2b$`) ไม่ใช่รหัสผ่านดิบ
> ถ้าใส่รหัสผ่านดิบลงไป เช่น `1234` จะ login ไม่ได้ทันที เพราะ `bcrypt.compare()` เทียบไม่ตรง
> ให้ใช้คำสั่งด้านบนแทน แล้วระบบจะ hash ให้เอง

## หน้าจอในระบบ

**ฝั่งลูกค้า (public)**

| หน้า | URL | หน้าที่ |
|------|-----|---------|
| หน้าแรก | `/` | ทางเข้าแต่ละฟีเจอร์ |
| ลงทะเบียนรับประกัน | `/register` | กรอกเบอร์ + เลือกผลิตภัณฑ์ + SN — ระยะประกันจะเริ่มนับเมื่อแอดมินกด "เริ่มประกัน" ให้ |
| แจ้งปัญหา | `/report` | อ้างอิง SN + แนบรูป/วิดีโอ |
| เช็คสถานะ | `/status` | ค้นด้วย SN + เบอร์โทร |

**ฝั่งแอดมิน (ต้อง login)**

| หน้า | URL | หน้าที่ |
|------|-----|---------|
| เข้าสู่ระบบ | `/admin/login` | |
| ภาพรวม | `/admin/dashboard` | สรุปจำนวน SN / ประกัน / เคส |
| ผลิตภัณฑ์ | `/admin/products` | เพิ่ม/แก้ไขผลิตภัณฑ์ ตั้งรหัสและระยะประกัน เปิด-ปิดใช้งาน |
| Serial Number | `/admin/serial-numbers` | Generate แบบ batch, ค้นหา, **เริ่มระยะเวลาประกันทีละหลายรายการ**, Export CSV |
| การลงทะเบียน | `/admin/registrations` | ตารางลงทะเบียน + filter/search |
| เคสแจ้งปัญหา | `/admin/issues` | ดูรูป/วิดีโอที่แนบ + อัปเดตสถานะและหมายเหตุ |

## API

**Public**

| Method | Endpoint |
|--------|----------|
| `GET` | `/api/products` |
| `POST` | `/api/register` |
| `GET` | `/api/warranty/check?sn=` |
| `POST` | `/api/issues` (multipart/form-data) |
| `GET` | `/api/issues/status?sn=&phone=` |
| `GET` | `/api/files/*` (ไฟล์แนบ) |

**Admin** (ต้องมี session cookie)

| Method | Endpoint |
|--------|----------|
| `POST` | `/api/admin/login` · `/api/admin/logout` |
| `GET` `POST` | `/api/admin/products` |
| `PATCH` | `/api/admin/products/:id` |
| `POST` | `/api/admin/sn/generate` |
| `GET` | `/api/admin/sn?search=&status=&product_id=&page=` |
| `GET` | `/api/admin/sn/export?batch_id=&status=&product_id=` |
| `GET` | `/api/admin/registrations?search=&warranty_status=&page=` (รับ `warranty_status=not_started` ด้วย) |
| `POST` | `/api/admin/registrations/start-warranty` — `{ registration_ids: number[], start_date?: 'YYYY-MM-DD' }` (ไม่ระบุ `start_date` = เริ่มวันนี้) |
| `GET` | `/api/admin/issues?search=&status=&page=` |
| `PATCH` | `/api/admin/issues/:id` |
| `GET` | `/api/admin/stats` |

## โครงสร้าง

```
app/
├── (customer)/          # หน้าลูกค้า + layout ของฝั่ง public
├── admin/
│   ├── login/
│   └── (dashboard)/     # หน้าที่ต้อง login — แยก route group เพื่อให้ login ไม่ติด layout นี้
└── api/                 # Route Handlers
lib/
├── db.ts                # MariaDB pool (mysql2) + helper query/execute/withTransaction
├── session-token.ts     # sign/verify JWT — แยกไว้ให้ proxy.ts ใช้ได้
├── auth.ts              # cookie helper + requireAdmin() สำหรับ route handler
├── sn-generator.ts      # สร้าง SN แบบ batch (INSERT IGNORE + retry กันชน UNIQUE)
├── validations.ts       # Zod schemas + ข้อจำกัดไฟล์อัปโหลด
├── uploads.ts           # บันทึกไฟล์ + กัน path traversal
├── warranty.ts          # คำนวณวันประกัน, mask เบอร์โทร (PDPA)
├── rate-limit.ts        # rate limit endpoint public
└── use-api-list.ts      # hook ดึงข้อมูลตารางฝั่ง client
proxy.ts                 # ป้องกัน /admin/* และ /api/admin/*
db/schema.sql            # schema ทั้งหมด
scripts/init-db.mjs      # สร้าง DB + migration (+ ผลิตภัณฑ์ตัวอย่างเมื่อ SEED_PRODUCTS=true)
uploads/                 # ไฟล์แนบ (ไม่ commit)
```

## รายละเอียดที่ควรรู้

**รูปแบบ SN** — `WR-{PRODUCT_CODE}-{YYMM}-{RANDOM6}` เช่น `WR-TV43-2607-A3F9K2`
ชุดอักขระตัด `O` `0` `I` `1` ออกเพื่อไม่ให้อ่านสับสน และมี UNIQUE index กันซ้ำในระดับ DB

**ระยะประกัน** เก็บแยก 3 หน่วยที่ `products.warranty_years` / `warranty_months` / `warranty_days`
แอดมินกรอกหน่วยไหนก็ได้ ระบบรวมเป็นระยะเวลาเดียว แล้วแสดงผลแบบทดเดือนขึ้นปีให้อัตโนมัติ
(กรอก 18 เดือน → แสดง "1 ปี 6 เดือน")

**ระยะเวลาประกันเริ่มนับเมื่อแอดมินกด "เริ่มประกัน" เท่านั้น — ไม่ใช่ตอนลูกค้าลงทะเบียน**
ตอนลูกค้าลงทะเบียน (`POST /api/register`) ระบบบันทึกแค่ข้อมูลลูกค้า/SN แล้วปล่อย `warranty_start`/`warranty_end`
เป็น `NULL` ไว้ก่อน (สถานะ `not_started`) แอดมินต้องเข้าไปที่ `/admin/serial-numbers` เลือกแถวที่ต้องการ
(เลือกได้ทีละหลายรายการ) แล้วกด "เริ่มประกัน" — เลือกได้ว่าจะเริ่ม **วันนี้** หรือ **ระบุวันที่เอง** (เช่น
ย้อนหลังตามวันที่ในใบเสร็จ) ระบบจะคำนวณ `warranty_end` ให้จากวันที่เลือก + ระยะประกันของสินค้านั้น

ทำไมถึงออกแบบแบบนี้ — ถ้าคำนวณวันหมดประกันจากวันลงทะเบียนทันที ลูกค้าที่ลงทะเบียนช้าจะได้ประกันเริ่มช้าตามไปด้วย
โดยไม่มีเพดานอ้างอิงกับวันที่ผลิต/ขายจริงเลย การให้แอดมินเป็นคนกดเริ่ม (พร้อมเลือกวันที่ย้อนหลังได้)
ทำให้ผูกวันเริ่มประกันกับหลักฐานจริง (ใบเสร็จ/วันที่ตรวจสอบ) แทนวันที่ลูกค้ากดปุ่มบนเว็บ

**ก่อนเริ่มประกัน ลูกค้าแจ้งปัญหาไม่ได้** — `POST /api/issues` จะตอบ 409 ถ้า `warranty_end` ยังเป็น `NULL`
(ข้อความ "ยังไม่เริ่มระยะเวลาประกัน กรุณาติดต่อเจ้าหน้าที่") ต้องรอแอดมินกดเริ่มก่อนเท่านั้น

**การบวกวันหมดประกัน** = วันที่เริ่ม + ปี + เดือน + วัน (บวกปี/เดือนก่อน แล้วค่อยบวกวัน)
การบวกเดือนไม่ทำให้วันล้นเดือน — 31 ม.ค. + 1 เดือน = 28 ก.พ. (29 ก.พ. ในปีอธิกสุรทิน)

**ไฟล์แนบ** เก็บที่ `uploads/` (นอก `public/`) แล้วเสิร์ฟผ่าน `/api/files/*`
เพราะไฟล์ที่อัปโหลดหลัง build จะไม่ถูกเสิร์ฟถ้าวางใน `public/` และการผ่าน route handler
ทำให้เพิ่มการตรวจสิทธิ์ได้ภายหลัง ใน DB เก็บแค่ path

**ข้อจำกัดไฟล์** — รูป jpg/png ≤ 5MB สูงสุด 5 รูป, วิดีโอ mp4 ≤ 50MB 1 คลิป
ชื่อไฟล์ถูกตั้งใหม่เป็น UUID เสมอ (ไม่ใช้ชื่อจากผู้ใช้)

**ความปลอดภัยที่ทำไว้แล้ว**
- Validate ทุก input ด้วย Zod ทั้ง client และ server
- Prepared statements ทุก query (LIMIT/OFFSET ถูก clamp เป็น integer ก่อนต่อ string)
- bcrypt hash รหัสผ่าน + ข้อความ error เดียวกันทั้งกรณี user ผิดและรหัสผิด
- `proxy.ts` ป้องกันทั้ง `/admin/*` และ `/api/admin/*`
- Rate limit endpoint public (ลงทะเบียน 10/นาที, แจ้งปัญหา 5/นาที, login 10/5นาที)
- ปิดบังเบอร์โทรในหน้า public ตาม PDPA (`08x-xxx-5678`)
- Escape ค่าใน CSV export กัน formula injection
- Audit log การ generate SN และการอัปเดตเคส (ตาราง `audit_logs`)

**Rate limit เก็บใน memory** — ถ้า deploy หลาย instance ต้องย้ายไป Redis

## ล้างข้อมูลทดสอบ

```sql
-- เก็บ products และ admins ไว้
DELETE FROM issue_attachments;
DELETE FROM issue_reports;
DELETE FROM registrations;
DELETE FROM serial_numbers;
DELETE FROM audit_logs;
```
แล้วลบไฟล์ในโฟลเดอร์ `uploads/`

## คำสั่ง

```bash
npm run dev       # dev server
npm run build     # production build
npm start         # รัน production build
npm run db:init   # สร้าง/อัปเดต schema + แอดมินคนแรก (ผลิตภัณฑ์ตัวอย่างเมื่อ SEED_PRODUCTS=true) (รันซ้ำได้ ไม่ลบข้อมูลเดิม)
npm run admin:password -- <username> <password>   # ตั้งรหัสผ่านแอดมิน
npx eslint .      # lint
npx tsc --noEmit  # typecheck
```
