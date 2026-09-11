import { useNavigate } from 'react-router-dom'
import { useTickerGames } from '@/hooks/useHome'
import { useAppStore } from '@/store/appStore'

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
 *
 * No collapse toggle — it used to swap the scrolling row for a
 * same-height "N updates — collapsed" placeholder, which never
 * actually saved any space, and the strip already hides itself
 * entirely the moment there's nothing to show (see the early return
 * below), which is the only "hide" behavior that's actually useful.
 */
export function LiveTickerStrip() {
  const navigate = useNavigate()
  const { data: games = [] } = useTickerGames()
  const { notifications } = useAppStore()

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

  if (items.length === 0) return null

  // Duplicate the list once so the scrolling loop can translate by
  // exactly 50% and land back on an identical frame - each item
  // carries its OWN trailing spacing (mr-7) rather than a flex `gap`
  // between children, so both halves are truly identical copies
  // (gap included) and the seam lines up exactly regardless of how
  // few items there are. A flex `gap` only sits BETWEEN children, so
  // with a flex `gap` the boundary between the two copies gets one
  // gap while the split point of "50% of total width" expects a full
  // item+gap there - off by half a gap, invisible with dozens of
  // items, very visible with only one or two (confirmed directly:
  // exactly the single-game gap glitch reported).
  const doubled = [...items, ...items]

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

      <div className="flex-1 overflow-hidden relative h-full">
        <div className="ticker-scroll-track flex items-center absolute whitespace-nowrap h-full">
          {doubled.map((item, i) => (
            <button
              key={`${item.key}-${i}`}
              onClick={item.onClick}
              className="font-cond font-bold text-xs text-field-300 hover:text-gold transition-colors shrink-0 mr-7"
            >
              {item.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
