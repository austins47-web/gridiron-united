import { useMemo } from 'react'
import { useLeagueMembersList } from './usePickemSeasonData'

/** Everyone's flair in a league, by user id (from the shared member list). */
export function useFlairMap(leagueId: string | null | undefined): Map<string, string> {
  const members = useLeagueMembersList(leagueId)
  return useMemo(
    () => new Map(members.filter((m: any) => m.badge_flair).map((m: any) => [m.user_id as string, m.badge_flair as string])),
    [members],
  )
}
