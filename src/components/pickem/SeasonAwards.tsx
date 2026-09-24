import { Award, Crown, Medal, Flame, Star, Zap, Dog, Target, Sparkles, Skull, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import type { SeasonAwards } from './season'

const ICONS: Record<string, LucideIcon> = {
  champion: Crown, weeksWon: Medal, streak: Flame, bestWeek: Star,
  boldestCall: Zap, underdog: Dog, tiebreaker: Target, whisperer: Sparkles, jinx: Skull,
}

/**
 * The league's season awards — "so far" during the season, "Final"
 * (with a Champion) once the Super Bowl is in. Used on the Pick'Em
 * Standings tab and in the League page's Hall of Fame.
 */
export function SeasonAwardsPanel({ data, bare = false }: { data: SeasonAwards; bare?: boolean }) {
  if (data.awards.length === 0) {
    return bare
      ? <p className="text-field-400 text-sm text-center py-4">Awards start filling in once Week 1 is final</p>
      : null
  }

  const list = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {data.awards.map(a => {
        const Icon = ICONS[a.key] ?? Award
        const champ = a.key === 'champion'
        return (
          <div
            key={a.key}
            className={clsx(
              'flex items-start gap-3 rounded-xl border px-3 py-2.5 min-w-0',
              champ ? 'bg-gold/[0.08] border-gold/40 sm:col-span-2' : 'bg-field-900/50 border-field-700/60',
            )}
          >
            <div className={clsx(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
              champ ? 'bg-gold text-field-950' : 'bg-field-800 text-gold',
            )}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-cond font-bold text-[10px] uppercase tracking-[0.16em] text-field-400">{a.label}</p>
              <p className="font-bold text-white text-sm truncate">{a.names.join(' & ')}</p>
              <p className="text-xs text-field-400">
                <span className="font-cond font-black text-gold">{a.headline}</span> · {a.detail}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )

  if (bare) return list

  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-2 font-cond font-black text-sm uppercase tracking-[0.14em] text-white">
          <Award className="w-4 h-4 text-gold" /> Season Awards
        </span>
        <span className={clsx(
          'text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5',
          data.final ? 'bg-gold text-field-950' : 'text-field-400 bg-field-800 border border-field-700',
        )}>
          {data.final ? 'Final' : 'So far'}
        </span>
      </div>
      {list}
    </div>
  )
}
