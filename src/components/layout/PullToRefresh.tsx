import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { isStandalone } from '@/lib/push'

// ══════════════════════════════════════════════════════════════
// Pull down from the top of a page to refresh — only in the
// home-screen app, which has no browser refresh button (a Safari or
// Chrome tab already has its own pull-to-refresh).
//
// A refresh re-fetches everything on screen, in place. If a newer
// version of the site has been deployed since the app was opened
// (iPhone keeps a home-screen app alive for days), it reloads instead
// so the pull also picks up the update.
// ══════════════════════════════════════════════════════════════

const TRIGGER = 72   // spinner travel (after resistance) that refreshes on release
const MAX = 110      // the furthest it travels

/** Nearest ancestor that scrolls on its own (a chat list, a modal). */
function scrolledAncestor(el: Element | null): boolean {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const style = getComputedStyle(n)
    // Fixed layers (modals, sheets, the bottom bar) aren't the page
    if (style.position === 'fixed') return true
    if (/(auto|scroll)/.test(style.overflowY) && n.scrollHeight > n.clientHeight && n.scrollTop > 0) return true
  }
  return false
}

/** True when the deployed index.html loads a different app bundle. */
async function newVersionDeployed(): Promise<boolean> {
  try {
    const current = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src')
    if (!current) return false
    const html = await (await fetch('/index.html', { cache: 'no-store' })).text()
    return !html.includes(current)
  } catch {
    return false
  }
}

export function PullToRefresh() {
  const qc = useQueryClient()
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const active = useRef(false)
  const pullRef = useRef(0)
  const busy = useRef(false)

  useEffect(() => {
    if (!isStandalone()) return

    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1 || window.scrollY > 0) return
      if (scrolledAncestor(e.target as Element)) return
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      active.current = false
    }
    const onMove = (e: TouchEvent) => {
      if (!start.current) return
      const dy = e.touches[0].clientY - start.current.y
      const dx = e.touches[0].clientX - start.current.x
      if (!active.current) {
        // Sideways swipes (the Board, score strips) aren't pulls
        if (Math.abs(dx) > Math.abs(dy) || dy < 8 || window.scrollY > 0) {
          if (Math.abs(dx) > 8 || dy < -8) start.current = null
          return
        }
        active.current = true
        setDragging(true)
      }
      // Resistance: the further you pull, the less it moves
      const d = Math.min(MAX, (dy - 8) * 0.5)
      pullRef.current = Math.max(0, d)
      setPull(pullRef.current)
    }
    const onEnd = async () => {
      const go = active.current && pullRef.current >= TRIGGER
      start.current = null
      active.current = false
      pullRef.current = 0
      setDragging(false)
      if (!go) { setPull(0); return }
      busy.current = true
      setRefreshing(true)
      setPull(TRIGGER * 0.75)
      if (navigator.vibrate) navigator.vibrate(10)
      if (await newVersionDeployed()) { window.location.reload(); return }
      await Promise.race([
        qc.refetchQueries({ type: 'active' }),
        new Promise(r => setTimeout(r, 8000)),
      ]).catch(() => {})
      // Keep the spinner up long enough to read as "done"
      await new Promise(r => setTimeout(r, 350))
      busy.current = false
      setRefreshing(false)
      setPull(0)
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [qc])

  if (pull === 0 && !refreshing) return null
  const ready = refreshing || pull >= TRIGGER
  return (
    <div
      aria-hidden={!refreshing}
      role={refreshing ? 'status' : undefined}
      className="fixed left-1/2 z-[60] pointer-events-none"
      style={{
        top: 'env(safe-area-inset-top)',
        transform: `translate(-50%, ${pull - 44}px)`,
        transition: dragging ? 'none' : 'transform 220ms ease',
      }}
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg shadow-black/50 border transition-colors ${
        ready ? 'bg-gold border-gold text-field-950' : 'bg-field-800 border-field-600 text-gold'
      }`}>
        <RefreshCw
          className={`w-[18px] h-[18px] ${refreshing ? 'animate-spin' : ''}`}
          style={refreshing ? undefined : { transform: `rotate(${pull * 3.2}deg)` }}
          strokeWidth={2.5}
        />
      </div>
      {refreshing && <span className="sr-only">Refreshing</span>}
    </div>
  )
}
