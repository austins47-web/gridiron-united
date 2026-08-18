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

// ── Conference → team map for CFB news grouping ──────────────
// Maps ESPN team shortDisplayName → conference name
const TEAM_CONF_MAP: Record<string, string> = {
  'Alabama':'Southeastern','Arkansas':'Southeastern','Auburn':'Southeastern',
  'Florida':'Southeastern','Georgia':'Southeastern','Kentucky':'Southeastern',
  'LSU':'Southeastern','Mississippi State':'Southeastern','Missouri':'Southeastern',
  'Ole Miss':'Southeastern','Oklahoma':'Southeastern','South Carolina':'Southeastern',
  'Tennessee':'Southeastern','Texas A&M':'Southeastern','Texas':'Southeastern','Vanderbilt':'Southeastern',
  'Illinois':'Big Ten','Indiana':'Big Ten','Iowa':'Big Ten','Maryland':'Big Ten',
  'Michigan':'Big Ten','Michigan State':'Big Ten','Minnesota':'Big Ten','Nebraska':'Big Ten',
  'Northwestern':'Big Ten','Ohio State':'Big Ten','Oregon':'Big Ten','Penn State':'Big Ten',
  'Purdue':'Big Ten','Rutgers':'Big Ten','UCLA':'Big Ten','USC':'Big Ten',
  'Washington':'Big Ten','Wisconsin':'Big Ten',
  'Arizona':'Big 12','Arizona State':'Big 12','Baylor':'Big 12','BYU':'Big 12',
  'Cincinnati':'Big 12','Colorado':'Big 12','Houston':'Big 12','Iowa State':'Big 12',
  'Kansas':'Big 12','Kansas State':'Big 12','Oklahoma State':'Big 12','TCU':'Big 12',
  'Texas Tech':'Big 12','UCF':'Big 12','Utah':'Big 12','West Virginia':'Big 12',
  'Boston College':'Atlantic Coast','California':'Atlantic Coast','Clemson':'Atlantic Coast',
  'Duke':'Atlantic Coast','Florida State':'Atlantic Coast','Georgia Tech':'Atlantic Coast',
  'Louisville':'Atlantic Coast','Miami':'Atlantic Coast','NC State':'Atlantic Coast',
  'North Carolina':'Atlantic Coast','Pittsburgh':'Atlantic Coast','SMU':'Atlantic Coast',
  'Stanford':'Atlantic Coast','Syracuse':'Atlantic Coast','Virginia':'Atlantic Coast',
  'Virginia Tech':'Atlantic Coast','Wake Forest':'Atlantic Coast',
  // Pac-12 (2026 rebuild — MWC schools that moved over)
  'Boise State':'Pac-12','Colorado State':'Pac-12','Fresno State':'Pac-12',
  'Oregon State':'Pac-12','San Diego State':'Pac-12','Utah State':'Pac-12',
  'Washington State':'Pac-12','Texas State':'Pac-12',
  // Mountain West (schools that stayed)
  'Air Force':'Mountain West',"Hawai'i":'Mountain West','Hawaii':'Mountain West',
  'Nevada':'Mountain West','New Mexico':'Mountain West','San Jose State':'Mountain West',
  'UNLV':'Mountain West','Wyoming':'Mountain West',
  'Army':'American Athletic','Charlotte':'American Athletic','East Carolina':'American Athletic',
  'Florida Atlantic':'American Athletic','Memphis':'American Athletic','Navy':'American Athletic',
  'North Texas':'American Athletic','Rice':'American Athletic','South Florida':'American Athletic',
  'Temple':'American Athletic','Tulane':'American Athletic','Tulsa':'American Athletic',
  'UAB':'American Athletic','Connecticut':'American Athletic','UTSA':'American Athletic',
  'FIU':'Conference USA','Jacksonville State':'Conference USA','Louisiana Tech':'Conference USA',
  'Marshall':'Conference USA','Middle Tennessee':'Conference USA','New Mexico State':'Conference USA',
  'Old Dominion':'Conference USA','Southern Miss':'Conference USA','UTEP':'Conference USA',
  'Western Kentucky':'Conference USA',
  'Akron':'Mid-American','Ball State':'Mid-American','Bowling Green':'Mid-American',
  'Buffalo':'Mid-American','Central Michigan':'Mid-American','Eastern Michigan':'Mid-American',
  'Kent State':'Mid-American','Miami (OH)':'Mid-American','Northern Illinois':'Mid-American',
  'Ohio':'Mid-American','Toledo':'Mid-American','Western Michigan':'Mid-American',
  'Appalachian State':'Sun Belt','App State':'Sun Belt','Arkansas State':'Sun Belt',
  'Coastal Carolina':'Sun Belt','Georgia Southern':'Sun Belt','Georgia State':'Sun Belt',
  'James Madison':'Sun Belt','Louisiana':'Sun Belt','Louisiana Monroe':'Sun Belt',
  'South Alabama':'Sun Belt','Troy':'Sun Belt',
  'Notre Dame':'FBS Independents','Liberty':'FBS Independents','Massachusetts':'FBS Independents',
}

const CONF_ORDER = [
  'Southeastern','Big Ten','Big 12','Atlantic Coast','Pac-12',
  'American Athletic','Mountain West','Conference USA','Mid-American','Sun Belt','FBS Independents',
]

// ── CFB news tab ──────────────────────────────────────────────
function CFBNewsTab() {
  const [search, setSearch]           = useState('')
  const [teamFilter, setTeamFilter]   = useState('')
  const [showTeamPicker, setShowTeamPicker] = useState(false)
  const { data: articles = [], isLoading } = useCFBNews()

  // Build conference-grouped team list from what's in the feed
  const cfbTeamsByConf = useMemo(() => {
    const seen = new Set<string>()
    const byConf: Record<string, string[]> = {}
    for (const a of articles) {
      const name = a._teamName ?? a.categories?.find((c: any) => c.type === 'team' && c.team?.shortDisplayName)?.team?.shortDisplayName
      if (!name || seen.has(name)) continue
      seen.add(name)
      const conf = TEAM_CONF_MAP[name] ?? 'Other'
      if (!byConf[conf]) byConf[conf] = []
      byConf[conf].push(name)
    }
    // Sort teams within each conference
    for (const conf of Object.keys(byConf)) byConf[conf].sort()
    return byConf
  }, [articles])

  // Flat sorted list for search mode
  const allCfbTeams = useMemo(() =>
    Object.values(cfbTeamsByConf).flat().sort(),
    [cfbTeamsByConf]
  )

  const filtered = useMemo(() => {
    let items = articles
    if (teamFilter) {
      items = items.filter((a: any) => {
        const name = a._teamName ?? a.categories?.find((c: any) => c.type === 'team' && c.team?.shortDisplayName)?.team?.shortDisplayName
        return name === teamFilter
      })
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter((a: any) =>
        a.headline?.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        a.categories?.some((c: any) => c.team?.shortDisplayName?.toLowerCase().includes(q))
      )
    }
    return items
  }, [articles, teamFilter, search])

  const selectedLabel = teamFilter || 'All Teams'

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
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

        {/* Team picker */}
        <div className="relative">
          <button
            onClick={() => setShowTeamPicker(p => !p)}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold transition-colors',
              teamFilter ? 'bg-cfb/10 border-cfb/40 text-cfb' : 'bg-field-800 border-field-700 text-field-300 hover:text-white'
            )}
          >
            {selectedLabel}
            {teamFilter && (
              <span onClick={e => { e.stopPropagation(); setTeamFilter('') }} className="ml-1 text-field-400 hover:text-white">
                <X className="w-3 h-3"/>
              </span>
            )}
          </button>
          {showTeamPicker && (
            <div className="absolute top-full mt-1 left-0 z-50 bg-field-800 border border-field-700 rounded-xl shadow-2xl p-1 w-52 max-h-64 overflow-y-auto">
              <button
                onClick={() => { setTeamFilter(''); setShowTeamPicker(false) }}
                className={clsx('w-full text-left px-3 py-2 text-sm rounded-lg transition-colors', !teamFilter ? 'text-gold font-bold' : 'text-white hover:bg-field-700')}
              >
                All Teams
              </button>
              {search.trim()
                ? allCfbTeams.filter(t => t.toLowerCase().includes(search.toLowerCase())).map(t => (
                    <button key={t} onClick={() => { setTeamFilter(t); setShowTeamPicker(false) }}
                      className={clsx('w-full text-left px-3 py-2 text-sm rounded-lg transition-colors', teamFilter === t ? 'text-gold font-bold bg-field-700' : 'text-white hover:bg-field-700')}>
                      {t}
                    </button>
                  ))
                : CONF_ORDER.filter(c => cfbTeamsByConf[c]?.length).map(conf => (
                    <div key={conf}>
                      <div className="px-3 py-1 text-[10px] font-black uppercase tracking-widest text-cfb/70 bg-field-900 sticky top-0">
                        {conf}
                      </div>
                      {cfbTeamsByConf[conf].map(t => (
                        <button key={t} onClick={() => { setTeamFilter(t); setShowTeamPicker(false) }}
                          className={clsx('w-full text-left px-3 py-2 text-sm rounded-lg transition-colors', teamFilter === t ? 'text-gold font-bold bg-field-700' : 'text-white hover:bg-field-700')}>
                          {t}
                        </button>
                      ))}
                    </div>
                  ))
              }
            </div>
          )}
        </div>

        <span className="text-xs text-field-500">{filtered.length} article{filtered.length !== 1 ? 's' : ''}</span>
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
          {(search || teamFilter) && (
            <button className="text-gold text-sm underline mt-1" onClick={() => { setSearch(''); setTeamFilter('') }}>
              Clear filters
            </button>
          )}
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

  const { data: allNews, isLoading } = useNFLNews(300)
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
