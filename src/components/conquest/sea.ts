// The sea lanes as routes: which attacks crossed one, the lane's path
// pointed the way a fleet sailed it, points spaced evenly along it (for a
// warship to sail them at a steady speed), and the keyframes that sail it.
import { ADJ, SEA_LANES } from '../../../supabase/functions/_shared/conquest.ts'
import { M } from './mapGeometry'

type Pt = [number, number]
type Seg = { p0: Pt; c: Pt[]; p1: Pt }

/** Two cities joined by a sea lane (no lane joins cities that share a land border) */
export const byLane = (a: string, b: string) => SEA_LANES.some(([x, y]) => (x === a && y === b) || (x === b && y === a))

/**
 * Where an attack on `city` struck from: the attacker's nearest city
 * bordering it by land, and only when they have none, one across a sea
 * lane (`sea`). Null if they hold nothing next to it.
 */
export function strikeFrom(city: string, holds: (t: string) => boolean): { from: string; sea: boolean } | null {
  const to = M.stadium[city]
  if (!to) return null
  const near = (ADJ[city] ?? []).filter(holds)
  const dist = (n: string) => Math.hypot(M.stadium[n][0] - to[0], M.stadium[n][1] - to[1])
  const land = near.filter(n => !byLane(n, city)).sort((p, q) => dist(p) - dist(q))
  if (land.length) return { from: land[0], sea: false }
  const sea = near.sort((p, q) => dist(p) - dist(q))
  return sea.length ? { from: sea[0], sea: true } : null
}

/** What the newsreel calls the water each lane crosses */
export const WATERS: Record<string, string> = {
  'CAR-MIA': 'the Atlantic', 'HOU-MIA': 'the Gulf', 'NO-TB': 'the Gulf',
  'NE-BAL': 'the Atlantic', 'NYJ-PHI': 'the Atlantic', 'GB-CLE': 'the Great Lakes',
}
export const waterBetween = (a: string, b: string) => WATERS[`${a}-${b}`] ?? WATERS[`${b}-${a}`] ?? 'the sea'

/** A lane's path (M, then Q or C segments, all absolute) as its segments */
function segmentsOf(d: string): Seg[] {
  const tok = d.match(/[MQC]|-?\d*\.?\d+/g) ?? []
  const segs: Seg[] = []
  let i = 0, cur: Pt = [0, 0]
  const pt = (): Pt => [Number(tok[i++]), Number(tok[i++])]
  while (i < tok.length) {
    const cmd = tok[i++]
    if (cmd === 'M') cur = pt()
    else if (cmd === 'Q') { const c = pt(), p1 = pt(); segs.push({ p0: cur, c: [c], p1 }); cur = p1 }
    else if (cmd === 'C') { const c1 = pt(), c2 = pt(), p1 = pt(); segs.push({ p0: cur, c: [c1, c2], p1 }); cur = p1 }
    else break
  }
  return segs
}

const pathOf = (segs: Seg[]) =>
  `M${segs[0].p0.join(' ')}` + segs.map(s => `${s.c.length === 1 ? 'Q' : 'C'}${[...s.c, s.p1].map(p => p.join(' ')).join(' ')}`).join('')

function pointAt(s: Seg, t: number): Pt {
  const u = 1 - t
  if (s.c.length === 1) {
    const [c] = s.c
    return [u * u * s.p0[0] + 2 * u * t * c[0] + t * t * s.p1[0], u * u * s.p0[1] + 2 * u * t * c[1] + t * t * s.p1[1]]
  }
  const [c1, c2] = s.c
  return [
    u ** 3 * s.p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * s.p1[0],
    u ** 3 * s.p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * s.p1[1],
  ]
}

export interface Route {
  /** the lane's path, from the city it sailed from */
  d: string
  /** `n` points evenly spaced along it, first to last */
  pts: Pt[]
  /** its length in map units */
  length: number
  /** the box around it */
  box: { x: number; y: number; w: number; h: number }
}

const routes = new Map<string, Route | null>()

/** The sea lane from one city to another, pointed that way; null if no lane joins them. */
export function laneRoute(from: string, to: string): Route | null {
  const key = `${from}>${to}`
  if (routes.has(key)) return routes.get(key)!
  const lane = M.lanes.find(l => (l.a === from && l.b === to) || (l.a === to && l.b === from))
  let route: Route | null = null
  if (lane) {
    let segs = segmentsOf(lane.d)
    if (lane.a !== from) segs = segs.reverse().map(s => ({ p0: s.p1, c: [...s.c].reverse(), p1: s.p0 }))
    // Dense samples, then resampled at even spacing so a ship sails at a steady speed
    const dense: Pt[] = [segs[0].p0]
    for (const s of segs) for (let k = 1; k <= 24; k++) dense.push(pointAt(s, k / 24))
    const acc = [0]
    for (let k = 1; k < dense.length; k++) acc.push(acc[k - 1] + Math.hypot(dense[k][0] - dense[k - 1][0], dense[k][1] - dense[k - 1][1]))
    const length = acc[acc.length - 1]
    const n = 40, pts: Pt[] = []
    for (let k = 0, j = 0; k <= n; k++) {
      const want = (length * k) / n
      while (j < acc.length - 2 && acc[j + 1] < want) j++
      const f = acc[j + 1] > acc[j] ? (want - acc[j]) / (acc[j + 1] - acc[j]) : 0
      pts.push([dense[j][0] + (dense[j + 1][0] - dense[j][0]) * f, dense[j][1] + (dense[j + 1][1] - dense[j][1]) * f])
    }
    const xs = dense.map(p => p[0]), ys = dense.map(p => p[1])
    const x = Math.min(...xs), y = Math.min(...ys)
    route = { d: pathOf(segs), pts, length, box: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y } }
  }
  routes.set(key, route)
  return route
}

/** How far along a route (0–1) a point sits, and which way it heads there (a unit vector) */
export function along(r: Route, f: number): { at: Pt; dir: Pt } {
  const k = Math.max(0, Math.min(r.pts.length - 1, Math.round(f * (r.pts.length - 1))))
  const a = r.pts[Math.max(0, k - 1)], b = r.pts[Math.min(r.pts.length - 1, k + 1)]
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  return { at: r.pts[k], dir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] }
}

/**
 * Keyframes that sail a ship along a route: `place` turns a point into a
 * translate (map units for a drawing in map space, percents for a layer
 * laid over a box of it). `loop`: it fades in, sails, and fades out at the
 * far shore, to go again; otherwise it sails once and stays there.
 */
export function sailKeyframes(name: string, r: Route, place: (p: Pt) => string, loop: boolean): string {
  const n = r.pts.length - 1
  const frames = r.pts.map((p, k) => {
    const at = (k / n) * (loop ? 88 : 100)
    const fade = loop && k === 0 ? 0 : 1
    return `${at.toFixed(2)}% { transform: translate(${place(p)}); opacity: ${fade} }`
  })
  if (loop) frames.push(`100% { transform: translate(${place(r.pts[n])}); opacity: 0 }`)
  return `@keyframes ${name} { ${frames.join(' ')} }`
}
