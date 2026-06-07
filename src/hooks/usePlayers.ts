import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Player, PlayerPos, PlayerLeague } from '@/types/database'

export interface PlayerFilters {
  search: string
  pos: PlayerPos | 'ALL'
  league: PlayerLeague | 'ALL'
  status: 'ALL' | 'active' | 'questionable' | 'out' | 'ir'
  conference: string
  team: string
  sortBy: 'adp' | 'avg_pts' | 'proj_pts' | 'name'
  sortDir: 'asc' | 'desc'
  rookiesOnly: boolean
  page: number
  pageSize: number
}

export const DEFAULT_FILTERS: PlayerFilters = {
  search: '',
  pos: 'ALL',
  league: 'ALL',
  status: 'ALL',
  conference: 'ALL',
  team: 'ALL',
  sortBy: 'adp',
  sortDir: 'asc',
  rookiesOnly: false,
  page: 0,
  pageSize: 40,
}

export function usePlayers(filters: PlayerFilters) {
  return useQuery({
    queryKey: ['players', filters],
    queryFn: async () => {
      let q = supabase
        .from('players')
        .select('*', { count: 'exact' })

      if (filters.search) {
        // Search by name OR team name
        q = q.or(`name.ilike.%${filters.search}%,team.ilike.%${filters.search}%`)
      }
      if (filters.pos !== 'ALL') {
        q = q.eq('pos', filters.pos)
      }
      if (filters.league !== 'ALL') {
        q = q.eq('league', filters.league)
      }
      if (filters.status !== 'ALL') {
        q = q.eq('status', filters.status)
      }
      if (filters.conference !== 'ALL') {
        q = q.eq('conference', filters.conference)
      }
      if (filters.team !== 'ALL' && !filters.rookiesOnly) {
        q = q.eq('team', filters.team)
      }
      if (filters.rookiesOnly) {
        q = q.eq('is_rookie', true)
      }

      q = q.order(filters.sortBy, { ascending: filters.sortDir === 'asc' })
      q = q.range(
        filters.page * filters.pageSize,
        filters.page * filters.pageSize + filters.pageSize - 1,
      )

      const { data, error, count } = await q
      if (error) throw error
      return { players: (data ?? []) as Player[], total: count ?? 0 }
    },
    placeholderData: (prev) => prev,
  })
}

// Fetch all unique teams for the team filter dropdown
export function useTeamList(league: PlayerLeague | 'ALL') {
  return useQuery({
    queryKey: ['team-list', league],
    queryFn: async () => {
      let q = supabase
        .from('players')
        .select('team, league')
        .order('team')
      if (league !== 'ALL') {
        q = q.eq('league', league)
      }
      // Filter out DST entries so team names stay clean
      q = q.neq('pos', 'DST')
      const { data, error } = await q
      if (error) throw error
      // Deduplicate
      const seen = new Set<string>()
      return (data ?? [])
        .filter(r => {
          if (seen.has(r.team)) return false
          seen.add(r.team)
          return true
        })
        .map(r => ({ team: r.team, league: r.league as PlayerLeague }))
    },
    staleTime: 5 * 60_000,
  })
}

// Single player detail
export function usePlayer(playerId: string | null) {
  return useQuery({
    queryKey: ['player', playerId],
    enabled: !!playerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('id', playerId!)
        .single()
      if (error) throw error
      return data as Player
    },
  })
}
