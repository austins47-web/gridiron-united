import { useQuery } from '@tanstack/react-query'
import {
  getNFLScores,
  getNFLLiveScores,
  getNFLPlayerStatsByWeek,
  getNFLNews,
  getCFBScores,
  getCFBPlayerStatsByWeek,
  getCurrentNFLWeek,
  calculateFantasyPoints,
  type SDIOScore,
  type SDIOPlayerGame,
  type SDIONews,
  type ScoringRules,
  DEFAULT_SCORING,
} from '@/lib/sportsdata'

// ── Current week ──────────────────────────────────────────────

export function useCurrentWeek() {
  return useQuery({
    queryKey: ['nfl-current-week'],
    queryFn: getCurrentNFLWeek,
    staleTime: 60 * 60 * 1000, // 1 hour
  })
}

// ── Live NFL scores (polls every 30s during games) ────────────

export function useNFLLiveScores() {
  return useQuery<SDIOScore[]>({
    queryKey: ['nfl-live-scores'],
    queryFn: getNFLLiveScores,
    refetchInterval: 30_000,  // every 30 seconds
    staleTime: 25_000,
  })
}

// ── NFL scores by week ────────────────────────────────────────

export function useNFLScores(week: number, season = 2026) {
  return useQuery<SDIOScore[]>({
    queryKey: ['nfl-scores', season, week],
    queryFn: () => getNFLScores(week, season),
    enabled: week > 0,
    staleTime: 5 * 60 * 1000,
    refetchInterval: (query) => {
      // Only poll if there are live games
      const data = query.state.data
      const hasLive = data?.some(g => g.Status === 'InProgress')
      return hasLive ? 30_000 : false
    },
  })
}

// ── NFL player stats by week ──────────────────────────────────

export function useNFLPlayerStats(week: number, season = 2026) {
  return useQuery<SDIOPlayerGame[]>({
    queryKey: ['nfl-player-stats', season, week],
    queryFn: () => getNFLPlayerStatsByWeek(week, season),
    enabled: week > 0,
    staleTime: 5 * 60 * 1000,
    refetchInterval: (query) => {
      // Poll every 60s during live scoring window
      // (player stats update less frequently than scores)
      const isGameDay = new Date().getDay() === 0 || // Sunday
                        new Date().getDay() === 1 || // Monday Night
                        new Date().getDay() === 4    // Thursday Night
      return isGameDay ? 60_000 : false
    },
  })
}

// ── Fantasy points for a specific player this week ───────────

export function usePlayerFantasyPoints(
  playerName: string,
  team: string,
  week: number,
  rules: ScoringRules = DEFAULT_SCORING,
  season = 2026
) {
  const { data: stats } = useNFLPlayerStats(week, season)

  const playerStats = stats?.find(
    s => s.Name.toLowerCase() === playerName.toLowerCase() &&
         s.Team.toLowerCase() === team.toLowerCase().replace(/\s+/g, '')
  )

  if (!playerStats) return { points: null, stats: null }

  return {
    points: calculateFantasyPoints(playerStats, rules),
    stats: playerStats,
  }
}

// ── Fantasy points for a full roster this week ───────────────

export interface RosterPlayerPoints {
  name: string
  team: string
  pos: string
  points: number | null
  stats: SDIOPlayerGame | null
}

export function useRosterLivePoints(
  roster: Array<{ name: string; team: string; pos: string }>,
  week: number,
  rules: ScoringRules = DEFAULT_SCORING,
  season = 2026
): RosterPlayerPoints[] {
  const { data: stats } = useNFLPlayerStats(week, season)

  return roster.map(player => {
    const found = stats?.find(
      s => s.Name.toLowerCase() === player.name.toLowerCase() &&
           normalizeTeam(s.Team) === normalizeTeam(player.team)
    )
    return {
      name: player.name,
      team: player.team,
      pos: player.pos,
      points: found ? calculateFantasyPoints(found, rules) : null,
      stats: found ?? null,
    }
  })
}

// ── CFB scores ────────────────────────────────────────────────

export function useCFBScores(week: number, season = 2026) {
  return useQuery({
    queryKey: ['cfb-scores', season, week],
    queryFn: () => getCFBScores(week, season),
    enabled: week > 0,
    staleTime: 5 * 60 * 1000,
  })
}

// ── CFB player stats ─────────────────────────────────────────

export function useCFBPlayerStats(week: number, season = 2026) {
  return useQuery({
    queryKey: ['cfb-player-stats', season, week],
    queryFn: () => getCFBPlayerStatsByWeek(week, season),
    enabled: week > 0,
    staleTime: 5 * 60 * 1000,
  })
}

// ── NFL news ──────────────────────────────────────────────────

export function useNFLNews(count = 20) {
  return useQuery<SDIONews[]>({
    queryKey: ['nfl-news', count],
    queryFn: () => getNFLNews(count),
    staleTime: 5 * 60 * 1000,  // 5 minutes
    refetchInterval: 10 * 60 * 1000, // refresh every 10 minutes
  })
}

// ── Helpers ───────────────────────────────────────────────────

// SportsDataIO uses abbreviations like 'KC', 'SF', 'NE'
// Our DB uses full names like 'Kansas City Chiefs', 'San Francisco 49ers'
export function normalizeTeam(team: string): string {
  const map: Record<string, string> = {
    'ARI': 'Arizona Cardinals', 'ATL': 'Atlanta Falcons',
    'BAL': 'Baltimore Ravens', 'BUF': 'Buffalo Bills',
    'CAR': 'Carolina Panthers', 'CHI': 'Chicago Bears',
    'CIN': 'Cincinnati Bengals', 'CLE': 'Cleveland Browns',
    'DAL': 'Dallas Cowboys', 'DEN': 'Denver Broncos',
    'DET': 'Detroit Lions', 'GB': 'Green Bay Packers',
    'HOU': 'Houston Texans', 'IND': 'Indianapolis Colts',
    'JAX': 'Jacksonville Jaguars', 'KC': 'Kansas City Chiefs',
    'LAC': 'Los Angeles Chargers', 'LAR': 'Los Angeles Rams',
    'LV': 'Las Vegas Raiders', 'MIA': 'Miami Dolphins',
    'MIN': 'Minnesota Vikings', 'NE': 'New England Patriots',
    'NO': 'New Orleans Saints', 'NYG': 'New York Giants',
    'NYJ': 'New York Jets', 'PHI': 'Philadelphia Eagles',
    'PIT': 'Pittsburgh Steelers', 'SEA': 'Seattle Seahawks',
    'SF': 'San Francisco 49ers', 'TB': 'Tampa Bay Buccaneers',
    'TEN': 'Tennessee Titans', 'WAS': 'Washington Commanders',
  }
  return map[team.toUpperCase()] ?? team
}

export function teamAbbr(fullName: string): string {
  const map: Record<string, string> = {
    'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL',
    'Baltimore Ravens': 'BAL', 'Buffalo Bills': 'BUF',
    'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI',
    'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE',
    'Dallas Cowboys': 'DAL', 'Denver Broncos': 'DEN',
    'Detroit Lions': 'DET', 'Green Bay Packers': 'GB',
    'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND',
    'Jacksonville Jaguars': 'JAX', 'Kansas City Chiefs': 'KC',
    'Los Angeles Chargers': 'LAC', 'Los Angeles Rams': 'LAR',
    'Las Vegas Raiders': 'LV', 'Miami Dolphins': 'MIA',
    'Minnesota Vikings': 'MIN', 'New England Patriots': 'NE',
    'New Orleans Saints': 'NO', 'New York Giants': 'NYG',
    'New York Jets': 'NYJ', 'Philadelphia Eagles': 'PHI',
    'Pittsburgh Steelers': 'PIT', 'Seattle Seahawks': 'SEA',
    'San Francisco 49ers': 'SF', 'Tampa Bay Buccaneers': 'TB',
    'Tennessee Titans': 'TEN', 'Washington Commanders': 'WAS',
  }
  return map[fullName] ?? fullName.substring(0, 3).toUpperCase()
}
