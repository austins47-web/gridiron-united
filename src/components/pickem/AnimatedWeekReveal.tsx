import { useState, useEffect } from 'react'
import { WeekRecap } from './WeekRecap'
import type { WeekRow } from './standings'

/**
 * The animated version of "who won the week" — plays exactly once
 * per league+week, ever (localStorage-gated), the first time it's
 * viewed after the week actually completes. After that first
 * viewing (or on any later revisit/refresh), just renders the
 * plain WeekRecap directly — zero change to existing behavior for
 * anyone who's already seen a given week's reveal.
 *
 * Winner-detection logic is intentionally identical to WeekRecap's
 * own (same tie rule: highest correct, ties broken by tiebreaker
 * distance) so the animated sequence and the static card it settles
 * into never disagree about who actually won.
 */
export function AnimatedWeekReveal({ leagueId, week, rows, tiebreakerTotal, currentUserId }: {
  leagueId: string
  week: number
  rows: WeekRow[]
  tiebreakerTotal: number | null
  currentUserId?: string
}) {
  const storageKey = `reveal-seen-${leagueId}-${week}`
  const [phase, setPhase] = useState<'animate' | 'settled'>(() => {
    try {
      return localStorage.getItem(storageKey) ? 'settled' : 'animate'
    } catch {
      return 'settled' // localStorage unavailable — fail safe to the plain, already-proven card
    }
  })

  const played = rows.filter(r => r.submitted)

  useEffect(() => {
    if (phase !== 'animate' || played.length === 0) return
    // Runs the whole sequence once, then marks seen and settles
    // into the same WeekRecap this would have shown anyway.
    const totalMs = 900 + played.length * 300 + 800
    const t = setTimeout(() => {
      try { localStorage.setItem(storageKey, '1') } catch { /* ignore */ }
      setPhase('settled')
    }, totalMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, played.length])

  if (played.length === 0) return null
  if (phase === 'settled') {
    return <WeekRecap week={week} rows={rows} tiebreakerTotal={tiebreakerTotal} currentUserId={currentUserId} />
  }

  const top = played[0]
  const winners = played.filter(
    r => r.correct === top.correct &&
         (r.tiebreakerDiff ?? Infinity) === (top.tiebreakerDiff ?? Infinity)
  )
  const winner = winners[0]
  // Worst-to-best, winner last — the whole point of a reveal
  const ordered = [...played].filter(r => r !== winner)
    .sort((a, b) => a.correct - b.correct)

  return (
    <div className="jumbotron relative overflow-hidden">
      <div className="relative px-5 py-5">
        <div className="wkreveal-eyebrow font-cond font-bold text-[10px] tracking-[.3em] uppercase text-gold opacity-0 mb-1">
          Week {week} · Final
        </div>
        <div className="wkreveal-title font-cond font-black text-2xl uppercase text-white opacity-0 mb-4">
          Results Are In
        </div>

        <div className="space-y-1.5 mb-2">
          {ordered.map((r, i) => (
            <div key={r.userId}
              className="wkreveal-row flex items-center gap-2.5 px-3 py-2 rounded-lg bg-field-800 border border-field-700 opacity-0"
              style={{ animationDelay: `${0.55 + i * 0.3}s` }}
            >
              <span className="font-cond font-black text-sm text-field-500 w-5">{ordered.length - i + 1}</span>
              <span className="font-bold text-sm text-white flex-1 truncate">{r.name}</span>
              <span className="font-cond font-bold text-sm text-field-300 tabular-nums">
                {r.correct}-{r.played - r.correct < 0 ? 0 : r.played - r.correct}
              </span>
            </div>
          ))}
        </div>

        {winner && (
          <div
            className="wkreveal-winner flex items-center gap-3 px-4 py-3.5 rounded-xl bg-gold/[0.08] border border-gold/35 opacity-0"
            style={{ animationDelay: `${0.55 + ordered.length * 0.3 + 0.3}s` }}
          >
            <div className="w-10 h-10 rounded-lg bg-gold flex items-center justify-center shrink-0 text-field-950 text-lg">
              👑
            </div>
            <div className="min-w-0">
              <div className="font-cond font-bold text-[10px] tracking-[.2em] uppercase text-gold">Week winner</div>
              <div className="font-cond font-black text-lg text-white truncate">
                {winner.name} — {winner.correct}-{winner.played - winner.correct < 0 ? 0 : winner.played - winner.correct}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
