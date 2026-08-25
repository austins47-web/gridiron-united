// src/lib/byeWeeks.ts
//
// Bye weeks derived from nfl_games rather than stored anywhere —
// a team is on bye in a week if it simply doesn't appear in any
// row for that week. Since nfl_games is now synced from ESPN's
// real schedule (see supabase/functions/sync-nfl-schedule), this
// can never drift out of sync the way a separately-maintained
// bye-week table could.

export const ALL_NFL_TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB',  'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV',  'MIA', 'MIN', 'NE',  'NO',  'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF',  'TB',  'TEN', 'WSH',
]

export interface WeekGame {
  week: number
  home_team: string
  away_team: string
}

/** Teams with no game in this specific week's rows. */
export function byeTeamsForWeek(gamesThisWeek: WeekGame[]): string[] {
  const playing = new Set<string>()
  for (const g of gamesThisWeek) { playing.add(g.home_team); playing.add(g.away_team) }
  return ALL_NFL_TEAMS.filter(t => !playing.has(t))
}

/** Every week (1..totalWeeks) a given team has no game, across the full season. */
export function byeWeeksForTeam(
  seasonGames: WeekGame[],
  teamAbbr: string,
  totalWeeks = 18,
): number[] {
  const weeksPlaying = new Set(
    seasonGames
      .filter(g => g.home_team === teamAbbr || g.away_team === teamAbbr)
      .map(g => g.week)
  )
  const byes: number[] = []
  for (let w = 1; w <= totalWeeks; w++) {
    if (!weeksPlaying.has(w)) byes.push(w)
  }
  return byes
}
