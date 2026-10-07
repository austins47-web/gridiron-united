import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import clsx from 'clsx'
import { TERRITORIES, ADJ, citiesOf, patternOf } from '../../../supabase/functions/_shared/conquest.ts'
import { NORTHEAST_CITIES } from './usMap'
import { M, NE, NE_SET, insetBox, viewOf, empireLabel, spreadLabels, frontTeeth, type MapLayout, type Rect, type LabelBox } from './mapGeometry'
import { ICON, type IconName } from './icons'
import type { ConquestPlayer, LiveBattle } from './conquestView'

export type { MapLayout } from './mapGeometry'

// The Conquest map, war-room style: the lower 48 with each NFL city's
// territory (the counties nearest its stadium). An empire reads as one
// country: its cities washed in its color (some colors carry stripes or
// dots, so no two get confused), one glowing border around the lot, faint
// lines between its own cities, and its name written across its land once
// it holds two or more. Where two empires meet, each side of the border
// glows in its own color with a dark seam between, two armies facing off;
// where a battle's on this week, the attacker's teeth line that border,
// pointing into the city at stake. A star marks each capital its owner still holds (a flame
// when it's under siege), dotted sea lanes count as borders (Risk style),
// and the Northeast gets a zoomed inset. City labels nudge apart so none
// overlap. The glow is layered strokes, not a blur filter, so a Fire TV
// can draw it.
//
// The map itself never moves (redrawing it is what a Fire TV can't keep
// up with). The motion is separate layers laid over it: a radar sweep,
// capitals pinging, ships on the sea lanes, this week's battles as
// marching arrows, and contested cities flickering. The TV's lighter
// effects keep only what the GPU can move on its own (see index.css).
//
// Light mode (the app's, not the TV's) draws it as a daylight ops table.

const MONO ="ui-monospace, 'Cascadia Mono', Consolas, 'Roboto Mono', monospace"
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
  /** a border between two empires: a wide glow and a bright core */
  /** the thin line between two empires' colors where they meet */
  seam: string
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
  seam: 'rgba(2, 6, 10, 0.85)',
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
  seam: 'rgba(255, 255, 255, 0.95)',
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

const shortName = (name: string) => {
  const first = name.trim().split(/\s+/)[0] ?? ''
  return first.length > 9 ? first.slice(0, 8) + '…' : first
}

/** One of Conquest's symbols drawn on the map, centered on a point at a size (map units). */
function MapIcon({ name, x, y, size, color, outline }: { name: IconName; x: number; y: number; size: number; color: string; outline?: string }) {
  const icon = ICON[name]
  const k = size / 24
  return (
    <g transform={`translate(${x - 12 * k} ${y - 12 * k}) scale(${k})`}>
      {'fill' in icon && <path d={icon.fill} fill={color} stroke={outline} strokeWidth={outline ? 2.4 : undefined} strokeLinejoin="round" paintOrder="stroke" />}
      {'stroke' in icon && (
        <>
          {outline && <path d={icon.stroke} fill="none" stroke={outline} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />}
          <path d={icon.stroke} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {'dot' in icon && <circle cx={12} cy={12} r={2} fill={color} />}
    </g>
  )
}

/** The Northeast and its neighbors: the only cities whose empires' borders the inset needs to draw */
const NE_NEAR = new Set([...NE_SET, ...[...NE_SET].flatMap(t => ADJ[t])])

/** The borders around a set of cities (the coast and every border with a city outside it), as one path. */
const outlineOf = (cities: Set<string>) =>
  M.borders.filter(b => cities.has(b.a) !== cities.has(b.b)).map(b => b.d).join('')
  + [...cities].map(t => M.coasts[t]).join('')

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

/**
 * The land at a zoom (`z` keeps lines the same width zoomed in): each
 * city's fill (textured for some colors), then the borders, drawn once
 * each from the shared borders: open land's, the faint ones inside an
 * empire, and one glowing border around each empire. Where it meets
 * another empire, its glow stays on its own side (clipped to its land),
 * so the border shows both colors with a dark seam down the middle.
 * Only the fills take taps (they carry the city).
 */
function Lands({ owners, colorOf, clipOf, near, patternFill, you, target, flag, flagColor, highlight, highlightColor, P, z = 1 }: {
  owners: Record<string, string | null>
  colorOf: (k: string) => string | null
  /** an empire's land, as a clip (url) */
  clipOf: (empire: string) => string
  /** only the empires holding one of these cities get borders (the inset: just the Northeast's) */
  near?: Set<string>

  /** a city's texture fill, if its empire's color has one */
  patternFill: (k: string) => string | null
  you?: string | null
  /** your chosen attack and flag (the app's map, before kickoff) */
  target?: string | null
  flag?: string | null
  flagColor?: string
  highlight?: string | null
  highlightColor?: string
  P: Palette
  z?: number
}) {
  const own = (t: string) => owners[t] ?? null
  const empires = [...new Set(TERRITORIES.filter(t => !near || near.has(t)).map(own).filter((o): o is string => !!o))]
  const free = M.borders.filter(b => !own(b.a) && !own(b.b)).map(b => b.d).join('')
    + TERRITORIES.filter(t => !own(t)).map(t => M.coasts[t]).join('')
  const seams = M.borders.filter(b => own(b.a) && own(b.b) && own(b.a) !== own(b.b)).map(b => b.d).join('')
  return (
    <>
      {P.land && TERRITORIES.filter(t => colorOf(t)).map(t => <path key={`land-${t}`} d={M.territories[t]} fill={P.land!} pointerEvents="none" />)}
      {TERRITORIES.map(t => {
        const c = colorOf(t)
        return <path key={t} data-team={t} d={M.territories[t]} fill={c ?? P.free} fillOpacity={c ? P.owned : 1} />
      })}
      <g pointerEvents="none" fill="none" strokeLinejoin="round">
        {TERRITORIES.map(t => {
          const f = patternFill(t)
          return f ? <path key={`tex-${t}`} d={M.territories[t]} fill={f} stroke="none" /> : null
        })}
        <path d={M.states} stroke={P.states} strokeOpacity={P.statesOpacity} strokeWidth={0.6 / z} />
        {free && <path d={free} stroke={P.freeEdge} strokeOpacity={P.freeEdgeOpacity} strokeWidth={0.8 / z} />}
        {empires.map(e => {
          const c = colorOf(TERRITORIES.find(t => own(t) === e)!)!
          const mine = (t: string) => own(t) === e
          const inner = M.borders.filter(b => mine(b.a) && mine(b.b)).map(b => b.d).join('')
          // Its edge to open land and the coast glows both ways; its edge to another empire, only inward
          const open = M.borders.filter(b => mine(b.a) !== mine(b.b) && !own(mine(b.a) ? b.b : b.a)).map(b => b.d).join('')
            + TERRITORIES.filter(mine).map(t => M.coasts[t]).join('')
          const facing = M.borders.filter(b => mine(b.a) !== mine(b.b) && own(mine(b.a) ? b.b : b.a)).map(b => b.d).join('')
          return (
            <g key={e} stroke={c}>
              {inner && <path d={inner} strokeOpacity={0.45} strokeWidth={0.7 / z} strokeDasharray={`${2 / z} ${2.5 / z}`} />}
              {open && (
                <>
                  <path d={open} strokeOpacity={0.16} strokeWidth={5.5 / z} />
                  <path d={open} strokeOpacity={0.4} strokeWidth={2.6 / z} />
                  <path d={open} strokeWidth={1.2 / z} />
                </>
              )}
              {facing && (
                <g clipPath={clipOf(e)}>
                  <path d={facing} strokeOpacity={0.22} strokeWidth={10 / z} />
                  <path d={facing} strokeOpacity={0.5} strokeWidth={5 / z} />
                  <path d={facing} strokeWidth={2.6 / z} />
                </g>
              )}
            </g>
          )
        })}
        {seams && <path d={seams} stroke={P.seam} strokeWidth={0.9 / z} />}
        {you && empires.includes(you) && (
          <path d={outlineOf(new Set(TERRITORIES.filter(t => own(t) === you)))} stroke={P.ink} strokeOpacity={0.9} strokeWidth={1.4 / z} strokeDasharray={`${4 / z} ${3 / z}`} />
        )}
        {target && empires.includes(target) && (
          <path d={outlineOf(new Set(TERRITORIES.filter(t => own(t) === target)))} stroke={SIEGE} strokeWidth={2.2 / z} strokeDasharray={`${7 / z} ${4 / z}`} />
        )}
        {flag && M.territories[flag] && (
          <path d={M.territories[flag]} fill={flagColor} fillOpacity={0.25} stroke={flagColor ?? P.ink} strokeWidth={2 / z} strokeDasharray={`${5 / z} ${3 / z}`} />
        )}
        {highlight && M.territories[highlight] && (
          <>
            <path d={M.territories[highlight]} stroke={highlightColor ?? P.ink} strokeWidth={6 / z} strokeOpacity={0.55} />
            <path d={M.territories[highlight]} stroke={P.ink} strokeWidth={1.8 / z} />
          </>
        )}
      </g>
    </>
  )
}

interface Ping { team: string; x: number; y: number; color: string; siege: boolean }
interface Arrow { key: string; fromTeam: string; toTeam: string; from: [number, number]; to: [number, number]; color: string; live: boolean }
interface Hot { team: string; color: string; siege: boolean }
/** A battle's front: the attacker's teeth along the border, into the city at stake */
interface Front { key: string; d: string; box: Rect; color: string; live: boolean }

/** One turn of the radar, one pass of the scan line (index.css's cq-radar, cq-scan and cq-ping) */
const SWEEP_S = 8

/**
 * When the sweep crosses a point, as a ping's delay into each turn: the
 * radar's beam goes clockwise from 12 o'clock around the map's center;
 * the scan line's bright edge goes from the top to 110% of the way down.
 */
const sweepAt = (x: number, y: number) => {
  const deg = ((Math.atan2(x - M.width / 2, -(y - M.height / 2)) * 180) / Math.PI + 360) % 360
  return { radar: (deg / 360) * SWEEP_S, scan: (y / M.height / 1.1) * SWEEP_S }
}

/**
 * Puts the sweep and the pings on the page's one animation clock, so a
 * ping goes off as the sweep crosses it however late either one started
 * (a capital retaken, the TV switching effects).
 */
function useOnSweep() {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !el.getAnimations) return
    const align = () => {
      for (const a of el.getAnimations({ subtree: true })) {
        const name = (a as CSSAnimation).animationName
        if ((name === 'cq-radar' || name === 'cq-scan' || name === 'cq-ping') && a.startTime !== 0) a.startTime = 0
      }
    }
    align()
    el.addEventListener('animationstart', align)
    return () => el.removeEventListener('animationstart', align)
  })
  return ref
}

/**
 * The moving layers over one window of the map (map space, at `zoom` for
 * the Northeast inset). Each is its own element, so moving it never
 * redraws the map under it.
 */
function Motion({ win, zoom, P, pings, ringR, hot, fronts, arrows, radar, lanes }: {
  win: Rect
  zoom: number
  P: Palette
  pings: Ping[]
  ringR: number
  hot: Hot[]
  fronts: Front[]
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

      {/* This week's battle fronts: each its own layer, pulsing (faint while the attacker's losing) */}
      {fronts.map(f => (
        <svg
          key={f.key} className="cq-front" viewBox={`${f.box.x} ${f.box.y} ${f.box.w} ${f.box.h}`}
          style={{ ...at(f.box.x, f.box.y, f.box.w, f.box.h), opacity: f.live ? undefined : 0.4 }} overflow="visible"
        >
          <path d={f.d} fill={f.color} stroke={P.under} strokeWidth={1.4 / zoom} strokeLinejoin="round" paintOrder="stroke" />
        </svg>
      ))}

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

      {/* Capitals ping as the sweep crosses them (a besieged one, fast and red, all the time) */}
      {pings.map(p => {
        const when = sweepAt(p.x, p.y)
        return (
          <div
            key={p.team}
            className={p.siege ? 'cq-ping-siege' : 'cq-ping'}
            style={{
              ...at(p.x - ringR, p.y - ringR, ringR * 2, ringR * 2),
              borderRadius: '50%',
              border: `2px solid ${p.siege ? SIEGE : p.color}`,
              ['--cq-radar-at' as string]: `${when.radar.toFixed(2)}s`,
              ['--cq-scan-at' as string]: `${when.scan.toFixed(2)}s`,
            }}
          />
        )
      })}
    </>
  )
}

export const ConquestMap = memo(function ConquestMap({
  owners, besieged = {}, players, you, orders, highlight, highlightColor, labels = 'names', layout = 'below', labelScale = 1, battles = [], className,
}: {
  owners: Record<string, string | null>
  besieged?: Record<string, string>
  players: ConquestPlayer[]
  /** your cities get a dashed outline */
  you?: string | null
  /** your chosen attack (an empire) and flag (an open city), marked on the map */
  orders?: { target?: string | null; flag?: string | null }
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
  const motion = useOnSweep()
  const byId = new Map(players.map(p => [p.userId, p]))
  const ownerAt = (t: string) => (owners[t] ? byId.get(owners[t]!) : undefined)
  const colorOf = (t: string) => ownerAt(t)?.color ?? null
  const view = viewOf(layout)
  const box = insetBox(layout)
  const z = box ? box.w / NE.w : 1
  const toInset = ([x, y]: [number, number]): [number, number] => box ? [box.x + (x - NE.x) * z, box.y + (y - NE.y) * z] : [x, y]
  const ownersKey = TERRITORIES.map(t => owners[t] ?? '-').join(',')

  // Textured colors: one pattern each, in the empire's color
  const textured = players.filter(p => patternOf(p.color))
  const patternFill = (t: string) => {
    const o = ownerAt(t)
    return o && patternOf(o.color) ? `url(#cq-tex-${uid}-${textured.indexOf(o)})` : null
  }

  // Empires of two cities or more write their name across their land (and stop naming each city)
  const named = useMemo(() => {
    const out: { id: string; name: string; color: string; x: number; y: number; angle: number; size: number }[] = []
    for (const p of players) {
      const name = p.name.trim().toUpperCase()
      const at = empireLabel(owners, p.userId, name, Math.sqrt(labelScale))
      if (at) out.push({ id: p.userId, name, color: p.color, ...at })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownersKey, players, labelScale])
  const namedIds = new Set(named.map(n => n.id))

  // City labels nudged apart so none overlap: the main map's, and the inset's (in its own space)
  const spots = useMemo(() => {
    const boxFor = (t: string, [x, y]: [number, number], size: number): LabelBox => {
      const o = ownerAt(t)
      const showName = labels === 'names' && !!o && !namedIds.has(o.userId)
      const name = showName ? shortName(o!.name) : ''
      return {
        key: t, x, y,
        w: Math.max(t.length * 0.62 * size, name.length * 0.62 * 0.72 * size) + size * 0.3,
        up: size * 0.8,
        down: showName ? size * 1.15 : size * 0.25,
      }
    }
    // Each capital's star (and the flame beside it) stays put; labels move off it
    const starFor = (t: string, [x, y]: [number, number], size: number): LabelBox | null => {
      const o = ownerAt(t)
      if (!o || o.capital !== t) return null
      const siege = !!besieged[t]
      return { key: `star-${t}`, x: x + (siege ? size * 0.45 : 0), y, w: size * (siege ? 2.6 : 1.7), up: size * (siege ? 1.35 : 0.85), down: size * 0.85, fixed: true }
    }
    const lay = (cities: string[], at: (t: string, p: [number, number]) => [number, number], size: number, bounds: Rect) => spreadLabels([
      ...cities.map(t => boxFor(t, at(t, M.label[t]), size)),
      ...cities.map(t => starFor(t, at(t, M.stadium[t]), size)).filter((b): b is LabelBox => !!b),
    ], bounds)
    const main = lay(TERRITORIES.filter(t => !(box && NE_SET.has(t))), (_, p) => p, 12 * labelScale, { x: 4, y: 4, w: M.width - 8, h: M.height - 8 })
    const inset = box
      ? lay(NORTHEAST_CITIES, (_, p) => toInset(p), 14 * labelScale, { x: box.x + 4, y: box.y + 24, w: box.w - 8, h: box.h - 28 })
      : {}
    return { ...main, ...inset }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownersKey, Object.keys(besieged).sort().join(','), players, labels, labelScale, layout, named])

  const flagColor = you ? byId.get(you)?.color : undefined

  /** A city's marker and label: the capital's star (a flame beside it under siege), the code, and its owner's name. */
  const cityMark = (t: string, [sx, sy]: [number, number], size: number): ReactNode => {
    const o = ownerAt(t)
    const capital = !!o && o.capital === t
    const siege = !!besieged[t]
    const [lx, ly] = spots[t]
    return (
      <g key={`mark-${t}`}>
        {capital && (
          <>
            <circle cx={sx} cy={sy} r={size * 0.78} fill="none" stroke={siege ? SIEGE : o!.color} strokeWidth={1.2} strokeOpacity={0.85} strokeDasharray={siege ? '2 1.6' : undefined} />
            <MapIcon name="capital" x={sx} y={sy} size={size * 1.05} color={o!.color} outline={P.under} />
          </>
        )}
        {siege && <MapIcon name="siege" x={sx + size * 0.95} y={sy - size * 0.75} size={size * 1.1} color={SIEGE} outline={P.under} />}
        <text x={lx} y={ly} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={size} fill={o ? P.code : P.codeFree}>{t}</text>
        {labels === 'names' && o && !namedIds.has(o.userId) && (
          <text x={lx} y={ly + size * 0.95} textAnchor="middle" fontFamily={MONO} fontWeight={P === LIGHT ? 700 : 400} fontSize={size * 0.72} fill={P.name(o.color)}>
            {shortName(o.name).toUpperCase()}
          </text>
        )}
        {orders?.flag === t && <MapIcon name="flag" x={lx + size * 1.5} y={ly - size * 0.9} size={size * 1.2} color={flagColor ?? P.ink} outline={P.under} />}
      </g>
    )
  }

  /** The chosen attack's crosshairs: on the target's capital, or its city nearest yours. */
  const targetAt = (() => {
    const id = orders?.target
    if (!id) return null
    const p = byId.get(id)
    if (p?.capital && owners[p.capital] === id) return p.capital
    const mine = you ? citiesOf(owners, you) : []
    return citiesOf(owners, id).find(t => mine.some(m => ADJ[t].includes(m))) ?? citiesOf(owners, id)[0] ?? null
  })()

  /**
   * An empire's name across its land, at a zoom (smaller in the inset than
   * the zoom alone would make it), shrunk and nudged to stay inside its frame.
   */
  const empireName = (n: (typeof named)[number], [x0, y0]: [number, number], k: number, frame: Rect) => {
    const a = (Math.abs(n.angle) * Math.PI) / 180
    let size = n.size * k
    const extent = (s: number) => {
      const w = n.name.length * s * 0.9, h = s
      return { hx: (w / 2) * Math.cos(a) + (h / 2) * Math.sin(a), hy: (w / 2) * Math.sin(a) + (h / 2) * Math.cos(a) }
    }
    const room = frame.w - 16
    if (extent(size).hx * 2 > room) size *= room / (extent(size).hx * 2)
    const { hx, hy } = extent(size)
    const x = Math.max(frame.x + 8 + hx, Math.min(frame.x + frame.w - 8 - hx, x0))
    const y = Math.max(frame.y + 8 + hy, Math.min(frame.y + frame.h - 8 - hy, y0))
    return (
      <text
        key={`name-${n.id}`}
        x={x} y={y + size * 0.35}
        transform={n.angle ? `rotate(${n.angle.toFixed(1)} ${x} ${y})` : undefined}
        textAnchor="middle" className="font-cond" fontWeight={800}
        fontSize={size} letterSpacing={size * 0.28}
        fill={P.name(n.color)} fillOpacity={P === LIGHT ? 0.55 : 0.6}
      >
        {n.name}
      </text>
    )
  }
  const inNE = (x: number, y: number) => x >= NE.x && x <= NE.x + NE.w && y >= NE.y && y <= NE.y + NE.h

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
  /** Each battle's front at a tooth size: along the city at stake's border with the attacker's land */
  const frontsAt = (scale: number, only?: (team: string) => boolean): Front[] => battles.flatMap(b => {
    if (!b.city || (only && !only(b.city))) return []
    // Two empires attacking each other across the same border: one's teeth go in between the other's
    const mutual = battles.some(o => o.attacker === b.defender && o.defender === b.attacker && o.attacker < b.attacker)
    const teeth = frontTeeth(b.city, new Set(citiesOf(owners, b.attacker)), scale, mutual)
    return teeth ? [{ key: b.attacker, ...teeth, color: P.arrow(colorOfUser(b.attacker)), live: b.outcome !== 'hold' }] : []
  })

  // Each empire's land as a clip, so its glow stays on its side where it meets another
  const holders = players.filter(p => TERRITORIES.some(t => owners[t] === p.userId))
  const clipOf = (e: string) => `url(#cq-own-${uid}-${holders.findIndex(p => p.userId === e)})`

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
          <clipPath id={`cq-main-${uid}`}><rect x={0} y={0} width={M.width} height={M.height} rx={10} /></clipPath>
          {box && <clipPath id={`cq-ne-${uid}`}><rect x={box.x} y={box.y} width={box.w} height={box.h} rx={8} /></clipPath>}
          {holders.map((p, i) => (
            <clipPath key={p.userId} id={`cq-own-${uid}-${i}`}>
              {TERRITORIES.filter(t => owners[t] === p.userId).map(t => <path key={t} d={M.territories[t]} />)}
            </clipPath>
          ))}
          {textured.map((p, i) => (
            <pattern key={p.userId} id={`cq-tex-${uid}-${i}`} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
              {patternOf(p.color) === 'stripes'
                ? <rect x={0} y={0} width={2.2} height={6} fill={p.color} fillOpacity={0.55} />
                : <circle cx={3} cy={3} r={1.25} fill={p.color} fillOpacity={0.7} />}
            </pattern>
          ))}
        </defs>
        <rect x={0} y={0} width={M.width} height={M.height} rx={10} fill={`url(#cq-bg-${uid})`} />
        <path d={M.grid} fill="none" stroke={P.grid} strokeOpacity={P.gridOpacity} strokeWidth={0.6} pointerEvents="none" clipPath={`url(#cq-main-${uid})`} />
        <Lands
          owners={owners} colorOf={colorOf} clipOf={clipOf} patternFill={patternFill} you={you}
          target={orders?.target} flag={orders?.flag} flagColor={flagColor}
          highlight={highlight} highlightColor={highlightColor} P={P}
        />
        <g pointerEvents="none">
          {/* Sea lanes */}
          {M.lanes.map(l => (
            <g key={`${l.a}-${l.b}`}>
              <path d={l.d} fill="none" stroke={P.accent} strokeOpacity={0.65} strokeWidth={1.6} strokeDasharray="3 4" strokeLinecap="round" />
              {l.ends.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.6} fill={P.accent} />)}
            </g>
          ))}
          {named.filter(n => !(box && inNE(n.x, n.y))).map(n => empireName(n, [n.x, n.y], 1, { x: 0, y: 0, w: M.width, h: M.height }))}
          {TERRITORIES.filter(t => !(box && NE_SET.has(t))).map(t => cityMark(t, M.stadium[t], 12 * labelScale))}
          {targetAt && !(box && NE_SET.has(targetAt)) && <MapIcon name="target" x={M.stadium[targetAt][0]} y={M.stadium[targetAt][1]} size={12 * labelScale * 2.2} color={SIEGE} outline={P.under} />}
        </g>
        {box && (
          <>
            <rect x={NE.x} y={NE.y} width={NE.w} height={NE.h} fill="none" stroke={P.accent} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 3" pointerEvents="none" />
            <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={8} fill={P.insetBg} />
            <g clipPath={`url(#cq-ne-${uid})`}>
              <g transform={`translate(${box.x} ${box.y}) scale(${z}) translate(${-NE.x} ${-NE.y})`}>
                <path d={M.grid} fill="none" stroke={P.grid} strokeOpacity={P.gridOpacity} strokeWidth={0.6 / z} pointerEvents="none" />
                <Lands
                  owners={owners} colorOf={colorOf} clipOf={clipOf} near={NE_NEAR} patternFill={patternFill} you={you}
                  target={orders?.target} flag={orders?.flag} flagColor={flagColor}
                  highlight={highlight} highlightColor={highlightColor} P={P} z={z}
                />
              </g>
              <g pointerEvents="none">
                {named.filter(n => inNE(n.x, n.y)).map(n => empireName(n, toInset([n.x, n.y]), z * 0.6, { ...box, y: box.y + 22, h: box.h - 22 }))}
                {NORTHEAST_CITIES.map(t => cityMark(t, toInset(M.stadium[t]), 14 * labelScale))}
                {targetAt && NE_SET.has(targetAt) && (() => {
                  const [x, y] = toInset(M.stadium[targetAt])
                  return <MapIcon name="target" x={x} y={y} size={14 * labelScale * 2.2} color={SIEGE} outline={P.under} />
                })()}
              </g>
            </g>
            <g pointerEvents="none">
              <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={8} fill="none" stroke={P.accent} strokeOpacity={0.55} strokeWidth={1.2} />
              <text x={box.x + 10} y={box.y + 20} fontFamily={MONO} fontWeight={700} fontSize={13} letterSpacing={2} fill={P.accent}>NORTHEAST</text>
            </g>
          </>
        )}
      </svg>

      <div ref={motion} className="absolute inset-0 pointer-events-none" aria-hidden>
        <div style={frame(MAIN, 10)}>
          <Motion
            win={MAIN} zoom={1} P={P} radar lanes
            pings={pings.filter(p => !(box && NE_SET.has(p.team)))}
            ringR={12 * labelScale * 1.9}
            hot={hot}
            fronts={frontsAt(1)}
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
              fronts={frontsAt(1.3 / z, t => NE_SET.has(t))}
              arrows={arrows.filter(a => NE_SET.has(a.fromTeam) && NE_SET.has(a.toTeam))}
            />
          </div>
        )}
      </div>
    </div>
  )
})
