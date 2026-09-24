// ══════════════════════════════════════════════════════════════
// Pick'Em season views — each player's season, and the league's
// season awards.
//
// Records, weeks won and streaks come from computeStandings /
// computeWeek, so they match the Standings table exactly. The
// pick-by-pick facts (underdog picks, boldest call, record by team)
// only count final games — a live game's leader can still lose.
// ══════════════════════════════════════════════════════════════

import {
  computeStandings, computeWeek, isFinal, isVoid, isWeekComplete, rankOf, winnerOf,
  type Game, type Pick, type Member, type StandingRow,
} from './standings'

export interface SeasonWeek {
  week: number
  correct: number
  played: number
  won: boolean
  complete: boolean
}

export interface TeamRecord { team: string; wins: number; losses: number }

export interface SeasonProfile {
  userId: string
  name: string
  avatarUrl: string | null
  standing: StandingRow
  rank: number
  bestStreak: number
  weeks: SeasonWeek[]
  bestWeek: SeasonWeek | null
  toughestWeek: SeasonWeek | null
  /** Picks where most of the league (3+ pickers) went the other way. */
  underdog: { wins: number; losses: number }
  /** The correct pick the fewest people made. */
  boldestCall: { week: number; team: string; opponent: string; backers: number; pickers: number } | null
  /** Record when picking each team, most-picked first. */
  teams: TeamRecord[]
  bestTeam: TeamRecord | null
  worstTeam: TeamRecord | null
  tiebreaker: { avg: number; weeks: number; exact: number } | null
}

/** A team record needs this many decided picks to count as a "best/worst team". */
const MIN_TEAM_PICKS = 3

export function computeSeasonProfiles(games: Game[], picks: Pick[], members: Member[]): SeasonProfile[] {
  const standings = computeStandings(games, picks, members)
  const played = games.filter(g => !isVoid(g))
  const weeks = [...new Set(played.map(g => g.week))].sort((a, b) => a - b)

  // Week by week, same scoring and winner rule as the recap
  const weekRows = new Map<number, ReturnType<typeof computeWeek>>()
  const weekDone = new Map<number, boolean>()
  const weekWinners = new Map<number, Set<string>>()
  const tbTotals = new Map<number, number>()
  for (const wk of weeks) {
    const wkGames = played.filter(g => g.week === wk)
    if (!wkGames.some(g => isFinal(g) || g.status === 'in_progress')) continue
    const rows = computeWeek(wkGames, picks.filter(p => p.week === wk), members)
    weekRows.set(wk, rows)
    const done = isWeekComplete(wkGames)
    weekDone.set(wk, done)
    const top = rows.find(r => r.submitted)
    if (done && top && top.played > 0) {
      weekWinners.set(wk, new Set(rows.filter(r =>
        r.submitted && r.correct === top.correct &&
        (r.tiebreakerDiff ?? Infinity) === (top.tiebreakerDiff ?? Infinity)).map(r => r.userId)))
    }
    const tb = wkGames.find(g => g.is_tiebreaker)
    if (tb && isFinal(tb) && tb.home_score != null && tb.away_score != null) tbTotals.set(wk, tb.home_score + tb.away_score)
  }

  // Pick-by-pick context from final games: who picked what
  const finals = played.filter(g => isFinal(g) && winnerOf(g) != null)
  const pickersByGame = new Map<string, Pick[]>()
  for (const p of picks) {
    if (!pickersByGame.has(p.game_id)) pickersByGame.set(p.game_id, [])
    pickersByGame.get(p.game_id)!.push(p)
  }

  return standings.map((standing, i) => {
    const userId = standing.userId
    const mine = picks.filter(p => p.user_id === userId)

    const seasonWeeks: SeasonWeek[] = []
    for (const [wk, rows] of weekRows) {
      const r = rows.find(x => x.userId === userId)
      if (!r || !r.submitted) continue
      seasonWeeks.push({
        week: wk, correct: r.correct, played: r.played,
        won: weekWinners.get(wk)?.has(userId) ?? false,
        complete: weekDone.get(wk) ?? false,
      })
    }
    seasonWeeks.sort((a, b) => a.week - b.week)

    // Longest run of consecutive completed weeks won
    let bestStreak = 0, run = 0
    for (const wk of weeks.filter(w => weekDone.get(w))) {
      run = weekWinners.get(wk)?.has(userId) ? run + 1 : 0
      bestStreak = Math.max(bestStreak, run)
    }

    const done = seasonWeeks.filter(w => w.complete && w.played > 0)
    const pct = (w: SeasonWeek) => w.correct / w.played
    const bestWeek = done.reduce<SeasonWeek | null>((b, w) =>
      !b || w.correct > b.correct || (w.correct === b.correct && pct(w) > pct(b)) ? w : b, null)
    const toughestWeek = done.reduce<SeasonWeek | null>((b, w) =>
      !b || pct(w) < pct(b) || (pct(w) === pct(b) && w.correct < b.correct) ? w : b, null)

    const underdog = { wins: 0, losses: 0 }
    let boldestCall: SeasonProfile['boldestCall'] = null
    const teamMap = new Map<string, TeamRecord>()
    for (const g of finals) {
      const p = mine.find(x => x.game_id === g.id)
      if (!p) continue
      const winner = winnerOf(g)!
      const hit = p.picked_team === winner
      const all = (pickersByGame.get(g.id) ?? []).filter(x => x.picked_team === g.home_team || x.picked_team === g.away_team)
      const backers = all.filter(x => x.picked_team === p.picked_team).length

      if (all.length >= 3 && backers < all.length / 2) {
        if (hit) underdog.wins++; else underdog.losses++
      }
      if (hit && all.length >= 3) {
        const better = !boldestCall
          || backers < boldestCall.backers
          || (backers === boldestCall.backers && all.length > boldestCall.pickers)
        if (better) {
          boldestCall = {
            week: g.week, team: p.picked_team,
            opponent: p.picked_team === g.home_team ? g.away_team : g.home_team,
            backers, pickers: all.length,
          }
        }
      }
      const t = teamMap.get(p.picked_team) ?? { team: p.picked_team, wins: 0, losses: 0 }
      if (hit) t.wins++; else t.losses++
      teamMap.set(p.picked_team, t)
    }

    const teams = [...teamMap.values()].sort((a, b) =>
      (b.wins + b.losses) - (a.wins + a.losses) || b.wins - a.wins || a.team.localeCompare(b.team))
    const eligible = teams.filter(t => t.wins + t.losses >= MIN_TEAM_PICKS)
    const tPct = (t: TeamRecord) => t.wins / (t.wins + t.losses)
    const bestTeam = eligible
      .filter(t => tPct(t) > 0.5)
      .sort((a, b) => tPct(b) - tPct(a) || b.wins - a.wins)[0] ?? null
    const worstTeam = eligible
      .filter(t => tPct(t) < 0.5)
      .sort((a, b) => tPct(a) - tPct(b) || b.losses - a.losses)[0] ?? null

    const diffs: number[] = []
    for (const [wk, total] of tbTotals) {
      const guess = weekRows.get(wk)?.find(r => r.userId === userId)?.tiebreakerGuess
      if (guess != null) diffs.push(Math.abs(guess - total))
    }
    const tiebreaker = diffs.length
      ? { avg: diffs.reduce((a, b) => a + b, 0) / diffs.length, weeks: diffs.length, exact: diffs.filter(d => d === 0).length }
      : null

    return {
      userId, name: standing.name, avatarUrl: standing.avatarUrl, standing,
      rank: rankOf(standings, i),
      bestStreak, weeks: seasonWeeks, bestWeek, toughestWeek,
      underdog, boldestCall, teams, bestTeam, worstTeam, tiebreaker,
    }
  })
}

// ── Season awards ─────────────────────────────────────────────

export interface SeasonAward {
  key: string
  label: string
  /** Everyone sharing it. */
  names: string[]
  headline: string
  detail: string
}

export interface SeasonAwards {
  /** The season's last week (the Super Bowl) is final. */
  final: boolean
  awards: SeasonAward[]
}

/** Awards across the league — each left out until someone's earned it. */
export function computeSeasonAwards(games: Game[], picks: Pick[], members: Member[]): SeasonAwards {
  const profiles = computeSeasonProfiles(games, picks, members)
  const sb = games.filter(g => g.week === 22 && !isVoid(g))
  const final = sb.length > 0 && isWeekComplete(sb)
  const awards: SeasonAward[] = []
  const names = (ps: SeasonProfile[]) => ps.map(p => p.name)
  const topBy = <T>(ps: SeasonProfile[], score: (p: SeasonProfile) => T | null, better: (a: T, b: T) => number) => {
    const scored = ps.map(p => ({ p, s: score(p) })).filter((x): x is { p: SeasonProfile; s: T } => x.s != null)
    if (scored.length === 0) return null
    const best = scored.reduce((b, x) => (better(x.s, b.s) > 0 ? x : b)).s
    return { value: best, winners: scored.filter(x => better(x.s, best) === 0).map(x => x.p) }
  }

  if (final) {
    const champs = profiles.filter(p => p.rank === 1 && p.standing.played > 0)
    if (champs.length) {
      const s = champs[0].standing
      awards.push({
        key: 'champion', label: 'Champion', names: names(champs),
        headline: `${s.correct}–${Math.max(0, s.played - s.correct)}`,
        detail: `${Math.round(s.pct * 100)}% correct over the season`,
      })
    }
  }

  const weeksWon = topBy(profiles, p => p.standing.weeksWon || null, (a, b) => a - b)
  if (weeksWon) {
    awards.push({
      key: 'weeksWon', label: 'Most Weeks Won', names: names(weeksWon.winners),
      headline: `${weeksWon.value} week${weeksWon.value === 1 ? '' : 's'}`,
      detail: 'Most weekly wins, ties shared',
    })
  }

  const streak = topBy(profiles, p => (p.bestStreak >= 2 ? p.bestStreak : null), (a, b) => a - b)
  if (streak) {
    awards.push({
      key: 'streak', label: 'Longest Win Streak', names: names(streak.winners),
      headline: `${streak.value} in a row`,
      detail: 'Consecutive weeks won',
    })
  }

  const bestWeek = topBy(profiles, p => p.bestWeek, (a, b) => a.correct - b.correct || a.correct / a.played - b.correct / b.played)
  if (bestWeek) {
    const w = bestWeek.value
    awards.push({
      key: 'bestWeek', label: 'Best Week', names: names(bestWeek.winners),
      headline: `${w.correct}/${w.played}`,
      detail: bestWeek.winners.length === 1 ? `Week ${w.week}` : 'Best single-week score',
    })
  }

  const bold = topBy(profiles, p => p.boldestCall, (a, b) => b.backers - a.backers || a.pickers - b.pickers)
  if (bold) {
    const c = bold.value
    awards.push({
      key: 'boldestCall', label: 'Boldest Call',
      // A tie on backers can be two different calls — credit only the one shown
      names: names(bold.winners.filter(p => p.boldestCall!.team === c.team && p.boldestCall!.week === c.week)),
      headline: `${c.team} over ${c.opponent}`,
      detail: `${c.backers === 1 ? 'The only one' : `One of ${c.backers}`} of ${c.pickers} to pick it · Week ${c.week}`,
    })
  }

  const underdog = topBy(
    profiles,
    p => (p.underdog.wins + p.underdog.losses >= MIN_TEAM_PICKS && p.underdog.wins > p.underdog.losses ? p.underdog : null),
    (a, b) => a.wins / (a.wins + a.losses) - b.wins / (b.wins + b.losses) || a.wins - b.wins,
  )
  if (underdog) {
    awards.push({
      key: 'underdog', label: 'Underdog Hunter', names: names(underdog.winners),
      headline: `${underdog.value.wins}–${underdog.value.losses}`,
      detail: 'Best record picking against the crowd',
    })
  }

  const minTbWeeks = profiles.some(p => (p.tiebreaker?.weeks ?? 0) >= 2) ? 2 : 1
  const sharp = topBy(
    profiles,
    p => (p.tiebreaker && p.tiebreaker.weeks >= minTbWeeks ? p.tiebreaker.avg : null),
    (a, b) => b - a,
  )
  if (sharp) {
    awards.push({
      key: 'tiebreaker', label: 'Sharpest Tiebreaker', names: names(sharp.winners),
      headline: `Off by ${sharp.value.toFixed(1)}`,
      detail: 'Average miss on the tiebreaker total',
    })
  }

  const whisperer = topBy(
    profiles, p => p.bestTeam,
    (a, b) => a.wins / (a.wins + a.losses) - b.wins / (b.wins + b.losses) || a.wins - b.wins,
  )
  if (whisperer) {
    const t = whisperer.value
    awards.push({
      key: 'whisperer', label: 'Team Whisperer', names: names(whisperer.winners.filter(p => p.bestTeam!.team === t.team)),
      headline: `${t.wins}–${t.losses} on ${t.team}`,
      detail: `Best record picking one team`,
    })
  }

  const jinx = topBy(
    profiles, p => p.worstTeam,
    (a, b) => b.wins / (b.wins + b.losses) - a.wins / (a.wins + a.losses) || a.losses - b.losses,
  )
  if (jinx) {
    const t = jinx.value
    awards.push({
      key: 'jinx', label: 'The Jinx', names: names(jinx.winners.filter(p => p.worstTeam!.team === t.team)),
      headline: `${t.wins}–${t.losses} on ${t.team}`,
      detail: 'Worst record picking one team',
    })
  }

  return { final, awards }
}
