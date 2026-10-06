import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'

/** What phones can throw on the Shop TV (send_tv_reaction checks the same list). */
export const TV_REACTIONS = ['🔥', '😂', '💀', '🏈', '🎉', '😱', '👏', '🤡', '😤', '💩']

/** The longest message the TV chat takes (send_tv_message cuts there). */
export const TV_MESSAGE_MAX = 240

export interface TvChatMessage { id: string; name: string; avatar: string | null; message: string; created_at: string; mine: boolean }

/**
 * Reacting on the Shop TV from a phone, any time: offered in a Pick'Em
 * league that has a TV set up. Messages go in the TV chat, the TV's own
 * (send_tv_message), which pops them up on the TV; they never go in the
 * league chat.
 */
export function useTvReactions() {
  const qc = useQueryClient()
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

  const send = async (emoji: string) => {
    if (!leagueId) return
    try { navigator.vibrate?.(12) } catch { /* not on this device */ }
    const { error } = await supabase.rpc('send_tv_reaction', { p_league: leagueId, p_emoji: emoji })
    if (error) toast.error(error.message)
  }

  /** Says something on the TV; the new message's id once it's sent. */
  const say = async (text: string): Promise<string | null> => {
    const message = text.trim().slice(0, TV_MESSAGE_MAX)
    if (!leagueId || !message) return null
    const { data, error } = await supabase.rpc('send_tv_message', { p_league: leagueId, p_text: message })
    if (error) { toast.error(`Couldn't send: ${error.message}`); return null }
    qc.invalidateQueries({ queryKey: ['tv-chat', leagueId] })
    return data
  }

  /** Takes a message off the TV: your own, or anyone's for the commissioner. */
  const unsend = async (id: string): Promise<boolean> => {
    const { error } = await supabase.rpc('unsend_tv_message', { p_id: id })
    if (error) { toast.error(`Couldn't take it down: ${error.message}`); return false }
    qc.invalidateQueries({ queryKey: ['tv-chat', leagueId] })
    return true
  }

  return { enabled: !!leagueId && hasTv, leagueId, send, say, unsend }
}

/** The TV chat's last week, newest first: asked for while it's open, every 10 seconds. */
export function useTvChat(leagueId: string | null, open: boolean) {
  return useQuery({
    queryKey: ['tv-chat', leagueId],
    enabled: !!leagueId && open,
    refetchInterval: open ? 10_000 : false,
    queryFn: async (): Promise<TvChatMessage[]> => {
      const { data, error } = await supabase.rpc('tv_chat', { p_league: leagueId! })
      if (error) throw error
      return data ?? []
    },
  })
}
