import { Crown, Flame, Minus } from 'lucide-react'
import clsx from 'clsx'
import { rankOf, type StandingRow } from './standings'
import { useFlipList } from '@/hooks/useFlipList'

export function StandingsTable({
  rows, currentUserId,
}: {
  rows: StandingRow[]
  currentUserId?: string
}) {
  // Rows are already sorted by rank (rankOf/computeStandings does
  // that upstream) — this just animates the reorder whenever that
  // order changes, e.g. after a week's picks grade and someone
  // moves up. Hook is called unconditionally before the early
  // return below, since hooks can't follow a conditional return.
  const tbodyRef = useFlipList(rows.map(r => r.userId))

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
            <div className="w-11 h-11 rounded-xl bg-gold flex items-center justify-center shrink-0">
              <Crown className="w-5 h-5 text-field-950" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-cond font-bold text-[12px] uppercase tracking-[0.2em] text-gold">
                Season Leader
              </p>
              <p className="font-cond font-black text-white text-2xl leading-none truncate mt-0.5">
                {leader.name}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="readout-value">{leader.correct}</p>
              <p className="readout-label mt-1">Correct</p>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="panel !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-field-700 flex items-center justify-between">
          <span className="font-cond font-black text-sm uppercase tracking-[0.14em] text-white">
            Standings
          </span>
          <span className="text-field-500 text-xs">{rows.length} players</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-field-700">
                {['#', 'Player', 'W-L', 'Correct', 'Pct', 'Wks', 'Last'].map((h, i) => (
                  <th
                    key={h}
                    className={clsx(
                      'px-3 py-2 font-cond font-bold text-[12px] uppercase tracking-[0.14em] text-field-500 whitespace-nowrap',
                      i === 1 ? 'text-left' : i === 0 ? 'text-left w-10' : 'text-center',
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody ref={tbodyRef as any}>
              {rows.map((r, i) => {
                const rank = rankOf(rows, i)
                const isYou = r.userId === currentUserId
                const losses = r.played - r.correct
                return (
                  <tr
                    key={r.userId}
                    data-flip-key={r.userId}
                    className={clsx(
                      'border-b border-field-700/40 last:border-0 transition-colors',
                      isYou ? 'bg-gold/[0.06]' : 'hover:bg-field-800/40',
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <span className={clsx(
                        'font-cond font-black tabular-nums',
                        rank === 1 ? 'text-gold' : 'text-field-500',
                      )}>
                        {rank}
                      </span>
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={clsx(
                          'font-bold truncate',
                          isYou ? 'text-gold' : 'text-white',
                        )}>
                          {r.name}
                        </span>
                        {isYou && (
                          <span className="text-[11px] font-bold uppercase tracking-wider text-gold shrink-0">
                            you
                          </span>
                        )}
                        {r.streak >= 2 && (
                          <span
                            title={`${r.streak} weekly wins in a row`}
                            className="flex items-center gap-0.5 text-[11px] font-bold text-gold shrink-0"
                          >
                            <Flame className="w-3 h-3" />{r.streak}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Record — the headline number */}
                    <td className="px-3 py-2.5 text-center">
                      <span className="font-cond font-black text-white tabular-nums">
                        {r.correct}-{losses < 0 ? 0 : losses}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 text-center text-field-300 tabular-nums">
                      {r.correct}
                      <span className="text-field-600">/{r.played}</span>
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      <span className={clsx(
                        'font-bold tabular-nums',
                        r.played === 0 ? 'text-field-600'
                        : r.pct >= 0.6 ? 'text-gold'
                        : 'text-field-300',
                      )}>
                        {r.played > 0 ? `${Math.round(r.pct * 100)}%` : '—'}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      {r.weeksWon > 0 ? (
                        <span className="font-cond font-black text-gold tabular-nums">
                          {r.weeksWon}
                        </span>
                      ) : (
                        <Minus className="w-3 h-3 text-field-600 mx-auto" />
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-center text-field-400 tabular-nums">
                      {r.lastWeek != null ? r.lastWeek : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
