import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'

/** What phones can throw on the Shop TV (send_tv_reaction checks the same list). */
export const TV_REACTIONS = ['🔥', '😂', '💀', '🏈', '🎉', '😱', '👏', '🤡', '😤', '💩']

/** The longest message the TV shows in full (league_messages_to_tv cuts there). */
export const TV_MESSAGE_MAX = 240

/**
 * Reacting on the Shop TV from a phone, any time: offered in a Pick'Em
 * league that has a TV set up. Messages go to the league chat, which
 * the TV pops up live (league_messages_to_tv).
 */
export function useTvReactions() {
  const { activeLeague, user } = useAppStore()
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

  const send = async (emoji: string) => {
    if (!leagueId) return
    try { navigator.vibrate?.(12) } catch { /* not on this device */ }
    const { error } = await supabase.rpc('send_tv_reaction', { p_league: leagueId, p_emoji: emoji })
    if (error) toast.error(error.message)
  }

  /** Posts to the league chat; the new message's id once it's sent. */
  const say = async (text: string): Promise<string | null> => {
    const message = text.trim().slice(0, TV_MESSAGE_MAX)
    if (!leagueId || !user || !message) return null
    const { data, error } = await supabase
      .from('league_messages')
      .insert({ league_id: leagueId, user_id: user.id, message })
      .select('id')
      .single()
    if (error) { toast.error(`Couldn't send: ${error.message}`); return null }
    return data.id
  }

  /** Deletes a message you sent: out of the chat, and off the TV. */
  const unsend = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('league_messages').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) { toast.error(`Couldn't unsend: ${error.message}`); return false }
    return true
  }

  return { enabled: !!leagueId && hasTv, send, say, unsend }
}
