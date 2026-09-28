// ══════════════════════════════════════════════════════════════
// When Pick'Em picks lock — shared by send-reminders, commish-chat
// and calendar. Pure (Intl only), like pickemCore.
//
// A weekly deadline is a WALL-CLOCK time in a zone ("Wednesdays at
// 5pm Mountain"), not a fixed UTC offset — Mountain is UTC-6 in
// summer and UTC-7 in winter. We resolve local -> UTC using the
// offset actually in effect on that date, so the deadline stays at
// the same local time across daylight saving.
// ══════════════════════════════════════════════════════════════

import { isFinal, isVoid, type Game } from './pickemCore.ts'

/** A league's lock settings, as the leagues table stores them. */
export interface LockRule {
  pick_lock_type: string | null
  pick_deadline_day: number | null
  pick_deadline_time: string | null
  pick_deadline_tz: string | null
}

function offsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value
  const asUTC = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  )
  return asUTC - date.getTime()
}

export function zonedTimeToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number, tz: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0)
  let ts = naive
  for (let i = 0; i < 3; i++) {
    const next = naive - offsetMs(new Date(ts), tz)
    if (next === ts) break
    ts = next
  }
  return new Date(ts)
}

export function partsInZone(date: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    weekday: DOW.indexOf(p.weekday),
  }
}

/**
 * The occurrence of a weekly rule that applies to a week: the latest
 * one at or before that week's first kickoff, looking back at most 6
 * days. A copy of weeklyDeadlineForWeek in src/lib/deadline.ts (see
 * there for why 6) — keep the two in step, or reminders and the
 * Pick'Em page will disagree about when a week locks.
 */
export function weeklyDeadlineForWeek(
  firstKickoff: Date, day: number, time: string, tz: string,
): Date | null {
  const [h, m] = time.split(':').map(Number)
  for (let back = 0; back <= 6; back++) {
    const probe = new Date(firstKickoff.getTime() - back * 86400_000)
    const pp = partsInZone(probe, tz)
    if (pp.weekday !== day) continue
    const candidate = zonedTimeToUtc(pp.year, pp.month, pp.day, h, m, tz)
    if (candidate.getTime() <= firstKickoff.getTime()) return candidate
  }
  return null
}

/**
 * A week's single deadline in a league, if it has one: the per-week
 * override, else the league's weekly rule (resolveWeekDeadline's
 * precedence in src/lib). Null means each game locks at its kickoff.
 */
export function weekDeadline(games: Game[], weekOverride: string | null | undefined, lg: LockRule): Date | null {
  if (weekOverride) return new Date(weekOverride)
  if (lg.pick_lock_type !== 'deadline' || lg.pick_deadline_day == null || !lg.pick_deadline_time) return null
  const kickoffs = games.map(g => new Date(g.game_date).getTime()).filter(Number.isFinite)
  if (kickoffs.length === 0) return null
  return weeklyDeadlineForWeek(new Date(Math.min(...kickoffs)), lg.pick_deadline_day, lg.pick_deadline_time, lg.pick_deadline_tz || 'UTC')
}

/**
 * Which of a week's games can still be picked in a league: the lock
 * the Pick'Em page enforces (isGameLocked with resolveWeekDeadline in
 * src/lib) — each game's own kickoff, or the week's deadline if that
 * comes first.
 */
export function stillPickable(
  games: Game[], now: Date, weekOverride: string | null | undefined, lg: LockRule,
): (g: Game) => boolean {
  const deadline = weekDeadline(games, weekOverride, lg)
  return g => !isFinal(g) && g.status !== 'in_progress' && !isVoid(g)
    && now.getTime() < new Date(g.game_date).getTime()
    && (!deadline || now.getTime() < deadline.getTime())
}
