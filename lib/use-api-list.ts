'use client'

import { useEffect, useState } from 'react'

type Loaded<T> = { url: string; data: T | null; error: string }

/**
 * ดึงข้อมูล list จาก API แล้วคืนสถานะ loading/error
 *
 * เก็บ url ที่โหลดสำเร็จไว้คู่กับข้อมูล แล้ว derive `loading` จากการเทียบกับ url ปัจจุบัน
 * แทนการ setLoading(true) ตรง ๆ ใน effect — เลี่ยง cascading render ตามกฎ react-hooks
 */
export function useApiList<T>(url: string) {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const res = await fetch(url)
        const body = await res.json()
        if (cancelled) return
        setLoaded({
          url,
          data: res.ok ? body : null,
          error: res.ok ? '' : (body.error ?? 'โหลดข้อมูลไม่สำเร็จ'),
        })
      } catch {
        if (!cancelled) {
          setLoaded({ url, data: null, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ' })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [url, nonce])

  const fresh = loaded !== null && loaded.url === url

  return {
    data: fresh ? loaded.data : null,
    error: fresh ? loaded.error : '',
    loading: !fresh,
    /** โหลดซ้ำ url เดิม (ใช้หลังบันทึกข้อมูล) โดยไม่ทำให้ตารางกะพริบ */
    reload: () => setNonce((n) => n + 1),
  }
}
