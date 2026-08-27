import { useState, useRef, useCallback } from 'react'

/**
 * A brief broadcast-style "cut" between feeds — for the NFL/CFB
 * toggle specifically, so switching between the only two leagues
 * this app combines feels like something is actually happening,
 * not just a tab click. Deliberately quick (~380ms) and only ever
 * fires on an intentional tab change, never on data refetches.
 */
export function useFeedCut() {
  const [cutting, setCutting] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const trigger = useCallback(() => {
    setCutting(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setCutting(false), 380)
  }, [])

  return { cutting, trigger }
}

/**
 * Drop inside a `position: relative` container wrapping whatever
 * content should appear to "cut" — the league tabs' content area.
 */
export function FeedCutOverlay({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <div className="feed-cut-overlay" aria-hidden="true">
      <div className="feed-cut-scanline" />
    </div>
  )
}
