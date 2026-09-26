import { unlink } from 'node:fs/promises'
import path from 'node:path'
import type { ResultSetHeader } from 'mysql2'
import { queryOne, withTransaction } from '@/lib/db'
import { issueReportSchema, firstIssueMessage, UPLOAD_LIMITS } from '@/lib/validations'
import { saveUpload, UploadError, UPLOAD_ROOT, type SavedUpload } from '@/lib/uploads'
import { caseNumber, isInWarranty } from '@/lib/warranty'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const limited = checkRateLimit(request, 'issues', 5, 60_000)
  if (limited) return limited

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: 'อ่านข้อมูลฟอร์มไม่สำเร็จ' }, { status: 400 })
  }

  const parsed = issueReportSchema.safeParse({
    sn: form.get('sn'),
    phone: form.get('phone'),
    description: form.get('description'),
  })
  if (!parsed.success) {
    return Response.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
  }
  const { sn, phone, description } = parsed.data

  const images = form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0)
  const videos = form.getAll('video').filter((f): f is File => f instanceof File && f.size > 0)

  if (images.length > UPLOAD_LIMITS.image.maxCount) {
    return Response.json({ error: UPLOAD_LIMITS.image.label }, { status: 400 })
  }
  if (videos.length > UPLOAD_LIMITS.video.maxCount) {
    return Response.json({ error: UPLOAD_LIMITS.video.label }, { status: 400 })
  }

  // ตาข่ายกันเซิร์ฟเวอร์ล่ม — saveUpload() อ่านไฟล์เข้าหน่วยความจำทั้งก้อน
  // ผู้ใช้จริงไม่มีทางชนเพดานนี้ แต่คำขอที่จงใจแนบไฟล์ใหญ่หลายสิบไฟล์จะถูกตัดตั้งแต่ก่อนเริ่มเขียนดิสก์
  const totalSize = [...images, ...videos].reduce((sum, f) => sum + f.size, 0)
  if (totalSize > UPLOAD_LIMITS.totalMaxSize) {
    const mb = Math.round(UPLOAD_LIMITS.totalMaxSize / 1024 / 1024)
    return Response.json(
      { error: `ไฟล์แนบรวมกันใหญ่เกิน ${mb}MB — กรุณาแบ่งแจ้งเป็นหลายครั้ง` },
      { status: 400 }
    )
  }

  // ต้องลงทะเบียนก่อนถึงแจ้งปัญหาได้ และเบอร์ต้องตรงกับตอนลงทะเบียน
  const registration = await queryOne<{
    id: number
    phone: string | null
    warranty_end: string | null
    product_name: string
  }>(
    `SELECT r.id, r.phone, r.warranty_end, p.name AS product_name
     FROM registrations r
     JOIN serial_numbers s ON s.id = r.serial_number_id
     JOIN products p ON p.id = s.product_id
     WHERE s.sn = ?`,
    [sn]
  )

  if (!registration) {
    return Response.json(
      { error: 'ยังไม่พบการลงทะเบียนของ Serial Number นี้ กรุณาลงทะเบียนรับประกันก่อน' },
      { status: 404 }
    )
  }
  if (!registration.phone) {
    return Response.json(
      { error: 'กรุณาลงทะเบียนผูกข้อมูลติดต่อกับ Serial Number นี้ก่อนจึงจะแจ้งปัญหาได้' },
      { status: 409 }
    )
  }
  if (registration.phone !== phone) {
    return Response.json(
      { error: 'เบอร์โทรไม่ตรงกับที่ใช้ลงทะเบียน Serial Number นี้' },
      { status: 403 }
    )
  }
  if (!registration.warranty_end) {
    return Response.json(
      { error: 'สินค้านี้ยังไม่เริ่มระยะเวลาประกัน กรุณาติดต่อเจ้าหน้าที่ให้เริ่มประกันก่อนจึงจะแจ้งปัญหาได้' },
      { status: 409 }
    )
  }

  const inWarranty = isInWarranty(registration.warranty_end)

  const saved: SavedUpload[] = []
  try {
    for (const file of images) saved.push(await saveUpload(file, 'image'))
    for (const file of videos) saved.push(await saveUpload(file, 'video'))
  } catch (err) {
    await cleanup(saved)
    if (err instanceof UploadError) {
      return Response.json({ error: err.message }, { status: 400 })
    }
    console.error('upload failed:', err)
    return Response.json({ error: 'อัปโหลดไฟล์ไม่สำเร็จ' }, { status: 500 })
  }

  try {
    const issueId = await withTransaction(async (conn) => {
      const [inserted] = await conn.execute<ResultSetHeader>(
        `INSERT INTO issue_reports (registration_id, description, in_warranty) VALUES (?, ?, ?)`,
        [registration.id, description, inWarranty ? 1 : 0]
      )
      for (const file of saved) {
        await conn.execute(
          `INSERT INTO issue_attachments (issue_report_id, file_type, file_path, original_name, file_size)
           VALUES (?, ?, ?, ?, ?)`,
          [inserted.insertId, file.fileType, file.filePath, file.originalName, file.fileSize]
        )
      }
      return inserted.insertId
    })

    return Response.json(
      {
        issue: {
          id: issueId,
          case_number: caseNumber(issueId),
          product_name: registration.product_name,
          in_warranty: inWarranty,
          warranty_end: registration.warranty_end,
          attachments: saved.length,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    await cleanup(saved)
    console.error('create issue failed:', err)
    return Response.json({ error: 'บันทึกเคสไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
  }
}

async function cleanup(files: SavedUpload[]) {
  await Promise.all(
    files.map((f) => unlink(path.join(UPLOAD_ROOT, f.filePath)).catch(() => {}))
  )
}
