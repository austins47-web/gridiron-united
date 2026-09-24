import { zonedTimeToUtc } from './deadline'

// ══════════════════════════════════════════════════════════════
// Which Pick'Em week is "current"
//
// A Pick'Em week stays current until Tuesday 11:59 PM Eastern after
// its last game — a full day past Monday Night Football — so the
// league gets Tuesday to see who won the week before the app moves
// on. It used to flip right after MNF, which buried the just-finished
// week's standings behind the week selector the moment it was decided.
//
// Anything that means "the week a Pick'Em player is on right now"
// (the Pick'Em page's default week, Home's picks-due nudge) should
// read currentPickemWeek(), so they never disagree about it.
// ══════════════════════════════════════════════════════════════

// Keyed by the Tuesday each week hands off on. Weeks with no Monday
// game (18, Divisional, Conf. Champ., Super Bowl) still hand off on
// the Tuesday after their last game. Safe for 2026: the earliest any
// week's first game kicks off is a Wednesday night (Week 12).
// Resolved through zonedTimeToUtc so the Nov 1 switch from EDT to
// EST lands the rollover at 11:59 PM Eastern on both sides of it.
const WEEK_ROLLOVER_TUESDAYS: Record<number, string> = {
  1:  '2026-09-15',
  2:  '2026-09-22',
  3:  '2026-09-29',
  4:  '2026-10-06',
  5:  '2026-10-13',
  6:  '2026-10-20',
  7:  '2026-10-27',
  8:  '2026-11-03',
  9:  '2026-11-10',
  10: '2026-11-17',
  11: '2026-11-24',
  12: '2026-12-01',
  13: '2026-12-08',
  14: '2026-12-15',
  15: '2026-12-22',
  16: '2026-12-29',
  17: '2027-01-05',
  18: '2027-01-12',
  // ── Postseason ──
  19: '2027-01-19',  // Wild Card
  20: '2027-01-26',  // Divisional
  21: '2027-02-02',  // Conference Championships
  22: '2027-02-16',  // Super Bowl (Feb 14 — the off week comes before it)
}

/** The instant each week stops being the current one. */
export const PICKEM_WEEK_ENDS: Record<number, Date> = Object.fromEntries(
  Object.entries(WEEK_ROLLOVER_TUESDAYS).map(([w, day]) => {
    const [y, m, d] = day.split('-').map(Number)
    return [w, zonedTimeToUtc(y, m, d, 23, 59, 'America/New_York')]
  }),
)

export function currentPickemWeek(now: Date = new Date()): number {
  // Before season starts → Week 1
  if (now < new Date('2026-09-09T00:00:00Z')) return 1
  for (let w = 1; w <= 22; w++) {
    const end = PICKEM_WEEK_ENDS[w]
    if (end && now < end) return w
  }
  return 22
}

export function isGameLocked(gameDate: string | null, deadline: string | null, status?: string | null): boolean {
  // Status is checked independently of time, as a backstop. Every
  // existing check here only ever compared clock time to kickoff or
  // deadline — meaning a game that's already final or in progress
  // could still show as pickable if its stored kickoff time somehow
  // sits in the future (a bad sync, clock skew, or in testing, a
  // manually-finalized game). A pick should never be editable once
  // the outcome is actually known, independent of what the clock says.
  // Postponed/canceled games can't be picked either; if one gets
  // rescheduled, the schedule sync flips it back to 'scheduled'.
  if (status === 'final' || status === 'in_progress' || status === 'postponed') return true
  if (!gameDate) return false
  const now = new Date()
  // If commissioner set a custom deadline, use whichever is earlier
  const kickoff = new Date(gameDate)
  if (deadline) {
    const dl = new Date(deadline)
    return now >= dl || now >= kickoff
  }
  return now >= kickoff
}

/**
 * How often to re-fetch data that only changes while games are on:
 * fast while any game is live (or should have just kicked off — the
 * score sync lags kickoff a little), otherwise asleep until about 15
 * minutes before the next kickoff, checking at most every 30 minutes
 * so a page left open still wakes up in time. Nothing left to play:
 * no polling at all. React Query already pauses intervals in
 * background tabs and refetches when you come back.
 *
 * These queries used to poll every 20–60s around the clock — the
 * winner-popup check alone pulled the whole season's games and every
 * pick in the league once a minute on every page.
 */
export function livePollInterval(
  games: { game_date: string | null; status: string | null }[] | undefined,
  liveMs: number,
  now = Date.now(),
): number | false {
  let nextKickoff = Infinity
  for (const g of games ?? []) {
    const status = g.status ?? ''
    if (status === 'in_progress') return liveMs
    if (status === 'final' || status === 'postponed' || !g.game_date) continue
    const kickoff = new Date(g.game_date).getTime()
    if (kickoff <= now && now - kickoff < 6 * 3600_000) return liveMs
    if (kickoff > now) nextKickoff = Math.min(nextKickoff, kickoff)
  }
  if (nextKickoff === Infinity) return false
  return Math.min(Math.max(nextKickoff - now - 15 * 60_000, liveMs), 30 * 60_000)
}
