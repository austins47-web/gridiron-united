// Autopilot: the picks the app makes for someone who turned it on
// (pickem_autopilot) and hasn't picked a game by the time it locks.
// Pure (no Deno APIs), so it can be tested in Node; send-reminders does
// the reading and writing.

import { isFinal, isVoid, type Game, type Pick } from './pickemCore.ts'

// One rule: a coin flip for every game. Favorites, home teams and the
// league majority were dropped on 2026-11-05 (the commissioner's call):
// they made forgetting to pick about as good as picking.
export type AutopilotRule = 'random'

/** A coin flip between the two teams. */
export function autopilotTeam(g: Game, rand: () => number = Math.random): string {
  return rand() < 0.5 ? g.home_team : g.away_team
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
 * What autopilot fills in one league's week. For each member who turned
 * it on before a game locked: every game locking within `leadMs` (or
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
  /** Who has autopilot on, and since when (any saved rule is a coin flip). */
  rules: { user_id: string; updated_at: string }[]
  lockAt: (g: Game) => number
  now: number
  leadMs: number
  lateMs: number
  /** 0–1, Math.random unless a test passes its own. */
  rand?: () => number
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
        picked_team: picked ? null : autopilotTeam(g, o.rand),
        tiebreaker_score: needGuess ? autopilotTiebreaker(g) : null,
      })
    }
  }
  return fills
}
