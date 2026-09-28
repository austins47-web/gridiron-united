// ══════════════════════════════════════════════════════════════
// League logos → transparent PNGs, in the browser.
//
// Logos usually sit on a plain background (white, or a solid color).
// This finds that color from the image's edges and removes it, but
// only where it's connected to the edge, so white lettering inside the
// logo stays. Edge pixels blended with the background become partly
// transparent (with the background color taken back out), so there's
// no halo on the app's dark screens. Then it trims the empty margin
// and exports a PNG no bigger than 1024px.
//
// Already-transparent images are left alone; so is anything without a
// plain background (a photo), which would come out chewed up.
// ══════════════════════════════════════════════════════════════

export type CutoutResult = {
  blob: Blob
  /** What happened, for the upload card. */
  outcome: 'removed' | 'already' | 'kept'
}

const MAX = 1024
/** Color distance (RGB) still counted as the background. */
const SOLID = 42

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image couldn't be read")) }
    img.src = url
  })
}

const dist = (d: Uint8ClampedArray, i: number, r: number, g: number, b: number) => {
  const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/**
 * Takes a plain background out of RGBA pixels in place (see the top of
 * the file). Pure, so it can be tested without a canvas.
 */
export function removeFlatBackground(d: Uint8ClampedArray, w: number, h: number, removeBackground = true): CutoutResult['outcome'] {
  // The border, clockwise
  const border: number[] = []
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x)
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1)

  let outcome: CutoutResult['outcome'] = 'kept'
  const clearEdge = border.filter(p => d[p * 4 + 3] < 16).length
  if (clearEdge > border.length * 0.1) {
    outcome = 'already'
  } else if (removeBackground) {
    // The most common border color (5 bits a channel), if it covers
    // enough of the edge to be a plain background
    const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
    for (const p of border) {
      const i = p * 4
      const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)
      const bk = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
      bk.n++; bk.r += d[i]; bk.g += d[i + 1]; bk.b += d[i + 2]
      buckets.set(key, bk)
    }
    const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0]
    // Neighboring buckets are the same color with a little JPEG noise
    const plain = top && [...buckets.values()]
      .filter(bk => Math.abs(bk.r / bk.n - top.r / top.n) + Math.abs(bk.g / bk.n - top.g / top.n) + Math.abs(bk.b / bk.n - top.b / top.n) < 36)
      .reduce((n, bk) => n + bk.n, 0) >= border.length * 0.45

    if (top && plain) {
      const br = top.r / top.n, bg = top.g / top.n, bb = top.b / top.n
      // Flood the background in from the edges
      const isBg = new Uint8Array(w * h)
      const queue = new Int32Array(w * h)
      let head = 0, tail = 0
      for (const p of border) {
        if (!isBg[p] && dist(d, p * 4, br, bg, bb) <= SOLID) { isBg[p] = 1; queue[tail++] = p }
      }
      while (head < tail) {
        const p = queue[head++]
        const x = p % w, y = (p - x) / w
        const next = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]
        for (const q of next) {
          if (q < 0 || isBg[q]) continue
          if (dist(d, q * 4, br, bg, bb) <= SOLID) { isBg[q] = 1; queue[tail++] = q }
        }
      }

      // The logo's edge: pixels within two steps of the background, which
      // anti-aliasing (and downscaling) blended with it
      const near = new Uint8Array(w * h)
      const adj = (p: number, set: Uint8Array) => {
        const x = p % w
        return (x > 0 && set[p - 1]) || (x < w - 1 && set[p + 1]) || (p >= w && set[p - w]) || (p < w * (h - 1) && set[p + w])
      }
      for (let p = 0; p < w * h; p++) if (!isBg[p] && adj(p, isBg)) near[p] = 1
      const ring1 = near.slice()
      for (let p = 0; p < w * h; p++) if (!isBg[p] && !ring1[p] && adj(p, ring1)) near[p] = 2

      const snapshot = d.slice()
      for (let p = 0; p < w * h; p++) {
        const i = p * 4
        if (isBg[p]) { d[i + 3] = 0; continue }
        if (!near[p]) continue
        // How far this pixel sits from the background, against how far the
        // solid logo color next to it does: that share is its opacity
        const x = p % w, y = (p - x) / w
        let solid = 0
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const qx = x + dx, qy = y + dy
            if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue
            const q = qy * w + qx
            if (!isBg[q]) solid = Math.max(solid, dist(snapshot, q * 4, br, bg, bb))
          }
        }
        // A logo color this close to the background can't be told apart; leave it
        if (solid < SOLID * 1.5) continue
        const a = Math.min(1, dist(snapshot, i, br, bg, bb) / solid)
        if (a >= 0.97) continue
        if (a <= 0.04) { d[i + 3] = 0; continue }
        // Take the background back out of the color, so no halo
        d[i] = Math.min(255, Math.max(0, (snapshot[i] - br * (1 - a)) / a))
        d[i + 1] = Math.min(255, Math.max(0, (snapshot[i + 1] - bg * (1 - a)) / a))
        d[i + 2] = Math.min(255, Math.max(0, (snapshot[i + 2] - bb * (1 - a)) / a))
        d[i + 3] = Math.round(snapshot[i + 3] * a)
      }
      outcome = 'removed'
    }
  }

  return outcome
}

/** The logo as a PNG, background removed where there's a plain one. */
export async function makeLogoPng(file: File, removeBackground = true): Promise<CutoutResult> {
  const img = await loadImage(file)
  const w0 = img.naturalWidth || img.width || MAX
  const h0 = img.naturalHeight || img.height || MAX
  const scale = Math.min(1, MAX / Math.max(w0, h0))
  const w = Math.max(1, Math.round(w0 * scale))
  const h = Math.max(1, Math.round(h0 * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error("This browser can't process images")
  ctx.drawImage(img, 0, 0, w, h)
  const image = ctx.getImageData(0, 0, w, h)
  const d = image.data

  const outcome = removeFlatBackground(d, w, h, removeBackground)
  if (outcome === 'removed') ctx.putImageData(image, 0, 0)

  // Trim the empty margin (keeping a little breathing room)
  let minX = w, minY = h, maxX = -1, maxY = -1
  if (outcome !== 'kept') {
    const px = ctx.getImageData(0, 0, w, h).data
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (px[(y * w + x) * 4 + 3] > 8) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
  }
  let out = canvas
  if (maxX >= minX && maxY >= minY && (maxX - minX + 1 < w || maxY - minY + 1 < h)) {
    const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04)
    const sx = Math.max(0, minX - pad), sy = Math.max(0, minY - pad)
    const sw = Math.min(w, maxX + pad + 1) - sx, sh = Math.min(h, maxY + pad + 1) - sy
    out = document.createElement('canvas')
    out.width = sw
    out.height = sh
    out.getContext('2d')!.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh)
  }

  const blob = await new Promise<Blob | null>(resolve => out.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error("Couldn't make the PNG")
  return { blob, outcome }
}
