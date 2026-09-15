import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, Target, Medal, X, Flame, Crown, ArrowRight } from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '@/store/appStore'
import { usePickemWeekWinner } from '@/hooks/usePickemWeekWinner'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { playWinReveal } from '@/lib/sound'

const CONFETTI_COLORS = ['#CE7B45', '#DE9163', '#F0C846', '#5AA9FF', '#ffffff']

type ConfettiPiece = {
  left: number
  delay: number
  duration: number
  size: number
  color: string
  round: boolean
}

/**
 * Global "your league's Pick'Em week just wrapped" celebration.
 *
 * Lives in AppShell (not the Pick'Em page) so it's genuinely
 * unmissable — it fires the moment anyone with an active Pick'Em
 * league opens the app after that league's week goes final, no
 * matter what page they land on, rather than requiring a trip into
 * Pick'Em > Standings to ever see it. Fires once per league+week
 * (localStorage-gated, same pattern as AnimatedWeekReveal) and then
 * stays quiet — the permanent record of who won stays on the
 * Standings tab (WeekRecap), this is just the announcement.
 */
export function PickemWinnerPopup() {
  const { activeLeague, user } = useAppStore()
  const navigate = useNavigate()

  const isPickemLeague = activeLeague?.league_type === 'pickem'
  const result = usePickemWeekWinner(activeLeague?.id, isPickemLeague)

  const [open, setOpen] = useState(false)
  const [dismissedWeek, setDismissedWeek] = useState<number | null>(null)

  const leagueId = activeLeague?.id ?? null
  const week = result?.week ?? null

  useEffect(() => {
    if (!leagueId || week == null) { setOpen(false); return }
    if (dismissedWeek === week) return
    let seen = false
    try { seen = !!localStorage.getItem(`pwp-seen-${leagueId}-${week}`) } catch { /* ignore */ }
    if (!seen) {
      setOpen(true)
      playWinReveal()
    }
    // Only re-evaluate when the league or the detected week actually
    // changes — not on every 60s data refetch, which would otherwise
    // replay the sound/confetti for the exact same already-open popup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, week])

  const confetti = useMemo<ConfettiPiece[]>(() => {
    if (week == null) return []
    return Array.from({ length: 42 }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.7,
      duration: 2.4 + Math.random() * 1.6,
      size: 6 + Math.random() * 7,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      round: Math.random() > 0.5,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, week])

  if (!isPickemLeague || !open || !result || !leagueId || week == null) return null

  const { winners, runnersUp, totalGames, actualTiebreakerTotal, decidedByTiebreak, standings } = result
  const top = winners[0]
  const isTie = winners.length > 1
  const youWon = winners.some(w => w.userId === user?.id)
  const seasonLeaderId = standings[0]?.userId
  const isAlsoSeasonLeader = !isTie && top.userId === seasonLeaderId
  const myStanding = !isTie ? standings.find(s => s.userId === top.userId) : null

  function dismiss() {
    try { localStorage.setItem(`pwp-seen-${leagueId}-${week}`, '1') } catch { /* ignore */ }
    setDismissedWeek(week)
    setOpen(false)
  }

  function goToStandings() {
    dismiss()
    navigate('/app/pickem', { state: { pickemTab: 'standings' } })
  }

  return (
    <ModalPortal onClose={dismiss}>
      <div
        className="jumbotron pwp-card relative w-full max-w-md mx-auto overflow-hidden border-gold/40"
        onClick={e => e.stopPropagation()}
      >
        {/* Confetti layer */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {confetti.map((c, i) => (
            <span
              key={i}
              className={clsx('pwp-confetti-piece', c.round && 'rounded-full')}
              style={{
                left: `${c.left}%`,
                width: c.size,
                height: c.round ? c.size : c.size * 1.7,
                backgroundColor: c.color,
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.duration}s`,
              }}
            />
          ))}
        </div>

        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute top-3 right-3 z-20 text-field-400 hover:text-white transition-colors p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative px-6 pt-7 pb-6 text-center">
          <div className="pwp-trophy inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gold mb-3">
            <Trophy className="w-8 h-8 text-field-950" strokeWidth={2} />
          </div>

          <div className="pwp-eyebrow font-cond font-bold text-[11px] tracking-[.3em] uppercase text-gold opacity-0">
            Week {week} Complete · {activeLeague?.name}
          </div>

          <div className="pwp-name opacity-0 mt-1.5">
            <p className="font-cond font-bold text-[11px] uppercase tracking-[.2em] text-field-400 mb-1">
              {isTie ? `${winners.length}-Way Tie For First` : "This Week's Winner"}
            </p>
            <h2
              className="font-cond font-black uppercase text-white leading-[0.95] tracking-tight truncate"
              style={{ fontSize: 'clamp(1.5rem, 6vw, 2.25rem)' }}
            >
              {winners.map(w => w.name).join(' & ')}
            </h2>
            {youWon && (
              <span className="inline-block mt-2 text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-gold text-field-950">
                That's you!
              </span>
            )}
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-4">
            <span className="readout-value">{top.correct}</span>
            <span className="text-field-500 text-lg font-bold">/{totalGames}</span>
            <span className="text-field-400 text-sm ml-2">
              {totalGames > 0 ? `${Math.round((top.correct / totalGames) * 100)}% correct` : ''}
            </span>
          </div>

          {/* Season-context trio — only for a single, unambiguous
              winner. A multi-way tie can't cleanly show one person's
              streak/weeks-won here without implying it belongs to
              everyone named above. */}
          {myStanding && (
            <div className="pwp-stat stat-grid grid-cols-3 mt-5" style={{ animationDelay: '.55s' }}>
              <div className="stat-tile">
                <div className="stat-tile-value flex items-center justify-center gap-1">
                  {myStanding.weeksWon}
                  {myStanding.weeksWon > 0 && <Medal className="w-3.5 h-3.5 text-gold" />}
                </div>
                <div className="stat-tile-label">Weeks Won</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value flex items-center justify-center gap-1">
                  {myStanding.streak}
                  {myStanding.streak >= 2 && <Flame className="w-3.5 h-3.5 text-gold" />}
                </div>
                <div className="stat-tile-label">Win Streak</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{myStanding.correct}-{Math.max(0, myStanding.played - myStanding.correct)}</div>
                <div className="stat-tile-label">Season</div>
              </div>
            </div>
          )}

          {isAlsoSeasonLeader && (
            <div className="pwp-stat flex items-center justify-center gap-1.5 text-xs font-bold text-gold mt-3" style={{ animationDelay: '.65s' }}>
              <Crown className="w-3.5 h-3.5" />
              Also the season leader
            </div>
          )}

          {decidedByTiebreak && actualTiebreakerTotal != null && (
            <div
              className="pwp-stat flex items-start gap-2 mt-4 bg-field-900/70 border border-field-700 rounded-xl px-3 py-2.5 text-left"
              style={{ animationDelay: '.7s' }}
            >
              <Target className="w-4 h-4 text-gold shrink-0 mt-0.5" />
              <p className="text-xs text-field-300">
                <span className="text-white font-bold">Decided by tiebreaker</span> — actual total was{' '}
                <span className="text-white font-bold tabular-nums">{actualTiebreakerTotal}</span>,{' '}
                {top.name} guessed{' '}
                <span className="text-white font-bold tabular-nums">{top.tiebreakerGuess}</span>.
              </p>
            </div>
          )}

          {runnersUp.length > 0 && (
            <div className="pwp-stat mt-4 text-left" style={{ animationDelay: '.8s' }}>
              <p className="font-cond font-bold text-[10px] uppercase tracking-[.18em] text-field-500 mb-1.5">
                Also this week
              </p>
              <div className="space-y-1">
                {runnersUp.map(r => (
                  <div key={r.userId} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-field-900/50">
                    <span className={clsx('truncate', r.userId === user?.id ? 'text-gold font-bold' : 'text-field-300')}>
                      {r.name}
                    </span>
                    <span className="font-cond font-bold text-field-400 tabular-nums shrink-0 ml-2">
                      {r.correct}-{Math.max(0, r.played - r.correct)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pwp-cta flex gap-2 mt-6 opacity-0">
            <button onClick={goToStandings} className="btn-gold flex-1 flex items-center justify-center gap-1.5">
              Full Standings <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button onClick={dismiss} className="btn-ghost">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
