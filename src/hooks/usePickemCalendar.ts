import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CURRENT_SEASON } from '@/lib/season'
import { currentPickemWeek, pickemWeekEnds } from '@/lib/pickemWeek'

export interface PickemCalendar {
  /** The week the Pick'Em page opens on right now. */
  currentWeek: number
  /** When each week stops being current (Tuesday 11:59 PM ET after its last game). */
  weekEnds: Map<number, Date>
}

/**
 * The Pick'Em week clock for the current season, from the schedule —
 * just week + kickoff per game, cached for hours. Null until loaded;
 * if the schedule can't be read, falls back to Week 1 rather than
 * holding the page on a loading state.
 */
export function usePickemCalendar(): PickemCalendar | null {
  const { data, isError } = useQuery({
    queryKey: ['pickem-calendar', CURRENT_SEASON],
    staleTime: 6 * 3600_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nfl_games')
        .select('week, game_date, status')
        .eq('season', CURRENT_SEASON)
      if (error) throw error
      return data ?? []
    },
  })
  return useMemo(() => {
    if (!data) return isError ? { currentWeek: 1, weekEnds: new Map() } : null
    const weekEnds = pickemWeekEnds(data)
    return { currentWeek: currentPickemWeek(weekEnds), weekEnds }
  }, [data, isError])
}
