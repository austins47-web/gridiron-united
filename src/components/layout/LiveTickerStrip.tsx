import { useTickerGames } from '@/hooks/useHome'

/**
 * A thin, always-present strip grounding the whole app in "this is
 * happening right now" — not just on the Scores page. Reuses
 * useTickerGames() (already built for Home's jumbotron ticker), so
 * no new data source or backend work — just a persistent home for
 * data that already existed.
 */
export function LiveTickerStrip() {
  const { data: games = [] } = useTickerGames()
  const live = games.filter(g => g.status === 'in')

  // Nothing live right now — stay quiet rather than show a stale
  // or empty ticker that implies something's wrong.
  if (live.length === 0) return null

  // Duplicate the list once so the scrolling loop has no visible seam
  const doubled = [...live, ...live]

  return (
    <div className="flex items-center h-8 bg-field-900 border-b border-field-800 overflow-hidden shrink-0">
      <div className="flex items-center gap-1.5 px-3 h-full bg-field-800 shrink-0">
        <div className="ticker-live-dot w-1.5 h-1.5 rounded-full bg-red-500" />
        <span className="font-cond font-black text-[10px] tracking-[0.15em] text-red-400">LIVE</span>
      </div>
      <div className="flex-1 overflow-hidden relative h-full">
        <div className="ticker-scroll-track flex items-center gap-7 absolute whitespace-nowrap h-full">
          {doubled.map((g, i) => (
            <span key={`${g.id}-${i}`} className="font-cond font-bold text-xs text-field-300">
              <b className="text-white">{g.away} {g.awayScore}</b>
              {' – '}{g.home} {g.homeScore} · {g.detail}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
