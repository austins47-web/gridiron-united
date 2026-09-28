import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CURRENT_SEASON } from '@/lib/season'
import { livePollInterval } from '@/lib/pickemWeek'
import { fetchAll } from '@/lib/fetchAll'

// Stable empties, so memos keyed on these don't recompute every render
const NONE: any[] = []

/**
 * A league's members with their profiles — the Pick'Em page's names,
 * avatars and join dates.
 */
export function useLeagueMembersList(leagueId: string | null | undefined, enabled = true): any[] {
  const { data } = useQuery({
    queryKey: ['league-members-list', leagueId],
    enabled: !!leagueId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_members')
        .select('user_id, team_name, joined_at, profile:profiles(username, display_name, avatar_url, favorite_nfl_team)')
        .eq('league_id', leagueId!)
      if (error) throw error
      return data ?? []
    },
  })
  return data ?? NONE
}

/**
 * The season's games and a league's picks, which standings, Season
 * cards, badges and Wrapped are computed from (never a stored table,
 * so they can't drift). The Pick'Em page and the player card share
 * this cache.
 */
export function usePickemSeasonData(leagueId: string | null | undefined, enabled: boolean) {
  const { data: games } = useQuery({
    queryKey: ['pickem-season-games', CURRENT_SEASON],
    enabled: !!leagueId && enabled,
    staleTime: 60_000,
    // Live scores move the standings — but only poll while games are on
    refetchInterval: (q) => livePollInterval(q.state.data as any, 20_000),
    queryFn: async () => {
      // All columns: the pregame line and game stories feed Pick DNA,
      // bad beats and Wrapped
      const { data, error } = await supabase
        .from('nfl_games')
        .select('*')
        .eq('season', CURRENT_SEASON)
      if (error) throw error
      return data ?? []
    },
  })

  const { data: picks } = useQuery({
    queryKey: ['pickem-season-picks', leagueId],
    enabled: !!leagueId && enabled,
    staleTime: 30_000,
    queryFn: async () => {
      // A season of picks passes the API's 1,000-row cap — page through
      return (await fetchAll((from, to) => supabase
        .from('pickem_picks')
        .select('game_id, user_id, week, picked_team, tiebreaker_score, reason')
        .eq('league_id', leagueId!)
        .eq('season', CURRENT_SEASON)
        .order('id')
        .range(from, to)))
    },
  })

  return { games: games ?? NONE, picks: picks ?? NONE, loaded: !!games && !!picks }
}
