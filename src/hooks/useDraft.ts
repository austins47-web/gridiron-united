import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import type { DraftState, DraftPick, Player } from '@/types/database'
import toast from 'react-hot-toast'

export type DraftPickWithPlayer = DraftPick & { player: Player }

// Draft state for the active league
export function useDraftState(leagueId: string | null) {
  return useQuery({
    queryKey: ['draft-state', leagueId],
    enabled: !!leagueId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('draft_state')
        .select('*')
        .eq('league_id', leagueId!)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return (data ?? null) as DraftState | null
    },
  })
}

// All picks made so far
export function useDraftPicks(leagueId: string | null) {
  return useQuery({
    queryKey: ['draft-picks', leagueId],
    enabled: !!leagueId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('draft_picks')
        .select('*, player:players(*)')
        .eq('league_id', leagueId!)
        .order('pick_number', { ascending: true })
      if (error) throw error
      return (data ?? []) as DraftPickWithPlayer[]
    },
  })
}

// Start the draft immediately (commissioner only)
export function useStartDraft() {
  const qc = useQueryClient()
  const { activeLeagueId } = useAppStore()

  return useMutation({
    mutationFn: async () => {
      if (!activeLeagueId) throw new Error('No league selected')

      // Calculate num_rounds from roster slot counts — all slots except IR.
      // This ensures every player drafted gets a proper slot.
      const { data: league, error: le } = await supabase
        .from('leagues')
        .select('num_rounds,slots_qb,slots_rb,slots_wr,slots_te,slots_flex,slots_dst,slots_k,slots_bench')
        .eq('id', activeLeagueId)
        .single()
      if (le) throw le

      const numRounds = league
        ? (league.slots_qb ?? 1) +
          (league.slots_rb ?? 2) +
          (league.slots_wr ?? 2) +
          (league.slots_te ?? 1) +
          (league.slots_flex ?? 2) +
          (league.slots_dst ?? 1) +
          (league.slots_k ?? 1) +
          (league.slots_bench ?? 6)
        : (league?.num_rounds ?? 15)

      // Get ACTUAL members who joined — this is the real team count
      const { data: members, error: me } = await supabase
        .from('league_members')
        .select('user_id, draft_position, joined_at')
        .eq('league_id', activeLeagueId)
        .order('draft_position', { ascending: true, nullsFirst: false })
      if (me) throw me
      if (!members || members.length === 0) throw new Error('No members found')

      // Assign draft positions if not yet set
      const membersNeedPositions = members.some(m => !m.draft_position)
      if (membersNeedPositions) {
        await Promise.all(members.map((m, i) =>
          supabase
            .from('league_members')
            .update({ draft_position: i + 1 })
            .eq('user_id', m.user_id)
            .eq('league_id', activeLeagueId)
        ))
      }

      // Re-fetch ordered members
      const { data: orderedMembers } = await supabase
        .from('league_members')
        .select('user_id, draft_position')
        .eq('league_id', activeLeagueId)
        .order('draft_position', { ascending: true })

      const firstPicker = orderedMembers?.[0]?.user_id ?? members[0].user_id
      // Use actual member count, not league.num_teams
      const actualTeams = members.length

      // Also fetch pick_timer from league to write into draft_state
      const { data: leagueTimer } = await supabase
        .from('leagues')
        .select('draft_pick_timer')
        .eq('id', activeLeagueId)
        .single()

      // Write actual teams + rounds + timer into draft_state
      const { error: stateErr } = await supabase
        .from('draft_state')
        .upsert({
          league_id: activeLeagueId,
          current_pick: 1,
          current_round: 1,
          status: 'in_progress',
          current_user_id: firstPicker,
          pick_started_at: new Date().toISOString(),
          num_rounds: numRounds,
          num_teams: actualTeams,
          pick_timer: leagueTimer?.draft_pick_timer ?? 0,
        }, { onConflict: 'league_id' })
      if (stateErr) throw stateErr

      const { error: leagueErr } = await supabase
        .from('leagues')
        .update({ draft_status: 'in_progress' })
        .eq('id', activeLeagueId)
      if (leagueErr) throw leagueErr

      return { firstPicker, memberCount: actualTeams, numRounds }
    },
    onSuccess: ({ memberCount, numRounds }) => {
      qc.invalidateQueries({ queryKey: ['draft-state', activeLeagueId] })
      qc.invalidateQueries({ queryKey: ['league-members', activeLeagueId] })
      toast.success(`Draft started! ${memberCount} teams · ${numRounds} rounds`)
    },
    onError: (e: any) => toast.error(`Failed to start draft: ${e.message}`),
  })
}

// Schedule draft for a future date/time (commissioner only)
export function useScheduleDraft() {
  const qc = useQueryClient()
  const { activeLeagueId } = useAppStore()

  return useMutation({
    mutationFn: async (scheduledAt: string) => {
      if (!activeLeagueId) throw new Error('No league selected')

      // Store scheduled time as a draft_state row with 'scheduled' status
      const { error } = await supabase
        .from('draft_state')
        .upsert({
          league_id: activeLeagueId,
          current_pick: 1,
          current_round: 1,
          status: 'scheduled',
          current_user_id: null,
          pick_started_at: scheduledAt,
        }, { onConflict: 'league_id' })
      if (error) throw error

      await supabase
        .from('leagues')
        .update({ draft_status: 'pre_draft' })
        .eq('id', activeLeagueId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['draft-state', activeLeagueId] })
      toast.success('Draft scheduled!')
    },
    onError: (e: any) => toast.error(`Failed to schedule: ${e.message}`),
  })
}

// Cancel a scheduled draft
export function useCancelSchedule() {
  const qc = useQueryClient()
  const { activeLeagueId } = useAppStore()

  return useMutation({
    mutationFn: async () => {
      if (!activeLeagueId) throw new Error('No league selected')
      await supabase
        .from('draft_state')
        .delete()
        .eq('league_id', activeLeagueId)
        .eq('status', 'scheduled')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['draft-state', activeLeagueId] })
      toast.success('Schedule cancelled')
    },
    onError: (e: any) => toast.error(e.message),
  })
}

// Make a draft pick
export function useMakePick() {
  const qc = useQueryClient()
  const { user, activeLeagueId } = useAppStore()

  return useMutation({
    mutationFn: async ({
      playerId,
      draftState,
    }: {
      playerId: string
      draftState: DraftState
      // totalTeams kept for API compat but ignored — use draftState.num_teams
      totalTeams?: number
    }) => {
      if (!activeLeagueId || !user) throw new Error('Not ready')

      if (draftState.current_user_id !== user.id) {
        throw new Error("It's not your turn!")
      }

      // Use values baked into draft_state at start time.
      // num_teams is the actual member count written when the draft started.
      // Guard against 0 and null — both mean "not set yet", fall back to
      // fetching live member count so pick_in_round is never null.
      const storedTeams = (draftState as any).num_teams
      let actualTeams: number
      if (storedTeams != null && storedTeams > 0) {
        actualTeams = storedTeams
      } else {
        // Fallback: count members now (handles drafts started before migration 022)
        const { data: membersFallback } = await supabase
          .from('league_members')
          .select('user_id')
          .eq('league_id', activeLeagueId)
        actualTeams = membersFallback?.length ?? 1
        // Patch draft_state so future picks don't need the fallback
        await supabase
          .from('draft_state')
          .update({ num_teams: actualTeams })
          .eq('league_id', activeLeagueId)
      }
      const numRounds = (draftState.num_rounds != null && draftState.num_rounds > 0)
        ? draftState.num_rounds
        : 15

      const pickInRound = ((draftState.current_pick - 1) % actualTeams) + 1

      // Insert pick
      const { error: pe } = await supabase
        .from('draft_picks')
        .insert({
          league_id: activeLeagueId,
          user_id: user.id,
          player_id: playerId,
          pick_number: draftState.current_pick,
          round_number: draftState.current_round,
          pick_in_round: pickInRound,
          auto_picked: false,
        })
      if (pe) throw pe

      // Add to bench slot
      await supabase
        .from('rosters')
        .insert({
          league_id: activeLeagueId,
          user_id: user.id,
          player_id: playerId,
          slot: `BN${draftState.current_round}`,
          week: 0,
        })

      // Advance to next pick
      const nextPick = draftState.current_pick + 1
      const nextRound = Math.ceil(nextPick / actualTeams)
      const nextPickInRound = ((nextPick - 1) % actualTeams) + 1

      // Get ordered members
      const { data: members } = await supabase
        .from('league_members')
        .select('user_id, draft_position')
        .eq('league_id', activeLeagueId)
        .order('draft_position', { ascending: true })

      if (!members) throw new Error('Could not load members')

      // Snake: odd rounds forward, even rounds backward
      let nextUserIndex: number
      if (nextRound % 2 === 0) {
        nextUserIndex = actualTeams - nextPickInRound
      } else {
        nextUserIndex = nextPickInRound - 1
      }
      nextUserIndex = Math.max(0, Math.min(nextUserIndex, members.length - 1))
      const nextUserId = members[nextUserIndex]?.user_id ?? null

      // Draft ends when all rounds are complete for actual teams
      const totalPicks = actualTeams * numRounds
      const isComplete = nextPick > totalPicks

      await supabase
        .from('draft_state')
        .update({
          current_pick: nextPick,
          current_round: nextRound,
          current_user_id: isComplete ? null : nextUserId,
          status: isComplete ? 'completed' : 'in_progress',
          pick_started_at: new Date().toISOString(),
        })
        .eq('league_id', activeLeagueId)

      if (isComplete) {
        await supabase
          .from('leagues')
          .update({ draft_status: 'completed' })
          .eq('id', activeLeagueId)
      }

      return { isComplete }
    },
    onSuccess: async ({ isComplete }) => {
      qc.invalidateQueries({ queryKey: ['draft-picks', activeLeagueId] })
      qc.invalidateQueries({ queryKey: ['draft-state', activeLeagueId] })
      qc.invalidateQueries({ queryKey: ['rostered-ids', activeLeagueId] })
      if (isComplete && user && activeLeagueId) {
        // Auto-assign all players to proper slots for every team
        try {
          const { data: members } = await supabase
            .from('league_members')
            .select('user_id')
            .eq('league_id', activeLeagueId)

          if (members) {
            const { buildSlotDefs } = await import('@/types/database')
            const { data: league } = await supabase
              .from('leagues')
              .select('slots_qb,slots_rb,slots_wr,slots_te,slots_flex,slots_dst,slots_k,slots_bench,slots_ir')
              .eq('id', activeLeagueId)
              .single()

            if (league) {
              const slotDefs = buildSlotDefs(league)
              const starterSlots = slotDefs.filter((s: any) => s.type === 'starter' || s.type === 'flex')
              const benchSlots = slotDefs.filter((s: any) => s.type === 'bench')
              const posPriority: Record<string, number> = { QB: 1, RB: 2, WR: 3, TE: 4, DST: 5, K: 6 }

              // Process each team sequentially to avoid race conditions
              for (const m of members) {
                const { data: roster } = await supabase
                  .from('rosters')
                  .select('id, player:players(id, pos)')
                  .eq('league_id', activeLeagueId)
                  .eq('user_id', m.user_id)
                  .eq('week', 0)
                if (!roster?.length) continue

                // Sort by positional priority so QBs fill QB slots before bench
                const sorted = [...roster].sort((a: any, b: any) =>
                  (posPriority[a.player?.pos] ?? 9) - (posPriority[b.player?.pos] ?? 9)
                )

                // Build sequential assignments — usedSlots must be checked in order,
                // never in parallel, to guarantee no two players get the same slot
                const usedSlots = new Set<string>()
                const assignments: Array<{ id: string; slot: string }> = []
                for (const entry of sorted) {
                  const pos = entry.player?.pos
                  if (!pos) continue
                  const best = starterSlots.find((s: any) => !usedSlots.has(s.key) && s.pos.includes(pos))
                    ?? benchSlots.find((s: any) => !usedSlots.has(s.key))
                  if (best) {
                    usedSlots.add(best.key)
                    assignments.push({ id: entry.id, slot: best.key })
                  }
                }

                // Apply all slot updates sequentially to avoid unique constraint violations
                for (const a of assignments) {
                  await supabase.from('rosters').update({ slot: a.slot }).eq('id', a.id)
                }

                qc.invalidateQueries({ queryKey: ['my-roster', activeLeagueId, m.user_id] })
              }
            }
          }
        } catch (e) {
          console.error('Auto-slot assignment failed:', e)
        }
        toast.success('Draft complete! 🏆 Rosters set.')
      }
    },
    onError: (e: any) => toast.error(e.message),
  })
}

// Real-time draft subscription
export function useDraftRealtime(leagueId: string | null) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!leagueId) return

    const channel = supabase
      .channel(`draft:${leagueId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'draft_state',
        filter: `league_id=eq.${leagueId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['draft-state', leagueId] })
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'draft_picks',
        filter: `league_id=eq.${leagueId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['draft-picks', leagueId] })
        qc.invalidateQueries({ queryKey: ['rostered-ids', leagueId] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [leagueId, qc])
}
