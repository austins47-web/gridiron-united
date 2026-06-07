import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import type { Trade, Profile, Player, League } from '@/types/database'
import toast from 'react-hot-toast'

export type TradeWithDetails = Trade & {
  proposer: Profile
  receiver: Profile
  proposer_players: Player[]
  receiver_players: Player[]
  votes?: { user_id: string; vote: 'approve' | 'veto' }[]
}

// ── Helper: post a system message to league chat ─────────────
async function postTradeChat(leagueId: string, userId: string, message: string) {
  await supabase.from('league_messages').insert({
    league_id: leagueId,
    user_id: userId,
    message,
    is_system: true,
  })
}

// ── Helper: build player names string ───────────────────────
function playerNames(players: Player[]) {
  if (players.length === 0) return 'nothing'
  if (players.length <= 2) return players.map(p => p.name).join(' & ')
  return `${players.slice(0, 2).map(p => p.name).join(', ')} +${players.length - 2} more`
}

// ── Execute roster swap ───────────────────────────────────────
async function executeTradeSwap(
  trade: Trade,
  leagueId: string,
) {
  for (const playerId of trade.proposer_player_ids ?? []) {
    await supabase.from('rosters')
      .update({ user_id: trade.receiver_id, acquired_type: 'trade' })
      .eq('league_id', leagueId)
      .eq('player_id', playerId)
      .eq('user_id', trade.proposer_id)
      .eq('week', 0)
  }
  for (const playerId of trade.receiver_player_ids ?? []) {
    await supabase.from('rosters')
      .update({ user_id: trade.proposer_id, acquired_type: 'trade' })
      .eq('league_id', leagueId)
      .eq('player_id', playerId)
      .eq('user_id', trade.receiver_id)
      .eq('week', 0)
  }
  await supabase.from('trades').update({ status: 'accepted' }).eq('id', trade.id)
}

// ── Fetch all trades in the active league ─────────────────────
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
          receiver:profiles!trades_receiver_id_fkey(id, username, display_name, avatar_url),
          votes:trade_votes(user_id, vote)
        `)
        .eq('league_id', leagueId!)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error

      const trades = data ?? []
      const allIds = [...new Set(trades.flatMap(t => [
        ...(t.proposer_player_ids ?? []),
        ...(t.receiver_player_ids ?? []),
      ]))]

      let playerMap: Record<number, Player> = {}
      if (allIds.length > 0) {
        const { data: players } = await supabase.from('players').select('*').in('id', allIds)
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

// ── Propose a trade ───────────────────────────────────────────
export function useProposeTrade(leagueId: string | null) {
  const qc = useQueryClient()
  const { user, activeLeague } = useAppStore()

  return useMutation({
    mutationFn: async ({
      receiverId, proposerPlayerIds, receiverPlayerIds, message,
    }: {
      receiverId: string
      proposerPlayerIds: number[]
      receiverPlayerIds: number[]
      message?: string
    }) => {
      if (!leagueId || !user) throw new Error('Not authenticated')

      // Check trade deadline
      const week = activeLeague?.current_week ?? 0
      const deadline = activeLeague?.trade_deadline_week ?? 13
      if (week > deadline) throw new Error(`Trade deadline passed (Week ${deadline})`)

      const { data, error } = await supabase.from('trades').insert({
        league_id: leagueId,
        proposer_id: user.id,
        receiver_id: receiverId,
        proposer_player_ids: proposerPlayerIds,
        receiver_player_ids: receiverPlayerIds,
        message: message || null,
        status: 'pending',
        expires_at: new Date(Date.now() + 48 * 3600000).toISOString(),
      }).select(`
        *,
        proposer:profiles!trades_proposer_id_fkey(username, display_name),
        receiver:profiles!trades_receiver_id_fkey(username, display_name)
      `).single()
      if (error) throw error

      // Fetch player names for chat message
      const allIds = [...proposerPlayerIds, ...receiverPlayerIds]
      const { data: players } = await supabase.from('players').select('id,name').in('id', allIds)
      const pMap = Object.fromEntries((players ?? []).map(p => [p.id, p.name]))

      const proposerName = data.proposer?.display_name || data.proposer?.username || 'Someone'
      const receiverName = data.receiver?.display_name || data.receiver?.username || 'Someone'
      const givePart = proposerPlayerIds.length > 0
        ? proposerPlayerIds.map(id => pMap[id]).filter(Boolean).join(', ')
        : 'nothing'
      const getpart = receiverPlayerIds.length > 0
        ? receiverPlayerIds.map(id => pMap[id]).filter(Boolean).join(', ')
        : 'nothing'

      await postTradeChat(leagueId, user.id,
        `📤 Trade proposed: ${proposerName} offers ${givePart} to ${receiverName} for ${getpart}`)

      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades', leagueId] })
      toast.success('Trade proposal sent!')
    },
    onError: (e: any) => toast.error(e.message),
  })
}

// ── Accept a trade (mode-aware) ───────────────────────────────
export function useRespondTrade(leagueId: string | null) {
  const qc = useQueryClient()
  const { user, activeLeague } = useAppStore()

  return useMutation({
    mutationFn: async ({
      tradeId, action, counterProposerIds, counterReceiverIds,
    }: {
      tradeId: string
      action: 'accepted' | 'rejected' | 'countered'
      counterProposerIds?: number[]
      counterReceiverIds?: number[]
    }) => {
      if (!leagueId || !user) throw new Error('Not authenticated')

      // Fetch full trade + players for chat message
      const { data: trade, error: te } = await supabase
        .from('trades')
        .select(`
          *,
          proposer:profiles!trades_proposer_id_fkey(username, display_name),
          receiver:profiles!trades_receiver_id_fkey(username, display_name)
        `)
        .eq('id', tradeId).single()
      if (te) throw te

      const allIds = [...(trade.proposer_player_ids ?? []), ...(trade.receiver_player_ids ?? [])]
      const { data: players } = await supabase.from('players').select('id,name,pos').in('id', allIds)
      const pMap = Object.fromEntries((players ?? []).map(p => [p.id, p]))

      const propName = trade.proposer?.display_name || trade.proposer?.username || 'Team A'
      const recName  = trade.receiver?.display_name || trade.receiver?.username || 'Team B'
      const givePart = (trade.proposer_player_ids ?? []).map((id: number) => pMap[id]?.name).filter(Boolean).join(', ') || 'nothing'
      const getPart  = (trade.receiver_player_ids ?? []).map((id: number) => pMap[id]?.name).filter(Boolean).join(', ') || 'nothing'

      const mode = activeLeague?.trade_mode ?? 'instant'

      if (action === 'rejected') {
        const isProposer = trade.proposer_id === user.id
        await supabase.from('trades').update({ status: 'rejected' }).eq('id', tradeId)
        await postTradeChat(leagueId, user.id,
          isProposer
            ? `❌ ${propName} withdrew their trade offer to ${recName}`
            : `❌ ${recName} declined ${propName}'s trade offer`)

      } else if (action === 'countered' && counterProposerIds && counterReceiverIds) {
        await supabase.from('trades').update({ status: 'rejected' }).eq('id', tradeId)
        await supabase.from('trades').insert({
          league_id: leagueId,
          proposer_id: user.id,
          receiver_id: trade.proposer_id,
          proposer_player_ids: counterProposerIds,
          receiver_player_ids: counterReceiverIds,
          status: 'pending',
          expires_at: new Date(Date.now() + 48 * 3600000).toISOString(),
        })
        await postTradeChat(leagueId, user.id,
          `🔄 ${recName} countered ${propName}'s trade offer with a new proposal`)

      } else if (action === 'accepted') {
        if (mode === 'instant') {
          // Execute immediately
          await executeTradeSwap(trade, leagueId)
          await postTradeChat(leagueId, user.id,
            `✅ Trade completed! ${propName} gets ${getPart} · ${recName} gets ${givePart}`)

        } else if (mode === 'commissioner_review') {
          // Mark pending_review — commissioner must approve
          await supabase.from('trades').update({ status: 'countered' }).eq('id', tradeId)
          // Using 'countered' temporarily to mean "awaiting commissioner" — a real app
          // would add a status column; for now flag it via a chat note
          await postTradeChat(leagueId, user.id,
            `⏳ ${recName} accepted ${propName}'s trade — awaiting commissioner review (${activeLeague?.trade_review_hours ?? 24}h window)`)

        } else if (mode === 'league_vote') {
          await supabase.from('trades').update({ status: 'countered' }).eq('id', tradeId)
          await postTradeChat(leagueId, user.id,
            `🗳️ ${recName} accepted ${propName}'s trade — league vote open! ${activeLeague?.trade_votes_required ?? 4} vetoes needed to block.`)
        }
      }
    },
    onSuccess: (_, { action }) => {
      qc.invalidateQueries({ queryKey: ['trades', leagueId] })
      qc.invalidateQueries({ queryKey: ['my-roster', leagueId, useAppStore.getState().user?.id] })
      if (action === 'accepted') toast.success('Trade accepted!')
      if (action === 'rejected') toast.success('Trade declined.')
      if (action === 'countered') toast.success('Counter offer sent!')
    },
    onError: (e: any) => toast.error(e.message),
  })
}

// ── Commissioner approve/veto ─────────────────────────────────
export function useCommissionerTrade(leagueId: string | null) {
  const qc = useQueryClient()
  const { user } = useAppStore()

  return useMutation({
    mutationFn: async ({ tradeId, decision }: { tradeId: string; decision: 'approve' | 'veto' }) => {
      if (!user) throw new Error('Not authenticated')

      const { data: trade, error } = await supabase
        .from('trades')
        .select(`*, proposer:profiles!trades_proposer_id_fkey(username,display_name),
                      receiver:profiles!trades_receiver_id_fkey(username,display_name)`)
        .eq('id', tradeId).single()
      if (error) throw error

      const allIds = [...(trade.proposer_player_ids ?? []), ...(trade.receiver_player_ids ?? [])]
      const { data: players } = await supabase.from('players').select('id,name').in('id', allIds)
      const pMap = Object.fromEntries((players ?? []).map(p => [p.id, p.name]))

      const propName = trade.proposer?.display_name || trade.proposer?.username || 'Team A'
      const recName  = trade.receiver?.display_name || trade.receiver?.username || 'Team B'
      const givePart = (trade.proposer_player_ids ?? []).map((id: number) => pMap[id]).filter(Boolean).join(', ') || 'nothing'
      const getPart  = (trade.receiver_player_ids ?? []).map((id: number) => pMap[id]).filter(Boolean).join(', ') || 'nothing'

      if (decision === 'approve') {
        await executeTradeSwap(trade, leagueId!)
        await postTradeChat(leagueId!, user.id,
          `✅ Commissioner approved trade: ${propName} gets ${getPart} · ${recName} gets ${givePart}`)
      } else {
        await supabase.from('trades').update({ status: 'rejected' }).eq('id', tradeId)
        await postTradeChat(leagueId!, user.id,
          `🚫 Commissioner vetoed the trade between ${propName} and ${recName}`)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades', leagueId] })
      qc.invalidateQueries({ queryKey: ['my-roster'] })
      toast.success('Trade decision saved')
    },
    onError: (e: any) => toast.error(e.message),
  })
}

// ── League member vote (league_vote mode) ─────────────────────
export function useVoteTrade(leagueId: string | null) {
  const qc = useQueryClient()
  const { user, activeLeague } = useAppStore()

  return useMutation({
    mutationFn: async ({ tradeId, vote }: { tradeId: string; vote: 'approve' | 'veto' }) => {
      if (!user) throw new Error('Not authenticated')

      // Upsert vote
      const { error } = await supabase.from('trade_votes').upsert({
        trade_id: tradeId, user_id: user.id, vote,
      }, { onConflict: 'trade_id,user_id' })
      if (error) throw error

      // Count current vetoes
      const { data: votes } = await supabase
        .from('trade_votes').select('vote').eq('trade_id', tradeId)
      const vetoCount = (votes ?? []).filter(v => v.vote === 'veto').length
      const required  = activeLeague?.trade_votes_required ?? 4

      await postTradeChat(leagueId!, user.id,
        vote === 'veto'
          ? `🗳️ Veto vote cast (${vetoCount}/${required} needed to block)`
          : `🗳️ Approve vote cast`)

      // If enough vetoes, block the trade
      if (vote === 'veto' && vetoCount >= required) {
        const { data: trade } = await supabase
          .from('trades')
          .select('proposer:profiles!trades_proposer_id_fkey(username,display_name), receiver:profiles!trades_receiver_id_fkey(username,display_name)')
          .eq('id', tradeId).single()
        await supabase.from('trades').update({ status: 'rejected' }).eq('id', tradeId)
        await postTradeChat(leagueId!, user.id,
          `🚫 Trade vetoed by league vote (${vetoCount} votes)`)
      }

      // If all non-involved members approved, execute
      // (optional auto-execute: skip if not needed)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades', leagueId] }),
    onError: (e: any) => toast.error(e.message),
  })
}

// ── Realtime subscription ─────────────────────────────────────
export function useTradesRealtime(leagueId: string | null) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!leagueId) return
    const channel = supabase
      .channel(`trades:${leagueId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'trades',
        filter: `league_id=eq.${leagueId}`,
      }, () => qc.invalidateQueries({ queryKey: ['trades', leagueId] }))
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'trade_votes',
      }, () => qc.invalidateQueries({ queryKey: ['trades', leagueId] }))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [leagueId, qc])
}
