import { memo, type ReactNode } from 'react'
import { TERRITORIES } from '../../../supabase/functions/_shared/conquest.ts'
import { US_MAP, NORTHEAST_CITIES } from './usMap'
import type { ConquestPlayer } from './conquestView'

// The Conquest map, war-room style: the lower 48 with each NFL city's
// territory (the counties nearest its stadium), owned ones washed in their
// empire's color with a glowing edge, a faint grid and state lines, a
// marker on each capital its owner still holds (ringed red under siege),
// dotted sea lanes (Risk style: they count as borders), and a zoomed
// Northeast where the cities are too small to read. The glow
// is layered strokes, not a blur filter, so a Fire TV can draw it.

const M = US_MAP
const NE = M.northeast
const NE_SET = new Set(NORTHEAST_CITIES)
const MONO = "ui-monospace, 'Cascadia Mono', Consolas, 'Roboto Mono', monospace"
const UNCLAIMED = '#0d1820'
const CYAN = '#3fd0ff'

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

/** The territories, grid lines and borders, at a zoom (`z` keeps lines the same width zoomed in). */
function Lands({ owners, colorOf, you, highlight, highlightColor, z = 1 }: {
  owners: Record<string, string | null>
  colorOf: (k: string) => string | null
  you?: string | null
  highlight?: string | null
  highlightColor?: string
  z?: number
}) {
  return (
    <>
      {TERRITORIES.map(t => {
        const c = colorOf(t)
        return <path key={t} d={M.territories[t]} fill={c ?? UNCLAIMED} fillOpacity={c ? 0.3 : 1} />
      })}
      <path d={M.states} fill="none" stroke={CYAN} strokeOpacity={0.12} strokeWidth={0.6 / z} />
      {TERRITORIES.map(t => {
        const c = colorOf(t)
        if (!c) return <path key={t} d={M.territories[t]} fill="none" stroke="#2a6f86" strokeOpacity={0.6} strokeWidth={0.8 / z} />
        return (
          <g key={t} fill="none" stroke={c} strokeLinejoin="round">
            <path d={M.territories[t]} strokeOpacity={0.16} strokeWidth={5.5 / z} />
            <path d={M.territories[t]} strokeOpacity={0.4} strokeWidth={2.6 / z} />
            <path d={M.territories[t]} strokeWidth={1.2 / z} />
          </g>
        )
      })}
      {you && TERRITORIES.filter(t => owners[t] === you).map(t => (
        <path key={`you-${t}`} d={M.territories[t]} fill="none" stroke="#ffffff" strokeOpacity={0.9} strokeWidth={1.4 / z} strokeDasharray={`${4 / z} ${3 / z}`} />
      ))}
      {highlight && M.territories[highlight] && (
        <g fill="none" strokeLinejoin="round">
          <path d={M.territories[highlight]} stroke={highlightColor ?? '#fff'} strokeWidth={6 / z} strokeOpacity={0.55} />
          <path d={M.territories[highlight]} stroke="#ffffff" strokeWidth={1.8 / z} />
        </g>
      )}
    </>
  )
}

/** Contested cities: a pulsing edge in the attacker's color (dashed red for a siege). */
function Contested({ items, z = 1 }: { items: { team: string; color: string; siege: boolean }[]; z?: number }) {
  if (!items.length) return null
  return (
    <g className="cq-flicker" fill="none" strokeLinejoin="round">
      {items.map(c => (
        <g key={c.team}>
          <path d={M.territories[c.team]} stroke={c.color} strokeWidth={7 / z} strokeOpacity={0.4} />
          <path d={M.territories[c.team]} stroke={c.siege ? '#ff4d3d' : '#ffffff'} strokeWidth={2 / z} strokeDasharray={`${5 / z} ${3 / z}`} />
        </g>
      ))}
    </g>
  )
}

export const ConquestMap = memo(function ConquestMap({
  owners, besieged = {}, players, you, highlight, highlightColor, labels = 'names', layout = 'below', labelScale = 1, contested = [], className,
}: {
  owners: Record<string, string | null>
  besieged?: Record<string, string>
  players: ConquestPlayer[]
  /** your cities get a dashed white edge */
  you?: string | null
  /** a city to ring (the war report's move) */
  highlight?: string | null
  highlightColor?: string
  /** under each city: its owner's name, or just the city */
  labels?: 'names' | 'abbr'
  layout?: MapLayout
  /** bigger city labels, for a map drawn small */
  labelScale?: number
  /** cities changing hands as the week stands: they flicker (held still on lighter effects) */
  contested?: { team: string; color: string; siege: boolean }[]
  className?: string
}) {
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
            <circle cx={sx} cy={sy} r={size * 0.75} fill="none" stroke={siege ? '#ff4d3d' : o!.color} strokeWidth={1.2} strokeOpacity={0.85} strokeDasharray={siege ? '2 1.6' : undefined} />
            <circle cx={sx} cy={sy} r={size * 0.36} fill={o!.color} />
          </>
        )}
        {siege && <text x={sx + size * 0.9} y={sy - size * 0.5} fontSize={size * 1.1}>🔥</text>}
        <text x={lx} y={ly} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={size} fill={o ? '#e8fbff' : '#4f8ea3'}>{t}</text>
        {labels === 'names' && o && (
          <text x={lx} y={ly + size * 0.95} textAnchor="middle" fontFamily={MONO} fontSize={size * 0.72} fill={o.color}>
            {shortName(o.name).toUpperCase()}
          </text>
        )}
      </g>
    )
  }

  const z = box ? box.w / NE.w : 1
  const toInset = ([x, y]: [number, number]): [number, number] => box ? [box.x + (x - NE.x) * z, box.y + (y - NE.y) * z] : [x, y]

  return (
    <svg viewBox={`0 0 ${view.w} ${view.h}`} className={className} role="img" aria-label="The Conquest war map">
      <defs>
        <radialGradient id="cq-bg" cx="42%" cy="55%" r="75%">
          <stop offset="0" stopColor="#0b1a24" />
          <stop offset="1" stopColor="#03070a" />
        </radialGradient>
        {box && <clipPath id="cq-ne"><rect x={box.x} y={box.y} width={box.w} height={box.h} rx={8} /></clipPath>}
      </defs>
      <rect x={0} y={0} width={M.width} height={M.height} rx={10} fill="url(#cq-bg)" />
      <path d={M.grid} fill="none" stroke={CYAN} strokeOpacity={0.07} strokeWidth={0.6} />
      <Lands owners={owners} colorOf={colorOf} you={you} highlight={highlight} highlightColor={highlightColor} />
      <Contested items={contested} />
      {/* Sea lanes */}
      {M.lanes.map(l => (
        <g key={`${l.a}-${l.b}`}>
          <path d={l.d} fill="none" stroke={CYAN} strokeOpacity={0.65} strokeWidth={1.6} strokeDasharray="3 4" strokeLinecap="round" />
          {l.ends.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.6} fill={CYAN} />)}
        </g>
      ))}
      {TERRITORIES.filter(t => !(box && NE_SET.has(t))).map(t => cityMark(t, M.label[t], M.stadium[t], 12 * labelScale))}
      {box && (
        <>
          <rect x={NE.x} y={NE.y} width={NE.w} height={NE.h} fill="none" stroke={CYAN} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 3" />
          <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={8} fill="#04090d" />
          <g clipPath="url(#cq-ne)">
            <g transform={`translate(${box.x} ${box.y}) scale(${z}) translate(${-NE.x} ${-NE.y})`}>
              <path d={M.grid} fill="none" stroke={CYAN} strokeOpacity={0.07} strokeWidth={0.6 / z} />
              <Lands owners={owners} colorOf={colorOf} you={you} highlight={highlight} highlightColor={highlightColor} z={z} />
              <Contested items={contested.filter(c => NE_SET.has(c.team))} z={z} />
            </g>
            {NORTHEAST_CITIES.map(t => cityMark(t, toInset(M.label[t]), toInset(M.stadium[t]), 14 * labelScale))}
          </g>
          <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={8} fill="none" stroke={CYAN} strokeOpacity={0.55} strokeWidth={1.2} />
          <text x={box.x + 10} y={box.y + 20} fontFamily={MONO} fontWeight={700} fontSize={13} letterSpacing={2} fill={CYAN}>NORTHEAST</text>
        </>
      )}
    </svg>
  )
})

