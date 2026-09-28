// ESPN game data → what nfl_games stores: the pregame line and a
// final game's story. Pure (no Deno APIs), so it can be tested in Node.

import { spreadHomeWinChance, type GameStory } from '../_shared/pickemCore.ts'

export const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v)
  return v != null && v !== '' && Number.isFinite(n) ? n : null
}
/** "+164" / -198 → -198; zero or junk → null. */
const moneyline = (v: unknown): number | null => {
  const n = num(typeof v === 'string' ? v.replace('+', '') : v)
  return n != null && n !== 0 ? n : null
}
const implied = (ml: number) => (ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100))

/**
 * An ESPN odds object (scoreboard `odds[0]` or summary `pickcenter[0]`)
 * as the home team's pregame chance — both moneylines with the vig
 * removed, else the spread — plus the line and total. ESPN's `spread`
 * is the home team's line.
 */
export function pregameLine(o: any): { pregame_home_wp: number | null; spread: number | null; over_under: number | null } {
  const spread = num(o?.spread)
  const home = moneyline(o?.moneyline?.home?.close?.odds ?? o?.homeTeamOdds?.moneyLine)
  const away = moneyline(o?.moneyline?.away?.close?.odds ?? o?.awayTeamOdds?.moneyLine)
  const wp = home != null && away != null
    ? implied(home) / (implied(home) + implied(away))
    : spread != null ? spreadHomeWinChance(spread) : null
  return { pregame_home_wp: wp, spread, over_under: num(o?.overUnder) }
}

/** How a final game was lost, from its ESPN summary (see GameStory). */
export function gameStory(d: any, g: { home_team: string; away_team: string; home_score: number | null; away_score: number | null }): GameStory {
  const hs = g.home_score ?? 0, as = g.away_score ?? 0
  if (hs === as) {
    return { v: 1, winner: null, loser: null, loserPeakWp: null, peakPeriod: null, peakClock: null, loserLedLate: false, decided: null }
  }
  const homeWon = hs > as
  const winner = homeWon ? g.home_team : g.away_team
  const loser = homeWon ? g.away_team : g.home_team

  // Win probability comes per play id; the drive log says when each play was
  const at = new Map<string, { period: number; clock: string }>()
  for (const drive of [...(d.drives?.previous ?? []), ...(d.drives?.current ? [d.drives.current] : [])]) {
    for (const p of drive.plays ?? []) at.set(String(p.id), { period: p.period?.number ?? 1, clock: p.clock?.displayValue ?? '' })
  }
  let peak: number | null = null
  let peakAt: { period: number; clock: string } | null = null
  for (const w of d.winprobability ?? []) {
    if (typeof w.homeWinPercentage !== 'number') continue
    const when = at.get(String(w.playId))
    if (!when || when.period < 3) continue
    const chance = homeWon ? 1 - w.homeWinPercentage - (w.tiePercentage ?? 0) : w.homeWinPercentage
    if (peak == null || chance > peak) { peak = chance; peakAt = when }
  }

  // The last time the winner went ahead is when they went ahead for good
  let decided: GameStory['decided'] = null
  let loserLedLate = false
  let prevW = 0, prevL = 0
  for (const s of d.scoringPlays ?? []) {
    const w = (homeWon ? s.homeScore : s.awayScore) ?? 0
    const l = (homeWon ? s.awayScore : s.homeScore) ?? 0
    const period = s.period?.number ?? 1
    if (period >= 4 && (l > w || prevL > prevW)) loserLedLate = true
    if (w > l && prevW <= prevL) {
      decided = { period, clock: s.clock?.displayValue ?? '', team: winner, text: String(s.text ?? '').trim().slice(0, 140) }
    }
    prevW = w; prevL = l
  }

  return {
    v: 1, winner, loser,
    loserPeakWp: peak == null ? null : Math.round(peak * 1000) / 1000,
    peakPeriod: peakAt?.period ?? null, peakClock: peakAt?.clock ?? null,
    loserLedLate, decided,
  }
}

