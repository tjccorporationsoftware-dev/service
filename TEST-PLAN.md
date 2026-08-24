# TEST-PLAN.md

แผนทดสอบระบบลงทะเบียนรับประกันสินค้า — ให้รีวิวก่อน ยังไม่มีโค้ดเทสต์และยังไม่ได้รันอะไร

---

## 0. ตอบคำถามก่อนเริ่ม

### .env.local ชี้ไป DB ตัวไหน

อ่านจาก `.env.local` ตอนนี้:

| ตัวแปร | ค่า |
| --- | --- |
| `DB_HOST` | `127.0.0.1` |
| `DB_PORT` | `3306` |
| `DB_USER` | `root` |
| `DB_PASSWORD` | *(ว่าง)* |
| `DB_NAME` | **`warranty_db`** |
| `RATE_LIMIT_ENABLED` | **`false`** |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` | `admin` / `admin1234` |

**`warranty_db` บน MariaDB ของ XAMPP เครื่องนี้ คือฐานข้อมูลตัวเดียวกับที่ `npm run dev` ใช้อยู่ — ไม่มี DB แยกสำหรับเทสต์**
ถ้ายิงเทสต์ตามแผนนี้โดยไม่เปลี่ยนอะไร ข้อมูลทดสอบจะไปปนกับข้อมูลจริงทั้งหมด

**`RATE_LIMIT_ENABLED=false` แปลว่าหัวข้อทดสอบ rate limit (§2.6) จะไม่ทำงานเลย** — ต้องตั้งเป็น `true` ชั่วคราวก่อนถึงจะทดสอบได้

### ถ้าจะรันเทสต์แบบไม่ทำข้อมูลจริงเสีย ต้องทำอะไรบ้าง

**1) แยกฐานข้อมูล — ทำก่อนอย่างอื่น**

สร้างไฟล์ `.env.test` (คัดลอกจาก `.env.local` แล้วแก้ `DB_NAME`):

```
DB_NAME=warranty_test
RATE_LIMIT_ENABLED=true
```

แล้ว init ฐานข้อมูลเทสต์:

```bash
node --env-file=.env.test scripts/init-db.mjs
```

(`npm run db:init` ใช้ `.env.local` ตายตัวใน `package.json` — ต้องเรียก `node --env-file=` เองแบบข้างบน)

**2) ให้ dev server ใช้ DB เทสต์**

`@next/env` จะ**ไม่ทับ**ตัวแปรที่มีอยู่ใน `process.env` แล้ว ดังนั้นตั้งค่าใน shell ก่อนสั่ง dev ได้:

```powershell
$env:DB_NAME='warranty_test'; $env:RATE_LIMIT_ENABLED='true'; npm run dev
```

> **ยืนยันแล้วว่าใช้ได้จริง** (18 ส.ค. 2569) — ตั้ง `DB_NAME=warranty_test` ใน shell แล้วรัน dev server ยิง `GET /api/products` ได้ผลิตภัณฑ์ชุด seed 6 รายการของ DB เทสต์
>
> **วิธีตรวจที่เชื่อถือได้ ต้องหาแถวที่มีเฉพาะใน DB ตัวใดตัวหนึ่ง** — การนับจำนวนอย่างเดียวไม่พอ เพราะ `warranty_db` ก็มีผลิตภัณฑ์ seed 6 ตัวเดียวกันครบ
> ตอนตรวจใช้ผลิตภัณฑ์ `id=18` "เครื่องวัดออกซเจน" ที่มีเฉพาะใน `warranty_db` และเปิดใช้งานอยู่ — ถ้ามันไม่โผล่ใน API แปลว่าไม่ได้อ่าน DB จริง
> ถ้าวันไหนวิธีนี้ไม่ได้ผล ให้ใช้วิธีตรงไปตรงมาแทน: สำรอง `.env.local` แล้วสลับไฟล์ระหว่างรันเทสต์

**3) สิ่งที่ rollback ไม่ได้ ต้องรู้ก่อน**

| เรื่อง | ผลกระทบ |
| --- | --- |
| `sn_schemes.next_sequence` | ทุกครั้งที่ generate SN ตัวเลขเดินหน้าถาวร ไม่ย้อนกลับแม้ลบ SN ทิ้ง — **ห้าม generate บน DB จริงเพื่อทดสอบ** ไม่งั้นเลขลำดับการผลิตจริงจะกระโดด |
| ไฟล์ใน `uploads/` | `POST /api/issues` เขียนไฟล์จริงลงดิสก์ transaction ไม่ครอบ ต้องลบเองหลังเทสต์ |
| `audit_logs` | โตขึ้นทุกครั้งที่ยิง generate / start-warranty / อัปเดตเคส |
| bcrypt hash ของ admin | ถ้าเทสต์เปลี่ยนรหัสผ่าน ต้อง `npm run admin:password` ตั้งคืน |
| rate-limit bucket | เก็บใน memory บน `globalThis` — restart dev server = ล้างตัวนับ ใช้เป็นวิธี reset ระหว่างเทสต์ได้ |

**4) SQL ล้างข้อมูลระหว่างรอบเทสต์** (ตาม `README.md` — เก็บ `products`/`admins` ไว้)

```sql
DELETE FROM issue_attachments;
DELETE FROM issue_reports;
DELETE FROM registrations;
DELETE FROM serial_numbers;
DELETE FROM audit_logs;
-- ถ้าอยากให้ SN เริ่มนับใหม่ด้วย
UPDATE sn_schemes SET next_sequence = 1;
```
แล้วลบไฟล์ในโฟลเดอร์ `uploads/`

**5) ข้อควรระวังตอนรัน**

- ยิงเทสต์ login ถี่ ๆ ตอนเปิด rate limit จะโดน 429 (10 ครั้ง/5 นาที) ทำให้เทสต์ตัวถัดไปพังตาม — จัดกลุ่มเทสต์ rate limit ไว้ **ท้ายสุด** หรือ restart dev server คั่น
- อย่ารันเทสต์พร้อมกับที่มีคนใช้งานหน้าเว็บจริงอยู่ (pool 10 connection)

---

## 1. ขอบเขตและข้อสังเกตจากการอ่านโค้ด

**จำนวนเส้นทางจริง: ไฟล์ `route.ts` 21 ไฟล์ แต่มี HTTP method รวม 24 ตัว** (บาง route export หลาย method) แผนนี้ไล่ครบทั้ง 24

สามเรื่องที่เจอตอนวางแผนและกระทบวิธีทดสอบ — รายละเอียดอยู่ใน §7:

1. **ไม่มีการตรวจ `role` ที่ไหนเลยในระบบ** — `staff` เข้าถึง API แอดมินได้ทุกตัวเท่ากับ `admin`
2. **`/api/files/*` ไม่มี auth** — ใครก็เปิดไฟล์แนบของลูกค้าได้ถ้ารู้ path
3. **export ไม่มีการ escape กัน formula injection** — โค้ดเปลี่ยนจาก CSV มาเป็น `.xlsx` (ExcelJS) แล้ว (`CLAUDE.md` ที่ผมเขียนไว้รอบก่อนตรงจุดนี้ผิด เดี๋ยวแก้ให้)

---

## 2. API ทั้ง 24 method

### 2.0 เคสพังมาตรฐาน — ยิงกับ **ทุก** endpoint ใต้ `/api/admin/*` (ยกเว้น login/logout)

ไม่ต้องเขียนซ้ำในตารางแต่ละแถว ให้ถือว่าทุกแถวต้องผ่านชุดนี้:

| # | เคส | คาดหวัง |
| --- | --- | --- |
| A1 | ไม่ส่ง cookie เลย | `401` + `{ error: 'กรุณาเข้าสู่ระบบ' }` (ตอบจาก `proxy.ts`) |
| A2 | cookie `warranty_session` เป็นสตริงมั่ว | `401` เหมือน A1 |
| A3 | JWT เซ็นด้วย secret อื่น | `401` เหมือน A1 |
| A4 | JWT หมดอายุ (`exp` ย้อนหลัง) | `401` เหมือน A1 |
| A5 | body ไม่ใช่ JSON (เฉพาะ POST/PATCH) | `400` + `{ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }` |
| A6 | body ผิด schema | `400` + ข้อความไทยจาก `firstIssueMessage()` = ข้อความของ issue **ตัวแรก** เท่านั้น |
| A7 | body ถูกต้อง + cookie ใช้ได้ | ตาม 2xx ในตาราง |

> **ข้อจำกัดของ A1–A4:** ทั้งหมดถูก `proxy.ts` ดักก่อนถึง handler ดังนั้นเทสต์ผ่าน HTTP จะพิสูจน์ได้แค่ชั้น proxy
> `requireAdmin()` ใน handler เป็น defense in depth ชั้นที่สอง — ทดสอบแยกได้ทางเดียวคือ **เรียกฟังก์ชัน handler ตรง ๆ** (import route module แล้วเรียก `POST(request)`) โดยไม่ผ่าน proxy
> แนะนำทำเฉพาะ 2–3 route ตัวแทน ไม่ต้องครบทุกตัว

### 2.1 Public — ไม่ต้อง login

| Method + Path | Query / Body | สำเร็จ | เคสพัง |
| --- | --- | --- | --- |
| `GET /api/products` | — | `200` รายการผลิตภัณฑ์ที่ `is_active = 1` | ไม่มีเคส input ให้พัง |
| `GET /api/warranty/check` | `?sn=B012608000001` | `200` — ถ้ายังไม่มี registration ได้ `registered: false`; ถ้ามีแล้วได้ `registered`, `claimed`, สถานะประกัน | ไม่ส่ง `sn` / `sn` สั้นกว่า 5 ตัว → `400 'กรุณากรอก Serial Number'` · SN ไม่มีในระบบ → `404` · SN ที่ `product_id = NULL` → `409 'ยังไม่พร้อมใช้งาน'` |
| `GET /api/issues/status` | `?sn=...&phone=0812345678` | `200` รายการเคสของ SN นั้น | ขาด `sn` หรือ `phone` → `400` · `phone` ไม่ตรง regex `^0\d{9}$` → `400` · ไม่พบคู่ SN+phone → `404` |
| `POST /api/register` | JSON — ดูตัวอย่างด้านล่าง | `201` + `{ registration: {...} }` | ดูตารางย่อย 2.1a |
| `POST /api/issues` | `multipart/form-data`: `sn`, `phone`, `description`, `images[]`, `video` | `201` | ดูตารางย่อย 2.1b |
| `GET /api/files/[...path]` | เช่น `/api/files/2026/08/<uuid>.jpg` | `200` + `Content-Type` ตามนามสกุล, `X-Content-Type-Options: nosniff` | path traversal `../../.env.local` → `403 Forbidden` · นามสกุลนอก jpg/png/mp4 → `404` · ไฟล์ไม่มีจริง → `404` |

**body ตัวอย่าง `POST /api/register`**

```json
{
  "customer_name": "ทดสอบ ระบบ",
  "phone": "0812345678",
  "email": "test@example.com",
  "product_id": 1,
  "sn": "B012608000001",
  "customer_reported_warranty_start": "2026-08-01",
  "customer_reported_warranty_end": "2028-08-01",
  "consent": true
}
```

**2.1a — เคสพังของ `POST /api/register`** (ทุกเคสต้องยืนยันว่า DB **ไม่ถูกแก้** ด้วย)

| เคส | คาดหวัง |
| --- | --- |
| `consent: false` หรือไม่ส่ง | `400` — zod `refine` บังคับต้องเป็น `true` |
| `phone: "812345678"` (ไม่ขึ้นต้น 0) | `400` |
| `email` ผิดรูปแบบ | `400` |
| `customer_reported_warranty_start` ไม่ใช่ `YYYY-MM-DD` | `400` |
| SN ไม่มีในระบบ | `404` |
| SN สถานะ `void` | `409 'ถูกยกเลิกแล้ว'` |
| SN ที่ `product_id = NULL` (ยังไม่ผูกผลิตภัณฑ์) | `409 'ยังไม่พร้อมให้ลงทะเบียน'` |
| SN ลงทะเบียนไปแล้วและมี `phone` | `409 'ถูกลงทะเบียนไปแล้ว'` |
| `product_id` ไม่ตรงกับเจ้าของ SN | `409` + ชื่อผลิตภัณฑ์จริงในข้อความ |
| claim ทับที่แอดมินเริ่มประกันไว้ แต่วันที่กรอกไม่ตรง | `409` + `field_errors: { warranty_start, warranty_end }` และ **registration เดิมต้องไม่ถูกแก้เลย** |
| ยิงพร้อมกัน 2 request ด้วย SN เดียวกัน | ต้องสำเร็จตัวเดียว อีกตัวได้ `409` (พิสูจน์ `FOR UPDATE`) |

**2.1b — เคสพังของ `POST /api/issues`**

| เคส | คาดหวัง |
| --- | --- |
| body ไม่ใช่ multipart | `400 'อ่านข้อมูลฟอร์มไม่สำเร็จ'` |
| `description` สั้นกว่า 10 ตัวอักษร | `400` |
| แนบรูปเกิน 5 ไฟล์ | `400` + ข้อความ `UPLOAD_LIMITS.image.label` |
| แนบวิดีโอเกิน 1 คลิป | `400` + ข้อความ `UPLOAD_LIMITS.video.label` |
| ไฟล์ชนิดอื่น (เช่น `.pdf` / `.exe` เปลี่ยนนามสกุล) | `400` จาก `UploadError` |
| ไฟล์รูปใหญ่เกิน 5MB / วิดีโอเกิน 50MB | `400` |
| ไฟล์ขนาด 0 ไบต์ | `400 'ว่างเปล่า'` |
| SN ไม่มีในระบบ | `404` |
| **SN ที่ `warranty_end` ยัง `NULL`** | `409 'ยังไม่เริ่มระยะเวลาประกัน'` ← กติกาแกนของระบบ |
| `phone` ไม่ตรงกับเจ้าของ registration | `403` |
| สำเร็จ | `201` + ไฟล์ถูกเขียนลง `uploads/YYYY/MM/<uuid>.<ext>` และ **ชื่อไฟล์ต้องเป็น UUID ไม่ใช่ชื่อเดิม** |

### 2.2 Auth

| Method + Path | Body | สำเร็จ | เคสพัง |
| --- | --- | --- | --- |
| `POST /api/admin/login` | `{"username":"admin","password":"admin1234"}` | `200` + `{ admin: {...} }` + `Set-Cookie: warranty_session` ที่มี `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=28800` | body ไม่ใช่ JSON → `400` · ขาด field → `400` · **user ไม่มีจริง** → `401` · **รหัสผิด** → `401` |
| `POST /api/admin/logout` | — | `200` + cookie ถูกลบ | เรียกตอนไม่มี session ก็ต้องได้ `200` (ไม่ผ่าน proxy โดยตั้งใจ) |

**เทสต์เฉพาะที่สำคัญของ login:**

- ข้อความ error ของ "ไม่มี user" กับ "รหัสผิด" ต้อง**เหมือนกันเป๊ะ** (`'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'`) — เป็น user enumeration defense ที่ตั้งใจทำ
- **เวลาตอบกลับสองเคสนั้นต้องใกล้เคียงกัน** (โค้ดยิง `bcrypt.compare` กับ hash หลอกเมื่อไม่พบ user เพื่อกัน timing attack) — วัดจริง เช่น ยิงอย่างละ 20 ครั้งแล้วเทียบ median ไม่ควรต่างกันเกิน ~20%
- decode JWT ที่ได้ ต้องมี `id`, `username`, `role`, `displayName` และ `exp` ห่างจาก `iat` = 8 ชั่วโมง

### 2.3 Admin — ผลิตภัณฑ์

| Method + Path | Body / Query | สำเร็จ | เคสพังเฉพาะทาง (นอกเหนือจาก §2.0) |
| --- | --- | --- | --- |
| `GET /api/admin/products` | — | `200` (รวมตัวที่ `is_active = 0` ต่างจาก public) | — |
| `POST /api/admin/products` | ดูด้านล่าง | `201` | `code` ผิด regex `^[A-Z0-9]{2,10}$` → `400` · `code` ซ้ำ → `409` + ชื่อรหัสในข้อความ · `warranty_end_date` ก่อน `warranty_start_date` → `400` |
| `PATCH /api/admin/products/[id]` | เหมือน POST | `200` | `id` ไม่ใช่ตัวเลข → `400` · ไม่พบ → `404` · `code` ชนของตัวอื่น → `409` · มีเคส `409` อีกจุดที่ต้องอ่านโค้ดยืนยันเงื่อนไข (บรรทัด 66) |

```json
{
  "name": "สินค้าทดสอบ",
  "code": "TEST01",
  "brand": "TestBrand",
  "model": "T-100",
  "source_type": "in_house",
  "warranty_years": 1,
  "warranty_months": 6,
  "warranty_days": 0,
  "is_active": true
}
```

เคสที่ต้องเช็คเพิ่ม:
- `code: ""` → ต้องถูกแปลงเป็น **`NULL`** ใน DB ไม่ใช่ `''` (คอลัมน์เป็น UNIQUE — `''` ซ้ำไม่ได้ แต่ `NULL` ซ้ำได้) ยืนยันโดยสร้างผลิตภัณฑ์ไม่มีรหัส **2 ตัว** ต้องผ่านทั้งคู่
- ไม่ส่ง `source_type` → ต้อง default เป็น `in_house`
- กรอก `warranty_start_date` + `warranty_end_date` ครบคู่ → ระบบต้องคำนวณ `warranty_years/months/days` ให้เอง ทับค่าที่กรอกมา

### 2.4 Admin — Serial Number

| Method + Path | Body / Query | สำเร็จ | เคสพังเฉพาะทาง |
| --- | --- | --- | --- |
| `GET /api/admin/sn-setup` | — | `200` รายการ scheme | — |
| `POST /api/admin/sn-setup` | `{"label":"ทดสอบ","prefix":"T","model_code":"99","next_sequence":1}` | `201` | `prefix`/`model_code` มีอักขระนอก `A–Z0–9` หรือยาวเกิน 10 → `400` · `next_sequence` < 1 → `400` · คู่ `(prefix, model_code)` ซ้ำ → `409` |
| `PATCH /api/admin/sn-setup` | เหมือน POST + `id` | `200` | ไม่ส่ง `id` → `400 'ไม่พบรหัสรูปแบบที่จะแก้ไข'` · `id` ไม่มีจริง → `404` · แก้แล้วชนคู่เดิม → `409` |
| `POST /api/admin/sn/generate` | `{"scheme_id":1,"quantity":5,"category":"ทดสอบ"}` | `201` + `batch_id` + `serials[]` | `quantity` = 0 → `400` · `quantity` > 1000 → `400` · `scheme_id` ไม่มีจริง → `404` · **`next_sequence` ชนกับ SN เดิม → `500`** พร้อมข้อความให้ไปแก้เลขลำดับ |
| `POST /api/admin/sn/import` | `{"product_id":1,"sns":["EXT-001","EXT-002"],"category":"นอก"}` | `201` | `sns: []` → `400` · เกิน 1000 → `400` · `product_id` ไม่มีจริง → `404` · SN ซ้ำของเดิม → ต้องยืนยันพฤติกรรม (ข้ามหรือ error) จากโค้ด |
| `POST /api/admin/sn/assign-product` | `{"serial_number_ids":[1,2],"product_id":1}` | `200` | array ว่าง → `400` · เกิน 500 → `400` · `product_id` ไม่มีจริง → `404` |
| `GET /api/admin/sn` | `?search=&status=&product_id=&category=&page=&per_page=` | `200` + `meta` | ดู §6.2 (pagination) |
| `GET /api/admin/sn/export` | `?batch_id=&status=&product_id=&category=` | `200` + ไฟล์ `.xlsx` | ดู §6.3 |

**เทสต์เฉพาะของ generate ที่สำคัญที่สุด:**

- ยิง generate **พร้อมกัน 2 request** ด้วย `scheme_id` เดียวกัน → SN ที่ได้ต้องไม่ซ้ำกันเลย และ `next_sequence` สุดท้าย = ค่าเดิม + จำนวนรวมทั้งสองชุด (พิสูจน์ `FOR UPDATE` ใน `generateSerialBatch`)
- รูปแบบ SN ต้องตรงสูตร `prefix + model_code + YY + MM + ลำดับ 6 หลัก` — เทียบกับ `buildStructuredSn()` ตรง ๆ
- generate `quantity: 100` ทั้งชุดต้องได้ `YYMM` **ค่าเดียวกันหมด** (โค้ดตรึง `stampedAt` ครั้งเดียวต่อชุด)
- SN ที่เพิ่ง generate ต้องมี `product_id = NULL` และ `status = 'available'`

### 2.5 Admin — ลงทะเบียน / เคส / สถิติ

| Method + Path | Body / Query | สำเร็จ | เคสพังเฉพาะทาง |
| --- | --- | --- | --- |
| `GET /api/admin/registrations` | `?search=&product_id=&warranty_status=&registered_from=&registered_to=&warranty_start_from=&warranty_start_to=&page=` | `200` + `meta` | `warranty_status=not_started` ต้องคืนเฉพาะแถว `warranty_start IS NULL` · ค่าที่ไม่รู้จักต้องถูกละเว้น ไม่ใช่ 500 |
| `POST /api/admin/registrations/start-warranty` | `{"serial_number_ids":[1,2],"start_date":"2026-08-01"}` | `200` + `{ started, skipped, start_date }` | array ว่าง → `400` · เกิน 500 → `400` · `start_date` ผิดรูปแบบ → `400` · วันที่ไม่มีจริง เช่น `2026-02-30` → `400 'วันที่ไม่ถูกต้อง'` |
| `GET /api/admin/issues` | `?search=&status=&page=` | `200` + `meta` + ไฟล์แนบ | — |
| `PATCH /api/admin/issues/[id]` | `{"status":"resolved","admin_note":"ซ่อมแล้ว"}` | `200` | `id` ไม่ใช่ตัวเลข → `400` · `status` นอก enum → `400` · `admin_note` เกิน 5000 → `400` · ไม่พบเคส → `404` |
| `GET /api/admin/stats` | — | `200` ตัวเลขสรุป | — |

**เทสต์เฉพาะของ start-warranty:**

| เคส | คาดหวัง |
| --- | --- |
| SN ที่มี registration รออยู่ | อัปเดต `warranty_start/end` ของแถวเดิม |
| SN ที่ยังไม่มีใครลงทะเบียน | สร้าง registration ใหม่ที่ `phone/customer_name/email = NULL` + `serial_numbers.status = 'registered'` |
| **กดซ้ำรอบสองบน SN เดิม** | นับเป็น `skipped` — `warranty_start` เดิม**ต้องไม่ถูกทับ** |
| SN สถานะ `void` | `skipped` |
| SN ที่ `product_id = NULL` | ไม่อยู่ในผลลัพธ์ (query ใช้ `JOIN products` ไม่ใช่ LEFT JOIN) → นับเป็น `skipped` |
| ส่ง 3 id โดย 1 ตัวใช้ได้ | `{ started: 1, skipped: 2 }` |
| ไม่ส่ง `start_date` | ต้องได้วันนี้ตามเวลาไทย — ดู §6.1 |
| หลังสำเร็จ | มีแถวใน `audit_logs` action `registration.start_warranty` |

### 2.6 Rate limit — ต้องตั้ง `RATE_LIMIT_ENABLED=true` ก่อน

โควตาที่อ่านได้จากโค้ดจริง:

| Endpoint | scope | โควตา | วิธีทดสอบ |
| --- | --- | --- | --- |
| `POST /api/register` | `register` | 10 / 60 วินาที | ยิง 11 ครั้ง → ครั้งที่ 11 ได้ `429` + `'มีการเรียกใช้งานถี่เกินไป...'` |
| `POST /api/issues` | `issues` | 5 / 60 วินาที | ยิง 6 ครั้ง → ครั้งที่ 6 ได้ `429` |
| `GET /api/issues/status` | `issue-status` | 30 / 60 วินาที | ยิง 31 ครั้ง |
| `GET /api/warranty/check` | `warranty-check` | 30 / 60 วินาที | ยิง 31 ครั้ง |
| `POST /api/admin/login` | `admin-login` | 10 / 5 นาที | ยิง 11 ครั้ง |

เคสเพิ่ม:
- ตั้ง `RATE_LIMIT_ENABLED=false` แล้วยิงเกินโควตา → ต้อง**ไม่** 429 เลย
- ส่ง header `X-Forwarded-For` คนละค่า → ต้องนับแยก bucket (โค้ดใช้ค่าแรกก่อนคอมมา)
- ครบ window แล้วยิงใหม่ → ต้องผ่าน (fixed window รีเซ็ต)
- **ช่องโหว่ที่ควรบันทึกไว้:** `clientIp()` เชื่อ `X-Forwarded-For` จาก client ตรง ๆ — ตอนยังไม่มี reverse proxy ที่เขียน header นี้ทับ ผู้ใช้ปลอมค่าเพื่อข้าม rate limit ได้ ให้บันทึกเป็น finding ไม่ใช่เทสต์ที่ต้อง "ผ่าน"

---

## 3. หน้า admin — ต้อง login ไหม / ไม่มี session แล้วไปไหน

`proxy.ts` จับ matcher `/admin/:path*` ทุกหน้า พฤติกรรมเมื่อไม่มี session ที่ใช้ได้:
**redirect `307` ไป `/admin/login?next=<pathname เดิม>`**

| หน้า | ต้อง login | ไม่มี session → |
| --- | --- | --- |
| `/admin/login` | **ไม่ต้อง** (yกเว้นใน proxy) | แสดงหน้า login ตามปกติ `200` |
| `/admin` | ต้อง | `/admin/login?next=/admin` — ถ้ามี session จะ `redirect()` ต่อไป `/admin/dashboard` |
| `/admin/dashboard` | ต้อง | `/admin/login?next=/admin/dashboard` |
| `/admin/products` | ต้อง | `/admin/login?next=/admin/products` |
| `/admin/serial-numbers` | ต้อง | `/admin/login?next=/admin/serial-numbers` |
| `/admin/sn-setup` | ต้อง | `/admin/login?next=/admin/sn-setup` |
| `/admin/registrations` | ต้อง | `/admin/login?next=/admin/registrations` |
| `/admin/issues` | ต้อง | `/admin/login?next=/admin/issues` |
| `/admin/qrcode` | ต้อง | `/admin/login?next=/admin/qrcode` |

เคสเพิ่ม:
- login สำเร็จจากหน้าที่มี `?next=/admin/issues` → ต้องเด้งกลับไป `/admin/issues` ไม่ใช่ dashboard เสมอ
- **`?next=https://evil.example.com`** → ต้องไม่ redirect ออกนอกโดเมน (open redirect) — ต้องอ่านโค้ดหน้า login ยืนยันว่ากรองหรือยัง ถ้ายังให้บันทึกเป็น finding
- หน้าลูกค้า `/`, `/register`, `/report`, `/status` → เข้าได้โดยไม่ต้อง login ทุกหน้า (ยืนยันว่า proxy ไม่ได้จับเกิน)

---

## 4. `proxy.ts`

| # | เคส | คาดหวัง |
| --- | --- | --- |
| P1 | ไม่มี cookie → `/admin/dashboard` | `307` → `/admin/login?next=/admin/dashboard` |
| P2 | ไม่มี cookie → `/api/admin/stats` | `401` JSON ไม่ใช่ redirect |
| P3 | cookie เป็นสตริงมั่ว | เหมือน P1/P2 ตาม path |
| P4 | JWT เซ็นด้วย secret อื่น | เหมือน P1/P2 (`jwtVerify` throw → `verifySession` คืน `null`) |
| P5 | JWT หมดอายุ (สร้าง `exp` ย้อนหลัง) | เหมือน P1/P2 |
| P6 | JWT alg `none` / เปลี่ยน header เป็น `{"alg":"none"}` | ต้องถูกปฏิเสธ — `jose` บังคับ alg แต่ต้องยืนยันด้วยเทสต์จริง |
| P7 | JWT ถูกต้องแต่แก้ payload 1 ตัวอักษร (ไม่เซ็นใหม่) | ปฏิเสธ |
| P8 | JWT ถูกต้อง | ผ่านไปยัง handler |
| P9 | `/admin/login`, `/api/admin/login`, `/api/admin/logout` **ตอนไม่มี cookie** | ผ่านทั้งหมด ไม่ redirect |
| P10 | path นอก matcher เช่น `/register`, `/api/products` | ไม่ถูกแตะเลย |
| P11 | ตั้ง `JWT_SECRET` ใหม่แล้ว restart | cookie เดิมทั้งหมดต้องใช้ไม่ได้ (= วิธี revoke session ทั้งระบบ) |

### เรื่อง role — ต้องอ่านตรงนี้ก่อนเขียนเทสต์

**ระบบนี้ไม่มีการตรวจ role ที่ไหนเลย** ผมไล่หาแล้ว `role` ปรากฏแค่ 3 จุด: type ใน `lib/session-token.ts`, การอ่านมาแสดงชื่อใน `app/admin/(dashboard)/layout.tsx` และตอน sign ใน login
`proxy.ts` เช็คแค่ว่า **verify JWT ผ่านหรือไม่** ไม่ได้ดู `role` และไม่มี route ไหนเช็ค `auth.session.role` เลย

ดังนั้นเทสต์ "role ไม่ถึง" เขียนเป็น **เทสต์บันทึกพฤติกรรมปัจจุบัน** ได้ แต่ต้องรู้ว่ามันคือช่องโหว่ ไม่ใช่ฟีเจอร์:

| # | เคส | ผลตอนนี้ | ควรเป็น |
| --- | --- | --- | --- |
| R1 | สร้าง admin ที่ `role = 'staff'` แล้ว login | ได้ JWT ที่มี `role: 'staff'` | เหมือนเดิม |
| R2 | ใช้ token `staff` ยิง `POST /api/admin/sn/generate` | **`201` สำเร็จ** | ควร `403` ถ้าธุรกิจต้องการจำกัด |
| R3 | ใช้ token `staff` ยิง `PATCH /api/admin/products/[id]` | **`200` สำเร็จ** | ควร `403` |
| R4 | ปลอม JWT ที่แก้ `role` เป็น `admin` โดยไม่มี secret | `401` (เพราะลายเซ็นพัง) | ถูกต้องแล้ว |

**ต้องตัดสินใจก่อนเขียนเทสต์กลุ่มนี้:** ธุรกิจต้องการให้ `staff` ทำอะไรได้บ้าง ถ้ายังไม่มีคำตอบ ให้เขียนแค่ R1 กับ R4 ไปก่อน แล้วเปิด issue เรื่อง role แยก

---

## 5. Flow ต่อเนื่อง

### 5.1 ทาง A — ลูกค้าลงทะเบียนก่อน

| ขั้น | การกระทำ | ตรวจอะไร |
| --- | --- | --- |
| A0 | `POST /api/admin/sn-setup` สร้าง scheme `T`/`99` | `201`, `next_sequence = 1` |
| A1 | `POST /api/admin/sn/generate` `quantity: 3` | `201`, ได้ `T992608000001–3`, `product_id = NULL`, `status = 'available'`, `next_sequence` เดินเป็น 4 |
| A2 | `GET /api/warranty/check?sn=T992608000001` | `409` — ยังไม่ผูกผลิตภัณฑ์ |
| A3 | `POST /api/register` ด้วย SN นี้ | `409 'ยังไม่พร้อมให้ลงทะเบียน'` |
| A4 | `POST /api/admin/products` สร้างผลิตภัณฑ์ประกัน 1 ปี 6 เดือน | `201`, จำ `product_id` |
| A5 | `POST /api/admin/sn/assign-product` ผูก SN ทั้ง 3 ตัว | `200` |
| A6 | `GET /api/warranty/check` | `200`, `registered: false`, `warranty_text: '1 ปี 6 เดือน'` |
| A7 | `POST /api/register` ครบทุก field | `201`, `warranty_start/end` = `null` ทั้งคู่ |
| A8 | `GET /api/admin/registrations?warranty_status=not_started` | เจอแถวนี้ |
| A9 | `POST /api/issues` ด้วย SN นี้ | **`409 'ยังไม่เริ่มระยะเวลาประกัน'`** |
| A10 | `POST /api/register` ซ้ำด้วย SN เดิม | `409 'ถูกลงทะเบียนไปแล้ว'` |
| A11 | `POST /api/admin/registrations/start-warranty` `start_date: '2026-08-01'` | `{ started: 1 }`, `warranty_end = '2028-02-01'` (1 ปี 6 เดือน) |
| A12 | `GET /api/warranty/check` | `registered: true`, `claimed: true`, วันครบตาม A11 |
| A13 | `POST /api/issues` แนบรูป 2 ไฟล์ | `201`, ไฟล์อยู่ใน `uploads/`, ชื่อเป็น UUID |
| A14 | `GET /api/issues/status?sn=&phone=` | เห็นเคส สถานะ `pending` |
| A15 | `PATCH /api/admin/issues/[id]` เป็น `resolved` | `200`, มี `audit_logs` |
| A16 | `GET /api/admin/sn/export?batch_id=<จาก A1>` | `200`, `.xlsx` มี 3 แถว, เบอร์ตรงกับที่ลงทะเบียน |
| A17 | `POST /api/admin/registrations/start-warranty` ซ้ำบน SN เดิม | `{ started: 0, skipped: 1 }` และ `warranty_start` ไม่เปลี่ยน |

### 5.2 ทาง B — แอดมินเริ่มประกันก่อน แล้วลูกค้ามา claim

| ขั้น | การกระทำ | ตรวจอะไร |
| --- | --- | --- |
| B1 | generate + assign-product SN ใหม่ (ทำ A1, A5 ซ้ำ) | — |
| B2 | `POST /api/admin/registrations/start-warranty` `start_date: '2026-08-01'` **ทั้งที่ยังไม่มีใครลงทะเบียน** | `{ started: 1 }` |
| B3 | ดู DB | มี registration ใหม่ที่ `phone/customer_name/email = NULL`, `warranty_start = '2026-08-01'`, `serial_numbers.status = 'registered'` |
| B4 | `GET /api/warranty/check` | `registered: true`, **`claimed: false`** |
| B5 | `GET /api/admin/registrations` | เห็นแถวที่ยังไม่มีลูกค้า |
| B6 | `POST /api/register` โดยกรอกวันที่ **ผิด** (เช่น start `2026-07-01`) | `409` + `field_errors: { warranty_start: true, ... }` และ **registration ต้องยังเป็น NULL อยู่เหมือนเดิม** ← เช็คใน DB ห้ามข้าม |
| B7 | `POST /api/register` โดยกรอกวันที่ **ตรง** กับ B2 | `201`, registration เดิมถูกเติม `phone/customer_name/email`, `consent_accepted_at` ไม่เป็น NULL, และ **`warranty_start/end` ไม่ถูกแก้** |
| B8 | `GET /api/warranty/check` | `claimed: true` |
| B9 | `POST /api/issues` | `201` (ผ่านแล้วเพราะมี `warranty_end`) |
| B10 | `GET /api/admin/sn/export` | สถานะแสดงถูกต้องตาม `snDisplayStatus(sn_status, phone)` |

### 5.3 flow ทางที่สาม — สินค้าซื้อมาขายต่อ (`resale`)

| ขั้น | การกระทำ | ตรวจอะไร |
| --- | --- | --- |
| C1 | `POST /api/admin/products` `source_type: 'resale'` | `201` |
| C2 | `POST /api/admin/sn/import` `sns: ["EXT-0001","EXT-0002"]` | `201`, SN ผูก `product_id` ทันที (ไม่ผ่าน scheme) |
| C3 | `POST /api/register` ด้วย `EXT-0001` | `201` — ต้องใช้ flow เดียวกับ SN ที่ generate เอง |
| C4 | import SN ที่ซ้ำกับของเดิม | ยืนยันพฤติกรรมจากโค้ดก่อนตั้ง expected |

---

## 6. เคสที่เตือนไว้ใน CLAUDE.md

### 6.1 Timezone UTC+7

จุดที่พังได้ถ้ามีใครเผลอใช้ `toISOString()` / `getUTC*`:

| # | เคส | วิธีทดสอบ | คาดหวัง |
| --- | --- | --- | --- |
| T1 | `start-warranty` ไม่ส่ง `start_date` ตอนตี 2 ตามเวลาไทย | ตั้งนาฬิกาเครื่อง (หรือ mock) เป็น `2026-08-18 02:00 +07` | `start_date` = `2026-08-18` **ไม่ใช่ `2026-08-17`** |
| T2 | generate SN ตอนตี 2 ของวันที่ 1 ของเดือน | ตั้งเวลาเป็น `2026-09-01 02:00 +07` | `snDateCode()` = `2609` ไม่ใช่ `2608` |
| T3 | `addDuration` ข้ามปี | `2026-08-01` + 1 ปี 6 เดือน | `2028-02-01` |
| T4 | เดือนล้น | `2026-01-31` + 1 เดือน | `2026-02-28` |
| T5 | เดือนล้นปีอธิกสุรทิน | `2028-01-31` + 1 เดือน | `2028-02-29` |
| T6 | ลำดับการบวก (ปี+เดือนก่อน แล้วค่อยวัน) | `2026-01-31` + 1 เดือน 1 วัน | `2026-03-01` (28 ก.พ. + 1 วัน) |
| T7 | `durationBetween` เป็นอินเวอร์ส | `durationBetween('2026-01-01','2026-12-31')` | `11 เดือน 30 วัน` **ไม่ใช่ 1 ปี** |
| T8 | ค่าที่อ่านจาก DB | อ่านคอลัมน์ `DATE` ผ่าน `query()` | ได้ string `'YYYY-MM-DD'` ไม่ใช่ `Date` (จาก `dateStrings: ['DATE']`) |
| T9 | วันหมดประกันในไฟล์ export | เทียบ cell กับค่าใน DB | ต้องตรงวัน ไม่คลาดไป 1 วัน (`parseDateOnly` ใน export route แยกทำเอง) |

> T1/T2 ทดสอบแบบ unit ที่ `lib/warranty.ts` และ `lib/sn-format.ts` ง่ายกว่ามาก — ทั้งสองไฟล์รับ `date` เป็นพารามิเตอร์ได้ ไม่ต้องแตะนาฬิกาเครื่อง
> ส่วนเทสต์ระดับ API (T1) ต้องเลื่อนนาฬิกาเครื่องจริงหรือรันใน container ที่ตั้ง `TZ` — แนะนำทำ unit เป็นหลัก แล้ว API แค่ smoke 1 เคส

### 6.2 `parsePagination` — LIMIT/OFFSET ต่อลง SQL ตรง ๆ

ยิงกับทั้ง 3 endpoint ที่ใช้ (`/api/admin/sn`, `/api/admin/registrations`, `/api/admin/issues`):

| # | `?page=` / `?per_page=` | คาดหวัง |
| --- | --- | --- |
| G1 | `page=1&per_page=20` | ปกติ |
| G2 | `page=0` | clamp เป็น 1 |
| G3 | `page=-5` | clamp เป็น 1 |
| G4 | `page=abc` | fallback 1 |
| G5 | `page=999999999` | clamp เป็น 100000 |
| G6 | `per_page=0` | clamp เป็น 1 |
| G7 | `per_page=9999` | clamp เป็น 200 |
| G8 | `per_page=1.5` | `parseInt` → 1 |
| G9 | **`per_page=20; DROP TABLE serial_numbers--`** | ต้องได้ `200` ปกติ + ตารางยังอยู่ครบ |
| G10 | **`page=1 UNION SELECT * FROM admins`** | ต้องได้ `200` ปกติ ไม่มีข้อมูล admins หลุดออกมา |
| G11 | `per_page=` (ค่าว่าง) | fallback 20 |
| G12 | ไม่ส่งเลย | fallback 20 |

เพิ่ม: ตรวจว่า `meta.total_pages` ไม่เคยเป็น `0` (โค้ดมี `|| 1`) และตอน `total = 0` ต้องได้ `total_pages: 1`

**ยิง SQL injection ที่ `search` ด้วย** (คนละทางกับ pagination — ตัวนี้ใช้ prepared statement):
- `?search=' OR '1'='1` → ต้องคืน 0 แถว ไม่ใช่ทั้งตาราง
- `?search=%` → `%` เป็น wildcard ของ LIKE ต้องยืนยันว่าตั้งใจให้ค้นเจอทุกแถวหรือควร escape

### 6.3 Formula injection ใน export — **ต้องแก้ความเข้าใจก่อน**

`README.md` เขียนว่า "Escape ค่าใน CSV export กัน formula injection" และผมเขียนตามลงไปใน `CLAUDE.md` — **ตอนนี้ไม่ตรงกับโค้ดแล้ว**

โค้ดจริงใน `app/api/admin/sn/export/route.ts`:
- export เป็น **`.xlsx` ผ่าน ExcelJS** ไม่ใช่ CSV แล้ว
- ค่าถูกใส่ผ่าน `sheet.addRow({...})` เป็นสตริงธรรมดา **ไม่มีการ escape `=`/`+`/`-`/`@` ที่ใดเลย**

ผลคือความเสี่ยงลดลงเพราะรูปแบบไฟล์เปลี่ยน (ExcelJS สร้าง cell เป็นสูตรเฉพาะตอนกำหนด `cell.value = { formula: ... }` ซึ่งโค้ดนี้ไม่ทำ) แต่ไม่ใช่เพราะมีการ escape เทสต์จึงต้องเขียนตามความจริง:

| # | เคส | วิธี | คาดหวัง |
| --- | --- | --- | --- |
| F1 | สร้างผลิตภัณฑ์ชื่อ `=1+1` แล้ว export | เปิดไฟล์ด้วย ExcelJS/openpyxl อ่าน cell | cell type = string, ค่า `'=1+1'` ตรงตัว, **ไม่มี `formula` property** |
| F2 | ชื่อ `=HYPERLINK("http://evil.example.com","x")` | เหมือน F1 | เป็น string ไม่ใช่สูตร |
| F3 | หมวดหมู่ `@SUM(1+1)*cmd\|' /c calc'!A0` | เหมือน F1 | เป็น string |
| F4 | เปิดไฟล์ด้วย Excel จริง | manual | ไม่มี prompt ให้รันสูตร/ลิงก์ภายนอก |
| F5 | SN ที่เป็นตัวเลขล้วนมี 0 นำหน้า เช่น `0012608000001` | อ่าน cell | ยังเป็นข้อความ 0 ไม่หาย (`numFmt = '@'`) |
| F6 | **ถ้าอนาคตเพิ่ม CSV export กลับมา** | — | ต้องมี escape ก่อนปล่อย — บันทึกเป็นเงื่อนไขไว้ |

เพิ่มเติมที่ควรเทสต์ในไฟล์ export:
- ค่าที่เป็น `NULL` แสดงเป็น `'ยังไม่ผูกผลิตภัณฑ์'` / `''` ไม่ใช่คำว่า `null`
- ชีต "ข้อมูลการส่งออก" มีชื่อผู้ส่งออกตรงกับ session ที่ใช้ยิง
- export ตอนไม่มีข้อมูลเลย (0 แถว) → ไฟล์ต้องเปิดได้ ไม่มี `autoFilter` (โค้ดกันไว้แล้ว) — เทสต์ยืนยัน

---

## 7. Finding ที่เจอตอนวางแผน (ยังไม่ได้แก้ ให้ตัดสินใจก่อน)

| # | เรื่อง | ความเสี่ยง | หมายเหตุ |
| --- | --- | --- | --- |
| 1 | **ไม่มีการตรวจ `role` ทั้งระบบ** | `staff` ทำได้ทุกอย่างเท่า `admin` รวมถึง generate SN และแก้ผลิตภัณฑ์ | ดู §4 — ต้องได้ข้อสรุปเชิงธุรกิจก่อนว่าจะจำกัดอะไร |
| 2 | **`/api/files/*` ไม่มี auth** | ใครก็เปิดรูป/วิดีโอที่ลูกค้าแนบได้ถ้ารู้ path (path เป็น UUID เดาไม่ง่าย แต่ลิงก์หลุดได้) | คอมเมนต์ใน `lib/uploads.ts` บอกว่าตั้งใจให้ "เพิ่มสิทธิ์ได้ภายหลัง" — ยังไม่ได้เพิ่ม |
| 3 | export ไม่มี escape formula injection | ต่ำในรูปแบบ `.xlsx` ปัจจุบัน แต่เอกสารบอกว่ามี = เข้าใจผิดได้ | §6.3 |
| 4 | `clientIp()` เชื่อ `X-Forwarded-For` ที่ client ส่งมา | ข้าม rate limit ได้ด้วยการสุ่ม header | ต้องให้ reverse proxy เขียนทับ header นี้เสมอตอน deploy |
| 5 | rate limit อยู่ใน memory | หลาย instance = โควตาไม่ตรง | รู้อยู่แล้ว บันทึกไว้ใน `CLAUDE.md` |
| 6 | `?next=` ในหน้า login | อาจเป็น open redirect ถ้าไม่กรอง | ต้องอ่านโค้ดหน้า login ยืนยัน |

---

## 8. ลำดับที่แนะนำให้รัน

1. **Unit** (เร็ว ไม่แตะ DB): `lib/warranty.ts` (§6.1 T3–T7), `lib/sn-format.ts` (T2), `lib/pagination.ts` (§6.2 G1–G12)
2. **Integration ต่อ DB เทสต์**: §2 ทั้งหมด ยกเว้น rate limit
3. **Flow**: §5.1 → §5.2 → §5.3 (ล้าง DB คั่นระหว่างแต่ละ flow)
4. **proxy / auth**: §3, §4
5. **Rate limit ท้ายสุด** (§2.6) เพราะทำให้ request ถัดไปโดน 429 — restart dev server หลังจบ

---

## 9. สิ่งที่ยังต้องตัดสินใจก่อนลงมือเขียนโค้ดเทสต์

1. **`staff` ควรทำอะไรได้บ้าง** — กำหนดผลลัพธ์ของ §4 R2/R3 ไม่ได้ถ้าไม่มีคำตอบ
2. **เครื่องมือ** — ยังไม่มี test framework ในโปรเจกต์ ต้องเลือกก่อน (node:test ที่ติดมากับ Node 24 พอสำหรับ unit + integration ผ่าน `fetch` โดยไม่ต้องเพิ่ม dependency)
3. **จะทดสอบ timezone ยังไง** — unit อย่างเดียว หรือรัน integration ในสภาพแวดล้อมที่ตั้ง `TZ` ได้
4. **พฤติกรรมที่ยังไม่ได้ยืนยันจากโค้ด** และผมจงใจไม่เดา expected ไว้: `POST /api/admin/sn/import` เมื่อ SN ซ้ำ (§2.4 / C4), เงื่อนไข `409` จุดที่สองของ `PATCH /api/admin/products/[id]`
