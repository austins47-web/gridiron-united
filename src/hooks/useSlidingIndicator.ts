import { useRef, useLayoutEffect, useState } from 'react'

/**
 * Drives a sliding pill indicator for any tab/toggle group.
 *
 * Usage: put `ref={containerRef}` + `className="relative"` on the tab
 * row, `data-tab-key={value}` on each button, and render one
 * absolutely-positioned indicator div using `indicatorStyle` behind
 * the buttons (indicator needs z-0, buttons need relative z-10).
 */
export function useSlidingIndicator<T extends string | number>(activeKey: T) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState({ left: 0, width: 0, ready: false })

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const el = container.querySelector(`[data-tab-key="${activeKey}"]`) as HTMLElement | null
    if (!el) return
    const cRect = container.getBoundingClientRect()
    const eRect = el.getBoundingClientRect()
    setStyle({ left: eRect.left - cRect.left, width: eRect.width, ready: true })
  }, [activeKey])

  return {
    containerRef,
    indicatorStyle: {
      transform: `translateX(${style.left}px)`,
      width: `${style.width}px`,
      // No slide-in from (0,0) on first paint — snap into place once,
      // then animate every change after.
      transition: style.ready ? 'transform .3s cubic-bezier(.65,0,.35,1), width .3s cubic-bezier(.65,0,.35,1)' : 'none',
      opacity: style.ready ? 1 : 0,
    } as React.CSSProperties,
  }
}
