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
  votes?: { user_id: string; vote: 'approve' | 'veto' }[]
}

// ── Helper: post a system message to league chat ──────────────
// Only call for completed trades, not proposals
async function postTradeChat(leagueId: string, userId: string, message: string) {
  await supabase.from('league_messages').insert({
    league_id: leagueId,
    user_id: userId,
    message,
    is_system: true,
  })
}

// ── Helper: send notification to a user ──────────────────────
async function sendNotification(params: {
  userId: string
  leagueId: string
  type: string
  title: string
  body: string
  data?: Record<string, unknown>
}) {
  await supabase.from('notifications').insert({
    user_id: params.userId,
    league_id: params.leagueId,
    type: params.type,
    title: params.title,
    body: params.body,
    is_read: false,
    data: params.data ?? {},
  })
}

// ── Helper: fetch fresh league trade settings from DB ─────────
async function getLeagueTradeSettings(leagueId: string) {
  const { data } = await supabase
    .from('leagues')
    .select('trade_mode, trade_review_hours, trade_deadline_week, trade_votes_required, current_week')
    .eq('id', leagueId)
    .single()
  return data ?? {
    trade_mode: 'instant',
    trade_review_hours: 24,
    trade_deadline_week: 13,
    trade_votes_required: 4,
    current_week: 0,
  }
}

// ── Execute roster swap — Sleeper style ───────────────────────
// Players land on the receiver's bench, never into starting slots.
// This avoids unique-constraint collisions on (league, user, slot, week).
async function executeTradeSwap(trade: Trade, leagueId: string) {
  async function findOpenBenchSlot(userId: string, takenSlots: Set<string>): Promise<string | null> {
    const { data: league } = await supabase
      .from('leagues')
      .select('slots_bench, slots_flex')
      .eq('id', leagueId)
      .single()

    const { data: roster } = await supabase
      .from('rosters')
      .select('slot')
      .eq('league_id', leagueId)
      .eq('user_id', userId)
      .eq('week', 0)

    const occupied = new Set([
      ...(roster ?? []).map((r: any) => r.slot),
      ...takenSlots,
    ])

    for (let i = 1; i <= (league?.slots_bench ?? 8); i++) {
      if (!occupied.has(`BN${i}`)) return `BN${i}`
    }
    for (let i = 1; i <= (league?.slots_flex ?? 0); i++) {
      if (!occupied.has(`FLEX${i}`)) return `FLEX${i}`
    }
    return null
  }

  const proposerTaken = new Set<string>()
  const receiverTaken = new Set<string>()

  // Move proposer's players → receiver's bench
  for (const playerId of trade.proposer_player_ids ?? []) {
    const { data: entry } = await supabase
      .from('rosters')
      .select('id')
      .eq('league_id', leagueId)
      .eq('player_id', playerId)
      .eq('user_id', trade.proposer_id)
      .eq('week', 0)
      .single()
    if (!entry) continue

    const slot = await findOpenBenchSlot(trade.receiver_id!, receiverTaken)
    if (!slot) continue
    receiverTaken.add(slot)

    await supabase.from('rosters').update({
      user_id: trade.receiver_id,
      slot,
      acquired_type: 'trade',
    }).eq('id', entry.id)
  }

  // Move receiver's players → proposer's bench
  for (const playerId of trade.receiver_player_ids ?? []) {
    const { data: entry } = await supabase
      .from('rosters')
      .select('id')
      .eq('league_id', leagueId)
      .eq('player_id', playerId)
      .eq('user_id', trade.receiver_id)
      .eq('week', 0)
      .single()
    if (!entry) continue

    const slot = await findOpenBenchSlot(trade.proposer_id!, proposerTaken)
    if (!slot) continue
    proposerTaken.add(slot)

    await supabase.from('rosters').update({
      user_id: trade.proposer_id,
      slot,
      acquired_type: 'trade',
    }).eq('id', entry.id)
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
  const { user } = useAppStore()

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

      // Fetch fresh settings from DB
      const settings = await getLeagueTradeSettings(leagueId)
      if ((settings.current_week ?? 0) > settings.trade_deadline_week)
        throw new Error(`Trade deadline has passed (Week ${settings.trade_deadline_week})`)

      const { data: trade, error } = await supabase.from('trades').insert({
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

      // Fetch player names for notification
      const allIds = [...proposerPlayerIds, ...receiverPlayerIds]
      const { data: players } = await supabase.from('players').select('id,name').in('id', allIds)
      const pMap = Object.fromEntries((players ?? []).map(p => [p.id, p.name]))

      const proposerName = (trade.proposer as any)?.display_name || (trade.proposer as any)?.username || 'Someone'
      const givePart = proposerPlayerIds.map(id => pMap[id]).filter(Boolean).join(', ') || 'nothing'
      const getPart  = receiverPlayerIds.map(id => pMap[id]).filter(Boolean).join(', ') || 'nothing'

      // Notify the receiver — no chat message for proposals
      await sendNotification({
        userId: receiverId,
        leagueId,
        type: 'trade_offer',
        title: '🤝 New trade offer',
        body: `${proposerName} offers ${givePart} for ${getPart}`,
        data: { trade_id: trade.id },
      })

      return trade
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades', leagueId] })
      toast.success('Trade proposal sent!')
    },
    onError: (e: any) => toast.error(e.message),
  })
}

// ── Respond to a trade ────────────────────────────────────────
export function useRespondTrade(leagueId: string | null) {
  const qc = useQueryClient()
  const { user } = useAppStore()

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

      // Always fetch fresh league settings from DB
      const settings = await getLeagueTradeSettings(leagueId)
      const mode = settings.trade_mode ?? 'instant'

      // Fetch trade + player details
      const { data: trade, error: te } = await supabase
        .from('trades')
        .select(`
          *,
          proposer:profiles!trades_proposer_id_fkey(id, username, display_name),
          receiver:profiles!trades_receiver_id_fkey(id, username, display_name)
        `)
        .eq('id', tradeId).single()
      if (te) throw te

      const allIds = [...(trade.proposer_player_ids ?? []), ...(trade.receiver_player_ids ?? [])]
      const { data: players } = await supabase.from('players').select('id,name').in('id', allIds)
      const pMap = Object.fromEntries((players ?? []).map(p => [p.id, p.name]))

      const propName = (trade.proposer as any)?.display_name || (trade.proposer as any)?.username || 'Team A'
      const recName  = (trade.receiver as any)?.display_name || (trade.receiver as any)?.username || 'Team B'
      const propId   = trade.proposer_id!
      const recId    = trade.receiver_id!
      const isProposer = user.id === propId

      const givePart = (trade.proposer_player_ids ?? []).map((id: number) => pMap[id]).filter(Boolean).join(', ') || 'nothing'
      const getPart  = (trade.receiver_player_ids ?? []).map((id: number) => pMap[id]).filter(Boolean).join(', ') || 'nothing'

      if (action === 'rejected') {
        await supabase.from('trades').update({ status: 'rejected' }).eq('id', tradeId)

        // Notify the other party
        const notifyId = isProposer ? recId : propId
        const notifyName = isProposer ? recName : propName
        await sendNotification({
          userId: notifyId,
          leagueId,
          type: 'trade_rejected',
          title: '❌ Trade declined',
          body: isProposer
            ? `You withdrew your offer to ${notifyName}`
            : `${notifyName} declined your trade offer`,
          data: { trade_id: tradeId },
        })

      } else if (action === 'countered' && counterProposerIds && counterReceiverIds) {
        await supabase.from('trades').update({ status: 'rejected' }).eq('id', tradeId)

        // Create counter trade
        const { data: counter } = await supabase.from('trades').insert({
          league_id: leagueId,
          proposer_id: user.id,
          receiver_id: propId,
          proposer_player_ids: counterProposerIds,
          receiver_player_ids: counterReceiverIds,
          status: 'pending',
          expires_at: new Date(Date.now() + 48 * 3600000).toISOString(),
        }).select().single()

        // Fetch counter player names
        const cAllIds = [...counterProposerIds, ...counterReceiverIds]
        const { data: cPlayers } = await supabase.from('players').select('id,name').in('id', cAllIds)
        const cMap = Object.fromEntries((cPlayers ?? []).map(p => [p.id, p.name]))
        const cGive = counterProposerIds.map(id => cMap[id]).filter(Boolean).join(', ') || 'nothing'
        const cGet  = counterReceiverIds.map(id => cMap[id]).filter(Boolean).join(', ') || 'nothing'

        // Notify the original proposer
        await sendNotification({
          userId: propId,
          leagueId,
          type: 'trade_offer',
          title: '🔄 Counter offer received',
          body: `${recName} countered: offers ${cGive} for ${cGet}`,
          data: { trade_id: counter?.id },
        })

      } else if (action === 'accepted') {
        if (mode === 'instant') {
          await executeTradeSwap(trade, leagueId)

          // Chat message — prominent trade completed card
          await postTradeChat(leagueId, user.id,
            `TRADE_COMPLETED:${JSON.stringify({
              proposerName: propName,
              receiverName: recName,
              proposerGets: (trade.receiver_player_ids ?? []).map((id: number) => pMap[id]).filter(Boolean),
              receiverGets: (trade.proposer_player_ids ?? []).map((id: number) => pMap[id]).filter(Boolean),
            })}`)

          // Notify both parties
          await sendNotification({
            userId: propId,
            leagueId,
            type: 'trade_accepted',
            title: '✅ Trade accepted!',
            body: `${recName} accepted your offer. Check your bench for new players.`,
            data: { trade_id: tradeId },
          })
          await sendNotification({
            userId: recId,
            leagueId,
            type: 'trade_accepted',
            title: '✅ Trade completed',
            body: `Your trade with ${propName} is done. New players are on your bench.`,
            data: { trade_id: tradeId },
          })

        } else if (mode === 'commissioner_review') {
          // Mark as awaiting review
          await supabase.from('trades').update({ status: 'countered' }).eq('id', tradeId)

          // Get commissioner ID
          const { data: league } = await supabase
            .from('leagues').select('commissioner_id').eq('id', leagueId).single()

          await sendNotification({
            userId: propId,
            leagueId,
            type: 'trade_pending',
            title: '⏳ Trade awaiting review',
            body: `${recName} accepted — commissioner has ${settings.trade_review_hours}h to review.`,
            data: { trade_id: tradeId },
          })
          if (league?.commissioner_id) {
            await sendNotification({
              userId: league.commissioner_id,
              leagueId,
              type: 'trade_review',
              title: '🛡️ Trade needs your review',
              body: `${propName} ↔ ${recName}: ${givePart} for ${getPart}`,
              data: { trade_id: tradeId },
            })
          }

        } else if (mode === 'league_vote') {
          await supabase.from('trades').update({ status: 'countered' }).eq('id', tradeId)

          // Get all league members to notify
          const { data: members } = await supabase
            .from('league_members')
            .select('user_id')
            .eq('league_id', leagueId)
            .neq('user_id', propId)
            .neq('user_id', recId)

          for (const m of members ?? []) {
            await sendNotification({
              userId: m.user_id,
              leagueId,
              type: 'trade_vote',
              title: '🗳️ Trade vote open',
              body: `${propName} and ${recName} agreed to a trade. Cast your vote!`,
              data: { trade_id: tradeId },
            })
          }
          await sendNotification({
            userId: propId,
            leagueId,
            type: 'trade_pending',
            title: '🗳️ Trade up for vote',
            body: `${recName} accepted. League vote is open — ${settings.trade_votes_required} vetoes needed to block.`,
            data: { trade_id: tradeId },
          })
        }
      }
    },
    onSuccess: (_, { action }) => {
      qc.invalidateQueries({ queryKey: ['trades', leagueId] })
      qc.invalidateQueries({ queryKey: ['my-roster', leagueId] })
      qc.invalidateQueries({ queryKey: ['rostered-ids', leagueId] })
      if (action === 'accepted') toast.success('Trade accepted! New players are on your bench.')
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
        .select(`
          *,
          proposer:profiles!trades_proposer_id_fkey(username, display_name),
          receiver:profiles!trades_receiver_id_fkey(username, display_name)
        `)
        .eq('id', tradeId).single()
      if (error) throw error

      const allIds = [...(trade.proposer_player_ids ?? []), ...(trade.receiver_player_ids ?? [])]
      const { data: players } = await supabase.from('players').select('id,name').in('id', allIds)
      const pMap = Object.fromEntries((players ?? []).map(p => [p.id, p.name]))

      const propName = (trade.proposer as any)?.display_name || (trade.proposer as any)?.username || 'Team A'
      const recName  = (trade.receiver as any)?.display_name || (trade.receiver as any)?.username || 'Team B'
      const givePart = (trade.proposer_player_ids ?? []).map((id: number) => pMap[id]).filter(Boolean).join(', ') || 'nothing'
      const getPart  = (trade.receiver_player_ids ?? []).map((id: number) => pMap[id]).filter(Boolean).join(', ') || 'nothing'

      if (decision === 'approve') {
        await executeTradeSwap(trade, leagueId!)

        await postTradeChat(leagueId!, user.id,
          `TRADE_COMPLETED:${JSON.stringify({
            proposerName: propName,
            receiverName: recName,
            proposerGets: (trade.receiver_player_ids ?? []).map((id: number) => pMap[id]).filter(Boolean),
            receiverGets: (trade.proposer_player_ids ?? []).map((id: number) => pMap[id]).filter(Boolean),
          })}`)

        await sendNotification({
          userId: trade.proposer_id!,
          leagueId: leagueId!,
          type: 'trade_accepted',
          title: '✅ Trade approved by commissioner',
          body: `Your trade with ${recName} has been approved.`,
          data: { trade_id: tradeId },
        })
        await sendNotification({
          userId: trade.receiver_id!,
          leagueId: leagueId!,
          type: 'trade_accepted',
          title: '✅ Trade approved by commissioner',
          body: `Your trade with ${propName} has been approved.`,
          data: { trade_id: tradeId },
        })
      } else {
        await supabase.from('trades').update({ status: 'rejected' }).eq('id', tradeId)
        await sendNotification({
          userId: trade.proposer_id!,
          leagueId: leagueId!,
          type: 'trade_rejected',
          title: '🚫 Trade vetoed by commissioner',
          body: `Your trade with ${recName} was vetoed.`,
          data: { trade_id: tradeId },
        })
        await sendNotification({
          userId: trade.receiver_id!,
          leagueId: leagueId!,
          type: 'trade_rejected',
          title: '🚫 Trade vetoed by commissioner',
          body: `Your trade with ${propName} was vetoed.`,
          data: { trade_id: tradeId },
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades', leagueId] })
      qc.invalidateQueries({ queryKey: ['my-roster', leagueId] })
      qc.invalidateQueries({ queryKey: ['rostered-ids', leagueId] })
      toast.success('Trade decision saved')
    },
    onError: (e: any) => toast.error(e.message),
  })
}

// ── League member vote ────────────────────────────────────────
export function useVoteTrade(leagueId: string | null) {
  const qc = useQueryClient()
  const { user } = useAppStore()

  return useMutation({
    mutationFn: async ({ tradeId, vote }: { tradeId: string; vote: 'approve' | 'veto' }) => {
      if (!user) throw new Error('Not authenticated')

      const settings = await getLeagueTradeSettings(leagueId!)
      const required = settings.trade_votes_required ?? 4

      const { error } = await supabase.from('trade_votes').upsert({
        trade_id: tradeId, user_id: user.id, vote,
      }, { onConflict: 'trade_id,user_id' })
      if (error) throw error

      const { data: votes } = await supabase
        .from('trade_votes').select('vote').eq('trade_id', tradeId)
      const vetoCount = (votes ?? []).filter(v => v.vote === 'veto').length

      if (vote === 'veto' && vetoCount >= required) {
        const { data: trade } = await supabase
          .from('trades')
          .select(`
            proposer_id, receiver_id,
            proposer:profiles!trades_proposer_id_fkey(display_name, username),
            receiver:profiles!trades_receiver_id_fkey(display_name, username)
          `)
          .eq('id', tradeId).single()

        await supabase.from('trades').update({ status: 'rejected' }).eq('id', tradeId)

        const propName = (trade?.proposer as any)?.display_name || 'Team A'
        const recName  = (trade?.receiver as any)?.display_name || 'Team B'

        await sendNotification({
          userId: trade?.proposer_id!, leagueId: leagueId!,
          type: 'trade_rejected',
          title: '🚫 Trade vetoed by league vote',
          body: `Your trade with ${recName} was blocked by ${vetoCount} veto votes.`,
          data: { trade_id: tradeId },
        })
        await sendNotification({
          userId: trade?.receiver_id!, leagueId: leagueId!,
          type: 'trade_rejected',
          title: '🚫 Trade vetoed by league vote',
          body: `Your trade with ${propName} was blocked by ${vetoCount} veto votes.`,
          data: { trade_id: tradeId },
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades', leagueId] })
      toast.success('Vote cast')
    },
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
