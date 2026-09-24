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

export const isFinal = (g: { status?: string | null }) =>
  (g.status ?? '').toLowerCase().includes('final') ||
  (g.status ?? '').toLowerCase() === 'post'

/** True while a game is actively being played — its score can still move. */
export const isLive = (g: { status?: string | null }) =>
  (g.status ?? '').toLowerCase() === 'in_progress'

/**
 * A game has a score worth scoring picks against — either it's over,
 * or it's live and already on the board. Doesn't mean anyone's
 * actually ahead yet (still 0-0, or the scores are tied) — winnerOf
 * is what decides that.
 */
export const isDecided = (g: { status?: string | null }) => isFinal(g) || isLive(g)

/**
 * Postponed or canceled (the schedule sync stores both as
 * 'postponed'). A void game never goes final, so it's left out of
 * "is the week done" — otherwise one postponed game would hold a
 * week open forever: no winner, no recap, no Week Stats. Picks on it
 * already score nothing, since winnerOf needs a live/final game.
 */
export const isVoid = (g: { status?: string | null }) => {
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

/**
 * A tiebreaker range in words — "of 45+", "of exactly 45",
 * "of 47 or less", "of 43–47". Shared by the Standings panel and the
 * "still alive" phone alert so both say it the same way.
 */
export function describeTiebreakerRange({ min, max }: { min: number; max: number | null }): string {
  if (max == null) return `of ${min}+`
  if (min === max) return `of exactly ${min}`
  if (min === 0) return `of ${max} or less`
  return `of ${min}–${max}`
}

/**
 * The NFL (and college) season a date belongs to. A season runs from
 * July through the following June, so the Super Bowl in February
 * still counts toward the season that started in September, and the
 * offseason keeps showing last season's final standings until the new
 * one's preseason. The app, the reminder engine and the schedule sync
 * all use this, so next season starts without a code change.
 */
export function nflSeasonFor(date: Date): number {
  return date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1
}

// ── Season standings ─────────────────────────────────────────

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

// ── Week Stats in words ──────────────────────────────────────

export interface WeekStatLine {
  key: 'upset' | 'underdog' | 'lock' | 'split' | 'loneWolf' | 'league'
  label: string
  /** The team the line is about, for a logo. */
  team?: string
  headline: string
  detail: string
}

/**
 * The Week Stats as label / headline / detail lines — the winner card,
 * the league-chat card and the recap email all use this wording, so
 * they say exactly the same thing. A stat the week didn't produce is
 * left out.
 */
export function describeWeekStats(stats: WeekStats): WeekStatLine[] {
  const { upset, underdog, lock, split, loneWolf, league } = stats
  const lines: WeekStatLine[] = []
  if (upset) {
    lines.push({
      key: 'upset', label: 'Biggest Upset', team: upset.winner,
      headline: `${upset.winner} over ${upset.loser}`,
      detail: `${upset.wrong === upset.pickers && upset.pickers > 1 ? `All ${upset.pickers}` : `${upset.wrong} of ${upset.pickers}`} picked ${upset.loser} · ${upset.winnerScore}–${upset.loserScore}`,
    })
  }
  if (underdog) {
    const who = underdog.picks === 0 ? 'Nobody picked them'
      : underdog.picks <= 2 ? `Only ${underdog.backers.join(' & ')} picked them`
      : `Picked by ${underdog.picks} of ${underdog.pickers}`
    lines.push({
      key: 'underdog', label: 'Underdog', team: underdog.team,
      headline: underdog.team,
      detail: `${who} · won ${underdog.teamScore}–${underdog.oppScore}`,
    })
  }
  if (lock) {
    lines.push({
      key: 'lock', label: 'Lock of the Week', team: lock.team,
      headline: lock.team,
      detail: lock.picks === lock.pickers && lock.pickers > 1
        ? `Unanimous — all ${lock.pickers} had them`
        : `${lock.picks} of ${lock.pickers} had them`,
    })
  }
  if (split) {
    lines.push({
      key: 'split', label: 'Split Decision',
      headline: `${split.away} vs ${split.home}`,
      detail: `League split ${split.awayPicks}–${split.homePicks} · ${split.winner ? `${split.winner} won` : 'ended in a tie'}`,
    })
  }
  if (loneWolf) {
    lines.push({
      key: 'loneWolf', label: 'Lone Wolf',
      headline: loneWolf.name,
      detail: `${loneWolf.against} pick${loneWolf.against === 1 ? '' : 's'} against the crowd · ${loneWolf.hits === 0 ? 'none' : loneWolf.hits} hit`,
    })
  }
  if (league.played > 0) {
    lines.push({
      key: 'league', label: 'League Record',
      headline: `${league.correct}–${league.played - league.correct}`,
      detail: `${Math.round((league.correct / league.played) * 100)}% of the league's picks were right`,
    })
  }
  return lines
}
