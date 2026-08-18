import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props { children: ReactNode; label?: string }
interface State { error: Error | null; info: ErrorInfo | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info })
    console.error('[ErrorBoundary]', this.props.label ?? '', error, info)
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

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
