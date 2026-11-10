import { Fragment, useMemo, useState } from 'react'
import { Compass } from 'lucide-react'
import clsx from 'clsx'
import { compassCorner, compassXY, COMPASS_CORNERS, type ShopCompass, type CompassDot } from './standings'

const pct = (v: number) => `${Math.round(v * 100)}%`

/** Dots at the very edge sit this far in (percent of the chart), so none is cut off. */
const INSET = 7
/** −1…1 on an axis → percent across the chart. */
const place = (v: number) => INSET + ((v + 1) / 2) * (100 - 2 * INSET)

const points = (n: number) => `${n} point${n === 1 ? '' : 's'}`

type Spot = { at: { x: number; y: number }; was: { x: number; y: number } | null }
/** Moved far enough since last week to draw a trail. */
const moved = (at: Spot['at'], was: NonNullable<Spot['was']>) => Math.hypot(at.x - was.x, at.y - was.y) > 0.02
/** The picked dot's name tag goes on the side away from its trail, unless that runs off the chart. */
const tagBelow = ({ at, was }: Spot) =>
  at.y < -0.7 ? false : at.y > 0.7 ? true : was ? was.y > at.y : at.y > 0.5

/** "Week 9 moved you 2 points toward the underdogs and 1 toward home teams." */
function driftLine(d: CompassDot, week: number, you: boolean): string | null {
  if (!d.before) return null
  const fav = Math.round((d.favorites - d.before.favorites) * 100)
  const home = Math.round((d.home - d.before.home) * 100)
  if (!fav && !home) return `${you ? 'You' : 'They'} held steady in Week ${week}.`
  const parts: string[] = []
  if (fav) parts.push(`${points(Math.abs(fav))} toward ${fav > 0 ? 'the favorites' : 'the underdogs'}`)
  if (home) {
    const toward = `toward ${home > 0 ? 'home teams' : 'road teams'}`
    parts.push(parts.length ? `${Math.abs(home)} ${toward}` : `${points(Math.abs(home))} ${toward}`)
  }
  return `Week ${week} moved ${you ? 'you' : 'them'} ${parts.join(' and ')}.`
}

function Face({ name, src, className }: { name: string; src: string | null | undefined; className?: string }) {
  return (
    <span className={clsx('rounded-full bg-field-700 flex items-center justify-center font-bold text-gold overflow-hidden shrink-0', className)}>
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : name[0]?.toUpperCase()}
    </span>
  )
}

/**
 * The Shop Compass: the whole league on one chart, favorites to
 * underdogs across and home teams to road teams up and down, with the
 * league average in the middle. Each dot's thin line runs from where it
 * stood before the latest week. Tap a dot, or a name in the corners
 * below, to see that player's numbers; you're picked to start with.
 */
export function ShopCompassPanel({ compass, currentUserId, avatars, onOpen }: {
  compass: ShopCompass
  currentUserId?: string
  avatars: Map<string, string | null>
  onOpen?: (userId: string) => void
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const has = (id: string | null | undefined): id is string => !!id && compass.dots.some(d => d.userId === id)
  const selectedId = has(picked) ? picked : has(currentUserId) ? currentUserId : null
  const sel = compass.dots.find(d => d.userId === selectedId) ?? null
  const nameOf = (d: CompassDot) => (d.userId === currentUserId ? 'You' : d.name)

  const spots = useMemo(() => compass.dots.map(d => ({
    d,
    at: compassXY(d, compass),
    was: d.before ? compassXY(d.before, compass) : null,
  })), [compass])
  // The ones furthest into a corner first
  const corners = useMemo(() => COMPASS_CORNERS.map(c => ({
    c,
    dots: spots.filter(s => compassCorner(s.d, compass.center) === c)
      .sort((a, b) => Math.abs(b.at.x) + Math.abs(b.at.y) - (Math.abs(a.at.x) + Math.abs(a.at.y)))
      .map(s => s.d),
  })), [spots, compass.center])
  // You, then whoever's picked, drawn last so they sit on top
  const layer = (id: string) => (id === selectedId ? 2 : id === currentUserId ? 1 : 0)
  const drawn = [...spots].sort((a, b) => layer(a.d.userId) - layer(b.d.userId))
  const selSpot = spots.find(s => s.d.userId === selectedId) ?? null

  return (
    <div className="panel">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
          <Compass className="w-5 h-5 text-gold" />
        </div>
        <div className="min-w-0">
          <p className="font-cond font-bold text-[11px] uppercase tracking-[0.18em] text-gold">The Shop Compass</p>
          <p className="text-xs text-field-400">How everyone picks, through Week {compass.week}</p>
        </div>
      </div>

      <div className="relative mt-3 w-full max-w-md mx-auto aspect-square rounded-lg border border-field-700 bg-field-900/60 overflow-hidden">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden>
          <rect x="50" y="0" width="50" height="50" className="fill-field-800/60" />
          <rect x="0" y="50" width="50" height="50" className="fill-field-800/60" />
          <line x1="50" y1="0" x2="50" y2="100" className="stroke-field-600" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <line x1="0" y1="50" x2="100" y2="50" className="stroke-field-600" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          {spots.map(({ d, at, was }) => d.userId !== selectedId && was && moved(at, was) && (
            <line
              key={d.userId}
              x1={place(was.x)} y1={place(-was.y)} x2={place(at.x)} y2={place(-at.y)}
              className="stroke-field-500/60"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {/* The corners, and which way each axis runs */}
        {COMPASS_CORNERS.map((c, i) => (
          <span
            key={c}
            className={clsx(
              'absolute font-cond font-bold text-[10px] uppercase tracking-[0.14em] text-field-400 pointer-events-none',
              i < 2 ? 'top-1.5' : 'bottom-1.5', i % 2 ? 'right-2' : 'left-2',
            )}
          >{c}</span>
        ))}
        <span className="absolute left-1/2 top-1.5 -translate-x-1/2 text-[10px] text-field-400 pointer-events-none">▲ Home teams</span>
        <span className="absolute left-1/2 bottom-1.5 -translate-x-1/2 text-[10px] text-field-400 pointer-events-none">▼ Road teams</span>
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-field-400 pointer-events-none [writing-mode:vertical-rl] rotate-180">Favorites</span>
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-field-400 pointer-events-none [writing-mode:vertical-rl]">Underdogs</span>

        {drawn.map(({ d, at }) => {
          const on = d.userId === selectedId
          const trail = on && selSpot?.was && moved(selSpot.at, selSpot.was) ? selSpot.was : null
          const you = d.userId === currentUserId
          return (
            <Fragment key={d.userId}>
            {/* The picked dot's trail, over everyone else's dots */}
            {trail && (
              <>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
                  <line x1={place(trail.x)} y1={place(-trail.y)} x2={place(at.x)} y2={place(-at.y)} className="stroke-gold" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                </svg>
                <span
                  className="absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] rounded-full border-2 border-gold bg-field-900 pointer-events-none"
                  style={{ left: `${place(trail.x)}%`, top: `${place(-trail.y)}%` }}
                  aria-hidden
                />
              </>
            )}
            <button
              type="button"
              onClick={() => setPicked(d.userId)}
              aria-pressed={on}
              aria-label={`${nameOf(d)}: ${compassCorner(d, compass.center)}, ${pct(d.favorites)} favorites, ${pct(d.home)} home teams`}
              className={clsx(
                'absolute w-7 h-7 -ml-3.5 -mt-3.5 rounded-full transition-transform',
                on ? 'ring-2 ring-white scale-125' : you ? 'ring-2 ring-gold' : 'ring-1 ring-field-900',
              )}
              style={{ left: `${place(at.x)}%`, top: `${place(-at.y)}%` }}
            >
              <Face name={d.name} src={avatars.get(d.userId)} className="w-full h-full text-[11px]" />
            </button>
            </Fragment>
          )
        })}
        {selSpot && (
          <span
            className={clsx(
              'absolute pointer-events-none whitespace-nowrap rounded bg-field-950/90 px-1.5 py-0.5 text-[11px] font-bold text-white',
              selSpot.at.x < -0.6 ? '-ml-3' : selSpot.at.x > 0.6 ? '-translate-x-full ml-3' : '-translate-x-1/2',
              tagBelow(selSpot) ? 'mt-5' : '-translate-y-full -mt-5',
            )}
            style={{ left: `${place(selSpot.at.x)}%`, top: `${place(-selSpot.at.y)}%` }}
          >{nameOf(selSpot.d)}</span>
        )}
      </div>

      {sel && (
        <div className="mt-3 flex items-center gap-3">
          <Face name={sel.name} src={avatars.get(sel.userId)} className="w-10 h-10 text-sm" />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-2 min-w-0">
              <span className={clsx('font-bold truncate', sel.userId === currentUserId ? 'text-gold' : 'text-white')}>{nameOf(sel)}</span>
              <span className="font-cond font-bold text-[11px] uppercase tracking-[0.14em] text-gold shrink-0">{compassCorner(sel, compass.center)}</span>
            </p>
            <p className="text-xs text-field-300">
              <span className="font-bold text-white tabular-nums">{pct(sel.favorites)}</span> favorites ·{' '}
              <span className="font-bold text-white tabular-nums">{pct(sel.home)}</span> home teams
            </p>
            {driftLine(sel, compass.week, sel.userId === currentUserId) && (
              <p className="text-xs text-field-400">{driftLine(sel, compass.week, sel.userId === currentUserId)}</p>
            )}
          </div>
          {onOpen && (
            <button type="button" onClick={() => onOpen(sel.userId)} className="text-xs font-bold text-gold shrink-0 hover:underline">
              Player card
            </button>
          )}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {corners.map(({ c, dots }) => (
          <div key={c} className="rounded-lg border border-field-700/60 bg-field-900/50 px-2.5 py-2 min-w-0">
            <p className="font-cond font-bold text-[10px] uppercase tracking-[0.16em] text-gold">{c}</p>
            {dots.length ? (
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                {dots.map(d => (
                  <button
                    key={d.userId}
                    type="button"
                    onClick={() => setPicked(d.userId)}
                    className={clsx(
                      'text-xs truncate max-w-full',
                      d.userId === selectedId ? 'font-bold text-white underline underline-offset-2'
                        : d.userId === currentUserId ? 'text-gold' : 'text-field-300 hover:text-white',
                    )}
                  >{nameOf(d)}</button>
                ))}
              </div>
            ) : <p className="mt-1 text-xs text-field-600">Nobody</p>}
          </div>
        ))}
      </div>

      <p className="mt-2 text-[10px] text-field-500 leading-snug">
        The middle is the league average: {pct(compass.center.favorites)} favorites, {pct(compass.center.home)} home teams.
        Finished games only. Each line runs from where someone stood before Week {compass.week}.
      </p>
    </div>
  )
}
