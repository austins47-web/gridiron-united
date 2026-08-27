import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders a modal overlay via a portal straight to document.body,
 * and locks page scroll while it's open.
 *
 * Every modal in this app that used a bare `.modal-overlay` div
 * rendered inside the normal component tree — which sits inside
 * AppShell's `.route-enter` page-transition wrapper. That wrapper's
 * animation ends on `transform: translateY(0)`, and per the CSS
 * spec, ANY element with a transform (even a resting, visually
 * no-op one) becomes a new containing block for its `position:fixed`
 * descendants. So "fixed to the viewport" was silently "fixed to
 * the scrollable page content's own box" instead — the same root
 * cause already found and fixed individually in PlayerProfileDrawer
 * and GameDetailModal. Visually this showed up as a heavy black
 * margin around the modal instead of it truly covering the screen.
 *
 * Usage: replace the outer `<div className="modal-overlay" onClick={onClose}>`
 * with `<ModalPortal onClose={onClose}>`, keep everything else
 * (the `.modal-box` and its contents) unchanged as children.
 */
export function ModalPortal({
  children, onClose, className = 'modal-overlay',
}: {
  children: ReactNode
  onClose: () => void
  className?: string
}) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return createPortal(
    <div className={className} onClick={onClose}>
      {children}
    </div>,
    document.body,
  )
}
