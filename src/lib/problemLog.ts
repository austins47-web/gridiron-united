// ══════════════════════════════════════════════════════════════
// The problem log: what fails for people in the app (a crash, a
// request the server refused) goes to client_errors through
// log_client_error, so a break gets noticed the same day instead of
// days later. Silent: it never shows anything or throws, repeats of
// the same problem are skipped for 10 minutes, and one page load sends
// at most 25. The database caps each person at 30 an hour too.
//
// No import of the Supabase client here (it imports this): it hands
// over a sender with startProblemLog.
// ══════════════════════════════════════════════════════════════

interface ProblemRow {
  kind: string
  message: string
  detail: Record<string, unknown> | null
  path: string
  version: string
  agent: string
}

let send: ((row: ProblemRow) => Promise<unknown>) | null = null
const lastSent = new Map<string, number>()
let sentThisPage = 0
const MAX_PER_PAGE = 25
const REPEAT_MS = 10 * 60_000

/** The build, from the hashed name of the app's main script. */
function appVersion(): string {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.src
  return src?.match(/index-([\w-]+)\.js/)?.[1] ?? 'dev'
}

export function logProblem(kind: string, message: string, detail?: Record<string, unknown>) {
  try {
    if (!send || !navigator.onLine || !message) return
    const key = `${kind}:${message}`
    const last = lastSent.get(key)
    if ((last && Date.now() - last < REPEAT_MS) || sentThisPage >= MAX_PER_PAGE) return
    lastSent.set(key, Date.now())
    sentThisPage++
    send({
      kind,
      message: message.slice(0, 500),
      detail: detail ?? null,
      // No query string: it can carry ids and invite codes
      path: location.pathname,
      version: appVersion(),
      agent: navigator.userAgent,
    }).catch(() => {})
  } catch { /* logging must never break anything */ }
}

/** Starts the log: `sender` writes one row; also catches crashes nothing else did. */
export function startProblemLog(sender: (row: ProblemRow) => Promise<unknown>) {
  send = sender
  window.addEventListener('error', e => {
    // Errors from other origins (extensions, embeds) carry no detail
    if (!e.message || e.message === 'Script error.') return
    logProblem('crash', e.message, { source: e.filename, line: e.lineno, col: e.colno, stack: e.error?.stack?.slice(0, 1500) })
  })
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason
    const message = r instanceof Error ? r.message : typeof r === 'string' ? r : JSON.stringify(r ?? null)?.slice(0, 300)
    logProblem('promise', message ?? 'unknown', r instanceof Error ? { stack: r.stack?.slice(0, 1500) } : undefined)
  })
}

/** Refusals that are normal, not a problem with the app. */
function expected(url: URL, status: number, message: string): boolean {
  const p = url.pathname
  if (p.endsWith('/rpc/log_client_error')) return true
  // A wrong password, an email already signed up: the person's mistake
  if (p.startsWith('/auth/v1/') && status < 500) return true
  // supabase-js refreshes an expired session and retries
  if (status === 401 && /jwt expired/i.test(message)) return true
  // .single() finding nothing, paging past the end
  if (p.startsWith('/rest/v1/') && (status === 406 || status === 416)) return true
  // Functions saying no on purpose ("already nudged today", not signed in)
  if (p.startsWith('/functions/v1/') && [401, 403, 404, 409, 429].includes(status)) return true
  return false
}

/**
 * The Supabase client's fetch: notes every request the server refused
 * (a broken policy, a missing column, a function that fell over).
 * Dropped connections aren't logged; a phone losing signal isn't a bug.
 */
export const problemLoggingFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init)
  if (res.status < 400) return res
  try {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const text = await res.clone().text()
    let body: Record<string, any> = {}
    try { body = JSON.parse(text) } catch { /* not JSON */ }
    const message = String(body.message ?? body.error_description ?? body.error ?? body.msg ?? text ?? '').slice(0, 300)
    if (!expected(url, res.status, message)) {
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
      const where = url.pathname.replace(/^\/(rest|functions|storage|auth)\/v1\//, '$1 ')
      logProblem('api', `${res.status} ${method} ${where}: ${message}`, {
        ...(body.code ? { code: body.code } : {}),
        ...(body.hint ? { hint: body.hint } : {}),
        ...(body.details ? { details: String(body.details).slice(0, 300) } : {}),
      })
    }
  } catch { /* logging must never break the request */ }
  return res
}
