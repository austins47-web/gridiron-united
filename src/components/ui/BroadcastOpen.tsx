import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * A short, cinematic entrance for genuinely significant moments —
 * entering a league for the first time, draft day starting. Fires
 * exactly once per storageKey, ever, then never again on that
 * device (localStorage-gated) — deliberately rare, since a "wow"
 * moment that plays on every page load stops being one within a
 * day. Always skippable; never blocks the real content, which is
 * already mounted underneath this overlay the whole time.
 *
 * Usage: <BroadcastOpen storageKey={`bcopen-league-${league.id}`}
 *          tagline="NFL + College. One Roster." />
 * Renders nothing if storageKey has already been marked seen.
 */
export function BroadcastOpen({ storageKey, tagline }: { storageKey: string; tagline: string }) {
  const [phase, setPhase] = useState<'hidden' | 'playing' | 'leaving'>(() => {
    try {
      return localStorage.getItem(storageKey) ? 'hidden' : 'playing'
    } catch {
      return 'hidden' // localStorage unavailable (private browsing etc) — fail safe to not showing it
    }
  })

  useEffect(() => {
    if (phase !== 'playing') return
    const dismiss = setTimeout(() => finish(), 2600)
    return () => clearTimeout(dismiss)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  function finish() {
    setPhase('leaving')
    try { localStorage.setItem(storageKey, '1') } catch { /* ignore */ }
    setTimeout(() => setPhase('hidden'), 400)
  }

  if (phase === 'hidden') return null

  const text = 'GRIDIRON UNITED'
  const unitedIdx = text.indexOf('UNITED')

  return createPortal(
    <div
      className={phase === 'leaving' ? 'bcopen-fadeout' : ''}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <div className="bcopen-yardlines" style={{
        position: 'absolute', inset: 0, opacity: 0,
        backgroundImage: 'repeating-linear-gradient(90deg, rgba(163,163,163,.08) 0, rgba(163,163,163,.08) 1px, transparent 1px, transparent 44px)',
      }} />
      <div className="bcopen-sweep" style={{
        position: 'absolute', top: 0, bottom: 0, left: '-40%', width: '40%',
        background: 'linear-gradient(90deg, transparent, rgba(222,145,99,.5), transparent)',
        filter: 'blur(2px)',
      }} />
      <div className="bcopen-bar" style={{
        position: 'absolute', top: '50%', left: '50%', width: 0, height: 2, marginTop: -46,
        background: 'linear-gradient(90deg, transparent, #CE7B45, #DE9163, #CE7B45, transparent)',
      }} />
      <div style={{
        fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, fontSize: 'clamp(28px, 7vw, 48px)',
        letterSpacing: '.02em', textTransform: 'uppercase', color: '#fff', display: 'flex',
      }}>
        {[...text].map((ch, i) => (
          <span key={i} className="bcopen-letter" style={{
            display: 'inline-block', opacity: 0, transform: 'translateY(14px)',
            animationDelay: `${0.9 + i * 0.035}s`,
            color: i >= unitedIdx ? '#CE7B45' : '#fff',
          }}>
            {ch === ' ' ? '\u00A0' : ch}
          </span>
        ))}
      </div>
      <div className="bcopen-tagline" style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, 34px)', opacity: 0,
        fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '.3em',
        textTransform: 'uppercase', color: '#666666', whiteSpace: 'nowrap',
      }}>
        {tagline}
      </div>
      <button
        onClick={finish}
        style={{
          position: 'absolute', bottom: 24, right: 24,
          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 12,
          letterSpacing: '.08em', textTransform: 'uppercase', color: '#666666',
          background: 'transparent', border: '1px solid #303030', borderRadius: 8,
          padding: '7px 14px', cursor: 'pointer',
        }}
      >
        Skip
      </button>
    </div>,
    document.body,
  )
}
