import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import type { Trade, Profile, Player } from '@/types/database'
import toast from 'react-hot-toast'

export type TradeWithDetails = Trade & {
  proposer: Profile
  receiver: Profile
  proposer_players: Player[]
  receiver_players: Player[]
}

// ── Fetch all trades in the active league ────────────────────
export function useLeagueTrades(leagueId: string | null) {
  return useQuery({
    queryKey: ['trades', leagueId],
    enabled: !!leagueId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trades')
        .select(`
          *,
          proposer:profiles!trades_proposer_id_fkey(id, username, display_name, avatar_url),
          receiver:profiles!trades_receiver_id_fkey(id, username, display_name, avatar_url)
        `)
        .eq('league_id', leagueId!)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error

      // Fetch players for each trade
      const trades = data ?? []
      const allPlayerIds = [...new Set(trades.flatMap(t => [
        ...(t.proposer_player_ids ?? []),
        ...(t.receiver_player_ids ?? []),
      ]))]

      let playerMap: Record<number, Player> = {}
      if (allPlayerIds.length > 0) {
        const { data: players } = await supabase
          .from('players')
          .select('*')
          .in('id', allPlayerIds)
        playerMap = Object.fromEntries((players ?? []).map(p => [p.id, p]))
      }

      return trades.map(t => ({
        ...t,
        proposer_players: (t.proposer_player_ids ?? []).map((id: number) => playerMap[id]).filter(Boolean),
        receiver_players: (t.receiver_player_ids ?? []).map((id: number) => playerMap[id]).filter(Boolean),
      })) as TradeWithDetails[]
    },
  })
}

// ── Propose a trade ──────────────────────────────────────────
export function useProposeTrade(leagueId: string | null) {
  const qc = useQueryClient()
  const { user } = useAppStore()

  return useMutation({
    mutationFn: async ({
      receiverId,
      proposerPlayerIds,
      receiverPlayerIds,
      message,
    }: {
      receiverId: string
      proposerPlayerIds: number[]
      receiverPlayerIds: number[]
      message?: string
    }) => {
      if (!leagueId || !user) throw new Error('Not authenticated')
      if (proposerPlayerIds.length === 0 && receiverPlayerIds.length === 0)
        throw new Error('Select at least one player')

      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

      const { data, error } = await supabase.from('trades').insert({
        league_id: leagueId,
        proposer_id: user.id,
        receiver_id: receiverId,
        proposer_player_ids: proposerPlayerIds,
        receiver_player_ids: receiverPlayerIds,
        message: message || null,
        status: 'pending',
        expires_at: expiresAt,
      }).select().single()

      if (error) throw error

      // System message in league chat
      await supabase.from('league_messages').insert({
        league_id: leagueId,
        user_id: user.id,
        message: `📤 Trade proposed — awaiting response`,
        is_system: true,
      })

      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades', leagueId] })
      toast.success('Trade proposal sent!')
    },
    onError: (e: any) => toast.error(e.message),
  })
}

// ── Respond to a trade (accept / reject / counter) ──────────
export function useRespondTrade(leagueId: string | null) {
  const qc = useQueryClient()
  const { user } = useAppStore()

  return useMutation({
    mutationFn: async ({
      tradeId,
      action,
      counterProposerIds,
      counterReceiverIds,
    }: {
      tradeId: string
      action: 'accepted' | 'rejected' | 'countered'
      counterProposerIds?: number[]
      counterReceiverIds?: number[]
    }) => {
      if (!leagueId || !user) throw new Error('Not authenticated')

      if (action === 'accepted') {
        // Execute the trade: swap players between rosters
        const { data: trade, error: te } = await supabase
          .from('trades')
          .select('*')
          .eq('id', tradeId)
          .single()
        if (te) throw te

        // Move proposer's players to receiver's roster
        for (const playerId of trade.proposer_player_ids) {
          await supabase.from('rosters')
            .update({ user_id: trade.receiver_id, acquired_type: 'trade' })
            .eq('league_id', leagueId)
            .eq('player_id', playerId)
            .eq('user_id', trade.proposer_id)
            .eq('week', 0)
        }
        // Move receiver's players to proposer's roster
        for (const playerId of trade.receiver_player_ids) {
          await supabase.from('rosters')
            .update({ user_id: trade.proposer_id, acquired_type: 'trade' })
            .eq('league_id', leagueId)
            .eq('player_id', playerId)
            .eq('user_id', trade.receiver_id)
            .eq('week', 0)
        }

        // Update status
        const { error } = await supabase.from('trades')
          .update({ status: 'accepted' })
          .eq('id', tradeId)
        if (error) throw error

        // System chat message
        await supabase.from('league_messages').insert({
          league_id: leagueId,
          user_id: user.id,
          message: `🤝 Trade accepted and completed!`,
          is_system: true,
        })

      } else if (action === 'countered' && counterProposerIds && counterReceiverIds) {
        // Reject original, create new counter-proposal
        await supabase.from('trades').update({ status: 'rejected' }).eq('id', tradeId)

        const { data: original } = await supabase
          .from('trades').select('proposer_id').eq('id', tradeId).single()

        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
        const { error } = await supabase.from('trades').insert({
          league_id: leagueId,
          proposer_id: user.id,
          receiver_id: original?.proposer_id,
          proposer_player_ids: counterProposerIds,
          receiver_player_ids: counterReceiverIds,
          status: 'pending',
          expires_at: expiresAt,
        })
        if (error) throw error

      } else {
        const { error } = await supabase.from('trades')
          .update({ status: action })
          .eq('id', tradeId)
        if (error) throw error
      }
    },
    onSuccess: (_, { action }) => {
      qc.invalidateQueries({ queryKey: ['trades', leagueId] })
      qc.invalidateQueries({ queryKey: ['my-roster', leagueId, user?.id] })
      const msgs = { accepted: 'Trade accepted!', rejected: 'Trade declined.', countered: 'Counter offer sent!' }
      toast.success(msgs[action] ?? 'Done')
    },
    onError: (e: any) => toast.error(e.message),
  })
}

// ── Commissioner veto ────────────────────────────────────────
export function useVetoTrade(leagueId: string | null) {
  const qc = useQueryClient()
  const { user } = useAppStore()

  return useMutation({
    mutationFn: async (tradeId: string) => {
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('trades')
        .update({ status: 'rejected' })
        .eq('id', tradeId)
      if (error) throw error

      await supabase.from('league_messages').insert({
        league_id: leagueId,
        user_id: user.id,
        message: `🚫 Trade vetoed by commissioner`,
        is_system: true,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades', leagueId] })
      toast.success('Trade vetoed')
    },
    onError: (e: any) => toast.error(e.message),
  })
}

// ── Realtime subscription ────────────────────────────────────
export function useTradesRealtime(leagueId: string | null) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!leagueId) return
    const channel = supabase
      .channel(`trades:${leagueId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'trades',
        filter: `league_id=eq.${leagueId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['trades', leagueId] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [leagueId, qc])
}
