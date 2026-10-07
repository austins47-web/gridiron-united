import { memo, useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react'
import clsx from 'clsx'
import { TERRITORIES, ADJ } from '../../../supabase/functions/_shared/conquest.ts'
import { US_MAP, NORTHEAST_CITIES } from './usMap'
import type { ConquestPlayer, LiveBattle } from './conquestView'

// The Conquest map, war-room style: the lower 48 with each NFL city's
// territory (the counties nearest its stadium), owned ones washed in their
// empire's color with a glowing edge, a faint grid and state lines, a
// marker on each capital its owner still holds (ringed red under siege),
// dotted sea lanes (Risk style: they count as borders), and a zoomed
// Northeast where the cities are too small to read. The glow
// is layered strokes, not a blur filter, so a Fire TV can draw it.
//
// The map itself never moves (redrawing it is what a Fire TV can't keep
// up with). The motion is separate layers laid over it: a radar sweep,
// capitals pinging, ships on the sea lanes, this week's battles as
// marching arrows, and contested cities flickering. The TV's lighter
// effects keep only what the GPU can move on its own (see index.css).
//
// Light mode (the app's, not the TV's) draws it as a daylight ops table.

const M = US_MAP
const NE = M.northeast
const NE_SET = new Set(NORTHEAST_CITIES)
const MONO = "ui-monospace, 'Cascadia Mono', Consolas, 'Roboto Mono', monospace"
const SIEGE = '#ff4d3d'

interface Palette {
  /** the sea, center → edge */
  sea: [string, string]
  /** under owned land, so its color reads true (light only) */
  land: string | null
  grid: string
  gridOpacity: number
  states: string
  statesOpacity: number
  /** unclaimed land and its edge */
  free: string
  freeEdge: string
  freeEdgeOpacity: number
  /** owned land's wash of its empire's color */
  owned: number
  /** your outline, highlights, contested edges */
  ink: string
  code: string
  codeFree: string
  /** sea lanes, the inset's frame, the motion layers */
  accent: string
  accentRgb: string
  insetBg: string
  /** the outline under a battle arrow */
  under: string
  /** an owner's name, in their color (darkened on light) */
  name: (color: string) => string
  /** a battle arrow, in the attacker's color (a little darker on light) */
  arrow: (color: string) => string
}

const DARK: Palette = {
  sea: ['#0b1a24', '#03070a'],
  land: null,
  grid: '#3fd0ff', gridOpacity: 0.07,
  states: '#3fd0ff', statesOpacity: 0.12,
  free: '#0d1820', freeEdge: '#2a6f86', freeEdgeOpacity: 0.6,
  owned: 0.3,
  ink: '#ffffff',
  code: '#e8fbff', codeFree: '#4f8ea3',
  accent: '#3fd0ff', accentRgb: '63, 208, 255',
  insetBg: '#04090d',
  under: 'rgba(0, 0, 0, 0.6)',
  name: c => c,
  arrow: c => c,
}

/** An empire's color darkened to a lightness that reads on white. */
const inked = (c: string, lightness: number) => {
  const hsl = c.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/)
  return hsl ? `hsl(${hsl[1]} ${Math.min(90, Number(hsl[2]) + 8)}% ${Math.min(lightness, Number(hsl[3]))}%)` : c
}

const LIGHT: Palette = {
  sea: ['#e3edf3', '#c6d6e1'],
  land: '#fbfdfe',
  grid: '#2f6178', gridOpacity: 0.09,
  states: '#24475a', statesOpacity: 0.2,
  free: '#f6f9fb', freeEdge: '#8fadbe', freeEdgeOpacity: 0.95,
  owned: 0.42,
  ink: '#0f172a',
  code: '#0f172a', codeFree: '#5d7d8e',
  accent: '#0e7490', accentRgb: '14, 116, 144',
  insetBg: '#eef4f8',
  under: 'rgba(255, 255, 255, 0.85)',
  name: c => inked(c, 30),
  arrow: c => inked(c, 40),
}

/** The app's light mode (the TV always runs dark). */
function useLight(): boolean {
  const read = () => typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light'
  const [light, setLight] = useState(read)
  useEffect(() => {
    const obs = new MutationObserver(() => setLight(read()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return light
}

/** Where the Northeast zoom sits: beside the map (wide screens), below it (narrow), or not at all. */
export type MapLayout = 'side' | 'below' | 'none'

const GAP = 14
const SIDE_W = 420
const BELOW_W = 680
const insetBox = (layout: MapLayout) => {
  if (layout === 'side') return { x: M.width + GAP, y: 40, w: SIDE_W, h: SIDE_W * NE.h / NE.w }
  if (layout === 'below') return { x: (M.width - BELOW_W) / 2, y: M.height + GAP, w: BELOW_W, h: BELOW_W * NE.h / NE.w }
  return null
}
const viewOf = (layout: MapLayout) => {
  const box = insetBox(layout)
  if (layout === 'side') return { w: M.width + GAP + SIDE_W, h: M.height }
  if (layout === 'below' && box) return { w: M.width, h: box.y + box.h + 4 }
  return { w: M.width, h: M.height }
}

const shortName = (name: string) => {
  const first = name.trim().split(/\s+/)[0] ?? ''
  return first.length > 9 ? first.slice(0, 8) + '…' : first
}

type Rect = { x: number; y: number; w: number; h: number }

/** Each territory's bounds (map space), padded for its glow: where its flicker layer goes. */
const BOUNDS: Record<string, Rect> = Object.fromEntries(TERRITORIES.map(t => {
  const n = (M.territories[t].match(/-?\d*\.?\d+/g) ?? []).map(Number)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i + 1 < n.length; i += 2) {
    x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i])
    y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1])
  }
  const pad = 8
  return [t, { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 }]
}))

const pct = (v: number, of: number) => `${(v / of) * 100}%`

/** The territories, grid lines and borders, at a zoom (`z` keeps lines the same width zoomed in). */
function Lands({ owners, colorOf, you, highlight, highlightColor, P, z = 1 }: {
  owners: Record<string, string | null>
  colorOf: (k: string) => string | null
  you?: string | null
  highlight?: string | null
  highlightColor?: string
  P: Palette
  z?: number
}) {
  return (
    <>
      {P.land && TERRITORIES.filter(t => colorOf(t)).map(t => <path key={`land-${t}`} d={M.territories[t]} fill={P.land!} />)}
      {TERRITORIES.map(t => {
        const c = colorOf(t)
        return <path key={t} d={M.territories[t]} fill={c ?? P.free} fillOpacity={c ? P.owned : 1} />
      })}
      <path d={M.states} fill="none" stroke={P.states} strokeOpacity={P.statesOpacity} strokeWidth={0.6 / z} />
      {TERRITORIES.map(t => {
        const c = colorOf(t)
        if (!c) return <path key={t} d={M.territories[t]} fill="none" stroke={P.freeEdge} strokeOpacity={P.freeEdgeOpacity} strokeWidth={0.8 / z} />
        return (
          <g key={t} fill="none" stroke={c} strokeLinejoin="round">
            <path d={M.territories[t]} strokeOpacity={0.16} strokeWidth={5.5 / z} />
            <path d={M.territories[t]} strokeOpacity={0.4} strokeWidth={2.6 / z} />
            <path d={M.territories[t]} strokeWidth={1.2 / z} />
          </g>
        )
      })}
      {you && TERRITORIES.filter(t => owners[t] === you).map(t => (
        <path key={`you-${t}`} d={M.territories[t]} fill="none" stroke={P.ink} strokeOpacity={0.9} strokeWidth={1.4 / z} strokeDasharray={`${4 / z} ${3 / z}`} />
      ))}
      {highlight && M.territories[highlight] && (
        <g fill="none" strokeLinejoin="round">
          <path d={M.territories[highlight]} stroke={highlightColor ?? P.ink} strokeWidth={6 / z} strokeOpacity={0.55} />
          <path d={M.territories[highlight]} stroke={P.ink} strokeWidth={1.8 / z} />
        </g>
      )}
    </>
  )
}

interface Ping { team: string; x: number; y: number; color: string; siege: boolean }
interface Arrow { key: string; fromTeam: string; toTeam: string; from: [number, number]; to: [number, number]; color: string; live: boolean }
interface Hot { team: string; color: string; siege: boolean }

const PING_S = 9

/**
 * The moving layers over one window of the map (map space, at `zoom` for
 * the Northeast inset). Each is its own element, so moving it never
 * redraws the map under it.
 */
function Motion({ win, zoom, P, pings, ringR, hot, arrows, radar, lanes }: {
  win: Rect
  zoom: number
  P: Palette
  pings: Ping[]
  ringR: number
  hot: Hot[]
  arrows: Arrow[]
  radar: boolean
  lanes: boolean
}) {
  const at = (x: number, y: number, w: number, h: number): CSSProperties => ({
    position: 'absolute', left: pct(x - win.x, win.w), top: pct(y - win.y, win.h), width: pct(w, win.w), height: pct(h, win.h),
  })
  const a = P.accentRgb
  return (
    <>
      {radar && (
        <>
          <div
            className="cq-radar"
            style={{
              position: 'absolute', left: '50%', top: '50%', width: '150%', aspectRatio: '1', borderRadius: '50%',
              background: `conic-gradient(from 0deg, rgba(${a}, 0) 0deg, rgba(${a}, 0) 280deg, rgba(${a}, 0.08) 335deg, rgba(${a}, 0.26) 359deg, rgba(${a}, 0) 360deg)`,
            }}
          />
          <div
            className="cq-scan"
            style={{
              position: 'absolute', left: 0, top: 0, width: '100%', height: '10%',
              background: `linear-gradient(to bottom, rgba(${a}, 0), rgba(${a}, 0.06) 80%, rgba(${a}, 0.3) 98%, rgba(${a}, 0))`,
            }}
          />
        </>
      )}

      {/* Cities changing hands as the week stands */}
      {hot.map(c => {
        const b = BOUNDS[c.team]
        return (
          <svg key={c.team} className="cq-flicker" viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} style={at(b.x, b.y, b.w, b.h)} overflow="visible">
            <path d={M.territories[c.team]} fill={c.color} fillOpacity={0.22} stroke={c.color} strokeOpacity={0.5} strokeWidth={7 / zoom} strokeLinejoin="round" />
            <path d={M.territories[c.team]} fill="none" stroke={c.siege ? SIEGE : P.ink} strokeWidth={2 / zoom} strokeDasharray={`${5 / zoom} ${3 / zoom}`} strokeLinejoin="round" />
          </svg>
        )
      })}

      {(arrows.length > 0 || lanes) && (
        <svg viewBox={`${win.x} ${win.y} ${win.w} ${win.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {/* Ships on the sea lanes */}
          {lanes && M.lanes.map(l => (
            <path key={`${l.a}-${l.b}`} className="cq-flow" d={l.d} fill="none" stroke={P.accent} strokeWidth={3} strokeLinecap="round" strokeDasharray="0.1 47.9" />
          ))}
          {/* This week's battles: attacker → the city at stake (faint while they're losing) */}
          {arrows.map(r => {
            const [x1, y1] = r.from, [x2, y2] = r.to
            const dx = x2 - x1, dy = y2 - y1
            const cx = (x1 + x2) / 2 - dy * 0.22, cy = (y1 + y2) / 2 + dx * 0.22
            const unit = (x: number, y: number) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l] }
            const [ux, uy] = unit(x2 - cx, y2 - cy)
            const [sx, sy] = unit(cx - x1, cy - y1)
            const tip: [number, number] = [x2 - ux * 9 / zoom, y2 - uy * 9 / zoom]
            const hl = 11 / zoom, hw = 6 / zoom
            const base: [number, number] = [tip[0] - ux * hl, tip[1] - uy * hl]
            const head = `M${tip[0]} ${tip[1]} L${base[0] - uy * hw} ${base[1] + ux * hw} L${base[0] + uy * hw} ${base[1] - ux * hw} Z`
            const d = `M${x1 + sx * 8 / zoom} ${y1 + sy * 8 / zoom} Q${cx} ${cy} ${base[0]} ${base[1]}`
            const dash = 12 / zoom
            return (
              <g key={r.key} opacity={r.live ? 1 : 0.45}>
                <path d={d} fill="none" stroke={P.under} strokeWidth={5 / zoom} strokeLinecap="round" />
                <path d={head} fill={P.under} stroke={P.under} strokeWidth={3 / zoom} strokeLinejoin="round" />
                <path
                  d={d} fill="none" stroke={r.color} strokeWidth={2.4 / zoom} strokeLinecap="round"
                  strokeDasharray={`${dash * 0.6} ${dash * 0.4}`}
                  className="cq-march"
                  style={{ ['--cq-dash' as string]: String(-dash), animationDuration: r.live ? '0.9s' : '2.4s' }}
                />
                <path d={head} fill={r.color} />
              </g>
            )
          })}
        </svg>
      )}

      {/* Capitals pinging, one after another (a besieged one, fast and red) */}
      {pings.map((p, i) => (
        <div
          key={p.team}
          className={p.siege ? 'cq-ping-siege' : 'cq-ping'}
          style={{
            ...at(p.x - ringR, p.y - ringR, ringR * 2, ringR * 2),
            borderRadius: '50%',
            border: `2px solid ${p.siege ? SIEGE : p.color}`,
            animationDelay: p.siege ? undefined : `${(-(i * PING_S) / pings.length).toFixed(2)}s`,
          }}
        />
      ))}
    </>
  )
}

export const ConquestMap = memo(function ConquestMap({
  owners, besieged = {}, players, you, highlight, highlightColor, labels = 'names', layout = 'below', labelScale = 1, battles = [], className,
}: {
  owners: Record<string, string | null>
  besieged?: Record<string, string>
  players: ConquestPlayer[]
  /** your cities get a dashed outline */
  you?: string | null
  /** a city to ring (the war report's move) */
  highlight?: string | null
  highlightColor?: string
  /** under each city: its owner's name, or just the city */
  labels?: 'names' | 'abbr'
  layout?: MapLayout
  /** bigger city labels, for a map drawn small */
  labelScale?: number
  /** this week's battles as they stand: drawn as arrows, the cities changing hands flickering */
  battles?: LiveBattle[]
  className?: string
}) {
  const P = useLight() ? LIGHT : DARK
  const uid = useId().replace(/:/g, '')
  const byId = new Map(players.map(p => [p.userId, p]))
  const ownerAt = (t: string) => (owners[t] ? byId.get(owners[t]!) : undefined)
  const colorOf = (t: string) => ownerAt(t)?.color ?? null
  const view = viewOf(layout)
  const box = insetBox(layout)

  /** A city's capital marker and name, at a point (already zoomed for the inset). */
  const cityMark = (t: string, [lx, ly]: [number, number], [sx, sy]: [number, number], size: number): ReactNode => {
    const o = ownerAt(t)
    const capital = !!o && o.capital === t
    const siege = !!besieged[t]
    return (
      <g key={`mark-${t}`}>
        {capital && (
          <>
            <circle cx={sx} cy={sy} r={size * 0.75} fill="none" stroke={siege ? SIEGE : o!.color} strokeWidth={1.2} strokeOpacity={0.85} strokeDasharray={siege ? '2 1.6' : undefined} />
            <circle cx={sx} cy={sy} r={size * 0.36} fill={o!.color} />
          </>
        )}
        {siege && <text x={sx + size * 0.9} y={sy - size * 0.5} fontSize={size * 1.1}>🔥</text>}
        <text x={lx} y={ly} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={size} fill={o ? P.code : P.codeFree}>{t}</text>
        {labels === 'names' && o && (
          <text x={lx} y={ly + size * 0.95} textAnchor="middle" fontFamily={MONO} fontWeight={P === LIGHT ? 700 : 400} fontSize={size * 0.72} fill={P.name(o.color)}>
            {shortName(o.name).toUpperCase()}
          </text>
        )}
      </g>
    )
  }

  const z = box ? box.w / NE.w : 1
  const toInset = ([x, y]: [number, number]): [number, number] => box ? [box.x + (x - NE.x) * z, box.y + (y - NE.y) * z] : [x, y]

  // The motion: capitals still held, cities changing hands, and each battle's arrow
  const pings: Ping[] = players
    .filter(p => p.capital && owners[p.capital] === p.userId)
    .map(p => ({ team: p.capital!, x: M.stadium[p.capital!][0], y: M.stadium[p.capital!][1], color: p.color, siege: !!besieged[p.capital!] }))
    .sort((a, b) => a.x - b.x)
  const colorOfUser = (id: string) => byId.get(id)?.color ?? P.ink
  const hot: Hot[] = battles.filter(b => b.outcome !== 'hold' && b.city).map(b => ({ team: b.city!, color: colorOfUser(b.attacker), siege: b.outcome === 'siege' }))
  const arrows: Arrow[] = battles.flatMap(b => {
    if (!b.city) return []
    const to = M.stadium[b.city]
    // From the attacker's nearest city on that border
    const dist = (n: string) => Math.hypot(M.stadium[n][0] - to[0], M.stadium[n][1] - to[1])
    const fromTeam = ADJ[b.city].filter(n => owners[n] === b.attacker).sort((p, q) => dist(p) - dist(q))[0]
    return fromTeam ? [{ key: b.attacker, fromTeam, toTeam: b.city, from: M.stadium[fromTeam], to, color: P.arrow(colorOfUser(b.attacker)), live: b.outcome !== 'hold' }] : []
  })

  const frame = (r: Rect, rx: number): CSSProperties => ({
    position: 'absolute', left: pct(r.x, view.w), top: pct(r.y, view.h), width: pct(r.w, view.w), height: pct(r.h, view.h),
    overflow: 'hidden', borderRadius: `${pct(rx, r.w)} / ${pct(rx, r.h)}`,
  })
  const MAIN: Rect = { x: 0, y: 0, w: M.width, h: M.height }

  return (
    <div className={clsx('cq-map relative', className)}>
      <svg viewBox={`0 0 ${view.w} ${view.h}`} className="block w-full h-auto" role="img" aria-label="The Conquest war map">
        <defs>
          <radialGradient id={`cq-bg-${uid}`} cx="42%" cy="55%" r="75%">
            <stop offset="0" stopColor={P.sea[0]} />
            <stop offset="1" stopColor={P.sea[1]} />
          </radialGradient>
          {box && <clipPath id={`cq-ne-${uid}`}><rect x={box.x} y={box.y} width={box.w} height={box.h} rx={8} /></clipPath>}
        </defs>
        <rect x={0} y={0} width={M.width} height={M.height} rx={10} fill={`url(#cq-bg-${uid})`} />
        <path d={M.grid} fill="none" stroke={P.grid} strokeOpacity={P.gridOpacity} strokeWidth={0.6} />
        <Lands owners={owners} colorOf={colorOf} you={you} highlight={highlight} highlightColor={highlightColor} P={P} />
        {/* Sea lanes */}
        {M.lanes.map(l => (
          <g key={`${l.a}-${l.b}`}>
            <path d={l.d} fill="none" stroke={P.accent} strokeOpacity={0.65} strokeWidth={1.6} strokeDasharray="3 4" strokeLinecap="round" />
            {l.ends.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.6} fill={P.accent} />)}
          </g>
        ))}
        {TERRITORIES.filter(t => !(box && NE_SET.has(t))).map(t => cityMark(t, M.label[t], M.stadium[t], 12 * labelScale))}
        {box && (
          <>
            <rect x={NE.x} y={NE.y} width={NE.w} height={NE.h} fill="none" stroke={P.accent} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 3" />
            <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={8} fill={P.insetBg} />
            <g clipPath={`url(#cq-ne-${uid})`}>
              <g transform={`translate(${box.x} ${box.y}) scale(${z}) translate(${-NE.x} ${-NE.y})`}>
                <path d={M.grid} fill="none" stroke={P.grid} strokeOpacity={P.gridOpacity} strokeWidth={0.6 / z} />
                <Lands owners={owners} colorOf={colorOf} you={you} highlight={highlight} highlightColor={highlightColor} P={P} z={z} />
              </g>
              {NORTHEAST_CITIES.map(t => cityMark(t, toInset(M.label[t]), toInset(M.stadium[t]), 14 * labelScale))}
            </g>
            <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={8} fill="none" stroke={P.accent} strokeOpacity={0.55} strokeWidth={1.2} />
            <text x={box.x + 10} y={box.y + 20} fontFamily={MONO} fontWeight={700} fontSize={13} letterSpacing={2} fill={P.accent}>NORTHEAST</text>
          </>
        )}
      </svg>

      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div style={frame(MAIN, 10)}>
          <Motion
            win={MAIN} zoom={1} P={P} radar lanes
            pings={pings.filter(p => !(box && NE_SET.has(p.team)))}
            ringR={12 * labelScale * 1.9}
            hot={hot}
            arrows={arrows}
          />
        </div>
        {box && (
          <div style={frame(box, 8)}>
            <Motion
              win={NE} zoom={z} P={P} radar={false} lanes={false}
              pings={pings.filter(p => NE_SET.has(p.team))}
              ringR={(14 * labelScale * 1.9) / z}
              hot={hot.filter(h => NE_SET.has(h.team))}
              arrows={arrows.filter(a => NE_SET.has(a.fromTeam) && NE_SET.has(a.toTeam))}
            />
          </div>
        )}
      </div>
    </div>
  )
})
