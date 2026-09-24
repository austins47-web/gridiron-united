import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CURRENT_SEASON } from '@/lib/season'
import { livePollInterval } from '@/lib/pickemWeek'
import {
  computeWeek, computeStandings, isWeekComplete, tiebreakerTotal,
  type WeekRow, type StandingRow, type Game, type Pick, type Member,
} from '@/components/pickem/standings'

export interface PickemWeekWinner {
  week: number
  rows: WeekRow[]
  /** Everyone tied at the top — a "3-way tie" is real and common with a small league. */
  winners: WeekRow[]
  runnersUp: WeekRow[]
  totalGames: number
  actualTiebreakerTotal: number | null
  decidedByTiebreak: boolean
  /** Season-wide, so the popup can call out a streak or a season-lead alongside the week win. */
  standings: StandingRow[]
}

/**
 * The most recently fully-completed week for a Pick'Em league, and
 * who won it — same tie rule as WeekRecap (most correct, closest
 * tiebreaker guess breaks ties), so a league never sees two different
 * "who won" answers from two different parts of the app.
 *
 * Returns null while loading, if the league has no members/picks yet,
 * or if no week is complete yet. Deliberately season-wide (not
 * scoped to "this week") so it also works right after a
 * newly-finished week rolls the "current" week forward — the popup
 * that consumes this is what decides whether that week's already
 * been shown.
 */
export function usePickemWeekWinner(leagueId: string | null | undefined, enabled: boolean): PickemWeekWinner | null {
  const active = enabled && !!leagueId

  const { data: games = [] } = useQuery({
    queryKey: ['pickem-winner-games', CURRENT_SEASON],
    enabled: active,
    // This runs on every page for Pick'Em players — only poll while a
    // week can actually be finishing (games on), not around the clock
    staleTime: 5 * 60_000,
    refetchInterval: (q) => livePollInterval(q.state.data, 60_000),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nfl_games')
        .select('id, week, game_date, home_team, away_team, home_score, away_score, status, is_tiebreaker')
        .eq('season', CURRENT_SEASON)
      if (error) throw error
      return (data ?? []) as Game[]
    },
  })

  const { data: picks = [] } = useQuery({
    queryKey: ['pickem-winner-picks', leagueId],
    enabled: active,
    staleTime: 5 * 60_000,
    refetchInterval: () => livePollInterval(games, 60_000),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pickem_picks')
        .select('game_id, user_id, week, picked_team, tiebreaker_score')
        .eq('league_id', leagueId!)
        .eq('season', CURRENT_SEASON)
      if (error) throw error
      return (data ?? []) as Pick[]
    },
  })

  const { data: members = [] } = useQuery({
    queryKey: ['pickem-winner-members', leagueId],
    enabled: active,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_members')
        .select('user_id, profile:profiles(username, display_name, avatar_url)')
        .eq('league_id', leagueId!)
      if (error) throw error
      return (data ?? []) as Member[]
    },
  })

  return useMemo<PickemWeekWinner | null>(() => {
    if (!active || games.length === 0 || members.length === 0) return null

    const weeksDesc = [...new Set(games.map(g => g.week))].sort((a, b) => b - a)
    let targetWeek: number | null = null
    for (const wk of weeksDesc) {
      const wkGames = games.filter(g => g.week === wk)
      if (wkGames.length > 0 && isWeekComplete(wkGames)) { targetWeek = wk; break }
    }
    if (targetWeek == null) return null

    const wkGames = games.filter(g => g.week === targetWeek)
    const wkPicks = picks.filter(p => p.week === targetWeek)
    const rows = computeWeek(wkGames, wkPicks, members)
    const played = rows.filter(r => r.submitted)
    if (played.length === 0) return null

    const top = played[0]
    const winners = played.filter(
      r => r.correct === top.correct &&
           (r.tiebreakerDiff ?? Infinity) === (top.tiebreakerDiff ?? Infinity)
    )
    const runnersUp = played.filter(r => !winners.includes(r)).slice(0, 3)
    const tiedOnCorrect = played.filter(r => r.correct === top.correct)
    const decidedByTiebreak = tiedOnCorrect.length > winners.length

    return {
      week: targetWeek,
      rows,
      winners,
      runnersUp,
      totalGames: Math.max(...played.map(r => r.played), 0),
      actualTiebreakerTotal: tiebreakerTotal(wkGames),
      decidedByTiebreak,
      standings: computeStandings(games, picks, members),
    }
  }, [active, games, picks, members])
}
