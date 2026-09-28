import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { LeaguePin } from '@/types/database'

export type PinWithAuthor = LeaguePin & { author: { username: string; display_name: string | null } | null }

/** The commissioner's pinned announcement in a league, if there is one. */
export function useLeaguePin(leagueId: string | null | undefined) {
  return useQuery<PinWithAuthor | null>({
    queryKey: ['league-pin', leagueId],
    enabled: !!leagueId,
    staleTime: 30_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_pins')
        .select('*, author:profiles!league_pins_pinned_by_fkey(username, display_name)')
        .eq('league_id', leagueId!)
        .maybeSingle()
      if (error) throw error
      return (data as unknown as PinWithAuthor | null) ?? null
    },
  })
}
