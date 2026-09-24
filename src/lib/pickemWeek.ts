import { zonedTimeToUtc, partsInZone } from './deadline'
import { isVoid } from '../../supabase/functions/_shared/pickemCore.ts'

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
// (the Pick'Em page's default week, Home's picks-due nudge, League
// Info) should read currentPickemWeek() — via usePickemCalendar in
// components — so they never disagree about it.
// ══════════════════════════════════════════════════════════════

/**
 * When each week stops being current: 11:59 PM Eastern on the first
 * Tuesday on or after the week's last game (by Eastern calendar
 * date) — so a Monday-night week hands off Tuesday night, and a week
 * that ends Sunday (Week 18, most playoff rounds) the Tuesday after.
 * Worked out from the schedule, so it holds for any season without a
 * code change (it replaced a table of 2026 dates, which it matches
 * exactly). Resolved through zonedTimeToUtc, so it's 11:59 PM Eastern
 * on both sides of the switch from daylight to standard time.
 * Postponed/canceled games don't stretch a week.
 */
export function pickemWeekEnds(
  games: { week: number; game_date: string | null; status?: string | null }[],
): Map<number, Date> {
  const lastKickoff = new Map<number, number>()
  for (const g of games) {
    if (!g.game_date || isVoid(g)) continue
    const t = new Date(g.game_date).getTime()
    lastKickoff.set(g.week, Math.max(lastKickoff.get(g.week) ?? -Infinity, t))
  }
  const ends = new Map<number, Date>()
  for (const [week, t] of lastKickoff) {
    const p = partsInZone(new Date(t), 'America/New_York')
    const tuesday = new Date(Date.UTC(p.year, p.month - 1, p.day + ((2 - p.weekday + 7) % 7)))
    ends.set(week, zonedTimeToUtc(
      tuesday.getUTCFullYear(), tuesday.getUTCMonth() + 1, tuesday.getUTCDate(), 23, 59, 'America/New_York'))
  }
  return ends
}

/**
 * The week a Pick'Em player is on right now: the first whose end is
 * still ahead. After the last scheduled week it stays on that week;
 * with no schedule yet (early preseason) it's Week 1.
 */
export function currentPickemWeek(ends: Map<number, Date>, now: Date = new Date()): number {
  const weeks = [...ends.keys()].sort((x, y) => x - y)
  if (weeks.length === 0) return 1
  for (const w of weeks) if (now < ends.get(w)!) return w
  return weeks[weeks.length - 1]
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
