import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import { useCurrentWeek } from '@/hooks/useLiveStats'
import { calcFantasyPts, statusMultiplier } from '@/lib/scoring'
import type { League, ScoringRules } from '@/types/database'
import { Zap, Wifi, WifiOff } from 'lucide-react'
import clsx from 'clsx'

const POS_COLOR: Record<string, string> = {
  QB:  'bg-red-500/20 text-red-300 border-red-500/30',
  RB:  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  WR:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  TE:  'bg-orange-500/20 text-orange-300 border-orange-500/30',
  K:   'bg-purple-500/20 text-purple-300 border-purple-500/30',
  DST: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  FLEX:'bg-field-500/30 text-field-200 border-field-500/30',
}

function scoringFromLeague(lg: League): ScoringRules {
  const keys: (keyof ScoringRules)[] = [
    'score_pass_td','score_pass_yd','score_pass_bonus_300','score_pass_int',
    'score_rush_td','score_rush_yd','score_rush_bonus_100',
    'score_rec_td','score_rec_yd','score_rec_bonus_100','score_reception',
    'score_fumble_lost','score_2pt_conv',
    'score_fg_0_39','score_fg_40_49','score_fg_50_plus','score_pat','score_fg_miss',
    'score_dst_sack','score_dst_int','score_dst_fumble_rec','score_dst_td',
    'score_dst_safety','score_dst_blocked',
    'score_dst_pts_0','score_dst_pts_1_6','score_dst_pts_7_13','score_dst_pts_14_20',
    'score_dst_pts_21_27','score_dst_pts_28_34','score_dst_pts_35_plus',
  ]
  return Object.fromEntries(keys.map(k => [k, lg[k] ?? 0])) as ScoringRules
}

export function LiveScoringView() {
  const { activeLeagueId, user } = useAppStore()
  const { data: currentWeek = 1 } = useCurrentWeek()
  const qc = useQueryClient()
  const [isLive, setIsLive] = useState(false)

  const { data: league } = useQuery({
    queryKey: ['league-full', activeLeagueId],
    enabled: !!activeLeagueId,
    queryFn: async () => {
      const { data } = await supabase.from('leagues').select('*').eq('id', activeLeagueId!).single()
      return data as League | null
    },
    staleTime: 5 * 60_000,
  })

  const { data: starters = [] } = useQuery({
    queryKey: ['live-starters', activeLeagueId, user?.id, currentWeek],
    enabled: !!activeLeagueId && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('rosters')
        .select('slot, player:players(id, name, team, pos, league, espn_athlete_id, status)')
        .eq('league_id', activeLeagueId!)
        .eq('user_id', user!.id)
        .eq('week', currentWeek)
        .not('slot', 'like', 'BN%')
        .not('slot', 'like', 'IR%')
        .not('slot', 'like', 'CFB_OS%')
      return (data ?? []).filter((r: any) => r.player)
    },
  })

  const athleteIds = useMemo(
    () => starters.map((r: any) => r.player?.espn_athlete_id).filter(Boolean) as number[],
    [starters]
  )

  const { data: liveStats = [] } = useQuery({
    queryKey: ['live-player-stats', currentWeek, athleteIds],
    enabled: athleteIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('live_player_stats')
        .select('*')
        .in('espn_athlete_id', athleteIds)
        .eq('week', currentWeek)
      return data ?? []
    },
    staleTime: 30_000,
    refetchInterval: 90_000,
  })

  // Realtime subscription
  useEffect(() => {
    if (!athleteIds.length) return
    const channel = supabase
      .channel(`live-scoring-${activeLeagueId}-${currentWeek}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_player_stats' },
        (payload) => {
          const row = payload.new as any
          if (!athleteIds.includes(row?.espn_athlete_id)) return
          qc.setQueryData(
            ['live-player-stats', currentWeek, athleteIds],
            (old: any[] = []) => {
              const idx = old.findIndex(s =>
                s.espn_athlete_id === row.espn_athlete_id && s.game_id === row.game_id
              )
              if (idx >= 0) { const n = [...old]; n[idx] = row; return n }
              return [...old, row]
            }
          )
        }
      )
      .subscribe(status => setIsLive(status === 'SUBSCRIBED'))
    return () => { supabase.removeChannel(channel) }
  }, [athleteIds.join(','), activeLeagueId, currentWeek])

  const scoring = useMemo(() => league ? scoringFromLeague(league) : null, [league])

  const statMap = useMemo(() => {
    const m = new Map<number, any>()
    for (const s of liveStats) {
      // Sum stats across multiple games (player could appear in >1 row if bye week logic shifts)
      const existing = m.get(s.espn_athlete_id)
      if (existing) {
        for (const k of Object.keys(s)) {
          if (typeof s[k] === 'number' && k !== 'week' && k !== 'season') {
            existing[k] = (existing[k] ?? 0) + s[k]
          }
        }
      } else {
        m.set(s.espn_athlete_id, { ...s })
      }
    }
    return m
  }, [liveStats])

  const playerRows = useMemo(() => starters.map((r: any) => {
    const p = r.player
    const stats = statMap.get(p?.espn_athlete_id)
    const pts = stats && scoring
      ? Math.round(calcFantasyPts(stats, scoring) * statusMultiplier(p?.status ?? 'active') * 10) / 10
      : null
    return { slot: r.slot, player: p, stats, pts }
  }), [starters, statMap, scoring])

  const totalPts = playerRows.reduce((s, r) => s + (r.pts ?? 0), 0)
  const scoredCt = playerRows.filter(r => r.pts !== null && r.pts > 0).length

  if (!activeLeagueId) {
    return (
      <div className="panel text-center text-field-400 py-12">
        <Zap className="w-8 h-8 mx-auto mb-3 opacity-30"/>
        <p>Select a league to see live scoring.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="panel flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-gold"/>
            <span className="font-cond font-black text-sm uppercase tracking-wider text-white">
              Live Scoring — Week {currentWeek}
            </span>
            <span className={clsx(
              'flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full',
              isLive ? 'bg-green-500/15 text-green-400' : 'bg-field-700 text-field-400'
            )}>
              {isLive ? <Wifi className="w-3 h-3"/> : <WifiOff className="w-3 h-3"/>}
              {isLive ? 'Live' : 'Offline'}
            </span>
          </div>
          <p className="text-field-400 text-xs">
            {scoredCt} of {playerRows.length} starters have stats · Week {currentWeek}
          </p>
        </div>
        <div className="text-right">
          <div className="font-cond font-black text-3xl text-gold">{totalPts.toFixed(1)}</div>
          <div className="text-xs text-field-400">pts</div>
        </div>
      </div>

      <div className="space-y-2">
        {playerRows.length === 0 && (
          <div className="panel text-center text-field-400 text-sm py-8">
            No starters set for Week {currentWeek}. Set your lineup first.
          </div>
        )}
        {playerRows.map((r, i) => {
          const p = r.player
          const s = r.stats
          return (
            <div key={i} className="panel flex items-center gap-3">
              <div className="flex flex-col items-center gap-1 w-14 shrink-0">
                <span className="text-xs text-field-500 font-bold uppercase">{r.slot}</span>
                <span className={clsx(
                  'text-[12px] font-black px-1.5 py-0.5 rounded border',
                  POS_COLOR[p?.pos ?? 'FLEX']
                )}>{p?.pos}</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-sm truncate">{p?.name ?? '—'}</div>
                <div className="text-field-500 text-xs">{p?.team}</div>
              </div>

              {s ? (
                <div className="hidden sm:flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-field-400 shrink-0 justify-end max-w-[220px]">
                  {s.pass_yards > 0 && <span>{s.pass_yards} py · {s.pass_tds} ptd{s.pass_ints > 0 ? ` · ${s.pass_ints} int` : ''}</span>}
                  {s.rush_yards > 0 && <span>{s.rush_yards} ry · {s.rush_tds} rtd</span>}
                  {s.rec_yards  > 0 && <span>{s.receptions}/{s.targets} · {s.rec_yards} rcy · {s.rec_tds} td</span>}
                  {!s.pass_yards && !s.rush_yards && !s.rec_yards && (
                    <span className="text-field-600">No stats yet</span>
                  )}
                </div>
              ) : (
                <div className="hidden sm:block text-xs text-field-600 shrink-0">—</div>
              )}

              <div className={clsx(
                'font-cond font-black text-xl w-16 text-right shrink-0',
                r.pts !== null && r.pts > 0 ? 'text-gold' : 'text-field-600'
              )}>
                {r.pts !== null ? r.pts.toFixed(1) : '—'}
              </div>
            </div>
          )
        })}
      </div>

      {league && (
        <p className="text-xs text-field-600 text-center">
          {league.name} · {String(league.scoring_type).replace('_', '-').toUpperCase()} · {league.score_pass_td}pt passT D · {league.score_reception}pt rec
        </p>
      )}
    </div>
  )
}
