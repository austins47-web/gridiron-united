// ══════════════════════════════════════════════════════════════
// Pick'Em standings + weekly results
//
// Everything here is DERIVED from picks joined to game results
// rather than read from a maintained standings table. That means:
//   - a member who just joined shows up immediately at 0-0
//   - standings can never drift out of sync with actual results
//   - no trigger or background job to keep alive
//
// The week-level rules (winnerOf, computeWeek, computeWeekStats …)
// live in supabase/functions/_shared/pickemCore.ts so the edge
// functions run the same code; this module re-exports them and adds
// the season-level views the app needs on top.
// ══════════════════════════════════════════════════════════════

import {
  computeWeek, isDecided, isFinal, isLive, isVoid, isWeekComplete, nameOf, winnerOf,
  type Game, type Pick, type Member, type WeekRow,
} from '../../../supabase/functions/_shared/pickemCore.ts'

export * from '../../../supabase/functions/_shared/pickemCore.ts'

export interface StandingRow {
  userId: string
  name: string
  avatarUrl: string | null
  username: string | null
  correct: number
  played: number
  pct: number
  weeksWon: number
  lastWeek: number | null   // correct count in the most recent completed week
  streak: number            // consecutive weeks finishing first
  tiebreakerTotal: number   // season-long sum of |guess - actual|, lower is better
  tiebreakerWeeksSubmitted: number  // how many weeks they actually guessed — 0 ranks worst, not best
}

/**
 * Season standings across every completed week.
 *
 * Built from the member list, so anyone who has just joined appears
 * at 0-0 rather than being missing until they make a pick.
 */
export function computeStandings(
  games: Game[],
  picks: Pick[],
  members: Member[],
): StandingRow[] {
  const weeks = [...new Set(games.map(g => g.week))].sort((a, b) => a - b)

  const totals = new Map<string, { correct: number; played: number; weeksWon: number; tiebreakerTotal: number; tiebreakerWeeksSubmitted: number }>()
  members.forEach(m => totals.set(m.user_id, { correct: 0, played: 0, weeksWon: 0, tiebreakerTotal: 0, tiebreakerWeeksSubmitted: 0 }))

  const weekWinners: { week: number; winners: string[] }[] = []
  let lastCompletedWeek: number | null = null
  const lastWeekScore = new Map<string, number>()

  for (const wk of weeks) {
    const wkGames = games.filter(g => g.week === wk)
    const wkPicks = picks.filter(p => p.week === wk)
    if (!wkGames.some(isDecided)) continue     // nothing on the board yet

    const rows = computeWeek(wkGames, wkPicks, members)

    for (const r of rows) {
      const t = totals.get(r.userId)
      if (!t) continue
      t.correct += r.correct
      t.played  += r.played
      // Only once the tiebreaker game itself is final (computeWeek
      // already only sets a non-null diff in that case) — a week
      // where the tiebreaker hasn't been decided yet contributes
      // nothing, rather than counting as a perfect 0.
      if (r.tiebreakerDiff != null) {
        t.tiebreakerTotal += r.tiebreakerDiff
        t.tiebreakerWeeksSubmitted++
      }
    }

    if (isWeekComplete(wkGames)) {
      lastCompletedWeek = wk
      rows.forEach(r => lastWeekScore.set(r.userId, r.correct))

      // Winners = everyone tied at the top after the tiebreaker
      const best = rows[0]
      if (best && best.played > 0) {
        const tiedTop = rows.filter(r =>
          r.correct === best.correct &&
          (r.tiebreakerDiff ?? Infinity) === (best.tiebreakerDiff ?? Infinity)
        )
        tiedTop.forEach(r => {
          const t = totals.get(r.userId)
          if (t) t.weeksWon++
        })
        weekWinners.push({ week: wk, winners: tiedTop.map(r => r.userId) })
      }
    }
  }

  // Consecutive weekly wins, counting back from the most recent
  const streakOf = (userId: string): number => {
    let n = 0
    for (let i = weekWinners.length - 1; i >= 0; i--) {
      if (weekWinners[i].winners.includes(userId)) n++
      else break
    }
    return n
  }

  const rows: StandingRow[] = members.map(m => {
    const t = totals.get(m.user_id) ?? { correct: 0, played: 0, weeksWon: 0, tiebreakerTotal: 0, tiebreakerWeeksSubmitted: 0 }
    return {
      userId: m.user_id,
      name: nameOf(m),
      avatarUrl: m.profile?.avatar_url ?? null,
      username: m.profile?.username ?? null,
      correct: t.correct,
      played: t.played,
      pct: t.played > 0 ? t.correct / t.played : 0,
      weeksWon: t.weeksWon,
      lastWeek: lastCompletedWeek != null
        ? (lastWeekScore.get(m.user_id) ?? 0)
        : null,
      streak: streakOf(m.user_id),
      tiebreakerTotal: t.tiebreakerTotal,
      tiebreakerWeeksSubmitted: t.tiebreakerWeeksSubmitted,
    }
  })

  // A person who's never submitted a tiebreaker guess ranks LAST on
  // this metric, not first — their raw total is 0, same as someone
  // with perfect guesses every week, which would otherwise rank
  // them as if they'd been perfectly accurate rather than absent.
  const tbRank = (r: StandingRow) => r.tiebreakerWeeksSubmitted === 0 ? Number.POSITIVE_INFINITY : r.tiebreakerTotal

  return rows.sort((a, b) => {
    if (b.correct !== a.correct) return b.correct - a.correct
    if (b.pct !== a.pct) return b.pct - a.pct
    const ta = tbRank(a), tb = tbRank(b)
    if (ta !== tb) return ta - tb  // lower total wins — closer guesses
    if (b.weeksWon !== a.weeksWon) return b.weeksWon - a.weeksWon
    return a.name.localeCompare(b.name)
  })
}

/** Dense ranking so ties share a position (1, 1, 3 …). */
export function rankOf(rows: StandingRow[], index: number): number {
  if (index === 0) return 1
  const prev = rows[index - 1], cur = rows[index]
  const prevTb = prev.tiebreakerWeeksSubmitted === 0 ? Number.POSITIVE_INFINITY : prev.tiebreakerTotal
  const curTb  = cur.tiebreakerWeeksSubmitted === 0 ? Number.POSITIVE_INFINITY : cur.tiebreakerTotal
  if (prev.correct === cur.correct && prev.pct === cur.pct && prevTb === curTb) {
    return rankOf(rows, index - 1)
  }
  return index + 1
}

// ── Who can still win the week ─────────────────────────────────

export interface WhoCanWinRow {
  userId: string
  name: string
  /** Correct picks on games that are already final. */
  correct: number
  status: 'clinched' | 'alive' | 'out'
  /** Results this member needs in every outcome where they win. */
  needs: { gameId: string; team: string }[]
  /** Tiebreaker totals they need, when every winning outcome is a tiebreak. */
  tiebreaker: { min: number; max: number | null } | null
}

export interface WhoCanWin {
  remaining: number
  rows: WhoCanWinRow[]
}

/** Enumerating outcomes is 2^n — past this many games left it's too early to matter anyway. */
const MAX_REMAINING = 6

/**
 * Plays out every result of the games still to finish and works out
 * who can still win the week — the same rule as WeekRecap: most
 * correct, then closest tiebreaker guess, exact ties shared.
 *
 * Only final results count as locked in (a live game's current
 * leader can still lose), and a tied game is ignored as an outcome.
 * When people tie on correct picks and the tiebreaker game isn't
 * final, each of them wins a range of totals (the ones their guess is
 * closest to), limited to totals the game can still reach from its
 * current score.
 *
 * Returns null when it isn't meaningful yet: nothing final, too many
 * games left, or the week's already over (the recap covers that).
 */
export function computeWhoCanWin(games: Game[], picks: Pick[], rows: WeekRow[]): WhoCanWin | null {
  const playable = games.filter(g => !isVoid(g))
  const remaining = playable.filter(g => !isFinal(g))
  if (remaining.length === 0 || remaining.length > MAX_REMAINING) return null
  if (!playable.some(isFinal)) return null

  const players = rows.filter(r => r.submitted)
  if (players.length === 0) return null

  const pickOf = new Map(picks.map(p => [`${p.user_id}:${p.game_id}`, p.picked_team]))
  const base = new Map(players.map(r => [r.userId, playable.filter(g => {
    if (!isFinal(g)) return false
    const w = winnerOf(g)
    return w != null && pickOf.get(`${r.userId}:${g.id}`) === w
  }).length]))

  // Tiebreaker: known once final; otherwise any total from where the
  // game stands now upward is still possible.
  const tb = playable.find(g => g.is_tiebreaker)
  const tbKnown = tb && isFinal(tb) ? (tb.home_score ?? 0) + (tb.away_score ?? 0) : null
  const tbFloor = tb && isLive(tb) ? (tb.home_score ?? 0) + (tb.away_score ?? 0) : 0

  type Win = { mask: number; range: { min: number; max: number | null } | null }
  const wins = new Map<string, Win[]>(players.map(r => [r.userId, []]))
  const outcomes = 1 << remaining.length

  for (let mask = 0; mask < outcomes; mask++) {
    const winner = (i: number) => (mask >> i) & 1 ? remaining[i].home_team : remaining[i].away_team
    const totals = players.map(r => ({
      r,
      total: (base.get(r.userId) ?? 0) + remaining.filter((g, i) => pickOf.get(`${r.userId}:${g.id}`) === winner(i)).length,
    }))
    const best = Math.max(...totals.map(t => t.total))
    const tied = totals.filter(t => t.total === best).map(t => t.r)

    if (tied.length === 1) { wins.get(tied[0].userId)!.push({ mask, range: null }); continue }

    const guessed = tied.filter(r => r.tiebreakerGuess != null)
    // Nobody tied has a guess: all of them share it, whatever the total
    if (guessed.length === 0) { tied.forEach(r => wins.get(r.userId)!.push({ mask, range: null })); continue }

    if (tbKnown != null) {
      const diff = (r: WeekRow) => Math.abs((r.tiebreakerGuess as number) - tbKnown)
      const closest = Math.min(...guessed.map(diff))
      guessed.filter(r => diff(r) === closest).forEach(r => wins.get(r.userId)!.push({ mask, range: null }))
      continue
    }

    // Each distinct guess owns the totals it's closest to (midpoints
    // shared), clipped to what's still reachable.
    const values = [...new Set(guessed.map(r => r.tiebreakerGuess as number))].sort((a, b) => a - b)
    for (const r of guessed) {
      const g = r.tiebreakerGuess as number
      const i = values.indexOf(g)
      const lo = Math.max(i > 0 ? Math.ceil((values[i - 1] + g) / 2) : 0, tbFloor)
      const hi = i < values.length - 1 ? Math.floor((g + values[i + 1]) / 2) : null
      if (hi != null && hi < lo) continue
      const coversAll = lo <= tbFloor && hi == null
      wins.get(r.userId)!.push({ mask, range: coversAll ? null : { min: lo, max: hi } })
    }
  }

  const out: WhoCanWinRow[] = players.map(r => {
    const w = wins.get(r.userId)!
    const status: WhoCanWinRow['status'] =
      w.length === 0 ? 'out'
      : new Set(w.filter(x => x.range == null).map(x => x.mask)).size === outcomes ? 'clinched'
      : 'alive'
    const needs = status !== 'alive' ? [] : remaining.flatMap((g, i) => {
      const teams = new Set(w.map(x => (x.mask >> i) & 1 ? g.home_team : g.away_team))
      return teams.size === 1 ? [{ gameId: g.id, team: [...teams][0] }] : []
    })
    const ranges = w.map(x => x.range)
    const tiebreaker = status === 'alive' && ranges.every(x => x != null)
      ? {
          min: Math.min(...ranges.map(x => x!.min)),
          max: ranges.some(x => x!.max == null) ? null : Math.max(...ranges.map(x => x!.max as number)),
        }
      : null
    return { userId: r.userId, name: r.name, correct: base.get(r.userId) ?? 0, status, needs, tiebreaker }
  })

  const order = { clinched: 0, alive: 1, out: 2 } as const
  out.sort((a, b) => order[a.status] - order[b.status] || b.correct - a.correct || a.name.localeCompare(b.name))
  return { remaining: remaining.length, rows: out }
}
