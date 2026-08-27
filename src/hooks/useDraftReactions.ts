import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface LiveReaction { id: string; emoji: string }

/**
 * Ephemeral emoji reactions for the draft room — everyone watching
 * sees a brief burst when someone reacts to a pick landing. Uses
 * Supabase Realtime's broadcast primitive (not postgres_changes),
 * since reactions don't need to persist anywhere — no new table,
 * no schema change.
 *
 * Deliberately a SEPARATE channel from useDraftRealtime's
 * draft:{leagueId} channel (which handles actual pick sync) rather
 * than extending it — that channel is proven, load-bearing
 * production code, and this stays fully isolated from it so a bug
 * here can never affect real draft-pick synchronization.
 */
export function useDraftReactions(leagueId: string | null) {
  const [reactions, setReactions] = useState<LiveReaction[]>([])
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!leagueId) return
    const channel = supabase
      .channel(`reactions:${leagueId}`)
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        const id = `${Date.now()}-${Math.random()}`
        setReactions(prev => [...prev, { id, emoji: payload.emoji }])
        setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 2200)
      })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [leagueId])

  const sendReaction = useCallback((emoji: string) => {
    channelRef.current?.send({ type: 'broadcast', event: 'reaction', payload: { emoji } })
  }, [])

  return { reactions, sendReaction }
}
