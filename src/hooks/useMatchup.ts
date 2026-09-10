import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Matchup } from '@/types/database'

// Every matchup this user is scheduled for across the season
// (home or away), ordered by week — drives the week selector and
// tells the Matchup tab apart from "no schedule yet" vs "bye week".
export function useMyMatchups(leagueId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['my-matchups', leagueId, userId],
    enabled: !!leagueId && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matchups')
        .select('*')
        .eq('league_id', leagueId!)
        .or(`home_user_id.eq.${userId},away_user_id.eq.${userId}`)
        .order('week', { ascending: true })
      if (error) throw error
      return (data ?? []) as Matchup[]
    },
  })
}

// Team names/avatars for a set of league members, keyed by user_id —
// used to label the opponent side of the matchup.
export function useLeagueMemberLabels(leagueId: string | null) {
  return useQuery({
    queryKey: ['league-member-labels', leagueId],
    enabled: !!leagueId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_members')
        .select('user_id, team_name, wins, losses, ties, profiles(username, display_name, avatar_url)')
        .eq('league_id', leagueId!)
      if (error) throw error
      const map = new Map<string, any>()
      for (const m of (data ?? [])) map.set(m.user_id, m)
      return map
    },
    staleTime: 60_000,
  })
}

export function useMatchupsRealtime(leagueId: string | null, userId: string | null) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!leagueId) return
    const channel = supabase
      .channel(`matchups:${leagueId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'matchups', filter: `league_id=eq.${leagueId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['my-matchups', leagueId, userId] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [leagueId, userId, qc])
}
