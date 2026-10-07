// Where things go on the Conquest map: the Northeast inset's box, a city's
// spot on a drawn map, an empire's name, and city labels spread apart so
// none overlap. Map units throughout (the main map is 1000×620).
import { TERRITORIES, citiesOf } from '../../../supabase/functions/_shared/conquest.ts'
import { US_MAP, NORTHEAST_CITIES } from './usMap'

export const M = US_MAP
export const NE = M.northeast
export const NE_SET = new Set(NORTHEAST_CITIES)

/** Where the Northeast zoom sits: beside the map (wide screens), below it (narrow), or not at all. */
export type MapLayout = 'side' | 'below' | 'none'
export type Rect = { x: number; y: number; w: number; h: number }

const GAP = 14
const SIDE_W = 420
const BELOW_W = 680
export const insetBox = (layout: MapLayout): Rect | null => {
  if (layout === 'side') return { x: M.width + GAP, y: 40, w: SIDE_W, h: SIDE_W * NE.h / NE.w }
  if (layout === 'below') return { x: (M.width - BELOW_W) / 2, y: M.height + GAP, w: BELOW_W, h: BELOW_W * NE.h / NE.w }
  return null
}
export const viewOf = (layout: MapLayout) => {
  const box = insetBox(layout)
  if (layout === 'side') return { w: M.width + GAP + SIDE_W, h: M.height }
  if (layout === 'below' && box) return { w: M.width, h: box.y + box.h + 4 }
  return { w: M.width, h: M.height }
}

/** Where a city's stadium is on a drawn map, as fractions of its width and height (a Northeast city: its spot in the inset). */
export function pointOf(team: string, layout: MapLayout): { x: number; y: number; inset: boolean } {
  const view = viewOf(layout)
  const box = insetBox(layout)
  const [sx, sy] = M.stadium[team]
  if (box && NE_SET.has(team)) {
    const z = box.w / NE.w
    return { x: (box.x + (sx - NE.x) * z) / view.w, y: (box.y + (sy - NE.y) * z) / view.h, inset: true }
  }
  return { x: sx / view.w, y: sy / view.h, inset: false }
}

// Each territory's outline as rings of points, for "is this spot inside it"
const RINGS: Record<string, [number, number][][]> = Object.fromEntries(TERRITORIES.map(t => [
  t,
  M.territories[t].split('M').filter(Boolean).map(r => r.replace(/Z/g, '').split('L').map(p => p.split(',').map(Number) as [number, number])),
]))

export function insideTerritory(t: string, x: number, y: number): boolean {
  let hit = false
  for (const ring of RINGS[t] ?? []) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j]
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
    }
  }
  return hit
}

export interface EmpireLabel { x: number; y: number; angle: number; size: number }

/**
 * Where an empire of two or more cities writes its name: the middle of its
 * land (or its biggest city's, if the middle falls outside it), leaning
 * along the empire's long side, as big as its land allows.
 */
export function empireLabel(owners: Record<string, string | null>, id: string, name: string, scale: number): EmpireLabel | null {
  const cities = citiesOf(owners, id)
  if (cities.length < 2) return null
  const area = cities.reduce((s, t) => s + M.size[t], 0)
  let x = cities.reduce((s, t) => s + M.size[t] * M.middle[t][0], 0) / area
  let y = cities.reduce((s, t) => s + M.size[t] * M.middle[t][1], 0) / area
  // How the land spreads: its long axis, and how long it is
  let sxx = 0, syy = 0, sxy = 0
  for (const t of cities) {
    const w = M.size[t] / area, dx = M.middle[t][0] - x, dy = M.middle[t][1] - y
    sxx += w * dx * dx; syy += w * dy * dy; sxy += w * dx * dy
  }
  const half = (sxx + syy) / 2, root = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy ** 2)
  const long = half + root, short = Math.max(half - root, 1)
  const lean = (Math.atan2(2 * sxy, sxx - syy) / 2) * (180 / Math.PI)
  const angle = long > short * 2.2 ? Math.max(-28, Math.min(28, lean)) : 0
  if (!cities.some(t => insideTerritory(t, x, y))) {
    const biggest = cities.reduce((a, b) => (M.size[b] > M.size[a] ? b : a))
    ;[x, y] = M.label[biggest]
  }
  // Big as the land, then small enough to fit along it
  const reach = 2.2 * Math.sqrt(long) + Math.sqrt(area) * 0.8
  let size = Math.max(13, Math.min(40, Math.sqrt(area) * 0.12)) * scale
  const width = name.length * size * 0.85
  if (width > reach) size = Math.max(11 * scale, (size * reach) / width)
  return { x, y, angle, size }
}

export interface LabelBox {
  key: string
  /** the label's anchor (its middle, at the city code's baseline) */
  x: number
  y: number
  w: number
  /** how far it reaches above and below the anchor */
  up: number
  down: number
  /** something labels move off of, that doesn't move itself (a capital's star) */
  fixed?: boolean
}

/** Nudges labels apart, and off anything fixed, until none overlap (and keeps them inside `bounds`): each label's new anchor. */
export function spreadLabels(boxes: LabelBox[], bounds: Rect): Record<string, [number, number]> {
  const pos = boxes.map(b => ({ ...b }))
  for (let round = 0; round < 60; round++) {
    let moved = false
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const a = pos[i], b = pos[j]
        if (a.fixed && b.fixed) continue
        const ox = (a.w + b.w) / 2 - Math.abs(a.x - b.x)
        const oy = Math.min(a.y + a.down, b.y + b.down) - Math.max(a.y - a.up, b.y - b.up)
        if (ox <= 0 || oy <= 0) continue
        moved = true
        // Apart the short way (usually up and down); something fixed doesn't give way
        const share = (p: typeof a, q: typeof a) => (p.fixed ? 0 : q.fixed ? 1 : 0.5)
        if (oy <= ox * 1.4) {
          const d = (oy + 1) * (a.y <= b.y ? 1 : -1)
          a.y -= d * share(a, b); b.y += d * share(b, a)
        } else {
          const d = (ox + 1) * (a.x <= b.x ? 1 : -1)
          a.x -= d * share(a, b); b.x += d * share(b, a)
        }
      }
    }
    for (const p of pos) {
      if (p.fixed) continue
      p.x = Math.max(bounds.x + p.w / 2, Math.min(bounds.x + bounds.w - p.w / 2, p.x))
      p.y = Math.max(bounds.y + p.up, Math.min(bounds.y + bounds.h - p.down, p.y))
    }
    if (!moved) break
  }
  return Object.fromEntries(pos.map(p => [p.key, [p.x, p.y] as [number, number]]))
}
