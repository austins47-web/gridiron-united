import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import { useGameThreads } from './useGameThreads'

/** What phones can throw on the Shop TV (send_tv_reaction checks the same list). */
export const TV_REACTIONS = ['🔥', '😂', '💀', '🏈', '🎉', '😱', '👏', '🤡', '😤', '💩']

/**
 * Reacting on the Shop TV from a phone: offered in a Pick'Em league that
 * has a TV set up, while one of this week's games is being played.
 */
export function useTvReactions() {
  const { activeLeague } = useAppStore()
  const leagueId = activeLeague?.league_type === 'pickem' ? activeLeague.id : null

  const { data: hasTv = false } = useQuery({
    queryKey: ['league-has-tv', leagueId],
    enabled: !!leagueId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('league_has_tv', { p_league: leagueId! })
      if (error) throw error
      return !!data
    },
  })
  const { games } = useGameThreads(leagueId, hasTv)
  const live = games.some(g => g.status === 'in_progress')

  const send = async (emoji: string) => {
    if (!leagueId) return
    try { navigator.vibrate?.(12) } catch { /* not on this device */ }
    const { error } = await supabase.rpc('send_tv_reaction', { p_league: leagueId, p_emoji: emoji })
    if (error) toast.error(error.message)
  }

  return { enabled: !!leagueId && hasTv && live, send }
}
