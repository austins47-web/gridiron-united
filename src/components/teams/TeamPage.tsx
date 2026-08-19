import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Trophy, Calendar, Users, MapPin, Award, Medal, LayoutDashboard } from 'lucide-react'
import clsx from 'clsx'
import { NFL_AWARDS, CFB_AWARDS } from './teamAwards'
import { CURRENT_SEASON } from '@/lib/season'

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
  const [imgErr, setImgErr] = useState(false)
  const SEASON = CURRENT_SEASON

  const infoEndpoint = `${league.toLowerCase()}/teams/${teamId}/info`
  const { data: info, isLoading: infoLoading } = useQuery({
    queryKey: ['team-info', league, teamId],
    queryFn: () => proxyFetch(infoEndpoint),
    staleTime: 10 * 60_000,
  })

  const { data: schedule, isLoading: schedLoading } = useQuery({
    queryKey: ['team-schedule', league, teamId, SEASON],
    queryFn: async () => {
      if (league === 'NFL') {
        // Merge preseason (type 1) + regular season (type 2)
        const [preJson, regJson] = await Promise.all([
          proxyFetch(`nfl/teams/${teamId}/schedule`, { season: String(SEASON), seasontype: '1' }),
          proxyFetch(`nfl/teams/${teamId}/schedule`, { season: String(SEASON), seasontype: '2' }),
        ])
        const preEvents = (preJson?.events ?? []).map((e: any) => ({ ...e, _seasonType: 1 }))
        const regEvents = (regJson?.events ?? []).map((e: any) => ({ ...e, _seasonType: 2 }))
        const merged = [...preEvents, ...regEvents].sort(
          (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
        )
        return { ...regJson, events: merged }
      }
      // CFB: W0 + regular (deduplicated)
      const [w0Json, regJson] = await Promise.all([
        proxyFetch(`cfb/teams/${teamId}/schedule`, { season: String(SEASON), seasontype: '2', week: '0' }).catch(() => ({ events: [] })),
        proxyFetch(`cfb/teams/${teamId}/schedule`, { season: String(SEASON), seasontype: '2' }),
      ])
      const seen = new Set<string>()
      const merged = [
        ...(w0Json?.events ?? []).map((e: any) => ({ ...e, _week0: true })),
        ...(regJson?.events ?? []),
      ]
        .filter((e: any) => { if (seen.has(e.id)) return false; seen.add(e.id); return true })
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      return { ...regJson, events: merged }
    },
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

  const awards = league === 'CFB'
    ? CFB_AWARDS[teamId]
    : NFL_AWARDS[teamId]

  const wins   = games.filter(g => g.result === 'W').length
  const losses = games.filter(g => g.result === 'L').length
  const upcoming = games.filter(g => !g.isFinal && !g.isLive).slice(0, 1)[0]

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview',  label: 'Overview',  icon: LayoutDashboard },
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
    <div className="space-y-0 max-w-4xl mx-auto min-w-0">

      {/* ── Back button ── */}
      <button onClick={onBack}
        className="flex items-center gap-2 text-field-400 hover:text-white text-sm mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* ── Hero banner ── */}
      <div
        className="relative rounded-2xl overflow-hidden p-4 sm:p-6 flex items-end gap-4 sm:gap-5"
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
      <div className="flex border-b border-field-800 mt-4 gap-0 overflow-x-auto">
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
                  {SEASON} Results
                </div>
                <div className="space-y-2">
                  {games.filter(g => g.isFinal).map(g => (
                    <div key={g.id} className="flex items-center gap-3">
                      <span className={clsx('w-6 text-center text-xs font-black',
                        g.result === 'W' ? 'text-gold' : g.result === 'L' ? 'text-red-400' : 'text-field-400'
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
            {awards && (
              <div className="panel space-y-2">
                <div className="text-xs font-black uppercase tracking-wider text-field-400">All-Time Achievements</div>
                {league === 'CFB' && (
                  <div className="grid grid-cols-2 gap-2">
                    {(awards as any).natChamps?.length > 0 && <div className="flex items-center gap-2"><Trophy className="w-4 h-4 text-gold shrink-0"/><span className="text-sm text-white font-bold">{(awards as any).natChamps.length} Nat. Championships</span></div>}
                    {(awards as any).heismans?.length > 0 && <div className="flex items-center gap-2"><Award className="w-4 h-4 text-gold shrink-0"/><span className="text-sm text-white font-bold">{(awards as any).heismans.length} Heismans</span></div>}
                    {(awards as any).outland?.length > 0 && <div className="flex items-center gap-2"><Medal className="w-4 h-4 text-gold shrink-0"/><span className="text-sm text-white">{(awards as any).outland.length} Outland</span></div>}
                    {(awards as any).biletnikoff?.length > 0 && <div className="flex items-center gap-2"><Medal className="w-4 h-4 text-gold shrink-0"/><span className="text-sm text-white">{(awards as any).biletnikoff.length} Biletnikoff</span></div>}
                    {(awards as any).butkus?.length > 0 && <div className="flex items-center gap-2"><Medal className="w-4 h-4 text-gold shrink-0"/><span className="text-sm text-white">{(awards as any).butkus.length} Butkus</span></div>}
                  </div>
                )}
                {league === 'NFL' && (
                  <div className="grid grid-cols-2 gap-2">
                    {(awards as any).superBowls?.length > 0 && <div className="flex items-center gap-2"><Trophy className="w-4 h-4 text-gold shrink-0"/><span className="text-sm text-white font-bold">{(awards as any).superBowls.length} Super Bowls</span></div>}
                    {(awards as any).mvp?.length > 0 && <div className="flex items-center gap-2"><Award className="w-4 h-4 text-gold shrink-0"/><span className="text-sm text-white font-bold">{(awards as any).mvp.length} MVPs</span></div>}
                    {(awards as any).opoy?.length > 0 && <div className="flex items-center gap-2"><Medal className="w-4 h-4 text-gold shrink-0"/><span className="text-sm text-white">{(awards as any).opoy.length} Offensive POY</span></div>}
                    {(awards as any).dpoy?.length > 0 && <div className="flex items-center gap-2"><Medal className="w-4 h-4 text-gold shrink-0"/><span className="text-sm text-white">{(awards as any).dpoy.length} Defensive POY</span></div>}
                    {(awards as any).wpmoty?.length > 0 && <div className="flex items-center gap-2"><Medal className="w-4 h-4 text-gold shrink-0"/><span className="text-sm text-white">{(awards as any).wpmoty.length} Walter Payton MOY</span></div>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ SCHEDULE ══ */}
        {tab === 'schedule' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-field-400 font-bold uppercase tracking-wider">{SEASON} Season Schedule</span>
              {schedLoading && <div className="w-3.5 h-3.5 border-2 border-field-600 border-t-gold rounded-full animate-spin" />}
            </div>

            {games.length === 0 && !schedLoading && (
              <div className="panel text-center py-10 text-field-400 text-sm">
                Schedule not yet available for {SEASON}
              </div>
            )}

            <div className="space-y-1.5">
              {games.map(g => (
                <div key={g.id}
                  className={clsx('panel flex items-center gap-3 py-2.5',
                    g.isLive && 'border-red-500/40 bg-red-500/5'
                  )}>
                  {/* Week */}
                  <span className={clsx(
                    'text-xs font-bold w-12 shrink-0 text-center',
                    (g as any)._seasonType === 1 ? 'text-cfb'
                    : (g as any)._week0 ? 'text-sky-400'
                    : 'text-field-500'
                  )}>
                    {(g as any)._seasonType === 1
                      ? (g.week === 0 ? 'HOF' : `PRE${g.week}`)
                      : (g as any)._week0
                      ? 'W0'
                      : `Wk ${g.week}`}
                  </span>

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
                        g.result === 'W' ? 'text-gold' : g.result === 'L' ? 'text-red-400' : 'text-field-400'
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
                {/* Flatten all ESPN roster groups (offense/defense/specialTeam) then re-group by position */}
                {(() => {
                  const allPlayers: any[] = (rosterData?.athletes ?? [])
                    .flatMap((g: any) => g.items ?? g.athletes ?? [])

                  // Group by normalized position
                  const grouped: Record<string, any[]> = {}
                  for (const a of allPlayers) {
                    const grp = posGroup(a.position?.abbreviation ?? '')
                    if (!grouped[grp]) grouped[grp] = []
                    grouped[grp].push(a)
                  }

                  return POS_ORDER.filter(pos => grouped[pos]?.length > 0).map(pos => (
                    <div key={pos}>
                      <div className="text-xs font-black uppercase tracking-wider text-field-400 mb-2">
                        {pos === 'OL' ? 'Offensive Line' : pos === 'DL' ? 'Defensive Line' : pos === 'DB' ? 'Defensive Backs' : pos === 'LB' ? 'Linebackers' : pos === 'ST' ? 'Special Teams' : pos}
                      </div>
                      <div className="space-y-1">
                        {grouped[pos].sort((a, b) => parseInt(a.jersey ?? '99') - parseInt(b.jersey ?? '99')).map((a: any) => (
                          <div key={a.id} className="flex items-center gap-3 py-1.5 border-b border-field-800/50">
                            <span className="text-xs text-field-500 w-8 text-right font-mono">{a.jersey ?? '—'}</span>
                            {a.headshot?.href
                              ? <img src={a.headshot.href} alt={a.fullName} className="w-7 h-7 rounded-full object-cover shrink-0" />
                              : <div className="w-7 h-7 rounded-full bg-field-700 shrink-0 flex items-center justify-center">
                                  <span className="text-[9px] text-field-500 font-black">{a.position?.abbreviation}</span>
                                </div>
                            }
                            <span className="text-sm text-white font-bold flex-1 truncate">{a.fullName ?? a.displayName}</span>
                            <span className="text-xs text-field-500 hidden sm:block">{a.displayHeight} · {a.displayWeight}</span>
                            <span className="text-[10px] text-field-600 shrink-0">{a.position?.abbreviation}</span>
                            {a.experience?.displayValue && (
                              <span className="text-[10px] text-field-600 w-6 text-center shrink-0">{a.experience.displayValue.charAt(0)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            )}
          </div>
        )}

        {/* ══ HISTORY ══ */}
        {tab === 'history' && (
          <div className="space-y-4">
            {!awards && (
              <div className="panel text-center py-10 text-field-400 text-sm">
                Historical data not available for this team.
              </div>
            )}

            {awards && league === 'CFB' && (() => {
              const a = awards as any
              return (
                <>
                  {/* National Championships */}
                  {a.natChamps?.length > 0 && (
                    <AwardBlock icon={<Trophy className="w-4 h-4 text-gold"/>} title={`National Championships (${a.natChamps.length})`}>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {a.natChamps.map((yr: number) => (
                          <span key={yr} className="px-2.5 py-1 rounded-lg bg-gold/10 border border-gold/30 text-gold text-sm font-bold">{yr}</span>
                        ))}
                      </div>
                    </AwardBlock>
                  )}
                  {a.heismans?.length > 0 && <AwardList icon={<Award className="w-4 h-4 text-gold"/>} title={`Heisman Trophy (${a.heismans.length})`} items={a.heismans} />}
                  {a.maxwell?.length > 0 && <AwardList icon={<Medal className="w-4 h-4 text-gold"/>} title={`Maxwell Award — College Player of the Year (${a.maxwell.length})`} items={a.maxwell} />}
                  {a.walterCamp?.length > 0 && <AwardList icon={<Medal className="w-4 h-4 text-gold"/>} title={`Walter Camp Award — Player of the Year (${a.walterCamp.length})`} items={a.walterCamp} />}
                  {a.daveyOBrien?.length > 0 && <AwardList icon={<Medal className="w-4 h-4 text-gold"/>} title={`Davey O'Brien Award — Best QB (${a.daveyOBrien.length})`} items={a.daveyOBrien} />}
                  {a.doakWalker?.length > 0 && <AwardList icon={<Medal className="w-4 h-4 text-gold"/>} title={`Doak Walker Award — Best RB (${a.doakWalker.length})`} items={a.doakWalker} />}
                  {a.biletnikoff?.length > 0 && <AwardList icon={<Medal className="w-4 h-4 text-gold"/>} title={`Biletnikoff Award — Best Receiver (${a.biletnikoff.length})`} items={a.biletnikoff} />}
                  {a.outland?.length > 0 && <AwardList icon={<Medal className="w-4 h-4 text-gold"/>} title={`Outland Trophy — Best Interior Lineman (${a.outland.length})`} items={a.outland} />}
                  {a.butkus?.length > 0 && <AwardList icon={<Medal className="w-4 h-4 text-gold"/>} title={`Dick Butkus Award — Best Linebacker (${a.butkus.length})`} items={a.butkus} />}
                  {a.bednarik?.length > 0 && <AwardList icon={<Medal className="w-4 h-4 text-gold"/>} title={`Bednarik Award — Defensive Player of the Year (${a.bednarik.length})`} items={a.bednarik} />}
                  {a.nagurski?.length > 0 && <AwardList icon={<Medal className="w-4 h-4 text-gold"/>} title={`Nagurski Trophy — Defensive Player of the Year (${a.nagurski.length})`} items={a.nagurski} />}
                  {a.jimThorpe?.length > 0 && <AwardList icon={<Medal className="w-4 h-4 text-gold"/>} title={`Jim Thorpe Award — Best Defensive Back (${a.jimThorpe.length})`} items={a.jimThorpe} />}
                  {!a.natChamps?.length && !a.heismans?.length && !a.maxwell?.length && !a.outland?.length && !a.biletnikoff?.length && (
                    <div className="panel text-center py-10 text-field-400 text-sm">No major award data on record.</div>
                  )}
                </>
              )
            })()}

            {awards && league === 'NFL' && (() => {
              const a = awards as any
              return (
                <>
                  {/* Super Bowls */}
                  {a.superBowls?.length > 0 && (
                    <AwardBlock icon={<Trophy className="w-4 h-4 text-gold"/>} title={`Super Bowl Wins (${a.superBowls.length})`}>
                      <div className="space-y-3">
                        {a.superBowls.map((sb: any, i: number) => {
                          const mvp = a.sbMvps?.[i]
                          return (
                            <div key={sb.year} className="flex items-start justify-between py-2 border-b border-field-800/50">
                              <div>
                                <div className="text-white font-bold">{sb.year} — vs {sb.opponent}</div>
                                <div className="text-sm text-field-400">Final: {sb.score}</div>
                                {mvp && <div className="text-xs text-gold mt-0.5">Super Bowl MVP: {mvp.name}</div>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </AwardBlock>
                  )}
                  {a.mvp?.length > 0 && <AwardList icon={<Award className="w-4 h-4 text-gold"/>} title={`AP MVP (${a.mvp.length})`} items={a.mvp} />}
                  {a.opoy?.length > 0 && <AwardList icon={<Medal className="w-4 h-4 text-gold"/>} title={`Offensive Player of the Year (${a.opoy.length})`} items={a.opoy} />}
                  {a.dpoy?.length > 0 && <AwardList icon={<Medal className="w-4 h-4 text-gold"/>} title={`Defensive Player of the Year (${a.dpoy.length})`} items={a.dpoy} />}
                  {a.oroty?.length > 0 && <AwardList icon={<Medal className="w-4 h-4 text-gold"/>} title={`Offensive Rookie of the Year (${a.oroty.length})`} items={a.oroty} />}
                  {a.droty?.length > 0 && <AwardList icon={<Medal className="w-4 h-4 text-gold"/>} title={`Defensive Rookie of the Year (${a.droty.length})`} items={a.droty} />}
                  {a.wpmoty?.length > 0 && <AwardList icon={<Medal className="w-4 h-4 text-gold"/>} title={`Walter Payton Man of the Year (${a.wpmoty.length})`} items={a.wpmoty} />}
                  {!a.superBowls?.length && !a.mvp?.length && !a.dpoy?.length && !a.opoy?.length && (
                    <div className="panel text-center py-10 text-field-400 text-sm">No major award data on record.</div>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}

// Normalize ESPN position abbreviation → display group
function posGroup(abbr: string): string {
  switch (abbr) {
    case 'QB':                    return 'QB'
    case 'RB': case 'FB':        return 'RB'
    case 'WR':                    return 'WR'
    case 'TE':                    return 'TE'
    case 'OL': case 'OT': case 'G': case 'C': case 'LS': return 'OL'
    case 'DL': case 'DE': case 'DT': case 'NT':           return 'DL'
    case 'LB': case 'ILB': case 'OLB':                    return 'LB'
    case 'DB': case 'CB': case 'S': case 'SS': case 'FS': return 'DB'
    case 'K': case 'PK':          return 'K'
    case 'P':                     return 'P'
    default:                      return 'ST'
  }
}

const POS_ORDER = ['QB','RB','WR','TE','OL','DL','LB','DB','K','P','ST']

// ── Award display helpers ─────────────────────────────────────
function AwardBlock({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="panel space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-black text-white text-sm">{title}</span>
      </div>
      {children}
    </div>
  )
}

function AwardList({ icon, title, items }: { icon: React.ReactNode; title: string; items: Array<{ year: number; name: string }> }) {
  return (
    <AwardBlock icon={icon} title={title}>
      <div className="space-y-0">
        {items.map((item, i) => (
          <div key={`${item.year}-${i}`} className="flex items-center justify-between py-1.5 border-b border-field-800/50 last:border-0">
            <span className="text-white font-bold text-sm">{item.name}</span>
            <span className="text-field-400 text-xs tabular-nums">{item.year}</span>
          </div>
        ))}
      </div>
    </AwardBlock>
  )
}
