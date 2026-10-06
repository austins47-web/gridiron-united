import { memo } from 'react'
import { MAP, TERRITORIES, hexCenter } from '../../../supabase/functions/_shared/conquest.ts'
import { teamLogoUrl } from '@/components/teams/teamIds'
import type { ConquestPlayer } from './conquestView'

// The Conquest map: the 32 NFL cities as hexes, each in its owner's
// color, with the team's logo faded behind, a ★ on a capital its owner
// still holds and a 🔥 on one under siege. One SVG for the app and the
// Shop TV; it scales to whatever width it's given.

const W = 100                    // a hex's width, in map units
const R = W / Math.sqrt(3)       // its corner radius
const GAP = 0.93                 // drawn a little small, so the borders show
const corners = [30, 90, 150, 210, 270, 330].map(d => (d * Math.PI) / 180)
const hexPoints = (cx: number, cy: number, scale = GAP) =>
  corners.map(a => `${(cx + R * scale * Math.cos(a)).toFixed(1)},${(cy + R * scale * Math.sin(a)).toFixed(1)}`).join(' ')

const centers = Object.fromEntries(TERRITORIES.map(t => {
  const [x, y] = hexCenter(t)
  return [t, [x * W, y * W] as [number, number]]
}))
const xs = Object.values(centers).map(c => c[0]), ys = Object.values(centers).map(c => c[1])
const PAD = 8
const VIEW = {
  x: Math.min(...xs) - W / 2 - PAD,
  y: Math.min(...ys) - R - PAD,
  w: Math.max(...xs) - Math.min(...xs) + W + PAD * 2,
  h: Math.max(...ys) - Math.min(...ys) + R * 2 + PAD * 2,
}
/** The map's width over its height, for sizing a box to fit it. */
export const MAP_ASPECT = VIEW.w / VIEW.h

const UNCLAIMED = '#2b2b2b'
/** White lettering with a dark edge reads on every empire's color */
const OUTLINE = { stroke: '#000000', strokeWidth: 4, strokeOpacity: 0.75, paintOrder: 'stroke' as const }
const shortName = (name: string) => {
  const first = name.trim().split(/\s+/)[0] ?? ''
  return first.length > 9 ? first.slice(0, 8) + '…' : first
}

export const ConquestMap = memo(function ConquestMap({
  owners, besieged = {}, players, you, highlight, highlightColor, labels = 'abbr', logos = true, className,
}: {
  owners: Record<string, string | null>
  besieged?: Record<string, string>
  players: ConquestPlayer[]
  /** your cities get a white outline */
  you?: string | null
  /** a city to ring (the war report's move) */
  highlight?: string | null
  highlightColor?: string
  /** under each abbreviation: the owner's name (the TV), or nothing (small maps) */
  labels?: 'abbr' | 'names'
  logos?: boolean
  className?: string
}) {
  const byId = new Map(players.map(p => [p.userId, p]))
  return (
    <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} className={className} role="img" aria-label="The Conquest map">
      {TERRITORIES.map(t => {
        const [cx, cy] = centers[t]
        const owner = owners[t] ? byId.get(owners[t]!) : undefined
        const capital = !!owner && owner.capital === t
        const siege = !!besieged[t]
        const mine = !!you && owners[t] === you
        const logo = logos ? teamLogoUrl({ abbr: t }, 'NFL') : null
        return (
          <g key={t}>
            <polygon
              points={hexPoints(cx, cy)}
              fill={owner?.color ?? UNCLAIMED}
              fillOpacity={owner ? 0.92 : 1}
              stroke={mine ? '#ffffff' : '#0b0b0b'}
              strokeWidth={mine ? 5 : 3}
            />
            {logo && <image href={logo} x={cx - 22} y={cy - 26} width={44} height={44} opacity={owner ? 0.28 : 0.18} />}
            <text
              x={cx} y={labels === 'names' ? cy - 2 : cy + 7}
              textAnchor="middle"
              className="font-cond"
              fontWeight={900}
              fontSize={labels === 'names' ? 22 : 24}
              fill={owner ? '#ffffff' : '#8a8a8a'}
              {...(owner ? OUTLINE : {})}
            >
              {t}
            </text>
            {labels === 'names' && owner && (
              <text x={cx} y={cy + 20} textAnchor="middle" className="font-cond" fontWeight={700} fontSize={15} fill="#ffffff" {...OUTLINE}>
                {shortName(owner.name)}
              </text>
            )}
            {capital && <text x={cx + 26} y={cy - 20} textAnchor="middle" fontSize={19} fill="#ffffff" {...OUTLINE}>★</text>}
            {siege && <text x={cx - 25} y={cy - 20} textAnchor="middle" fontSize={18}>🔥</text>}
          </g>
        )
      })}
      {highlight && MAP[highlight] && (
        <polygon
          points={hexPoints(centers[highlight][0], centers[highlight][1], 1.08)}
          fill="none"
          stroke={highlightColor ?? '#ffffff'}
          strokeWidth={8}
        />
      )}
    </svg>
  )
})
