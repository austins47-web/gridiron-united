import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CURRENT_SEASON } from '@/lib/season'
import { livePollInterval } from '@/lib/pickemWeek'
import { usePickemCalendar } from './usePickemCalendar'

const NONE: any[] = []

/**
 * This week's games (the same query and cache as the Pick'Em page) and
 * how many messages each game's chat thread has.
 */
export function useGameThreads(leagueId: string | null | undefined, enabled: boolean) {
  const calendar = usePickemCalendar()
  const week = calendar?.currentWeek ?? null

  const { data: games } = useQuery({
    queryKey: ['nfl-games', week],
    enabled: enabled && week != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nfl_games')
        .select('*')
        .eq('season', CURRENT_SEASON)
        .eq('week', week!)
        .order('game_date', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    refetchInterval: (q) => livePollInterval(q.state.data as any, 20_000),
  })

  const counts = useThreadCounts(leagueId, enabled)
  return { week, games: (games ?? NONE) as any[], counts }
}

/** How many messages each game's chat thread has. */
export function useThreadCounts(leagueId: string | null | undefined, enabled = true): Map<string, number> {
  const { data: rows } = useQuery({
    queryKey: ['chat-thread-counts', leagueId],
    enabled: enabled && !!leagueId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_messages')
        .select('game_id')
        .eq('league_id', leagueId!)
        .not('game_id', 'is', null)
        .is('deleted_at', null)
        .limit(5000)
      if (error) throw error
      return (data ?? []) as { game_id: string }[]
    },
  })

  return useMemo(() => {
    const out = new Map<string, number>()
    for (const r of rows ?? []) out.set(r.game_id, (out.get(r.game_id) ?? 0) + 1)
    return out
  }, [rows])
}

/** One game, kept fresh while it's being played — a thread's score header. */
export function useThreadGame(gameId: string | null | undefined) {
  return useQuery({
    queryKey: ['nfl-game', gameId],
    enabled: !!gameId,
    queryFn: async () => {
      const { data, error } = await supabase.from('nfl_games').select('*').eq('id', gameId!).maybeSingle()
      if (error) throw error
      return data
    },
    refetchInterval: (q) => livePollInterval(q.state.data ? [q.state.data as any] : [], 20_000),
  }).data ?? null
}

/** Who in the league picked which side of a game — only asked for once it's kicked off. */
export function useThreadPicks(leagueId: string | null | undefined, gameId: string | null | undefined, kickedOff: boolean) {
  return useQuery({
    queryKey: ['thread-picks', leagueId, gameId],
    enabled: !!leagueId && !!gameId && kickedOff,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pickem_picks')
        .select('user_id, picked_team')
        .eq('league_id', leagueId!)
        .eq('game_id', gameId!)
      if (error) throw error
      return (data ?? []) as { user_id: string; picked_team: string }[]
    },
  }).data ?? NONE as { user_id: string; picked_team: string }[]
}
