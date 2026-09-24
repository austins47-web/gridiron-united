import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { X, Newspaper, BarChart2, Users, ExternalLink, Activity } from 'lucide-react'
import clsx from 'clsx'
import { teamLogoUrl } from '@/components/teams/teamIds'

// ── Types ─────────────────────────────────────────────────────

interface TeamStatLine {
  label: string
  away: string
  home: string
  /** Comparable numbers for the bar (null = text only). */
  awayN: number | null
  homeN: number | null
  /** Fewer is better (turnovers, penalties, sacks). */
  lowerWins?: boolean
}

interface TopPerformer {
  name: string
  team: 'away' | 'home'
  stat: string
  desc: string
}

interface ScoringPlay {
  id: string
  period: number
  clock: string
  team: 'away' | 'home'
  abbr: string       // TD, FG, SF, 2PT...
  type: string       // "Passing Touchdown"
  text: string
  awayScore: number
  homeScore: number
}

interface Side {
  name: string        // short, e.g. "Eagles"
  abbr: string
  id: string
  score: string
  record: string
  color: string       // readable on the dark sheet
  winner: boolean
}

interface GameSummary {
  away: Side
  home: Side
  state: 'pre' | 'in' | 'post'
  status: string          // "Final", "Q3 4:12", "9/27 - 1:00 PM EDT"
  kickoff: string | null
  venue: string | null
  broadcast: string | null
  /** Home team's chance to win after each play (0–1), with its quarter. */
  winProb: { pct: number; period: number }[]
  /** ESPN's pre-game Matchup Predictor, as percentages. */
  predictor: { away: number; home: number } | null
  line: string | null       // "BUF -7"
  overUnder: number | null
  scoringPlays: ScoringPlay[]
  teamStats: TeamStatLine[]
  topPerformers: TopPerformer[]
  headlines: Array<{ title: string; url: string; desc: string }>
}

// ── Team colors that read on the dark sheet ───────────────────

function luminance(hex: string): number {
  const n = parseInt(hex, 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** Same hue, lifted to a readable lightness (mixing in white would gray it out). */
function brighten(hex: string, minL: number): string {
  const n = parseInt(hex, 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2, d = max - min
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  const h = d === 0 ? 0
    : max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6
    : max === g ? ((b - r) / d + 2) / 6
    : ((r - g) / d + 4) / 6
  const L = Math.max(l, minL), S = Math.min(1, sat)
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S, p = 2 * L - q
  const ch = (t: number) => {
    t = (t + 1) % 1
    const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p
    return Math.round(v * 255).toString(16).padStart(2, '0')
  }
  return ch(h + 1 / 3) + ch(h) + ch(h - 1 / 3)
}
/** The brighter of a team's two colors, lifted if it'd vanish on near-black. */
function readableColor(color?: string, alt?: string): string {
  const options = [color, alt].filter((c): c is string => !!c && /^[0-9a-f]{6}$/i.test(c))
  if (options.length === 0) return '#9CA3AF'
  let best = options.sort((a, b) => luminance(b) - luminance(a))[0]
  if (luminance(best) < 0.08) best = brighten(best, 0.42)
  return `#${best}`
}

// ── Fetch ESPN game summary ────────────────────────────────────

/** "11-18" → 0.61, "36:25" → seconds, "4-35" → 35 (penalty yards), plain numbers as-is. */
function statNumber(key: string, v: string | undefined): number | null {
  if (v == null) return null
  if (key === 'possessionTime') {
    const [m, s] = v.split(':').map(Number)
    return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : null
  }
  if (key === 'thirdDownEff' || key === 'redZoneAttempts') {
    const [made, tries] = v.split('-').map(Number)
    return tries ? made / tries : 0
  }
  if (key === 'totalPenaltiesYards' || key === 'sacksYardsLost') {
    const n = Number(v.split('-')[key === 'sacksYardsLost' ? 0 : 1])
    return Number.isFinite(n) ? n : null
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

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
  const side = (c: any): Side => ({
    // "Eagles" in the NFL, "Alabama" in college
    name: (league === 'NFL' ? c.team?.name : c.team?.location) ?? c.team?.shortDisplayName ?? c.team?.displayName ?? '',
    abbr: c.team?.abbreviation ?? '',
    id: String(c.team?.id ?? ''),
    score: c.score ?? '0',
    record: (c.record ?? []).find((r: any) => r.type === 'total')?.summary ?? '',
    color: readableColor(c.team?.color, c.team?.alternateColor),
    winner: !!c.winner,
  })
  const awaySide = side(away), homeSide = side(home)
  // Two near-identical colors can't tell the teams apart on the chart
  if (Math.abs(luminance(awaySide.color.slice(1)) - luminance(homeSide.color.slice(1))) < 0.03 &&
      awaySide.color.toLowerCase() !== '#ffffff') awaySide.color = '#E5E7EB'

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

    // ESPN calls passing yards "netPassingYards" (after sacks) — the
    // old "passingYards" key never matched, so that row never showed
    const wantedStats: { key: string; label: string; lowerWins?: boolean }[] = [
      { key: 'totalYards',          label: 'Total Yards' },
      { key: 'netPassingYards',     label: 'Passing Yards' },
      { key: 'rushingYards',        label: 'Rushing Yards' },
      { key: 'yardsPerPlay',        label: 'Yards / Play' },
      { key: 'firstDowns',          label: '1st Downs' },
      { key: 'thirdDownEff',        label: '3rd Down' },
      { key: 'redZoneAttempts',     label: 'Red Zone' },
      { key: 'turnovers',           label: 'Turnovers', lowerWins: true },
      { key: 'sacksYardsLost',      label: 'Sacks Allowed', lowerWins: true },
      { key: 'totalPenaltiesYards', label: 'Penalties', lowerWins: true },
      { key: 'possessionTime',      label: 'Time of Poss.' },
    ]
    for (const { key, label, lowerWins } of wantedStats) {
      const a = awayMap.get(key)
      const h = homeMap.get(key)
      if (a !== undefined && h !== undefined) {
        teamStats.push({ label, away: a, home: h, awayN: statNumber(key, a), homeN: statNumber(key, h), lowerWins })
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

  // Win probability — ESPN gives the home team's chance after each
  // play; the quarter comes from the same play in the drive log
  const periodOf = new Map<string, number>()
  for (const drive of [...(d.drives?.previous ?? []), ...(d.drives?.current ? [d.drives.current] : [])]) {
    for (const play of drive.plays ?? []) periodOf.set(String(play.id), play.period?.number ?? 1)
  }
  let lastPeriod = 1
  const winProb = (d.winprobability ?? [])
    .filter((w: any) => typeof w.homeWinPercentage === 'number')
    .map((w: any) => {
      lastPeriod = periodOf.get(String(w.playId)) ?? lastPeriod
      return { pct: w.homeWinPercentage, period: lastPeriod }
    })

  const scoringPlays: ScoringPlay[] = (d.scoringPlays ?? []).map((s: any) => ({
    id: String(s.id),
    period: s.period?.number ?? 1,
    clock: s.clock?.displayValue ?? '',
    team: String(s.team?.id) === awaySide.id ? 'away' : 'home',
    abbr: s.type?.abbreviation ?? '',
    type: s.type?.text ?? '',
    text: (s.text ?? '').trim(),
    awayScore: s.awayScore ?? 0,
    homeScore: s.homeScore ?? 0,
  }))

  const pred = d.predictor
  const predHome = Number(pred?.homeTeam?.gameProjection)
  const predAway = Number(pred?.awayTeam?.gameProjection)
  const pick = (d.pickcenter ?? [])[0]

  // Headlines / news
  const headlines = (d.news?.articles ?? []).slice(0, 5).map((a: any) => ({
    title: a.headline ?? a.title ?? '',
    url:   a.links?.web?.href ?? a.link ?? '',
    desc:  a.description ?? '',
  }))

  const state = comp.status?.type?.state
  return {
    away: awaySide,
    home: homeSide,
    state: state === 'in' || state === 'post' ? state : 'pre',
    status:    comp.status?.type?.shortDetail ?? '',
    kickoff:   comp.date ?? null,
    venue:     d.gameInfo?.venue?.fullName ?? null,
    broadcast: comp.broadcasts?.[0]?.media?.shortName ?? null,
    winProb,
    predictor: Number.isFinite(predHome) && Number.isFinite(predAway) ? { home: predHome, away: predAway } : null,
    line: pick?.details ?? null,
    overUnder: typeof pick?.overUnder === 'number' ? pick.overUnder : null,
    scoringPlays,
    teamStats,
    topPerformers,
    headlines,
  }
}

// ── Modal ─────────────────────────────────────────────────────

type Tab = 'flow' | 'stats' | 'players' | 'news'

interface Props {
  gameId: string
  league: 'NFL' | 'CFB'
  onClose: () => void
}

export function GameDetailModal({ gameId, league, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('flow')

  // Lock page scroll while open, matching PlayerProfileDrawer.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const { data, isLoading, error } = useQuery({
    queryKey: ['game-summary', gameId],
    queryFn: () => fetchSummary(gameId, league),
    staleTime: 30_000,
    retry: 1,
    // A live game keeps its chart and scoring moving
    refetchInterval: q => (q.state.data?.state === 'in' ? 30_000 : false),
  })

  // ESPN's own logo path when our table doesn't know the team
  const logo = (s: Side): string => teamLogoUrl({ abbr: s.abbr, id: s.id }, league)
    ?? `https://a.espncdn.com/i/teamlogos/${league === 'NFL' ? 'nfl' : 'ncaa'}/500/${league === 'NFL' ? s.abbr.toLowerCase() : s.id}.png`

  // Rendered via a portal straight to document.body — same fix and
  // same reason as PlayerProfileDrawer. This modal lives inside
  // AppShell's .route-enter page-transition wrapper, whose
  // animation's final keyframe is transform: translateY(0). Per the
  // CSS spec, ANY element with a transform (even a resting, visually
  // no-op one) becomes a new containing block for position:fixed
  // descendants — so "fixed to the viewport" was silently "fixed to
  // the scrollable page content's own box" instead. That's exactly
  // what produced the heavy black margin: the inset-0 backdrop was
  // being measured against that box, not the real screen edges.
  return createPortal(
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
        {/* Scoreboard */}
        <div className="relative shrink-0 border-b border-field-700 overflow-hidden">
          {data && (
            <div
              className="absolute inset-0 opacity-[0.18] pointer-events-none"
              style={{ background: `linear-gradient(90deg, ${data.away.color} 0%, transparent 45%, transparent 55%, ${data.home.color} 100%)` }}
            />
          )}
          <div className="relative flex items-center justify-between px-4 pt-3">
            <span className={clsx(
              'font-cond font-black text-[12px] uppercase tracking-wider px-1.5 py-0.5 rounded',
              league === 'NFL' ? 'bg-nfl/20 text-nfl' : 'bg-cfb/20 text-cfb',
            )}>{league}</span>
            <button onClick={onClose} aria-label="Close" className="text-field-400 hover:text-white transition-colors p-1 -mr-1">
              <X className="w-4 h-4" />
            </button>
          </div>
          {data ? (
            <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pb-4 pt-1">
              <TeamBlock side={data.away} logo={logo(data.away)} state={data.state} />
              <div className="text-center min-w-[92px]">
                {data.state === 'pre' ? (
                  <div className="font-cond font-black text-2xl text-field-300">VS</div>
                ) : (
                  <div className="font-cond font-black text-4xl text-white tabular-nums leading-none">
                    <span className={clsx(data.state === 'post' && !data.away.winner && 'text-field-400')}>{data.away.score}</span>
                    <span className="text-field-600 mx-1.5">–</span>
                    <span className={clsx(data.state === 'post' && !data.home.winner && 'text-field-400')}>{data.home.score}</span>
                  </div>
                )}
                <div className={clsx(
                  'mt-1.5 inline-flex items-center gap-1 font-cond font-bold text-[11px] uppercase tracking-wider',
                  data.state === 'in' ? 'text-red-400' : 'text-field-400',
                )}>
                  {data.state === 'in' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                  {data.status}
                </div>
                {(data.broadcast || data.venue) && data.state === 'pre' && (
                  <div className="text-[10px] text-field-500 mt-0.5 truncate">
                    {[data.broadcast, data.venue].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <TeamBlock side={data.home} logo={logo(data.home)} state={data.state} alignRight />
            </div>
          ) : (
            <div className="h-[92px]" />
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-field-700 shrink-0">
          {([
            { id: 'flow',    label: 'Game Flow',     icon: Activity },
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

          {data && tab === 'flow' && <GameFlow data={data} logo={logo} />}

          {data && tab === 'stats' && (
            <div className="p-4">
              {data.teamStats.length === 0 ? (
                <p className="text-center text-field-400 text-sm py-8">
                  Team stats aren't available — ESPN only provides stats during and after live games.
                  Check back once the game starts.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-field-400 font-cond font-bold text-xs uppercase tracking-wider">
                    <span className="flex items-center gap-1.5"><img src={logo(data.away)} alt="" className="w-4 h-4 object-contain" />{data.away.abbr}</span>
                    <span className="flex items-center gap-1.5">{data.home.abbr}<img src={logo(data.home)} alt="" className="w-4 h-4 object-contain" /></span>
                  </div>
                  {data.teamStats.map(s => <StatBar key={s.label} s={s} awayColor={data.away.color} homeColor={data.home.color} />)}
                </div>
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
                (['away', 'home'] as const).map(which => {
                  const rows = data.topPerformers.filter(p => p.team === which)
                  if (rows.length === 0) return null
                  const s = data[which]
                  const src = logo(s)
                  return (
                    <div key={which}>
                      {/* Team header — identity lives here once, not on every row */}
                      <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-field-700">
                        {src
                          ? <img src={src} alt="" className="w-5 h-5 object-contain shrink-0" />
                          : <div className="w-5 h-5 rounded-full bg-field-700 shrink-0" />}
                        <span className="font-cond font-bold text-xs uppercase tracking-wider text-white">
                          {s.name}
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
                            <div className="font-bold text-white text-sm text-right shrink-0 ml-3">
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
    </div>,
    document.body,
  )
}

// ── Scoreboard side ───────────────────────────────────────────

function TeamBlock({ side, logo, state, alignRight = false }: {
  side: Side; logo: string; state: GameSummary['state']; alignRight?: boolean
}) {
  const lost = state === 'post' && !side.winner
  return (
    <div className={clsx('flex items-center gap-2.5 min-w-0', alignRight && 'flex-row-reverse text-right')}>
      {logo
        ? <img src={logo} alt="" className={clsx('w-11 h-11 object-contain shrink-0 drop-shadow', lost && 'opacity-60')} />
        : <div className="w-11 h-11 rounded-full bg-field-700 shrink-0" />}
      <div className="min-w-0">
        <div className={clsx('font-cond font-black uppercase text-lg leading-none truncate', lost ? 'text-field-400' : 'text-white')}>
          {side.name}
        </div>
        {side.record && <div className="text-[11px] text-field-400 mt-1 tabular-nums">{side.record}</div>}
      </div>
    </div>
  )
}

// ── Game Flow tab ─────────────────────────────────────────────

function GameFlow({ data, logo }: { data: GameSummary; logo: (s: Side) => string }) {
  const hasChart = data.winProb.length > 1
  return (
    <div className="p-4 space-y-5">
      {/* Before kickoff: who's expected to win */}
      {data.state === 'pre' && (
        <div className="space-y-4">
          {data.predictor ? (
            <Predictor data={data} logo={logo} />
          ) : (
            <p className="text-center text-field-400 text-sm py-2">The matchup predictor isn&apos;t out for this game yet.</p>
          )}
          {(data.line || data.overUnder != null) && (
            <div className="grid grid-cols-2 gap-2">
              <Readout label="Line" value={data.line ?? '—'} />
              <Readout label="Over / Under" value={data.overUnder != null ? String(data.overUnder) : '—'} />
            </div>
          )}
          {data.kickoff && (
            <p className="text-center text-xs text-field-400">
              Kicks off {new Date(data.kickoff).toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {data.broadcast && <> on <span className="text-field-200">{data.broadcast}</span></>}
            </p>
          )}
        </div>
      )}

      {hasChart && <WinProbChart data={data} logo={logo} />}

      {data.scoringPlays.length > 0 && <ScoringTimeline data={data} logo={logo} />}

      {data.state !== 'pre' && !hasChart && data.scoringPlays.length === 0 && (
        <p className="text-center text-field-400 text-sm py-8">No scoring yet — check back as the game goes on.</p>
      )}
    </div>
  )
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-field-800/60 border border-field-700 px-3 py-2 text-center">
      <div className="font-cond font-black text-lg text-white leading-tight">{value}</div>
      <div className="font-cond font-bold text-[10px] uppercase tracking-[0.15em] text-field-400">{label}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="font-cond font-bold text-[11px] uppercase tracking-[0.2em] text-gold">{children}</span>
      <span className="flex-1 h-px bg-field-700" />
    </div>
  )
}

function Predictor({ data, logo }: { data: GameSummary; logo: (s: Side) => string }) {
  const p = data.predictor!
  return (
    <div>
      <SectionLabel>Matchup Predictor</SectionLabel>
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-2">
          <img src={logo(data.away)} alt="" className="w-6 h-6 object-contain" />
          <span className="font-cond font-black text-2xl text-white tabular-nums">{p.away.toFixed(1)}%</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="font-cond font-black text-2xl text-white tabular-nums">{p.home.toFixed(1)}%</span>
          <img src={logo(data.home)} alt="" className="w-6 h-6 object-contain" />
        </span>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-field-800">
        <div style={{ width: `${p.away}%`, background: data.away.color }} />
        <div className="w-0.5 bg-field-900" />
        <div style={{ width: `${p.home}%`, background: data.home.color }} />
      </div>
      <p className="text-[11px] text-field-500 mt-1.5 text-center">ESPN&apos;s chance of each team winning</p>
    </div>
  )
}

/**
 * Home team's win chance after every play: above the middle line the
 * home team's favored (filled in its color), below it the away team.
 */
function WinProbChart({ data, logo }: { data: GameSummary; logo: (s: Side) => string }) {
  const W = 320, H = 132, PAD_T = 6, PAD_B = 16
  const plotH = H - PAD_T - PAD_B
  const mid = PAD_T + plotH / 2
  const pts = data.winProb
  const n = pts.length
  const x = (i: number) => (i / (n - 1)) * W
  const y = (pct: number) => PAD_T + (1 - pct) * plotH

  const { line, area, quarters } = useMemo(() => {
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join('')
    const area = `${line}L${W},${mid}L0,${mid}Z`
    // Where each quarter starts
    const quarters: { period: number; x: number }[] = []
    pts.forEach((p, i) => { if (!quarters.length || quarters[quarters.length - 1].period !== p.period) quarters.push({ period: p.period, x: x(i) }) })
    return { line, area, quarters }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts])

  const last = pts[n - 1].pct
  const leader = last >= 0.5 ? data.home : data.away
  const leaderPct = Math.round((last >= 0.5 ? last : 1 - last) * 100)
  const qLabel = (p: number) => (p <= 4 ? `Q${p}` : p === 5 ? 'OT' : `${p - 4}OT`)
  const id = `wp-${data.away.id}-${data.home.id}`

  return (
    <div>
      <SectionLabel>Win Probability</SectionLabel>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <img src={logo(leader)} alt="" className="w-6 h-6 object-contain" />
          <span className="font-cond font-black text-2xl text-white tabular-nums leading-none">{leaderPct}%</span>
          <span className="text-xs text-field-400">{data.state === 'post' ? (leaderPct === 100 ? `${leader.abbr} won` : 'at the end') : `${leader.abbr} to win`}</span>
        </div>
      </div>
      <div className="relative rounded-lg bg-field-950/60 border border-field-800 px-1 pt-1">
        {/* Which half is which */}
        <img src={logo(data.home)} alt="" className="absolute left-1.5 top-1.5 w-4 h-4 object-contain opacity-70" />
        <img src={logo(data.away)} alt="" className="absolute left-1.5 bottom-5 w-4 h-4 object-contain opacity-70" />
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" preserveAspectRatio="none" role="img"
             aria-label={`Win probability chart, ${leader.abbr} ${leaderPct}%`}>
          <defs>
            <clipPath id={`${id}-top`}><rect x="0" y="0" width={W} height={mid} /></clipPath>
            <clipPath id={`${id}-bot`}><rect x="0" y={mid} width={W} height={H - mid} /></clipPath>
          </defs>
          {/* 75/25 guides */}
          {[0.25, 0.75].map(g => (
            <line key={g} x1="0" x2={W} y1={y(g)} y2={y(g)} stroke="currentColor" className="text-field-800" strokeWidth="1" />
          ))}
          {quarters.slice(1).map(q => (
            <line key={q.period} x1={q.x} x2={q.x} y1={PAD_T} y2={PAD_T + plotH} stroke="currentColor" className="text-field-700" strokeDasharray="3 3" strokeWidth="1" />
          ))}
          <path d={area} fill={data.home.color} fillOpacity="0.28" clipPath={`url(#${id}-top)`} />
          <path d={area} fill={data.away.color} fillOpacity="0.28" clipPath={`url(#${id}-bot)`} />
          <line x1="0" x2={W} y1={mid} y2={mid} stroke="currentColor" className="text-field-500" strokeWidth="1" />
          <path d={line} fill="none" stroke="#F3F4F6" strokeWidth="1.75" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <circle cx={x(n - 1)} cy={y(last)} r="3" fill={leader.color} stroke="#fff" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
          {quarters.map((q, i) => {
            const next = quarters[i + 1]?.x ?? W
            return (
              <text key={q.period} x={(q.x + next) / 2} y={H - 3} textAnchor="middle"
                    className="fill-field-500" style={{ font: '600 9px system-ui' }}>
                {qLabel(q.period)}
              </text>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function ScoringTimeline({ data, logo }: { data: GameSummary; logo: (s: Side) => string }) {
  const byPeriod = new Map<number, ScoringPlay[]>()
  for (const s of data.scoringPlays) {
    if (!byPeriod.has(s.period)) byPeriod.set(s.period, [])
    byPeriod.get(s.period)!.push(s)
  }
  const periodName = (p: number) => (p <= 4 ? ['1st', '2nd', '3rd', '4th'][p - 1] + ' Quarter' : p === 5 ? 'Overtime' : `${p - 4}OT`)

  return (
    <div>
      <SectionLabel>Scoring</SectionLabel>
      <div className="space-y-3">
        {[...byPeriod].map(([period, plays]) => (
          <div key={period}>
            <div className="font-cond font-bold text-[10px] uppercase tracking-[0.2em] text-field-500 mb-1.5">{periodName(period)}</div>
            <div className="space-y-1.5">
              {plays.map(s => {
                const team = data[s.team]
                return (
                  <div key={s.id} className="flex items-start gap-2.5 rounded-lg bg-field-800/50 border-l-2 px-2.5 py-2" style={{ borderLeftColor: team.color }}>
                    <img src={logo(team)} alt="" className="w-6 h-6 object-contain shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-cond font-black text-[11px] uppercase tracking-wider px-1 rounded bg-field-700 text-white">{s.abbr || 'PTS'}</span>
                        <span className="text-[11px] text-field-400 tabular-nums">{s.clock}</span>
                      </div>
                      <div className="text-[13px] text-field-100 leading-snug mt-0.5">{s.text}</div>
                    </div>
                    <div className="font-cond font-black text-base tabular-nums shrink-0 text-right leading-tight">
                      <span className={s.team === 'away' ? 'text-white' : 'text-field-500'}>{s.awayScore}</span>
                      <span className="text-field-600">-</span>
                      <span className={s.team === 'home' ? 'text-white' : 'text-field-500'}>{s.homeScore}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Team Stats tab ────────────────────────────────────────────

function StatBar({ s, awayColor, homeColor }: { s: TeamStatLine; awayColor: string; homeColor: string }) {
  const a = s.awayN, h = s.homeN
  const total = a != null && h != null ? a + h : 0
  const awayShare = total > 0 ? a! / total : 0.5
  const better = a == null || h == null || a === h ? null
    : (s.lowerWins ? a < h : a > h) ? 'away' : 'home'
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className={clsx('font-bold tabular-nums', better === 'away' ? 'text-white' : 'text-field-300')}>{s.away}</span>
        <span className="text-[11px] text-field-400 font-cond font-bold uppercase tracking-wider">{s.label}</span>
        <span className={clsx('font-bold tabular-nums', better === 'home' ? 'text-white' : 'text-field-300')}>{s.home}</span>
      </div>
      {total > 0 && (
        <div className="flex h-1.5 mt-1 gap-0.5">
          <div className="flex-1 flex justify-end bg-field-800 rounded-l-full overflow-hidden">
            <div className="h-full rounded-l-full" style={{ width: `${awayShare * 100}%`, background: awayColor, opacity: better === 'home' ? 0.45 : 1 }} />
          </div>
          <div className="flex-1 bg-field-800 rounded-r-full overflow-hidden">
            <div className="h-full rounded-r-full" style={{ width: `${(1 - awayShare) * 100}%`, background: homeColor, opacity: better === 'away' ? 0.45 : 1 }} />
          </div>
        </div>
      )}
    </div>
  )
}
