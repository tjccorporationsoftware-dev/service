// ธีมสีต่อบริษัท — อ่าน BRAND_COLOR_PRIMARY จาก env แล้วไล่เฉด brand-50..900 ให้ครบชุด
//
// กลไก: Tailwind v4 compile class เช่น bg-brand-500 เป็น background-color: var(--color-brand-500)
// (ไม่ฝัง hex) และประกาศค่าเริ่มต้นไว้บน :root ใน @layer theme ของ app/globals.css
// app/layout.tsx เอา cssVars จากไฟล์นี้ไปตั้งบน <html style="..."> ซึ่ง inline style ชนะ :root เสมอ
// ทุกจุดที่ใช้ brand-* จึงเปลี่ยนสีตามตอน runtime โดยไม่ต้อง build ใหม่
// ไม่ได้ตั้ง env = ไม่ตั้งทับ = ได้ palette เริ่มต้นจาก globals.css เป๊ะ
//
// ใช้ได้เฉพาะฝั่ง server (อ่าน process.env) — client component ห้าม import ไฟล์นี้
// ห้ามใช้ NEXT_PUBLIC_ กับค่าแบรนด์ เพราะจะถูกฝังตอน build แล้วทุกชุด deploy ได้ค่าเดียวกัน
//
// รูปแบบค่าในไฟล์ env: BRAND_COLOR_PRIMARY=B8860B (ไม่มี #) — ถ้าเขียน =#B8860B โดยไม่ครอบเครื่องหมายคำพูด
// ทั้ง Next (dotenv) และ Node จะตีความ # เป็นคอมเมนต์ ได้ค่าว่างเงียบ ๆ แล้วเว็บขึ้นสีเริ่มต้นโดยไม่มี error
// getBrand() จึงตรวจไฟล์ .env.local ตรง ๆ แล้ว throw ตั้งแต่ boot ถ้าเจอรูปแบบนั้น
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const BRAND_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const
export type BrandShade = (typeof BRAND_SHADES)[number]
export type BrandPalette = Record<BrandShade, string>
export type BrandCssVars = Record<`--color-brand-${BrandShade}`, string>

export type Brand = {
  /** ตั้ง BRAND_COLOR_PRIMARY ไว้หรือไม่ */
  configured: boolean
  /** ค่าที่ตั้งมา (normalize เป็น #rrggbb ตัวพิมพ์เล็ก) — null เมื่อไม่ได้ตั้ง */
  colorPrimary: string | null
  /** สีที่ตั้งมาอ่อน/เข้มเกินกว่าจะใช้เป็นเฉด 500 ตรง ๆ ระบบจึงไล่เฉดจากโทนสีนี้แทน */
  adjusted: boolean
  /** hex ครบ 10 เฉดเสมอ — ไม่ได้ตั้ง env จะเป็น palette เริ่มต้นชุดเดียวกับ globals.css */
  shades: BrandPalette
  /** ตัวแปรสำหรับใส่ <html style> — undefined เมื่อไม่ได้ตั้ง env (ไม่ต้องใส่ style เลย) */
  cssVars: BrandCssVars | undefined
}

/** ค่าเริ่มต้น — ต้องตรงกับ --color-brand-* ใน app/globals.css (ใช้ต่อเมื่อไม่ได้ตั้ง BRAND_COLOR_PRIMARY) */
export const DEFAULT_BRAND_PALETTE: BrandPalette = {
  50: '#f1f7fc',
  100: '#e1eef9',
  200: '#bfddf2',
  300: '#92c4e7',
  400: '#5fa4d8',
  500: '#3985c4',
  600: '#2b6aa3',
  700: '#235483',
  800: '#1e4468',
  900: '#1a3855',
}

/**
 * บันไดต่อเฉด: ความสว่าง (OKLCH L) และสัดส่วนความสด (chroma เทียบกับเฉด 500)
 * calibrate จาก palette เริ่มต้น — ใส่ #3985c4 แล้วได้ palette เดิมกลับมาแทบเป๊ะ
 * เฉด 600 ขึ้นไปมี L ≤ 0.512 ซึ่งทำให้ตัวหนังสือขาวผ่าน contrast 4.5:1 ทุกโทนสี (ยืนยันใน tests/unit/brand.test.mjs)
 */
const LADDER: Record<BrandShade, { l: number; c: number }> = {
  50: { l: 0.973, c: 0.08 },
  100: { l: 0.943, c: 0.17 },
  200: { l: 0.882, c: 0.35 },
  300: { l: 0.798, c: 0.59 },
  400: { l: 0.694, c: 0.85 },
  500: { l: 0.598, c: 1 },
  600: { l: 0.512, c: 0.91 },
  700: { l: 0.436, c: 0.77 },
  800: { l: 0.377, c: 0.62 },
  900: { l: 0.333, c: 0.52 },
}

// ช่วงความสว่างที่ยอมให้ใช้สีที่ตั้งมาเป็นเฉด 500 "ตรง ๆ" — อยู่ระหว่างเฉด 400 กับ 600 ของบันได ลำดับจึงไม่สลับ
const PRIMARY_L_MIN = 0.54
const PRIMARY_L_MAX = 0.66

// ── สี: sRGB ⇄ OKLCH (สูตรของ Björn Ottosson) ─────────────────────────────

type Rgb = [number, number, number]
type Oklch = { l: number; c: number; h: number }

const HEX_PATTERN = /^#?([0-9a-f]{6})$/i

/** รับ #rrggbb หรือ rrggbb คืน #rrggbb ตัวพิมพ์เล็ก — throw ถ้ารูปแบบผิด */
export function normalizeHex(value: string): string {
  const match = HEX_PATTERN.exec(value.trim())
  if (!match) {
    throw new Error(`BRAND_COLOR_PRIMARY "${value}" ใช้ไม่ได้ — ต้องเป็น hex 6 หลัก เช่น #3985c4`)
  }
  return `#${match[1].toLowerCase()}`
}

function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function rgbToHex([r, g, b]: Rgb): string {
  const part = (v: number) =>
    Math.round(clamp01(v) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function rgbToOklch([r, g, b]: Rgb): Oklch {
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: L, c: Math.hypot(a, bb), h: Math.atan2(bb, a) }
}

function oklchToLinearRgb({ l, c, h }: Oklch): Rgb {
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b
  const L = l_ ** 3
  const M = m_ ** 3
  const S = s_ ** 3
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ]
}

const GAMUT_EPSILON = 0.0005
const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -GAMUT_EPSILON && v <= 1 + GAMUT_EPSILON)

/**
 * แปลง OKLCH เป็น hex — ถ้าสีสดเกินขอบเขต sRGB ให้ลด chroma ลง (binary search) โดยคงความสว่างและโทนไว้
 * คงความสว่างเป็นเรื่องสำคัญ: บันได L คือสิ่งที่รับประกันว่าตัวหนังสือขาวบนเฉดเข้มยังอ่านได้
 */
function oklchToHex(color: Oklch): string {
  let lin = oklchToLinearRgb(color)
  if (!inGamut(lin)) {
    let lo = 0
    let hi = color.c
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(oklchToLinearRgb({ ...color, c: mid }))) lo = mid
      else hi = mid
    }
    lin = oklchToLinearRgb({ ...color, c: lo })
  }
  return rgbToHex([fromLinear(clamp01(lin[0])), fromLinear(clamp01(lin[1])), fromLinear(clamp01(lin[2]))])
}

/** ความสว่างแบบ OKLCH (0–1) ของสี hex — ใช้ตรวจว่าบันไดเฉดไล่ลงจริง */
export function lightnessOf(hex: string): number {
  return rgbToOklch(hexToRgb(normalizeHex(hex))).l
}

/** อัตราส่วน contrast (WCAG 2) ของตัวหนังสือขาวบนพื้นสีนี้ — 4.5 ขึ้นไปคือผ่านระดับ AA */
export function whiteContrast(hex: string): number {
  const [r, g, b] = hexToRgb(normalizeHex(hex))
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return 1.05 / (luminance + 0.05)
}

// ── ไล่เฉด ──────────────────────────────────────────────────────────────

/**
 * ไล่ 10 เฉดจากสีหลักสีเดียว — โทน (hue) และความสด (chroma) มาจากสีที่ให้ ความสว่างมาจากบันได
 * ถ้าความสว่างของสีที่ให้อยู่ในช่วงเฉด 500 จะใช้สีนั้นเป็นเฉด 500 ตรง ๆ (ลูกค้าเห็นสีของตัวเองเป๊ะบนปุ่ม)
 * ถ้าอ่อนหรือเข้มเกินไป ทุกเฉดรวมทั้ง 500 จะมาจากบันได และคืน adjusted = true
 */
export function buildBrandPalette(primaryHex: string): { shades: BrandPalette; adjusted: boolean } {
  const hex = normalizeHex(primaryHex)
  const base = rgbToOklch(hexToRgb(hex))
  const usePrimaryAs500 = base.l >= PRIMARY_L_MIN && base.l <= PRIMARY_L_MAX

  const shades = {} as BrandPalette
  for (const shade of BRAND_SHADES) {
    if (shade === 500 && usePrimaryAs500) {
      shades[500] = hex
      continue
    }
    const step = LADDER[shade]
    shades[shade] = oklchToHex({ l: step.l, c: base.c * step.c, h: base.h })
  }
  return { shades, adjusted: !usePrimaryAs500 }
}

/** อ่านค่าจาก env ที่ส่งมา (แยกจาก process.env เพื่อให้ทดสอบได้) */
export function resolveBrand(env: Record<string, string | undefined> = process.env): Brand {
  const raw = env.BRAND_COLOR_PRIMARY?.trim()
  if (!raw) {
    return {
      configured: false,
      colorPrimary: null,
      adjusted: false,
      shades: DEFAULT_BRAND_PALETTE,
      cssVars: undefined,
    }
  }

  const colorPrimary = normalizeHex(raw)
  const { shades, adjusted } = buildBrandPalette(colorPrimary)
  const cssVars = Object.fromEntries(
    BRAND_SHADES.map((shade) => [`--color-brand-${shade}`, shades[shade]])
  ) as BrandCssVars

  return { configured: true, colorPrimary, adjusted, shades, cssVars }
}

/**
 * หา BRAND_COLOR_PRIMARY=#rrggbb แบบไม่ครอบเครื่องหมายคำพูดในไฟล์ env (ตัวโหลด env อ่านเป็นค่าว่าง)
 * คืน "#rrggbb" ที่เจอ หรือ null — แยกเป็นฟังก์ชันเพื่อให้ทดสอบกับไฟล์ชั่วคราวได้
 */
export function findCommentedHex(envFile: string): string | null {
  if (!existsSync(envFile)) return null
  const match = /^\s*BRAND_COLOR_PRIMARY\s*=\s*(#[0-9a-fA-F]{6})\s*$/m.exec(readFileSync(envFile, 'utf8'))
  return match ? match[1] : null
}

let cached: Brand | undefined

/** ค่าแบรนด์ของ process นี้ — คำนวณครั้งเดียว (env ไม่เปลี่ยนระหว่างรัน) */
export function getBrand(): Brand {
  if (!cached) {
    cached = resolveBrand()
    if (!cached.configured) {
      const commented = findCommentedHex(path.join(process.cwd(), '.env.local'))
      if (commented) {
        throw new Error(
          `BRAND_COLOR_PRIMARY=${commented} ใน .env.local ถูกอ่านเป็นค่าว่าง เพราะ # ที่ขึ้นต้นค่าคือคอมเมนต์ในไฟล์ env — ` +
            `ให้เขียน BRAND_COLOR_PRIMARY=${commented.slice(1)} (ไม่มี #)`
        )
      }
    }
    if (cached.adjusted) {
      console.warn(
        `⚠ BRAND_COLOR_PRIMARY ${cached.colorPrimary} อ่อนหรือเข้มเกินกว่าจะใช้เป็นเฉด 500 ตรง ๆ — ` +
          `ระบบไล่เฉดจากโทนสีนี้แทน (เฉด 500 ที่ใช้จริงคือ ${cached.shades[500]})`
      )
    }
  }
  return cached
}
