import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { X, Newspaper, BarChart2, User, ExternalLink, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import type { Player } from '@/types/database'

// ── Helpers ───────────────────────────────────────────────────
function toEspnId(player: Player): number {
  // NFL: DB id = espnId + 1_000_000
  // CFB: use espn_athlete_id if available (populated post-resync)
  //      fallback: DB id - 50_000_000 (correct after resync since IDs are now 50000000 + athleteId)
  if (player.league === 'NFL') return player.id - 1_000_000
  return player.espn_athlete_id ?? (player.id - 50_000_000)
}

function headshotUrl(player: Player): string {
  const espnId = toEspnId(player)
  const sport = player.league === 'NFL' ? 'nfl' : 'college-football'
  return `https://a.espncdn.com/i/headshots/${sport}/players/full/${espnId}.png`
}

async function proxyFetch(endpoint: string) {
  const PROXY = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sportsdata`
  const ANON  = import.meta.env.VITE_SUPABASE_ANON_KEY
  const res = await fetch(`${PROXY}?endpoint=${encodeURIComponent(endpoint)}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

// ── Types ─────────────────────────────────────────────────────
interface AthleteProfile {
  displayName: string
  jersey?: string
  position?: string
  team?: string
  experience?: number
  age?: number
  height?: string
  weight?: string
  birthPlace?: string
  college?: string
  stats: Array<{ label: string; value: string }>
}

interface NewsItem { title: string; url: string; published: string; desc: string }

// ── Data fetchers ─────────────────────────────────────────────
async function fetchProfile(player: Player): Promise<AthleteProfile> {
  // CFB: call ESPN directly from the browser — browser isn't blocked, only server-side is
  if (player.league === 'CFB') {
    const espnId = toEspnId(player)
    const BASE = `https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes/${espnId}`

    let stats: Array<{ label: string; value: string }> = []
    let jersey: string | undefined, age: number | undefined
    let height: string | undefined, weight: string | undefined
    let birthPlace: string | undefined, college: string | undefined

    await Promise.allSettled([
      fetch(`${BASE}/stats`).then(async r => {
        if (!r.ok) return
        const sd = await r.json()
        const cats = sd.splits?.categories ?? sd.categories ?? []
        for (const cat of cats)
          for (const s of (cat.stats ?? []))
            if (s.displayValue && s.displayValue !== '0' && s.displayValue !== '--')
              stats.push({ label: s.displayName ?? s.name, value: s.displayValue })
      }),
      fetch(BASE).then(async r => {
        if (!r.ok) return
        const ad = await r.json()
        const a = ad.athlete ?? ad
        jersey = a.jersey; age = a.age; height = a.displayHeight; weight = a.displayWeight
        const bp = a.birthPlace
        birthPlace = bp?.city ? `${bp.city}${bp.state ? ', ' + bp.state : ''}` : undefined
        college = typeof a.college === 'string' ? a.college : a.college?.name
      }),
    ])

    return { displayName: player.name, jersey, position: player.pos, team: player.team, age, height, weight, birthPlace, college, stats }
  }

  const espnId = toEspnId(player)
  const data = await proxyFetch(`athlete/NFL/${espnId}`)
  const a = data.athlete ?? data

  let stats: Array<{ label: string; value: string }> = []
  try {
    const sd = await proxyFetch(`athlete/stats/NFL/${espnId}`)
    const cats = sd.splits?.categories ?? sd.categories ?? []
    for (const cat of cats) {
      for (const s of (cat.stats ?? [])) {
        if (s.displayValue && s.displayValue !== '0' && s.displayValue !== '--') {
          stats.push({ label: s.displayName ?? s.name, value: s.displayValue })
        }
      }
    }
  } catch { /* pre-season */ }

  const bp = a.birthPlace
  return {
    displayName: a.displayName ?? player.name,
    jersey:      a.jersey,
    position:    a.position?.displayName ?? a.position?.abbreviation ?? player.pos,
    team:        a.team?.displayName ?? a.team?.name ?? player.team,
    experience:  a.experience?.years ?? a.yearsExperience,
    age:         a.age,
    height:      a.displayHeight ?? (a.height ? String(a.height) : undefined),
    // displayWeight already includes "lbs"
    weight:      a.displayWeight ?? (a.weight ? `${a.weight} lbs` : undefined),
    birthPlace:  bp?.city ? `${bp.city}${bp.state ? ', ' + bp.state : bp.country ? ', ' + bp.country : ''}` : undefined,
    college:     typeof a.college === 'string' ? a.college : a.college?.name ?? a.college?.displayName,
    stats,
  }
}

function timeAgo(iso: string) {
  if (!iso) return ''
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Badge maps ────────────────────────────────────────────────
const CLASS_COLORS: Record<string, string> = {
  Freshman:  'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  Sophomore: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  Junior:    'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  Senior:    'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  Graduate:  'bg-field-500/30 text-field-200 border border-field-500/30',
}
const CLASS_SHORT: Record<string, string> = {
  Freshman: 'FR', Sophomore: 'SO', Junior: 'JR', Senior: 'SR', Graduate: 'GR',
}

// ── Component ─────────────────────────────────────────────────
type Tab = 'overview' | 'stats' | 'news'

export function PlayerProfileDrawer({ player, onClose, onTeamClick }: { player: Player; onClose: () => void; onTeamClick?: () => void }) {
  const [tab, setTab]       = useState<Tab>('overview')
  const [imgError, setImgError] = useState(false)

  // Lock page scroll while the drawer is open, so the list behind
  // it can't keep scrolling underneath the overlay.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const { data: profile, isLoading } = useQuery({
    queryKey: ['player-profile', player.id],
    queryFn:  () => fetchProfile(player),
    staleTime: 5 * 60_000,
    retry: 1,
  })

  // Pull player news from already-cached global feeds — no extra API call
  const qc = useQueryClient()
  const news: NewsItem[] = useMemo(() => {
    const espnId = toEspnId(player)
    const nameLower = player.name.toLowerCase()

    // NFL feed is cached as SDIONews[] under ['nfl-news', N]
    // CFB feed is cached as raw ESPN articles[] under ['cfb-news']
    const nflFeed: any[] = qc.getQueryData(['nfl-news', 300]) ?? []
    const cfbFeed: any[] = (qc.getQueryData(['cfb-news']) as any[]) ?? []

    const feed = player.league === 'NFL' ? nflFeed : cfbFeed

    const matched = feed.filter((a: any) => {
      // NFL articles: match EspnAthleteId field we now attach in proxy
      if (player.league === 'NFL') {
        if (a.EspnAthleteId && a.EspnAthleteId === espnId) return true
      }
      // CFB articles: match _espnAthleteId field
      if (player.league === 'CFB') {
        if (a._espnAthleteId && a._espnAthleteId === espnId) return true
      }
      // Fallback: name appears in headline or description
      const title = (a.Title ?? a.headline ?? '').toLowerCase()
      const desc  = (a.Content ?? a.description ?? '').toLowerCase()
      return title.includes(nameLower) || desc.includes(nameLower)
    })

    return matched.slice(0, 15).map((a: any) => ({
      title:     a.Title ?? a.headline ?? '',
      url:       a.Url ?? a.links?.web?.href ?? '',
      published: a.Updated ?? a.published ?? a.lastModified ?? '',
      desc:      a.Content ?? a.description ?? '',
    }))
  }, [player, qc])

  const dots = (
    <div className="flex justify-center py-10 gap-1">
      {[0,150,300].map(d => (
        <div key={d} className="w-2 h-2 rounded-full bg-field-500 animate-bounce" style={{ animationDelay: `${d}ms` }} />
      ))}
    </div>
  )

  // Rendered via a portal straight to document.body. Without this,
  // the drawer inherits its "fixed" positioning from whatever
  // ancestor happens to have a CSS transform — and AppShell's
  // .route-enter page-transition wrapper does (its animation's
  // final keyframe is transform: translateY(0), which per the CSS
  // spec still counts as "has a transform" even though it's a
  // visual no-op). That makes .route-enter a new containing block
  // for every fixed-position descendant, so "fixed to the viewport"
  // silently became "fixed to the top of the scrollable page
  // content" instead — if you'd scrolled down the player list
  // before opening this, the drawer rendered above your current
  // scroll position and you had to scroll back up to find it.
  // Portaling to document.body escapes that ancestor entirely.
  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-field-900 border-l border-field-700 flex flex-col shadow-2xl">

        {/* ── Banner + headshot ── */}
        <div className="relative shrink-0">
          <div className={clsx(
            'h-28 w-full',
            player.league === 'NFL'
              ? 'bg-gradient-to-br from-nfl/40 via-field-800 to-field-900'
              : 'bg-gradient-to-br from-cfb/40 via-field-800 to-field-900',
          )} />

          <button
            onClick={onClose}
            className="absolute top-3 right-3 bg-field-900/70 text-field-300 hover:text-white rounded-xl p-2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Large headshot overlapping banner */}
          <div className="absolute left-5 bottom-0 translate-y-1/2">
            <div className="w-28 h-28 rounded-2xl bg-field-800 border-2 border-field-700 overflow-hidden shadow-2xl flex items-center justify-center">
              {!imgError ? (
                <img
                  src={headshotUrl(player)}
                  alt={player.name}
                  className="w-full h-full object-cover object-top"
                  onError={() => setImgError(true)}
                />
              ) : (
                <User className="w-12 h-12 text-field-500" />
              )}
            </div>
          </div>
        </div>

        {/* ── Name / info row ── */}
        <div className="px-5 pt-16 pb-4 border-b border-field-700 shrink-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="font-cond font-black text-2xl text-white leading-none">{player.name}</h2>
            {profile?.jersey && (
              <span className="font-cond font-black text-xl text-field-500">#{profile.jersey}</span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={clsx(
              'font-cond font-bold text-xs px-1.5 py-0.5 rounded',
              player.league === 'NFL' ? 'bg-nfl/20 text-nfl' : 'bg-cfb/20 text-cfb',
            )}>{player.league}</span>
            <span className={`pos-badge pos-${player.pos}`}>{player.pos}</span>
            <span className="text-field-200 text-sm font-bold">{player.team}</span>
            {player.conference && (
              <span className="text-field-500 text-xs">· {player.conference}</span>
            )}
            {player.is_rookie && player.league === 'NFL' && (
              <span className="text-[12px] font-black bg-gold text-field-950 px-1.5 py-0.5 rounded">ROOKIE</span>
            )}
            {player.league === 'CFB' && player.depth_pos && CLASS_SHORT[player.depth_pos] && (
              <span className={`text-xs font-black px-1.5 py-0.5 rounded ${CLASS_COLORS[player.depth_pos]}`}>
                {CLASS_SHORT[player.depth_pos]} · {player.depth_pos}
              </span>
            )}
          </div>

          {player.status !== 'active' && (
            <div className="mt-3 bg-yellow-400/10 border border-yellow-400/20 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                <span className="text-sm text-yellow-400 font-bold capitalize">{player.status}</span>
              </div>
              {player.injury_note && (
                <p className="text-xs text-field-300 leading-relaxed">{player.injury_note}</p>
              )}
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-field-700 shrink-0">
          {([
            { id: 'overview', label: 'Overview', icon: User },
            { id: 'stats',    label: 'Stats',    icon: BarChart2 },
            { id: 'news',     label: 'News',     icon: Newspaper },
          ] as { id: Tab; label: string; icon: any }[]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id as Tab)}
              className={clsx(
                'flex items-center gap-1.5 flex-1 justify-center py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors',
                tab === id ? 'text-gold border-gold' : 'text-field-400 border-transparent hover:text-white',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Loading */}
          {isLoading && dots}

          {/* Overview */}
          {!isLoading && tab === 'overview' && (
            <div className="p-5 space-y-5">

              {/* Fantasy cards */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-field-400 mb-2">Fantasy</h3>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'ADP',       value: player.adp      ? player.adp.toFixed(1)      : '—' },
                    { label: 'Avg Pts',   value: player.avg_pts  ? player.avg_pts.toFixed(1)   : '—' },
                    { label: 'Projected', value: player.proj_pts ? player.proj_pts.toFixed(1)  : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-field-800 rounded-xl p-3 text-center border border-field-700">
                      <div className="font-cond font-black text-2xl text-white">{value}</div>
                      <div className="text-[12px] text-field-400 font-bold uppercase tracking-wider mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bio */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-field-400 mb-2">Bio</h3>
                <div className="bg-field-800 rounded-xl border border-field-700 divide-y divide-field-700/60">
                  {[
                    { label: 'Team',       value: profile?.team ?? player.team, onClick: onTeamClick },
                    { label: 'Position',   value: profile?.position ?? player.pos },
                    { label: 'Conference', value: player.conference },
                    { label: 'Class',      value: player.league === 'CFB' ? player.depth_pos : undefined },
                    { label: 'Age',        value: profile?.age ? `${profile.age}` : undefined },
                    { label: 'Height',     value: profile?.height },
                    { label: 'Weight',     value: profile?.weight },
                    { label: 'Experience', value: profile?.experience !== undefined
                        ? profile.experience === 0 ? 'Rookie'
                        : `${profile.experience} yr${profile.experience !== 1 ? 's' : ''}`
                        : undefined },
                    { label: 'College',    value: profile?.college },
                    { label: 'Birthplace', value: profile?.birthPlace },
                  ].filter(r => r.value).map(({ label, value, onClick }: any) => (
                    <div key={label} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-sm text-field-400">{label}</span>
                      {onClick
                        ? <button onClick={onClick} className="text-sm font-bold text-gold hover:text-gold/80 transition-colors text-right max-w-[55%] underline-offset-2 hover:underline">{value}</button>
                        : <span className="text-sm font-bold text-white text-right max-w-[55%]">{value}</span>
                      }
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* Stats */}
          {!isLoading && tab === 'stats' && (
            <div className="p-5">
              {(!profile?.stats || profile.stats.length === 0) ? (
                <div className="text-center py-16 text-field-400">
                  <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">
                    {player.league === 'CFB'
                      ? 'No stats available from ESPN for this player yet.'
                      : 'Season stats will appear once the 2026 NFL season starts.'}
                  </p>
                </div>
              ) : (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-field-400 mb-3">2026 Season Stats</h3>
                  <div className="bg-field-800 rounded-xl border border-field-700 divide-y divide-field-700/60">
                    {profile.stats.map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm text-field-400">{label}</span>
                        <span className="text-sm font-bold text-white">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* News */}
          {tab === 'news' && (
            <div className="p-5 space-y-3">
              {news.length === 0 && (
                <div className="text-center py-16 text-field-400">
                  <Newspaper className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No recent news for {player.name}.</p>
                  <p className="text-xs mt-1 text-field-600">Visit the News tab to load the latest articles.</p>
                </div>
              )}
              {news.map((item, i) => (
                <a
                  key={i}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-field-800/60 hover:bg-field-700/60 rounded-xl px-4 py-3 transition-colors group border border-field-700/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-white text-sm leading-snug group-hover:text-gold transition-colors">
                        {item.title}
                      </div>
                      {item.desc && (
                        <div className="text-xs text-field-400 mt-1 line-clamp-2">{item.desc}</div>
                      )}
                      {item.published && (
                        <div className="text-[12px] text-field-500 mt-1.5">{timeAgo(item.published)}</div>
                      )}
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-field-500 shrink-0 mt-0.5" />
                  </div>
                </a>
              ))}
            </div>
          )}

        </div>
      </div>
    </>,
    document.body,
  )
}
