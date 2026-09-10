import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import type { League, LeagueMember } from '@/types/database'
import toast from 'react-hot-toast'
import { computeStandings } from '@/components/pickem/standings'
import { CURRENT_SEASON } from '@/lib/season'

// Build the default team name from the user's profile
function defaultTeamName(profile: { username?: string | null; display_name?: string | null } | null): string {
  const handle = profile?.display_name?.trim() || profile?.username?.trim()
  if (!handle) return 'My Team'
  // Avoid "Chris's Team" → "Chris' Team" for names already ending in s
  const suffix = handle.toLowerCase().endsWith('s') ? "' Team" : "'s Team"
  return `${handle}${suffix}`
}

// All leagues the current user belongs to
export function useMyLeagues() {
  const user = useAppStore(s => s.user)
  return useQuery({
    queryKey: ['my-leagues', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_members')
        .select('*, league:leagues(*)')
        .eq('user_id', user!.id)
        .order('joined_at', { ascending: false })
      if (error) throw error
      return data as (LeagueMember & { league: League })[]
    },
  })
}

// Members of the active league with profiles
export function useLeagueMembers(leagueId: string | null) {
  return useQuery({
    queryKey: ['league-members', leagueId],
    enabled: !!leagueId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_members')
        .select('*, profile:profiles(id, username, display_name, avatar_url, favorite_nfl_team, favorite_cfb_team)')
        .eq('league_id', leagueId!)
        .order('draft_position', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

// Standings for the active league
export function useStandings(leagueId: string | null) {
  return useQuery({
    queryKey: ['standings', leagueId],
    enabled: !!leagueId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_members')
        .select('*, profile:profiles(username, display_name, avatar_url)')
        .eq('league_id', leagueId!)
        .order('wins', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

// Pick'Em's real standings — derived live from actual picks joined
// to game results, exactly the same way PickEmView's own Standings
// tab computes them. useStandings above reads wins/losses as
// STORED columns on league_members, which is correct for real
// fantasy leagues (a separate scoring pipeline maintains those) but
// was never the source of truth for Pick'Em at all — nothing ever
// writes to those columns for a Pick'Em league, which is exactly
// why the League Hub's standings panel showed 0-0 for every member
// even after real games had gone final and real picks existed.
export function usePickemStandings(leagueId: string | null) {
  const { data: games = [] } = useQuery({
    queryKey: ['pickem-standings-games', CURRENT_SEASON],
    enabled: !!leagueId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nfl_games')
        .select('id, week, game_date, home_team, away_team, home_score, away_score, status, is_tiebreaker')
        .eq('season', CURRENT_SEASON)
      if (error) throw error
      return data ?? []
    },
  })

  const { data: picks = [] } = useQuery({
    queryKey: ['pickem-standings-picks', leagueId],
    enabled: !!leagueId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pickem_picks')
        .select('game_id, user_id, week, picked_team, tiebreaker_score')
        .eq('league_id', leagueId!)
        .eq('season', CURRENT_SEASON)
      if (error) throw error
      return data ?? []
    },
  })

  const { data: members = [] } = useQuery({
    queryKey: ['pickem-standings-members', leagueId],
    enabled: !!leagueId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_members')
        .select('user_id, team_name, profile:profiles(username, display_name, avatar_url)')
        .eq('league_id', leagueId!)
      if (error) throw error
      return data ?? []
    },
  })

  const rows = computeStandings(games as any, picks as any, members as any)
  // Merge team_name and profile back in — computeStandings flattens
  // Member.profile into its own avatarUrl/username fields and drops
  // display_name entirely, but StandingsPanel's JSX (shared with the
  // fantasy-league path) reads m.profile?.avatar_url / display_name /
  // username directly, so without this every pick'em row rendered
  // with no avatar and no @handle even though the numbers were right.
  const memberByUser = new Map(members.map((m: any) => [m.user_id, m]))
  return {
    data: rows.map(r => ({
      ...r,
      team_name: memberByUser.get(r.userId)?.team_name ?? null,
      profile: memberByUser.get(r.userId)?.profile ?? null,
      user_id: r.userId,
    })),
  }
}

// Create a new league
export function useCreateLeague() {
  const qc = useQueryClient()
  const { user, profile, setActiveLeague } = useAppStore()

  return useMutation({
    mutationFn: async (params: {
      name: string
      num_teams: number
      num_rounds: number
      scoring_type: string
      draft_type: string
      is_public: boolean
      player_pool: 'nfl' | 'cfb' | 'both'
      league_type?: string
    }) => {
      if (!user) throw new Error('Not logged in')

      // Create league
      const { data: league, error: le } = await supabase
        .from('leagues')
        .insert({
          name: params.name,
          commissioner_id: user.id,
          num_teams: params.num_teams,
          num_rounds: params.num_rounds,
          scoring_type: params.scoring_type as any,
          draft_type: params.draft_type as any,
          league_type: (params.league_type ?? 'redraft') as any,
          is_public: params.is_public,
          player_pool: params.player_pool,
        })
        .select()
        .single()
      if (le) throw le

      // Add creator as commissioner member
      const { data: membership, error: me } = await supabase
        .from('league_members')
        .insert({
          league_id: league.id,
          user_id: user.id,
          is_commissioner: true,
          team_name: defaultTeamName(profile),
        })
        .select()
        .single()
      if (me) throw me

      return { league, membership }
    },
    onSuccess: ({ league, membership }) => {
      qc.invalidateQueries({ queryKey: ['my-leagues'] })
      setActiveLeague(league, membership)
      toast.success(`"${league.name}" created!`)
    },
    onError: (e: any) => toast.error(e.message),
  })
}

// Delete a league (commissioner only)
export function useDeleteLeague() {
  const qc = useQueryClient()
  const { user, activeLeagueId, setActiveLeague } = useAppStore()

  return useMutation({
    mutationFn: async (leagueId: string) => {
      if (!user) throw new Error('Not logged in')
      // Verify commissioner
      const { data: member } = await supabase
        .from('league_members')
        .select('is_commissioner')
        .eq('league_id', leagueId)
        .eq('user_id', user.id)
        .single()
      if (!member?.is_commissioner) throw new Error('Only the commissioner can delete a league')

      const { error } = await supabase
        .from('leagues')
        .delete()
        .eq('id', leagueId)
      if (error) throw error
    },
    onSuccess: (_, leagueId) => {
      qc.invalidateQueries({ queryKey: ['my-leagues'] })
      // Clear active league if we just deleted it
      if (activeLeagueId === leagueId) {
        setActiveLeague(null as any, null as any)
      }
      toast.success('League deleted')
    },
    onError: (e: any) => toast.error(e.message),
  })
}

// Join a league via invite code
export function useJoinLeague() {
  const qc = useQueryClient()
  const { user, profile, setActiveLeague } = useAppStore()

  return useMutation({
    mutationFn: async (inviteCode: string) => {
      if (!user) throw new Error('Not logged in')

      const { data: league, error: le } = await supabase
        .from('leagues')
        .select('*')
        .eq('invite_code', inviteCode.toUpperCase())
        .single()
      if (le || !league) throw new Error('Invalid invite code')

      // Check not already a member
      const { data: existing } = await supabase
        .from('league_members')
        .select('id')
        .eq('league_id', league.id)
        .eq('user_id', user.id)
        .single()
      if (existing) throw new Error('You are already in this league')

      // Check not full
      const { count } = await supabase
        .from('league_members')
        .select('id', { count: 'exact', head: true })
        .eq('league_id', league.id)
      if ((count ?? 0) >= (league.league_type === 'pickem' ? 500 : league.num_teams)) throw new Error('League is full')

      const { data: membership, error: me } = await supabase
        .from('league_members')
        .insert({
          league_id: league.id,
          user_id: user.id,
          is_commissioner: false,
          team_name: defaultTeamName(profile),
        })
        .select()
        .single()
      if (me) throw me

      return { league, membership }
    },
    onSuccess: ({ league, membership }) => {
      qc.invalidateQueries({ queryKey: ['my-leagues'] })
      setActiveLeague(league, membership)
      toast.success(`Joined "${league.name}"!`)
    },
    onError: (e: any) => toast.error(e.message),
  })
}

// Leave a league (any member; commissioner must hand off or delete instead)
export function useLeaveLeague() {
  const qc = useQueryClient()
  const { user, activeLeagueId, setActiveLeague } = useAppStore()

  return useMutation({
    mutationFn: async (leagueId: string) => {
      if (!user) throw new Error('Not logged in')

      const { data: member, error: mErr } = await supabase
        .from('league_members')
        .select('id, is_commissioner')
        .eq('league_id', leagueId)
        .eq('user_id', user.id)
        .single()
      if (mErr || !member) throw new Error('You are not a member of this league')

      if (member.is_commissioner) {
        // Block only if they're the LAST commissioner
        const { count } = await supabase
          .from('league_members')
          .select('id', { count: 'exact', head: true })
          .eq('league_id', leagueId)
          .eq('is_commissioner', true)
        if ((count ?? 0) <= 1) {
          throw new Error(
            'You are the only commissioner. Promote another member first, or delete the league.'
          )
        }
      }

      // Clean up this user's roster entries, then remove membership
      await supabase.from('rosters').delete().eq('league_id', leagueId).eq('user_id', user.id)

      // .select() after .delete() so we get back the actual deleted
      // row(s). Without it, a delete silently blocked by RLS (zero
      // rows affected) returns error: null — indistinguishable from
      // genuine success — and that's exactly what happened here:
      // league_members had no DELETE policy at all, so every leave
      // attempt reported success while never actually removing the
      // membership row. Checking the row count closes that class of
      // bug for good, not just this one instance of it.
      const { data: deleted, error } = await supabase
        .from('league_members')
        .delete()
        .eq('id', member.id)
        .select('id')
      if (error) throw error
      if (!deleted || deleted.length === 0) {
        throw new Error('Could not leave the league — the membership was not removed. Please try again or contact support.')
      }

      return leagueId
    },
    onSuccess: (leagueId) => {
      qc.invalidateQueries({ queryKey: ['my-leagues'] })
      qc.invalidateQueries({ queryKey: ['league-members', leagueId] })
      if (activeLeagueId === leagueId) setActiveLeague(null, null)
      toast.success('You left the league')
    },
    onError: (e: any) => toast.error(e.message),
  })
}

// Update the current user's own membership settings (team name, etc.)
export function useUpdateMyMembership() {
  const qc = useQueryClient()
  const { user, activeLeague, myMembership, setActiveLeague } = useAppStore()

  return useMutation({
    mutationFn: async (params: { leagueId: string; updates: Partial<LeagueMember> }) => {
      if (!user) throw new Error('Not logged in')
      const { data, error } = await supabase
        .from('league_members')
        .update(params.updates)
        .eq('league_id', params.leagueId)
        .eq('user_id', user.id)
        .select()
        .single()
      if (error) throw error
      return data as LeagueMember
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['my-leagues'] })
      qc.invalidateQueries({ queryKey: ['league-members', updated.league_id] })
      qc.invalidateQueries({ queryKey: ['standings', updated.league_id] })
      // Keep the store in sync so the UI updates immediately
      if (activeLeague && myMembership?.league_id === updated.league_id) {
        setActiveLeague(activeLeague, updated)
      }
      toast.success('Settings saved')
    },
    onError: (e: any) => toast.error(e.message),
  })
}

// Real-time league subscription
export function useLeagueRealtime(leagueId: string | null) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!leagueId) return
    const channel = supabase
      .channel(`league:${leagueId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'league_members',
        filter: `league_id=eq.${leagueId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['league-members', leagueId] })
        qc.invalidateQueries({ queryKey: ['standings', leagueId] })
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'matchups',
        filter: `league_id=eq.${leagueId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['matchups', leagueId] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [leagueId, qc])
}
