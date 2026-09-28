import clsx from 'clsx'
import type { Belt } from './standings'

/**
 * The championship belt, as a small gold mark next to its holder's
 * name — Standings, the Board, Who Can Still Win, the odds panel and
 * league chat all show it.
 */
export function BeltIcon({ className, title = 'Holds the Belt' }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 14" className={clsx('text-gold shrink-0', className ?? 'w-[18px] h-[11px]')} role="img" aria-label={title}>
      <title>{title}</title>
      <rect x="0.5" y="4" width="23" height="6" rx="2.5" fill="currentColor" opacity="0.55" />
      <ellipse cx="12" cy="7" rx="6.5" ry="6.2" fill="currentColor" />
      <ellipse cx="12" cy="7" rx="3.6" ry="3.3" fill="#0A0A0A" opacity="0.3" />
      <circle cx="3.6" cy="7" r="1.1" fill="#0A0A0A" opacity="0.35" />
      <circle cx="20.4" cy="7" r="1.1" fill="#0A0A0A" opacity="0.35" />
    </svg>
  )
}

const weekLabel = (w: number) =>
  w === 19 ? 'Wild Card' : w === 20 ? 'Divisional' : w === 21 ? 'Conf.' : w === 22 ? 'Super Bowl' : `W${w}`

/**
 * Who holds the belt (the latest finished week's winner), how long
 * they've had it, and every week's champion so far.
 */
export function BeltPanel({ belt, currentUserId }: { belt: Belt; currentUserId?: string }) {
  const names = belt.holders.map(h => (h.userId === currentUserId ? 'You' : h.name)).join(' & ')
  const reign = Math.max(...belt.holders.map(h => h.reign))
  const status = belt.holders.length > 1 ? 'Shared after a tie'
    : reign >= 2 ? `Won ${reign} weeks straight`
    : belt.lineage.length === 1 ? 'First champ of the season'
    : `Took it in ${weekLabel(belt.week).replace(/^W/, 'Week ')}`

  return (
    <div className="panel">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
          <BeltIcon className="w-9 h-[22px]" title="The Belt" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-cond font-bold text-[11px] uppercase tracking-[0.18em] text-gold">The Belt</p>
          <p className="font-cond font-black text-xl uppercase text-white leading-tight truncate">{names}</p>
          <p className="text-xs text-field-400">{status}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {belt.lineage.map(l => {
          const current = l.week === belt.week
          return (
            <span
              key={l.week}
              className={clsx(
                'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs',
                current ? 'bg-gold/15 border-gold/40 text-gold' : 'bg-field-900/60 border-field-700 text-field-300',
              )}
            >
              <span className="font-bold tabular-nums">{weekLabel(l.week)}</span>
              <span className={clsx('truncate max-w-[9rem]', current ? 'text-gold' : 'text-field-200')}>
                {l.winners.map(w => w.name).join(' & ')}
              </span>
            </span>
          )
        })}
      </div>

      {belt.longest && (
        <p className="mt-2.5 text-xs text-field-400">
          Longest reign: <span className="font-bold text-white">{belt.longest.names.join(' & ')}</span>
          {' '}· {belt.longest.weeks} weeks straight
        </p>
      )}
    </div>
  )
}
