import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { UPLOAD_LIMITS } from './validations'

/**
 * เก็บไฟล์แนบไว้นอก public/ แล้วเสิร์ฟผ่าน /api/files/*
 * เหตุผล: public/ ถูก snapshot ตอน build (ไฟล์ที่อัปโหลดหลัง build อาจไม่ถูกเสิร์ฟ)
 * และการผ่าน route handler ทำให้ควบคุมสิทธิ์การเข้าถึงได้ในอนาคต
 */
export const UPLOAD_ROOT = path.join(process.cwd(), 'uploads')

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'video/mp4': 'mp4',
}

export type SavedUpload = {
  fileType: 'image' | 'video'
  /** path แบบ relative ที่เก็บลง DB เช่น 2026/07/uuid.jpg */
  filePath: string
  originalName: string
  fileSize: number
}

export class UploadError extends Error {}

export async function saveUpload(file: File, kind: 'image' | 'video'): Promise<SavedUpload> {
  const limits = UPLOAD_LIMITS[kind]

  if (!(limits.mimeTypes as readonly string[]).includes(file.type)) {
    throw new UploadError(`ชนิดไฟล์ไม่รองรับ — ต้องเป็น ${limits.label}`)
  }
  if (file.size > limits.maxSize) {
    throw new UploadError(`ไฟล์ "${file.name}" ใหญ่เกินกำหนด — ${limits.label}`)
  }
  if (file.size === 0) {
    throw new UploadError(`ไฟล์ "${file.name}" ว่างเปล่า`)
  }

  // ตั้งชื่อไฟล์ใหม่เองทั้งหมด ไม่แตะชื่อเดิมจากผู้ใช้ → กัน path traversal
  const now = new Date()
  const dir = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`
  const ext = EXTENSION_BY_MIME[file.type]
  const name = `${randomUUID()}.${ext}`
  const relativePath = `${dir}/${name}`

  await mkdir(path.join(UPLOAD_ROOT, dir), { recursive: true })
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(path.join(UPLOAD_ROOT, dir, name), buffer)

  return {
    fileType: kind,
    filePath: relativePath,
    originalName: file.name.slice(0, 255),
    fileSize: file.size,
  }
}

/** แปลง path ใน DB เป็น URL ที่เปิดดูได้ */
export function fileUrl(filePath: string): string {
  return `/api/files/${filePath}`
}

/** คลี่ path ที่ผู้ใช้ส่งมาแล้วยืนยันว่ายังอยู่ใน UPLOAD_ROOT */
export function resolveUploadPath(segments: string[]): string | null {
  const resolved = path.resolve(UPLOAD_ROOT, ...segments)
  const root = path.resolve(UPLOAD_ROOT)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null
  return resolved
}

export const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  mp4: 'video/mp4',
}
