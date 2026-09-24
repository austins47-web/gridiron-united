// ══════════════════════════════════════════════════════════════
// Pick'Em core — shared by the app and the edge functions
//
// Pure week-level logic (who won a game, who won a week, the Week
// Stats fun facts) with no imports, so the browser app (via
// src/components/pickem/standings.ts) and Deno edge functions (via
// ../_shared/pickemCore.ts) run the exact same rules. Keep it that
// way: no imports, no DOM, no Deno APIs.
//
// Scoring is live, not just final: winnerOf() credits whoever is
// currently ahead in an in-progress game, same as a final one. A
// tied score (0-0 at kickoff included) credits nobody until one
// team actually gets ahead, and picks can genuinely swing back and
// forth on the lead change until the game goes final.
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
  profile?: { username?: string | null; display_name?: string | null; avatar_url?: string | null } | null
}

export interface WeekRow {
  userId: string
  name: string
  correct: number
  played: number          // games with a live-or-final score AND they picked
  submitted: boolean      // did they get any picks in at all
  tiebreakerGuess: number | null
  tiebreakerDiff: number | null   // distance from the actual total
}

export const nameOf = (m: Member) =>
  m.profile?.display_name || m.profile?.username || 'Unknown'

export const isFinal = (g: Game) =>
  (g.status ?? '').toLowerCase().includes('final') ||
  (g.status ?? '').toLowerCase() === 'post'

/** True while a game is actively being played — its score can still move. */
export const isLive = (g: Game) =>
  (g.status ?? '').toLowerCase() === 'in_progress'

/**
 * A game has a score worth scoring picks against — either it's over,
 * or it's live and already on the board. Doesn't mean anyone's
 * actually ahead yet (still 0-0, or the scores are tied) — winnerOf
 * is what decides that.
 */
export const isDecided = (g: Game) => isFinal(g) || isLive(g)

/**
 * Postponed or canceled (the schedule sync stores both as
 * 'postponed'). A void game never goes final, so it's left out of
 * "is the week done" — otherwise one postponed game would hold a
 * week open forever: no winner, no recap, no Week Stats. Picks on it
 * already score nothing, since winnerOf needs a live/final game.
 */
export const isVoid = (g: Game) => {
  const s = (g.status ?? '').toLowerCase()
  return s.includes('postpon') || s.includes('cancel')
}

/**
 * Currently-leading team abbreviation, live or final — null if the
 * game hasn't started, has no score yet, or is tied (nobody gets the
 * point for a tied game until one team actually pulls ahead; a final
 * tie never resolves). This is intentionally provisional for a live
 * game: it can flip teams, or go back to null on a tying score, right
 * up until the game actually goes final.
 */
export function winnerOf(g: Game): string | null {
  if (!isDecided(g)) return null
  if (g.home_score == null || g.away_score == null) return null
  if (g.home_score === g.away_score) return null
  return g.home_score > g.away_score ? g.home_team : g.away_team
}

/** Every game in the week that's actually being played is final. */
export function isWeekComplete(games: Game[]): boolean {
  const wk = games.filter(g => g.game_date && !isVoid(g))
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

// ── End-of-week fun facts ─────────────────────────────────────

export interface WeekStats {
  /** The game the most people got wrong: `loser` is who they backed. */
  upset: { winner: string; loser: string; winnerScore: number; loserScore: number; wrong: number; pickers: number } | null
  /** The least-picked team that won, and who believed in it. */
  underdog: { team: string; opponent: string; picks: number; pickers: number; teamScore: number; oppScore: number; backers: string[] } | null
  /** The winning team the league leaned on hardest. */
  lock: { team: string; picks: number; pickers: number } | null
  /** The game that divided the league most evenly. */
  split: { away: string; home: string; awayPicks: number; homePicks: number; winner: string | null } | null
  /** Whoever went against the league's majority most often. */
  loneWolf: { name: string; against: number; hits: number } | null
  /** Every pick in the league this week, combined. */
  league: { correct: number; played: number }
}

/**
 * Fun facts for a finished week, all derived from the same picks and
 * results the recap ranks — so nothing here can disagree with it.
 *
 * Counts only ever include people who picked that game. A game nobody
 * picked is skipped, and a game that ended tied has no winner, so it's
 * left out of anything that depends on who won.
 */
export function computeWeekStats(games: Game[], picks: Pick[], rows: WeekRow[]): WeekStats {
  const nameById = new Map(rows.map(r => [r.userId, r.name]))
  const byKickoff = [...games].sort(
    (a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime(),
  )

  // Postponed/canceled games were never played — nothing to report.
  const tallies = byKickoff.filter(g => !isVoid(g)).map(g => {
    const gp = picks.filter(p => p.game_id === g.id)
    const home = gp.filter(p => p.picked_team === g.home_team)
    const away = gp.filter(p => p.picked_team === g.away_team)
    return { g, winner: winnerOf(g), home, away, pickers: home.length + away.length }
  }).filter(t => t.pickers > 0)

  const side = (t: typeof tallies[number], team: string) =>
    team === t.g.home_team ? t.home : t.away
  const scoreOf = (g: Game, team: string) =>
    team === g.home_team ? g.home_score : g.away_score

  // Biggest upset: most people on the losing side, then the biggest
  // share of the game's pickers. Earliest kickoff breaks a full tie
  // (sort is stable), same for every "first" below.
  let upset: WeekStats['upset'] = null
  for (const t of tallies) {
    if (!t.winner) continue
    const loser = t.winner === t.g.home_team ? t.g.away_team : t.g.home_team
    const wrong = side(t, loser).length
    if (wrong === 0) continue
    const better = !upset
      || wrong > upset.wrong
      || (wrong === upset.wrong && wrong / t.pickers > upset.wrong / upset.pickers)
    if (better) {
      upset = {
        winner: t.winner, loser,
        winnerScore: scoreOf(t.g, t.winner) ?? 0, loserScore: scoreOf(t.g, loser) ?? 0,
        wrong, pickers: t.pickers,
      }
    }
  }

  // Underdog: the winner the fewest people picked. Only winners —
  // plenty of teams nobody picks lose, which isn't a story. Among
  // ties, the most lopsided matchup (the crowd piled on the loser).
  let underdog: WeekStats['underdog'] = null
  let underdogOppPicks = -1
  for (const t of tallies) {
    if (!t.winner) continue
    const team = t.winner
    const opponent = team === t.g.home_team ? t.g.away_team : t.g.home_team
    const mine = side(t, team)
    const oppPicks = side(t, opponent).length
    const better = !underdog
      || mine.length < underdog.picks
      || (mine.length === underdog.picks && oppPicks > underdogOppPicks)
    if (better) {
      underdog = {
        team, opponent, picks: mine.length, pickers: t.pickers,
        teamScore: scoreOf(t.g, team) ?? 0, oppScore: scoreOf(t.g, opponent) ?? 0,
        backers: mine.map(p => nameById.get(p.user_id) ?? 'Someone'),
      }
      underdogOppPicks = oppPicks
    }
  }

  // Lock of the week: the winner with the biggest share of picks.
  let lock: WeekStats['lock'] = null
  for (const t of tallies) {
    if (!t.winner) continue
    const n = side(t, t.winner).length
    if (n === 0) continue
    const better = !lock
      || n / t.pickers > lock.picks / lock.pickers
      || (n / t.pickers === lock.picks / lock.pickers && n > lock.picks)
    if (better) lock = { team: t.winner, picks: n, pickers: t.pickers }
  }

  // Split decision: the most even split, skipping the upset's game so
  // two tiles don't tell the same story. More pickers wins a tie.
  let split: WeekStats['split'] = null
  const splitCandidates = tallies.filter(t => t.pickers >= 2)
  const withoutUpset = splitCandidates.filter(t =>
    !(upset && t.winner === upset.winner && (t.g.home_team === upset.loser || t.g.away_team === upset.loser)),
  )
  for (const t of withoutUpset.length ? withoutUpset : splitCandidates) {
    const gap = Math.abs(t.home.length - t.away.length)
    const cur = split ? Math.abs(split.homePicks - split.awayPicks) : Infinity
    const better = !split || gap < cur
      || (gap === cur && t.pickers > split.homePicks + split.awayPicks)
    if (better) {
      split = {
        away: t.g.away_team, home: t.g.home_team,
        awayPicks: t.away.length, homePicks: t.home.length, winner: t.winner,
      }
    }
  }

  // Lone wolf: picks against a clear majority (3+ pickers, not an
  // even split), and how many of those went their way.
  const wolf = new Map<string, { against: number; hits: number }>()
  for (const t of tallies) {
    if (t.pickers < 3 || t.home.length === t.away.length) continue
    const minority = t.home.length < t.away.length ? t.home : t.away
    for (const p of minority) {
      const w = wolf.get(p.user_id) ?? { against: 0, hits: 0 }
      w.against++
      if (t.winner != null && p.picked_team === t.winner) w.hits++
      wolf.set(p.user_id, w)
    }
  }
  const [wolfTop] = [...wolf].sort((a, b) =>
    b[1].against - a[1].against || b[1].hits - a[1].hits ||
    (nameById.get(a[0]) ?? '').localeCompare(nameById.get(b[0]) ?? ''),
  )
  const loneWolf: WeekStats['loneWolf'] = wolfTop
    ? { name: nameById.get(wolfTop[0]) ?? 'Someone', ...wolfTop[1] }
    : null

  const league = rows.reduce(
    (acc, r) => ({ correct: acc.correct + r.correct, played: acc.played + r.played }),
    { correct: 0, played: 0 },
  )

  return { upset, underdog, lock, split, loneWolf, league }
}
