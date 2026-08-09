import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, TrendingUp, Newspaper, BarChart2, User, ExternalLink, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import type { Player } from '@/types/database'

// ── ESPN ID helpers ───────────────────────────────────────────
// NFL DB id = espnId + 1_000_000
// CFB DB id = espnId + 50_000_000
function toEspnId(player: Player): number {
  if (player.league === 'NFL') return player.id - 1_000_000
  return player.id - 50_000_000
}

function espnLeagueSlug(league: string) {
  return league === 'NFL' ? 'nfl' : 'college-football'
}

// Headshot URL — constructed directly, no API call needed
function headshotUrl(player: Player): string {
  const espnId = toEspnId(player)
  const sport = player.league === 'NFL' ? 'nfl' : 'college-football'
  return `https://a.espncdn.com/i/headshots/${sport}/players/full/${espnId}.png`
}

// ── Proxy fetch ───────────────────────────────────────────────
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
  shortName: string
  headshot?: string
  jersey?: string
  position?: string
  team?: string
  experience?: number
  age?: number
  height?: string
  weight?: string
  birthPlace?: string
  college?: string
  status?: string
  stats: StatLine[]
}

interface StatLine { label: string; value: string; highlight?: boolean }
interface NewsItem  { title: string; url: string; published: string; desc: string }

// ── Fetch athlete + stats ─────────────────────────────────────
async function fetchProfile(player: Player): Promise<AthleteProfile> {
  const espnId = toEspnId(player)

  // Fetch athlete profile from site.web.api v3
  const athleteData = await proxyFetch(`athlete/${player.league}/${espnId}`)
  const a = athleteData.athlete ?? athleteData

  // Parse stats
  let stats: StatLine[] = []
  try {
    const statsData = await proxyFetch(`athlete/stats/${player.league}/${espnId}`)
    const categories = statsData.splits?.categories ?? statsData.categories ?? []
    for (const cat of categories) {
      for (const s of (cat.stats ?? [])) {
        if (s.displayValue && s.displayValue !== '0' && s.displayValue !== '--') {
          stats.push({ label: s.displayName ?? s.name, value: s.displayValue })
        }
      }
    }
  } catch { /* pre-season: no stats yet */ }

  return {
    displayName: a.displayName ?? player.name,
    shortName:   a.shortName   ?? player.name,
    headshot:    headshotUrl(player),
    jersey:      a.jersey,
    position:    a.position?.displayName ?? a.position?.abbreviation ?? player.pos,
    team:        a.team?.displayName ?? a.team?.name ?? player.team,
    experience:  a.experience?.years ?? a.yearsExperience,
    age:         a.age,
    height:      a.displayHeight ?? (a.height ? String(a.height) : undefined),
    // displayWeight already includes "lbs" — don't append it again
    weight:      a.displayWeight ?? (a.weight ? `${a.weight} lbs` : undefined),
    birthPlace:  a.birthPlace?.city
      ? `${a.birthPlace.city}${a.birthPlace.state ? ', ' + a.birthPlace.state : a.birthPlace.country ? ', ' + a.birthPlace.country : ''}`
      : undefined,
    college:     typeof a.college === 'string' ? a.college : a.college?.name ?? a.college?.displayName,
    status:      a.status?.type?.description ?? a.status?.description,
    stats,
  }
}

async function fetchPlayerNews(player: Player): Promise<NewsItem[]> {
  try {
    const espnId = toEspnId(player)
    const data = await proxyFetch(`athlete/news/${player.league}/${espnId}`)
    // Fantasy news endpoint returns { items: [...] }
    const articles = data.items ?? data.articles ?? []
    return articles.slice(0, 10).map((a: any) => ({
      title:     a.headline ?? a.title ?? '',
      url:       a.links?.web?.href ?? a.link ?? '',
      published: a.published ?? a.date ?? '',
      desc:      a.description ?? a.story?.substring(0, 200) ?? '',
    }))
  } catch { return [] }
}

// ── Stat display helpers ──────────────────────────────────────
const NFL_STAT_LABELS: Record<string, { label: string; pos: string[] }> = {
  passingYards:        { label: 'Pass Yds',  pos: ['QB'] },
  passingTouchdowns:   { label: 'Pass TD',   pos: ['QB'] },
  interceptions:       { label: 'INT',       pos: ['QB'] },
  completionPct:       { label: 'Comp %',    pos: ['QB'] },
  QBRating:            { label: 'QBR',       pos: ['QB'] },
  rushingYards:        { label: 'Rush Yds',  pos: ['QB','RB','WR'] },
  rushingTouchdowns:   { label: 'Rush TD',   pos: ['RB','QB'] },
  rushingAverage:      { label: 'YPC',       pos: ['RB'] },
  receivingYards:      { label: 'Rec Yds',   pos: ['WR','TE','RB'] },
  receivingTouchdowns: { label: 'Rec TD',    pos: ['WR','TE','RB'] },
  receptions:          { label: 'Rec',       pos: ['WR','TE','RB'] },
  receivingAverage:    { label: 'YPR',       pos: ['WR','TE'] },
  targets:             { label: 'Targets',   pos: ['WR','TE','RB'] },
  fantasyPoints:       { label: 'Fant Pts',  pos: ['QB','RB','WR','TE','K'] },
  fieldGoalsMade:      { label: 'FG Made',   pos: ['K'] },
  fieldGoalPct:        { label: 'FG %',      pos: ['K'] },
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Drawer ────────────────────────────────────────────────────
type Tab = 'overview' | 'stats' | 'news'

interface Props {
  player: Player
  onClose: () => void
}

export function PlayerProfileDrawer({ player, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('overview')

  const [imgError, setImgError] = useState(false)

  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ['player-profile', player.id],
    queryFn: () => fetchProfile(player),
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const { data: news = [], isLoading: loadingNews } = useQuery({
    queryKey: ['player-news', player.id],
    queryFn:  () => fetchPlayerNews(player),
    staleTime: 5 * 60_000,
    enabled: tab === 'news',
    retry: 1,
  })

  const classColors: Record<string, string> = {
    Freshman:  'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    Sophomore: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
    Junior:    'bg-purple-500/20 text-purple-300 border border-purple-500/30',
    Senior:    'bg-orange-500/20 text-orange-300 border border-orange-500/30',
    Graduate:  'bg-field-500/30 text-field-200 border border-field-500/30',
  }
  const classShort: Record<string, string> = {
    Freshman: 'FR', Sophomore: 'SO', Junior: 'JR', Senior: 'SR', Graduate: 'GR',
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-field-900 border-l border-field-700 flex flex-col shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-start gap-3 p-4 border-b border-field-700 shrink-0">
          {/* Headshot */}
          <div className="w-14 h-14 rounded-xl bg-field-800 border border-field-700 overflow-hidden shrink-0 flex items-center justify-center">
            {!imgError ? (
              <img
                src={headshotUrl(player)}
                alt={player.name}
                className="w-full h-full object-cover object-top"
                onError={() => setImgError(true)}
              />
            ) : (
              <User className="w-6 h-6 text-field-500" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-cond font-black text-lg text-white leading-none">
                {player.name}
              </h2>
              {player.is_rookie && player.league === 'NFL' && (
                <span className="text-[10px] font-black bg-gold text-field-950 px-1.5 py-0.5 rounded">R</span>
              )}
              {player.league === 'CFB' && player.depth_pos && classShort[player.depth_pos] && (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${classColors[player.depth_pos]}`}>
                  {classShort[player.depth_pos]}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={clsx(
                'font-cond font-bold text-xs px-1.5 py-0.5 rounded',
                player.league === 'NFL' ? 'bg-nfl/20 text-nfl' : 'bg-cfb/20 text-cfb',
              )}>{player.league}</span>
              <span className={`pos-badge pos-${player.pos} text-[10px]`}>{player.pos}</span>
              <span className="text-field-400 text-xs truncate">{player.team}</span>
              {profile?.jersey && (
                <span className="text-field-500 text-xs">#{profile.jersey}</span>
              )}
            </div>
            {player.status !== 'active' && (
              <div className="mt-1.5 bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-2 py-1.5">
                <div className="flex items-center gap-1 mb-0.5">
                  <AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0" />
                  <span className="text-xs text-yellow-400 font-bold capitalize">{player.status}</span>
                </div>
                {player.injury_note && (
                  <p className="text-xs text-field-300 leading-relaxed">{player.injury_note}</p>
                )}
              </div>
            )}
          </div>

          <button onClick={onClose} className="text-field-400 hover:text-white transition-colors shrink-0 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-field-700 shrink-0">
          {([
            { id: 'overview', label: 'Overview',   icon: User },
            { id: 'stats',    label: 'Stats',       icon: BarChart2 },
            { id: 'news',     label: 'News',        icon: Newspaper },
          ] as { id: Tab; label: string; icon: any }[]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={clsx(
                'flex items-center gap-1.5 flex-1 justify-center py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors',
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
          {loadingProfile && (
            <div className="flex justify-center py-12">
              <div className="flex gap-1">
                {[0,150,300].map(d => (
                  <div key={d} className="w-2 h-2 rounded-full bg-field-500 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          )}

          {/* ── Overview tab ── */}
          {!loadingProfile && tab === 'overview' && (
            <div className="p-4 space-y-4">

              {/* Fantasy section */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-field-400 mb-2">Fantasy</h3>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'ADP',       value: player.adp     ? player.adp.toFixed(1)     : '—' },
                    { label: 'Avg Pts',   value: player.avg_pts ? player.avg_pts.toFixed(1)  : '—' },
                    { label: 'Projected', value: player.proj_pts ? player.proj_pts.toFixed(1) : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-field-800 rounded-xl p-3 text-center border border-field-700">
                      <div className="font-cond font-black text-xl text-white">{value}</div>
                      <div className="text-[10px] text-field-400 font-bold uppercase tracking-wider mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bio section */}
              {profile && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-field-400 mb-2">Bio</h3>
                  <div className="bg-field-800 rounded-xl border border-field-700 divide-y divide-field-700">
                    {[
                      { label: 'Team',       value: profile.team },
                      { label: 'Position',   value: profile.position },
                      { label: 'Age',        value: profile.age ? `${profile.age}` : undefined },
                      { label: 'Height',     value: profile.height },
                      { label: 'Weight',     value: profile.weight },
                      { label: 'Experience', value: profile.experience !== undefined
                          ? profile.experience === 0 ? 'Rookie' : `${profile.experience} yr${profile.experience !== 1 ? 's' : ''}`
                          : undefined },
                      { label: 'College',    value: profile.college },
                      { label: 'Birthplace', value: profile.birthPlace },
                      { label: 'Conference', value: player.conference },
                    ].filter(r => r.value).map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between px-3 py-2">
                        <span className="text-xs text-field-400">{label}</span>
                        <span className="text-xs font-bold text-white text-right max-w-[60%] truncate">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Stats tab ── */}
          {!loadingProfile && tab === 'stats' && (
            <div className="p-4">
              {(!profile?.stats || profile.stats.length === 0) ? (
                <div className="text-center py-12 text-field-400 text-sm">
                  <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>Season stats will appear once the season starts.</p>
                </div>
              ) : (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-field-400 mb-2">
                    {new Date().getFullYear()} Season Stats
                  </h3>
                  <div className="bg-field-800 rounded-xl border border-field-700 divide-y divide-field-700">
                    {profile.stats.map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between px-3 py-2.5">
                        <span className="text-xs text-field-400">{label}</span>
                        <span className="text-sm font-bold text-white">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── News tab ── */}
          {tab === 'news' && (
            <div className="p-4 space-y-3">
              {loadingNews && (
                <div className="flex justify-center py-8">
                  <div className="flex gap-1">
                    {[0,150,300].map(d => (
                      <div key={d} className="w-2 h-2 rounded-full bg-field-500 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              )}
              {!loadingNews && news.length === 0 && (
                <div className="text-center py-12 text-field-400 text-sm">
                  <Newspaper className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>No recent news for {player.name}.</p>
                </div>
              )}
              {!loadingNews && news.map((item, i) => (
                <a
                  key={i}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-field-800/60 hover:bg-field-700/60 rounded-xl px-3 py-3 transition-colors group border border-field-700/50"
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
                        <div className="text-[10px] text-field-500 mt-1">{timeAgo(item.published)}</div>
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
    </>
  )
}
