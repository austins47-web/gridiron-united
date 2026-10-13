import { useEffect, useRef, useState } from 'react'

/** The event a tap sends to the nearest [data-poke] under it (ZoomPan), instead of picking a city */
export const POKE = 'cq-poke'

/**
 * Something on the parchment that does something when tapped (a sea creature,
 * a compass rose). Put `ref` on an element marked data-poke. `n` counts the
 * pokes (a key, so each one starts its animation over) and `on` holds for
 * `ms` after the last.
 */
export function usePoke<T extends Element>(ms: number) {
  const ref = useRef<T>(null)
  const [n, setN] = useState(0)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let t = 0
    const poke = () => {
      setN(k => k + 1)
      setOn(true)
      window.clearTimeout(t)
      t = window.setTimeout(() => setOn(false), ms)
    }
    el.addEventListener(POKE, poke)
    return () => { el.removeEventListener(POKE, poke); window.clearTimeout(t) }
  }, [ms])
  return { ref, n, on }
}
