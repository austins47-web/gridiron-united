import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '@/store/appStore'
import { Star, RefreshCw, WifiOff } from 'lucide-react'
import clsx from 'clsx'

// ── Types ────────────────────────────────────────────────────

interface GameTeam {
  abbr: string
  name: string
  score: string
  winner?: boolean
  record?: string
  rank?: number
}

interface LiveGame {
  id: string
  league: 'NFL' | 'CFB'
  status: 'pre' | 'in' | 'post'
  statusText: string
  clock?: string
  period?: number
  possession?: string
  home: GameTeam
  away: GameTeam
  venue?: string
  broadcast?: string
  downDistance?: string
  redZone?: boolean
}

// ── ESPN parsers ─────────────────────────────────────────────

function parseGame(event: any, league: 'NFL' | 'CFB'): LiveGame {
  try {
    const comp = event.competitions?.[0] ?? {}
    const statusType = comp.status?.type?.name ?? 'STATUS_SCHEDULED'
    const competitors: any[] = comp.competitors ?? []
    const homeComp = competitors.find((c: any) => c.homeAway === 'home') ?? competitors[0] ?? {}
    const awayComp = competitors.find((c: any) => c.homeAway === 'away') ?? competitors[1] ?? {}

    const mapTeam = (c: any): GameTeam => ({
      abbr: c.team?.abbreviation ?? '??',
      name: c.team?.shortDisplayName ?? c.team?.displayName ?? '??',
      score: c.score ?? '0',
      winner: c.winner,
      record: c.records?.[0]?.summary,
      rank: c.curatedRank?.current > 0 && c.curatedRank?.current <= 25
        ? c.curatedRank.current : undefined,
    })

    const gameStatus: 'pre' | 'in' | 'post' =
      statusType === 'STATUS_IN_PROGRESS' || statusType === 'STATUS_HALFTIME' ? 'in' :
      statusType === 'STATUS_FINAL' || statusType === 'STATUS_FINAL_OVERTIME' ? 'post' : 'pre'

    const situation = comp.situation ?? {}

    return {
      id: event.id,
      league,
      status: gameStatus,
      statusText: comp.status?.type?.shortDetail ?? '',
      clock: comp.status?.displayClock,
      period: comp.status?.period,
      possession: situation.possession,
      home: mapTeam(homeComp),
      away: mapTeam(awayComp),
      venue: comp.venue?.fullName,
      broadcast: comp.broadcasts?.[0]?.names?.[0],
      downDistance: situation.shortDownDistanceText,
      redZone: situation.isRedZone ?? false,
    }
  } catch {
    return {
      id: event.id ?? 'unknown',
      league,
      status: 'pre',
      statusText: '',
      home: { abbr: '??', name: '??', score: '0' },
      away: { abbr: '??', name: '??', score: '0' },
    }
  }
}

async function fetchLeague(league: 'NFL' | 'CFB'): Promise<LiveGame[]> {
  const url = league === 'NFL'
    ? 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
    : 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=50'

  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN ${league} fetch failed: ${res.status}`)
  const data = await res.json()
  return (data.events ?? []).map((e: any) => parseGame(e, league))
}

// ── Favorites ────────────────────────────────────────────────

const FAV_KEY = 'gu_fav_teams_v2'

function loadFavs(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]')) }
  catch { return new Set() }
}
function saveFavs(s: Set<string>) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...s]))
}

// ── Sub-components ───────────────────────────────────────────

function StatusBadge({ game }: { game: LiveGame }) {
  if (game.status === 'post') {
    return <span className="text-[10px] font-bold text-emerald-400">Final</span>
  }
  if (game.status === 'pre') {
    return <span className="text-[10px] text-field-400">{game.statusText}</span>
  }
  const quarters = ['', 'Q1', 'Q2', 'Q3', 'Q4', 'OT', '2OT']
  const halves = ['', '1st', '2nd', 'OT']
  const p = game.period ?? 1
  const label = game.league === 'NFL'
    ? (quarters[p] ?? `P${p}`)
    : (halves[p] ?? `P${p}`)
  return (
    <div className="flex items-center gap-1">
      <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
      <span className="text-[10px] font-bold text-red-400">{label}</span>
      {game.clock && <span className="text-[10px] text-field-400">{game.clock}</span>}
    </div>
  )
}

function GameCard({ game, favTeams, onToggleFav }: {
  game: LiveGame
  favTeams: Set<string>
  onToggleFav: (abbr: string) => void
}) {
  const isLive = game.status === 'in'
  const isFinal = game.status === 'post'
  const awayScore = parseInt(game.away.score) || 0
  const homeScore = parseInt(game.home.score) || 0
  const homeIsFav = favTeams.has(game.home.abbr)
  const awayIsFav = favTeams.has(game.away.abbr)

  return (
    <div className={clsx(
      'bg-field-800 border rounded-xl p-3 flex flex-col gap-2 min-w-0',
      isLive && game.redZone
        ? 'border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.12)]'
        : isLive
        ? 'border-gold/30'
        : 'border-field-700',
    )}>

      {/* Top row: league · status · broadcast · fav star */}
      <div className="flex items-center justify-between gap-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          <span className={clsx(
            'shrink-0 font-cond font-black text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded',
            game.league === 'NFL' ? 'bg-nfl/20 text-nfl' : 'bg-cfb/20 text-cfb',
          )}>
            {game.league}
          </span>
          <StatusBadge game={game} />
          {game.redZone && isLive && (
            <span className="text-[9px] font-black text-red-400 shrink-0">RZ</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {game.broadcast && (
            <span className="text-[9px] text-field-600 font-bold">{game.broadcast}</span>
          )}
          <button
            onClick={() => onToggleFav(awayIsFav ? game.away.abbr : game.home.abbr)}
            title="Toggle favorite"
            className="text-field-600 hover:text-gold transition-colors"
          >
            <Star className={clsx(
              'w-3.5 h-3.5',
              (homeIsFav || awayIsFav) ? 'fill-gold text-gold' : ''
            )} />
          </button>
        </div>
      </div>

      {/* Teams */}
      {([
        { team: game.away, isHome: false, ahead: awayScore > homeScore },
        { team: game.home, isHome: true,  ahead: homeScore > awayScore },
      ] as const).map(({ team, isHome, ahead }) => {
        const isFav = favTeams.has(team.abbr)
        const hasBall = isLive && game.possession === team.abbr
        const winning = (isLive || isFinal) && ahead
        const losing = (isLive || isFinal) && !ahead && awayScore !== homeScore

        return (
          <div key={team.abbr} className="flex items-center gap-1.5">
            {/* possession dot */}
            <div className="w-2 shrink-0 flex justify-center">
              {hasBall && <div className="w-1.5 h-1.5 rounded-full bg-gold" />}
            </div>

            {/* rank */}
            {team.rank ? (
              <span className="text-[9px] font-black text-cfb/80 w-5 shrink-0 text-right">
                #{team.rank}
              </span>
            ) : (
              <span className="w-5 shrink-0" />
            )}

            {/* abbr + name */}
            <span className={clsx(
              'font-cond font-bold text-sm flex-1 truncate',
              isFav ? 'text-gold'
              : winning ? 'text-white'
              : losing ? 'text-field-500'
              : 'text-field-300',
            )}>
              {team.abbr}
              <span className="text-field-600 font-normal text-[10px] ml-1 hidden sm:inline">
                {team.name !== team.abbr ? team.name : ''}
              </span>
            </span>

            {/* record (pre-game) */}
            {game.status === 'pre' && team.record && (
              <span className="text-[10px] text-field-600 shrink-0">{team.record}</span>
            )}

            {/* score */}
            {game.status !== 'pre' && (
              <span className={clsx(
                'font-cond font-black text-lg leading-none w-7 text-right shrink-0',
                isFav ? 'text-gold'
                : winning ? 'text-white'
                : losing ? 'text-field-500'
                : 'text-field-300',
              )}>
                {team.score}
              </span>
            )}
          </div>
        )
      })}

      {/* Down & distance / venue footer */}
      {isLive && game.downDistance && (
        <div className="text-[10px] text-field-500 border-t border-field-700/60 pt-1.5 truncate">
          {game.downDistance}
          {game.venue && (
            <span className="text-field-600 ml-2">· {game.venue.split(',')[0]}</span>
          )}
        </div>
      )}
      {game.status === 'pre' && game.venue && (
        <div className="text-[10px] text-field-600 border-t border-field-700/60 pt-1.5 truncate">
          {game.venue.split(',')[0]}
        </div>
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────

type LeagueFilter = 'All' | 'NFL' | 'CFB'
type StatusFilter = 'All' | 'Live' | 'Final' | 'Upcoming'

export function LiveScoresView() {
  const { profile } = useAppStore()

  const [favTeams, setFavTeams] = useState<Set<string>>(loadFavs)
  const [leagueFilter, setLeagueFilter] = useState<LeagueFilter>('All')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  // Auto-add profile favorites
  useEffect(() => {
    const toAdd = [profile?.favorite_nfl_team, profile?.favorite_cfb_team].filter(Boolean) as string[]
    if (!toAdd.length) return
    setFavTeams(prev => {
      const next = new Set(prev)
      let changed = false
      toAdd.forEach(t => { if (!next.has(t)) { next.add(t); changed = true } })
      if (changed) saveFavs(next)
      return changed ? next : prev
    })
  }, [profile?.favorite_nfl_team, profile?.favorite_cfb_team])

  const toggleFav = useCallback((abbr: string) => {
    setFavTeams(prev => {
      const next = new Set(prev)
      next.has(abbr) ? next.delete(abbr) : next.add(abbr)
      saveFavs(next)
      return next
    })
  }, [])

  // Determine refetch interval based on live games
  const getInterval = (games: LiveGame[]) =>
    games.some(g => g.status === 'in') ? 30_000 : 120_000

  const nflQuery = useQuery({
    queryKey: ['scores-nfl', refreshTick],
    queryFn: async () => {
      const games = await fetchLeague('NFL')
      setLastUpdated(new Date())
      return games
    },
    staleTime: 25_000,
    retry: 2,
  })

  const cfbQuery = useQuery({
    queryKey: ['scores-cfb', refreshTick],
    queryFn: async () => {
      const games = await fetchLeague('CFB')
      setLastUpdated(new Date())
      return games
    },
    staleTime: 25_000,
    retry: 2,
  })

  // Manual auto-refresh using a timer (avoids TQ v5 refetchInterval callback issues)
  useEffect(() => {
    const allGames = [...(nflQuery.data ?? []), ...(cfbQuery.data ?? [])]
    const interval = getInterval(allGames)
    const timer = setTimeout(() => setRefreshTick(t => t + 1), interval)
    return () => clearTimeout(timer)
  }, [nflQuery.data, cfbQuery.data])

  const nflGames = nflQuery.data ?? []
  const cfbGames = cfbQuery.data ?? []
  const allGames = [...nflGames, ...cfbGames]
  const isFetching = nflQuery.isFetching || cfbQuery.isFetching
  const hasError = nflQuery.isError && cfbQuery.isError
  const liveCount = allGames.filter(g => g.status === 'in').length

  const filtered = allGames.filter(g => {
    if (leagueFilter !== 'All' && g.league !== leagueFilter) return false
    if (statusFilter === 'Live' && g.status !== 'in') return false
    if (statusFilter === 'Final' && g.status !== 'post') return false
    if (statusFilter === 'Upcoming' && g.status !== 'pre') return false
    return true
  })

  // Sort: favs first → live → upcoming → final
  const sorted = [...filtered].sort((a, b) => {
    const aFav = favTeams.has(a.home.abbr) || favTeams.has(a.away.abbr)
    const bFav = favTeams.has(b.home.abbr) || favTeams.has(b.away.abbr)
    if (aFav !== bFav) return aFav ? -1 : 1
    const order: Record<string, number> = { in: 0, pre: 1, post: 2 }
    return (order[a.status] ?? 1) - (order[b.status] ?? 1)
  })

  const favGames = sorted.filter(g => favTeams.has(g.home.abbr) || favTeams.has(g.away.abbr))
  const otherGames = sorted.filter(g => !favTeams.has(g.home.abbr) && !favTeams.has(g.away.abbr))

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="section-title !mb-0">Live Scores</h1>
          {liveCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-2 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              {liveCount} Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[10px] text-field-500">
              {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => setRefreshTick(t => t + 1)}
            disabled={isFetching}
            className={clsx(
              'p-1.5 rounded-lg border border-field-700 text-field-400 hover:text-white hover:border-field-500 transition-colors',
              isFetching && 'animate-spin opacity-50 pointer-events-none',
            )}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-0.5 bg-field-800 border border-field-700 rounded-lg p-0.5">
          {(['All', 'NFL', 'CFB'] as LeagueFilter[]).map(f => (
            <button key={f} onClick={() => setLeagueFilter(f)}
              className={clsx(
                'font-cond font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded-md transition-colors',
                leagueFilter === f
                  ? f === 'NFL' ? 'bg-nfl/20 text-nfl'
                    : f === 'CFB' ? 'bg-cfb/20 text-cfb'
                    : 'bg-field-700 text-white'
                  : 'text-field-400 hover:text-white',
              )}>
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-0.5 bg-field-800 border border-field-700 rounded-lg p-0.5">
          {(['All', 'Live', 'Final', 'Upcoming'] as StatusFilter[]).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={clsx(
                'font-cond font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded-md transition-colors',
                statusFilter === f
                  ? f === 'Live' ? 'bg-red-500/20 text-red-400' : 'bg-field-700 text-white'
                  : 'text-field-400 hover:text-white',
              )}>
              {f}
            </button>
          ))}
        </div>
        {favTeams.size > 0 && (
          <span className="text-[11px] text-gold flex items-center gap-1">
            <Star className="w-3 h-3 fill-gold" />{favTeams.size} team{favTeams.size !== 1 ? 's' : ''} favorited
          </span>
        )}
      </div>

      {/* Profile favorites notice */}
      {(profile?.favorite_nfl_team || profile?.favorite_cfb_team) && (
        <div className="flex items-center gap-2 text-xs text-field-400 bg-field-800/40 border border-field-700/50 rounded-lg px-3 py-2">
          <Star className="w-3 h-3 text-gold fill-gold shrink-0" />
          <span>Auto-pinned from your profile:
            {profile.favorite_nfl_team && <span className="text-nfl font-bold ml-1">{profile.favorite_nfl_team}</span>}
            {profile.favorite_nfl_team && profile.favorite_cfb_team && <span className="text-field-600 mx-1">·</span>}
            {profile.favorite_cfb_team && <span className="text-cfb font-bold">{profile.favorite_cfb_team}</span>}
          </span>
        </div>
      )}

      {/* Error */}
      {hasError && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <WifiOff className="w-4 h-4 shrink-0" />
          <div>
            <p className="font-bold">Could not load scores</p>
            <p className="text-xs text-red-400/70 mt-0.5">ESPN scores API is unavailable. Try refreshing.</p>
          </div>
        </div>
      )}

      {/* Loading skeletons */}
      {isFetching && allGames.length === 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="bg-field-800 border border-field-700 rounded-xl p-3 h-28 animate-pulse" />
          ))}
        </div>
      )}

      {/* No games today */}
      {!isFetching && !hasError && allGames.length === 0 && (
        <div className="panel text-center py-14 space-y-2">
          <div className="text-4xl">🏈</div>
          <p className="text-white font-bold text-lg">No games today</p>
          <p className="text-field-400 text-sm">Check back on game days — scores update live every 30 seconds</p>
        </div>
      )}

      {/* No results for current filter */}
      {!isFetching && !hasError && allGames.length > 0 && sorted.length === 0 && (
        <div className="panel text-center py-8">
          <p className="text-field-400 text-sm">No games match the selected filters</p>
        </div>
      )}

      {/* Games */}
      {sorted.length > 0 && (
        <div className="space-y-5">
          {/* Favorited games */}
          {favGames.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-3.5 h-3.5 text-gold fill-gold" />
                <span className="font-cond font-bold text-xs uppercase tracking-wider text-gold">My Teams</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {favGames.map(g => (
                  <GameCard key={g.id} game={g} favTeams={favTeams} onToggleFav={toggleFav} />
                ))}
              </div>
            </div>
          )}

          {/* All other games */}
          {otherGames.length > 0 && (
            <div>
              {favGames.length > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-cond font-bold text-xs uppercase tracking-wider text-field-400">All Games</span>
                  <span className="text-[10px] text-field-600">tap ⭐ to favorite a team</span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {otherGames.map(g => (
                  <GameCard key={g.id} game={g} favTeams={favTeams} onToggleFav={toggleFav} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
