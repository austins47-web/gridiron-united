import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import { useCurrentWeek, useNFLPlayerStats, normalizeTeam, teamAbbr } from '@/hooks/useLiveStats'
import { calculateFantasyPoints, DEFAULT_SCORING } from '@/lib/sportsdata'
import { Zap, TrendingUp } from 'lucide-react'
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

export function LiveScoringView() {
  const { activeLeagueId, user } = useAppStore()
  const { data: currentWeek = 1 } = useCurrentWeek()

  // Fetch my starters for this league
  const { data: starters = [] } = useQuery({
    queryKey: ['live-scoring-roster', activeLeagueId, user?.id],
    enabled: !!activeLeagueId && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('rosters')
        .select('slot, player:players(name, team, pos, league)')
        .eq('league_id', activeLeagueId!)
        .eq('user_id', user!.id)
        .eq('week', 0)
        .not('slot', 'like', 'BN%')
        .not('slot', 'like', 'IR%')
        .not('slot', 'like', 'CFB_OS%')
      return (data ?? []).filter(r => r.player)
    },
  })

  // Fetch league scoring rules
  const { data: league } = useQuery({
    queryKey: ['league-scoring', activeLeagueId],
    enabled: !!activeLeagueId,
    queryFn: async () => {
      const { data } = await supabase
        .from('leagues')
        .select('scoring_type')
        .eq('id', activeLeagueId!)
        .single()
      return data
    },
  })

  // Build scoring rules from league settings
  const rules = {
    ...DEFAULT_SCORING,
    ppr: league?.scoring_type === 'PPR' ? 1 :
         league?.scoring_type === 'HALF_PPR' ? 0.5 : 0,
  }

  // Fetch live NFL player stats for current week
  const { data: nflStats, isLoading: statsLoading } = useNFLPlayerStats(currentWeek)

  // Only NFL players for live scoring (CFB doesn't have same live API)
  const nflStarters = starters.filter(r => r.player?.league === 'NFL')

  // Calculate points for each starter
  const playerPoints = nflStarters.map(r => {
    const p = r.player!
    // Match by name and team abbreviation
    const abbr = teamAbbr(p.team)
    const found = nflStats?.find(s =>
      s.Name.toLowerCase() === p.name.toLowerCase() &&
      (s.Team.toUpperCase() === abbr.toUpperCase() ||
       normalizeTeam(s.Team).toLowerCase() === p.team.toLowerCase())
    )
    return {
      slot: r.slot,
      name: p.name,
      team: p.team,
      pos: p.pos,
      points: found ? calculateFantasyPoints(found, rules) : null,
      stats: found,
    }
  })

  const totalPoints = playerPoints.reduce((sum, p) => sum + (p.points ?? 0), 0)
  const liveCount = playerPoints.filter(p => p.points !== null).length

  return (
    <div className="space-y-4">
      {/* Header with total */}
      <div className="panel flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-gold" />
            <span className="font-cond font-black text-sm uppercase tracking-wider text-white">
              Live Scoring — Week {currentWeek}
            </span>
          </div>
          <p className="text-field-400 text-xs">{liveCount} of {nflStarters.length} starters scored</p>
        </div>
        <div className="text-right">
          <div className="font-cond font-black text-3xl text-gold">
            {totalPoints.toFixed(1)}
          </div>
          <div className="text-xs text-field-400">pts</div>
        </div>
      </div>

      {statsLoading && (
        <div className="flex justify-center py-8">
          <div className="flex gap-1"><div className="ai-dot"/><div className="ai-dot"/><div className="ai-dot"/></div>
        </div>
      )}

      {!statsLoading && !import.meta.env.VITE_SPORTSDATAIO_KEY && (
        <div className="panel text-center text-field-400 text-sm">
          Add <code className="text-gold text-xs">VITE_SPORTSDATAIO_KEY</code> to Vercel environment variables to enable live scoring.
        </div>
      )}

      {/* Player cards */}
      <div className="space-y-2">
        {playerPoints.map((p, i) => (
          <div key={i} className="panel flex items-center gap-3">
            {/* Slot + position */}
            <div className="flex flex-col items-center gap-1 w-14 shrink-0">
              <span className="text-xs text-field-500 font-bold uppercase">{p.slot}</span>
              <span className={clsx(
                'text-xs font-bold px-1.5 py-0.5 rounded border',
                POS_COLOR[p.pos] ?? POS_COLOR.FLEX
              )}>{p.pos}</span>
            </div>

            {/* Player info */}
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white text-sm truncate">{p.name}</div>
              <div className="text-xs text-field-400">{p.team}</div>
              {/* Stat line */}
              {p.stats && (
                <div className="text-xs text-field-500 mt-0.5 truncate">
                  {p.pos === 'QB' && p.stats.PassingYards != null && (
                    `${p.stats.PassingYards}yds ${p.stats.PassingTouchdowns ?? 0}TD ${p.stats.PassingInterceptions ?? 0}INT`
                  )}
                  {(p.pos === 'RB') && (
                    `${p.stats.RushingYards ?? 0}rush ${p.stats.RushingTouchdowns ?? 0}TD · ${p.stats.Receptions ?? 0}rec ${p.stats.ReceivingYards ?? 0}yds`
                  )}
                  {(p.pos === 'WR' || p.pos === 'TE') && (
                    `${p.stats.Receptions ?? 0}/${(p.stats.Receptions ?? 0) + 1}rec ${p.stats.ReceivingYards ?? 0}yds ${p.stats.ReceivingTouchdowns ?? 0}TD`
                  )}
                  {p.pos === 'K' && (
                    `${p.stats.FieldGoalsMade ?? 0}FG ${p.stats.ExtraPointsMade ?? 0}XP`
                  )}
                </div>
              )}
            </div>

            {/* Points */}
            <div className="text-right shrink-0">
              {p.points !== null ? (
                <>
                  <div className="font-cond font-black text-xl text-white">
                    {p.points.toFixed(1)}
                  </div>
                  <div className="text-xs text-field-500">pts</div>
                </>
              ) : (
                <div className="text-field-600 text-sm font-bold">—</div>
              )}
            </div>
          </div>
        ))}

        {nflStarters.length === 0 && !statsLoading && (
          <div className="panel text-center text-field-400 py-8">
            <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40"/>
            <p className="text-sm">No NFL starters in your lineup yet.</p>
            <p className="text-xs text-field-500 mt-1">Add players from the Players tab.</p>
          </div>
        )}
      </div>
    </div>
  )
}
