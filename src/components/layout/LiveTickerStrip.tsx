import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTickerGames } from '@/hooks/useHome'
import { useAppStore } from '@/store/appStore'

const COLLAPSE_KEY = 'gu_ticker_collapsed'

type TickerItem =
  | { kind: 'game'; key: string; text: React.ReactNode; onClick: () => void }
  | { kind: 'activity'; key: string; text: React.ReactNode; onClick: () => void }

/**
 * A thin, always-present strip grounding the whole app in "this is
 * happening right now" — not just on the Scores page. Two sources
 * feed one scrolling lane rather than two stacked rows: live scores
 * (useTickerGames, already built for Home's jumbotron ticker) and
 * this user's own recent activity (notifications, already fetched
 * and subscribed globally via the app store — no new data source).
 * Kept to one row on purpose — the sub-nav directly below this is
 * positioned with a hardcoded sticky offset tied to this strip's
 * height, so a second row would need that recalculated everywhere
 * it's used; safer to interleave than to risk that layout breaking.
 */
export function LiveTickerStrip() {
  const navigate = useNavigate()
  const { data: games = [] } = useTickerGames()
  const { notifications } = useAppStore()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
  })

  const live = games.filter(g => g.status === 'in')
  const recentActivity = notifications.slice(0, 5)

  const items: TickerItem[] = [
    ...live.map((g): TickerItem => ({
      kind: 'game',
      key: `game-${g.id}`,
      text: <><b className="text-white">{g.away} {g.awayScore}</b>{' – '}{g.home} {g.homeScore} · {g.detail}</>,
      onClick: () => navigate('/app/scores'),
    })),
    ...recentActivity.map((n): TickerItem => ({
      kind: 'activity',
      key: `notif-${n.id}`,
      text: <span className="text-field-300">{n.title}</span>,
      onClick: () => navigate(n.league_id ? '/app/leagues' : '/app/home'),
    })),
  ]

  function toggleCollapsed() {
    setCollapsed(c => {
      const next = !c
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  // Nothing live and no recent activity — stay quiet rather than
  // show a stale or empty strip that implies something's wrong. The
  // collapse toggle itself only makes sense once there's something
  // to collapse.
  if (items.length === 0) return null

  // Duplicate the list once so the scrolling loop has no visible seam
  const doubled = collapsed ? [] : [...items, ...items]

  return (
    <div className="flex items-center h-8 bg-field-900 border-b border-field-800 overflow-hidden shrink-0">
      <div className="flex items-center gap-1.5 px-3 h-full bg-field-800 shrink-0">
        {live.length > 0 ? (
          <>
            <div className="ticker-live-dot w-1.5 h-1.5 rounded-full bg-red-500" />
            <span className="font-cond font-black text-[10px] tracking-[0.15em] text-red-400">LIVE</span>
          </>
        ) : (
          <span className="font-cond font-black text-[10px] tracking-[0.15em] text-field-500">FEED</span>
        )}
      </div>

      {!collapsed && (
        <div className="flex-1 overflow-hidden relative h-full">
          <div className="ticker-scroll-track flex items-center gap-7 absolute whitespace-nowrap h-full">
            {doubled.map((item, i) => (
              <button
                key={`${item.key}-${i}`}
                onClick={item.onClick}
                className="font-cond font-bold text-xs text-field-300 hover:text-gold transition-colors shrink-0"
              >
                {item.text}
              </button>
            ))}
          </div>
        </div>
      )}
      {collapsed && (
        <div className="flex-1 px-3">
          <span className="font-cond font-bold text-xs text-field-500">
            {items.length} update{items.length === 1 ? '' : 's'} — collapsed
          </span>
        </div>
      )}

      <button
        onClick={toggleCollapsed}
        className="flex items-center justify-center w-8 h-full shrink-0 text-field-500 hover:text-white hover:bg-field-800 transition-colors"
        title={collapsed ? 'Expand live feed' : 'Collapse live feed'}
      >
        {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}
