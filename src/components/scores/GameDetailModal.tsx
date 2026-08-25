import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Newspaper, BarChart2, Users, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import { teamLogoUrl } from '@/components/teams/teamIds'

// ── Types ─────────────────────────────────────────────────────

interface TeamStatLine { label: string; away: string; home: string }

interface TopPerformer {
  name: string
  team: 'away' | 'home'
  stat: string
  desc: string
}

interface GameSummary {
  awayName: string
  homeName: string
  awayAbbr: string
  homeAbbr: string
  awayId: string
  homeId: string
  awayScore: string
  homeScore: string
  status: string
  teamStats: TeamStatLine[]
  topPerformers: TopPerformer[]
  headlines: Array<{ title: string; url: string; desc: string }>
}

// ── Fetch ESPN game summary ────────────────────────────────────

async function fetchSummary(gameId: string, league: 'NFL' | 'CFB'): Promise<GameSummary> {
  // Route through Supabase Edge Function proxy to avoid ESPN CORS/blocking issues
  const PROXY = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sportsdata`
  const ANON  = import.meta.env.VITE_SUPABASE_ANON_KEY
  const res = await fetch(
    `${PROXY}?endpoint=${encodeURIComponent(`game/summary/${league}/${gameId}`)}`,
    { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }
  )
  if (!res.ok) throw new Error(`Summary fetch failed: ${res.status}`)
  const d = await res.json()

  const comp = d.header?.competitions?.[0] ?? {}
  const competitors: any[] = comp.competitors ?? []
  const away = competitors.find((c: any) => c.homeAway === 'away') ?? competitors[0] ?? {}
  const home = competitors.find((c: any) => c.homeAway === 'home') ?? competitors[1] ?? {}

  // Team stats
  const teamStats: TeamStatLine[] = []
  const rawStats: any[] = d.boxscore?.teams ?? []
  if (rawStats.length === 2) {
    const awayStats = rawStats.find((t: any) => t.homeAway === 'away') ?? rawStats[0]
    const homeStats = rawStats.find((t: any) => t.homeAway === 'home') ?? rawStats[1]
    const awayMap = new Map<string, string>()
    const homeMap = new Map<string, string>()
    for (const s of (awayStats?.statistics ?? [])) awayMap.set(s.name, s.displayValue)
    for (const s of (homeStats?.statistics ?? [])) homeMap.set(s.name, s.displayValue)

    const wantedStats = [
      { key: 'totalYards',    label: 'Total Yards' },
      { key: 'passingYards',  label: 'Passing Yards' },
      { key: 'rushingYards',  label: 'Rushing Yards' },
      { key: 'turnovers',     label: 'Turnovers' },
      { key: 'thirdDownEff',  label: '3rd Down' },
      { key: 'possessionTime',label: 'Time of Poss.' },
      { key: 'totalPenaltiesYards', label: 'Penalties' },
      { key: 'firstDowns',    label: '1st Downs' },
    ]
    for (const { key, label } of wantedStats) {
      const a = awayMap.get(key)
      const h = homeMap.get(key)
      if (a !== undefined && h !== undefined) {
        teamStats.push({ label, away: a, home: h })
      }
    }
  }

  // Top performers
  const topPerformers: TopPerformer[] = []
  const leaders: any[] = d.leaders ?? []
  // ESPN's real shape is THREE levels, not two:
  //   leaders[team].leaders[category].leaders[athlete]
  // leaders[team] is one side's set of stat categories (passing,
  // rushing, receiving...); leaders[team].leaders[category] is a
  // single category like "passingYards"; the actual athlete only
  // shows up one level deeper, in category.leaders[]. The previous
  // version treated the middle (category) objects as if they WERE
  // athlete entries — category.athlete, category.team, and
  // category.displayValue all don't exist, so `athlete` was always
  // undefined and every entry got silently skipped. That's why this
  // tab reported "not available" even for finished games with real
  // ESPN data.
  for (const group of leaders) {
    const isAway = away.team?.id === group.team?.id
    for (const category of (group.leaders ?? [])) {
      const topLeader = category.leaders?.[0]
      const athlete = topLeader?.athlete
      if (!athlete) continue
      topPerformers.push({
        name: athlete.shortName ?? athlete.displayName ?? '',
        team: isAway ? 'away' : 'home',
        stat: topLeader.displayValue ?? String(topLeader.mainStat?.value ?? ''),
        desc: category.displayName ?? category.name ?? '',
      })
    }
  }

  // Headlines / news
  const headlines = (d.news?.articles ?? []).slice(0, 5).map((a: any) => ({
    title: a.headline ?? a.title ?? '',
    url:   a.links?.web?.href ?? a.link ?? '',
    desc:  a.description ?? '',
  }))

  return {
    awayName:  away.team?.shortDisplayName ?? away.team?.displayName ?? '',
    homeName:  home.team?.shortDisplayName ?? home.team?.displayName ?? '',
    awayAbbr:  away.team?.abbreviation ?? '',
    homeAbbr:  home.team?.abbreviation ?? '',
    awayId:    String(away.team?.id ?? ''),
    homeId:    String(home.team?.id ?? ''),
    awayScore: away.score ?? '0',
    homeScore: home.score ?? '0',
    status:    comp.status?.type?.shortDetail ?? '',
    teamStats,
    topPerformers,
    headlines,
  }
}

// ── Modal ─────────────────────────────────────────────────────

type Tab = 'stats' | 'players' | 'news'

interface Props {
  gameId: string
  league: 'NFL' | 'CFB'
  onClose: () => void
}

export function GameDetailModal({ gameId, league, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('stats')

  const { data, isLoading, error } = useQuery({
    queryKey: ['game-summary', gameId],
    queryFn: () => fetchSummary(gameId, league),
    staleTime: 30_000,
    retry: 1,
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative bg-field-900 border border-field-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-field-700 shrink-0">
          <div className="flex items-center gap-2">
            <span className={clsx(
              'font-cond font-black text-[12px] uppercase tracking-wider px-1.5 py-0.5 rounded',
              league === 'NFL' ? 'bg-nfl/20 text-nfl' : 'bg-cfb/20 text-cfb',
            )}>{league}</span>
            {data && (
              <span className="font-bold text-white text-sm">
                {data.awayName} {data.awayScore} – {data.homeScore} {data.homeName}
              </span>
            )}
            {data?.status && (
              <span className="text-xs text-field-400">{data.status}</span>
            )}
          </div>
          <button onClick={onClose} className="text-field-400 hover:text-white transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-field-700 shrink-0">
          {([
            { id: 'stats',   label: 'Team Stats',    icon: BarChart2 },
            { id: 'players', label: 'Leaders',        icon: Users },
            { id: 'news',    label: 'News',           icon: Newspaper },
          ] as { id: Tab; label: string; icon: any }[]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={clsx(
                'flex items-center gap-1.5 flex-1 justify-center py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors',
                tab === id
                  ? 'text-gold border-gold'
                  : 'text-field-400 border-transparent hover:text-white',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex justify-center py-12">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-field-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-field-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-field-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {error && (
            <div className="text-center py-12 text-field-400 text-sm px-4">
              Could not load game data. Game may not have started yet.
            </div>
          )}

          {data && tab === 'stats' && (
            <div className="p-4">
              {data.teamStats.length === 0 ? (
                <p className="text-center text-field-400 text-sm py-8">
                  Team stats aren't available — ESPN only provides stats during and after live games.
                  Check back once the game starts.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-field-400 text-xs uppercase tracking-wider">
                      <th className="text-left py-2 font-bold w-1/3">{data.awayName}</th>
                      <th className="text-center py-2 font-bold w-1/3"></th>
                      <th className="text-right py-2 font-bold w-1/3">{data.homeName}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.teamStats.map((s, i) => (
                      <tr key={i} className={clsx(
                        'border-t border-field-800',
                        i % 2 === 0 ? '' : 'bg-field-800/30',
                      )}>
                        <td className="py-2 font-bold text-white">{s.away}</td>
                        <td className="py-2 text-center text-field-400 text-xs">{s.label}</td>
                        <td className="py-2 font-bold text-white text-right">{s.home}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {data && tab === 'players' && (
            <div className="p-4 space-y-5">
              {data.topPerformers.length === 0 ? (
                <p className="text-center text-field-400 text-sm py-8">
                  Player stats aren't available — ESPN only provides leaders during and after live games.
                  Check back once the game starts.
                </p>
              ) : (
                (['away', 'home'] as const).map(side => {
                  const rows = data.topPerformers.filter(p => p.team === side)
                  if (rows.length === 0) return null
                  const abbr = side === 'away' ? data.awayAbbr : data.homeAbbr
                  const id   = side === 'away' ? data.awayId   : data.homeId
                  const name = side === 'away' ? data.awayName : data.homeName
                  const logo = teamLogoUrl({ abbr, id }, league)
                  return (
                    <div key={side}>
                      {/* Team header — identity lives here once, not on every row */}
                      <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-field-700">
                        {logo
                          ? <img src={logo} alt="" className="w-5 h-5 object-contain shrink-0" />
                          : <div className="w-5 h-5 rounded-full bg-field-700 shrink-0" />}
                        <span className="font-cond font-bold text-xs uppercase tracking-wider text-white">
                          {name}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {rows.map((p, i) => (
                          <div key={i} className="flex items-center justify-between bg-field-800/50 rounded-lg px-3 py-2.5">
                            <div className="min-w-0">
                              <div className="font-bold text-white text-sm truncate">{p.name}</div>
                              <div className="font-cond font-bold text-[11px] uppercase tracking-wider text-gold/80 mt-0.5">
                                {p.desc}
                              </div>
                            </div>
                            <div className="font-cond font-black text-white text-sm text-right shrink-0 ml-3">
                              {p.stat}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {data && tab === 'news' && (
            <div className="p-4 space-y-3">
              {data.headlines.length === 0 ? (
                <p className="text-center text-field-400 text-sm py-8">
                  No news articles for this game.
                </p>
              ) : (
                data.headlines.map((h, i) => (
                  <a
                    key={i}
                    href={h.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-field-800/50 hover:bg-field-700/50 rounded-lg px-3 py-2.5 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-white text-sm leading-snug group-hover:text-gold transition-colors">
                          {h.title}
                        </div>
                        {h.desc && (
                          <div className="text-xs text-field-400 mt-0.5 line-clamp-2">{h.desc}</div>
                        )}
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-field-500 shrink-0 mt-0.5" />
                    </div>
                  </a>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
