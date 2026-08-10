import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Trophy, Calendar, Users, BarChart2, Star, MapPin, Award } from 'lucide-react'
import clsx from 'clsx'
import { CFB_HISTORY, NFL_HISTORY } from './teamHistory'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

async function proxyFetch(endpoint: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ endpoint, ...params })
  const r = await fetch(`${SUPABASE_URL}/functions/v1/sportsdata?${qs}`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }
  })
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
}

type Tab = 'overview' | 'schedule' | 'roster' | 'history'

interface TeamPageProps {
  teamId: string
  league: 'NFL' | 'CFB'
  onBack: () => void
}

// Parse schedule event into a clean game row
function parseEvent(ev: any, teamId: string, league: 'NFL' | 'CFB') {
  const comp = ev.competitions?.[0] ?? ev
  const home = comp.competitors?.find((c: any) => c.homeAway === 'home')
  const away = comp.competitors?.find((c: any) => c.homeAway === 'away')
  const isHome = home?.team?.id === teamId || home?.id === teamId
  const opp = isHome ? away : home
  const us  = isHome ? home : away

  const statusType = comp.status?.type?.name ?? ev.status?.type?.name ?? ''
  const isFinal = statusType.toLowerCase().includes('final') || statusType.toLowerCase().includes('complete')
  const isLive  = statusType.toLowerCase().includes('progress')
  const usScore  = parseInt(us?.score  ?? '0') || 0
  const oppScore = parseInt(opp?.score ?? '0') || 0
  const result = isFinal
    ? usScore > oppScore ? 'W' : usScore < oppScore ? 'L' : 'T'
    : null

  return {
    id:         ev.id,
    date:       ev.date ?? comp.date,
    shortName:  ev.shortName ?? ev.name ?? '',
    week:       ev.week?.number ?? ev.week?.text ?? '',
    isHome,
    isNeutral:  comp.neutralSite ?? false,
    oppAbbr:    opp?.team?.abbreviation ?? opp?.abbreviation ?? '??',
    oppName:    opp?.team?.displayName ?? opp?.displayName ?? 'TBD',
    oppLogo:    opp?.team?.logo ?? opp?.logo ?? null,
    usScore,
    oppScore,
    isFinal,
    isLive,
    result,
    venue:      comp.venue?.fullName ?? null,
    broadcast:  comp.broadcasts?.[0]?.names?.[0] ?? null,
  }
}

export function TeamPage({ teamId, league, onBack }: TeamPageProps) {
  const [tab, setTab] = useState<Tab>('overview')
  const [schedSeason, setSchedSeason] = useState(2026)
  const [imgErr, setImgErr] = useState(false)

  const infoEndpoint = `${league.toLowerCase()}/teams/${teamId}/info`
  const { data: info, isLoading: infoLoading } = useQuery({
    queryKey: ['team-info', league, teamId],
    queryFn: () => proxyFetch(infoEndpoint),
    staleTime: 10 * 60_000,
  })

  const { data: schedule, isLoading: schedLoading } = useQuery({
    queryKey: ['team-schedule', league, teamId, schedSeason],
    queryFn: () => proxyFetch(`${league.toLowerCase()}/teams/${teamId}/schedule`, {
      season: String(schedSeason), seasontype: '2',
    }),
    staleTime: 5 * 60_000,
    enabled: tab === 'schedule' || tab === 'overview',
  })

  const { data: rosterData, isLoading: rosterLoading } = useQuery({
    queryKey: ['team-roster', league, teamId],
    queryFn: () => proxyFetch(`${league.toLowerCase()}/teams/${teamId}/roster`),
    staleTime: 30 * 60_000,
    enabled: tab === 'roster',
  })

  const team = info?.team
  const logo  = team?.logos?.find((l: any) => l.rel?.includes('default'))?.href
             ?? team?.logos?.[0]?.href
             ?? team?.logo
  const darkLogo = team?.logos?.find((l: any) => l.rel?.includes('dark'))?.href
  const color  = team?.color ? `#${team.color}` : '#374151'
  const altColor = team?.alternateColor ? `#${team.alternateColor}` : '#1f2937'
  const displayName = team?.displayName ?? '—'
  const location    = team?.location ?? ''
  const confGroup   = team?.groups
  const record      = team?.record?.items?.find((r: any) => r.type === 'total')?.summary
                   ?? team?.recordSummary ?? '—'
  const standing    = team?.standingSummary ?? ''
  const franchise   = team?.franchise

  const games = useMemo(() =>
    (schedule?.events ?? []).map((ev: any) => parseEvent(ev, teamId, league)),
    [schedule, teamId, league]
  )

  const history = league === 'CFB'
    ? CFB_HISTORY[teamId]
    : NFL_HISTORY[teamId]

  const wins   = games.filter(g => g.result === 'W').length
  const losses = games.filter(g => g.result === 'L').length
  const upcoming = games.filter(g => !g.isFinal && !g.isLive).slice(0, 1)[0]

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview',  label: 'Overview',  icon: Star },
    { id: 'schedule',  label: 'Schedule',  icon: Calendar },
    { id: 'roster',    label: 'Roster',    icon: Users },
    { id: 'history',   label: 'History',   icon: Trophy },
  ]

  if (infoLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-48 rounded-2xl bg-field-800" />
        <div className="h-8 w-48 rounded bg-field-800" />
        <div className="h-4 w-32 rounded bg-field-800" />
      </div>
    )
  }

  return (
    <div className="space-y-0 max-w-4xl mx-auto">

      {/* ── Back button ── */}
      <button onClick={onBack}
        className="flex items-center gap-2 text-field-400 hover:text-white text-sm mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* ── Hero banner ── */}
      <div
        className="relative rounded-2xl overflow-hidden p-6 flex items-end gap-5 min-h-[160px]"
        style={{ background: `linear-gradient(135deg, ${color}dd 0%, ${altColor}aa 100%)` }}
      >
        {/* Background watermark logo */}
        {logo && (
          <img src={darkLogo ?? logo} alt="" aria-hidden
            className="absolute right-4 top-1/2 -translate-y-1/2 w-40 h-40 object-contain opacity-10 pointer-events-none select-none" />
        )}

        {/* Team logo */}
        <div className="relative shrink-0 w-20 h-20 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
          {logo && !imgErr
            ? <img src={logo} alt={displayName} className="w-16 h-16 object-contain"
                onError={() => setImgErr(true)} />
            : <span className="text-2xl font-black text-white">{team?.abbreviation ?? '?'}</span>
          }
        </div>

        {/* Team info */}
        <div className="relative flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={clsx(
              'text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded',
              league === 'NFL' ? 'bg-nfl/30 text-nfl' : 'bg-cfb/30 text-cfb'
            )}>{league}</span>
            {standing && <span className="text-xs text-white/60">{standing}</span>}
          </div>
          <h1 className="text-2xl font-black text-white leading-tight truncate">{displayName}</h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {location && (
              <span className="flex items-center gap-1 text-white/70 text-xs">
                <MapPin className="w-3 h-3" />{location}
              </span>
            )}
            {record !== '—' && (
              <span className="text-white/70 text-xs font-bold">{record} {wins > 0 || losses > 0 ? `(${wins}W-${losses}L this season)` : ''}</span>
            )}
            {franchise?.venue?.fullName && (
              <span className="text-white/60 text-xs">{franchise.venue.fullName} · {franchise.venue.address?.city}, {franchise.venue.address?.state}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-field-800 mt-4 gap-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors -mb-px',
              tab === t.id
                ? 'border-gold text-gold'
                : 'border-transparent text-field-400 hover:text-white'
            )}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="pt-4 space-y-4">

        {/* ══ OVERVIEW ══ */}
        {tab === 'overview' && (
          <div className="space-y-4">

            {/* Next game */}
            {upcoming && (
              <div className="panel space-y-1">
                <div className="text-xs font-black uppercase tracking-wider text-field-400">Next Game</div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white">{upcoming.shortName}</div>
                    <div className="text-xs text-field-400">
                      {new Date(upcoming.date).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}
                      {upcoming.venue && ` · ${upcoming.venue}`}
                      {upcoming.broadcast && ` · ${upcoming.broadcast}`}
                    </div>
                  </div>
                  {upcoming.week && <span className="text-xs text-field-500">Week {upcoming.week}</span>}
                </div>
              </div>
            )}

            {/* Season results so far */}
            {games.filter(g => g.isFinal).length > 0 && (
              <div className="panel space-y-3">
                <div className="text-xs font-black uppercase tracking-wider text-field-400">
                  {schedSeason} Results
                </div>
                <div className="space-y-2">
                  {games.filter(g => g.isFinal).map(g => (
                    <div key={g.id} className="flex items-center gap-3">
                      <span className={clsx('w-6 text-center text-xs font-black',
                        g.result === 'W' ? 'text-emerald-400' : g.result === 'L' ? 'text-red-400' : 'text-field-400'
                      )}>{g.result}</span>
                      {g.oppLogo && <img src={g.oppLogo} alt={g.oppAbbr} className="w-5 h-5 object-contain" />}
                      <span className="text-sm text-white flex-1">{g.isHome ? 'vs' : '@'} {g.oppName}</span>
                      <span className="text-sm font-bold tabular-nums text-white">{g.usScore}–{g.oppScore}</span>
                      <span className="text-xs text-field-500 w-12 text-right">Wk {g.week}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* History snapshot */}
            {history && (
              <div className="panel space-y-3">
                <div className="text-xs font-black uppercase tracking-wider text-field-400">All-Time Achievements</div>
                {league === 'CFB' && 'heismans' in history && (
                  <>
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-gold" />
                      <span className="text-sm font-bold text-white">
                        {(history as any).heismans.length} Heisman{(history as any).heismans.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-gold" />
                      <span className="text-sm font-bold text-white">
                        {(history as any).natChamps.length} National Championship{(history as any).natChamps.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </>
                )}
                {league === 'NFL' && 'superBowls' in history && (
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-gold" />
                    <span className="text-sm font-bold text-white">
                      {(history as any).superBowls.length} Super Bowl{(history as any).superBowls.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ SCHEDULE ══ */}
        {tab === 'schedule' && (
          <div className="space-y-3">
            {/* Season picker */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-field-400 font-bold uppercase tracking-wider">Season</span>
              <div className="flex gap-1">
                {[2024, 2025, 2026].map(yr => (
                  <button key={yr} onClick={() => setSchedSeason(yr)}
                    className={clsx('px-3 py-1 rounded-lg text-sm font-bold transition-colors',
                      schedSeason === yr ? 'bg-gold text-field-900' : 'bg-field-800 text-field-300 hover:text-white')}>
                    {yr}
                  </button>
                ))}
              </div>
              {schedLoading && <div className="w-4 h-4 border-2 border-field-600 border-t-gold rounded-full animate-spin" />}
            </div>

            {games.length === 0 && !schedLoading && (
              <div className="panel text-center py-10 text-field-400 text-sm">
                No schedule data for {schedSeason}
              </div>
            )}

            <div className="space-y-1.5">
              {games.map(g => (
                <div key={g.id}
                  className={clsx('panel flex items-center gap-3 py-2.5',
                    g.isLive && 'border-red-500/40 bg-red-500/5'
                  )}>
                  {/* Week */}
                  <span className="text-xs text-field-500 w-10 shrink-0 text-center">Wk {g.week}</span>

                  {/* Opponent logo */}
                  {g.oppLogo
                    ? <img src={g.oppLogo} alt={g.oppAbbr} className="w-7 h-7 object-contain shrink-0" />
                    : <div className="w-7 h-7 rounded-full bg-field-700 flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-black text-field-400">{g.oppAbbr}</span>
                      </div>
                  }

                  {/* Matchup */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                      {g.isNeutral ? 'vs' : g.isHome ? 'vs' : '@'} {g.oppName}
                    </div>
                    <div className="text-xs text-field-500">
                      {new Date(g.date).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}
                      {g.venue && ` · ${g.venue}`}
                    </div>
                  </div>

                  {/* Result / time */}
                  {g.isFinal ? (
                    <div className="text-right shrink-0">
                      <span className={clsx('text-xs font-black mr-1.5',
                        g.result === 'W' ? 'text-emerald-400' : g.result === 'L' ? 'text-red-400' : 'text-field-400'
                      )}>{g.result}</span>
                      <span className="text-sm font-bold text-white tabular-nums">{g.usScore}–{g.oppScore}</span>
                    </div>
                  ) : g.isLive ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                      <span className="text-xs font-bold text-red-400">Live</span>
                    </div>
                  ) : (
                    <span className="text-xs text-field-400 shrink-0">
                      {new Date(g.date).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ ROSTER ══ */}
        {tab === 'roster' && (
          <div className="space-y-3">
            {rosterLoading && (
              <div className="space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="h-10 rounded-xl bg-field-800 animate-pulse" />
                ))}
              </div>
            )}
            {!rosterLoading && (
              <div className="space-y-4">
                {/* Group by position */}
                {(['QB','RB','WR','TE','OL','DL','LB','DB','K','P','ST'] as const).map(pos => {
                  const players = (rosterData?.athletes ?? [])
                    .flatMap((g: any) => g.items ?? g.athletes ?? [])
                    .filter((a: any) => a.position?.abbreviation === pos || a.position?.parentPosition === pos)
                  if (!players.length) return null
                  return (
                    <div key={pos}>
                      <div className="text-xs font-black uppercase tracking-wider text-field-400 mb-2">{pos}</div>
                      <div className="space-y-1">
                        {players.map((a: any) => (
                          <div key={a.id} className="flex items-center gap-3 py-1.5 border-b border-field-800/50">
                            <span className="text-xs text-field-500 w-8 text-right">{a.jersey ?? '—'}</span>
                            {a.headshot?.href
                              ? <img src={a.headshot.href} alt={a.fullName} className="w-7 h-7 rounded-full object-cover shrink-0" />
                              : <div className="w-7 h-7 rounded-full bg-field-700 shrink-0" />
                            }
                            <span className="text-sm text-white font-bold flex-1 truncate">{a.fullName ?? a.displayName}</span>
                            <span className="text-xs text-field-500">{a.displayHeight} · {a.displayWeight}</span>
                            {a.experience?.displayValue && (
                              <span className="text-xs text-field-600">{a.experience.displayValue.charAt(0)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ HISTORY ══ */}
        {tab === 'history' && (
          <div className="space-y-4">
            {!history && (
              <div className="panel text-center py-10 text-field-400 text-sm">
                Historical data not available for this team.
              </div>
            )}

            {/* CFB History */}
            {league === 'CFB' && history && 'heismans' in history && (
              <>
                {/* National Championships */}
                {(history as any).natChamps.length > 0 && (
                  <div className="panel space-y-3">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-gold" />
                      <span className="font-black text-white">National Championships ({(history as any).natChamps.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(history as any).natChamps.map((yr: number) => (
                        <span key={yr} className="px-2.5 py-1 rounded-lg bg-gold/10 border border-gold/30 text-gold text-sm font-bold">
                          {yr}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Heisman Winners */}
                {(history as any).heismans.length > 0 && (
                  <div className="panel space-y-3">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-gold" />
                      <span className="font-black text-white">Heisman Trophy Winners ({(history as any).heismans.length})</span>
                    </div>
                    <div className="space-y-2">
                      {(history as any).heismans.map((h: any) => (
                        <div key={h.year} className="flex items-center justify-between py-1 border-b border-field-800/50">
                          <span className="text-white font-bold">{h.name}</span>
                          <span className="text-field-400 text-sm">{h.year}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(history as any).natChamps.length === 0 && (history as any).heismans.length === 0 && (
                  <div className="panel text-center py-10 text-field-400 text-sm">
                    No championships or Heisman winners on record.
                  </div>
                )}
              </>
            )}

            {/* NFL History */}
            {league === 'NFL' && history && 'superBowls' in history && (
              <>
                {(history as any).superBowls.length > 0 ? (
                  <div className="panel space-y-3">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-gold" />
                      <span className="font-black text-white">Super Bowl Wins ({(history as any).superBowls.length})</span>
                    </div>
                    <div className="space-y-3">
                      {(history as any).superBowls.map((sb: any, i: number) => {
                        const mvp = (history as any).mvps?.[i]
                        return (
                          <div key={sb.year} className="flex items-start justify-between py-2 border-b border-field-800/50">
                            <div>
                              <div className="text-white font-bold">{sb.year} — vs {sb.opponent}</div>
                              <div className="text-sm text-field-400">Final: {sb.score}</div>
                              {mvp && <div className="text-xs text-gold mt-0.5">MVP: {mvp.name}</div>}
                            </div>
                            <span className="text-gold font-black text-sm">SB {romanize((history as any).superBowls.filter((_: any, j: number) => j <= i).length + previousSBCount(teamId))}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="panel text-center py-10 text-field-400 text-sm">
                    No Super Bowl wins on record.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Roman numeral helper for Super Bowl numbering
function romanize(n: number): string {
  const vals = [50,40,10,9,5,4,1]
  const syms = ['L','XL','X','IX','V','IV','I']
  let result = ''
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { result += syms[i]; n -= vals[i] }
  }
  return result
}

// Super Bowl count before a team's first win (for sequential numbering)
function previousSBCount(_teamId: string): number { return 0 }
