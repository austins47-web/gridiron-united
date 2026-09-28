import { useMemo } from 'react'
import { useAppStore } from '@/store/appStore'
import { usePickemWeekWinner } from './usePickemWeekWinner'

/**
 * Who holds the Pick'Em belt in the active league: the latest finished
 * week's winners (computeBelt's rule). Rides on the same queries as
 * the week-winner popup, which is mounted on every page, so it costs
 * nothing extra. Empty outside Pick'Em leagues.
 */
export function useBeltHolders(): Set<string> {
  const { activeLeague } = useAppStore()
  const result = usePickemWeekWinner(activeLeague?.id, activeLeague?.league_type === 'pickem')
  return useMemo(() => new Set(result?.winners.map(w => w.userId) ?? []), [result])
}
