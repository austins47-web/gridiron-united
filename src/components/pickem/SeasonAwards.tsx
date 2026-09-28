import { Award, Crown, Medal, Flame, Star, Zap, Dog, Target, Sparkles, Skull, HeartCrack, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import { whenDecided } from './standings'
import type { SeasonAwards } from './season'

const ICONS: Record<string, LucideIcon> = {
  champion: Crown, weeksWon: Medal, streak: Flame, bestWeek: Star,
  boldestCall: Zap, underdog: Dog, tiebreaker: Target, whisperer: Sparkles, jinx: Skull, heartbreak: HeartCrack,
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

  const shame = data.hallOfShame.length > 0 && (
    <div className="mt-4">
      <p className="flex items-center gap-1.5 font-cond font-bold text-[11px] uppercase tracking-[0.16em] text-field-400 mb-1.5">
        <Skull className="w-3.5 h-3.5 text-field-400" /> Hall of Shame
      </p>
      <ol className="divide-y divide-field-700/50 rounded-xl border border-field-700/60 bg-field-900/50">
        {data.hallOfShame.map((b, i) => (
          <li key={b.gameId} className="flex items-start gap-3 px-3 py-2">
            <span className="font-cond font-black text-field-500 w-4 text-right shrink-0">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white">
                <span className="font-cond font-black">{b.loser}</span> at{' '}
                <span className="font-cond font-black text-gold">{Math.round(b.peak * 100)}%</span>
                <span className="text-field-400"> · lost {b.loserScore}–{b.winnerScore}
                  {b.decided ? `, ${b.winner} went ahead ${whenDecided(b.decided)}` : ''} · Wk {b.week}</span>
              </p>
              <p className="text-xs text-field-500 truncate">
                {b.victimNames.length <= 3
                  ? b.victimNames.join(', ')
                  : `${b.victimNames.slice(0, 3).join(', ')} +${b.victimNames.length - 3} more`} had them
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )

  if (bare) return <>{list}{shame}</>

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
      {shame}
    </div>
  )
}
