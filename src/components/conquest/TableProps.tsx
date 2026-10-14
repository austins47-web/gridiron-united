import { useId, useMemo, type CSSProperties, type ReactNode } from 'react'
import { usePoke } from './poke'

/**
 * What's left on the war room's table, around the edges of the map: the ops
 * room's colour-change clock (keeping the real time), a cigar smouldering in
 * its ashtray, a cup of coffee going cold, the telephone, a pair of brass
 * dividers. Each its own layer, so its moving never has the map redrawn.
 *
 * Tap one and it does something: the clock's hands whirl round, the cigar blows
 * a smoke ring, the coffee ripples, the telephone rings, the dividers step out a
 * measure. All in map units.
 */

/** A poke's state, passed to a prop: `n` restarts its animation, `on` while it plays */
interface Poked { n: number; on: boolean; id: string }
const BRASS = '#c19a3d', BRASS_DARK = '#5c4a1c', SMOKE = '#ece8df'
const r2 = (n: number) => Math.round(n * 100) / 100
const polar = (deg: number, r: number): [number, number] => [r2(Math.sin((deg * Math.PI) / 180) * r), r2(-Math.cos((deg * Math.PI) / 180) * r)]

// ── The ops room's clock: every five minutes a red, a yellow or a blue
// triangle, so the plotters could tell at a glance how old a plot was ──
function Clock({ n, on }: Poked) {
  // Where its hands stand now: they keep the time by CSS from here (and stay put with the motion off)
  const at = useMemo(() => {
    const d = new Date()
    const s = d.getSeconds(), m = d.getMinutes() * 60 + s, h = (d.getHours() % 12) * 3600 + m
    return { s, m, h }
  }, [])
  const hand = (cls: string, secs: number, of: number, body: ReactNode) => (
    <g className={cls} style={{ transform: `rotate(${(secs / of) * 360}deg)`, animationDelay: `${-secs}s` }}>
      {/* Unseen, so the hand turns about the clock's middle */}
      <circle r={31} fill="none" />
      {body}
    </g>
  )
  return (
    <>
      <circle cx={2.5} cy={3.5} r={40} fill="#000" opacity={0.3} />
      <circle r={40} fill="#2a1d12" stroke={BRASS} strokeWidth={1.4} />
      <circle r={36.6} fill="none" stroke={BRASS} strokeWidth={0.8} />
      <circle r={35} fill="#f3ecd8" />
      {Array.from({ length: 12 }, (_, k) => {
        const [ax, ay] = polar(k * 30 + 15, 7), [bx, by] = polar(k * 30 + 1.2, 27.4), [cx, cy] = polar(k * 30 + 28.8, 27.4)
        return <path key={k} d={`M${ax} ${ay}L${bx} ${by}L${cx} ${cy}Z`} fill={['#c0392b', '#e2b42b', '#2b5ca8'][k % 3]} opacity={0.92} />
      })}
      <circle r={27.6} fill="none" stroke="#1e1a12" strokeWidth={0.5} />
      {Array.from({ length: 60 }, (_, k) => {
        const [ax, ay] = polar(k * 6, k % 5 ? 33.6 : 32.4), [bx, by] = polar(k * 6, 34.8)
        return <path key={k} d={`M${ax} ${ay}L${bx} ${by}`} stroke="#1e1a12" strokeWidth={k % 5 ? 0.35 : 0.8} />
      })}
      {Array.from({ length: 12 }, (_, k) => {
        const [x, y] = polar((k + 1) * 30, 30.2)
        return <text key={k} x={x} y={y + 1.6} textAnchor="middle" fontFamily="'Courier New', monospace" fontWeight={700} fontSize={4.4} fill="#1e1a12">{k + 1}</text>
      })}
      {/* The hands: tapped, they whirl round twice and settle back on the time */}
      <g key={n} className={on ? 'cq-prop-whirl' : undefined}>
        <circle r={31} fill="none" />
        {hand('cq-clock-h', at.h, 43200, <path d="M-1.7 4L-1.1 -14.5L0 -18L1.1 -14.5L1.7 4Z" fill="#141210" />)}
        {hand('cq-clock-m', at.m, 3600, <path d="M-1.2 5L-0.7 -25.5L0 -29L0.7 -25.5L1.2 5Z" fill="#141210" />)}
        {hand('cq-clock-s', at.s, 60, <><path d="M0 7V-30" stroke="#b3201c" strokeWidth={0.6} /><circle cy={5} r={1.4} fill="#b3201c" /></>)}
      </g>
      <circle r={2.3} fill={BRASS} stroke={BRASS_DARK} strokeWidth={0.4} />
    </>
  )
}

// ── A cigar resting in a glass ashtray, smoke curling off its ash ──
function Ashtray({ n, on, id }: Poked) {
  const u: [number, number] = [0.77, -0.64], v: [number, number] = [0.64, 0.77]
  const at = (r: number, s = 0): string => `${r2(u[0] * r + v[0] * s)} ${r2(u[1] * r + v[1] * s)}`
  const band = (a: number, b: number, w: number) => `M${at(a, -w)}L${at(b, -w)}L${at(b, w)}L${at(a, w)}Z`
  const ember = at(9.5)
  return (
    <>
      <defs>
        <radialGradient id={`${id}glow`}><stop offset="0" stopColor="#ffb35a" stopOpacity={0.9} /><stop offset="1" stopColor="#e2632b" stopOpacity={0} /></radialGradient>
      </defs>
      <circle cx={2.5} cy={3} r={20} fill="#000" opacity={0.28} />
      <circle r={19} fill="#9fb0a8" stroke="#5c6b64" strokeWidth={1} />
      <path d="M-14 -9A17 17 0 0 1 4 -16.5" fill="none" stroke="#fff" strokeOpacity={0.45} strokeWidth={1.2} strokeLinecap="round" />
      {[-40, 80, 200].map(a => { const [x, y] = polar(a + 90, 17); return <rect key={a} x={x - 2.4} y={y - 1.6} width={4.8} height={3.2} rx={1} fill="#6f7f78" transform={`rotate(${a + 90} ${x} ${y})`} /> })}
      <circle r={12.6} fill="#6f7f78" stroke="#56645e" strokeWidth={0.6} />
      {[[-4, 3, 2.4], [-1, 6, 1.8], [3, 4, 2], [-6, -1, 1.4], [5, 0, 1.2]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={i % 2 ? '#a9a59c' : '#c9c4b9'} />)}
      {/* The cigar: ash at the lit end, the glowing ring, the leaf, its band, its head */}
      <path d={band(3, 46, 2.7)} transform="translate(1.6 2)" fill="#000" opacity={0.25} />
      <path d={band(3, 9, 2.5)} fill="#cfcac0" stroke="#8d887e" strokeWidth={0.4} />
      <path d={`M${at(4.5, -2.4)}L${at(4.5, 2.4)}M${at(6.5, -2.5)}L${at(6.5, 2.5)}`} stroke="#8d887e" strokeWidth={0.35} />
      <path d={`${band(10.4, 46, 2.7)}`} fill="#6b4423" stroke="#3a2412" strokeWidth={0.5} />
      <path d={`M${at(46, -2.7)}Q${at(49.5, 0)} ${at(46, 2.7)}`} fill="#6b4423" stroke="#3a2412" strokeWidth={0.5} />
      <path d={`M${at(11, 1.2)}L${at(46, 1.2)}`} stroke="#3a2412" strokeOpacity={0.5} strokeWidth={0.9} />
      <path d={`M${at(11, -1.4)}L${at(45, -1.4)}`} stroke="#a0703f" strokeOpacity={0.6} strokeWidth={0.5} />
      <path d={band(38, 41.5, 2.85)} fill="#a3262a" stroke="#d9b24a" strokeWidth={0.5} />
      <path d={band(9, 10.4, 2.6)} fill="#e2632b" />
      <circle cx={Number(ember.split(' ')[0])} cy={Number(ember.split(' ')[1])} r={5} fill={`url(#${id}glow)`} className="cq-prop-ember" />
      {/* Its smoke, curling off and thinning out */}
      <g transform={`translate(${ember})`}>
        {[0, 1.6, 3.2].map(d => (
          <path key={d} className="cq-prop-smoke" style={{ animationDelay: `${-d}s` }} d="M0 0c-3 -3 2.5 -6 -0.5 -9.5c-3 -3.5 2 -6.5 -1 -10" fill="none" stroke={SMOKE} strokeWidth={2} strokeLinecap="round" opacity={0} />
        ))}
        {/* Tapped: a smoke ring */}
        {on && <circle key={n} className="cq-prop-ring" r={3} fill="none" stroke={SMOKE} strokeWidth={1.6} />}
      </g>
    </>
  )
}

// ── A cup of coffee on its saucer, the spoon beside it ──
function Coffee({ n, on }: Poked) {
  return (
    <>
      <circle cx={3} cy={4} r={29} fill="#000" opacity={0.26} />
      <circle r={28} fill="#efe9da" stroke="#b9b09a" strokeWidth={0.8} />
      <circle r={26} fill="none" stroke="#4a6fa5" strokeOpacity={0.7} strokeWidth={0.6} />
      <circle r={21} fill="none" stroke="#cfc6ae" strokeWidth={0.6} />
      <g transform="rotate(38 -14 14)">
        <path d="M-12 14H4" stroke="#8a8e93" strokeWidth={2.2} strokeLinecap="round" />
        <path d="M-12 14H4" stroke="#d3d6da" strokeWidth={1.2} strokeLinecap="round" />
        <ellipse cx={-16} cy={14} rx={4} ry={2.6} fill="#d3d6da" stroke="#8a8e93" strokeWidth={0.6} />
      </g>
      <g key={n} className={on ? 'cq-prop-jiggle' : undefined}>
        <circle cx={1.5} cy={2} r={17.5} fill="#000" opacity={0.16} />
        <ellipse cx={20.5} cy={0} rx={5.4} ry={4.2} fill="none" stroke="#b9b09a" strokeWidth={3.6} />
        <ellipse cx={20.5} cy={0} rx={5.4} ry={4.2} fill="none" stroke="#f7f3ea" strokeWidth={2.2} />
        <circle r={17} fill="#f7f3ea" stroke="#b9b09a" strokeWidth={0.8} />
        <circle r={15.6} fill="none" stroke="#4a6fa5" strokeOpacity={0.75} strokeWidth={0.6} />
        <circle r={14} fill="#3e2412" />
        <circle r={13.1} fill="none" stroke="#6e4224" strokeOpacity={0.85} strokeWidth={1} />
        <path d="M-9 -6A11 11 0 0 1 -2 -10.6" fill="none" stroke="#fff" strokeOpacity={0.4} strokeWidth={0.9} strokeLinecap="round" />
        {/* Tapped: it ripples */}
        {on && [0, 0.35].map(d => <circle key={`${n}-${d}`} className="cq-prop-ripple" style={{ animationDelay: `${d}s` }} r={2} fill="none" stroke="#a0683c" strokeWidth={0.5} />)}
      </g>
      {/* Steam, rising off it */}
      {[0, 2.5].map(d => (
        <path key={d} className="cq-prop-steam" style={{ animationDelay: `${-d}s` }} d="M-3 -2c-3 -4 3 -7 0 -11c-3 -4 2 -7 -1 -11" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" opacity={0} />
      ))}
    </>
  )
}

// ── The telephone: black Bakelite, its handset in the cradle, its cord coiled ──
function Telephone({ n, on }: Poked) {
  // The coiled cord: little loops along a curve from the base to the handset
  const cord = useMemo(() => {
    const pts: string[] = []
    for (let i = 0; i <= 90; i++) {
      const t = i / 90, s = 1 - t
      const x = s * s * s * 1 + 3 * s * s * t * -12 + 3 * s * t * t * -12 + t * t * t * 5
      const y = s * s * s * 32 + 3 * s * s * t * 30 + 3 * s * t * t * 8 + t * t * t * 6
      const a = t * Math.PI * 2 * 11
      pts.push(`${r2(x + Math.cos(a) * 1.7)} ${r2(y + Math.sin(a) * 1.7)}`)
    }
    return `M${pts.join('L')}`
  }, [])
  return (
    <>
      <path d="M10 12L50 12Q54 12 55 16L58 42Q58 48 52 48L8 48Q2 48 2 42L5 16Q6 12 10 12Z" fill="#000" opacity={0.3} />
      <path d={cord} fill="none" stroke="#111" strokeWidth={0.9} />
      <path d="M8 10L48 10Q52 10 53 14L56 40Q56 46 50 46L6 46Q0 46 0 40L3 14Q4 10 8 10Z" fill="#1d1d1d" stroke="#000" strokeWidth={0.6} />
      <path d="M9 13L47 13Q50 13 50.6 16L52.4 38" fill="none" stroke="#5a5a5a" strokeWidth={0.8} strokeLinecap="round" />
      {/* The dial: ten finger holes, the numbers card showing through, the finger stop */}
      <circle cx={28} cy={33} r={9.6} fill="#2a2a2a" stroke="#555" strokeWidth={0.6} />
      {Array.from({ length: 10 }, (_, k) => { const [x, y] = polar(-150 + k * 27, 6.6); return <circle key={k} cx={28 + x} cy={33 + y} r={1.45} fill="#e9e2cf" stroke="#111" strokeWidth={0.3} /> })}
      <circle cx={28} cy={33} r={3.2} fill="#e9e2cf" stroke="#111" strokeWidth={0.3} />
      <path d="M34.6 38.6l2.6 2.2" stroke="#c9c9c9" strokeWidth={0.8} strokeLinecap="round" />
      <rect x={11} y={4} width={6} height={9} rx={1.5} fill="#2a2a2a" />
      <rect x={39} y={4} width={6} height={9} rx={1.5} fill="#2a2a2a" />
      {/* The handset, in its cradle: tapped, it rings (and jumps in the cradle) */}
      <g key={n} className={on ? 'cq-prop-ringing' : undefined}>
        <circle cx={28} cy={6} r={24} fill="none" />
        <rect x={10} y={2} width={36} height={8} rx={4} fill="#151515" stroke="#000" strokeWidth={0.5} />
        <circle cx={10} cy={6} r={6.6} fill="#151515" stroke="#000" strokeWidth={0.5} />
        <circle cx={46} cy={6} r={6.6} fill="#151515" stroke="#000" strokeWidth={0.5} />
        <path d="M6 2.4A6 6 0 0 1 13 1.4M42 1.4A6 6 0 0 1 49 2.4M14 3.4H42" fill="none" stroke="#6a6a6a" strokeWidth={0.7} strokeLinecap="round" />
      </g>
      {on && (
        <g key={`r${n}`} className="cq-prop-bells" fill="none" stroke="#1e1a12" strokeWidth={1} strokeLinecap="round">
          <path d="M-5 18q-3 6 0 12M-9 15q-5 9 0 18M61 18q3 6 0 12M65 15q5 9 0 18" />
        </g>
      )}
    </>
  )
}

// ── A navigator's brass dividers, lying open on the map ──
function Dividers({ n, on }: Poked) {
  const leg = (
    <>
      <path d="M-1.5 2L1.5 2L0.5 40L0 46L-0.5 40Z" fill={BRASS} stroke={BRASS_DARK} strokeWidth={0.5} strokeLinejoin="round" />
      <path d="M0.5 40L0 46L-0.5 40Z" fill="#9aa0a6" />
      <path d="M-0.5 4L-0.1 38" stroke="#f1d78a" strokeOpacity={0.8} strokeWidth={0.4} />
    </>
  )
  // Each leg turns about the hinge (the unseen circle keeps it there); tapped, they step out a measure
  const legs = (shadow: boolean) => [[16, 'cq-prop-open-l'], [-16, 'cq-prop-open-r']].map(([a, cls]) => (
    <g key={String(a)} transform={`rotate(${a})`}>
      <g className={!shadow && on ? String(cls) : undefined}>
        <circle r={46} fill="none" />
        {shadow ? <path d="M-1.5 2L1.5 2L0.5 40L0 46L-0.5 40Z" fill="#000" /> : leg}
      </g>
    </g>
  ))
  return (
    <>
      <g transform="translate(1.6 2)" opacity={0.25}>{legs(true)}</g>
      <g key={n}>{legs(false)}</g>
      <rect x={-1.6} y={-8} width={3.2} height={6} rx={1} fill={BRASS} stroke={BRASS_DARK} strokeWidth={0.5} />
      <circle r={3.4} fill={BRASS} stroke={BRASS_DARK} strokeWidth={0.6} />
      <path d="M-1.8 0H1.8" stroke={BRASS_DARK} strokeWidth={0.6} />
    </>
  )
}

/**
 * Where each sits on the map: its box (map units), its drawing's place, scale
 * and turn in it, the box (in the drawing) that takes a tap, and how long a poke
 * plays
 */
const PLACES = [
  { key: 'clock', box: [40, 504, 88, 88], at: [84, 548], scale: 1, turn: 0, hit: [-42, -42, 84, 84], ms: 1800, draw: Clock },
  { key: 'ashtray', box: [878, 528, 74, 76], at: [900, 584], scale: 1, turn: 0, hit: [-22, -40, 64, 64], ms: 2100, draw: Ashtray },
  { key: 'coffee', box: [758, 22, 84, 76], at: [796, 58], scale: 1, turn: 0, hit: [-30, -30, 60, 60], ms: 1700, draw: Coffee },
  { key: 'telephone', box: [20, 430, 76, 62], at: [34, 438], scale: 0.95, turn: -8, hit: [-14, -2, 76, 52], ms: 2000, draw: Telephone },
  { key: 'dividers', box: [168, 534, 120, 74], at: [186, 568], scale: 1.6, turn: -78, hit: [-15, -10, 30, 58], ms: 1700, draw: Dividers },
] as const

/** Each its own layer (will-change), so its moving never has the map under it redrawn */
function Prop({ place, id, at }: { place: (typeof PLACES)[number]; id: string; at: (x: number, y: number, w: number, h: number) => CSSProperties }) {
  const { ref, n, on } = usePoke<SVGGElement>(place.ms)
  const { box: [x, y, w, h], at: [tx, ty], scale, turn, hit: [hx, hy, hw, hh], draw: Draw } = place
  return (
    <svg viewBox={`${x} ${y} ${w} ${h}`} style={{ ...at(x, y, w, h), pointerEvents: 'none', willChange: 'transform' }} overflow="visible" aria-hidden>
      <g ref={ref} data-poke={place.key} transform={`translate(${tx} ${ty}) rotate(${turn}) scale(${scale})`} style={{ pointerEvents: 'auto', cursor: 'pointer' }}>
        <rect x={hx} y={hy} width={hw} height={hh} fill="none" pointerEvents="all" />
        <Draw n={n} on={on} id={id} />
      </g>
    </svg>
  )
}

export function TableProps({ at }: { at: (x: number, y: number, w: number, h: number) => CSSProperties }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  return <>{PLACES.map((p): ReactNode => <Prop key={p.key} place={p} id={`cq${uid}${p.key}`} at={at} />)}</>
}
