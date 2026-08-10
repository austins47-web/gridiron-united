import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { calcProjPts, statusMultiplier } from '@/lib/scoring'
import type { Player, PlayerPos, PlayerLeague, ScoringRules } from '@/types/database'
import type { ProjStats } from '@/lib/scoring'

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
  pageSize: 100,
}

export function usePlayers(filters: PlayerFilters, scoring: ScoringRules | null) {
  return useQuery({
    queryKey: ['players', filters, scoring?.score_reception, scoring?.score_pass_td],
    queryFn: async () => {

      // ── Proj sort: fetch all IDs globally, sort by calculated proj, paginate manually ──
      if (filters.sortBy === 'proj_pts' && scoring) {
        // Step 1: get all matching player IDs (no pagination yet)
        let idQ = supabase
          .from('players')
          .select('id, espn_athlete_id, status', { count: 'exact' })

        if (filters.search)               idQ = idQ.or(`name.ilike.%${filters.search}%,team.ilike.%${filters.search}%`)
        if (filters.pos !== 'ALL')        idQ = idQ.eq('pos', filters.pos)
        if (filters.league !== 'ALL')     idQ = idQ.eq('league', filters.league)
        if (filters.status !== 'ALL')     idQ = idQ.eq('status', filters.status)
        if (filters.conference !== 'ALL') idQ = idQ.eq('conference', filters.conference)
        if (filters.team !== 'ALL' && !filters.rookiesOnly) idQ = idQ.eq('team', filters.team)
        if (filters.rookiesOnly)          idQ = idQ.eq('is_rookie', true)

        const { data: allIds, count, error: idErr } = await idQ
        if (idErr) throw idErr
        if (!allIds?.length) return { players: [] as Player[], total: 0 }

        // Step 2: fetch proj stats for all matching players
        const athleteIds = allIds
          .map(p => p.espn_athlete_id ?? (p.id > 50_000_000 ? null : p.id - 1_000_000))
          .filter((id): id is number => id !== null && id > 0)

        const projMap = new Map<number, ProjStats>()
        if (athleteIds.length > 0) {
          // Fetch in batches of 1000 (Supabase limit)
          for (let i = 0; i < athleteIds.length; i += 1000) {
            const { data: projBatch } = await supabase
              .from('player_proj_stats')
              .select('*')
              .in('espn_athlete_id', athleteIds.slice(i, i + 1000))
            for (const row of (projBatch ?? [])) projMap.set(row.espn_athlete_id, row as ProjStats)
          }
        }

        // Step 3: sort all IDs by calculated proj
        const scored = allIds.map(p => {
          const espnId = p.espn_athlete_id ?? (p.id > 50_000_000 ? null : p.id - 1_000_000)
          const proj = espnId ? projMap.get(espnId) : undefined
          const pts = proj ? calcProjPts(proj, scoring) * statusMultiplier(p.status) : 0
          return { id: p.id, pts }
        })
        scored.sort((a, b) => filters.sortDir === 'asc' ? a.pts - b.pts : b.pts - a.pts)

        // Step 4: paginate the sorted IDs
        const pageIds = scored
          .slice(filters.page * filters.pageSize, (filters.page + 1) * filters.pageSize)
          .map(s => s.id)

        if (!pageIds.length) return { players: [] as Player[], total: count ?? 0 }

        // Step 5: fetch full player rows for this page, preserving sort order
        const { data: pageData, error: pageErr } = await supabase
          .from('players')
          .select('*')
          .in('id', pageIds)
        if (pageErr) throw pageErr

        // Re-sort to match the order from step 4
        const idOrder = new Map(pageIds.map((id, i) => [id, i]))
        const sorted = (pageData ?? []).sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0))

        return { players: sorted as Player[], total: count ?? 0 }
      }

      // ── Normal sort: let DB handle it ──
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

      // proj_pts sort is now handled globally above — this path never runs for proj sort
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
      const seen = new Set<string>()
      const teams: Array<{ team: string; league: PlayerLeague; conference: string | null }> = []
      const pageSize = 1000
      let page = 0

      while (true) {
        let q = supabase
          .from('players')
          .select('team, league, conference')
          .neq('pos', 'DST')
          .order('league')       // NFL before CFB alphabetically
          .order('conference')
          .order('team')
          .range(page * pageSize, (page + 1) * pageSize - 1)

        if (league !== 'ALL') q = q.eq('league', league)

        const { data, error } = await q
        if (error) throw error
        if (!data || data.length === 0) break

        for (const r of data) {
          if (!seen.has(r.team)) {
            seen.add(r.team)
            teams.push({ team: r.team, league: r.league as PlayerLeague, conference: r.conference })
          }
        }

        if (data.length < pageSize) break
        page++
      }

      // NFL first (sorted by name), then CFB grouped by conference then name
      const nfl = teams.filter(t => t.league === 'NFL').sort((a, b) => a.team.localeCompare(b.team))
      const cfb = teams.filter(t => t.league === 'CFB').sort((a, b) => {
        const confCmp = (a.conference ?? '').localeCompare(b.conference ?? '')
        return confCmp !== 0 ? confCmp : a.team.localeCompare(b.team)
      })
      return [...nfl, ...cfb]
    },
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
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

// ── Projected stats from player_proj_stats table ──────────────
// Fetches raw projected stat lines for a set of espn_athlete_ids.
// Fantasy points are calculated client-side using league scoring.
export function useProjStats(espnAthleteIds: number[]) {
  return useQuery({
    queryKey: ['proj-stats', espnAthleteIds],
    enabled: espnAthleteIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_proj_stats')
        .select('*')
        .in('espn_athlete_id', espnAthleteIds)
      if (error) throw error
      const map = new Map<number, ProjStats>()
      for (const row of (data ?? [])) map.set(row.espn_athlete_id, row as ProjStats)
      return map
    },
    staleTime: 10 * 60_000,
    gcTime:    60 * 60_000,
  })
}

// Calculate displayed projected points for a player given league scoring settings.
// Returns 0 if no proj stats available or no league selected.
export function getDisplayProj(
  player: Player,
  projMap: Map<number, ProjStats> | undefined,
  scoring: ScoringRules | null | undefined,
): number {
  if (!scoring) return 0
  // NFL: espn_athlete_id is null, use id - 1_000_000
  // CFB: use espn_athlete_id directly
  const espnId = player.espn_athlete_id ?? (player.id > 50_000_000 ? null : player.id - 1_000_000)
  if (!espnId) return 0
  const proj = projMap?.get(espnId)
  if (!proj) return 0
  const base = calcProjPts(proj, scoring)
  return Math.round(base * statusMultiplier(player.status) * 10) / 10
}
