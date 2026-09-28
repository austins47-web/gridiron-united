import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
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
  total?: number | null
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

interface TvName { name: string; chance: number }

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
  // Added with the rotating panels; optional so an older function still renders
  summary?: { final: number; live: number; left: number; right: number; wrong: number }
  headlines?: { label: string; headline: string; detail: string; team: string | null }[]
  stakes?: { game: string; away: string; home: string; stakes: number; homeChance: number; ifAway: TvName[]; ifHome: TvName[] }[]
  who_can_win?: {
    remaining: number
    rows: { name: string; status: 'clinched' | 'alive'; needs: string[]; tiebreaker: { min: number; max: number | null } | null }[]
    out: number
  } | null
  receipts?: { name: string; team: string; opponent: string; reason: string; result: 'hit' | 'miss' | null }[]
  beats?: { week: number; loser: string; winner: string; loserScore: number; winnerScore: number; peak: number; victims: string[] }[]
  badges?: { name: string; label: string; detail: string }[]
  badges_week?: number | null
  belt_lineage?: { week: number; names: string[] }[]
  belt_longest?: { names: string[]; weeks: number } | null
  leaders?: {
    bestRecord: { name: string; correct: number; played: number } | null
    mostWeeks: string[]
    weeksWon: number
    bestPct: { name: string; correct: number; played: number; pct: number } | null
    basement: { name: string; correct: number; played: number }[]
  }
  chat?: { name: string; text: string; at: string }[]
  roast?: { week: number; text: string } | null
  poll?: { question: string; options: { text: string; votes: number }[]; total: number; closesAt: string | null; commish: boolean } | null
}

const CODE_KEY = 'gu-tv-code'
const W = 1920
const H = 1080

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
  const s = board.summary

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Header */}
      <header className="h-[92px] shrink-0 flex items-center gap-6 px-8 border-b-2 border-field-800 bg-field-900">
        <div className="min-w-0 w-[520px]">
          <p className="font-cond font-bold uppercase tracking-[0.3em] text-gold text-[16px] leading-none">Gridiron United · Pick&apos;Em</p>
          <p className="font-cond font-black uppercase text-white text-[40px] leading-tight truncate">{board.league}</p>
        </div>
        <div className="flex-1 flex items-center justify-center gap-4">
          <span className="font-cond font-black uppercase text-[40px] text-white tracking-wide whitespace-nowrap">{weekTitle(board.week)}</span>
          {anyLive && (
            <span className="flex items-center gap-2 rounded-full bg-red-600/20 border-2 border-red-500/60 px-3.5 py-0.5">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="font-cond font-black text-[22px] text-red-300 tracking-wider">LIVE</span>
            </span>
          )}
          {board.complete && (
            <span className="rounded-full bg-gold/20 border-2 border-gold/60 px-3.5 py-0.5 font-cond font-black text-[22px] text-gold tracking-wider">FINAL</span>
          )}
          {s && (
            <>
              <Chip>{s.final} final{s.live ? ` · ${s.live} live` : ''}{s.left ? ` · ${s.left} to go` : ''}</Chip>
              {s.right + s.wrong > 0 && (
                <Chip>League {s.right}–{s.wrong} · {Math.round((s.right / (s.right + s.wrong)) * 100)}%</Chip>
              )}
            </>
          )}
          {!board.started && <Chip>{board.pickedIn}/{board.members} picked</Chip>}
        </div>
        <div className="w-[260px] flex items-center justify-end gap-4">
          {offline && <span className="text-[18px] font-bold text-amber-300">Reconnecting…</span>}
          <span className="font-cond font-black text-[44px] tabular-nums text-white">{clock}</span>
        </div>
      </header>

      {/* Body: games · standings · the rotating panel */}
      <div className="flex-1 min-h-0 flex gap-[18px] p-5">
        <GamesGrid games={games} />
        <StandingsPanel board={board} rows={table} week={showWeek} />
        <FeaturePanel board={board} />
      </div>

      <Ticker board={board} />
      <Takeover board={board} />
    </div>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-field-800 border border-field-700 px-3.5 py-1 text-[19px] font-bold text-field-200 whitespace-nowrap">
      {children}
    </span>
  )
}

// ── Games ─────────────────────────────────────────────────────
function GamesGrid({ games }: { games: TvGame[] }) {
  if (games.length === 0) {
    return (
      <div className="w-[1010px] shrink-0 flex items-center justify-center rounded-3xl border-2 border-field-800 text-field-400 text-4xl font-cond font-bold uppercase">
        No games this week
      </div>
    )
  }
  const cols = games.length <= 4 ? 2 : games.length <= 9 ? 3 : 4
  const rows = Math.ceil(games.length / cols)
  return (
    <div
      className="w-[1010px] shrink-0 grid gap-3"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
    >
      {games.map(g => <GameTile key={g.id} g={g} big={cols <= 3} />)}
    </div>
  )
}

/** "CHI -3.5" — the favorite's line, from the home team's number. */
function lineLabel(g: TvGame): string | null {
  if (g.spread == null) return null
  if (g.spread === 0) return 'Pick’em'
  return g.spread < 0 ? `${g.home} ${g.spread}` : `${g.away} -${g.spread}`
}

function GameTile({ g, big }: { g: TvGame; big: boolean }) {
  const final = g.state === 'final'
  const live = g.state === 'live'
  const started = live || final
  const winner = final && g.awayScore != null && g.homeScore != null && g.awayScore !== g.homeScore
    ? (g.homeScore > g.awayScore ? g.home : g.away) : null
  const fav = g.homeChance == null || final ? null
    : g.homeChance >= 0.5 ? { team: g.home, pct: g.homeChance } : { team: g.away, pct: 1 - g.homeChance }
  const a = g.riders?.away.length ?? 0
  const h = g.riders?.home.length ?? 0

  const side = (team: string, score: number | null, riders: number | null) => {
    const logo = teamLogoUrl({ abbr: team }, 'NFL')
    const lost = winner != null && winner !== team
    return (
      <div className={clsx('flex items-center gap-2.5', lost && 'opacity-40')}>
        {logo
          ? <img src={logo} alt="" className={clsx('object-contain shrink-0', big ? 'w-12 h-12' : 'w-9 h-9')} />
          : <span className={clsx('shrink-0', big ? 'w-12' : 'w-9')} />}
        <span className={clsx('font-cond font-black tracking-wide', big ? 'text-[36px]' : 'text-[27px]')}>{team}</span>
        {riders != null && (
          <span className="rounded-md bg-field-800 px-1.5 text-[15px] font-bold text-field-300 tabular-nums" title="League picks">{riders}</span>
        )}
        <span className={clsx('ml-auto font-cond font-black tabular-nums', big ? 'text-[44px]' : 'text-[33px]', started ? 'text-white' : 'text-field-700')}>
          {started ? (score ?? 0) : '–'}
        </span>
      </div>
    )
  }

  return (
    <div className={clsx(
      'min-h-0 flex flex-col justify-between rounded-xl border-2 px-3.5 py-2.5',
      live ? 'border-gold bg-gold/[0.08] shadow-[0_0_24px_rgba(206,123,69,0.25)]'
        : final ? 'border-field-800 bg-field-900/60'
        : 'border-field-700 bg-field-900',
    )}>
      <div className="flex items-center gap-2 text-[16px] font-bold">
        {live && <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />}
        <span className={clsx('truncate', live ? 'text-gold' : final ? 'text-field-400' : 'text-field-300')}>
          {g.state === 'void' ? 'Postponed' : final ? 'Final' : live ? g.clock : kickoffLabel(g.kickoff)}
        </span>
        {g.tiebreaker && <span className="ml-auto shrink-0 rounded bg-gold/15 text-gold text-[13px] font-black px-1.5 py-0.5 tracking-wider">TB</span>}
      </div>
      <div className="space-y-0.5">
        {side(g.away, g.awayScore, g.riders ? a : null)}
        {side(g.home, g.homeScore, g.riders ? h : null)}
      </div>
      {/* How the league split, once it's locked */}
      {g.riders && a + h > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden bg-field-800" title="League picks">
          <span className="bg-field-400" style={{ width: `${(a / (a + h)) * 100}%` }} />
          <span className="bg-gold" style={{ width: `${(h / (a + h)) * 100}%` }} />
        </div>
      )}
      <div className="flex items-center gap-2 text-[15px] text-field-400">
        <span className="min-w-0 truncate">
          {fav
            ? <><span className="font-black text-white">{fav.team} {Math.round(fav.pct * 100)}%</span></>
            : final ? (winner ? `${winner} wins` : 'Tie')
            : ''}
        </span>
        <span className="ml-auto shrink-0 whitespace-nowrap">
          {!g.riders && g.state === 'pre'
            ? <>🔒 {g.picked}</>
            : g.state === 'pre' && lineLabel(g) ? lineLabel(g)
            : null}
          {g.state === 'pre' && g.total != null && <span className="ml-2">O/U {g.total}</span>}
        </span>
      </div>
    </div>
  )
}

// ── Standings ─────────────────────────────────────────────────
const TABLE_ROWS = 20

function StandingsPanel({ board, rows, week }: { board: TvBoard; rows: TvRow[]; week: boolean }) {
  const pages = Math.max(1, Math.ceil(rows.length / TABLE_ROWS))
  const [page, setPage] = useState(0)
  useEffect(() => {
    if (pages <= 1) { setPage(0); return }
    const t = setInterval(() => setPage(p => (p + 1) % pages), 12_000)
    return () => clearInterval(t)
  }, [pages])
  const shown = rows.slice(page * TABLE_ROWS, (page + 1) * TABLE_ROWS)
  const withChance = week && rows.some(r => r.chance != null)

  return (
    <div className="w-[440px] shrink-0 flex flex-col rounded-2xl border-2 border-field-800 bg-field-900 overflow-hidden">
      {board.complete && board.winners.length > 0 ? (
        <div className="px-5 py-3 bg-gold/15 border-b-2 border-gold/40">
          <p className="font-cond font-bold uppercase tracking-[0.25em] text-gold text-[16px]">{weekTitle(board.week)} champion</p>
          <p className="font-cond font-black uppercase text-white text-[30px] leading-tight truncate">🏆 {board.winners.join(' & ')}</p>
        </div>
      ) : (
        <div className="px-5 py-3 border-b-2 border-field-800 flex items-baseline justify-between">
          <p className="font-cond font-black uppercase text-white text-[28px] tracking-wide">{week ? 'This week' : 'Season'}</p>
          {withChance && <p className="font-cond font-bold uppercase tracking-wider text-field-400 text-[15px]">Chance to win</p>}
        </div>
      )}
      <div className="flex-1 min-h-0 flex flex-col px-2 py-1.5">
        {shown.map(r => {
          const delta = r.chance != null && r.kickoffChance != null ? r.chance - r.kickoffChance : 0
          return (
            <div key={r.userId} className={clsx('flex-1 max-h-[46px] min-h-0 flex items-center gap-2 px-2 rounded-lg', r.winner && 'bg-gold/15')}>
              <span className="w-7 text-right font-cond font-black text-[21px] text-field-400 tabular-nums">{r.rank}</span>
              {r.avatarUrl
                ? <img src={r.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                : <span className="w-7 h-7 rounded-full bg-field-700 flex items-center justify-center text-[14px] font-black text-gold shrink-0">{r.name[0]?.toUpperCase()}</span>}
              <span className="min-w-0 flex-1 truncate text-[21px] font-bold text-white">{r.name}</span>
              {r.belt && <BeltIcon className="w-[24px] h-[15px]" />}
              <span className="font-cond font-black text-[23px] tabular-nums text-white w-[64px] text-right">
                {r.correct}<span className="text-field-500 text-[17px]">/{r.played}</span>
              </span>
              {withChance && (
                <span className="w-[78px] text-right font-cond font-black text-[21px] tabular-nums whitespace-nowrap">
                  <span className={clsx((r.chance ?? 0) >= 0.5 ? 'text-gold' : 'text-white')}>{pct(r.chance)}</span>
                  <span className={clsx('ml-0.5 text-[14px]', delta > 0 ? 'text-emerald-400' : 'text-red-400', Math.abs(delta) < 0.02 && 'invisible')}>
                    {delta > 0 ? '▲' : '▼'}
                  </span>
                </span>
              )}
              {!week && (r.weeksWon ?? 0) > 0 && (
                <span className="text-[15px] font-bold text-gold whitespace-nowrap">{r.weeksWon}×🏆</span>
              )}
            </div>
          )
        })}
      </div>
      {pages > 1 && (
        <div className="flex justify-center gap-2 pb-2">
          {Array.from({ length: pages }, (_, i) => (
            <span key={i} className={clsx('w-2.5 h-2.5 rounded-full', i === page ? 'bg-gold' : 'bg-field-700')} />
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

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`
}

// ── The rotating panel ────────────────────────────────────────
interface Panel { key: string; title: string; body: ReactNode }

function panelsFor(b: TvBoard): Panel[] {
  const out: Panel[] = []
  const names = (list: string[], max = 4) => list.length <= max ? list.join(', ') : `${list.slice(0, max).join(', ')} +${list.length - max}`

  if (b.pin) {
    out.push({ key: 'pin', title: '📌 From the commissioner', body: <p className="text-[28px] leading-snug text-white whitespace-pre-line">{b.pin}</p> })
  }
  if (b.upsets.length) {
    out.push({ key: 'upsets', title: '🚨 Upset watch', body: (
      <div className="space-y-4">{b.upsets.map((u, i) => <p key={i} className="text-[23px] leading-snug text-white">{u.replace(/^Upset watch: /, '')}</p>)}</div>
    ) })
  }
  if (b.stakes?.length) {
    out.push({ key: 'stakes', title: '🎯 Games that decide it', body: (
      <div className="space-y-5">
        {b.stakes.slice(0, 3).map(sw => (
          <div key={sw.game}>
            <p className="font-cond font-black text-[28px] text-white">{sw.game}</p>
            {([['away', sw.away, sw.ifAway], ['home', sw.home, sw.ifHome]] as const).map(([k, team, list]) => (
              <p key={k} className="text-[19px] leading-snug text-field-300">
                <span className="font-bold text-gold">If {team}:</span> {list.map(x => `${x.name} ${pct(x.chance)}`).join(' · ')}
              </p>
            ))}
          </div>
        ))}
      </div>
    ) })
  }
  if (b.who_can_win && b.who_can_win.rows.length) {
    const w = b.who_can_win
    out.push({ key: 'who', title: '🏁 Who can still win', body: (
      <div className="space-y-2.5">
        <p className="text-[19px] text-field-400">{w.remaining} game{w.remaining === 1 ? '' : 's'} left · {w.out} knocked out</p>
        {w.rows.slice(0, 9).map(r => (
          <div key={r.name} className="flex items-baseline gap-2">
            <span className={clsx('shrink-0 rounded px-1.5 text-[14px] font-black tracking-wider', r.status === 'clinched' ? 'bg-gold text-field-950' : 'bg-emerald-500/20 text-emerald-300')}>
              {r.status === 'clinched' ? 'CLINCHED' : 'ALIVE'}
            </span>
            <span className="text-[22px] font-bold text-white truncate">{r.name}</span>
            {(r.needs.length > 0 || r.tiebreaker) && (
              <span className="text-[17px] text-field-400 truncate">
                needs {r.needs.join(' + ')}{r.tiebreaker ? `${r.needs.length ? ' + ' : ''}TB ${r.tiebreaker.max == null ? `≥${r.tiebreaker.min}` : `${r.tiebreaker.min}–${r.tiebreaker.max}`}` : ''}
              </span>
            )}
          </div>
        ))}
      </div>
    ) })
  }
  if (b.headlines?.length) {
    out.push({ key: 'headlines', title: `📰 ${weekTitle(b.week)} headlines`, body: (
      <div className="space-y-3">
        {b.headlines.slice(0, 6).map(h => (
          <div key={h.label}>
            <p className="font-cond font-bold uppercase tracking-[0.15em] text-gold text-[15px]">{h.label}</p>
            <p className="font-cond font-black text-[25px] text-white leading-tight">{h.headline}</p>
            <p className="text-[16px] text-field-400 leading-snug">{h.detail}</p>
          </div>
        ))}
      </div>
    ) })
  }
  if (b.receipts?.length) {
    out.push({ key: 'receipts', title: '🧾 Receipts', body: (
      <div className="space-y-4">
        {b.receipts.slice(0, 5).map((r, i) => (
          <div key={i}>
            <p className="text-[21px] italic text-white leading-snug">&ldquo;{r.reason}&rdquo;</p>
            <p className="text-[16px] text-field-400">
              {r.name} on <span className="font-bold text-field-200">{r.team}</span> over {r.opponent}
              {r.result && <span className={clsx('font-bold', r.result === 'hit' ? 'text-emerald-400' : 'text-red-400')}> · {r.result === 'hit' ? 'Aged well' : 'Aged badly'}</span>}
            </p>
          </div>
        ))}
      </div>
    ) })
  }
  if (b.chat?.length) {
    out.push({ key: 'chat', title: '💬 Trash talk', body: (
      <div className="space-y-3">
        {b.chat.slice(0, 7).map((m, i) => (
          <div key={i}>
            <p className="text-[16px]"><span className="font-bold text-gold">{m.name}</span> <span className="text-field-500">{ago(m.at)}</span></p>
            <p className="text-[20px] text-white leading-snug line-clamp-2">{m.text}</p>
          </div>
        ))}
      </div>
    ) })
  }
  if (b.poll) {
    const p = b.poll
    const top = Math.max(0, ...p.options.map(o => o.votes))
    out.push({ key: 'poll', title: p.commish ? "📊 The Commish's poll" : '📊 Poll', body: (
      <div className="space-y-3">
        <p className="text-[25px] font-bold text-white leading-snug">{p.question}</p>
        {p.options.map((o, i) => {
          const share = p.total ? o.votes / p.total : 0
          return (
            <div key={i} className="relative overflow-hidden rounded-lg border border-field-700 px-3 py-2">
              <span className={clsx('absolute inset-y-0 left-0', o.votes === top && top > 0 ? 'bg-gold/30' : 'bg-field-700/60')} style={{ width: `${share * 100}%` }} />
              <span className="relative flex justify-between gap-2 text-[19px]">
                <span className="text-white truncate">{o.text}</span>
                <span className="font-bold text-field-200 tabular-nums shrink-0">{Math.round(share * 100)}% · {o.votes}</span>
              </span>
            </div>
          )
        })}
        <p className="text-[15px] text-field-400">{p.total} vote{p.total === 1 ? '' : 's'}{p.closesAt ? (new Date(p.closesAt) < new Date() ? ' · closed' : ` · closes ${kickoffLabel(p.closesAt)}`) : ''}</p>
      </div>
    ) })
  }
  if (b.belt) {
    out.push({ key: 'belt', title: 'The Belt', body: (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <BeltIcon className="w-20 h-12" title="The Belt" />
          <div className="min-w-0">
            <p className="font-cond font-black uppercase text-[32px] text-white leading-tight">{b.belt.names.join(' & ')}</p>
            <p className="text-[17px] text-field-400">{b.belt.reign > 1 ? `${b.belt.reign} weeks straight` : 'Current champ'}</p>
          </div>
        </div>
        {(b.belt_lineage ?? []).length > 0 && (
          <div className="space-y-1.5">
            {[...(b.belt_lineage ?? [])].reverse().slice(0, 8).map(l => (
              <p key={l.week} className="text-[19px] text-field-200"><span className="font-cond font-black text-gold w-14 inline-block">W{l.week}</span>{l.names.join(' & ')}</p>
            ))}
          </div>
        )}
        {b.belt_longest && <p className="text-[16px] text-field-400">Longest reign: {b.belt_longest.names.join(' & ')}, {b.belt_longest.weeks} weeks</p>}
      </div>
    ) })
  }
  if (b.leaders && (b.leaders.bestRecord || b.leaders.basement.length)) {
    const l = b.leaders
    const rec = (x: { correct: number; played: number }) => `${x.correct}–${x.played - x.correct}`
    out.push({ key: 'leaders', title: '📈 Season leaders', body: (
      <div className="space-y-3.5">
        {l.bestRecord && <Stat label="Best record" value={`${l.bestRecord.name} · ${rec(l.bestRecord)}`} />}
        {l.bestPct && <Stat label="Best pick rate" value={`${l.bestPct.name} · ${Math.round(l.bestPct.pct * 100)}%`} />}
        {l.weeksWon > 0 && <Stat label={`Most weeks won (${l.weeksWon})`} value={names(l.mostWeeks)} />}
        {l.basement.length > 0 && <Stat label="The basement" value={l.basement.map(x => `${x.name} ${rec(x)}`).join(' · ')} bad />}
      </div>
    ) })
  }
  if (b.beats?.length) {
    out.push({ key: 'beats', title: '💔 Bad beats', body: (
      <div className="space-y-3.5">
        {b.beats.slice(0, 4).map((x, i) => (
          <div key={i}>
            <p className="text-[21px] font-bold text-white">W{x.week}: {x.loser} lost {x.loserScore}–{x.winnerScore} to {x.winner}</p>
            <p className="text-[16px] text-field-400">Peaked at {pct(x.peak)} · burned {names(x.victims)}</p>
          </div>
        ))}
      </div>
    ) })
  }
  if (b.badges?.length) {
    out.push({ key: 'badges', title: `🏅 Week ${b.badges_week} badges`, body: (
      <div className="space-y-3">
        {b.badges.slice(0, 6).map((x, i) => (
          <div key={i}>
            <p className="text-[20px]"><span className="font-bold text-white">{x.name}</span> <span className="text-gold font-bold">· {x.label}</span></p>
            <p className="text-[16px] text-field-400 leading-snug">{x.detail}</p>
          </div>
        ))}
      </div>
    ) })
  }
  return out
}

function Stat({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) {
  return (
    <div>
      <p className={clsx('font-cond font-bold uppercase tracking-[0.15em] text-[15px]', bad ? 'text-red-400' : 'text-gold')}>{label}</p>
      <p className="text-[21px] font-bold text-white leading-snug">{value}</p>
    </div>
  )
}

const PANEL_MS = 14_000

function FeaturePanel({ board }: { board: TvBoard }) {
  const panels = useMemo(() => panelsFor(board), [board])
  const keys = panels.map(p => p.key).join(',')
  const [i, setI] = useState(0)
  useEffect(() => {
    setI(0)
    if (panels.length <= 1) return
    const t = setInterval(() => setI(x => x + 1), PANEL_MS)
    return () => clearInterval(t)
    // Restart only when the set of panels changes, not on every refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys])
  if (panels.length === 0) return <div className="flex-1 min-w-0" />
  const at = i % panels.length
  const panel = panels[at]
  const next = panels[(at + 1) % panels.length]

  return (
    <div className="flex-1 min-w-0 flex flex-col rounded-2xl border-2 border-field-800 bg-field-900 overflow-hidden">
      <div className="px-5 py-3 border-b-2 border-field-800">
        <p className="font-cond font-black uppercase text-white text-[26px] tracking-wide truncate">{panel.title}</p>
      </div>
      <div key={panel.key + at} className="flex-1 min-h-0 overflow-hidden px-5 py-4 rise-in">
        {panel.body}
      </div>
      {panels.length > 1 && (
        <div className="px-5 py-2.5 border-t-2 border-field-800 flex items-center gap-3">
          <div className="flex gap-1.5">
            {panels.map((p, j) => <span key={p.key} className={clsx('w-2 h-2 rounded-full', j === at ? 'bg-gold' : 'bg-field-700')} />)}
          </div>
          <span className="ml-auto text-[14px] text-field-500 truncate">Next: {next.title.replace(/^\W+\s*/, '')}</span>
        </div>
      )}
    </div>
  )
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
    for (const h of board.headlines ?? []) out.push(`${h.label}: ${h.headline} (${h.detail})`)
    if (board.belt) {
      out.push(`The Belt: ${board.belt.names.join(' & ')}${board.belt.reign > 1 ? ` · ${board.belt.reign} weeks straight` : ''}`)
    }
    for (const x of (board.badges ?? []).slice(0, 4)) out.push(`🏅 ${x.name} earned ${x.label}`)
    if (board.nextKickoff) {
      const g = board.games.find(x => x.kickoff === board.nextKickoff && x.state === 'pre')
      out.push(`Next kickoff: ${g ? `${g.away} @ ${g.home}, ` : ''}${kickoffLabel(board.nextKickoff)}`)
    }
    return out
  }, [board])

  if (items.length === 0) return <div className="h-[56px] shrink-0" />
  const text = items.join('     •     ')
  const seconds = Math.max(30, Math.round(text.length * 0.2))
  return (
    <div className="h-[56px] shrink-0 border-t-2 border-field-800 bg-field-900 overflow-hidden flex items-center">
      <style>{'@keyframes tv-ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }'}</style>
      <div className="flex whitespace-nowrap" style={{ animation: `tv-ticker ${seconds}s linear infinite` }}>
        {[0, 1].map(i => (
          <span key={i} className="whitespace-pre font-cond font-bold text-[27px] text-field-200 tracking-wide">
            {text + '     •     '}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Takeover: the roast (and the champion) full screen now and then ──
const TAKEOVER_EVERY = 5 * 60_000
const TAKEOVER_FOR = 40_000

function Takeover({ board }: { board: TvBoard }) {
  const roast = board.roast?.text ? board.roast : null
  const champ = board.complete && board.winners.length ? board.winners : null
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!roast && !champ) return
    let hide: ReturnType<typeof setTimeout>
    const show = () => { setOn(true); hide = setTimeout(() => setOn(false), roast ? TAKEOVER_FOR : 15_000) }
    const first = setTimeout(show, 60_000)
    const every = setInterval(show, TAKEOVER_EVERY)
    return () => { clearTimeout(first); clearInterval(every); clearTimeout(hide) }
  }, [roast, champ])
  if (!on || (!roast && !champ)) return null

  return (
    <div className="absolute inset-0 z-10 bg-field-950/[0.97] flex flex-col items-center justify-center px-24 py-16 rise-in">
      {champ && (
        <div className="text-center mb-8">
          <p className="font-cond font-bold uppercase tracking-[0.3em] text-gold text-[28px]">{weekTitle(board.week)} champion</p>
          <p className="font-cond font-black uppercase text-white text-[84px] leading-none">🏆 {champ.join(' & ')}</p>
        </div>
      )}
      {roast && (
        <div className="w-full max-w-[1600px]">
          <p className="font-cond font-black uppercase tracking-[0.2em] text-gold text-[30px] mb-4">🎙️ The Commish · {weekTitle(roast.week)} roast</p>
          <p className="text-[27px] leading-[1.45] text-white whitespace-pre-line" style={{ columnCount: roast.text.length > 700 ? 2 : 1, columnGap: 64 }}>
            {roast.text}
          </p>
        </div>
      )}
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
