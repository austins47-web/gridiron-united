import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props { children: ReactNode; label?: string }
interface State { error: Error | null; info: ErrorInfo | null }

// A lazy-loaded chunk (route or component) can't be found. This
// happens when someone has an old tab open across a deploy — the
// hashed filenames change every build, so the browser's cached
// index.html points at a chunk that no longer exists on the server.
// It isn't a real bug; a reload picks up the current build and
// resolves it every time.
const STALE_CHUNK_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk [\w-]+ failed/i,
  /Unable to preload CSS/i,
]

const RELOAD_GUARD_KEY = 'gu_stale_chunk_reload'
// Give up after one attempt so a genuinely broken deploy still shows
// the real error instead of reload-looping forever.
const RELOAD_GUARD_WINDOW_MS = 15_000

function isStaleChunkError(error: Error): boolean {
  return STALE_CHUNK_PATTERNS.some(re => re.test(error.message))
}

function alreadyTriedReload(): boolean {
  const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0)
  return Date.now() - last < RELOAD_GUARD_WINDOW_MS
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info })
    console.error('[ErrorBoundary]', this.props.label ?? '', error, info)

    if (isStaleChunkError(error) && !alreadyTriedReload()) {
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
      window.location.reload()
    }
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

    const stale = isStaleChunkError(error)

    if (stale) {
      // The reload from componentDidCatch is already in flight (or
      // was tried and is being retried). Show something calm rather
      // than a red crash screen while it happens.
      return (
        <div className="max-w-md mx-auto my-8 bg-field-800 border border-field-700 rounded-2xl p-6 text-center space-y-3">
          <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto" />
          <h2 className="font-cond font-black text-base text-white uppercase tracking-wider">
            Updating…
          </h2>
          <p className="text-sm text-field-400">
            The app was just updated. Reloading to get the latest version.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn-gold"
          >
            Reload now
          </button>
        </div>
      )
    }

    return (
      <div className="max-w-2xl mx-auto my-8 bg-field-800 border border-red-500/40 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">⚠️</span>
          <h2 className="font-cond font-black text-lg text-red-400 uppercase tracking-wider">
            {this.props.label ?? 'Something broke'}
          </h2>
        </div>

        <div className="bg-field-900 border border-field-700 rounded-xl p-3">
          <p className="text-xs text-field-400 uppercase tracking-wider font-bold mb-1">Error</p>
          <p className="text-sm text-white font-mono break-words">{error.message}</p>
        </div>

        {error.stack && (
          <details className="bg-field-900 border border-field-700 rounded-xl p-3">
            <summary className="text-xs text-field-400 uppercase tracking-wider font-bold cursor-pointer">
              Stack trace
            </summary>
            <pre className="text-[10px] text-field-300 mt-2 overflow-x-auto whitespace-pre-wrap">
              {error.stack}
            </pre>
          </details>
        )}

        {info?.componentStack && (
          <details className="bg-field-900 border border-field-700 rounded-xl p-3">
            <summary className="text-xs text-field-400 uppercase tracking-wider font-bold cursor-pointer">
              Component stack
            </summary>
            <pre className="text-[10px] text-field-300 mt-2 overflow-x-auto whitespace-pre-wrap">
              {info.componentStack}
            </pre>
          </details>
        )}

        <button
          onClick={() => this.setState({ error: null, info: null })}
          className="btn-gold"
        >
          Try again
        </button>
      </div>
    )
  }
}
