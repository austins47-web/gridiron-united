// ══════════════════════════════════════════════════════════════
// Pick'Em standings + weekly results
//
// Everything here is DERIVED from picks joined to game results
// rather than read from a maintained standings table. That means:
//   - a member who just joined shows up immediately at 0-0
//   - standings can never drift out of sync with actual results
//   - no trigger or background job to keep alive
// ══════════════════════════════════════════════════════════════

export interface Game {
  id: string
  week: number
  game_date: string
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  status: string
  is_tiebreaker: boolean
}

export interface Pick {
  game_id: string
  user_id: string
  week: number
  picked_team: string
  tiebreaker_score: number | null
}

export interface Member {
  user_id: string
  profile?: { username?: string | null; display_name?: string | null } | null
}

export interface WeekRow {
  userId: string
  name: string
  correct: number
  played: number          // games that have finished AND they picked
  submitted: boolean      // did they get any picks in at all
  tiebreakerGuess: number | null
  tiebreakerDiff: number | null   // distance from the actual total
}

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

const nameOf = (m: Member) =>
  m.profile?.display_name || m.profile?.username || 'Unknown'

export const isFinal = (g: Game) =>
  (g.status ?? '').toLowerCase().includes('final') ||
  (g.status ?? '').toLowerCase() === 'post'

/** Winning team abbreviation, or null if not final / a tie. */
export function winnerOf(g: Game): string | null {
  if (!isFinal(g)) return null
  if (g.home_score == null || g.away_score == null) return null
  if (g.home_score === g.away_score) return null
  return g.home_score > g.away_score ? g.home_team : g.away_team
}

/** Every game in the week has a final score. */
export function isWeekComplete(games: Game[]): boolean {
  const wk = games.filter(g => g.game_date)
  return wk.length > 0 && wk.every(isFinal)
}

/** The actual combined score of the designated tiebreaker game. */
export function tiebreakerTotal(games: Game[]): number | null {
  const tb = games.find(g => g.is_tiebreaker)
  if (!tb || !isFinal(tb)) return null
  if (tb.home_score == null || tb.away_score == null) return null
  return tb.home_score + tb.away_score
}

/**
 * One week's results, ranked.
 *
 * Ordering: most correct first, then closest tiebreaker guess.
 * Members who submitted nothing are included but flagged, so the
 * caller can choose to hide them.
 */
export function computeWeek(
  games: Game[],
  picks: Pick[],
  members: Member[],
): WeekRow[] {
  const gameById = new Map(games.map(g => [g.id, g]))
  const actualTotal = tiebreakerTotal(games)

  const rows: WeekRow[] = members.map(m => {
    const mine = picks.filter(p => p.user_id === m.user_id)

    let correct = 0
    let played  = 0
    for (const p of mine) {
      const g = gameById.get(p.game_id)
      if (!g) continue
      const w = winnerOf(g)
      if (w === null) continue      // not finished, or a tie
      played++
      if (p.picked_team === w) correct++
    }

    const tbPick = mine.find(p => p.tiebreaker_score != null)
    const guess  = tbPick?.tiebreaker_score ?? null

    return {
      userId: m.user_id,
      name: nameOf(m),
      correct,
      played,
      submitted: mine.length > 0,
      tiebreakerGuess: guess,
      tiebreakerDiff:
        guess != null && actualTotal != null
          ? Math.abs(guess - actualTotal)
          : null,
    }
  })

  return rows.sort((a, b) => {
    if (b.correct !== a.correct) return b.correct - a.correct
    // Closest tiebreaker wins; a missing guess ranks last
    const da = a.tiebreakerDiff ?? Number.POSITIVE_INFINITY
    const db = b.tiebreakerDiff ?? Number.POSITIVE_INFINITY
    if (da !== db) return da - db
    return a.name.localeCompare(b.name)
  })
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
    if (!wkGames.some(isFinal)) continue     // nothing settled yet

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
