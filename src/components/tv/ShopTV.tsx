import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { teamLogoUrl } from '@/components/teams/teamIds'
import { BeltIcon } from '@/components/pickem/Belt'

// ══════════════════════════════════════════════════════════════
// Shop TV — the league's live Pick'Em board, full screen on a TV
//
// /tv/<code> needs no login: the 8-character code the commissioner
// gets in the Commish panel is the key (the shop-tv edge function).
// The board is laid out at 1920×1080 and scaled to whatever screen
// it's on. It keeps the screen awake, hides the cursor, goes full
// screen on a click, and polls every 15s while games are on.
// /tv on its own asks for the code (and remembers it).
// ══════════════════════════════════════════════════════════════

interface TvGame {
  id: string
  away: string
  home: string
  awayScore: number | null
  homeScore: number | null
  state: 'pre' | 'live' | 'final' | 'void'
  clock: string | null
  kickoff: string
  homeChance: number | null
  spread: number | null
  tiebreaker: boolean
  picked: number
  riders: { away: string[]; home: string[] } | null
}

interface TvRow {
  userId: string
  name: string
  avatarUrl: string | null
  correct: number
  played: number
  rank: number
  chance?: number | null
  kickoffChance?: number | null
  weeksWon?: number
  belt: boolean
  winner?: boolean
}

interface TvBoard {
  league: string
  week: number
  now: string
  started: boolean
  complete: boolean
  winners: string[]
  deadline: string | null
  pickedIn: number
  members: number
  nextKickoff: string | null
  games: TvGame[]
  week_table: TvRow[]
  season_table: TvRow[]
  belt: { names: string[]; reign: number } | null
  pin: string | null
  upsets: string[]
}

const CODE_KEY = 'gu-tv-code'
const W = 1920
const H = 1080
const ROWS_PER_PAGE = 15

const weekTitle = (w: number) =>
  w === 19 ? 'Wild Card' : w === 20 ? 'Divisional' : w === 21 ? 'Conference Championships' : w === 22 ? 'Super Bowl' : `Week ${w}`

const kickoffLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })

function remember(code: string | null) {
  try { code ? localStorage.setItem(CODE_KEY, code) : localStorage.removeItem(CODE_KEY) } catch { /* private mode */ }
}
function recall(): string | null {
  try { return localStorage.getItem(CODE_KEY) } catch { return null }
}

// ── /tv: type the code ────────────────────────────────────────
export function ShopTVEntry() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [code, setCode] = useState('')

  // A TV that's shown a board before goes straight back to it
  useEffect(() => {
    const saved = recall()
    if (saved && params.get('change') == null) navigate(`/tv/${saved}`, { replace: true })
  }, [navigate, params])

  const clean = code.toLowerCase().replace(/[^a-z0-9]/g, '')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (clean.length === 8) navigate(`/tv/${clean}`)
  }

  return (
    <div className="fixed inset-0 bg-field-950 flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-xl text-center space-y-6">
        <p className="font-cond font-bold uppercase tracking-[0.3em] text-gold text-lg">Gridiron United</p>
        <h1 className="font-cond font-black uppercase text-white text-6xl">Shop TV</h1>
        <p className="text-field-300 text-xl">Enter the 8-character TV code from your commissioner.</p>
        <input
          autoFocus
          value={code}
          onChange={e => setCode(e.target.value.slice(0, 12))}
          placeholder="e.g. s5bpmhjg"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="w-full text-center font-cond font-black text-5xl tracking-[0.25em] lowercase bg-field-800 border-2 border-field-600 focus:border-gold rounded-2xl py-5 text-white outline-none"
        />
        <button type="submit" disabled={clean.length !== 8} className="btn-gold w-full justify-center !py-4 !text-2xl disabled:opacity-40">
          Show the board
        </button>
      </form>
    </div>
  )
}

// ── /tv/:code: the board ──────────────────────────────────────
export function ShopTV() {
  const { code = '' } = useParams()
  const [board, setBoard] = useState<TvBoard | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'offline' | 'gone'>('loading')
  const scale = useStageScale()
  const idle = useIdleCursor()
  useWakeLock()
  useDarkTheme()

  // Poll: every 15s while a game is on, every minute otherwise
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      let next = 60_000
      try {
        const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shop-tv?token=${encodeURIComponent(code)}`, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
          cache: 'no-store',
        })
        if (r.status === 404) {
          remember(null)
          if (alive) setStatus('gone')
          return
        }
        if (!r.ok) throw new Error(String(r.status))
        const data = (await r.json()) as TvBoard
        if (!alive) return
        setBoard(data)
        setStatus('ok')
        remember(code)
        if (data.games.some(g => g.state === 'live')) next = 15_000
      } catch {
        if (alive) setStatus(s => (s === 'loading' ? 'loading' : 'offline'))
        next = 20_000
      }
      if (alive) timer = setTimeout(load, next)
    }
    load()
    return () => { alive = false; clearTimeout(timer) }
  }, [code])

  // Pick up new versions of the app now and then
  useEffect(() => {
    const t = setTimeout(() => window.location.reload(), 6 * 3600_000)
    return () => clearTimeout(t)
  }, [])

  const goFull = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {})
  }

  return (
    <div
      onClick={goFull}
      className="fixed inset-0 bg-black overflow-hidden flex items-center justify-center"
      style={{ cursor: idle ? 'none' : 'default' }}
    >
      <div
        className="shrink-0 bg-field-950 text-white relative"
        style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'center' }}
      >
        {status === 'gone' ? <Gone />
          : !board ? <Loading />
          : <Board board={board} offline={status === 'offline'} />}
      </div>
    </div>
  )
}

function Loading() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
      <div className="w-16 h-16 rounded-full border-4 border-field-700 border-t-gold animate-spin" />
      <p className="font-cond font-bold uppercase tracking-[0.3em] text-field-400 text-2xl">Loading the board</p>
    </div>
  )
}

function Gone() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-center px-40">
      <p className="font-cond font-black uppercase text-white text-7xl">This TV code doesn&apos;t work</p>
      <p className="text-field-300 text-3xl">
        The commissioner may have reset it. Get the new code from the Commish panel, then go to
        <span className="text-gold font-bold"> /tv</span> and enter it.
      </p>
      <a href="/tv?change=1" className="btn-gold !text-2xl !px-8 !py-4">Enter a new code</a>
    </div>
  )
}

function Board({ board, offline }: { board: TvBoard; offline: boolean }) {
  const clock = useClock()
  const anyLive = board.games.some(g => g.state === 'live')
  const showWeek = board.started
  const table = showWeek ? board.week_table : board.season_table
  const games = useMemo(() => {
    const rank = (g: TvGame) => (g.state === 'live' ? 0 : g.state === 'pre' ? 1 : 2)
    return [...board.games].sort((a, b) => rank(a) - rank(b)
      || (rank(a) === 2
        ? new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime()
        : new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()))
  }, [board.games])

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Header */}
      <header className="h-[104px] shrink-0 flex items-center px-10 border-b-2 border-field-800 bg-field-900">
        <div className="min-w-0 flex-1">
          <p className="font-cond font-bold uppercase tracking-[0.3em] text-gold text-[18px] leading-none">Gridiron United · Pick&apos;Em</p>
          <p className="font-cond font-black uppercase text-white text-[46px] leading-tight truncate">{board.league}</p>
        </div>
        <div className="flex items-center gap-5">
          <span className="font-cond font-black uppercase text-[44px] text-white tracking-wide">{weekTitle(board.week)}</span>
          {anyLive && (
            <span className="flex items-center gap-2 rounded-full bg-red-600/20 border-2 border-red-500/60 px-4 py-1">
              <span className="w-3.5 h-3.5 rounded-full bg-red-500 animate-pulse" />
              <span className="font-cond font-black text-[26px] text-red-300 tracking-wider">LIVE</span>
            </span>
          )}
          {board.complete && (
            <span className="rounded-full bg-gold/20 border-2 border-gold/60 px-4 py-1 font-cond font-black text-[26px] text-gold tracking-wider">FINAL</span>
          )}
        </div>
        <div className="flex-1 flex items-center justify-end gap-5">
          {offline && <span className="text-[20px] font-bold text-amber-300">Reconnecting…</span>}
          <span className="font-cond font-black text-[48px] tabular-nums text-white">{clock}</span>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 flex gap-6 p-6">
        <GamesGrid games={games} />
        <StandingsPanel board={board} rows={table} week={showWeek} />
      </div>

      <Ticker board={board} />
    </div>
  )
}

// ── Games ─────────────────────────────────────────────────────
function GamesGrid({ games }: { games: TvGame[] }) {
  if (games.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center rounded-3xl border-2 border-field-800 text-field-400 text-4xl font-cond font-bold uppercase">
        No games this week
      </div>
    )
  }
  const cols = games.length <= 4 ? 2 : games.length <= 9 ? 3 : 4
  const rows = Math.ceil(games.length / cols)
  return (
    <div
      className="flex-1 min-w-0 grid gap-4"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
    >
      {games.map(g => <GameTile key={g.id} g={g} big={cols <= 3} />)}
    </div>
  )
}

function GameTile({ g, big }: { g: TvGame; big: boolean }) {
  const final = g.state === 'final'
  const live = g.state === 'live'
  const started = live || final
  const winner = final && g.awayScore != null && g.homeScore != null && g.awayScore !== g.homeScore
    ? (g.homeScore > g.awayScore ? g.home : g.away) : null
  const fav = g.homeChance == null || final ? null
    : g.homeChance >= 0.5 ? { team: g.home, pct: g.homeChance } : { team: g.away, pct: 1 - g.homeChance }

  const side = (team: string, score: number | null, riders: string[] | undefined) => {
    const logo = teamLogoUrl({ abbr: team }, 'NFL')
    const lost = winner != null && winner !== team
    return (
      <div className={clsx('flex items-center gap-3', lost && 'opacity-40')}>
        {logo
          ? <img src={logo} alt="" className={clsx('object-contain shrink-0', big ? 'w-14 h-14' : 'w-11 h-11')} />
          : <span className={clsx('shrink-0', big ? 'w-14' : 'w-11')} />}
        <span className={clsx('font-cond font-black tracking-wide', big ? 'text-[40px]' : 'text-[32px]')}>{team}</span>
        {riders && (
          <span className="text-[18px] font-bold text-field-400 whitespace-nowrap">{riders.length} {riders.length === 1 ? 'pick' : 'picks'}</span>
        )}
        <span className={clsx('ml-auto font-cond font-black tabular-nums', big ? 'text-[48px]' : 'text-[38px]', started ? 'text-white' : 'text-field-700')}>
          {started ? (score ?? 0) : '–'}
        </span>
      </div>
    )
  }

  return (
    <div className={clsx(
      'min-h-0 flex flex-col justify-between rounded-2xl border-2 px-5 py-3.5',
      live ? 'border-gold bg-gold/[0.08] shadow-[0_0_30px_rgba(206,123,69,0.25)]'
        : final ? 'border-field-800 bg-field-900/60'
        : 'border-field-700 bg-field-900',
    )}>
      <div className="flex items-center gap-2 text-[20px] font-bold">
        {live && <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse shrink-0" />}
        <span className={clsx('truncate', live ? 'text-gold' : final ? 'text-field-400' : 'text-field-300')}>
          {g.state === 'void' ? 'Postponed' : final ? 'Final' : live ? g.clock : kickoffLabel(g.kickoff)}
        </span>
        {g.tiebreaker && <span className="ml-auto shrink-0 rounded bg-gold/15 text-gold text-[15px] font-black px-2 py-0.5 tracking-wider">TIEBREAKER</span>}
      </div>
      <div className="space-y-1">
        {side(g.away, g.awayScore, g.riders?.away)}
        {side(g.home, g.homeScore, g.riders?.home)}
      </div>
      <div className="text-[18px] text-field-400 truncate">
        {fav
          ? <><span className="font-black text-white">{fav.team} {Math.round(fav.pct * 100)}%</span> to win</>
          : final ? (winner ? `${winner} wins` : 'Tie')
          : ''}
        {!g.riders && g.state === 'pre' && <span> · {g.picked} picked, hidden till kickoff</span>}
      </div>
    </div>
  )
}

// ── Standings ─────────────────────────────────────────────────
function StandingsPanel({ board, rows, week }: { board: TvBoard; rows: TvRow[]; week: boolean }) {
  const pages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE))
  const [page, setPage] = useState(0)
  useEffect(() => {
    if (pages <= 1) { setPage(0); return }
    const t = setInterval(() => setPage(p => (p + 1) % pages), 12_000)
    return () => clearInterval(t)
  }, [pages])
  const shown = rows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE)
  const withChance = week && rows.some(r => r.chance != null)

  return (
    <div className="w-[620px] shrink-0 flex flex-col rounded-3xl border-2 border-field-800 bg-field-900 overflow-hidden">
      {board.complete && board.winners.length > 0 ? (
        <div className="px-6 py-4 bg-gold/15 border-b-2 border-gold/40">
          <p className="font-cond font-bold uppercase tracking-[0.25em] text-gold text-[20px]">{weekTitle(board.week)} champion</p>
          <p className="font-cond font-black uppercase text-white text-[40px] leading-tight truncate">🏆 {board.winners.join(' & ')}</p>
        </div>
      ) : (
        <div className="px-6 py-4 border-b-2 border-field-800 flex items-baseline justify-between">
          <p className="font-cond font-black uppercase text-white text-[34px] tracking-wide">{week ? 'This week' : 'Season standings'}</p>
          {withChance && <p className="font-cond font-bold uppercase tracking-wider text-field-400 text-[18px]">Chance to win</p>}
        </div>
      )}
      <div className="flex-1 min-h-0 flex flex-col px-3 py-2">
        {shown.map(r => {
          const delta = r.chance != null && r.kickoffChance != null ? r.chance - r.kickoffChance : 0
          return (
            <div
              key={r.userId}
              className={clsx(
                'flex-1 max-h-[54px] min-h-0 flex items-center gap-3 px-3 rounded-xl',
                r.winner && 'bg-gold/15',
              )}
            >
              <span className="w-9 text-right font-cond font-black text-[26px] text-field-400 tabular-nums">{r.rank}</span>
              {r.avatarUrl
                ? <img src={r.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                : <span className="w-9 h-9 rounded-full bg-field-700 flex items-center justify-center text-[18px] font-black text-gold shrink-0">{r.name[0]?.toUpperCase()}</span>}
              <span className="min-w-0 flex-1 truncate text-[26px] font-bold text-white">{r.name}</span>
              {r.belt && <BeltIcon className="w-[30px] h-[18px]" />}
              <span className="font-cond font-black text-[28px] tabular-nums text-white w-[92px] text-right">
                {r.correct}<span className="text-field-500 text-[22px]">/{r.played}</span>
              </span>
              {withChance && (
                <span className="w-[112px] text-right font-cond font-black text-[26px] tabular-nums">
                  <span className={clsx((r.chance ?? 0) >= 0.5 ? 'text-gold' : 'text-white')}>{pct(r.chance)}</span>
                  {Math.abs(delta) >= 0.02 && (
                    <span className={clsx('ml-1 text-[18px]', delta > 0 ? 'text-emerald-400' : 'text-red-400')}>{delta > 0 ? '▲' : '▼'}</span>
                  )}
                </span>
              )}
              {!week && r.weeksWon != null && r.weeksWon > 0 && (
                <span className="text-[18px] font-bold text-gold whitespace-nowrap">{r.weeksWon}× 🏆</span>
              )}
            </div>
          )
        })}
      </div>
      {pages > 1 && (
        <div className="flex justify-center gap-2 pb-3">
          {Array.from({ length: pages }, (_, i) => (
            <span key={i} className={clsx('w-3 h-3 rounded-full', i === page ? 'bg-gold' : 'bg-field-700')} />
          ))}
        </div>
      )}
    </div>
  )
}

function pct(p: number | null | undefined): string {
  if (p == null) return '—'
  if (p > 0 && p < 0.01) return '<1%'
  if (p < 1 && p > 0.99) return '>99%'
  return `${Math.round(p * 100)}%`
}

// ── The ticker ────────────────────────────────────────────────
function Ticker({ board }: { board: TvBoard }) {
  const items = useMemo(() => {
    const out: string[] = []
    if (board.pin) out.push(`📌 ${board.pin}`)
    out.push(...board.upsets.map(u => `🚨 ${u}`))
    if (board.started && !board.complete) {
      const lead = [...board.week_table].sort((a, b) => (b.chance ?? 0) - (a.chance ?? 0))[0]
      if (lead?.chance != null) out.push(`Favorite to win ${weekTitle(board.week)}: ${lead.name} (${pct(lead.chance)})`)
    }
    if (!board.started) {
      out.push(`${board.pickedIn} of ${board.members} have made their picks`)
      out.push(board.deadline ? `Picks lock ${kickoffLabel(board.deadline)}` : 'Picks lock at each kickoff')
    }
    if (board.belt) {
      out.push(`🥋 ${board.belt.names.join(' & ')} ${board.belt.names.length > 1 ? 'share' : 'holds'} the Belt${board.belt.reign > 1 ? ` · ${board.belt.reign} weeks straight` : ''}`)
    }
    if (board.nextKickoff) {
      const g = board.games.find(x => x.kickoff === board.nextKickoff && x.state === 'pre')
      out.push(`Next kickoff: ${g ? `${g.away} @ ${g.home}, ` : ''}${kickoffLabel(board.nextKickoff)}`)
    }
    return out
  }, [board])

  if (items.length === 0) return <div className="h-[64px] shrink-0" />
  const text = items.join('     •     ')
  const seconds = Math.max(25, Math.round(text.length * 0.18))
  return (
    <div className="h-[64px] shrink-0 border-t-2 border-field-800 bg-field-900 overflow-hidden flex items-center">
      <style>{'@keyframes tv-ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }'}</style>
      <div className="flex whitespace-nowrap" style={{ animation: `tv-ticker ${seconds}s linear infinite` }}>
        {[0, 1].map(i => (
          <span key={i} className="whitespace-pre font-cond font-bold text-[30px] text-field-200 tracking-wide">
            {text + '     •     '}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── TV plumbing ───────────────────────────────────────────────

/** How much to scale the 1920×1080 board to fit this screen. */
function useStageScale(): number {
  const get = () => Math.min(window.innerWidth / W, window.innerHeight / H)
  const [scale, setScale] = useState(get)
  useEffect(() => {
    const on = () => setScale(get())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return scale
}

/** Keeps the screen from sleeping, where the browser allows it. */
function useWakeLock() {
  useEffect(() => {
    let lock: { release?: () => Promise<void> } | null = null
    const request = async () => {
      try { lock = await (navigator as any).wakeLock?.request('screen') } catch { /* not allowed or unsupported */ }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') request() }
    request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release?.().catch(() => {})
    }
  }, [])
}

/** True once the mouse has sat still for a few seconds. */
function useIdleCursor(): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const wake = () => { setIdle(false); clearTimeout(t); t = setTimeout(() => setIdle(true), 3000) }
    wake()
    window.addEventListener('mousemove', wake)
    return () => { window.removeEventListener('mousemove', wake); clearTimeout(t) }
  }, [])
  return idle
}

/** The board is always dark, whatever the browser last used. */
function useDarkTheme() {
  useEffect(() => {
    const el = document.documentElement
    const prev = el.getAttribute('data-theme')
    el.setAttribute('data-theme', 'dark')
    return () => { if (prev) el.setAttribute('data-theme', prev); else el.removeAttribute('data-theme') }
  }, [])
}

function useClock(): string {
  const fmt = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const [now, setNow] = useState(fmt)
  useEffect(() => {
    const t = setInterval(() => setNow(fmt()), 15_000)
    return () => clearInterval(t)
  }, [])
  return now
}
