// ══════════════════════════════════════════════════════════════
// How long the app takes to open, step by step. When the first screen
// takes over SLOW_MS to have its data, the steps go to the problem log
// as a 'slow-start', so a slow open can be traced to what held it up:
// the page, the scripts, the session refresh, the screen's code or its
// data. An open that spent any time in the background isn't counted,
// since its clock means nothing.
//
// Steps (ms since the tap): script (the app's code has run), signedIn
// (the session is ready), shell (the header and tabs are up), page (the
// screen's code has arrived), ready (nothing left loading).
// ══════════════════════════════════════════════════════════════

import { logProblem } from './problemLog'

const SLOW_MS = 5000
const steps: Record<string, number> = {}
let background = typeof document !== 'undefined' && document.visibilityState !== 'visible'
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') background = true })
}

/** Notes when a step of opening the app first happened. */
export function bootStep(step: string) {
  if (!(step in steps)) steps[step] = Math.round(performance.now())
}

/**
 * Watches for the first screen to finish loading: its code has arrived
 * and `loading()` (the queries in flight) has stayed false for two looks
 * in a row, so the gap between one query and the next it unlocks
 * doesn't count as done.
 */
export function watchFirstScreen(loading: () => boolean) {
  let quiet = 0
  const timer = setInterval(() => {
    if (!('page' in steps)) return
    quiet = loading() ? 0 : quiet + 1
    if (quiet < 2) return
    clearInterval(timer)
    finish()
  }, 200)
  setTimeout(() => clearInterval(timer), 60_000)
}

function finish() {
  bootStep('ready')
  if (background || steps.ready < SLOW_MS) return
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const files = resources.filter(e => e.name.includes('/assets/') && e.startTime < steps.ready)
    const refresh = resources.find(e => e.name.includes('/auth/v1/token') && e.startTime < steps.ready)
    logProblem('slow-start', `Took over ${SLOW_MS / 1000} seconds to open`, {
      ...steps,
      html: nav ? Math.round(nav.responseEnd) : null,
      files: files.length,
      // Fetched or checked over the network rather than straight from the phone
      filesFromNetwork: files.filter(f => f.transferSize > 0).length,
      slowestFile: Math.round(Math.max(0, ...files.map(f => f.duration))),
      refresh: refresh ? Math.round(refresh.duration) : null,
      network: (navigator as any).connection?.effectiveType ?? null,
      installed: matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true,
    })
  } catch { /* timing must never break anything */ }
}
