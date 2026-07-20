import { useState, useMemo } from 'react'
import { useNFLNews, useNFLNewsByTeam } from '@/hooks/useLiveStats'
import { Newspaper, ExternalLink, Clock, Search, X } from 'lucide-react'
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
  const [expanded, setExpanded] = useState(false)
  return (
    <article
      className="panel hover:border-field-500 transition-colors cursor-pointer"
      onClick={() => setExpanded(e => !e)}
    >
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
            {item.Categories && (
              <span className="text-xs text-field-500 shrink-0">{item.Categories}</span>
            )}
            <div className="flex items-center gap-1 text-field-500 text-xs ml-auto shrink-0">
              <Clock className="w-3 h-3"/>
              <span>{timeAgo(item.Updated)}</span>
            </div>
          </div>
          <h3 className="font-bold text-white text-sm leading-snug mb-1">
            {item.Title}
          </h3>
          <p className={clsx(
            'text-field-300 text-xs leading-relaxed',
            expanded ? '' : 'line-clamp-3'
          )}>
            {item.Content}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-field-500">{item.Source || item.OriginalSource}</span>
            <span className="text-xs text-field-600">
              {expanded ? '▲ less' : '▼ more'}
            </span>
            {item.Url && (
              <a
                href={item.Url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-1 text-xs text-gold/70 hover:text-gold transition-colors ml-auto"
              >
                Full article <ExternalLink className="w-3 h-3"/>
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

// ── Main component ────────────────────────────────────────────
export function NewsView() {
  const [teamFilter, setTeamFilter] = useState('')
  const [search, setSearch]         = useState('')
  const [showTeamPicker, setShowTeamPicker] = useState(false)

  const { data: allNews,  isLoading: loadingAll  } = useNFLNews(100)
  const { data: teamNews, isLoading: loadingTeam } = useNFLNewsByTeam(teamFilter)

  const isLoading = teamFilter ? loadingTeam : loadingAll
  const rawNews   = teamFilter ? (teamNews ?? []) : (allNews ?? [])

  // Deduplicate by NewsID
  const deduped = useMemo(() => {
    const seen = new Set<number>()
    return rawNews.filter(n => {
      if (seen.has(n.NewsID)) return false
      seen.add(n.NewsID)
      return true
    })
  }, [rawNews])

  // Apply text search across title, content, player name
  const filtered = useMemo(() => {
    if (!search.trim()) return deduped
    const q = search.toLowerCase()
    return deduped.filter(n =>
      n.Title?.toLowerCase().includes(q) ||
      n.Content?.toLowerCase().includes(q) ||
      n.PlayerName?.toLowerCase().includes(q)
    )
  }, [deduped, search])

  const selectedTeam = NFL_TEAMS.find(t => t.abbr === teamFilter)

  return (
    <div className="space-y-4 max-w-3xl mx-auto">

      {/* ── Controls ── */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Text search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-field-500 pointer-events-none"/>
          <input
            className="input pl-8 pr-8 text-sm w-full"
            placeholder="Search news, players…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-field-500 hover:text-white">
              <X className="w-3.5 h-3.5"/>
            </button>
          )}
        </div>

        {/* Team filter button */}
        <div className="relative">
          <button
            onClick={() => setShowTeamPicker(p => !p)}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold transition-colors',
              teamFilter
                ? 'bg-gold/10 border-gold/40 text-gold'
                : 'bg-field-800 border-field-700 text-field-300 hover:text-white'
            )}
          >
            {selectedTeam ? `${selectedTeam.abbr} – ${selectedTeam.name}` : 'All Teams'}
            {teamFilter && (
              <span onClick={e => { e.stopPropagation(); setTeamFilter(''); setShowTeamPicker(false) }}
                className="ml-1 text-field-400 hover:text-white">
                <X className="w-3 h-3"/>
              </span>
            )}
          </button>

          {showTeamPicker && (
            <div className="absolute top-full mt-1 left-0 z-50 bg-field-800 border border-field-700 rounded-xl shadow-2xl p-2 w-72 grid grid-cols-4 gap-1">
              {NFL_TEAMS.map(t => (
                <button
                  key={t.abbr}
                  onClick={() => { setTeamFilter(t.abbr); setShowTeamPicker(false) }}
                  className={clsx(
                    'text-xs font-bold px-2 py-1.5 rounded-lg transition-colors',
                    teamFilter === t.abbr
                      ? 'bg-gold text-field-950'
                      : 'text-field-300 hover:bg-field-700 hover:text-white'
                  )}
                >
                  {t.abbr}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Result count */}
        <span className="text-xs text-field-500">
          {filtered.length} article{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Loading ── */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="flex gap-1">
            <div className="ai-dot"/><div className="ai-dot"/><div className="ai-dot"/>
          </div>
        </div>
      )}

      {/* ── Empty ── */}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-12 text-field-400">
          <Newspaper className="w-10 h-10 mx-auto mb-3 opacity-40"/>
          <p>{search || teamFilter ? 'No articles match your filters.' : 'No news available right now.'}</p>
        </div>
      )}

      {/* ── Articles ── */}
      {!isLoading && filtered.map(item => (
        <NewsCard key={item.NewsID} item={item} />
      ))}

    </div>
  )
}
