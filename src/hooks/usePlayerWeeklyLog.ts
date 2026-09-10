import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { calcFantasyPts, scoringFromLeague } from '@/lib/scoring'
import { toEspnId } from '@/lib/playerIdentity'
import type { League, Player } from '@/types/database'

// Real, per-week points for one player across the whole season, using
// the LEAGUE'S OWN scoring rules — same formula/inputs as
// useActualPoints, so a player's Roster-row "Actual" figure for the
// selected week always matches what shows up in this breakdown for
// that same week. Deliberately NOT the flat generic formula
// PlayerProfileDrawer's own Fantasy tab uses there (that tab has no
// specific league in context - a player's profile can be opened
// without one); the Roster page always has a real league's scoring
// rules available, so this uses those.
export function usePlayerWeeklyLog(player: Player | null, league: League | null, enabled: boolean) {
  const espnId = player ? toEspnId(player) : null
  const season = new Date().getFullYear()

  return useQuery({
    queryKey: ['player-weekly-log', player?.id, season],
    enabled: enabled && !!player && !!espnId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('live_player_stats')
        .select('*')
        .eq('espn_athlete_id', espnId!)
        .eq('league', player!.league)
        .eq('season', season)
        .order('week', { ascending: true })
      if (error) throw error

      const scoring = league ? scoringFromLeague(league) : null
      const byWeek = new Map<number, number>()
      for (const row of (data ?? []) as any[]) {
        if (!scoring) continue
        const pts = calcFantasyPts(row, scoring)
        // Sum rather than overwrite in the rare case a player has more
        // than one game row in the same week.
        byWeek.set(row.week, (byWeek.get(row.week) ?? 0) + pts)
      }
      return byWeek
    },
    staleTime: 60_000,
  })
}
