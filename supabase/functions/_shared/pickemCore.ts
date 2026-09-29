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
  // Written by sync-nfl-schedule from ESPN (see the 20260928 migration).
  // Optional: older rows and narrow selects don't carry them.
  /** Home team's chance to win before kickoff, frozen at kickoff. */
  pregame_home_wp?: number | null
  /** Home team's line: -3.5 = home favored by 3.5. */
  spread?: number | null
  over_under?: number | null
  /** ESPN's live win probability for the home team. */
  live_home_wp?: number | null
  period?: number | null
  clock?: string | null
  game_story?: GameStory | null
}

/**
 * How a final game was lost, from ESPN's play-by-play (written once by
 * sync-nfl-schedule). Null team fields for a tie.
 */
export interface GameStory {
  v: 1
  winner: string | null
  loser: string | null
  /** The loser's best win chance in the second half, 0–1. */
  loserPeakWp: number | null
  peakPeriod: number | null
  peakClock: string | null
  /** The loser was ahead at some point in the 4th quarter or overtime. */
  loserLedLate: boolean
  /** The score that put the winner ahead for good. */
  decided: { period: number; clock: string; team: string; text: string } | null
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
  profile?: { username?: string | null; display_name?: string | null; avatar_url?: string | null; favorite_nfl_team?: string | null } | null
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
  /** The pick that died hardest (see computeBadBeats). Absent on weeks posted before it existed. */
  badBeat?: {
    loser: string; winner: string; loserScore: number; winnerScore: number
    peak: number; decided: GameStory['decided']; victims: string[]; pickers: number
  } | null
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

  // Not the upset's game — two tiles shouldn't tell the same story
  const beat = computeBadBeats(games, picks).find(b => !(upset && b.winner === upset.winner && b.loser === upset.loser))
  const badBeat: WeekStats['badBeat'] = beat
    ? {
        loser: beat.loser, winner: beat.winner, loserScore: beat.loserScore, winnerScore: beat.winnerScore,
        peak: beat.peak, decided: beat.decided, pickers: beat.pickers,
        victims: beat.victims.map(id => nameById.get(id) ?? 'Someone'),
      }
    : null

  return { upset, underdog, lock, split, loneWolf, badBeat, league }
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

export interface WhoCanWinOptions {
  /**
   * Picks on this game can still be changed — it hasn't locked yet.
   * Defaults to treating every pick as locked in.
   */
  isOpen?: (g: Game) => boolean
  /**
   * Who's looking. Other players' picks on open games stay hidden
   * until kickoff, so with a viewer set only the viewer's own open
   * picks are read — anything else would give them away through the
   * panel. Without one (the server, telling each player about their
   * own row) every player's own picks count as they stand.
   */
  viewerId?: string
}

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
 * A pick on a game that hasn't locked isn't settled: anyone can still
 * switch sides, so rivals are assumed able to take either team — and,
 * while the tiebreaker game is open, to change their guess to
 * anything. Each row is worked out from that player's side: their own
 * picks as they stand (see viewerId), everyone else's open picks
 * going whichever way makes the point. So a player is out only when
 * no switch by anyone saves them, and has clinched only when nobody
 * can catch them or tie them, whatever results and switches come.
 *
 * Returns null when it isn't meaningful yet: nothing final, too many
 * games left, or the week's already over (the recap covers that).
 */
export function computeWhoCanWin(
  games: Game[], picks: Pick[], rows: WeekRow[],
  { isOpen = () => false, viewerId }: WhoCanWinOptions = {},
): WhoCanWin | null {
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
  // game stands now upward is still possible. Guesses lock with the
  // tiebreaker game's pick.
  const tb = playable.find(g => g.is_tiebreaker)
  const tbKnown = tb && isFinal(tb) ? (tb.home_score ?? 0) + (tb.away_score ?? 0) : null
  const tbFloor = tb && isLive(tb) ? (tb.home_score ?? 0) + (tb.away_score ?? 0) : 0
  const tbOpen = !!tb && isOpen(tb)

  const open = remaining.map(g => isOpen(g))
  const openCount = open.filter(Boolean).length
  const outcomes = 1 << remaining.length

  // Per outcome, each player's points from locked picks, and with
  // their current picks on open games added
  const tally = Array.from({ length: outcomes }, (_, mask) => new Map(players.map(r => {
    let locked = base.get(r.userId) ?? 0
    let current = locked
    remaining.forEach((g, i) => {
      const winner = (mask >> i) & 1 ? g.home_team : g.away_team
      if (pickOf.get(`${r.userId}:${g.id}`) !== winner) return
      current++
      if (!open[i]) locked++
    })
    return [r.userId, { locked, current }]
  })))

  type Range = { min: number; max: number | null }

  // Where x can come out on top of players tied with them on picks,
  // shared wins included: null at any total, a range of totals, or
  // undefined if nowhere. Each distinct guess owns the totals it's
  // closest to (midpoints shared), clipped to what's still reachable.
  const tiebreakWin = (x: WeekRow, tied: WeekRow[]): Range | null | undefined => {
    // Their guesses can still move anywhere, including out of x's way
    if (tbOpen) return null
    const guessed = [x, ...tied].filter(r => r.tiebreakerGuess != null)
    // Nobody tied has a guess: all of them share it, whatever the total
    if (guessed.length === 0) return null
    if (x.tiebreakerGuess == null) return undefined
    const g = x.tiebreakerGuess
    if (tbKnown != null) {
      const diff = (r: WeekRow) => Math.abs((r.tiebreakerGuess as number) - tbKnown)
      return diff(x) === Math.min(...guessed.map(diff)) ? null : undefined
    }
    const values = [...new Set(guessed.map(r => r.tiebreakerGuess as number))].sort((a, b) => a - b)
    const i = values.indexOf(g)
    const lo = Math.max(i > 0 ? Math.ceil((values[i - 1] + g) / 2) : 0, tbFloor)
    const hi = i < values.length - 1 ? Math.floor((g + values[i + 1]) / 2) : null
    if (hi != null && hi < lo) return undefined
    return lo <= tbFloor && hi == null ? null : { min: lo, max: hi }
  }

  // x is strictly closer than every one of them at any total the game
  // can still reach — a shared win isn't a clinch
  const winsEveryTiebreak = (x: WeekRow, tied: WeekRow[]): boolean => {
    if (tbOpen || x.tiebreakerGuess == null) return false
    const g = x.tiebreakerGuess
    return tied.every(r => {
      const h = r.tiebreakerGuess
      if (h == null) return true
      if (tbKnown != null) return Math.abs(g - tbKnown) < Math.abs(h - tbKnown)
      // Only totals from tbFloor up are left: x is closer past the midpoint
      return h < g && 2 * tbFloor > g + h
    })
  }

  const out: WhoCanWinRow[] = players.map(r => {
    const ownKnown = viewerId == null || r.userId === viewerId
    const rivals = players.filter(p => p !== r)
    const w: { mask: number; range: Range | null }[] = []
    let sure = 0

    for (let mask = 0; mask < outcomes; mask++) {
      const t = tally[mask]
      const mine = t.get(r.userId)!
      const [myLow, myHigh] = ownKnown ? [mine.current, mine.current] : [mine.locked, mine.locked + openCount]
      const theirs = rivals.map(p => ({ p, low: t.get(p.userId)!.locked, high: t.get(p.userId)!.locked + openCount }))

      // Best case: their open picks all miss (and r's all hit, when unknown)
      const topLow = Math.max(-1, ...theirs.map(o => o.low))
      if (myHigh > topLow) w.push({ mask, range: null })
      else if (myHigh === topLow) {
        const range = tiebreakWin(r, theirs.filter(o => o.low === myHigh).map(o => o.p))
        if (range !== undefined) w.push({ mask, range })
      }

      // Worst case: their open picks all hit (and r's all miss)
      const topHigh = Math.max(-1, ...theirs.map(o => o.high))
      if (myLow > topHigh
        || (myLow === topHigh && winsEveryTiebreak(r, theirs.filter(o => o.high === myLow).map(o => o.p)))) sure++
    }

    const status: WhoCanWinRow['status'] =
      w.length === 0 ? 'out'
      : sure === outcomes ? 'clinched'
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
  key: 'upset' | 'badBeat' | 'underdog' | 'lock' | 'split' | 'loneWolf' | 'league'
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
  const { upset, underdog, lock, split, loneWolf, badBeat, league } = stats
  const lines: WeekStatLine[] = []
  if (upset) {
    lines.push({
      key: 'upset', label: 'Biggest Upset', team: upset.winner,
      headline: `${upset.winner} over ${upset.loser}`,
      detail: `${upset.wrong === upset.pickers && upset.pickers > 1 ? `All ${upset.pickers}` : `${upset.wrong} of ${upset.pickers}`} picked ${upset.loser} · ${upset.winnerScore}–${upset.loserScore}`,
    })
  }
  if (badBeat) {
    const who = badBeat.victims.length <= 2 ? badBeat.victims.join(' & ') : `${badBeat.victims.length} of ${badBeat.pickers}`
    lines.push({
      key: 'badBeat', label: 'Bad Beat', team: badBeat.loser,
      headline: `${badBeat.loser} at ${Math.round(badBeat.peak * 100)}%`,
      detail: `${who} had them · lost ${badBeat.loserScore}–${badBeat.winnerScore}`
        + (badBeat.decided ? `, ${badBeat.winner} went ahead ${whenDecided(badBeat.decided)}` : ''),
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

/** "with 3:57 left", "in overtime", "in the 3rd quarter". */
export function whenDecided(d: { period: number; clock: string }): string {
  if (d.period > 4) return 'in overtime'
  if (d.period === 4) return d.clock ? `with ${d.clock} left` : 'in the 4th quarter'
  return `in the ${['1st', '2nd', '3rd'][d.period - 1] ?? `${d.period}th`} quarter`
}

// ── Win probability ──────────────────────────────────────────

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, error under 1.5e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592)
    * t * Math.exp(-(x * x) / 2)
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

/** NFL results land about 13.5 points either side of the line. */
const MARGIN_SD = 13.45

/** The home team's chance to win from its line (-3.5 = favored by 3.5). */
export const spreadHomeWinChance = (spread: number) => normalCdf(-spread / MARGIN_SD)

/** The home team's chance before kickoff: the moneyline, else the spread, else a coin flip. */
export function pregameHomeWinChance(g: Game): number {
  if (g.pregame_home_wp != null) return g.pregame_home_wp
  if (g.spread != null) return spreadHomeWinChance(g.spread)
  return 0.5
}

/** How much of a game is left, 0–1. Overtime counts as nearly over. */
export function timeLeft(g: Game): number {
  if (isFinal(g)) return 0
  if (!isLive(g)) return 1
  const period = g.period ?? 1
  const [m, s] = (g.clock ?? '').split(':').map(Number)
  const secs = Number.isFinite(m) ? m * 60 + (Number.isFinite(s) ? s : 0) : 900
  const left = period > 4 ? secs / 3600 : ((4 - period) * 900 + secs) / 3600
  return Math.min(1, Math.max(0.005, left))
}

/**
 * The home team's chance to win right now: settled once final, ESPN's
 * live number while it's on (else Stern's score-and-clock model, the
 * line playing out over the time left), the pregame line before.
 */
export function homeWinChance(g: Game): number {
  if (isFinal(g)) {
    const w = winnerOf(g)
    return w == null ? 0.5 : w === g.home_team ? 1 : 0
  }
  if (!isLive(g)) return pregameHomeWinChance(g)
  if (g.live_home_wp != null) return Math.min(1, Math.max(0, g.live_home_wp))
  const left = timeLeft(g)
  const margin = (g.home_score ?? 0) - (g.away_score ?? 0)
  return normalCdf((margin - (g.spread ?? 0) * left) / (MARGIN_SD * Math.sqrt(left)))
}

/** "4:02 left in the 4th", "OT 6:10", "Q3 11:20". */
export function gameClockLabel(g: Game): string {
  const p = g.period ?? 0
  if (p > 4) return `OT ${g.clock ?? ''}`.trim()
  if (p === 4) return g.clock ? `${g.clock} left in the 4th` : '4th quarter'
  return p ? `Q${p} ${g.clock ?? ''}`.trim() : 'Live'
}

// ── Bad beats ────────────────────────────────────────────────

/** A pick "dies hard" when its team had at least this win chance in the second half, then lost. */
export const BAD_BEAT_CHANCE = 0.75

export interface BadBeat {
  gameId: string
  week: number
  loser: string
  winner: string
  loserScore: number
  winnerScore: number
  /** The loser's best second-half win chance, 0–1. */
  peak: number
  decided: GameStory['decided']
  /** Who picked the loser (user ids). */
  victims: string[]
  pickers: number
}

const secondsLeft = (d: GameStory['decided']) => {
  if (!d) return Infinity
  const [m, s] = d.clock.split(':').map(Number)
  const clock = (Number.isFinite(m) ? m * 60 : 0) + (Number.isFinite(s) ? s : 0)
  return d.period > 4 ? -1 : (4 - d.period) * 900 + clock
}

/**
 * Picks that lost after their team was a big second-half favorite,
 * one entry per game, worst first: highest peak, then the latest
 * go-ahead score. Needs game_story, so games without one are skipped.
 */
export function computeBadBeats(games: Game[], picks: Pick[]): BadBeat[] {
  const out: BadBeat[] = []
  for (const g of games) {
    const s = g.game_story
    if (!isFinal(g) || !s?.loser || !s.winner || s.loserPeakWp == null || s.loserPeakWp < BAD_BEAT_CHANCE) continue
    const gp = picks.filter(p => p.game_id === g.id && (p.picked_team === g.home_team || p.picked_team === g.away_team))
    const victims = gp.filter(p => p.picked_team === s.loser).map(p => p.user_id)
    if (victims.length === 0) continue
    const score = (t: string) => (t === g.home_team ? g.home_score : g.away_score) ?? 0
    out.push({
      gameId: g.id, week: g.week, loser: s.loser, winner: s.winner,
      loserScore: score(s.loser), winnerScore: score(s.winner),
      peak: s.loserPeakWp, decided: s.decided, victims, pickers: gp.length,
    })
  }
  return out.sort((a, b) => b.peak - a.peak || secondsLeft(a.decided) - secondsLeft(b.decided))
}

// ── Upset watch ──────────────────────────────────────────────

export interface UpsetWatch {
  game: Game
  /** The team most of the league picked, now in trouble. */
  crowd: string
  dog: string
  crowdPicks: number
  pickers: number
  crowdScore: number
  dogScore: number
  /** The crowd team's chance to still win, 0–1. */
  chance: number
}

/**
 * Live games in the 4th quarter or overtime where the team most of the
 * league backed (at least `minPickers` of them and `share` of the
 * pickers) is behind and under 50%, or under 30% however close.
 * These games have kicked off, so the picks are public. Most-backed
 * first.
 */
export function computeUpsetWatch(games: Game[], picks: Pick[], { minPickers = 4, share = 0.65 } = {}): UpsetWatch[] {
  const out: UpsetWatch[] = []
  for (const g of games) {
    if (!isLive(g) || timeLeft(g) > 0.25) continue
    const gp = picks.filter(p => p.game_id === g.id)
    const home = gp.filter(p => p.picked_team === g.home_team).length
    const away = gp.filter(p => p.picked_team === g.away_team).length
    const pickers = home + away
    const crowdIsHome = home >= away
    const crowdPicks = Math.max(home, away)
    if (crowdPicks < minPickers || crowdPicks / pickers < share) continue
    const homeChance = homeWinChance(g)
    const chance = crowdIsHome ? homeChance : 1 - homeChance
    const crowdScore = (crowdIsHome ? g.home_score : g.away_score) ?? 0
    const dogScore = (crowdIsHome ? g.away_score : g.home_score) ?? 0
    if (!((crowdScore < dogScore && chance < 0.5) || chance < 0.3)) continue
    out.push({
      game: g, crowd: crowdIsHome ? g.home_team : g.away_team, dog: crowdIsHome ? g.away_team : g.home_team,
      crowdPicks, pickers, crowdScore, dogScore, chance,
    })
  }
  return out.sort((a, b) => b.crowdPicks - a.crowdPicks || a.chance - b.chance)
}

// ── The Belt ─────────────────────────────────────────────────

/**
 * A finished week's winners — the recap's rule: most correct, then
 * closest tiebreaker guess, an exact tie on both shared. `rows` as
 * computeWeek returns them (ranked).
 */
export function weekWinners(rows: WeekRow[]): WeekRow[] {
  const played = rows.filter(r => r.submitted)
  const top = played[0]
  if (!top || top.played === 0) return []
  return played.filter(r =>
    r.correct === top.correct && (r.tiebreakerDiff ?? Infinity) === (top.tiebreakerDiff ?? Infinity))
}

export interface BeltHolder { userId: string; name: string; /** Straight weeks won, this one included. */ reign: number }

export interface Belt {
  /** Whoever won the latest finished week (more than one on a shared win). */
  holders: BeltHolder[]
  week: number
  /** Every finished week's winners, oldest first. */
  lineage: { week: number; winners: { userId: string; name: string }[] }[]
  /** The longest run of straight weekly wins this season (2+). */
  longest: { names: string[]; weeks: number } | null
}

/** The championship belt: the latest week's winner holds it until someone else wins a week. */
export function computeBelt(games: Game[], picks: Pick[], members: Member[]): Belt | null {
  const played = games.filter(g => !isVoid(g))
  const weeks = [...new Set(played.map(g => g.week))].sort((a, b) => a - b)
  const lineage: Belt['lineage'] = []
  for (const wk of weeks) {
    const wkGames = played.filter(g => g.week === wk)
    if (!isWeekComplete(wkGames)) continue
    const winners = weekWinners(computeWeek(wkGames, picks.filter(p => p.week === wk), members))
    if (winners.length) lineage.push({ week: wk, winners: winners.map(w => ({ userId: w.userId, name: w.name })) })
  }
  if (lineage.length === 0) return null

  const runOf = (userId: string, upTo: number) => {
    let n = 0
    for (let i = upTo; i >= 0 && lineage[i].winners.some(w => w.userId === userId); i--) n++
    return n
  }
  const last = lineage.length - 1
  const holders = lineage[last].winners.map(w => ({ ...w, reign: runOf(w.userId, last) }))

  const best = new Map<string, { name: string; weeks: number }>()
  lineage.forEach((l, i) => l.winners.forEach(w => {
    const n = runOf(w.userId, i)
    if (n > (best.get(w.userId)?.weeks ?? 0)) best.set(w.userId, { name: w.name, weeks: n })
  }))
  const top = Math.max(...[...best.values()].map(b => b.weeks))
  const longest = top >= 2
    ? { weeks: top, names: [...best.values()].filter(b => b.weeks === top).map(b => b.name) }
    : null

  return { holders, week: lineage[last].week, lineage, longest }
}

// ── Chance to win the week ───────────────────────────────────

/** How one unfinished game moves everyone's chance to win the week. */
export interface GameSwing {
  game: Game
  /** Each player's chance to win the week if the home team wins, and if the away team does. */
  ifHome: Map<string, number>
  ifAway: Map<string, number>
  /** The home team's chance to win this game, as simulated. */
  homeChance: number
  /**
   * How much this game decides the week, 0–1: how far the result moves
   * the chances around (half the total change across players), scaled
   * by how open the game still is (a 50/50 game counts fully, a near
   * certainty hardly at all).
   */
  stakes: number
  /** One side too unlikely to say what it would do (under 20 simulated wins). */
  settled: boolean
}

export interface WinOdds {
  /** Each player's chance to win the week right now, 0–1 (a shared win splits). */
  now: Map<string, number>
  /** The same before anything kicked off. */
  kickoff: Map<string, number>
  /**
   * With `recent`: the same just before `recentGames` kicked off — what
   * the ▲▼ arrows compare against, so they show which way things are
   * going now rather than since the week began.
   */
  recent?: Map<string, number>
  /** The games on now (with the rest of their slate), or the last slate played. */
  recentGames?: Game[]
  /** With `swings`: every unfinished game, most decisive first. */
  swings?: GameSwing[]
}

/** Kickoffs this close together are one slate (Sunday's 4:05 and 4:25). */
const SLATE_MS = 90 * 60_000

/**
 * The games the odds arrows measure: the ones on now plus any from the
 * same slate already over, or with nothing on, the last slate played.
 */
export function recentSlate(games: Game[]): Game[] {
  const ko = (g: Game) => new Date(g.game_date).getTime()
  const started = games.filter(g => !isVoid(g) && (isLive(g) || isFinal(g)))
  if (started.length === 0) return []
  const live = started.filter(isLive)
  const from = (live.length ? Math.min(...live.map(ko)) : Math.max(...started.map(ko))) - SLATE_MS
  return started.filter(g => ko(g) >= from)
}

/** The recent slate by name: "PHI-CHI", "these games", "the last games". */
export function recentSlateName(slate: Game[]): string {
  if (slate.length === 0) return 'kickoff'
  if (slate.length === 1) return `${slate[0].away_team}-${slate[0].home_team}`
  return slate.some(isLive) ? 'these games' : 'the last games'
}

/** The arrows' caption: "since PHI-CHI kicked off", "from the last games". */
export function recentSlateLabel(slate: Game[]): string {
  if (slate.length === 0) return 'since kickoff'
  const name = recentSlateName(slate)
  return slate.some(isLive) ? `since ${name} kicked off` : `from ${name}`
}

/** Share of hidden picks assumed to go to the favorite (roughly how pick'em leagues pick). */
const CHALK_RATE = 0.68

/** Small seeded PRNG, so the same inputs always give the same odds. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Plays out the rest of the week `sims` times and counts how often each
 * player wins it, under the recap's rule (most correct, then closest
 * tiebreaker guess, an exact tie splits).
 *
 * Every unfinished game goes by its win chance (homeWinChance: live
 * win probability, else the pregame line), and the tiebreaker total
 * lands around the over/under, scaled to the time left.
 *
 * Picks on games that haven't locked (`isOpen`) are hidden from other
 * players, so with `viewerId` set only the viewer's own are read:
 * everyone else is assumed to take the favorite CHALK_RATE of the time
 * and to guess near the over/under — the odds can't give a pick away
 * (same idea as computeWhoCanWin's viewer). A viewerId that isn't a
 * player hides every open pick. Returns null until a game has kicked
 * off, and once the week is over.
 *
 * With `swings`, it also splits the same simulations by each unfinished
 * game's result — who you should root for, and which games decide the
 * week (GameSwing).
 */
export function computeWinOdds(
  games: Game[], picks: Pick[], rows: WeekRow[],
  { isOpen = () => false, viewerId, sims = 4000, swings = false, recent = false }:
    { isOpen?: (g: Game) => boolean; viewerId?: string; sims?: number; swings?: boolean; recent?: boolean } = {},
): WinOdds | null {
  const playable = games.filter(g => !isVoid(g))
  if (playable.length === 0 || playable.every(isFinal)) return null
  if (!playable.some(g => isFinal(g) || isLive(g))) return null
  const players = rows.filter(r => r.submitted)
  if (players.length === 0) return null

  const pickOf = new Map(picks.map(p => [`${p.user_id}:${p.game_id}`, p.picked_team]))
  const known = (userId: string, g: Game) => viewerId == null || userId === viewerId || !isOpen(g)
  const tb = playable.find(g => g.is_tiebreaker)
  const ou = tb?.over_under ?? 44
  const favorite = playable.map(g => (pregameHomeWinChance(g) >= 0.5 ? g.home_team : g.away_team))
  const underdog = playable.map((g, i) => (favorite[i] === g.home_team ? g.away_team : g.home_team))
  // Each player's pick per game: the team, null for no pick, undefined when hidden
  const table = players.map(r => playable.map(g =>
    known(r.userId, g) ? pickOf.get(`${r.userId}:${g.id}`) ?? null : undefined))
  const guessKnown = players.map(r => !tb || known(r.userId, tb))

  // `unplayed(g)`: play the week as if g hadn't kicked off yet (its
  // pregame chance, no score) — every game for the kickoff odds, the
  // recent slate's for the arrows, none for now
  const run = (unplayed: (g: Game) => boolean, split: boolean) => {
    // One seed for every run and a draw for every game, settled or not, so
    // two runs differ by what happened on the field and not by the dice
    const rand = mulberry32(playable.length * 7919 + 2)
    const normal = () => {
      const u = 1 - rand(), v = rand()
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    }
    // A final game's result is settled ('' for a tie: nobody's pick matches)
    const fixed = playable.map(g => (!unplayed(g) && isFinal(g) ? winnerOf(g) ?? '' : null))
    const chance = playable.map(g => (unplayed(g) ? pregameHomeWinChance(g) : homeWinChance(g)))
    const tbFresh = !tb || unplayed(tb)
    const tbNow = tb && !tbFresh ? (tb.home_score ?? 0) + (tb.away_score ?? 0) : 0
    const tbLeft = tb && !tbFresh ? timeLeft(tb) : 1

    // Credit split by each open game's result, when asked for
    const open = playable.map((_, i) => fixed[i] == null)
    const byHome = split ? playable.map(() => new Array<number>(players.length).fill(0)) : []
    const byAway = split ? playable.map(() => new Array<number>(players.length).fill(0)) : []
    const homeWins = new Array<number>(playable.length).fill(0)

    const credit = new Array<number>(players.length).fill(0)
    const pts = new Array<number>(players.length).fill(0)
    const winner = new Array<string>(playable.length)
    const give = (u: number, amount: number) => {
      credit[u] += amount
      if (!split) return
      for (let i = 0; i < playable.length; i++) {
        if (!open[i]) continue
        if (winner[i] === playable[i].home_team) byHome[i][u] += amount
        else byAway[i][u] += amount
      }
    }
    for (let s = 0; s < sims; s++) {
      for (let i = 0; i < playable.length; i++) {
        const roll = rand()
        winner[i] = fixed[i] ?? (roll < chance[i] ? playable[i].home_team : playable[i].away_team)
        if (winner[i] === playable[i].home_team) homeWins[i]++
      }
      let best = -1
      for (let u = 0; u < players.length; u++) {
        let n = 0
        const row = table[u]
        for (let i = 0; i < playable.length; i++) {
          const pick = row[i] === undefined ? (rand() < CHALK_RATE ? favorite[i] : underdog[i]) : row[i]
          if (pick === winner[i]) n++
        }
        pts[u] = n
        if (n > best) best = n
      }
      const tied: number[] = []
      for (let u = 0; u < players.length; u++) if (pts[u] === best) tied.push(u)
      if (tied.length === 1) { give(tied[0], 1); continue }

      // Tiebreaker: closest guess to a simulated total; no guess loses
      const total = !tb ? 0
        : !tbFresh && isFinal(tb) ? tbNow
        : tbNow + Math.max(0, Math.round(ou * tbLeft + normal() * 13 * Math.sqrt(tbLeft)))
      let closest = Infinity
      const diffs = tied.map(u => {
        const guess = guessKnown[u] ? players[u].tiebreakerGuess : Math.round(ou + normal() * 6)
        const d = guess == null ? Infinity : Math.abs(guess - total)
        if (d < closest) closest = d
        return d
      })
      const share = tied.filter((_, k) => diffs[k] === closest)
      for (const u of share) give(u, 1 / share.length)
    }

    const odds = new Map(players.map((r, u) => [r.userId, credit[u] / sims]))
    if (!split) return { odds }

    const gameSwings: GameSwing[] = []
    playable.forEach((g, i) => {
      if (!open[i]) return
      const nHome = homeWins[i], nAway = sims - homeWins[i]
      const ifHome = new Map(players.map((r, u) => [r.userId, nHome ? byHome[i][u] / nHome : 0]))
      const ifAway = new Map(players.map((r, u) => [r.userId, nAway ? byAway[i][u] / nAway : 0]))
      const p = nHome / sims
      const settled = Math.min(nHome, nAway) < 20
      const moved = players.reduce((sum, r) => sum + Math.abs(ifHome.get(r.userId)! - ifAway.get(r.userId)!), 0) / 2
      gameSwings.push({ game: g, ifHome, ifAway, homeChance: p, settled, stakes: settled ? 0 : moved * 4 * p * (1 - p) })
    })
    gameSwings.sort((a, b) => b.stakes - a.stakes)
    return { odds, swings: gameSwings }
  }

  const current = run(() => false, swings)
  const out: WinOdds = { now: current.odds, kickoff: run(() => true, false).odds }
  if (current.swings) out.swings = current.swings
  if (recent) {
    const slate = recentSlate(playable)
    const inSlate = new Set(slate.map(g => g.id))
    out.recent = run(g => inSlate.has(g.id), false).odds
    out.recentGames = slate
  }
  return out
}

/**
 * One player's side of a game: whom to root for and what each result
 * does to their chance to win the week. Null when the result barely
 * matters to them (under a point either way) or can't be told yet.
 */
export function rootingFor(s: GameSwing, userId: string): { team: string; ifWin: number; ifLose: number } | null {
  if (s.settled) return null
  const h = s.ifHome.get(userId) ?? 0, a = s.ifAway.get(userId) ?? 0
  if (Math.abs(h - a) < 0.01) return null
  return h > a
    ? { team: s.game.home_team, ifWin: h, ifLose: a }
    : { team: s.game.away_team, ifWin: a, ifLose: h }
}

/** Players whose chance to win the week moves at least `min` on this game. */
export function swingsFor(s: GameSwing, min = 0.05): string[] {
  if (s.settled) return []
  return [...s.ifHome.keys()].filter(id => Math.abs((s.ifHome.get(id) ?? 0) - (s.ifAway.get(id) ?? 0)) >= min)
}

// ── Pick DNA ──────────────────────────────────────────────────

/** Each 0–1, null when there's nothing to measure yet. */
export interface PickTraits {
  /** Share of picks on the pregame favorite (games with a line). */
  chalk: number | null
  /** Share of picks against the league's majority (3+ pickers, not an even split). */
  contrarian: number | null
  /** Share of picks on the home team. */
  homer: number | null
  /** Share of your favorite team's games where you picked them. */
  loyalty: number | null
  /** Share of picks that were right. */
  hitRate: number | null
}

export interface PickArchetype { key: string; title: string; blurb: string }

export interface PickDNA extends PickTraits {
  userId: string
  name: string
  /** Picks counted: final games with a winner. */
  picks: number
  favoriteTeam: string | null
  loyaltyGames: number
  /** Games they picked their team as the pregame underdog. */
  loyalAsUnderdog: number
  archetype: PickArchetype
}

/** Fewer decided picks than this and it's too early to call anyone anything. */
const MIN_DNA_PICKS = 8

/**
 * How each player picks — favorites or underdogs, with or against the
 * league, home teams, their own team — from final games only (their
 * picks are public, and the favorite is the frozen pregame line).
 * `league` averages players with enough picks to count.
 */
export function computePickDNA(games: Game[], picks: Pick[], members: Member[]): { players: PickDNA[]; league: PickTraits } {
  const finals = games.filter(g => !isVoid(g) && isFinal(g) && winnerOf(g) != null)
  const byGame = new Map<string, Pick[]>()
  for (const p of picks) {
    if (!byGame.has(p.game_id)) byGame.set(p.game_id, [])
    byGame.get(p.game_id)!.push(p)
  }
  const ratio = (n: number, d: number) => (d > 0 ? n / d : null)

  const players = members.map(m => {
    const team = m.profile?.favorite_nfl_team ?? null
    let n = 0, hits = 0, home = 0, favN = 0, fav = 0, crowdN = 0, against = 0, loyalN = 0, loyal = 0, loyalDog = 0
    for (const g of finals) {
      const all = (byGame.get(g.id) ?? []).filter(p => p.picked_team === g.home_team || p.picked_team === g.away_team)
      const mine = all.find(p => p.user_id === m.user_id)
      if (!mine) continue
      const pick = mine.picked_team
      n++
      if (pick === winnerOf(g)) hits++
      if (pick === g.home_team) home++
      const pre = g.pregame_home_wp ?? (g.spread != null ? spreadHomeWinChance(g.spread) : null)
      if (pre != null && pre !== 0.5) {
        favN++
        if (pick === (pre > 0.5 ? g.home_team : g.away_team)) fav++
      }
      const homeN = all.filter(p => p.picked_team === g.home_team).length
      if (all.length >= 3 && homeN * 2 !== all.length) {
        crowdN++
        if (pick !== (homeN * 2 > all.length ? g.home_team : g.away_team)) against++
      }
      if (team && (g.home_team === team || g.away_team === team)) {
        loyalN++
        if (pick === team) {
          loyal++
          if (pre != null && pre !== 0.5 && (pre > 0.5 ? g.home_team : g.away_team) !== team) loyalDog++
        }
      }
    }
    return {
      userId: m.user_id, name: nameOf(m), picks: n, favoriteTeam: team, loyaltyGames: loyalN, loyalAsUnderdog: loyalDog,
      chalk: ratio(fav, favN), contrarian: ratio(against, crowdN), homer: ratio(home, n),
      loyalty: ratio(loyal, loyalN), hitRate: ratio(hits, n),
    }
  })

  const counted = players.filter(p => p.picks >= MIN_DNA_PICKS)
  const avg = (k: keyof PickTraits) => {
    const vals = counted.map(p => p[k]).filter((v): v is number => v != null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }
  const league: PickTraits = {
    chalk: avg('chalk'), contrarian: avg('contrarian'), homer: avg('homer'), loyalty: avg('loyalty'), hitRate: avg('hitRate'),
  }

  return {
    players: players.map(p => ({ ...p, archetype: archetypeOf(p, league) })),
    league,
  }
}

function archetypeOf(p: Omit<PickDNA, 'archetype'>, league: PickTraits): PickArchetype {
  if (p.picks < MIN_DNA_PICKS) return { key: 'rookie', title: 'Still Loading', blurb: 'Not enough finished picks to tell yet.' }
  // Loyal even when their team was the underdog
  if (p.loyalty === 1 && p.loyaltyGames >= 3 && p.loyalAsUnderdog >= 1) {
    return { key: 'rideOrDie', title: 'Ride or Die', blurb: `Picked ${p.favoriteTeam} in all ${p.loyaltyGames} of their games, underdog or not.` }
  }
  if (p.contrarian != null && p.contrarian >= 0.35) {
    return { key: 'contrarian', title: 'The Contrarian', blurb: 'Goes against the league more than anyone should.' }
  }
  if (p.chalk != null && p.chalk >= 0.85) return { key: 'chalk', title: 'Chalk Eater', blurb: 'Takes the favorite almost every time.' }
  if (p.chalk != null && p.chalk <= 0.5) return { key: 'upset', title: 'Upset Hunter', blurb: 'Happily rides with the underdog.' }
  if (p.hitRate != null && league.hitRate != null && p.hitRate >= league.hitRate + 0.08) {
    return { key: 'sharp', title: 'The Sharp', blurb: 'Right more often than the rest of the league.' }
  }
  if (p.homer != null && p.homer >= 0.7) return { key: 'homebody', title: 'Homebody', blurb: 'Trusts the home crowd.' }
  if (p.homer != null && p.homer <= 0.3) return { key: 'road', title: 'Road Warrior', blurb: 'Loves the team that traveled.' }
  if (p.hitRate != null && p.hitRate <= 0.45) return { key: 'coinFlip', title: 'Coin Flipper', blurb: 'A coin would give you a run for it.' }
  return { key: 'steady', title: 'Steady Hand', blurb: 'Right down the middle on everything.' }
}

// ── Achievements ─────────────────────────────────────────────

export type AchievementKey =
  | 'champ' | 'defender' | 'dynasty' | 'perfect' | 'sniper' | 'calledIt'
  | 'beatVegas' | 'upsetArtist' | 'miracle' | 'scarTissue' | 'ironMan'

/** Every badge, in the order they're shown. */
export const ACHIEVEMENTS: { key: AchievementKey; label: string; blurb: string }[] = [
  { key: 'champ',       label: 'Week Winner',    blurb: 'Won a week' },
  { key: 'defender',    label: 'Belt Defender',  blurb: 'Won two weeks in a row' },
  { key: 'dynasty',     label: 'Dynasty',        blurb: 'Won three weeks in a row' },
  { key: 'perfect',     label: 'Perfect Week',   blurb: 'Every pick right in a week (10+ games)' },
  { key: 'sniper',      label: 'Sniper',         blurb: 'Nailed the tiebreaker total exactly' },
  { key: 'calledIt',    label: 'Called It',      blurb: 'The only one of 5+ pickers to take a winner' },
  { key: 'beatVegas',   label: 'Beat Vegas',     blurb: 'More right in a week than taking every favorite' },
  { key: 'upsetArtist', label: 'Upset Artist',   blurb: 'Three underdog winners in one week' },
  { key: 'miracle',     label: 'Miracle Worker', blurb: 'Went against the crowd, and your pick won from 10% or worse' },
  { key: 'scarTissue',  label: 'Scar Tissue',    blurb: 'Lost a pick that was 95%+ to win in the second half' },
  { key: 'ironMan',     label: 'Iron Man',       blurb: 'Every pick and tiebreaker in, four weeks straight' },
]

export interface AchievementEvent {
  week: number
  /** When it was earned: the game's kickoff, or the week's last kickoff for a whole-week badge. */
  date: string
  /** What happened, e.g. "The only one of 18 to pick NO (NO 24–17 BAL)". */
  detail: string
}

export interface EarnedAchievement {
  key: AchievementKey
  /** Weeks it was earned (a badge can be earned more than once). */
  weeks: number[]
  /** Every time it was earned, oldest first. */
  events: AchievementEvent[]
}

const weekList = (ws: number[]) =>
  ws.length <= 1 ? `Week ${ws[0]}` : `Weeks ${ws.slice(0, -1).join(', ')} and ${ws[ws.length - 1]}`

/**
 * Badges each player has earned, from finished weeks only (so nothing
 * is ever taken back), each time with when and what happened. Week
 * wins use the recap's rule (weekWinners); favorites and underdogs the
 * frozen pregame line; comebacks the game story. Players with nothing
 * earned are left out.
 */
export function computeAchievements(games: Game[], picks: Pick[], members: Member[]): Map<string, EarnedAchievement[]> {
  const played = games.filter(g => !isVoid(g))
  const weeks = [...new Set(played.map(g => g.week))].sort((a, b) => a - b)
    .filter(wk => isWeekComplete(played.filter(g => g.week === wk)))

  const earned = new Map<string, Map<AchievementKey, AchievementEvent[]>>()
  const award = (userId: string, key: AchievementKey, week: number, date: string, detail: string) => {
    if (!earned.has(userId)) earned.set(userId, new Map())
    const m = earned.get(userId)!
    m.set(key, [...(m.get(key) ?? []), { week, date, detail }])
  }
  const winRun = new Map<string, number>()
  const fullRun = new Map<string, number>()
  const score = (g: Game, t: string) => (t === g.home_team ? g.home_score : g.away_score) ?? 0
  const other = (g: Game, t: string) => (t === g.home_team ? g.away_team : g.home_team)

  weeks.forEach((wk, wi) => {
    const wkGames = played.filter(g => g.week === wk)
    const wkPicks = picks.filter(p => p.week === wk)
    const rows = computeWeek(wkGames, wkPicks, members)
    const winners = new Set(weekWinners(rows).map(r => r.userId))
    const decided = wkGames.filter(g => winnerOf(g) != null)
    const lines = decided.map(g => {
      const pre = g.pregame_home_wp ?? (g.spread != null ? spreadHomeWinChance(g.spread) : null)
      return pre == null || pre === 0.5 ? null : pre > 0.5 ? g.home_team : g.away_team
    })
    const allLined = lines.every(l => l != null)
    const favoritesRight = decided.filter((g, i) => lines[i] === winnerOf(g)).length
    const tb = wkGames.find(g => g.is_tiebreaker)
    const tbTotal = tiebreakerTotal(wkGames)
    // A whole-week badge is dated when the week's last game kicked off
    const weekDate = wkGames.reduce((d, g) => (g.game_date > d ? g.game_date : d), '')

    for (const r of rows) {
      const id = r.userId
      const mine = wkPicks.filter(p => p.user_id === id)
      const pickOn = (g: Game) => mine.find(p => p.game_id === g.id)?.picked_team

      // Belt runs (every player's run resets on a week they didn't win)
      const run = winners.has(id) ? (winRun.get(id) ?? 0) + 1 : 0
      winRun.set(id, run)
      if (run >= 1) award(id, 'champ', wk, weekDate, `Won Week ${wk}, ${r.correct} of ${r.played} right`)
      if (run === 2) award(id, 'defender', wk, weekDate, `Won ${weekList(weeks.slice(wi - 1, wi + 1))} back to back`)
      if (run === 3) award(id, 'dynasty', wk, weekDate, `Won ${weekList(weeks.slice(wi - 2, wi + 1))} in a row`)

      // Every game and the tiebreaker picked
      const full = r.submitted && wkGames.every(g => pickOn(g)) && (!tb || r.tiebreakerGuess != null)
      const streak = full ? (fullRun.get(id) ?? 0) + 1 : 0
      fullRun.set(id, streak)
      if (streak > 0 && streak % 4 === 0) {
        award(id, 'ironMan', wk, weekDate, `Every pick and tiebreaker in, Weeks ${weeks[wi - 3]}–${wk}`)
      }
      if (!r.submitted) continue

      if (decided.length >= 10 && decided.every(g => pickOn(g) === winnerOf(g))) {
        award(id, 'perfect', wk, weekDate, `${decided.length} for ${decided.length} in Week ${wk}`)
      }
      if (r.tiebreakerDiff === 0 && tbTotal != null) {
        award(id, 'sniper', wk, tb?.game_date ?? weekDate, `Guessed ${r.tiebreakerGuess} for the Week ${wk} tiebreaker, and the total was exactly ${tbTotal}`)
      }

      const dogs: string[] = []
      decided.forEach((g, i) => {
        const pick = pickOn(g)
        if (!pick) return
        const w = winnerOf(g)!
        const final = `${w} ${score(g, w)}–${score(g, other(g, w))} ${other(g, w)}`
        if (pick === w) {
          const backers = wkPicks.filter(p => p.game_id === g.id && p.picked_team === w).length
          const pickers = wkPicks.filter(p => p.game_id === g.id && (p.picked_team === g.home_team || p.picked_team === g.away_team)).length
          if (backers === 1 && pickers >= 5) award(id, 'calledIt', wk, g.game_date, `The only one of ${pickers} to pick ${w} (${final})`)
          if (lines[i] != null && lines[i] !== w) dogs.push(w)
          // A comeback from 10% or worse that most of the league didn't see coming
          const peak = g.game_story?.loserPeakWp ?? 0
          if (peak >= 0.9 && backers * 2 < pickers) {
            award(id, 'miracle', wk, g.game_date,
              `Picked ${w} (${backers === 1 ? `the only one of ${pickers}` : `only ${backers} of ${pickers} did`}), and they came back from ${Math.round((1 - peak) * 100)}% to win (${final})`)
          }
        } else if (pick === g.game_story?.loser && (g.game_story.loserPeakWp ?? 0) >= 0.95) {
          award(id, 'scarTissue', wk, g.game_date, `${pick} was ${Math.round(g.game_story.loserPeakWp! * 100)}% to win and lost (${final})`)
        }
      })
      if (dogs.length >= 3) award(id, 'upsetArtist', wk, weekDate, `${dogs.length} underdog winners in Week ${wk}: ${dogs.join(', ')}`)
      if (allLined && decided.length > 0 && decided.every(g => pickOn(g)) && r.correct > favoritesRight) {
        award(id, 'beatVegas', wk, weekDate, `${r.correct} right in Week ${wk}; taking every favorite got ${favoritesRight}`)
      }
    }
  })

  const out = new Map<string, EarnedAchievement[]>()
  for (const [id, m] of earned) {
    out.set(id, ACHIEVEMENTS.filter(a => m.has(a.key)).map(a => {
      const events = m.get(a.key)!
      // Several in one week (two "Called It" games) count as one week earned
      return { key: a.key, weeks: [...new Set(events.map(e => e.week))], events }
    }))
  }
  return out
}

// ── Key injuries ─────────────────────────────────────────────

/** players.team holds full names; games use abbreviations. */
export const NFL_TEAM_ABBR: Record<string, string> = {
  'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL', 'Baltimore Ravens': 'BAL', 'Buffalo Bills': 'BUF',
  'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI', 'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE',
  'Dallas Cowboys': 'DAL', 'Denver Broncos': 'DEN', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX', 'Kansas City Chiefs': 'KC',
  'Los Angeles Chargers': 'LAC', 'Los Angeles Rams': 'LAR', 'Las Vegas Raiders': 'LV', 'Miami Dolphins': 'MIA',
  'Minnesota Vikings': 'MIN', 'New England Patriots': 'NE', 'New Orleans Saints': 'NO', 'New York Giants': 'NYG',
  'New York Jets': 'NYJ', 'Philadelphia Eagles': 'PHI', 'Pittsburgh Steelers': 'PIT', 'San Francisco 49ers': 'SF',
  'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB', 'Tennessee Titans': 'TEN', 'Washington Commanders': 'WSH',
}

export interface InjuredStarter {
  id: number
  name: string
  pos: string
  status: 'out' | 'questionable'
  /** When the status last changed (null if it predates tracking). */
  changedAt: string | null
}

/** Enough fantasy points a game that a non-QB starter's absence matters to picking the game. */
const KEY_PLAYER_PTS = 12

/**
 * Injured players who matter to picking a game, by team abbreviation:
 * the starting QB, or a starter averaging KEY_PLAYER_PTS+ points —
 * out (IR counts) or questionable. QBs first.
 */
export function keyInjuries(players: {
  id: number; name: string; team: string | null; pos: string | null; status: string | null
  depth_chart_rank: number | null; avg_pts: number | string | null; status_changed_at?: string | null
}[]): Map<string, InjuredStarter[]> {
  const out = new Map<string, InjuredStarter[]>()
  for (const p of players) {
    const team = p.team ? NFL_TEAM_ABBR[p.team] ?? (p.team.length <= 3 ? p.team : null) : null
    if (!team || p.depth_chart_rank !== 1) continue
    if (p.pos !== 'QB' && Number(p.avg_pts ?? 0) < KEY_PLAYER_PTS) continue
    const status = p.status === 'out' || p.status === 'ir' ? 'out' : p.status === 'questionable' ? 'questionable' : null
    if (!status) continue
    out.set(team, [...(out.get(team) ?? []), { id: p.id, name: p.name, pos: p.pos ?? '', status, changedAt: p.status_changed_at ?? null }])
  }
  for (const list of out.values()) list.sort((a, b) => Number(b.pos === 'QB') - Number(a.pos === 'QB'))
  return out
}

// ── Twins & Nemesis ───────────────────────────────────────────

export interface PickMatch {
  userId: string
  name: string
  /** Final games you both picked. */
  shared: number
  /** Share of those you picked the same way, 0–1. */
  agree: number
  /** Games you picked differently, and who was right. */
  split: number
  youRight: number
  theyRight: number
}

/** Fewer shared games than this and a match doesn't mean anything yet. */
const MIN_SHARED = 10

/**
 * For one player: the leaguemate who picks most like them (twin), the
 * one they disagree with most (nemesis), and their record in the games
 * they split. Final games only — every pick there is public.
 */
export function computePickMatches(games: Game[], picks: Pick[], members: Member[], userId: string): { twin: PickMatch | null; nemesis: PickMatch | null } {
  const finals = games.filter(g => !isVoid(g) && isFinal(g) && winnerOf(g) != null)
  const pickOf = new Map(picks.map(p => [`${p.user_id}:${p.game_id}`, p.picked_team]))
  const matches: PickMatch[] = members.filter(m => m.user_id !== userId).map(m => {
    let shared = 0, same = 0, youRight = 0, theyRight = 0
    for (const g of finals) {
      const mine = pickOf.get(`${userId}:${g.id}`)
      const theirs = pickOf.get(`${m.user_id}:${g.id}`)
      if (!mine || !theirs) continue
      shared++
      if (mine === theirs) { same++; continue }
      if (mine === winnerOf(g)) youRight++
      else if (theirs === winnerOf(g)) theyRight++
    }
    return {
      userId: m.user_id, name: nameOf(m), shared, agree: shared ? same / shared : 0,
      split: shared - same, youRight, theyRight,
    }
  }).filter(x => x.shared >= MIN_SHARED)

  if (matches.length === 0) return { twin: null, nemesis: null }
  const twin = [...matches].sort((a, b) => b.agree - a.agree || b.shared - a.shared)[0]
  const nemesis = [...matches].sort((a, b) => a.agree - b.agree || b.split - a.split)[0]
  return { twin, nemesis: nemesis.userId === twin.userId ? null : nemesis }
}
