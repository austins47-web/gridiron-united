// Autopilot: the picks the app makes for someone who set a backup rule
// (pickem_autopilot) and hasn't picked a game by the time it locks.
// Pure (no Deno APIs), so it can be tested in Node; send-reminders does
// the reading and writing.

import { isFinal, isVoid, type Game, type Pick } from './pickemCore.ts'

export type AutopilotRule = 'favorites' | 'home' | 'majority'

/** The pregame favorite, the way the Favorites quick-fill picks it; the home team with no line. */
export function favoriteOf(g: Game): string {
  if (g.pregame_home_wp != null) return g.pregame_home_wp >= 0.5 ? g.home_team : g.away_team
  if (g.spread != null) return g.spread < 0 ? g.home_team : g.away_team
  return g.home_team
}

/** The side most of the league took on their own; the favorite on a tie, or when nobody has. */
export function majorityOf(g: Game, picks: Pick[]): string {
  const own = picks.filter(p => p.game_id === g.id && !p.auto)
  const home = own.filter(p => p.picked_team === g.home_team).length
  const away = own.filter(p => p.picked_team === g.away_team).length
  return home > away ? g.home_team : away > home ? g.away_team : favoriteOf(g)
}

export function autopilotTeam(rule: AutopilotRule, g: Game, picks: Pick[]): string {
  return rule === 'home' ? g.home_team : rule === 'majority' ? majorityOf(g, picks) : favoriteOf(g)
}

/** A tiebreaker guess: the game's Vegas total, rounded (44 without one). */
export const autopilotTiebreaker = (g: Game): number => (g.over_under != null ? Math.round(g.over_under) : 44)

export interface AutopilotFill {
  user_id: string
  game_id: string
  week: number
  /** The pick to make; null when they picked the game and only the tiebreaker guess is missing. */
  picked_team: string | null
  tiebreaker_score: number | null
}

/**
 * What autopilot fills in one league's week. For each member whose rule
 * was set before a game locked: every game locking within `leadMs` (or
 * that locked less than `lateMs` ago, in case a run was missed) and not
 * over that they haven't picked, plus their tiebreaker guess if they
 * have none when the tiebreaker game locks.
 *
 * `picks` are the league's picks for the week; `lockAt` is when a game
 * locks in this league (its kickoff, or the week's deadline if earlier).
 */
export function autopilotFills(o: {
  games: Game[]
  picks: Pick[]
  rules: { user_id: string; rule: AutopilotRule; updated_at: string }[]
  lockAt: (g: Game) => number
  now: number
  leadMs: number
  lateMs: number
}): AutopilotFill[] {
  const due = o.games.filter(g => {
    if (isFinal(g) || isVoid(g)) return false
    const at = o.lockAt(g)
    return at <= o.now + o.leadMs && at >= o.now - o.lateMs
  })
  const fills: AutopilotFill[] = []
  for (const r of o.rules) {
    const setAt = Date.parse(r.updated_at)
    const mine = o.picks.filter(p => p.user_id === r.user_id)
    const hasGuess = mine.some(p => p.tiebreaker_score != null)
    for (const g of due) {
      // Chosen after this game locked: no picking with hindsight
      if (!(setAt < o.lockAt(g))) continue
      const picked = mine.some(p => p.game_id === g.id)
      const needGuess = g.is_tiebreaker && !hasGuess
      if (picked && !needGuess) continue
      fills.push({
        user_id: r.user_id,
        game_id: g.id,
        week: g.week,
        picked_team: picked ? null : autopilotTeam(r.rule, g, o.picks),
        tiebreaker_score: needGuess ? autopilotTiebreaker(g) : null,
      })
    }
  }
  return fills
}
