import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'
import { Minus, Plus, Shrink, Expand } from 'lucide-react'
import clsx from 'clsx'

const MAX = 5
const TAP_PX = 8

type View = { s: number; x: number; y: number }

/**
 * A map you can pinch, drag and tap: two fingers zoom around the pinch,
 * one finger drags once zoomed in, and a tap reports the city under it
 * (whatever carries `data-team`). At normal size a one-finger swipe still
 * scrolls the page, but once a finger's on the map a second one makes it
 * a pinch (the page can't take it over halfway). On a computer: the + and
 * − buttons, or a trackpad pinch.
 *
 * Inline, the map is its frame's width and zooms from there (1× to 5×).
 * With `fill` (full screen), the frame is whatever space it's given and
 * the map opens filling it edge to edge (centered on `focus`), the way a
 * map app does, unless the whole map already nearly fills it; you can
 * pinch out until all of it shows.
 *
 * A pinch stretches the picture (quick, a little soft); once the fingers
 * are off and the zoom holds still a moment, the map's laid out at that
 * size for real, so the browser draws it sharp again. `--cq-s` carries the
 * live zoom for the map's labels to hold their size by.
 */
export function ZoomPan({ children, onTap, onZoom, onExpand, fill = false, focus, className }: {
  children: ReactNode
  onTap?: (team: string | null) => void
  /** shows a button to open the map full screen */
  onExpand?: () => void
  /** the zoom once it settles (a pinch done, a button pressed): for what to draw at that size */
  onZoom?: (s: number) => void
  /** fill the space it's given, map-app style (full screen) */
  fill?: boolean
  /** where to center a filled map when it opens, as fractions of the map's width and height */
  focus?: { x: number; y: number }
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ s: 1, x: 0, y: 0 })
  // The latest view, for gestures to start from (a frame can pass before the state catches up)
  const viewRef = useRef(view)
  const put = (next: View | ((v: View) => View)) => {
    const v = typeof next === 'function' ? next(viewRef.current) : next
    viewRef.current = v
    setView(v)
  }
  // A finger on the map: any second one is a pinch, not the page's
  const [touching, setTouching] = useState(false)

  // The size the map's actually laid out at, and its height at 1× (the inline frame keeps it)
  const [base, setBase] = useState(1)
  const baseRef = useRef(1)
  baseRef.current = base
  const [natural, setNatural] = useState<number | null>(null)
  const naturalRef = useRef<number | null>(null)
  naturalRef.current = natural
  const onZoomRef = useRef(onZoom)
  onZoomRef.current = onZoom
  useEffect(() => {
    // Not mid-gesture: re-laying the map out under your fingers would hitch the pinch
    if (touching) return
    const t = setTimeout(() => {
      const el = inner.current
      if (el) setNatural(el.offsetHeight / baseRef.current)
      setBase(view.s)
      onZoomRef.current?.(view.s)
    }, 140)
    return () => clearTimeout(t)
  }, [view.s, touching])
  useEffect(() => {
    const el = inner.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setNatural(entry.contentRect.height / baseRef.current))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ start: View; d0: number; mid0: { x: number; y: number }; p0: { x: number; y: number }; moved: boolean; multi: boolean } | null>(null)
  const frame = useRef(0)

  const size = () => {
    const r = box.current?.getBoundingClientRect()
    return { w: r?.width ?? 1, h: r?.height ?? 1, left: r?.left ?? 0, top: r?.top ?? 0 }
  }
  /** The map's height at 1× (its width at 1× is the frame's) */
  const mapH = (h: number) => naturalRef.current ?? inner.current?.offsetHeight ?? h
  /** How far it zooms: inline 1× to 5×; filled, from the whole map showing to 5× past filling */
  const range = () => {
    const { w, h } = size()
    if (!fill) return { min: 1, max: MAX, cover: 1, w, h }
    const mh = mapH(h)
    const contain = Math.min(1, h / mh), cover = Math.max(1, h / mh)
    return { min: contain, max: Math.max(MAX, cover * 2.5), cover, w, h }
  }
  const clamp = (v: View): View => {
    const { min, max, w, h } = range()
    const s = Math.min(max, Math.max(min, v.s))
    const cw = w * s, ch = mapH(h) * s
    // Bigger than the frame: keep it covering the frame. Smaller: centered in it
    const x = cw >= w ? Math.min(0, Math.max(w - cw, v.x)) : (w - cw) / 2
    const y = ch >= h ? Math.min(0, Math.max(h - ch, v.y)) : (h - ch) / 2
    return { s, x, y }
  }
  /** Zoom to `s`, keeping the point (px in the frame) where it is. */
  const zoomAt = (from: View, s: number, px: number, py: number) => {
    const { min, max } = range()
    const k = Math.min(max, Math.max(min, s)) / from.s
    return clamp({ s: from.s * k, x: px - (px - from.x) * k, y: py - (py - from.y) * k })
  }
  /** Where a filled map opens: filling the frame, centered on the focus (or all of it, if that nearly fills it) */
  const opening = (): View => {
    const { min, cover, w, h } = range()
    const mh = mapH(h)
    // How much of the frame the whole map leaves empty
    const empty = 1 - (w * min * mh * min) / (w * h)
    const s = empty > 0.3 ? cover : min
    const fx = focus?.x ?? 0.5, fy = focus?.y ?? 0.5
    return clamp({ s, x: w / 2 - fx * w * s, y: h / 2 - fy * mh * s })
  }
  // A filled map opens filling its frame
  const opened = useRef(false)
  useLayoutEffect(() => {
    if (!fill || opened.current || !inner.current) return
    opened.current = true
    put(opening())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fill])
  const local = (e: { clientX: number; clientY: number }) => {
    const { left, top } = size()
    return { x: e.clientX - left, y: e.clientY - top }
  }
  const begin = () => {
    const pts = [...pointers.current.values()]
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0]
    const d0 = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0
    gesture.current = {
      start: viewRef.current, d0, mid0: mid, p0: pts[0],
      moved: gesture.current?.moved ?? false,
      multi: (gesture.current?.multi ?? false) || pts.length > 1,
    }
  }

  // The view from where the fingers are now: once per screen frame, however often they report
  const apply = () => {
    frame.current = 0
    const g = gesture.current
    if (!g) return
    const pts = [...pointers.current.values()]
    if (pts.length > 1) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      const z = zoomAt(g.start, g.start.s * (d / (g.d0 || d)), g.mid0.x, g.mid0.y)
      put(clamp({ s: z.s, x: z.x + (mid.x - g.mid0.x), y: z.y + (mid.y - g.mid0.y) }))
    } else if (pts.length === 1 && g.moved && (fill || g.start.s > 1)) {
      put(clamp({ ...g.start, x: g.start.x + (pts[0].x - g.p0.x), y: g.start.y + (pts[0].y - g.p0.y) }))
    }
  }

  const down = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pointers.current.set(e.pointerId, local(e))
    // Follow the finger even off the map (a browser that won't is fine: we still get it over the map)
    try { box.current?.setPointerCapture(e.pointerId) } catch { /* not a pointer it can capture */ }
    if (pointers.current.size === 1) gesture.current = null
    setTouching(true)
    begin()
  }
  const move = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return
    pointers.current.set(e.pointerId, local(e))
    const g = gesture.current
    const pts = [...pointers.current.values()]
    if (pts.length > 1 || Math.hypot(pts[0].x - g.p0.x, pts[0].y - g.p0.y) > TAP_PX) g.moved = true
    if (!frame.current) frame.current = requestAnimationFrame(apply)
  }
  const up = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    if (frame.current) { cancelAnimationFrame(frame.current); apply() }
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (pointers.current.size > 0) { begin(); return }
    gesture.current = null
    setTouching(false)
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
      const v = zoomRef.current(viewRef.current, viewRef.current.s * Math.exp(-e.deltaY / 200), px, py)
      viewRef.current = v
      setView(v)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])
  const step = (k: number) => {
    const { w, h } = size()
    put(v => zoomAt(v, v.s * k, w / 2, h / 2))
  }

  const { min, max } = range()
  const zoomed = view.s > min + 0.001
  return (
    <div className={clsx('relative', fill && 'flex flex-col', className)}>
      <div
        ref={box}
        className={clsx('relative overflow-hidden rounded-xl select-none', fill && 'flex-1 min-h-0')}
        style={{ touchAction: fill || zoomed || touching ? 'none' : 'pan-y', height: !fill && base > 1 && natural ? natural : undefined }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <div
          ref={inner}
          style={{
            ...(base !== 1 || fill ? { position: 'absolute', left: 0, top: 0, width: `${base * 100}%` } : {}),
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.s / base})`,
            transformOrigin: '0 0',
            ['--cq-s' as string]: view.s,
          }}
        >
          {children}
        </div>
      </div>
      <div className="absolute right-2 bottom-2 flex flex-col gap-1">
        {onExpand && (
          <button type="button" onClick={onExpand} aria-label="Open the map full screen" title="Bigger map" className="w-8 h-8 rounded-lg bg-gold/90 border border-gold text-field-950 flex items-center justify-center mb-1">
            <Expand className="w-4 h-4" />
          </button>
        )}
        <button type="button" onClick={() => step(1.6)} disabled={view.s >= max - 0.001} aria-label="Zoom in" className="w-8 h-8 rounded-lg bg-field-900/85 border border-field-600 text-white flex items-center justify-center disabled:opacity-40">
          <Plus className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => step(1 / 1.6)} disabled={!zoomed} aria-label="Zoom out" className="w-8 h-8 rounded-lg bg-field-900/85 border border-field-600 text-white flex items-center justify-center disabled:opacity-40">
          <Minus className="w-4 h-4" />
        </button>
        {zoomed && (
          <button type="button" onClick={() => put(clamp({ s: min, x: 0, y: 0 }))} aria-label="Show the whole map" className="w-8 h-8 rounded-lg bg-field-900/85 border border-field-600 text-white flex items-center justify-center">
            <Shrink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
