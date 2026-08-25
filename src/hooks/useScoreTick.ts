import { useEffect, useRef, useState } from 'react'

/**
 * Animates a score from its previous value up to a new one whenever
 * it actually changes, with a brief highlight flash. Returns the
 * value to render and whether the flash class should be applied.
 *
 * Only animates on a real change — mounting with an initial score
 * (e.g. loading a page mid-game) shows the real number immediately,
 * no count-up from zero.
 */
export function useScoreTick(score: number) {
  const [display, setDisplay] = useState(score)
  const [flashing, setFlashing] = useState(false)
  const prevRef = useRef(score)
  const rafRef = useRef<number>()
  const mountedRef = useRef(false)

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = score

    if (!mountedRef.current) {
      mountedRef.current = true
      setDisplay(score)
      return
    }
    if (score === prev) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      setDisplay(score)
      return
    }

    setFlashing(true)
    const from = prev, to = score, dur = 550, start = performance.now()

    function step(now: number) {
      const p = Math.min((now - start) / dur, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (p < 1) rafRef.current = requestAnimationFrame(step)
      else setTimeout(() => setFlashing(false), 400)
    }
    rafRef.current = requestAnimationFrame(step)

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [score])

  return { display, flashing }
}
