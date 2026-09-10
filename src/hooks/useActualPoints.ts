import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentWeek, useCurrentCFBWeek } from './useLiveStats'
import { calcFantasyPts, statusMultiplier, scoringFromLeague } from '@/lib/scoring'
import type { League } from '@/types/database'
import type { RosterEntryWithPlayer } from './useRoster'

// Real, in-progress/actual fantasy points for a set of roster entries,
// computed from live_player_stats using the league's own scoring
// rules — the same approach LiveScoringView uses (that view only
// covers the signed-in user's own starters; this generalizes it to
// any roster, e.g. an opponent's, for the Matchup tab, and to a full
// roster including bench for RosterView).
//
// NFL and CFB weeks are queried separately since they can genuinely
// diverge (CFB runs a Week 0 slate NFL doesn't) — a single shared
// week number would silently return zero stats for every CFB player
// the moment the two leagues' weeks differ.
export function useActualPoints(roster: RosterEntryWithPlayer[], league: League | null) {
  const { data: nflWeek = 1 } = useCurrentWeek()
  const { data: cfbWeek = 1 } = useCurrentCFBWeek()

  const nflAthleteIds = useMemo(
    () => roster.filter(r => r.player?.league === 'NFL').map(r => r.player?.espn_athlete_id).filter((id): id is number => !!id),
    [roster]
  )
  const cfbAthleteIds = useMemo(
    () => roster.filter(r => r.player?.league === 'CFB').map(r => r.player?.espn_athlete_id).filter((id): id is number => !!id),
    [roster]
  )

  const { data: liveStats = [] } = useQuery({
    queryKey: ['actual-points-stats', nflWeek, cfbWeek, nflAthleteIds, cfbAthleteIds],
    enabled: nflAthleteIds.length > 0 || cfbAthleteIds.length > 0,
    queryFn: async () => {
      const [nflRes, cfbRes] = await Promise.all([
        nflAthleteIds.length > 0
          ? supabase.from('live_player_stats').select('*').in('espn_athlete_id', nflAthleteIds).eq('league', 'NFL').eq('week', nflWeek)
          : Promise.resolve({ data: [] }),
        cfbAthleteIds.length > 0
          ? supabase.from('live_player_stats').select('*').in('espn_athlete_id', cfbAthleteIds).eq('league', 'CFB').eq('week', cfbWeek)
          : Promise.resolve({ data: [] }),
      ])
      return [...(nflRes.data ?? []), ...(cfbRes.data ?? [])]
    },
    staleTime: 30_000,
    refetchInterval: 90_000,
  })

  const statByAthleteId = useMemo(() => {
    const m = new Map<number, any>()
    for (const s of liveStats as any[]) {
      // A player can have more than one row if they appear in
      // multiple games in a week (rare, but sum rather than overwrite)
      const existing = m.get(s.espn_athlete_id)
      if (existing) {
        for (const k of Object.keys(s)) {
          if (typeof s[k] === 'number' && k !== 'week' && k !== 'season') existing[k] = (existing[k] ?? 0) + s[k]
        }
      } else {
        m.set(s.espn_athlete_id, { ...s })
      }
    }
    return m
  }, [liveStats])

  const scoring = useMemo(() => league ? scoringFromLeague(league) : null, [league])

  // rosterEntry.id -> { points, stats } — null points means no live
  // data yet for that player this week (game hasn't started, or
  // they simply have no stat row), NOT necessarily a zero score.
  const pointsByRosterId = useMemo(() => {
    const m = new Map<string, { points: number | null; stats: any | null }>()
    for (const r of roster) {
      const p = r.player
      const stats = p?.espn_athlete_id ? statByAthleteId.get(p.espn_athlete_id) : undefined
      const points = stats && scoring
        ? Math.round(calcFantasyPts(stats, scoring) * statusMultiplier(p?.status ?? 'active') * 10) / 10
        : null
      m.set(r.id, { points, stats: stats ?? null })
    }
    return m
  }, [roster, statByAthleteId, scoring])

  const startersTotal = useMemo(() => {
    return roster
      .filter(r => !r.slot.startsWith('BN') && !r.slot.startsWith('IR') && !r.slot.startsWith('CFB_OS'))
      .reduce((sum, r) => sum + (pointsByRosterId.get(r.id)?.points ?? 0), 0)
  }, [roster, pointsByRosterId])

  return { pointsByRosterId, startersTotal, nflWeek, cfbWeek }
}
