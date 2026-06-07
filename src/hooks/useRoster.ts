import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import type { RosterEntry, Player } from '@/types/database'
import toast from 'react-hot-toast'

export type RosterEntryWithPlayer = RosterEntry & { player: Player }

// My roster in the active league
export function useMyRoster(leagueId: string | null) {
  const user = useAppStore(s => s.user)
  return useQuery({
    queryKey: ['my-roster', leagueId, user?.id],
    enabled: !!leagueId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rosters')
        .select('*, player:players(*)')
        .eq('league_id', leagueId!)
        .eq('user_id', user!.id)
        .eq('week', 0)
        .order('slot')
      if (error) throw error
      return (data ?? []) as RosterEntryWithPlayer[]
    },
  })
}

// Another user's roster (for matchup / commissioner view)
export function useRoster(leagueId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['roster', leagueId, userId],
    enabled: !!leagueId && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rosters')
        .select('*, player:players(*)')
        .eq('league_id', leagueId!)
        .eq('user_id', userId!)
        .eq('week', 0)
        .order('slot')
      if (error) throw error
      return (data ?? []) as RosterEntryWithPlayer[]
    },
  })
}

// Move a player to a different slot
export function useMovePlayer(leagueId: string | null) {
  const qc = useQueryClient()
  const user = useAppStore(s => s.user)

  return useMutation({
    mutationFn: async ({ rosterId, newSlot }: { rosterId: string; newSlot: string }) => {
      const { error } = await supabase
        .from('rosters')
        .update({ slot: newSlot })
        .eq('id', rosterId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-roster', leagueId, user?.id] })
    },
    onError: (e: any) => toast.error(e.message),
  })
}

// Drop a player from roster
export function useDropPlayer(leagueId: string | null) {
  const qc = useQueryClient()
  const user = useAppStore(s => s.user)

  return useMutation({
    mutationFn: async ({ rosterId, playerName }: { rosterId: string; playerName: string }) => {
      const { error } = await supabase
        .from('rosters')
        .delete()
        .eq('id', rosterId)
      if (error) throw error
      return playerName
    },
    onSuccess: (playerName) => {
      qc.invalidateQueries({ queryKey: ['my-roster', leagueId, user?.id] })
      qc.invalidateQueries({ queryKey: ['rostered-ids', leagueId] })
      toast.success(`${playerName} dropped`)
    },
    onError: (e: any) => toast.error(e.message),
  })
}

// Add player directly to roster (free agency / commissioner add)
export function useAddPlayer(leagueId: string | null) {
  const qc = useQueryClient()
  const user = useAppStore(s => s.user)

  return useMutation({
    mutationFn: async ({ playerId, slot, playerName }: { playerId: string; slot: string; playerName: string }) => {
      if (!leagueId) throw new Error('No league selected')
      const { error } = await supabase
        .from('rosters')
        .insert({
          league_id: leagueId,
          user_id: user!.id,
          player_id: playerId,
          slot,
          week: 0,
        })
      if (error) throw error
      return playerName
    },
    onSuccess: (playerName) => {
      qc.invalidateQueries({ queryKey: ['my-roster', leagueId, user?.id] })
      qc.invalidateQueries({ queryKey: ['rostered-ids', leagueId] })
      toast.success(`${playerName} added to roster`)
    },
    onError: (e: any) => toast.error(e.message),
  })
}

// All rostered player IDs in THIS league only (drives "taken" indicator)
export function useRosteredPlayerIds(leagueId: string | null) {
  return useQuery({
    queryKey: ['rostered-ids', leagueId],
    enabled: !!leagueId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rosters')
        .select('player_id')
        .eq('league_id', leagueId!)
        .eq('week', 0)
      if (error) throw error
      return new Set((data ?? []).map(r => r.player_id))
    },
    staleTime: 10_000,
  })
}

// Real-time roster subscription scoped to this league
export function useRosterRealtime(leagueId: string | null) {
  const qc = useQueryClient()
  const user = useAppStore(s => s.user)

  useEffect(() => {
    if (!leagueId) return
    const channel = supabase
      .channel(`rosters:${leagueId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'rosters',
        filter: `league_id=eq.${leagueId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['my-roster', leagueId, user?.id] })
        qc.invalidateQueries({ queryKey: ['rostered-ids', leagueId] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [leagueId, qc, user?.id])
}

// ── Auto-assign proper slots after draft completes ─────────────────────
// Moves all bench-slotted draft picks into correct starting positions
// based on the league's slot config and player position.
export function useAssignDraftSlots(leagueId: string | null) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (userId: string) => {
      if (!leagueId) throw new Error('No league')

      // Get this user's roster (all bench slots from draft)
      const { data: roster, error: re } = await supabase
        .from('rosters')
        .select('*, player:players(id, pos)')
        .eq('league_id', leagueId)
        .eq('user_id', userId)
        .eq('week', 0)
        .order('slot')
      if (re) throw re
      if (!roster || !roster.length) return

      // Get league slot config
      const { data: league, error: le } = await supabase
        .from('leagues')
        .select('slots_qb,slots_rb,slots_wr,slots_te,slots_flex,slots_dst,slots_k,slots_bench,slots_ir')
        .eq('id', leagueId)
        .single()
      if (le) throw le

      // Build slot definitions
      const { buildSlotDefs } = await import('@/types/database')
      const slotDefs = buildSlotDefs(league)
      const starterSlots = slotDefs.filter(s => s.type === 'starter' || s.type === 'flex')
      const benchSlots = slotDefs.filter(s => s.type === 'bench')

      // For each player, find the best available starting slot
      const usedSlots = new Set<string>()
      const assignments: Array<{ id: string; slot: string }> = []

      // Sort players: starters first (by position priority), then bench
      const posPriority: Record<string, number> = { QB: 1, RB: 2, WR: 3, TE: 4, DST: 5, K: 6 }
      const sortedRoster = [...roster].sort((a, b) =>
        (posPriority[a.player?.pos] ?? 9) - (posPriority[b.player?.pos] ?? 9)
      )

      for (const entry of sortedRoster) {
        const pos = entry.player?.pos
        if (!pos) continue

        const bestSlot = starterSlots.find(s => !usedSlots.has(s.key) && s.pos.includes(pos))
          ?? benchSlots.find(s => !usedSlots.has(s.key))
        if (bestSlot) {
          usedSlots.add(bestSlot.key)
          assignments.push({ id: entry.id, slot: bestSlot.key })
        }
      }

      // Apply sequentially — parallel updates violate the unique constraint
      // (league_id, user_id, slot, week) when two rows swap slots
      for (const a of assignments) {
        await supabase.from('rosters').update({ slot: a.slot }).eq('id', a.id)
      }

      return assignments.length
    },
    onSuccess: (count, userId) => {
      qc.invalidateQueries({ queryKey: ['my-roster', leagueId, userId] })
      qc.invalidateQueries({ queryKey: ['roster', leagueId, userId] })
    },
    onError: (e: any) => toast.error(`Slot assignment failed: ${e.message}`),
  })
}
