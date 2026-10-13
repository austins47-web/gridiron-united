import { useEffect, useState } from 'react'

/**
 * The paper's grain under the parchment and the war room's map: blotches and
 * fibres in brown, drawn once into a picture. It used to be a live SVG filter
 * (feTurbulence), and a filter's drawn again every time the map is (a pinch, a
 * creature moving over it), which on a phone is slow. Made the same way as that
 * filter: soft blotches (a few octaves of smoothed noise) plus a fine fibre,
 * turned to an ink's alpha.
 */
type Grain = 'parchment' | 'warroom'
/** Its ink, the blotches' size (map units), how the noise turns to alpha (a - b × noise), and how strong */
const KIND: Record<Grain, { rgb: [number, number, number]; cell: [number, number]; alpha: [number, number]; opacity: number }> = {
  parchment: { rgb: [82, 51, 20], cell: [83, 50], alpha: [1.25, 1.6], opacity: 0.5 },
  warroom: { rgb: [38, 36, 26], cell: [50, 50], alpha: [1.05, 1.4], opacity: 0.35 },
}
const made = new Map<Grain, Promise<string | null>>()

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function draw(kind: Grain, W: number, H: number): Promise<string | null> {
  const { rgb, cell, alpha, opacity } = KIND[kind]
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  const rnd = mulberry(7)
  // Three octaves of value noise, each a grid of random heights, smoothed between
  const octaves = [0, 1, 2].map(k => {
    const cx = cell[0] / 2 ** k, cy = cell[1] / 2 ** k
    const gw = Math.ceil(W / cx) + 2, gh = Math.ceil(H / cy) + 2
    return { cx, cy, gw, amp: 0.5 ** k, g: Float32Array.from({ length: gw * gh }, () => rnd() * 2 - 1) }
  })
  const norm = octaves.reduce((t, o) => t + o.amp, 0)
  const img = ctx.createImageData(W, H)
  const d = img.data
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let n = 0
      for (const o of octaves) {
        const fx = x / o.cx, fy = y / o.cy, ix = fx | 0, iy = fy | 0
        let tx = fx - ix, ty = fy - iy
        tx = tx * tx * (3 - 2 * tx)
        ty = ty * ty * (3 - 2 * ty)
        const i = iy * o.gw + ix
        const top = o.g[i] + (o.g[i + 1] - o.g[i]) * tx
        const bot = o.g[i + o.gw] + (o.g[i + o.gw + 1] - o.g[i + o.gw]) * tx
        n += (top + (bot - top) * ty) * o.amp
      }
      const blot = 0.5 + 0.42 * (n / norm), fibre = 0.5 + (rnd() - 0.5) * 0.45
      const a = Math.min(1, Math.max(0, alpha[0] - alpha[1] * (0.75 * blot + 0.35 * fibre))) * opacity
      const p = (y * W + x) * 4
      d[p] = rgb[0]
      d[p + 1] = rgb[1]
      d[p + 2] = rgb[2]
      d[p + 3] = Math.round(a * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
  return new Promise(done => {
    try { canvas.toBlob(b => done(b ? URL.createObjectURL(b) : null), 'image/png') } catch { done(null) }
  })
}

/** The paper's grain as a picture's URL (null if it can't be drawn): drawn once a session, in a quiet moment */
export function paperGrain(kind: Grain, W: number, H: number): Promise<string | null> {
  if (!made.has(kind)) {
    made.set(kind, new Promise(done => {
      const go = () => { draw(kind, W, H).then(done, () => done(null)) }
      const idle = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback
      if (idle) idle(go, { timeout: 600 })
      else window.setTimeout(go, 50)
    }))
  }
  return made.get(kind)!
}

export function usePaperGrain(kind: Grain | null, W: number, H: number): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!kind) return
    let live = true
    paperGrain(kind, W, H).then(u => { if (live) setUrl(u) })
    return () => { live = false }
  }, [kind, W, H])
  return kind ? url : null
}
