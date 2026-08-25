import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface GameOdds {
  homeTeam: string
  awayTeam: string
  spread: number | null
  homeWinPct: number | null
  awayWinPct: number | null
  homeMoneyline: number | null
  awayMoneyline: number | null
}

/**
 * Odds, read from the odds_cache table instead of calling The Odds
 * API directly.
 *
 * This used to fetch The Odds API from every open browser tab on a
 * timer. Usage scaled with concurrent users rather than time, so a
 * free-tier 500-request/month quota was gone within days. Now a
 * single scheduled edge function (sync-odds) does the fetching on a
 * fixed cadence — see supabase/functions/sync-odds — and every
 * client just reads the result from Supabase. Total Odds API usage
 * is now fixed regardless of how many people are on the site.
 *
 * All the team-name mapping and fair-odds math that used to live
 * here moved server-side with the fetch, since it only matters at
 * write time.
 */
export function useNflOdds() {
  return useQuery({
    queryKey: ['odds-cache'],
    queryFn: async (): Promise<Map<string, GameOdds>> => {
      const { data, error } = await supabase
        .from('odds_cache')
        .select('*')
      if (error) throw error

      const map = new Map<string, GameOdds>()
      for (const row of data ?? []) {
        map.set(row.game_key, {
          homeTeam: row.home_team,
          awayTeam: row.away_team,
          spread: row.spread,
          homeWinPct: row.home_win_pct,
          awayWinPct: row.away_win_pct,
          homeMoneyline: row.home_moneyline,
          awayMoneyline: row.away_moneyline,
        })
      }
      return map
    },
    // The cache itself only updates every couple of hours (see the
    // sync-odds cron), so there's no reason to re-read more often
    // than that — this is a cheap Supabase read, not a scarce
    // third-party API call, but no point hammering it either.
    staleTime: 15 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
