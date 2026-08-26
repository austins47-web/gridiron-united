import { useRef, useLayoutEffect } from 'react'

/**
 * FLIP (First, Last, Invert, Play) reorder animation for a keyed
 * list. When items change position — standings re-sorting after a
 * week grades — rows slide to their new spot instead of snapping.
 *
 * Requires the list to be keyed by a stable id (React needs to
 * actually relocate the DOM nodes on reorder, not just re-render
 * content in place — which is exactly what keyed reconciliation
 * already does, so this works with zero changes to how the list
 * itself is rendered).
 *
 * Usage: attach the returned ref to the list's container (e.g.
 * <tbody>), and add data-flip-key={row.id} to each row. Call this
 * with the current ordered array of keys as its argument — the
 * hook re-measures whenever that array's identity changes.
 */
export function useFlipList(keys: string[]) {
  const containerRef = useRef<HTMLElement | null>(null)
  const prevRects = useRef<Map<string, DOMRect>>(new Map())

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const rowEls = container.querySelectorAll<HTMLElement>('[data-flip-key]')
    const newRects = new Map<string, DOMRect>()
    rowEls.forEach(el => {
      newRects.set(el.dataset.flipKey!, el.getBoundingClientRect())
    })

    if (!reduceMotion) {
      rowEls.forEach(el => {
        const key = el.dataset.flipKey!
        const prev = prevRects.current.get(key)
        const next = newRects.get(key)
        if (!prev || !next) return // new row — no sensible prior
                                    // position to animate in from
        const deltaY = prev.top - next.top
        if (Math.abs(deltaY) < 1) return // didn't actually move

        // Invert: snap it back to where it visually was, instantly.
        el.style.transition = 'none'
        el.style.transform = `translateY(${deltaY}px)`
        // Force layout so the browser registers that starting
        // position before the next frame animates it away — without
        // this the browser can coalesce both style writes into one
        // paint and the "from" state never actually renders.
        el.getBoundingClientRect()

        // Play: animate back to the real (zero) position.
        requestAnimationFrame(() => {
          el.style.transition = 'transform .45s cubic-bezier(.2,0,.2,1)'
          el.style.transform = ''
        })
      })
    }

    prevRects.current = newRects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join(',')])

  return containerRef
}
