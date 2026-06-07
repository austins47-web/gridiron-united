import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '@/store/appStore'
import { Star, RefreshCw, Wifi, WifiOff, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

// ── Types ────────────────────────────────────────────────────

interface GameTeam {
  abbr: string
  name: string
  score: string
  logo: string
  winner?: boolean
  record?: string
  rank?: number
}

interface LiveGame {
  id: string
  league: 'NFL' | 'CFB'
  status: 'pre' | 'in' | 'post'
  statusText: string   // "7:30 PM ET", "Q3 4:23", "Final", etc.
  clock?: string
  period?: number
  possession?: string
  home: GameTeam
  away: GameTeam
  venue?: string
  broadcast?: string
  downDistance?: string // "2nd & 7"
  redZone?: boolean
}

// ── ESPN fetchers ────────────────────────────────────────────

function parseGame(event: any, league: 'NFL' | 'CFB'): LiveGame {
  const comp = event.competitions?.[0] ?? {}
  const status = comp.status ?? {}
  const statusType = status.type?.name ?? 'STATUS_SCHEDULED'

  const competitors: any[] = comp.competitors ?? []
  const homeComp = competitors.find((c: any) => c.homeAway === 'home') ?? competitors[0] ?? {}
  const awayComp = competitors.find((c: any) => c.homeAway === 'away') ?? competitors[1] ?? {}

  const mapTeam = (c: any): GameTeam => ({
    abbr: c.team?.abbreviation ?? '??',
    name: c.team?.shortDisplayName ?? c.team?.displayName ?? '??',
    score: c.score ?? '0',
    logo: c.team?.logo ?? '',
    winner: c.winner,
    record: c.records?.[0]?.summary,
    rank: c.curatedRank?.current && c.curatedRank.current <= 25 ? c.curatedRank.current : undefined,
  })

  const gameStatus: 'pre' | 'in' | 'post' =
    statusType === 'STATUS_IN_PROGRESS' || statusType === 'STATUS_HALFTIME' ? 'in' :
    statusType === 'STATUS_FINAL' || statusType === 'STATUS_FINAL_OVERTIME' ? 'post' : 'pre'

  const situation = comp.situation ?? {}

  return {
    id: event.id,
    league,
    status: gameStatus,
    statusText: status.type?.shortDetail ?? status.type?.description ?? '',
    clock: status.displayClock,
    period: status.period,
    possession: situation.possession,
    home: mapTeam(homeComp),
    away: mapTeam(awayComp),
    venue: comp.venue?.fullName,
    broadcast: comp.broadcasts?.[0]?.names?.[0],
    downDistance: situation.shortDownDistanceText,
    redZone: situation.isRedZone ?? false,
  }
}

async function fetchNflGames(): Promise<LiveGame[]> {
  const url = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
  const res = await fetch(url)
  if (!res.ok) throw new Error('NFL fetch failed')
  const data = await res.json()
  return (data.events ?? []).map((e: any) => parseGame(e, 'NFL'))
}

async function fetchCfbGames(): Promise<LiveGame[]> {
  // groups=80 = FBS (top-tier CFB only)
  const url = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=50'
  const res = await fetch(url)
  if (!res.ok) throw new Error('CFB fetch failed')
  const data = await res.json()
  return (data.events ?? []).map((e: any) => parseGame(e, 'CFB'))
}

// ── Favorites storage ────────────────────────────────────────

const FAV_KEY = 'gridiron_fav_teams'

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

function saveFavorites(favs: Set<string>) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...favs]))
}

// ── Score display helpers ────────────────────────────────────

function PeriodLabel({ game }: { game: LiveGame }) {
  if (game.status === 'post') return <span className="text-emerald-400 font-bold text-xs">Final</span>
  if (game.status === 'pre') return <span className="text-field-400 text-xs">{game.statusText}</span>
  // in progress
  const period = game.period ?? 0
  const periodStr = game.league === 'NFL'
    ? ['', 'Q1', 'Q2', 'Q3', 'Q4', 'OT', '2OT'][period] ?? `Q${period}`
    : ['', '1H', '2H', 'OT'][period] ?? `P${period}`
  return (
    <div className="flex items-center gap-1">
      <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
      <span className="text-red-400 font-bold text-xs">{periodStr}</span>
      {game.clock && <span className="text-field-400 text-xs">{game.clock}</span>}
    </div>
  )
}

// ── Game card ────────────────────────────────────────────────

function GameCard({
  game,
  isFav,
  onToggleFav,
}: {
  game: LiveGame
  isFav: boolean
  onToggleFav: (abbr: string) => void
}) {
  const isLive = game.status === 'in'
  const isFinal = game.status === 'post'

  const awayAhead = parseInt(game.away.score) > parseInt(game.home.score)
  const homeAhead = parseInt(game.home.score) > parseInt(game.away.score)
  const tied = parseInt(game.away.score) === parseInt(game.home.score)

  return (
    <div className={clsx(
      'bg-field-800 border rounded-xl p-3 flex flex-col gap-2 transition-all',
      isLive
        ? game.redZone
          ? 'border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
          : 'border-gold/30'
        : 'border-field-700',
    )}>
      {/* Header: league badge + status + fav + broadcast */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className={clsx(
            'font-cond font-black text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded',
            game.league === 'NFL' ? 'bg-nfl/20 text-nfl' : 'bg-cfb/20 text-cfb'
          )}>
            {game.league}
          </span>
          <PeriodLabel game={game} />
          {game.redZone && isLive && (
            <span className="text-[9px] font-black text-red-400 uppercase tracking-wider">🏈 RZ</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {game.broadcast && (
            <span className="text-[9px] text-field-500 font-bold">{game.broadcast}</span>
          )}
          <button
            onClick={() => onToggleFav(game.away.abbr)}
            title={`Favorite ${game.away.abbr}`}
            className={clsx(
              'transition-colors hover:scale-110',
              isFav ? 'text-gold' : 'text-field-600 hover:text-field-400'
            )}
          >
            <Star className={clsx('w-3.5 h-3.5', isFav && 'fill-gold')} />
          </button>
        </div>
      </div>

      {/* Teams + scores */}
      <div className="space-y-1.5">
        {[
          { team: game.away, isAhead: awayAhead, isHome: false },
          { team: game.home, isAhead: homeAhead, isHome: true },
        ].map(({ team, isAhead, isHome }) => {
          const hasPossession = game.possession === team.abbr
          return (
            <div key={team.abbr} className="flex items-center gap-2">
              {/* Possession indicator */}
              <div className="w-2 shrink-0">
                {hasPossession && isLive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-gold" />
                )}
              </div>

              {/* Rank badge */}
              {team.rank && (
                <span className="text-[9px] font-black text-cfb/80 w-4 shrink-0">#{team.rank}</span>
              )}
              {!team.rank && <span className="w-4 shrink-0" />}

              {/* Team name */}
              <span className={clsx(
                'font-cond font-bold text-sm flex-1 truncate',
                isFinal && team.winner ? 'text-white'
                : isFinal && !team.winner ? 'text-field-500'
                : isLive && isAhead ? 'text-white'
                : 'text-field-300'
              )}>
                {isHome && <span className="text-field-600 text-[10px] mr-1">vs</span>}
                {team.abbr}
                <span className="text-field-500 text-[10px] ml-1 font-normal">
                  {team.name !== team.abbr ? team.name : ''}
                </span>
              </span>

              {/* Record (pre-game) */}
              {game.status === 'pre' && team.record && (
                <span className="text-[10px] text-field-600">{team.record}</span>
              )}

              {/* Score */}
              {game.status !== 'pre' && (
                <span className={clsx(
                  'font-cond font-black text-lg leading-none w-7 text-right',
                  isFinal && team.winner ? 'text-white'
                  : isFinal && !team.winner ? 'text-field-500'
                  : isLive && isAhead ? 'text-white'
                  : isLive && !isAhead && !tied ? 'text-field-500'
                  : 'text-field-300'
                )}>
                  {team.score}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Down & distance (live only) */}
      {isLive && game.downDistance && (
        <div className="text-[10px] text-field-400 border-t border-field-700 pt-1.5">
          {game.downDistance}
          {game.venue && <span className="text-field-600 ml-2">· {game.venue.split(',')[0]}</span>}
        </div>
      )}

      {/* Venue (pre-game) */}
      {game.status === 'pre' && game.venue && (
        <div className="text-[10px] text-field-600 border-t border-field-700 pt-1.5 truncate">
          {game.venue.split(',')[0]}
        </div>
      )}
    </div>
  )
}

// ── Main View ────────────────────────────────────────────────

const LEAGUE_FILTERS = ['All', 'NFL', 'CFB'] as const
const STATUS_FILTERS = ['All', 'Live', 'Final', 'Upcoming'] as const
type LeagueFilter = typeof LEAGUE_FILTERS[number]
type StatusFilter = typeof STATUS_FILTERS[number]

export function LiveScoresView() {
  const { profile } = useAppStore()

  const [favorites, setFavorites] = useState<Set<string>>(() => {
    const favs = loadFavorites()
    // Auto-add profile favorites on first load
    if (profile?.favorite_nfl_team) favs.add(profile.favorite_nfl_team)
    if (profile?.favorite_cfb_team) favs.add(profile.favorite_cfb_team)
    return favs
  })

  const [leagueFilter, setLeagueFilter] = useState<LeagueFilter>('All')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Auto-add profile favorites when profile loads
  useEffect(() => {
    if (profile?.favorite_nfl_team || profile?.favorite_cfb_team) {
      setFavorites(prev => {
        const next = new Set(prev)
        if (profile.favorite_nfl_team) next.add(profile.favorite_nfl_team)
        if (profile.favorite_cfb_team) next.add(profile.favorite_cfb_team)
        saveFavorites(next)
        return next
      })
    }
  }, [profile?.favorite_nfl_team, profile?.favorite_cfb_team])

  const toggleFav = useCallback((abbr: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(abbr)) next.delete(abbr)
      else next.add(abbr)
      saveFavorites(next)
      return next
    })
  }, [])

  // NFL scores — refresh every 30s when games are live
  const { data: nflGames = [], isError: nflError, refetch: refetchNfl, isFetching: nflFetching } = useQuery({
    queryKey: ['live-scores-nfl'],
    queryFn: async () => {
      const games = await fetchNflGames()
      setLastUpdated(new Date())
      return games
    },
    refetchInterval: (data) => {
      const hasLive = (data as LiveGame[] | undefined)?.some(g => g.status === 'in')
      return hasLive ? 30_000 : 120_000  // 30s if live, 2min otherwise
    },
    staleTime: 25_000,
  })

  // CFB scores
  const { data: cfbGames = [], isError: cfbError, refetch: refetchCfb, isFetching: cfbFetching } = useQuery({
    queryKey: ['live-scores-cfb'],
    queryFn: async () => {
      const games = await fetchCfbGames()
      setLastUpdated(new Date())
      return games
    },
    refetchInterval: (data) => {
      const hasLive = (data as LiveGame[] | undefined)?.some(g => g.status === 'in')
      return hasLive ? 30_000 : 120_000
    },
    staleTime: 25_000,
  })

  const isFetching = nflFetching || cfbFetching
  const hasError = nflError && cfbError

  const allGames = [...nflGames, ...cfbGames]

  // Filter
  const filtered = allGames.filter(g => {
    if (leagueFilter !== 'All' && g.league !== leagueFilter) return false
    if (statusFilter === 'Live' && g.status !== 'in') return false
    if (statusFilter === 'Final' && g.status !== 'post') return false
    if (statusFilter === 'Upcoming' && g.status !== 'pre') return false
    return true
  })

  // Sort: favorites first, then live, then upcoming, then final
  const sorted = [...filtered].sort((a, b) => {
    const aFav = favorites.has(a.home.abbr) || favorites.has(a.away.abbr)
    const bFav = favorites.has(b.home.abbr) || favorites.has(b.away.abbr)
    if (aFav !== bFav) return aFav ? -1 : 1
    const order = { in: 0, pre: 1, post: 2 }
    return order[a.status] - order[b.status]
  })

  const liveCount = allGames.filter(g => g.status === 'in').length

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">

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
              Updated {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => { refetchNfl(); refetchCfb() }}
            disabled={isFetching}
            className={clsx(
              'p-1.5 rounded-lg border border-field-700 text-field-400 hover:text-white hover:border-field-500 transition-colors',
              isFetching && 'animate-spin text-gold'
            )}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 bg-field-800 border border-field-700 rounded-lg p-0.5">
          {LEAGUE_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setLeagueFilter(f)}
              className={clsx(
                'font-cond font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded-md transition-colors',
                leagueFilter === f
                  ? f === 'NFL' ? 'bg-nfl/20 text-nfl'
                    : f === 'CFB' ? 'bg-cfb/20 text-cfb'
                    : 'bg-field-700 text-white'
                  : 'text-field-400 hover:text-white'
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-field-800 border border-field-700 rounded-lg p-0.5">
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={clsx(
                'font-cond font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded-md transition-colors',
                statusFilter === f
                  ? f === 'Live' ? 'bg-red-500/20 text-red-400'
                    : 'bg-field-700 text-white'
                  : 'text-field-400 hover:text-white'
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {favorites.size > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-gold ml-1">
            <Star className="w-3 h-3 fill-gold" />
            <span className="font-bold">{favorites.size} favorited</span>
          </div>
        )}
      </div>

      {/* Favorites notice */}
      {(profile?.favorite_nfl_team || profile?.favorite_cfb_team) && (
        <div className="flex items-center gap-2 text-xs text-field-400 bg-field-800/40 border border-field-700/50 rounded-lg px-3 py-2">
          <Star className="w-3 h-3 text-gold fill-gold shrink-0" />
          <span>
            Your profile teams are auto-favorited
            {profile.favorite_nfl_team && <span className="text-gold font-bold ml-1">{profile.favorite_nfl_team}</span>}
            {profile.favorite_nfl_team && profile.favorite_cfb_team && <span className="text-field-600 mx-1">·</span>}
            {profile.favorite_cfb_team && <span className="text-cfb font-bold">{profile.favorite_cfb_team}</span>}
            <span className="ml-1">— always pinned to the top</span>
          </span>
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Could not load scores. Check your connection and try refreshing.</span>
        </div>
      )}

      {/* No games */}
      {!hasError && sorted.length === 0 && allGames.length > 0 && (
        <div className="panel text-center py-8">
          <p className="text-field-400 text-sm">No games match the current filters</p>
        </div>
      )}

      {/* Off-season / no data */}
      {!hasError && allGames.length === 0 && !isFetching && (
        <div className="panel text-center py-12 space-y-2">
          <div className="text-4xl">🏈</div>
          <p className="text-white font-bold">No games today</p>
          <p className="text-field-400 text-sm">Check back on game days for live scores</p>
        </div>
      )}

      {/* Loading skeleton */}
      {isFetching && allGames.length === 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="bg-field-800 border border-field-700 rounded-xl p-3 animate-pulse h-24" />
          ))}
        </div>
      )}

      {/* Games grid — favorites section first if any */}
      {sorted.length > 0 && (() => {
        const favGames = sorted.filter(g => favorites.has(g.home.abbr) || favorites.has(g.away.abbr))
        const otherGames = sorted.filter(g => !favorites.has(g.home.abbr) && !favorites.has(g.away.abbr))

        return (
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
                    <GameCard
                      key={g.id}
                      game={g}
                      isFav={favorites.has(g.home.abbr) || favorites.has(g.away.abbr)}
                      onToggleFav={toggleFav}
                    />
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
                    <span className="text-[10px] text-field-600">— click ⭐ to favorite a team</span>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {otherGames.map(g => (
                    <GameCard
                      key={g.id}
                      game={g}
                      isFav={false}
                      onToggleFav={toggleFav}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
