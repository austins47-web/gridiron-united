// ══════════════════════════════════════════════════════════════
// League branding: a league's accent color (leagues.brand_color)
// replaces the copper everywhere the app uses `gold` — Tailwind's gold
// reads the --gold / --gold-light / --gold-dark variables (see
// tailwind.config.js and index.css). Used by AppShell for the active
// league and by the Shop TV.
// ══════════════════════════════════════════════════════════════

type RGB = [number, number, number]

export const DEFAULT_GOLD = '#CE7B45'

function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Relative luminance, 0 (black) to 1 (white). */
function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

const mix = (a: RGB, b: RGB, t: number): RGB =>
  [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB

/**
 * The color as it can actually be used: a navy or a black is lightened
 * until it reads on the app's near-black background, and a pale yellow
 * is darkened until it reads on white (light mode).
 */
function usable(rgb: RGB): RGB {
  let c = rgb
  for (let i = 0; i < 12 && luminance(c) < 0.16; i++) c = mix(c, [255, 255, 255], 0.12)
  for (let i = 0; i < 12 && luminance(c) > 0.5; i++) c = mix(c, [0, 0, 0], 0.1)
  return c
}

const triplet = (c: RGB) => c.join(' ')

/** The CSS variables for a brand color (null: the default copper). */
export function brandVars(hex: string | null | undefined): Record<string, string> | null {
  const rgb = hex ? hexToRgb(hex) : null
  if (!rgb) return null
  const base = usable(rgb)
  return {
    '--gold': triplet(base),
    '--gold-light': triplet(mix(base, [255, 255, 255], 0.22)),
    '--gold-dark': triplet(mix(base, [0, 0, 0], 0.15)),
  }
}

/** Applies a brand color to an element (the page root for the app), or clears it. */
export function applyBrand(el: HTMLElement, hex: string | null | undefined) {
  const vars = brandVars(hex)
  for (const k of ['--gold', '--gold-light', '--gold-dark']) {
    if (vars) el.style.setProperty(k, vars[k])
    else el.style.removeProperty(k)
  }
}

/** Colors offered in the branding picker, beside the free choice. */
export const BRAND_PRESETS = [
  { name: 'Copper', hex: '#CE7B45' },
  { name: 'Fire red', hex: '#D62828' },
  { name: 'Rescue orange', hex: '#F77F00' },
  { name: 'Safety yellow', hex: '#E9C46A' },
  { name: 'Police blue', hex: '#3A86FF' },
  { name: 'EMS green', hex: '#2A9D8F' },
  { name: 'Chrome', hex: '#A8B2BD' },
  { name: 'Purple', hex: '#9B5DE5' },
]
