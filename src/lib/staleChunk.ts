// A lazy-loaded chunk (route or component) can't be found. This happens
// when someone has an old tab open across a deploy: the hashed filenames
// change every build, so the old page asks for a chunk that's gone, and
// the server answers with the app's HTML instead. It isn't a real bug; a
// reload picks up the current build and resolves it every time.

const STALE_CHUNK_PATTERNS = [
  /Failed to fetch dynamically imported module/i,   // Chrome
  /error loading dynamically imported module/i,     // Firefox
  /Importing a module script failed/i,              // Safari
  /is not a valid JavaScript MIME type/i,           // the HTML that came back instead
  /Loading chunk [\w-]+ failed/i,
  /Unable to preload CSS/i,
]

const RELOAD_GUARD_KEY = 'gu_stale_chunk_reload'
// Give up after one attempt so a genuinely broken deploy still shows the
// real error instead of reload-looping forever.
const RELOAD_GUARD_WINDOW_MS = 15_000

export function isStaleChunk(message: string | undefined | null): boolean {
  return !!message && STALE_CHUNK_PATTERNS.some(re => re.test(message))
}

/** Reloads to pick up the current build, once (true if it did). */
export function reloadForStaleChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0)
    if (Date.now() - last < RELOAD_GUARD_WINDOW_MS) return false
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
  } catch { /* no storage: reload anyway, the build check below stops a loop */ }
  window.location.reload()
  return true
}
