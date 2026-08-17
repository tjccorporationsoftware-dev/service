export type Pagination = { page: number; perPage: number; offset: number }

/**
 * LIMIT/OFFSET ถูกแปะลง SQL โดยตรง (mysql2 prepared statement ไม่รับ placeholder ตรงนี้)
 * จึงต้องบังคับให้เป็นจำนวนเต็มในช่วงที่กำหนดเสมอ
 */
export function parsePagination(params: URLSearchParams, defaultPerPage = 20): Pagination {
  const page = clampInt(params.get('page'), 1, 1, 100_000)
  const perPage = clampInt(params.get('per_page'), defaultPerPage, 1, 200)
  return { page, perPage, offset: (page - 1) * perPage }
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(value, min), max)
}

export function meta(total: number, { page, perPage }: Pagination) {
  return { total, page, per_page: perPage, total_pages: Math.ceil(total / perPage) || 1 }
}
