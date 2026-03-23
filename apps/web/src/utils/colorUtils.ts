/** Convert #rrggbb hex to [h, s, l] (h:0-360, s:0-100, l:0-100) */
export function hexToHSL(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

/** Convert [h, s, l] to #rrggbb hex */
export function hslToHex(h: number, s: number, l: number): string {
  s = Math.max(0, Math.min(100, s))
  l = Math.max(0, Math.min(100, l))
  const sn = s / 100
  const ln = l / 100
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = ln - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** Generate a 9-stop color ramp from a single hex color */
export function generateColorRamp(hex: string): Record<string, string> {
  const [h, s, l] = hexToHSL(hex)
  return {
    '50':  hslToHex(h, Math.min(s, 90), 96),
    '100': hslToHex(h, Math.min(s, 85), 90),
    '200': hslToHex(h, Math.min(s, 80), 80),
    '300': hslToHex(h, Math.min(s, 75), 70),
    '400': hslToHex(h, s, Math.max(l + 10, 55)),
    '500': hex,
    '600': hslToHex(h, s, Math.round(l * 0.85)),
    '700': hslToHex(h, s, Math.round(l * 0.70)),
    '800': hslToHex(h, s, Math.round(l * 0.50)),
    '900': hslToHex(h, s, Math.round(l * 0.30)),
  }
}

/** Write all color ramp stops as CSS variables on :root */
export function applyColorRamp(hex: string): void {
  const ramp = generateColorRamp(hex)
  const root = document.documentElement
  for (const [stop, color] of Object.entries(ramp)) {
    root.style.setProperty(`--primary-${stop}`, color)
  }
}
