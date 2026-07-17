import { useQuery } from '@tanstack/react-query'
import {
  getNFLScores,
  getNFLLiveScores,
  getNFLPlayerStats,
  getNFLNews,
  getCFBScores,
  getCFBPlayerStats,
  getCurrentNFLWeek,
  calculateFantasyPoints,
  normalizeTeam,
  teamAbbr,
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
    staleTime: 60 * 60 * 1000,
  })
}

// ── Live NFL scores (polls every 30s during games) ────────────

export function useNFLLiveScores() {
  return useQuery<SDIOScore[]>({
    queryKey: ['nfl-live-scores'],
    queryFn: getNFLLiveScores,
    refetchInterval: 30_000,
    staleTime: 25_000,
  })
}

// ── NFL scores by week ────────────────────────────────────────

export function useNFLScores(week: number, season = 2026) {
  return useQuery<SDIOScore[]>({
    queryKey: ['nfl-scores', season, week],
    queryFn: () => getNFLScores(season, week),
    enabled: week > 0,
    staleTime: 5 * 60 * 1000,
    refetchInterval: (query) => {
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
    queryFn: () => getNFLPlayerStats(season, week),
    enabled: week > 0,
    staleTime: 5 * 60 * 1000,
    refetchInterval: () => {
      const day = new Date().getDay()
      const isGameDay = day === 0 || day === 1 || day === 4
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
         s.Team.toLowerCase() === teamAbbr(team).toLowerCase()
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
           normalizeTeam(s.Team).toLowerCase() === player.team.toLowerCase()
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
    queryFn: () => getCFBScores(season, week),
    enabled: week > 0,
    staleTime: 5 * 60 * 1000,
  })
}

// ── CFB player stats ──────────────────────────────────────────

export function useCFBPlayerStats(week: number, season = 2026) {
  return useQuery({
    queryKey: ['cfb-player-stats', season, week],
    queryFn: () => getCFBPlayerStats(season, week),
    enabled: week > 0,
    staleTime: 5 * 60 * 1000,
  })
}

// ── NFL news ──────────────────────────────────────────────────

export function useNFLNews(count = 20) {
  return useQuery<SDIONews[]>({
    queryKey: ['nfl-news', count],
    queryFn: getNFLNews,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  })
}

// ── Re-export helpers so components can import from one place ─

export { normalizeTeam, teamAbbr }