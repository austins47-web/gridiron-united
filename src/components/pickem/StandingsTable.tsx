import { Crown, Flame, Minus, Check, X } from 'lucide-react'
import clsx from 'clsx'
import { rankOf, type StandingRow, type WeekRow } from './standings'
import { useFlipList } from '@/hooks/useFlipList'

export function StandingsTable({
  rows, currentUserId, thisWeekRows,
}: {
  rows: StandingRow[]
  currentUserId?: string
  thisWeekRows: WeekRow[]
}) {
  // Rows are already sorted by rank (rankOf/computeStandings does
  // that upstream) — this just animates the reorder whenever that
  // order changes, e.g. after a week's picks grade and someone
  // moves up. Hook is called unconditionally before the early
  // return below, since hooks can't follow a conditional return.
  const tbodyRef = useFlipList(rows.map(r => r.userId))
  const thisWeekByUser = new Map(thisWeekRows.map(r => [r.userId, r]))

  if (rows.length === 0) {
    return (
      <div className="panel text-center py-8">
        <p className="text-field-400 text-sm">No members in this league yet</p>
      </div>
    )
  }

  const anyPlayed = rows.some(r => r.played > 0)
  const leader = rows[0]

  return (
    <div className="space-y-3">
      {/* Leader strip — only once results exist */}
      {anyPlayed && leader.correct > 0 && (
        <div className="jumbotron">
          <div className="relative px-5 py-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-gold flex items-center justify-center shrink-0 overflow-hidden">
              {leader.avatarUrl
                ? <img src={leader.avatarUrl} alt="" className="w-full h-full object-cover" />
                : <Crown className="w-5 h-5 text-field-950" />
              }
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-cond font-bold text-[12px] uppercase tracking-[0.2em] text-gold">
                Season Leader
              </p>
              <p className="font-cond font-black text-white text-2xl leading-none truncate mt-0.5">
                {leader.name}
              </p>
              {leader.username && (
                <p className="text-field-400 text-xs truncate mt-1">@{leader.username}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="readout-value">{leader.correct}</p>
              <p className="readout-label mt-1">Correct</p>
            </div>
          </div>
        </div>
      )}

      {/* Standings — a card per player, not a table. A real 7-column
          table (rank, player, overall, this week, pct, tiebreaker,
          weeks won) genuinely doesn't fit a phone width without
          horizontal scroll, which is exactly what this replaces:
          the primary row (rank/avatar/name/overall) stays prominent,
          and the remaining four stats wrap onto their own row as
          labeled values instead of rigid table columns — nothing
          requires side-scrolling to reach on any screen width. */}
      <div className="panel !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-field-700 flex items-center justify-between">
          <span className="font-cond font-black text-sm uppercase tracking-[0.14em] text-white">
            Standings
          </span>
          <span className="text-field-500 text-xs">{rows.length} players</span>
        </div>

        <div ref={tbodyRef as any} className="divide-y divide-field-700/40">
          {rows.map((r, i) => {
            const rank = rankOf(rows, i)
            const isYou = r.userId === currentUserId
            const losses = r.played - r.correct
            const wk = thisWeekByUser.get(r.userId)
            const wkLosses = wk ? wk.played - wk.correct : 0
            return (
              <div
                key={r.userId}
                data-flip-key={r.userId}
                className={clsx('px-3 py-2.5', isYou ? 'bg-gold/[0.06]' : '')}
              >
                {/* Primary row */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className={clsx(
                    'font-cond font-black tabular-nums w-5 text-right shrink-0',
                    rank === 1 ? 'text-gold' : 'text-field-500',
                  )}>
                    {rank}
                  </span>
                  <div className="w-6 h-6 rounded-full bg-field-700 flex items-center justify-center text-[11px] font-bold text-gold overflow-hidden shrink-0">
                    {r.avatarUrl
                      ? <img src={r.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                      : r.name[0]?.toUpperCase()
                    }
                  </div>
                  <div className="min-w-0 flex-1 flex flex-col leading-tight">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={clsx('font-bold truncate', isYou ? 'text-gold' : 'text-white')}>
                        {r.name}
                      </span>
                      {isYou && (
                        <span className="text-[11px] font-bold uppercase tracking-wider text-gold shrink-0">you</span>
                      )}
                      {r.streak >= 2 && (
                        <span title={`${r.streak} weekly wins in a row`} className="flex items-center gap-0.5 text-[11px] font-bold text-gold shrink-0">
                          <Flame className="w-3 h-3" />{r.streak}
                        </span>
                      )}
                      {wk?.submitted ? (
                        <Check className="w-3.5 h-3.5 text-gold shrink-0" aria-label="Picks submitted this week" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-red-400 shrink-0" aria-label="No picks submitted this week" />
                      )}
                    </div>
                    {r.username && (
                      <span className="text-[11px] text-field-500 truncate">@{r.username}</span>
                    )}
                  </div>
                  <span className="font-cond font-black text-white tabular-nums shrink-0">
                    {r.correct}-{losses < 0 ? 0 : losses}
                  </span>
                </div>

                {/* Secondary stats — wraps naturally, never scrolls */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 pl-7 text-xs">
                  <span className="flex items-center gap-1">
                    <span className="text-field-600">This wk</span>
                    {wk && wk.submitted ? (
                      <span className="font-bold text-field-300 tabular-nums">{wk.correct}-{wkLosses < 0 ? 0 : wkLosses}</span>
                    ) : (
                      <Minus className="w-3 h-3 text-field-600" />
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-field-600">Pct</span>
                    <span className={clsx('font-bold tabular-nums', r.played === 0 ? 'text-field-600' : r.pct >= 0.6 ? 'text-gold' : 'text-field-300')}>
                      {r.played > 0 ? `${Math.round(r.pct * 100)}%` : '—'}
                    </span>
                  </span>
                  <span className="flex items-center gap-1" title="Season total of |guess − actual| across every completed week — lower is closer, used to break ties in the standings">
                    <span className="text-field-600">TB</span>
                    {r.tiebreakerWeeksSubmitted > 0 ? (
                      <span className="font-bold text-field-300 tabular-nums">{r.tiebreakerTotal}</span>
                    ) : (
                      <Minus className="w-3 h-3 text-field-600" />
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-field-600">Wks won</span>
                    {r.weeksWon > 0 ? (
                      <span className="font-black text-gold tabular-nums">{r.weeksWon}</span>
                    ) : (
                      <Minus className="w-3 h-3 text-field-600" />
                    )}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {!anyPlayed && (
          <div className="px-4 py-3 border-t border-field-700 text-center">
            <p className="text-field-500 text-xs">
              Everyone starts 0-0. Records update as games go final.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
