import { useState, useEffect } from 'react'

/**
 * Live countdown to a deadline. Returns null until inside the final
 * hour (the static formatted date/time is more useful further out
 * than a number that's days from meaning anything), then ticks
 * every second.
 *
 * Uses a two-stage timer rather than deciding once at mount whether
 * to poll: a single setTimeout fires exactly when the deadline
 * crosses into the final hour, THEN the 1-second interval starts.
 * A naive "only start the interval if already inside the hour"
 * check would work at mount but never re-evaluate — someone who
 * opens the page 2 hours early and just leaves the tab open would
 * never see the countdown begin, since the effect only re-runs when
 * deadlineIso itself changes, not on a timer of its own.
 */
export function useCountdown(deadlineIso: string | null) {
  const [msLeft, setMsLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!deadlineIso) { setMsLeft(null); return }
    const deadline = new Date(deadlineIso).getTime()

    let intervalId: ReturnType<typeof setInterval> | undefined
    let startTimeoutId: ReturnType<typeof setTimeout> | undefined

    function startTicking() {
      const tick = () => setMsLeft(Math.max(0, deadline - Date.now()))
      tick()
      intervalId = setInterval(tick, 1000)
    }

    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      setMsLeft(0)
    } else if (remaining <= 60 * 60 * 1000) {
      startTicking()
    } else {
      setMsLeft(null)
      // Fire once, right when this deadline actually enters its
      // final hour, then start the real per-second ticking.
      startTimeoutId = setTimeout(startTicking, remaining - 60 * 60 * 1000)
    }

    return () => {
      if (intervalId) clearInterval(intervalId)
      if (startTimeoutId) clearTimeout(startTimeoutId)
    }
  }, [deadlineIso])

  return msLeft
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
