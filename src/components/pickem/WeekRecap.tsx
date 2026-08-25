import { Trophy, Crown, Target, Flame, Medal } from 'lucide-react'
import clsx from 'clsx'
import type { WeekRow } from './standings'

/**
 * The end-of-week winner's post.
 *
 * Rendered only once every game in the week is final. Leans on the
 * jumbotron treatment used on Home — this is the loudest moment in
 * a Pick'Em league, so it gets the biggest type on the page.
 */
export function WeekRecap({
  week, rows, tiebreakerTotal, currentUserId,
}: {
  week: number
  rows: WeekRow[]
  tiebreakerTotal: number | null
  currentUserId?: string
}) {
  const played = rows.filter(r => r.submitted)
  if (played.length === 0) return null

  const top = played[0]
  const winners = played.filter(
    r => r.correct === top.correct &&
         (r.tiebreakerDiff ?? Infinity) === (top.tiebreakerDiff ?? Infinity)
  )
  const runnersUp = played.filter(r => !winners.includes(r)).slice(0, 4)

  // Did the tiebreaker actually decide it?
  const tiedOnCorrect = played.filter(r => r.correct === top.correct)
  const decidedByTiebreak = tiedOnCorrect.length > winners.length

  const youWon = winners.some(w => w.userId === currentUserId)
  const totalGames = Math.max(...played.map(r => r.played), 0)

  return (
    <div className="jumbotron rise-in overflow-hidden">
      <div className="relative p-5 sm:p-6">

        {/* Eyebrow */}
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-3.5 h-3.5 text-gold" />
          <span className="font-cond font-bold text-[12px] uppercase tracking-[0.22em] text-gold">
            Week {week} Final
          </span>
        </div>

        {/* Winner */}
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <div className="w-14 h-14 rounded-2xl bg-gold flex items-center justify-center">
              <Crown className="w-7 h-7 text-field-950" />
            </div>
            {winners.length === 1 && (
              <div className="absolute -inset-1 rounded-2xl border-2 border-gold/40 play-clock pointer-events-none" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-cond font-bold text-[12px] uppercase tracking-[0.18em] text-field-400">
              {winners.length > 1 ? `${winners.length}-way tie` : 'Winner'}
            </p>
            <h2
              className="font-cond font-black uppercase text-white leading-[0.95] tracking-tight truncate"
              style={{ fontSize: 'clamp(1.6rem, 5.5vw, 2.6rem)' }}
            >
              {winners.map(w => w.name).join(' & ')}
            </h2>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
              <span className="font-cond font-black text-gold text-xl tabular-nums">
                {top.correct}
                <span className="text-field-500 text-sm font-bold">/{totalGames}</span>
              </span>
              <span className="text-field-400 text-sm">
                {totalGames > 0 ? Math.round((top.correct / totalGames) * 100) : 0}% correct
              </span>
              {youWon && (
                <span className="text-[12px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-gold text-field-950">
                  That's you
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tiebreaker detail — only when it actually mattered */}
        {decidedByTiebreak && tiebreakerTotal != null && (
          <div className="flex items-start gap-2 mt-4 bg-field-900/70 border border-field-700 rounded-xl px-3 py-2.5">
            <Target className="w-4 h-4 text-gold shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="text-white font-bold">Decided by tiebreaker</p>
              <p className="text-field-400 mt-0.5">
                Actual total was <span className="text-white font-bold tabular-nums">{tiebreakerTotal}</span>.
                {' '}{winners[0].name} guessed{' '}
                <span className="text-white font-bold tabular-nums">{winners[0].tiebreakerGuess}</span>
                {winners[0].tiebreakerDiff != null && (
                  <> — off by <span className="text-gold font-bold tabular-nums">{winners[0].tiebreakerDiff}</span></>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Runners-up */}
        {runnersUp.length > 0 && (
          <div className="mt-4">
            <p className="font-cond font-bold text-[12px] uppercase tracking-[0.18em] text-field-500 mb-2">
              Also this week
            </p>
            <div className="space-y-1">
              {runnersUp.map((r, i) => (
                <div
                  key={r.userId}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-1.5 rounded-lg',
                    r.userId === currentUserId ? 'bg-gold/[0.07]' : 'bg-field-900/50',
                  )}
                >
                  <span className="font-cond font-black text-xs text-field-500 w-4 tabular-nums">
                    {i + 2}
                  </span>
                  {i === 0 && <Medal className="w-3.5 h-3.5 text-field-300 shrink-0" />}
                  <span className={clsx(
                    'text-sm truncate flex-1',
                    r.userId === currentUserId ? 'text-gold font-bold' : 'text-field-200',
                  )}>
                    {r.name}
                  </span>
                  <span className="font-cond font-black text-sm text-white tabular-nums">
                    {r.correct}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Small inline banner for a week still in progress. */
export function WeekInProgress({ finished, total }: { finished: number; total: number }) {
  const pct = total > 0 ? Math.round((finished / total) * 100) : 0
  return (
    <div className="rounded-xl border border-field-700 bg-field-800/60 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 font-cond font-bold text-[12px] uppercase tracking-[0.18em] text-field-300">
          <Flame className="w-3.5 h-3.5 text-gold" />
          Week in progress
        </span>
        <span className="font-cond font-black text-xs text-white tabular-nums">
          {finished}/{total} final
        </span>
      </div>
      <div className="h-1.5 bg-field-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gold rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-field-500 text-xs mt-2">
        Final standings post once every game wraps.
      </p>
    </div>
  )
}
