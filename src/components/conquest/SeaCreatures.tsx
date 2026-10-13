import { useId, type CSSProperties, type ReactNode } from 'react'
import { usePoke } from './poke'

/**
 * The parchment's creatures, drawn the way the old engravers drew them (Olaus
 * Magnus' Carta Marina, Ortelius, de Montfort's kraken): bodies built along a
 * curve, shaded with hatching that follows the form, scaled and banded, out of
 * engraved water. Each moves a little (by CSS: held still for the TV's lighter
 * effects, Reduce effects and reduced motion). All in map units.
 *
 * Tap one and it does something: the serpent dives and comes up again, the
 * whale blows and slaps its tail, the kraken thrashes, squirts ink and sinks to
 * its eyes, the galleon fires a broadside.
 */

/** A poke's state, passed to a creature: `n` restarts its animation, `on` while it plays */
interface Poked { id: string; n: number; on: boolean }

type Pt = [number, number]
const INK = '#3a2611', PAPER = '#f1e4c2', RED = '#8a3322'
const r2 = (n: number) => Math.round(n * 100) / 100
const pt = (p: Pt) => `${r2(p[0])} ${r2(p[1])}`
const add = (p: Pt, v: Pt, k = 1): Pt => [p[0] + v[0] * k, p[1] + v[1] * k]

/** Points along a chain of cubic Béziers (1 + 3k control points) */
function chain(cp: Pt[], n = 24): Pt[] {
  const out: Pt[] = []
  for (let s = 0; s + 3 < cp.length; s += 3) {
    const [a, b, c, d] = [cp[s], cp[s + 1], cp[s + 2], cp[s + 3]]
    for (let i = s === 0 ? 0 : 1; i <= n; i++) {
      const t = i / n, u = 1 - t
      out.push([
        u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
        u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
      ])
    }
  }
  return out
}

/** A body along a centreline: its half-width w(t) from start (0) to end (1), its two edges and outline */
interface Body { pts: Pt[]; tan: Pt[]; nrm: Pt[]; w: number[]; outline: string }
function body(cp: Pt[], w: (t: number) => number, n?: number): Body {
  const pts = chain(cp, n)
  const tan = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1
    return [dx / l, dy / l] as Pt
  })
  const nrm = tan.map(([x, y]) => [-y, x] as Pt)
  const ws = pts.map((_, i) => w(i / (pts.length - 1)))
  const L = pts.map((p, i) => add(p, nrm[i], ws[i])), R = pts.map((p, i) => add(p, nrm[i], -ws[i]))
  return { pts, tan, nrm, w: ws, outline: `M${[...L, ...R.reverse()].map(pt).join('L')}Z` }
}
const edge = (b: Body, i: number, side: number, k = 1) => add(b.pts[i], b.nrm[i], b.w[i] * side * k)
const span = (b: Body, from: number, to: number, every: number) => {
  const out: number[] = []
  for (let i = Math.round(from * (b.pts.length - 1)); i <= Math.round(to * (b.pts.length - 1)); i += every) out.push(i)
  return out
}

/** The engraver's shading: short strokes in from one edge, longer and shorter by turns */
const hatch = (b: Body, side: number, every = 1, from = 0, to = 1, depth = 0.62) =>
  span(b, from, to, every).map((i, k) => `M${pt(edge(b, i, side))}L${pt(edge(b, i, side, 1 - depth * (k % 2 ? 0.6 : 1)))}`).join('')
/** Bands across the body (a serpent's belly scales), bowed toward its tail */
const bands = (b: Body, every: number, from = 0, to = 1) =>
  span(b, from, to, every).map(i => `M${pt(edge(b, i, 1))}Q${pt(add(b.pts[i], b.tan[i], b.w[i] * 0.5))} ${pt(edge(b, i, -1))}`).join('')
/** Spines along one edge, swept back toward the tail */
const spines = (b: Body, side: number, every: number, h: number, from = 0, to = 1) =>
  span(b, from, to, every).map(i => {
    const j = Math.max(0, i - 1), k = Math.min(b.pts.length - 1, i + 2)
    const tip = add(add(edge(b, i, side), b.nrm[i], h * side), b.tan[i], h * 0.55)
    return `M${pt(edge(b, j, side, 0.6))}L${pt(tip)}L${pt(edge(b, k, side, 0.6))}Z`
  }).join('')

/** A splash curling off a body where it breaks the water at x, toward dir */
const curl = (x: number, dir: number, s = 1) =>
  `M${r2(x)} 0.3q${r2(dir * 1.3 * s)} -0.1 ${r2(dir * 2 * s)} -1.5q${r2(dir * 0.5 * s)} -1.3 ${r2(-dir * 0.8 * s)} -1.3`
/** Engraved water under a creature: rows of short strokes, each row a little narrower */
function water(x0: number, x1: number, seed: number): string {
  let r = seed, d = ''
  const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280
  for (const [y, inset] of [[1.2, 0], [2.5, 3], [3.8, 8]]) {
    let x = x0 + inset + rnd() * 2
    while (x < x1 - inset - 1) {
      const len = Math.min(2.4 + rnd() * 5, x1 - inset - x)
      d += `M${r2(x)} ${y}h${r2(len)}`
      x += len + 1 + rnd() * 2.6
    }
  }
  return d
}
/** Where a body breaks the water: the two edges of its first point */
const breaks = (b: Body, s = 1) => {
  const xs = [edge(b, 0, 1)[0], edge(b, 0, -1)[0]].sort((a, c) => a - c)
  return curl(xs[0] - 0.3, -1, s) + curl(xs[1] + 0.3, 1, s)
}

/** Water thrown up where something hits it (at each x), after `delay` seconds */
function Splash({ at, delay }: { at: number[]; delay: number }) {
  return (
    <g className="cq-sea-splash" style={{ animationDelay: `${delay}s` }}>
      {at.map((x, i) => (
        <g key={i}>
          <path d={curl(x - 1.6, -1, 1.4) + curl(x + 1.6, 1, 1.4)} fill="none" stroke={INK} strokeWidth={0.45} strokeLinecap="round" />
          {[[-2.4, -4.4, 0.45], [0, -5.6, 0.55], [2.2, -4, 0.4], [-1, -2.8, 0.35], [1.2, -2.4, 0.35]].map(([dx, dy, r], k) => (
            <circle key={k} cx={r2(x + dx)} cy={dy} r={r} fill={INK} />
          ))}
        </g>
      ))}
    </g>
  )
}

/** Hatch patterns (one way, and across it for the darkest shade) and a clip at the waterline, for one creature */
function Defs({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={`${id}h`} width={1.15} height={1.15} patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
        <path d="M0 0.575H1.15" stroke={INK} strokeWidth={0.32} />
      </pattern>
      <pattern id={`${id}x`} width={1.3} height={1.3} patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
        <path d="M0 0.65H1.3" stroke={INK} strokeWidth={0.28} />
      </pattern>
      <clipPath id={`${id}w`}><rect x={-60} y={-90} width={300} height={90.4} /></clipPath>
    </defs>
  )
}

/** A body: filled, outlined, hatched on one side, with whatever else it carries */
function Drawn({ b, shade, extra, width = 0.7 }: { b: Body; shade?: string; extra?: string; width?: number }) {
  return (
    <>
      <path d={b.outline} fill={PAPER} stroke={INK} strokeWidth={width} strokeLinejoin="round" />
      {shade && <path d={shade} stroke={INK} strokeWidth={0.32} strokeLinecap="round" />}
      {extra && <path d={extra} fill="none" stroke={INK} strokeOpacity={0.55} strokeWidth={0.3} />}
    </>
  )
}

// ── The sea serpent, after Olaus Magnus: a maned, eared head, jaws open on a
// barbed tongue, and its banded, spined body in coils breaking the water ──
const SERPENT = (() => {
  const neck = body([[30, 3], [32, -14], [22, -27], [11, -33]], t => 4.4 - t * 1.2)
  const coils = [
    body([[46, 3], [45, -24], [72, -24], [71, 3]], () => 3.8),
    body([[86, 3], [85, -20], [107, -20], [106, 3]], () => 3.3),
    body([[120, 3], [119, -16], [137, -16], [136, 3]], () => 2.8),
  ]
  const tail = body([[150, 3], [150, -10], [160, -19], [166, -12]], t => 2.6 - t * 1.8)
  // The mane: flame-like locks down the back of the neck
  const mane = span(neck, 0.36, 0.97, 3).reverse().map((i, k) => {
    const e = edge(neck, i, 1), dir: Pt = [neck.nrm[i][0] * 0.75 - neck.tan[i][0] * 0.65, neck.nrm[i][1] * 0.75 - neck.tan[i][1] * 0.65]
    const len = 6.4 - k * 0.45, tip = add(add(e, dir, len), neck.tan[i], -1.2)
    return {
      lock: `M${pt(add(e, neck.tan[i], 1.3))}Q${pt(add(add(e, dir, len * 0.55), neck.tan[i], 1.4))} ${pt(tip)}Q${pt(add(add(e, dir, len * 0.4), neck.tan[i], -0.6))} ${pt(add(e, neck.tan[i], -1.1))}Z`,
      line: `M${pt(add(e, dir, 0.6))}Q${pt(add(add(e, dir, len * 0.5), neck.tan[i], 0.5))} ${pt(add(tip, dir, -1.4))}`,
    }
  })
  // The tail's split fin
  const n = tail.pts.length - 1, E = tail.pts[n], T = tail.tan[n], N = tail.nrm[n]
  const fin = `M${pt(add(E, N, 0.9))}Q${pt(add(add(E, T, 2), N, 3))} ${pt(add(add(E, T, 4.6), N, 3.8))}Q${pt(add(add(E, T, 3.2), N, 0.8))} ${pt(add(E, T, 2.5))}Q${pt(add(add(E, T, 3.2), N, -0.8))} ${pt(add(add(E, T, 4.6), N, -3.8))}Q${pt(add(add(E, T, 2), N, -3))} ${pt(add(E, N, -0.9))}Z`
  const finRays = [3.2, 1.2, -1.2, -3.2].map(k => `M${pt(E)}L${pt(add(add(E, T, 3.8), N, k))}`).join('')
  // Teeth on the open jaws, and the jaw's shading
  const upper = [-17.6, -15.6, -13.6, -11.6, -9.6, -7.6, -5.8].map((x, i) => {
    const y = -32.6 + ((x + 18.6) / 15.6) * 3, len = i === 0 ? 2.4 : 1.3
    return `M${r2(x - 0.55)} ${r2(y - 0.1)}L${r2(x)} ${r2(y + len)}L${r2(x + 0.55)} ${r2(y + 0.1)}Z`
  }).join('')
  const lower = [-14.4, -12.4, -10.4, -8.4, -6.4].map((x, i) => {
    const y = -25.6 - ((x + 15) / 12) * 4, len = i === 0 ? 2.2 : 1.2
    return `M${r2(x - 0.5)} ${r2(y + 0.1)}L${r2(x)} ${r2(y - len)}L${r2(x + 0.5)} ${r2(y - 0.1)}Z`
  }).join('')
  const jaw = [-13, -11.8, -10.6, -9.4, -8.2, -7, -5.8, -4.6, -3.4, -2.2, -1, 0.2, 1.4, 2.6, 3.8, 5].map(x => {
    const y = x < -2 ? -22.6 - (x + 13) * 0.02 : -22.9 - (x + 2) * 0.33
    return `M${r2(x)} ${r2(y - 0.2)}l0.5 -1.8`
  }).join('')
  return { neck, coils, tail, mane, fin, finRays, upper, lower, jaw }
})()

function Serpent({ id, n, on }: Poked) {
  const S = SERPENT
  const head = 'M16 -36.5C12 -41.5 4 -42.5 -1 -39.5C-5 -37.5 -12 -36.5 -17 -36C-19.6 -35.7 -20.4 -33.4 -18.6 -32.6L-3 -29.6L-15 -25.6C-16.8 -25 -16.8 -23.2 -15 -22.9C-10 -22 -3 -22.4 2 -24C6 -25.2 8.6 -27 10 -28.6'
  return (
    <>
      <Defs id={id} />
      <g clipPath={`url(#${id}w)`}>
        {/* Tapped: it rears, dives under, and comes up again */}
        <g key={n} className={on ? 'cq-sea-dive' : undefined}>
        <g className="cq-sea-bob">
          {/* The coils: spines, then the banded body, shaded beneath */}
          {S.coils.map((c, i) => (
            <g key={i}>
              <path d={spines(c, -1, 5, 2.3, 0.12, 0.88)} fill={PAPER} stroke={INK} strokeWidth={0.5} strokeLinejoin="round" />
              <Drawn b={c} shade={hatch(c, 1, 1, 0.04, 0.96, 0.55)} extra={bands(c, 3, 0.06, 0.94)} />
            </g>
          ))}
          <path d={S.fin} fill={PAPER} stroke={INK} strokeWidth={0.6} strokeLinejoin="round" />
          <path d={S.finRays} stroke={INK} strokeWidth={0.3} />
          <path d={spines(S.tail, -1, 5, 1.8, 0.1, 0.75)} fill={PAPER} stroke={INK} strokeWidth={0.5} strokeLinejoin="round" />
          <Drawn b={S.tail} shade={hatch(S.tail, 1, 1, 0.04, 0.95, 0.55)} extra={bands(S.tail, 3, 0.06, 0.9)} />
          {/* The neck, its mane, the ear, the head */}
          <Drawn b={S.neck} shade={hatch(S.neck, -1, 1, 0.04, 0.9, 0.5)} extra={bands(S.neck, 3, 0.06, 0.8)} />
          {S.mane.map((m, i) => (
            <g key={i}>
              <path d={m.lock} fill={PAPER} stroke={INK} strokeWidth={0.55} strokeLinejoin="round" />
              <path d={m.line} fill="none" stroke={INK} strokeWidth={0.32} />
            </g>
          ))}
          <path d="M5 -39.8C8 -44.5 12 -47 16.5 -48.5C14.8 -45 12.4 -41.4 9.4 -38.6Z" fill={PAPER} stroke={INK} strokeWidth={0.6} strokeLinejoin="round" />
          <path d="M8 -40C10.5 -43 12.5 -45 14.6 -46.6" fill="none" stroke={INK} strokeWidth={0.35} />
          <path d={`${head}L16 -36.5Z`} fill={PAPER} />
          <path d="M-18.6 -32.6L-3 -29.6L-15 -25.6Z" fill={INK} fillOpacity={0.88} />
          <path d={S.upper + S.lower} fill={PAPER} stroke={INK} strokeWidth={0.3} strokeLinejoin="round" />
          {/* The barbed tongue */}
          <path d="M-7 -28.6C-13 -28.4 -19 -29.6 -23 -27.8C-25.4 -26.8 -26 -25 -25 -23.6" fill="none" stroke={RED} strokeWidth={0.95} strokeLinecap="round" />
          <path d="M-25 -23.6L-27.2 -24.2L-24.6 -21.2L-23.2 -24.8Z" fill={RED} stroke={INK} strokeWidth={0.3} strokeLinejoin="round" />
          <path d={head} fill="none" stroke={INK} strokeWidth={0.75} strokeLinejoin="round" />
          <path d={S.jaw} stroke={INK} strokeWidth={0.3} strokeLinecap="round" />
          <path d="M-3 -29.6C0 -30.2 3 -31.6 5 -34.4M-14 -35.4C-12.4 -34.6 -10.4 -34.4 -8.6 -34.8M-12 -33.6C-10 -32.8 -8 -32.6 -6 -33" fill="none" stroke={INK} strokeOpacity={0.7} strokeWidth={0.35} />
          <path d="M-16.8 -34.6q0.8 -0.9 1.6 -0.2" fill="none" stroke={INK} strokeWidth={0.5} />
          <ellipse cx={-1.6} cy={-35.4} rx={2.3} ry={1.8} fill={PAPER} stroke={INK} strokeWidth={0.6} />
          <circle cx={-2.2} cy={-35.3} r={1} fill={INK} />
          <circle cx={-2.5} cy={-35.7} r={0.3} fill={PAPER} />
          <path d="M-5.2 -37.4C-3 -39.4 1 -39.8 3.8 -38.2" fill="none" stroke={INK} strokeWidth={0.9} strokeLinecap="round" />
        </g>
        </g>
      </g>
      {on && <Splash key={n} at={[26, 34, 58, 96, 128, 152]} delay={0.9} />}
      {/* The water it breaks */}
      <path d={[S.neck, ...S.coils, S.tail].map(b => breaks(b)).join('') + water(-6, 170, 7)} fill="none" stroke={INK} strokeOpacity={0.6} strokeWidth={0.4} strokeLinecap="round" />
    </>
  )
}

// ── The whale, after Ortelius: a toothed, open-mouthed monster spouting from
// twin blowholes, scaled along its back, its split fluke raised behind ──
const WHALE = (() => {
  const back = body([[8, -20.6], [20, -21.6], [36, -19], [44, -8.4]], () => 0, 30)
  // Scales in rows under the back, each row offset from the last
  const scales = [1.4, 2.9, 4.4].map((depth, row) => back.pts.filter((_, i) => i % 2 === row % 2 && i > 3 + row && i < back.pts.length - 3).map(p => {
    const k = back.pts.indexOf(p), n = back.nrm[k]
    const c = add(p, n, depth)
    return `M${pt(add(c, back.tan[k], -0.9))}Q${pt(add(c, n, 1.2))} ${pt(add(c, back.tan[k], 0.9))}`
  }).join('')).join('')
  const ridge = spines(back, -1, 3, 1.9, 0.42, 0.86)
  const upper = [0.4, 2.6, 4.8, 7, 9.2].map((x, i) => {
    const y = -8.8 + (x / 13) * 2.6, len = i === 0 ? 2.8 : i === 1 ? 1.4 : 1.8 - (i % 2) * 0.5
    return `M${r2(x - 0.6)} ${r2(y - 0.1)}L${r2(x)} ${r2(y + len)}L${r2(x + 0.6)} ${r2(y + 0.1)}Z`
  }).join('')
  const lower = [2.2, 4.4, 6.6, 8.8].map((x, i) => {
    const y = -3.4 - ((x - 1) / 11) * 2.8, len = i === 0 ? 2.6 : 1.4
    return `M${r2(x - 0.55)} ${r2(y + 0.1)}L${r2(x)} ${r2(y - len)}L${r2(x + 0.55)} ${r2(y - 0.1)}Z`
  }).join('')
  return { scales, ridge, upper, lower }
})()

function Whale({ id, n, on }: Poked) {
  const shape = 'M-1 -9C-1.8 -12.6 -1 -17.6 3.4 -19.8C8 -22 17 -21.8 25 -20.6C33.6 -19.2 40 -14.4 44 -8.4C45.8 -5.6 46.8 -2.4 47.4 1.5L4.5 1.5C2.5 0 0.6 -1.6 1 -3.2L12 -6.2Z'
  const fluke = 'M51.5 1C52 -4 53.5 -8 55 -10.5C52.5 -13.5 50 -17 50.5 -20.5C53.5 -18.2 56.5 -15.8 58.5 -13.6C59.8 -16.6 63 -19.6 67 -20.4C65.6 -16.4 62.6 -12.6 59.4 -9.8C58.4 -6.4 57.8 -3 57.8 1Z'
  return (
    <>
      <Defs id={id} />
      <clipPath id={`${id}b`}><path d={shape} /></clipPath>
      <clipPath id={`${id}f`}><path d={fluke} /></clipPath>
      <g clipPath={`url(#${id}w)`}>
        <g className="cq-sea-bob cq-sea-slow">
          {/* Its tail: tapped, it rises and slaps the water */}
          <g key={n} className={on ? 'cq-sea-slap' : undefined}>
            <path d={fluke} fill={PAPER} />
            <path d="M57 -16V2H70V-24Z" fill={`url(#${id}h)`} clipPath={`url(#${id}f)`} />
            <path d={fluke} fill="none" stroke={INK} strokeWidth={0.7} strokeLinejoin="round" />
            <path d="M55 0C55.5 -4 56.4 -8 57.2 -11.6M53 -17.6C54.6 -16.4 55.8 -15.2 57 -13.8M63.4 -18C61.6 -16.6 60.2 -15 59 -13.2" fill="none" stroke={INK} strokeWidth={0.35} />
          </g>
          {/* The spouts from its twin blowholes: tapped, a great blow */}
          <g key={`s${n}`} className={on ? 'cq-sea-blow' : 'cq-sea-spout'}>
            <path d="M20.4 -21C19 -28 14 -32.5 9.4 -31.6M21 -21C20 -27.6 15.6 -31.6 10.6 -30.6M21.6 -21C21 -27 17 -30.6 12 -29.8M23.2 -21C24.6 -28 29.8 -32.4 34.6 -31.2M22.6 -21C23.8 -27.6 28.6 -31.4 33.4 -30.4M22 -21C23 -27 27.2 -30.4 32 -29.8" fill="none" stroke={INK} strokeWidth={0.38} strokeLinecap="round" />
            {[[8, -29.8], [9.6, -28], [6.6, -31.6], [7.4, -27.4], [36, -29.4], [34.4, -27.6], [37.4, -31.2], [36.8, -27]].map(([x, y], i) => (
              <path key={i} d={`M${x} ${y - 0.9}q0.55 0.7 0 1.1q-0.55 -0.4 0 -1.1Z`} fill={INK} />
            ))}
          </g>
          <path d={shape} fill={PAPER} />
          <path d="M0 -5.4C12 -8.4 28 -9.4 47 -4.6V2H0Z" fill={`url(#${id}h)`} clipPath={`url(#${id}b)`} />
          <path d="M2 -2.4C14 -4 30 -4.4 47 -1V2H2Z" fill={`url(#${id}x)`} clipPath={`url(#${id}b)`} />
          <path d="M-1 -9L12 -6.2L1 -3.2Z" fill={INK} fillOpacity={0.88} />
          <path d={WHALE.upper + WHALE.lower} fill={PAPER} stroke={INK} strokeWidth={0.3} strokeLinejoin="round" />
          <path d={WHALE.ridge} fill={PAPER} stroke={INK} strokeWidth={0.45} strokeLinejoin="round" />
          <path d={shape} fill="none" stroke={INK} strokeWidth={0.75} strokeLinejoin="round" />
          <path d={WHALE.scales} fill="none" stroke={INK} strokeOpacity={0.7} strokeWidth={0.32} />
          {/* The bulging brow over its eye, and the folds of its snout */}
          <path d="M11.2 -15.2C13.2 -18.4 18.4 -18.6 20.6 -15C19 -15.8 17 -16 15.4 -15.6C14 -15.8 12.6 -15.6 11.2 -15.2Z" fill={PAPER} stroke={INK} strokeWidth={0.5} strokeLinejoin="round" />
          <path d="M1 -15.6C2.4 -14.4 3.4 -12.8 3.6 -10.8M3.6 -18.2C5.4 -16.8 6.6 -14.6 6.8 -12.4" fill="none" stroke={INK} strokeOpacity={0.6} strokeWidth={0.32} />
          {/* Its eye, bulging, and the pleats of its throat */}
          <path d="M12 -9.4C14 -8.4 16.4 -8.6 18 -9.8M12.6 -8C14.4 -7.2 16.2 -7.4 17.4 -8.2" fill="none" stroke={INK} strokeOpacity={0.7} strokeWidth={0.35} />
          <circle cx={15.6} cy={-12.6} r={2.1} fill={PAPER} stroke={INK} strokeWidth={0.6} />
          <circle cx={15} cy={-12.6} r={1.05} fill={INK} />
          <circle cx={14.7} cy={-13} r={0.3} fill={PAPER} />
          <path d="M3.4 -1.6C9 -2.6 15 -2 21 0.4M6 -0.4C11 -1 16 -0.4 20 1.2M14 -5C17 -4.4 20 -3.2 22.4 -1.4" fill="none" stroke={INK} strokeOpacity={0.7} strokeWidth={0.35} />
          {/* Its fin */}
          <path d="M24 -5C27 -5.6 31 -3.6 33.6 0.6L26.6 0.6C26 -1.6 25 -3 24 -5Z" fill={PAPER} stroke={INK} strokeWidth={0.55} strokeLinejoin="round" />
          <path d="M25 -4.2L28 0.6M26.6 -4.4L30.4 0.6M28.6 -3.8L32.4 0.6" stroke={INK} strokeWidth={0.28} />
        </g>
      </g>
      {on && <Splash key={n} at={[52, 56, 60, 64]} delay={0.8} />}
      <path d={curl(4.2, -1) + curl(47.8, 1, 0.8) + curl(51.2, -1, 0.7) + curl(58.2, 1, 0.8) + water(-4, 64, 3)} fill="none" stroke={INK} strokeOpacity={0.6} strokeWidth={0.4} strokeLinecap="round" />
    </>
  )
}

// ── The kraken, after de Montfort: a mottled mantle with slitted eyes under
// heavy lids, its arms tapering out of the water, suckers on their undersides ──
const KRAKEN = (() => {
  const taper = (a: number, b: number) => (t: number) => a - t * (a - b)
  const arms: { b: Body; side: number; delay: number }[] = [
    { b: body([[12, 3], [10, -10], [3, -18], [5, -27], [6, -33], [13, -33.5], [12, -27.5]], taper(3.2, 0.35), 18), side: 1, delay: 0 },
    { b: body([[22, 3], [23, -7], [17, -12], [19, -20], [20, -24.5], [25.5, -24], [24, -20.5]], taper(2.3, 0.3), 16), side: 1, delay: 1.4 },
    { b: body([[59, 3], [62, -12], [55, -25], [61, -36], [64.5, -42], [72, -39], [68.5, -33.5]], taper(3.3, 0.35), 18), side: 1, delay: 0.7 },
    { b: body([[72, 3], [70, -7], [77, -13], [76, -21], [75.5, -26], [69.5, -25.5], [71, -21]], taper(2.3, 0.3), 16), side: -1, delay: 2.1 },
    { b: body([[82, 3], [81, -14], [95, -14], [94, 3]], taper(2, 1.3), 24), side: 1, delay: 1 },
  ]
  return arms.map(({ b, side, delay }) => ({
    b, delay,
    suckers: span(b, 0.12, 0.9, 2).filter(i => b.w[i] > 0.6).map(i => [...edge(b, i, side, 0.42), b.w[i] * 0.36] as [number, number, number]),
    shade: hatch(b, -side, 1, 0.04, 0.85, 0.5),
  }))
})()

function Kraken({ id, n, on }: Poked) {
  const mantle = 'M24.6 1.5C26 -3.6 27.6 -8 27.2 -13C26.4 -20 25.4 -29.6 30.4 -36C35 -42.4 45.6 -42.6 50.2 -36.2C55 -29.4 54 -20 53 -13C52.6 -8 54.2 -3.6 55.6 1.5Z'
  return (
    <>
      <Defs id={id} />
      <clipPath id={`${id}m`}><path d={mantle} /></clipPath>
      <g clipPath={`url(#${id}w)`}>
        {KRAKEN.map((a, i) => (
          <g key={i} className={on ? 'cq-sea-thrash' : 'cq-sea-sway'} style={{ animationDelay: `${on ? i * 0.07 : a.delay}s` }}>
            <Drawn b={a.b} shade={a.shade} width={0.6} />
            {a.suckers.map(([x, y, r], k) => <circle key={k} cx={r2(x)} cy={r2(y)} r={r2(r)} fill={PAPER} stroke={INK} strokeWidth={0.28} />)}
          </g>
        ))}
        <g key={n} className={on ? 'cq-sea-duck' : undefined}>
        <g className="cq-sea-bob cq-sea-slow">
          <path d={mantle} fill={PAPER} />
          <path d="M41.6 -43C50.6 -32 48.6 -14 44.6 2H62V-44Z" fill={`url(#${id}h)`} clipPath={`url(#${id}m)`} />
          <path d="M47.6 -41C54.6 -30 53 -12 50.6 2H62V-44Z" fill={`url(#${id}x)`} clipPath={`url(#${id}m)`} />
          <path d="M20 -3.6Q40 -0.6 60 -3.6V3H20Z" fill={`url(#${id}h)`} clipPath={`url(#${id}m)`} />
          {/* Its folds and wrinkles, and contour lines down its lit side */}
          <path d="M28.2 -17.4Q40 -14.8 52.2 -17.4M27.6 -5.6Q34 -4.4 38 -6M42 -6Q46 -4.4 52.4 -5.6M30.6 -30C31.6 -34 34.4 -37.4 38 -38.4M28.4 -22C28.4 -25.6 29 -28.4 30.2 -30.6M33 -26.6C33.6 -30.4 35.4 -33.4 38.4 -35" fill="none" stroke={INK} strokeOpacity={0.55} strokeWidth={0.35} />
          <path d={mantle} fill="none" stroke={INK} strokeWidth={0.75} strokeLinejoin="round" />
          {[[37, -30.4, 1.3, 0.8, 1], [42.6, -34, 0.9, 0.6, 0], [46.6, -27.4, 1.4, 0.9, 1], [35, -23.4, 0.8, 0.6, 0], [40.8, -25.2, 0.7, 0.5, 1], [44.6, -21, 0.9, 0.6, 0], [49.6, -21.4, 0.7, 0.5, 1]].map(([x, y, rx, ry, dark], i) => (
            <ellipse key={i} cx={x} cy={y} rx={rx} ry={ry} fill={dark ? INK : 'none'} fillOpacity={0.35} stroke={INK} strokeOpacity={0.65} strokeWidth={0.35} transform={`rotate(${(i * 37) % 60 - 30} ${x} ${y})`} />
          ))}
          {[34.4, 45.6].map(x => (
            <g key={x}>
              <ellipse cx={x} cy={-11} rx={2.8} ry={1.9} fill={PAPER} stroke={INK} strokeWidth={0.6} />
              <ellipse cx={x} cy={-11} rx={1.5} ry={0.5} fill={INK} />
              {/* A heavy lid, angled down toward the middle: it glowers */}
              <path d={x < 40 ? `M${x - 3.4} -13.6Q${x - 0.6} -14.4 ${x + 3.2} -11.4Q${x} -12.4 ${x - 3.2} -12.2Z` : `M${x + 3.4} -13.6Q${x + 0.6} -14.4 ${x - 3.2} -11.4Q${x} -12.4 ${x + 3.2} -12.2Z`} fill={INK} stroke={INK} strokeWidth={0.4} strokeLinejoin="round" />
              <path d={`M${x - 2.2} -8.2Q${x} -7 ${x + 2.2} -8.2M${x - 1.6} -6.6Q${x} -5.8 ${x + 1.6} -6.6`} fill="none" stroke={INK} strokeOpacity={0.6} strokeWidth={0.35} />
            </g>
          ))}
        </g>
        </g>
      </g>
      {/* Its ink, spreading on the water */}
      {on && (
        <g key={n} className="cq-sea-ink">
          {[[40, 1.4, 15, 2.6], [27, 2.2, 8, 1.8], [54, 2, 9, 1.6], [40, -0.6, 7, 2.6], [33, 3.2, 6, 1.2], [48, 3.4, 7, 1.2]].map(([x, y, rx, ry], i) => (
            <ellipse key={i} cx={x} cy={y} rx={rx} ry={ry} fill={INK} fillOpacity={0.72} />
          ))}
        </g>
      )}
      <path d={[...KRAKEN.map(a => breaks(a.b, 0.8)), curl(24.2, -1), curl(56, 1)].join('') + curl(94 - 2, -1, 0.6) + water(0, 98, 11)} fill="none" stroke={INK} strokeOpacity={0.6} strokeWidth={0.4} strokeLinecap="round" />
    </>
  )
}

// ── A galleon under full sail, as the chart-makers drew them: a high stern
// castle, gunports, billowing square sails shaded on their lee, a lateen on
// the mizzen, pennants streaming ──
function sail(cx: number, top: number, w: number, h: number, bulge: number) {
  const x0 = cx - w / 2, x1 = cx + w / 2, bot = top + h
  const shape = `M${x0} ${top}L${x1} ${top}C${x1 + 0.6} ${top + h * 0.4} ${x1 + 0.4} ${top + h * 0.8} ${x1 - 0.4} ${bot}Q${cx} ${bot + bulge} ${x0 + 0.4} ${bot}C${x0 - 0.4} ${top + h * 0.8} ${x0 - 0.6} ${top + h * 0.4} ${x0} ${top}Z`
  const shade = [0.7, 1.3, 1.9, 2.5].filter(k => k < w * 0.45).map(k => `M${r2(x1 - k)} ${r2(top + 0.5)}Q${r2(x1 - k + 0.5)} ${r2(top + h * 0.5)} ${r2(x1 - k - 0.2)} ${r2(bot + bulge * (k / w) * 1.6 - 0.3)}`).join('')
    + `M${r2(x0 + 0.9)} ${r2(bot - 0.5)}Q${r2(cx)} ${r2(bot + bulge - 0.9)} ${r2(x1 - 0.9)} ${r2(bot - 0.5)}`
  return { shape, shade, yard: `M${r2(x0 - 0.8)} ${top}H${r2(x1 + 0.8)}` }
}
/** Its gunports, bow to stern */
const PORTS = [10, 13.6, 17.2, 20.8, 24.4, 28, 31.6]
const SAILS = [sail(9.4, -23, 8.4, 7.6, 1.6), sail(9.4, -30.4, 6.4, 5.6, 1.2), sail(19, -27, 10.4, 9, 1.8), sail(19, -35.6, 7.8, 6.6, 1.4), sail(19, -40.2, 4.6, 3.6, 0.8), sail(-4.4, -13.8, 4.8, 3.6, 0.9)]

function Galleon({ id, n, on }: Poked) {
  const hull = 'M2.2 -8.2C6 -7.2 11 -6.4 17 -6.4L25.6 -6.4L25.6 -9L30.4 -9L30.4 -11.2L36.4 -12.6C37.4 -8.6 36.6 -4 33.4 1.2L6.6 1.2C3.6 -1.6 2 -4.8 2.2 -8.2Z'
  return (
    <>
      <Defs id={id} />
      <clipPath id={`${id}k`}><path d={hull} /></clipPath>
      <g clipPath={`url(#${id}w)`}>
        {/* Tapped: it heels from the recoil, and rights itself */}
        <g key={n} className={on ? 'cq-sea-recoil' : undefined}>
        <g className="cq-sea-rock">
          {/* Rigging, masts and bowsprit, behind the sails */}
          <path d="M19 -41L-6 -14.6M9.4 -32L-8.2 -16M19 -41L28.4 -30M28.4 -30L36.4 -12.6M19 -41L35.8 -12.8M9.4 -32L2.6 -9M19 -41L13 -7" stroke={INK} strokeOpacity={0.6} strokeWidth={0.25} />
          <path d="M9.4 -7.6V-32.4M19 -6.4V-42M28.4 -9V-30.6M2.6 -8.6L-8.6 -16.2" stroke={INK} strokeWidth={0.8} strokeLinecap="round" />
          {/* The sails, flapping from their yards, each in its own time */}
          {SAILS.map((s, i) => (
            <g key={i}>
              <g className="cq-sail-flap" style={{ animationDelay: `${-i * 0.37}s`, animationDuration: `${1.4 + (i % 3) * 0.25}s` }}>
                <path d={s.shape} fill={PAPER} stroke={INK} strokeWidth={0.55} strokeLinejoin="round" />
                <path d={s.shade} fill="none" stroke={INK} strokeWidth={0.3} />
              </g>
              <path d={s.yard} stroke={INK} strokeWidth={0.65} strokeLinecap="round" />
            </g>
          ))}
          {/* The lateen on the mizzen */}
          <g className="cq-sail-flap cq-sail-lateen" style={{ animationDelay: '-0.8s' }}>
            <path d="M24.4 -13.2L32.6 -30.6Q30.8 -20.4 28.6 -12.6Z" fill={PAPER} stroke={INK} strokeWidth={0.55} strokeLinejoin="round" />
            <path d="M31.4 -26.6Q29.6 -19.6 28 -13M30.2 -22.6Q28.8 -18 27.2 -13" fill="none" stroke={INK} strokeWidth={0.3} />
          </g>
          <path d="M24 -12.4L33 -31.4" stroke={INK} strokeWidth={0.6} strokeLinecap="round" />
          {/* Fighting tops */}
          <path d="M7.8 -24h3.2l-0.5 1.1h-2.2zM17.4 -28.2h3.2l-0.5 1.1h-2.2z" fill={PAPER} stroke={INK} strokeWidth={0.4} />
          {/* Pennants streaming, and the ensign */}
          {[
            'M19 -41.8C15 -44.6 11 -41.6 6.2 -44.2L7.8 -42.6L6 -42C10.8 -40.4 15 -42.6 19 -40.6Z',
            'M9.4 -32.2C6.4 -34.2 3.4 -32.2 0 -33.8L1.4 -32.6L0 -32C3.8 -31 6.6 -32.8 9.4 -31.2Z',
            'M28.4 -30.4C26.6 -31.8 24.6 -30.4 22.6 -31.6L23.4 -30.2C25.4 -29.6 27 -30.6 28.4 -29.6Z',
          ].map((d, i) => <path key={i} className="cq-pennant" style={{ animationDelay: `${-i * 0.3}s` }} d={d} fill={RED} stroke={INK} strokeWidth={0.3} strokeLinejoin="round" />)}
          <path d="M36.4 -12.6L38.6 -19.4" stroke={INK} strokeWidth={0.5} />
          <path className="cq-pennant" style={{ animationDelay: '-0.5s', animationDuration: '1.2s' }} d="M38.6 -19.4C36.6 -20.8 34.4 -19.2 32.6 -20.4L33.2 -16.8C35 -16 36.8 -17.2 38.2 -16.2Z" fill={RED} stroke={INK} strokeWidth={0.3} strokeLinejoin="round" />
          {/* The hull: forecastle, beakhead, wales, gunports, shaded below */}
          <path d="M2.4 -8L-3.4 -9.2L-2.6 -8L2.6 -5.8Z" fill={PAPER} stroke={INK} strokeWidth={0.5} strokeLinejoin="round" />
          <path d="M2.2 -8.2L2.8 -10.4L8.6 -10L8.6 -7.3C6 -7.4 4 -7.8 2.2 -8.2Z" fill={PAPER} stroke={INK} strokeWidth={0.55} strokeLinejoin="round" />
          <path d={hull} fill={PAPER} />
          <path d="M2 -2.6C12 -1.6 22 -1.4 37 -3.4V2H2Z" fill={`url(#${id}h)`} clipPath={`url(#${id}k)`} />
          <path d={hull} fill="none" stroke={INK} strokeWidth={0.7} strokeLinejoin="round" />
          <path d="M3 -5.2C10 -4 20 -3.8 36.8 -6.8M4.2 -2.6C12 -1.6 22 -1.4 35.6 -3.2M8.6 -7.6H25.6" fill="none" stroke={INK} strokeWidth={0.45} />
          {PORTS.map(x => <rect key={x} x={x} y={-4.7 + (x - 10) * -0.03} width={1.1} height={1} fill={INK} />)}
          <path d="M32.4 -10.6h2.8v1.8h-2.8zM33.8 -10.6v1.8" fill="none" stroke={INK} strokeWidth={0.3} />
          {/* A broadside: each gun in turn, bow to stern, a flash and a puff of smoke */}
          {on && (
            <g key={n}>
              {PORTS.map((x, i) => {
                const cx = x + 0.55, cy = -4.2 + (x - 10) * -0.03, delay = { animationDelay: `${i * 0.11}s` }
                return (
                  <g key={x}>
                    <g className="cq-sea-smoke" style={delay}>
                      <circle cx={cx + 0.6} cy={cy + 0.4} r={2} fill={PAPER} stroke={INK} strokeWidth={0.3} />
                      <circle cx={cx - 1.6} cy={cy - 0.8} r={1.8} fill={PAPER} stroke={INK} strokeWidth={0.3} />
                      <circle cx={cx + 1.4} cy={cy - 1.6} r={1.5} fill={PAPER} stroke={INK} strokeWidth={0.3} />
                      <circle cx={cx - 0.4} cy={cy - 2.4} r={1.3} fill={PAPER} stroke={INK} strokeWidth={0.3} />
                    </g>
                    <path className="cq-sea-flash" style={delay} fill="#f0a23a" stroke={INK} strokeWidth={0.2} strokeLinejoin="round"
                      d={`M${r2(cx)} ${r2(cy - 2.8)}L${r2(cx + 0.9)} ${r2(cy - 0.9)}L${r2(cx + 3)} ${r2(cy)}L${r2(cx + 0.9)} ${r2(cy + 0.9)}L${r2(cx)} ${r2(cy + 2.8)}L${r2(cx - 0.9)} ${r2(cy + 0.9)}L${r2(cx - 3)} ${r2(cy)}L${r2(cx - 0.9)} ${r2(cy - 0.9)}Z`} />
                  </g>
                )
              })}
            </g>
          )}
        </g>
        </g>
      </g>
      <path d={curl(2.4, -1) + curl(-3.6, -1, 0.6) + curl(33.8, 1) + curl(39.4, 1, 0.6) + water(-8, 42, 5)} fill="none" stroke={INK} strokeOpacity={0.6} strokeWidth={0.4} strokeLinecap="round" />
    </>
  )
}

/**
 * Where each creature sits on the map: its box (map units), its drawing's place
 * and scale in it, the box (in the drawing) that takes a tap on it, and how
 * long a poke plays
 */
const PLACES = [
  { key: 'serpent', box: [144, 532, 238, 74], at: [180, 599], scale: 1.15, hit: [-32, -54, 206, 58], ms: 3500, draw: Serpent },
  { key: 'kraken', box: [866, 414, 122, 64], at: [870, 474], scale: 1.2, hit: [-4, -46, 106, 50], ms: 3100, draw: Kraken },
  { key: 'whale', box: [846, 562, 84, 42], at: [852, 600], scale: 1.15, hit: [-6, -36, 78, 40], ms: 2600, draw: Whale },
  { key: 'galleon', box: [30, 432, 64, 64], at: [44, 492], scale: 1.25, hit: [-14, -50, 60, 54], ms: 2600, draw: Galleon },
] as const

/** Each its own layer (will-change), so its moving never has the map under it redrawn */
function Creature({ place, id, at }: { place: (typeof PLACES)[number]; id: string; at: (x: number, y: number, w: number, h: number) => CSSProperties }) {
  const { ref, n, on } = usePoke<SVGGElement>(place.ms)
  const { box: [x, y, w, h], at: [tx, ty], scale, hit: [hx, hy, hw, hh], draw: Draw } = place
  return (
    <svg viewBox={`${x} ${y} ${w} ${h}`} style={{ ...at(x, y, w, h), pointerEvents: 'none', willChange: 'transform' }} overflow="visible" aria-hidden>
      <g ref={ref} data-poke={place.key} transform={`translate(${tx} ${ty}) scale(${scale})`} style={{ pointerEvents: 'auto', cursor: 'pointer' }}>
        <rect x={hx} y={hy} width={hw} height={hh} fill="none" pointerEvents="all" />
        <Draw id={id} n={n} on={on} />
      </g>
    </svg>
  )
}

export function SeaCreatures({ at }: { at: (x: number, y: number, w: number, h: number) => CSSProperties }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  return <>{PLACES.map((p): ReactNode => <Creature key={p.key} place={p} id={`cq${uid}${p.key}`} at={at} />)}</>
}
