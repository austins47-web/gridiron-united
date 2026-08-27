import { useState, useLayoutEffect, useCallback } from 'react'

interface AnchoredStyle {
  position: 'fixed'
  left: number
  bottom: number
  width?: number
  maxHeight: number
}

/**
 * Positions a popover relative to an anchor element using real
 * viewport coordinates (position: fixed), meant to be rendered via
 * a portal to document.body — NOT position: absolute inside the
 * anchor's own DOM tree.
 *
 * Why: a popover positioned with CSS `absolute` still gets visually
 * clipped by any ancestor with overflow:hidden/auto between it and
 * the viewport — the chat panel is exactly that kind of bounded,
 * clipped container. If the popover grows taller than the space
 * actually available above the anchor, its TOP gets cut off by the
 * panel's own boundary, even though the popover's own CSS never
 * asked to be clipped. That's what was happening to both the GIF
 * picker and (latently, unreported so far) the @mention dropdown.
 *
 * This computes a maxHeight clamped to the real space between the
 * anchor and the top of the viewport, so the popover can never
 * overflow past the screen's own top edge either, and recalculates
 * on resize.
 */
export function useAnchoredPortal(
  anchorRef: React.RefObject<HTMLElement>,
  isOpen: boolean,
  opts: { matchAnchorWidth?: boolean; gap?: number; minHeight?: number; maxHeightCap?: number } = {},
) {
  const { matchAnchorWidth = false, gap = 6, minHeight = 160, maxHeightCap = 360 } = opts
  const [style, setStyle] = useState<AnchoredStyle | null>(null)

  const recalc = useCallback(() => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const spaceAbove = rect.top - 16 // 16px safety margin from the true top of the viewport
    setStyle({
      position: 'fixed',
      left: rect.left,
      bottom: window.innerHeight - rect.top + gap,
      width: matchAnchorWidth ? rect.width : undefined,
      maxHeight: Math.max(minHeight, Math.min(maxHeightCap, spaceAbove)),
    })
  }, [anchorRef, gap, matchAnchorWidth, minHeight, maxHeightCap])

  useLayoutEffect(() => {
    if (!isOpen) { setStyle(null); return }
    recalc()
    window.addEventListener('resize', recalc)
    return () => window.removeEventListener('resize', recalc)
  }, [isOpen, recalc])

  return style
}
