import { useState, useMemo } from 'react'
import { useNFLNews, useCFBNews } from '@/hooks/useLiveStats'
import { ExternalLink, Clock, Search, X } from 'lucide-react'
import clsx from 'clsx'

// ── NFL teams for the filter picker ──────────────────────────
const NFL_TEAMS = [
  { abbr: 'ARI', name: 'Cardinals' }, { abbr: 'ATL', name: 'Falcons' },
  { abbr: 'BAL', name: 'Ravens' },   { abbr: 'BUF', name: 'Bills' },
  { abbr: 'CAR', name: 'Panthers' }, { abbr: 'CHI', name: 'Bears' },
  { abbr: 'CIN', name: 'Bengals' },  { abbr: 'CLE', name: 'Browns' },
  { abbr: 'DAL', name: 'Cowboys' },  { abbr: 'DEN', name: 'Broncos' },
  { abbr: 'DET', name: 'Lions' },    { abbr: 'GB',  name: 'Packers' },
  { abbr: 'HOU', name: 'Texans' },   { abbr: 'IND', name: 'Colts' },
  { abbr: 'JAX', name: 'Jaguars' },  { abbr: 'KC',  name: 'Chiefs' },
  { abbr: 'LAC', name: 'Chargers' }, { abbr: 'LAR', name: 'Rams' },
  { abbr: 'LV',  name: 'Raiders' },  { abbr: 'MIA', name: 'Dolphins' },
  { abbr: 'MIN', name: 'Vikings' },  { abbr: 'NE',  name: 'Patriots' },
  { abbr: 'NO',  name: 'Saints' },   { abbr: 'NYG', name: 'Giants' },
  { abbr: 'NYJ', name: 'Jets' },     { abbr: 'PHI', name: 'Eagles' },
  { abbr: 'PIT', name: 'Steelers' }, { abbr: 'SEA', name: 'Seahawks' },
  { abbr: 'SF',  name: '49ers' },    { abbr: 'TB',  name: 'Buccaneers' },
  { abbr: 'TEN', name: 'Titans' },   { abbr: 'WAS', name: 'Commanders' },
]

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr)
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Single article card ───────────────────────────────────────
function NewsCard({ item }: { item: any }) {
  const inner = (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {item.PlayerName && (
            <span className="text-xs font-bold text-gold bg-gold/10 border border-gold/20 px-2 py-0.5 rounded-full shrink-0">
              {item.PlayerName}
            </span>
          )}
          {item.Team && (
            <span className="text-xs font-bold text-field-300 bg-field-700 px-2 py-0.5 rounded-full shrink-0">
              {item.Team}
            </span>
          )}
          <div className="flex items-center gap-1 text-field-500 text-xs ml-auto shrink-0">
            <Clock className="w-3 h-3"/>
            <span>{timeAgo(item.Updated)}</span>
          </div>
        </div>
        <h3 className="font-bold text-white text-sm leading-snug mb-1 group-hover:text-gold transition-colors">
          {item.Title}
        </h3>
        {item.Content && (
          <p className="text-field-300 text-xs leading-relaxed line-clamp-2">
            {item.Content}
          </p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-field-500">{item.Source || item.OriginalSource}</span>
          {item.Url && (
            <span className="flex items-center gap-1 text-xs text-gold/60 ml-auto">
              Read more <ExternalLink className="w-3 h-3"/>
            </span>
          )}
        </div>
      </div>
    </div>
  )

  if (item.Url) {
    return (
      <a
        href={item.Url}
        target="_blank"
        rel="noopener noreferrer"
        className="panel hover:border-field-500 transition-colors block group"
      >
        {inner}
      </a>
    )
  }

  return (
    <article className="panel">
      {inner}
    </article>
  )
}

// ── CFB news card ─────────────────────────────────────────────
function CFBNewsCard({ item }: { item: any }) {
  // Extract team names from categories array
  const teams = useMemo(() => {
    const cats = item.categories ?? []
    return cats
      .filter((c: any) => c.type === 'team' && c.team?.shortDisplayName)
      .map((c: any) => c.team.shortDisplayName as string)
      .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
      .slice(0, 3)
  }, [item.categories])

  const url = item.links?.web?.href
  const published = item.published ?? item.lastModified

  const inner = (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        {teams.map((t: string) => (
          <span key={t} className="text-xs font-bold text-cfb/90 bg-cfb/10 border border-cfb/20 px-2 py-0.5 rounded-full shrink-0">
            {t}
          </span>
        ))}
        {published && (
          <div className="flex items-center gap-1 text-field-500 text-xs ml-auto shrink-0">
            <Clock className="w-3 h-3"/>
            <span>{timeAgo(published)}</span>
          </div>
        )}
      </div>
      <h3 className="font-bold text-white text-sm leading-snug mb-1 group-hover:text-gold transition-colors">
        {item.headline}
      </h3>
      {item.description && (
        <p className="text-field-300 text-xs leading-relaxed line-clamp-2">{item.description}</p>
      )}
      {url && (
        <div className="flex items-center mt-2">
          <span className="flex items-center gap-1 text-xs text-gold/60 ml-auto">
            Read more <ExternalLink className="w-3 h-3"/>
          </span>
        </div>
      )}
    </div>
  )

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="panel hover:border-field-500 transition-colors flex items-start gap-3 group">
        {inner}
      </a>
    )
  }
  return <article className="panel flex items-start gap-3">{inner}</article>
}

// ── CFB news tab ──────────────────────────────────────────────
function CFBNewsTab() {
  const [search, setSearch] = useState('')
  const { data: articles = [], isLoading } = useCFBNews()

  const filtered = useMemo(() => {
    if (!search.trim()) return articles
    const q = search.toLowerCase()
    return articles.filter((a: any) =>
      a.headline?.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q) ||
      a.categories?.some((c: any) => c.team?.shortDisplayName?.toLowerCase().includes(q))
    )
  }, [articles, search])

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-field-500 pointer-events-none"/>
        <input
          className="input pl-8 pr-8 text-sm w-full"
          placeholder="Search CFB news, teams…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-field-500 hover:text-white">
            <X className="w-3.5 h-3.5"/>
          </button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="panel animate-pulse h-20 bg-field-800"/>
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-10 text-field-400">
          <p>No CFB news found</p>
          {search && <button className="text-gold text-sm underline mt-1" onClick={() => setSearch('')}>Clear search</button>}
        </div>
      )}

      {!isLoading && filtered.map((item: any) => (
        <CFBNewsCard key={item.id ?? item.contentKey} item={item} />
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────
export function NewsView() {
  const [tab, setTab] = useState<'nfl' | 'cfb'>('nfl')
  const [teamFilter, setTeamFilter] = useState('')
  const [search, setSearch]         = useState('')
  const [showTeamPicker, setShowTeamPicker] = useState(false)

  const { data: allNews, isLoading } = useNFLNews(100)
  const rawNews = allNews ?? []

  const deduped = useMemo(() => {
    const seen = new Set<number>()
    return rawNews.filter(n => {
      if (seen.has(n.NewsID)) return false
      seen.add(n.NewsID)
      return true
    })
  }, [rawNews])

  const filtered = useMemo(() => {
    let items = deduped
    // Team filter — match against the Team abbreviation stored on each article
    if (teamFilter) {
      const abbr = teamFilter.toUpperCase()
      const teamEntry = NFL_TEAMS.find(t => t.abbr === abbr)
      const nickname = teamEntry?.name.toLowerCase() ?? ''
      items = items.filter(n =>
        n.Team?.toUpperCase() === abbr ||
        n.Team?.toLowerCase() === nickname
      )
    }
    // Text search
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(n =>
        n.Title?.toLowerCase().includes(q) ||
        n.Content?.toLowerCase().includes(q) ||
        n.PlayerName?.toLowerCase().includes(q)
      )
    }
    return items
  }, [deduped, teamFilter, search])

  const selectedTeam = NFL_TEAMS.find(t => t.abbr === teamFilter)

  return (
    <div className="space-y-4 max-w-3xl mx-auto">

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 bg-field-900 rounded-xl border border-field-800 w-fit">
        {(['nfl', 'cfb'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setSearch(''); setTeamFilter('') }}
            className={clsx(
              'px-5 py-1.5 rounded-lg text-sm font-bold transition-colors uppercase tracking-wide',
              tab === t
                ? t === 'nfl' ? 'bg-nfl text-white' : 'bg-cfb text-white'
                : 'text-field-400 hover:text-white'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── CFB tab ── */}
      {tab === 'cfb' && <CFBNewsTab />}

      {/* ── NFL tab ── */}
      {tab === 'nfl' && (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-field-500 pointer-events-none"/>
              <input
                className="input pl-8 pr-8 text-sm w-full"
                placeholder="Search news, players…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-field-500 hover:text-white">
                  <X className="w-3.5 h-3.5"/>
                </button>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setShowTeamPicker(p => !p)}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold transition-colors',
                  teamFilter ? 'bg-gold/10 border-gold/40 text-gold' : 'bg-field-800 border-field-700 text-field-300 hover:text-white'
                )}
              >
                {selectedTeam ? `${selectedTeam.abbr} – ${selectedTeam.name}` : 'All Teams'}
                {teamFilter && (
                  <span onClick={e => { e.stopPropagation(); setTeamFilter(''); setShowTeamPicker(false) }} className="ml-1 text-field-400 hover:text-white">
                    <X className="w-3 h-3"/>
                  </span>
                )}
              </button>
              {showTeamPicker && (
                <div className="absolute top-full mt-1 left-0 z-50 bg-field-800 border border-field-700 rounded-xl shadow-2xl p-2 w-72 grid grid-cols-4 gap-1">
                  {NFL_TEAMS.map(t => (
                    <button key={t.abbr} onClick={() => { setTeamFilter(t.abbr); setShowTeamPicker(false) }}
                      className={clsx('text-xs font-bold px-2 py-1.5 rounded-lg transition-colors',
                        teamFilter === t.abbr ? 'bg-gold text-field-950' : 'text-field-300 hover:bg-field-700 hover:text-white')}>
                      {t.abbr}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="text-xs text-field-500">{filtered.length} article{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {isLoading && (
            <div className="flex justify-center py-16">
              <div className="flex gap-1"><div className="ai-dot"/><div className="ai-dot"/><div className="ai-dot"/></div>
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-10 text-field-400">No articles found</div>
          )}

          {!isLoading && filtered.map(item => (
            <NewsCard key={item.NewsID} item={item} />
          ))}
        </>
      )}

    </div>
  )
}
