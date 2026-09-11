import { useLayoutEffect, useRef, useState } from 'react'
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
 * Sticky itself (top: header height + global nav height, see
 * AppShell.tsx's top-14 nav right above this) so it stays in view
 * while scrolling instead of disappearing with the rest of the page -
 * the league sub-nav that follows it in AppShell is stacked directly
 * below at this strip's sticky offset + its own h-8 height.
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

  return <TickerScroller items={items} live={live.length > 0} />
}

// Split into its own component so hooks can run unconditionally
// regardless of the parent's early return above.
function TickerScroller({ items, live }: { items: TickerItem[]; live: boolean }) {
  const laneRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [repeat, setRepeat] = useState(2)

  // How many copies of `items` are needed so the repeated track is
  // always wider than the visible lane (times 2, so there's always a
  // full lane's worth of content still queued up after the visible
  // portion, however few items there are) - measured directly rather
  // than assumed, since a fixed "duplicate twice" only has enough
  // content when the item list is already wide on its own. With one
  // short game, two copies together were still narrower than the
  // lane, leaving visible dead space before the loop could wrap
  // (confirmed directly - the reported gap). Re-measures on resize
  // and whenever the item count changes (a proxy for content change,
  // cheap and avoids diffing rendered text on every score tick).
  useLayoutEffect(() => {
    function recompute() {
      const laneWidth = laneRef.current?.offsetWidth ?? 0
      const oneCopyWidth = measureRef.current?.scrollWidth ?? 0
      if (!laneWidth || !oneCopyWidth) return
      setRepeat(Math.max(2, Math.ceil((laneWidth * 2) / oneCopyWidth)))
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    if (laneRef.current) ro.observe(laneRef.current)
    return () => ro.disconnect()
  }, [items.length])

  // Every copy is byte-for-byte identical (each item carries its own
  // trailing mr-7 instead of a shared flex `gap`, so there's no
  // asymmetric half-gap at the seam the way a flex `gap` would leave
  // between the last item of one copy and the first of the next) -
  // translating by exactly 1/repeat of the total width always lands
  // back on an identical frame, and the fixed 32s animation duration
  // means the actual scroll SPEED (one copy's width per 32s) stays
  // constant no matter how many copies repeat had to add.
  const repeated = Array.from({ length: repeat }, () => items).flat()

  return (
    <div className="app-shell-ticker sticky top-[calc(3.5rem+41px)] z-[25] flex items-center h-8 bg-field-900 border-b border-field-800 overflow-hidden shrink-0">
      <div className="flex items-center gap-1.5 px-3 h-full bg-field-800 shrink-0">
        {live ? (
          <>
            <div className="ticker-live-dot w-1.5 h-1.5 rounded-full bg-red-500" />
            <span className="font-cond font-black text-[10px] tracking-[0.15em] text-red-400">LIVE</span>
          </>
        ) : (
          <span className="font-cond font-black text-[10px] tracking-[0.15em] text-field-500">FEED</span>
        )}
      </div>

      <div ref={laneRef} className="flex-1 overflow-hidden relative h-full">
        {/* Invisible, unrepeated copy used only to measure one item
            set's natural width - not part of the visible layout. */}
        <div ref={measureRef} className="invisible absolute flex items-center whitespace-nowrap h-full pointer-events-none" aria-hidden>
          {items.map((item, i) => (
            <span key={`measure-${item.key}-${i}`} className="font-cond font-bold text-xs shrink-0 mr-7">{item.text}</span>
          ))}
        </div>

        <div
          className="ticker-scroll-track flex items-center absolute whitespace-nowrap h-full"
          style={{ '--ticker-end': `-${100 / repeat}%` } as React.CSSProperties}
        >
          {repeated.map((item, i) => (
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
