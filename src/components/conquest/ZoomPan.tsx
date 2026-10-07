import { useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'
import { Minus, Plus, Maximize2 } from 'lucide-react'
import clsx from 'clsx'

const MAX = 4
const TAP_PX = 8

type View = { s: number; x: number; y: number }

/**
 * A map you can pinch, drag and tap: two fingers zoom (to 4×) around the
 * pinch, one finger drags once zoomed in, and a tap reports the city
 * under it (whatever carries `data-team`). At normal size a one-finger
 * swipe still scrolls the page. On a computer: the + and − buttons, or a
 * trackpad pinch.
 */
export function ZoomPan({ children, onTap, onZoom, className }: {
  children: ReactNode
  onTap?: (team: string | null) => void
  /** the zoom once it settles (a pinch done, a button pressed): for what to draw at that size */
  onZoom?: (s: number) => void
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ s: 1, x: 0, y: 0 })
  // Tell the map the zoom once it's held still a moment (not on every frame of a pinch)
  const onZoomRef = useRef(onZoom)
  onZoomRef.current = onZoom
  useEffect(() => {
    const t = setTimeout(() => onZoomRef.current?.(view.s), 140)
    return () => clearTimeout(t)
  }, [view.s])
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ start: View; d0: number; mid0: { x: number; y: number }; p0: { x: number; y: number }; moved: boolean; multi: boolean } | null>(null)

  const size = () => {
    const r = box.current?.getBoundingClientRect()
    return { w: r?.width ?? 1, h: r?.height ?? 1, left: r?.left ?? 0, top: r?.top ?? 0 }
  }
  const clamp = (v: View): View => {
    const { w, h } = size()
    const s = Math.min(MAX, Math.max(1, v.s))
    return { s, x: Math.min(0, Math.max(w - w * s, v.x)), y: Math.min(0, Math.max(h - h * s, v.y)) }
  }
  /** Zoom to `s`, keeping the point (px in the box) where it is. */
  const zoomAt = (from: View, s: number, px: number, py: number) => {
    const k = Math.min(MAX, Math.max(1, s)) / from.s
    return clamp({ s: from.s * k, x: px - (px - from.x) * k, y: py - (py - from.y) * k })
  }
  const local = (e: { clientX: number; clientY: number }) => {
    const { left, top } = size()
    return { x: e.clientX - left, y: e.clientY - top }
  }
  const begin = () => {
    const pts = [...pointers.current.values()]
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0]
    const d0 = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0
    gesture.current = {
      start: view, d0, mid0: mid, p0: pts[0],
      moved: gesture.current?.moved ?? false,
      multi: (gesture.current?.multi ?? false) || pts.length > 1,
    }
  }

  const down = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pointers.current.set(e.pointerId, local(e))
    box.current?.setPointerCapture(e.pointerId)
    if (pointers.current.size === 1) gesture.current = null
    begin()
  }
  const move = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return
    pointers.current.set(e.pointerId, local(e))
    const g = gesture.current
    const pts = [...pointers.current.values()]
    if (pts.length > 1) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      const z = zoomAt(g.start, g.start.s * (d / (g.d0 || d)), g.mid0.x, g.mid0.y)
      setView(clamp({ s: z.s, x: z.x + (mid.x - g.mid0.x), y: z.y + (mid.y - g.mid0.y) }))
      g.moved = true
    } else {
      const dx = pts[0].x - g.p0.x, dy = pts[0].y - g.p0.y
      if (Math.hypot(dx, dy) > TAP_PX) g.moved = true
      if (g.start.s > 1 && g.moved) setView(clamp({ ...g.start, x: g.start.x + dx, y: g.start.y + dy }))
    }
  }
  const up = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (pointers.current.size > 0) { begin(); return }
    gesture.current = null
    // A cancel is the browser taking over (scrolling the page): never a tap
    if (e.type === 'pointerup' && g && !g.moved && !g.multi && onTap) {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      onTap(el?.closest('[data-team]')?.getAttribute('data-team') ?? null)
    }
  }
  // A trackpad pinch arrives as a ctrl+wheel (a plain wheel still scrolls the page). Its own
  // listener, since React's can't stop the browser zooming the whole page instead.
  const zoomRef = useRef(zoomAt)
  zoomRef.current = zoomAt
  useEffect(() => {
    const el = box.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const px = e.clientX - r.left, py = e.clientY - r.top
      setView(v => zoomRef.current(v, v.s * Math.exp(-e.deltaY / 200), px, py))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])
  const step = (k: number) => {
    const { w, h } = size()
    setView(v => zoomAt(v, v.s * k, w / 2, h / 2))
  }

  const zoomed = view.s > 1.001
  return (
    <div className={clsx('relative', className)}>
      <div
        ref={box}
        className="relative overflow-hidden rounded-xl select-none"
        style={{ touchAction: zoomed ? 'none' : 'pan-y' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <div style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, transformOrigin: '0 0' }}>
          {children}
        </div>
      </div>
      <div className="absolute right-2 bottom-2 flex flex-col gap-1">
        <button type="button" onClick={() => step(1.6)} disabled={view.s >= MAX} aria-label="Zoom in" className="w-8 h-8 rounded-lg bg-field-900/85 border border-field-600 text-white flex items-center justify-center disabled:opacity-40">
          <Plus className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => step(1 / 1.6)} disabled={!zoomed} aria-label="Zoom out" className="w-8 h-8 rounded-lg bg-field-900/85 border border-field-600 text-white flex items-center justify-center disabled:opacity-40">
          <Minus className="w-4 h-4" />
        </button>
        {zoomed && (
          <button type="button" onClick={() => setView({ s: 1, x: 0, y: 0 })} aria-label="Show the whole map" className="w-8 h-8 rounded-lg bg-field-900/85 border border-field-600 text-white flex items-center justify-center">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
