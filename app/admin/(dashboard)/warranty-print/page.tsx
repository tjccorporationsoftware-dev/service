import { warrantyHeaderUrl } from '@/lib/warranty-card'
import { WarrantyPrint } from './warranty-print'

// เช็กรูปหัวกระดาษใน template/ ทุกครั้งที่เปิด — วางไฟล์ใหม่แล้วเห็นทันทีโดยไม่ต้อง build ใหม่
export const dynamic = 'force-dynamic'

export default async function WarrantyPrintPage() {
  const header = await warrantyHeaderUrl()
  return <WarrantyPrint header={header} />
}
