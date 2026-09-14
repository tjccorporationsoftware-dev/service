import ExcelJS from 'exceljs'
import { query, type SqlParams } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { SN_DISPLAY_STATUS_LABEL, snDisplayStatus } from '@/lib/warranty'
import { getBrand } from '@/lib/brand'

type Row = {
  sn: string
  sn_status: string
  category: string | null
  product_name: string | null
  model: string | null
  // created_at เป็น DATETIME — mysql2 คืนเป็น Date เพราะ dateStrings ตั้งไว้เฉพาะ 'DATE'
  created_at: Date | string
  phone: string | null
  // warranty_end เป็น DATE — คืนเป็นสตริง 'YYYY-MM-DD' ตาม dateStrings
  warranty_end: string | null
}

// โทนสีเดียวกับธีมแอดมิน เพื่อให้ไฟล์ที่ส่งออกดูเป็นชุดเดียวกับหน้าจอ
// หัวตารางใช้ brand-600 ของชุดที่รันอยู่ (ค่าเดียวกับปุ่มหลัก) — ExcelJS ต้องการ ARGB จริง ใช้ CSS variable ไม่ได้
const BRAND_600 = `FF${getBrand().shades[600].slice(1).toUpperCase()}`
const NAVY_100 = 'FFDDE5EE'
const ROW_BAND = 'FFF4F8FC'

const STATUS_COLOR: Record<string, string> = {
  available: 'FF5D7796', // ยังไม่ลงทะเบียน — เทาอมน้ำเงิน
  started: 'FF2B6AA3', // เริ่มประกันแล้ว — ฟ้าแบรนด์
  registered: 'FF08745A', // ลงทะเบียนแล้ว — เขียว
  void: 'FFB91C1C', // ยกเลิก — แดง
}

/** แปลง 'YYYY-MM-DD' เป็น Date ตามเวลาท้องถิ่น (อย่าใช้ new Date(str) ตรง ๆ เพราะมันตีความเป็น UTC แล้ววันเพี้ยน) */
function parseDateOnly(value: string | null): Date | null {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  return Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) ? new Date(y, m - 1, d) : null
}

function toDate(value: Date | string | null): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  return parseDateOnly(value)
}

export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const params = new URL(request.url).searchParams
  const where: string[] = []
  const values: SqlParams = []
  // เก็บไว้เขียนลงชีต "ข้อมูลการส่งออก" ให้รู้ว่าไฟล์นี้กรองด้วยเงื่อนไขอะไร
  const appliedFilters: [string, string][] = []

  const batchId = params.get('batch_id')
  if (batchId) {
    where.push('s.batch_id = ?')
    values.push(batchId)
    appliedFilters.push(['ชุดที่สร้าง (batch)', batchId])
  }

  // 'started'/'registered' ทั้งคู่เก็บเป็น s.status = 'registered' เหมือนกันในฐานข้อมูล
  // ต่างกันตรงที่มีเบอร์โทรผูกไว้หรือยัง (r.phone) — ดูคำอธิบายเดียวกับ /api/admin/sn
  const status = params.get('status')
  if (status === 'available' || status === 'void') {
    where.push('s.status = ?')
    values.push(status)
  } else if (status === 'started') {
    where.push("s.status = 'registered' AND r.phone IS NULL")
  } else if (status === 'registered') {
    where.push("s.status = 'registered' AND r.phone IS NOT NULL")
  }
  if (status && SN_DISPLAY_STATUS_LABEL[status as keyof typeof SN_DISPLAY_STATUS_LABEL]) {
    appliedFilters.push([
      'สถานะ',
      SN_DISPLAY_STATUS_LABEL[status as keyof typeof SN_DISPLAY_STATUS_LABEL],
    ])
  }

  const productIdParam = params.get('product_id')
  if (productIdParam === 'unassigned') {
    where.push('s.product_id IS NULL')
    appliedFilters.push(['ผลิตภัณฑ์', 'เฉพาะที่ยังไม่ผูกผลิตภัณฑ์'])
  } else {
    const productId = Number.parseInt(productIdParam ?? '', 10)
    if (Number.isFinite(productId)) {
      where.push('s.product_id = ?')
      values.push(productId)
    }
  }

  const category = params.get('category')?.trim()
  if (category) {
    where.push('s.category = ?')
    values.push(category)
    appliedFilters.push(['หมวดหมู่', category])
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const rows = await query<Row>(
    `SELECT s.sn, s.status AS sn_status, s.category, s.created_at,
            p.name AS product_name, p.model, r.phone, r.warranty_end
     FROM serial_numbers s
     LEFT JOIN products p ON p.id = s.product_id
     LEFT JOIN registrations r ON r.serial_number_id = s.id
     ${clause}
     ORDER BY s.id`,
    values
  )

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ระบบลงทะเบียนรับประกันสินค้า'
  workbook.created = new Date()

  // ── ชีตหลัก ────────────────────────────────────────────────
  const sheet = workbook.addWorksheet('Serial Number', {
    views: [{ state: 'frozen', ySplit: 1 }], // ตรึงแถวหัวไว้ เลื่อนลงยาว ๆ ก็ยังเห็นชื่อคอลัมน์
  })

  sheet.columns = [
    { header: 'ลำดับ', key: 'no', width: 8 },
    { header: 'Serial Number', key: 'sn', width: 20 },
    { header: 'ผลิตภัณฑ์', key: 'product', width: 30 },
    { header: 'รุ่น', key: 'model', width: 16 },
    { header: 'หมวดหมู่', key: 'category', width: 18 },
    { header: 'สถานะ', key: 'status', width: 20 },
    { header: 'วันที่สร้าง', key: 'created_at', width: 20 },
    { header: 'วันหมดประกัน', key: 'warranty_end', width: 18 },
  ]

  const headerRow = sheet.getRow(1)
  headerRow.height = 26
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_600 } }
    cell.border = { bottom: { style: 'thin', color: { argb: BRAND_600 } } }
  })

  rows.forEach((row, i) => {
    const statusKey = snDisplayStatus(row.sn_status, row.phone)
    const added = sheet.addRow({
      no: i + 1,
      sn: row.sn,
      product: row.product_name ?? 'ยังไม่ผูกผลิตภัณฑ์',
      model: row.model ?? '',
      category: row.category ?? '',
      status: SN_DISPLAY_STATUS_LABEL[statusKey],
      created_at: toDate(row.created_at),
      warranty_end: parseDateOnly(row.warranty_end),
    })

    added.alignment = { vertical: 'middle' }
    added.getCell('no').alignment = { horizontal: 'center', vertical: 'middle' }
    // บังคับ SN เป็นข้อความ กัน Excel แปลงรหัสที่เป็นตัวเลขล้วนเป็นตัวเลข (0 นำหน้าจะหาย)
    added.getCell('sn').numFmt = '@'
    added.getCell('sn').font = { name: 'Consolas', size: 11 }
    added.getCell('created_at').numFmt = 'dd/mm/yyyy hh:mm'
    added.getCell('warranty_end').numFmt = 'dd/mm/yyyy'
    added.getCell('status').font = {
      color: { argb: STATUS_COLOR[statusKey] ?? 'FF263548' },
      bold: true,
      size: 11,
    }

    // แถบสลับสีอ่อน ๆ ช่วยกวาดสายตาตามแถวยาว ๆ ไม่หลุดบรรทัด
    if (i % 2 === 1) {
      added.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_BAND } }
      })
    }
    added.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { bottom: { style: 'hair', color: { argb: NAVY_100 } } }
    })
  })

  // ฟิลเตอร์ให้กดกรอง/เรียงได้เองใน Excel — ครอบเฉพาะเมื่อมีข้อมูล ไม่งั้น Excel เตือนไฟล์เสีย
  if (rows.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } }
  }

  // ── ชีตข้อมูลการส่งออก ─────────────────────────────────────
  const info = workbook.addWorksheet('ข้อมูลการส่งออก')
  info.columns = [
    { key: 'k', width: 24 },
    { key: 'v', width: 46 },
  ]
  const infoRows: [string, string][] = [
    ['วันที่ส่งออก', new Date().toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' })],
    ['ผู้ส่งออก', auth.session.displayName || auth.session.username],
    ['จำนวนรายการ', `${rows.length.toLocaleString('th-TH')} รายการ`],
    ...(appliedFilters.length ? appliedFilters : ([['เงื่อนไขที่กรอง', 'ทั้งหมด ไม่ได้กรอง']] as [string, string][])),
  ]
  infoRows.forEach(([k, v]) => {
    const r = info.addRow({ k, v })
    r.getCell('k').font = { bold: true, color: { argb: 'FF263548' } }
    r.getCell('v').alignment = { wrapText: true }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = `serial-numbers-${new Date().toISOString().slice(0, 10)}.xlsx`

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.byteLength),
    },
  })
}
