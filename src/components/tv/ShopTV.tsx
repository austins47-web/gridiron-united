import { createContext, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type RefObject } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { supabase } from '@/lib/supabase'
import { brandVars, DEFAULT_GOLD } from '@/lib/brand'
import { weatherLabel, skyNow, type GameWeather } from '@/lib/weather'
import { teamGlow } from '@/lib/teamColors'
import { ConquestPanel, ConquestMapShow, WarReport } from './ConquestTV'
import type { ConquestData } from '@/components/conquest/conquestView'
import { parseShopHours, isShopOpen, nextShopOpen, backLabel, type ShopHours } from '@/lib/shopHours'
import { teamLogoUrl } from '@/components/teams/teamIds'
import { BeltIcon } from '@/components/pickem/Belt'
import { useHolidayTheme, TV_MOMENTS, type HolidayTheme, type TvMoment } from '@/lib/holiday'
import { HolidayPill, HolidayParticles } from '@/components/ui/Holiday'
import { HolidayScene, PlayMoment, MOMENT_CSS, MOMENT_MS } from './HolidayScene'
import { ACHIEVEMENTS } from '@/components/pickem/standings'
import { ACHIEVEMENT_ICONS } from '@/components/pickem/achievementIcons'

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
  /** Live only: the team with the ball, "3rd & 7 at MIA 23", red zone, the last play. */
  possession?: string | null
  downDistance?: string | null
  redZone?: boolean
  lastPlay?: string | null
  /** Stadium weather at kickoff (sync-odds). */
  weather?: GameWeather | null
}

interface TvSpotlight {
  name: string
  avatarUrl: string | null
  rank: number
  of: number
  correct: number
  played: number
  weeksWon: number
  archetype: { title: string; blurb: string } | null
  badges: string[]
  twin: { name: string; agree: number } | null
  nemesis: { name: string; split: number; youRight: number; theyRight: number } | null
  beltWeeks: number[]
}

interface TvInjury { team: string; name: string; pos: string; status: 'out' | 'questionable' }

interface TvRow {
  userId: string
  name: string
  avatarUrl: string | null
  correct: number
  played: number
  rank: number
  chance?: number | null
  /** Chance just before the games on now kicked off — the arrow. */
  trendFrom?: number | null
  weeksWon?: number
  belt: boolean
  /** The badge they show next to their name. */
  flair?: string | null
  winner?: boolean
}

interface TvName { name: string; chance: number }

/** A finished game's best and worst pick receipts (the TV pops them up as it ends). */
interface TvGameReceipt {
  gameId: string
  away: string
  home: string
  awayScore: number | null
  homeScore: number | null
  winner: string
  right: number
  pickers: number
  best: { name: string; team: string; reason: string } | null
  worst: { name: string; team: string; reason: string } | null
}

/** The finished week, for the replay. */
interface TvReplay {
  week: number
  champion: { names: string[]; correct: number; played: number; tiebreak: { guess: number; actual: number | null } | null }
  headlines: { label: string; headline: string; detail: string }[]
  blown: { names: string[]; took: string; winner: string; right: number; of: number }[]
  badBeat: { loser: string; winner: string; loserScore: number; winnerScore: number; peak: number; victims: string[] } | null
  belt: { holders: string[]; from: string[]; defended: boolean } | null
  agedWorst: { name: string; team: string; reason: string }[]
  badges: { name: string; label: string; detail: string }[]
  climber: { name: string; from: number; to: number } | null
  faller: { name: string; from: number; to: number } | null
  basement: { names: string[]; correct: number; played: number } | null
}

interface TvBoard {
  league: string
  gameReceipts?: TvGameReceipt[]
  /** Conquest, while the league's at war */
  conquest?: ConquestData | null
  replay?: TvReplay | null
  /** The league's logo, and the TV's own accent color (Commish panel → Shop TV). */
  brand?: { logo: string | null; color?: string | null; theme?: string | null; music?: boolean; player?: boolean; location?: { name: string; lat: number; lon: number } | null; hours?: unknown }
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
  /** What the arrows measure: "since PHI-CHI kicked off". */
  trend_label?: string | null
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
  /** The league chat and the TV chat together, newest first (text only). */
  chat?: { id?: string; name: string; text: string; at: string }[]
  roast?: { week: number; text: string } | null
  poll?: { question: string; options: { text: string; votes: number }[]; total: number; closesAt: string | null; commish: boolean } | null
  /** Every pick on every game: a team, '?' while it can still be picked, null for no pick. */
  board?: {
    games: { id: string; away: string; home: string; winner: string | null; final: boolean; live: boolean; tiebreaker: boolean; locked: boolean }[]
    rows: { userId: string; cells: Record<string, string | null>; tiebreaker: number | null }[]
  }
  /** Who still owes picks, while any game can be picked. */
  shame?: { lockAt: string | null; open: number; rows: { name: string; missing: number; none: boolean; noTiebreaker: boolean }[] } | null
  spotlights?: TvSpotlight[]
  next_week?: { week: number; games: { away: string; home: string; kickoff: string; spread: number | null; total: number | null; homeChance: number }[] } | null
  injuries?: TvInjury[]
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

  // Closing time: asleep outside the shop's hours (Commish panel → Shop TV),
  // or since the remote's Sleep (until the shop next opens, or for good
  // without hours; it outlasts a reload). Any other remote button, or OK
  // on the TV, wakes it for half an hour. "Back to normal" goes back to
  // the shop's hours: asleep if it's after them, awake if not.
  const [wakeUntil, setWakeUntil] = useState(0)
  const [sleepUntil, setSleepUntil] = useState(() => readSleep(code))
  useEffect(() => { writeSleep(code, sleepUntil) }, [code, sleepUntil])
  const hours = useMemo(() => parseShopHours(board?.brand?.hours), [board?.brand?.hours])
  const sleep = useAsleep(hours, wakeUntil, sleepUntil)
  const asleep = sleep !== null
  const asleepNow = useRef(asleep)
  asleepNow.current = asleep
  useTvRemote(r => {
    if (r.action === 'sleep') {
      setWakeUntil(0)
      setSleepUntil(hours ? nextShopOpen(hours, new Date())?.getTime() ?? Infinity : Infinity)
    } else if (r.action === 'clear') {
      setWakeUntil(0)
      setSleepUntil(0)
    } else if (r.action !== 'reload' && r.action !== 'poll_votes') {
      setSleepUntil(0)
      setWakeUntil(Date.now() + WAKE_MS)
    }
  })
  useEffect(() => {
    if (!asleep) return
    const wake = () => { setSleepUntil(0); setWakeUntil(Date.now() + WAKE_MS) }
    window.addEventListener('keydown', wake)
    window.addEventListener('click', wake)
    return () => { window.removeEventListener('keydown', wake); window.removeEventListener('click', wake) }
  }, [asleep])
  // Awake again: the latest, not what it had when it dozed off
  const wasAsleep = useRef(false)
  useEffect(() => {
    if (wasAsleep.current && !asleep) window.dispatchEvent(new Event(TV_REFRESH))
    wasAsleep.current = asleep
  }, [asleep])

  // Poll: every 30s while a game is on (scores sync every 2 minutes),
  // every 10s in the last few minutes before a lock, and every 5
  // minutes otherwise — a TV left on all week was ~1,500 calls a day.
  // Asleep after hours, every 15 minutes (2 while a game's on). None at
  // all while the page can't be seen (onScreen).
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      let next = 5 * 60_000
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
        // On, or past kickoff but not marked live yet
        const sinceKickoff = (g: TvGame) => Date.now() - new Date(g.kickoff).getTime()
        if (data.games.some(g => g.state === 'live' || (g.state === 'pre' && sinceKickoff(g) >= 0 && sinceKickoff(g) < 6 * 3_600_000))) next = 30_000
        // Close to a lock, check often so the reveal starts right on time
        const lockAt = [data.deadline, data.nextKickoff]
          .map(t => (t ? new Date(t).getTime() - Date.now() : Infinity))
          .filter(ms => ms > -60_000)
        if (lockAt.some(ms => ms < 4 * 60_000)) next = 10_000
        // Wake up in time for the next lock's last few minutes
        else for (const ms of lockAt) if (ms < Infinity) next = Math.min(next, ms - 4 * 60_000 + 1_000)
        // Asleep: now and then, a little more often while a game's on
        if (asleepNow.current) next = data.games.some(g => g.state === 'live') ? 2 * 60_000 : 15 * 60_000
      } catch {
        if (alive) setStatus(s => (s === 'loading' ? 'loading' : 'offline'))
        next = 20_000
      }
      if (alive) timer = setTimeout(due, next)
    }
    const { due, stop } = onScreen(load)
    load()
    // A message was deleted: reload now rather than at the next poll
    const refresh = () => { clearTimeout(timer); load() }
    window.addEventListener(TV_REFRESH, refresh)
    return () => { alive = false; clearTimeout(timer); stop(); window.removeEventListener(TV_REFRESH, refresh) }
  }, [code])

  // Pick up new versions of the app now and then, but not while the TV is
  // playing the music: a reload would cut it off
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const reload = () => {
      if (Date.now() - speakerPlayedAt < 30 * 60_000) t = setTimeout(reload, 10 * 60_000)
      else window.location.reload()
    }
    t = setTimeout(reload, 6 * 3600_000)
    return () => clearTimeout(t)
  }, [])

  // The pick reveal: games whose picks just went public (they locked while
  // this TV was watching) get revealed one by one. What's been seen is
  // remembered per week, so a reload doesn't replay it and a TV turned on
  // mid-week doesn't reveal what locked hours ago.
  const [reveal, setReveal] = useState<TvGame[] | null>(null)
  useEffect(() => {
    if (!board) return
    const key = `gu-tv-locked-${code}`
    const locked = board.games.filter(g => g.riders && g.state !== 'void')
    let seen: { week: number; ids: string[] } | null = null
    try { seen = JSON.parse(localStorage.getItem(key) ?? 'null') } catch { return }
    const store = (ids: string[]) => {
      try { localStorage.setItem(key, JSON.stringify({ week: board.week, ids })) } catch { /* no storage: no reveals */ }
    }
    if (!seen || seen.week !== board.week) { store(locked.map(g => g.id)); return }
    const fresh = locked.filter(g => !seen!.ids.includes(g.id) && Date.now() - new Date(g.kickoff).getTime() < 45 * 60_000)
    store([...new Set([...seen.ids, ...locked.map(g => g.id)])])
    // Not while it's asleep: on waking it'd be old news
    if (fresh.length && !asleepNow.current) setReveal(r => (r ? [...r, ...fresh.filter(f => !r.some(x => x.id === f.id))] : fresh))
  }, [board, code])

  // ?reveal=demo plays it once with this week's locked games (a preview)
  const [params] = useSearchParams()
  const demoed = useRef(false)
  useEffect(() => {
    if (!board || demoed.current || params.get('reveal') !== 'demo') return
    demoed.current = true
    const locked = board.games.filter(g => g.riders && g.state !== 'void').slice(0, 6)
    if (locked.length) setReveal(locked)
  }, [board, params])

  // Thanksgiving, Christmas, the playoffs, Super Bowl week
  const holiday = useHolidayTheme(board?.week ?? null, board?.brand?.theme)
  // The song on the league's Spotify, when one's connected
  const song = useNowPlaying(code, !!board?.brand?.music && !asleep)
  // The TV as a Spotify speaker, when the commissioner's turned that on
  const speaker = useSpotifySpeaker(code, !!board?.brand?.player, `${board?.league ?? 'Shop'} TV`)
  const { lite, still, perf } = useLiteEffects()

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
        className={clsx('tv-bright shrink-0 bg-field-950 text-white relative', lite && 'tv-lite', still && 'tv-still')}
        style={{
          width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'center',
          // The TV's own color (or the copper), set here so nobody's personal
          // accent, which AppShell may have left on the page root, carries over
          // A holiday theme brings its own color (orange for Halloween, red for Christmas)
          ...(brandVars(holiday?.accent ?? board?.brand?.color ?? DEFAULT_GOLD) as CSSProperties),
        }}
      >
        <StillFx.Provider value={still}>
        {board && status !== 'gone' && !asleep && <Backdrop lite={lite} edge={lite ? holiday?.colors ?? null : null} />}
        {status === 'gone' ? <Gone />
          : !board ? <Loading />
          : sleep ? <ClosedScreen board={board} hours={hours} why={sleep} until={sleepUntil} />
          : <Board board={board} offline={status === 'offline'} holiday={holiday} song={song} />}
        {board && !asleep && reveal && reveal.length > 0 && (
          <RevealShow board={board} games={reveal} onDone={() => setReveal(null)} />
        )}
        {board && !asleep && holiday && <HolidayScene theme={holiday} lite={lite} still={still} />}
        {/* Lite: a few falling pieces; still: none */}
        {board && !asleep && holiday && !still && <HolidayParticles theme={holiday} count={lite ? 6 : 14} />}
        {status !== 'gone' && <LiveFromPhones code={code} status={{ lite, still, speaker, perf, asleep, sleep }} />}
        {speaker === 'blocked' && <SpeakerBlocked />}
        {board && <RemoteOverlay board={board} colors={holiday?.colors ?? [board.brand?.color ?? DEFAULT_GOLD, '#fde68a']} />}
        {board && !asleep && <ReplayShow board={board} />}
        {board && !asleep && <ReceiptsPop board={board} />}
        {board?.conquest && !asleep && <WarReport war={board.conquest} league={board.league} />}
        </StillFx.Provider>
      </div>
    </div>
  )
}

// ── Closing time ──────────────────────────────────────────────
/** How long a remote button, or OK on the TV, wakes it after hours. */
const WAKE_MS = 30 * 60_000

type SleepReason = 'hours' | 'manual'

/**
 * Whether the TV's asleep, and why: the remote's Sleep (until
 * `sleepUntil`), or outside the shop's hours; either way not while
 * someone's woken it. Checked every 30 seconds by the TV's own clock.
 * ?sleep=preview puts it to sleep now (a look at the screen; it wakes
 * like any other time).
 */
function useAsleep(hours: ShopHours | null, wakeUntil: number, sleepUntil: number): SleepReason | null {
  const [preview] = useState(() => new URLSearchParams(window.location.search).get('sleep') === 'preview')
  const key = hours ? JSON.stringify(hours) : ''
  const check = (): SleepReason | null => {
    const now = Date.now()
    if (now < wakeUntil) return null
    if (now < sleepUntil) return 'manual'
    if (preview || (hours && !isShopOpen(hours, new Date(now)))) return 'hours'
    return null
  }
  const [why, setWhy] = useState(check)
  useEffect(() => {
    setWhy(check())
    const t = setInterval(() => setWhy(check()), 30_000)
    return () => clearInterval(t)
    // `key` stands for the hours
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wakeUntil, sleepUntil])
  return why
}

/** The remote's Sleep, kept on this TV so a reload doesn't wake it: until when (Infinity: until woken). */
const sleepKey = (code: string) => `gu-tv-sleep-${code}`
function readSleep(code: string): number {
  try {
    const v = localStorage.getItem(sleepKey(code))
    if (v === 'forever') return Infinity
    const n = Number(v)
    return n > Date.now() ? n : 0
  } catch { return 0 }
}
function writeSleep(code: string, until: number) {
  try {
    if (until > Date.now()) localStorage.setItem(sleepKey(code), until === Infinity ? 'forever' : String(until))
    else localStorage.removeItem(sleepKey(code))
  } catch { /* no storage: a reload wakes it */ }
}

/**
 * After hours: a dim clock, when the shop's back, and the score of any
 * game on. Nothing animates; the whole block moves a little each minute
 * so nothing burns into the screen.
 */
function ClosedScreen({ board, hours, why, until }: { board: TvBoard; hours: ShopHours | null; why: SleepReason; until: number }) {
  const clock = useClock()
  const now = useNow(60_000)
  // Put to sleep: wakes when the Sleep runs out; closed: back when the shop opens
  const back = why === 'manual'
    ? (Number.isFinite(until) ? new Date(until) : null)
    : hours ? nextShopOpen(hours, new Date(now)) : null
  const spot = Math.floor(now / 60_000)
  const dx = (((spot * 137) % 9) - 4) * 55
  const dy = (((spot * 71) % 7) - 3) * 45
  const live = board.games.filter(g => g.state === 'live')
  return (
    <div className="absolute inset-0 bg-black flex items-center justify-center">
      <div className="flex flex-col items-center text-center opacity-70" style={{ transform: `translate(${dx}px, ${dy}px)` }}>
        {board.brand?.logo && <img src={board.brand.logo} alt="" className="h-[72px] w-auto mb-6 opacity-60" />}
        <p className="font-cond font-black text-[190px] leading-none tabular-nums text-white">{clock.time}</p>
        <p className="mt-3 font-cond font-bold uppercase tracking-[0.3em] text-[30px] text-field-400">{clock.date}</p>
        <p className="mt-8 text-[30px] text-field-300">
          {why === 'manual'
            ? <>The board is asleep{back ? <> · wakes {backLabel(back, new Date(now))}</> : null}</>
            : <>{board.league} is closed{back ? <> · back {backLabel(back, new Date(now))}</> : null}</>}
        </p>
        {live.length > 0 && (
          <div className="mt-10 flex flex-wrap justify-center gap-x-16 gap-y-3 max-w-[1500px]">
            {live.slice(0, 8).map(g => (
              <p key={g.id} className="font-cond font-black text-[34px] text-white tabular-nums whitespace-nowrap">
                {g.away} {g.awayScore ?? 0} <span className="text-field-500">–</span> {g.homeScore ?? 0} {g.home}
                {g.clock && <span className="ml-3 font-sans font-bold text-[20px] text-field-400">{g.clock}</span>}
              </p>
            ))}
          </div>
        )}
        <p className="mt-12 text-[20px] text-field-500">Press OK on the TV’s remote to wake the board</p>
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

// ── Smoothness ────────────────────────────────────────────────
// A Fire TV stick can't draw every effect 60 times a second, and when it
// falls behind, everything that moves stutters. So the TV times its own
// frames now and then, and once it's dropping them it switches to lighter
// effects until the next reload; Fire TV's Silk starts on them. Lite
// keeps the movement (the ticker, fades, a few falling pieces) and drops
// the big layers that cost the most: the background holds still, the
// holiday glow moves under the panels, the fog goes. Still (?fx=still,
// for a TV that can't keep up even then) has nothing moving on its own:
// the ticker steps through instead of scrolling, panels switch without
// animating, nothing falls or pulses. ?fx=full / ?fx=lite / ?fx=still
// force any of them.
const FX_FIRST_MS = 20_000
const FX_SAMPLE_MS = 5000
const FX_EVERY_MS = 60_000

/** What the TV last measured of itself: frames a second, and the share that came late. */
interface TvPerf { fps: number; slow: number }

/**
 * Fire TV's browser (Silk): lighter effects from the start. Measured on
 * the shop's TV, it dropped frames even before the extras, so it doesn't
 * wait to find out.
 */
const SILK = typeof navigator !== 'undefined' && /\bSilk\/|\bAFT[A-Z]/.test(navigator.userAgent)

/** Nothing moving on its own (?fx=still; see useLiteEffects), for anything that moves. */
const StillFx = createContext(false)

function useLiteEffects(): { lite: boolean; still: boolean; perf: TvPerf | null } {
  const [forced] = useState(() => new URLSearchParams(window.location.search).get('fx'))
  const still = forced === 'still'
  const [lite, setLite] = useState(still || forced === 'lite' || (forced !== 'full' && SILK))
  const [perf, setPerf] = useState<TvPerf | null>(null)
  useEffect(() => {
    let raf = 0
    let timer: ReturnType<typeof setTimeout>
    let strikes = 0
    const sample = () => {
      const gaps: number[] = []
      let start = 0, last = 0
      const tick = (t: number) => {
        if (start) gaps.push(t - last)
        else start = t
        last = t
        if (t - start < FX_SAMPLE_MS) { raf = requestAnimationFrame(tick); return }
        // A gap this long means the page was hidden: try again later
        if (gaps.some(g => g > 500)) { timer = setTimeout(sample, FX_EVERY_MS); return }
        const fps = gaps.length / ((t - start) / 1000)
        const slow = gaps.filter(g => g > 25).length / Math.max(1, gaps.length)
        setPerf({ fps: Math.round(fps), slow: Math.round(slow * 100) / 100 })
        strikes = fps < 48 || slow > 0.05 ? strikes + 1 : 0
        if (strikes >= 2 && forced !== 'full') setLite(true)
        // Check a bad sample again right away, so one hiccup doesn't count;
        // after that, once a minute, so the remote can show how it's doing
        timer = setTimeout(sample, strikes === 1 ? FX_SAMPLE_MS : FX_EVERY_MS)
      }
      raf = requestAnimationFrame(tick)
    }
    timer = setTimeout(sample, FX_FIRST_MS)
    return () => { cancelAnimationFrame(raf); clearTimeout(timer) }
  }, [forced])
  return { lite, still, perf }
}

/**
 * Glows in the TV's color behind the (see-through) panels, drifting
 * slowly. Lite: standing still, painted with the page (no layers of
 * their own), with the holiday's glow around the edges painted here too.
 */
const BACKDROP_CSS = '@keyframes tv-drift-a { 0%, 100% { transform: translate(0, 0) } 50% { transform: translate(380px, 160px) } }'
  + ' @keyframes tv-drift-b { 0%, 100% { transform: translate(0, 0) } 50% { transform: translate(-420px, -120px) } }'

function Backdrop({ lite, edge }: { lite: boolean; edge: [string, string] | null }) {
  if (lite) {
    return (
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{
          background: 'radial-gradient(1000px 760px at 6% 0%, rgb(var(--gold) / .18), transparent 70%), radial-gradient(900px 700px at 96% 100%, rgb(var(--gold) / .14), transparent 70%)',
          boxShadow: edge ? `inset 0 0 140px 24px ${edge[0]}44, inset 0 0 380px 60px ${edge[1]}2b` : undefined,
        }}
      />
    )
  }
  const glow = (alpha: number) => ({ background: `radial-gradient(closest-side, rgb(var(--gold) / ${alpha}), transparent)` })
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <style>{BACKDROP_CSS}</style>
      <div className="absolute w-[1300px] h-[1300px] -left-[360px] -top-[520px] will-change-transform" style={{ ...glow(0.2), animation: 'tv-drift-a 70s ease-in-out infinite' }} />
      <div className="absolute w-[1200px] h-[1200px] -right-[340px] -bottom-[560px] will-change-transform" style={{ ...glow(0.16), animation: 'tv-drift-b 90s ease-in-out infinite' }} />
    </div>
  )
}

/** The shop's weather now (leagues.tv_location), straight from Open-Meteo every 20 minutes while the TV's on screen. */
const WEATHER_MS = 20 * 60_000

interface ShopWeather { temp: number; code: number; day: boolean }

function useShopWeather(at: { lat: number; lon: number } | null | undefined): ShopWeather | null {
  const lat = at?.lat, lon = at?.lon
  const [wx, setWx] = useState<ShopWeather | null>(null)
  useEffect(() => {
    if (lat == null || lon == null) { setWx(null); return }
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&temperature_unit=fahrenheit`)
        const c = r.ok ? (await r.json()).current : null
        if (alive && c && typeof c.temperature_2m === 'number') {
          setWx({ temp: Math.round(c.temperature_2m), code: c.weather_code ?? 0, day: c.is_day !== 0 })
        }
      } catch { /* keep the last reading */ }
      if (alive) timer = setTimeout(due, WEATHER_MS)
    }
    const { due, stop } = onScreen(load)
    load()
    return () => { alive = false; clearTimeout(timer); stop() }
  }, [lat, lon])
  return wx
}

/**
 * The header's right end: the shop's weather, the time and the date. Its
 * own component, so the clock ticking over doesn't redraw the whole board.
 */
function HeaderRight({ offline, location }: { offline: boolean; location?: { name: string; lat: number; lon: number } | null }) {
  const clock = useClock()
  const wx = useShopWeather(location)
  const sky = wx ? skyNow(wx.code) : null
  return (
    <div className="min-w-[200px] shrink-0 flex items-center justify-end gap-5">
      {offline && <span className="text-[18px] font-bold text-amber-300 whitespace-nowrap">Reconnecting…</span>}
      {/* The weather outside the shop (Commish panel → Shop TV) */}
      {wx && sky && (
        <div className="flex items-center gap-2.5 pr-5 border-r-2 border-field-700/70" title={location?.name}>
          <span className="text-[40px] leading-none">{!wx.day && wx.code <= 2 ? '🌙' : sky.icon}</span>
          <div className="leading-none">
            <p className="font-cond font-black text-[36px] tabular-nums text-white">{wx.temp}°</p>
            <p className="mt-1 font-cond font-bold uppercase tracking-wider text-[14px] text-field-400 whitespace-nowrap">{sky.label}</p>
          </div>
        </div>
      )}
      <div className="text-right leading-none">
        <p className="font-cond font-black text-[40px] tabular-nums text-white whitespace-nowrap">{clock.time}</p>
        <p className="mt-1 font-cond font-bold uppercase tracking-wider text-[15px] text-field-400 whitespace-nowrap">{clock.date}</p>
      </div>
    </div>
  )
}

function Board({ board, offline, holiday, song }: { board: TvBoard; offline: boolean; holiday: HolidayTheme | null; song: NowPlaying | null }) {
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
  const injuries = useMemo(() => {
    const m = new Map<string, TvInjury[]>()
    for (const i of board.injuries ?? []) m.set(i.team, [...(m.get(i.team) ?? []), i])
    return m
  }, [board.injuries])
  // The full Board takes turns with the games once anything has locked
  const view = useMainView(!!board.board?.games.some(g => g.locked))
  const s = board.summary

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Header */}
      <header
        className="h-[92px] shrink-0 flex items-center gap-6 px-8 border-b-2 border-field-800 bg-field-900/80"
        style={holiday ? { backgroundImage: `linear-gradient(90deg, ${holiday.colors[0]}33, transparent 35%, transparent 65%, ${holiday.colors[1]}33)`, borderBottomColor: `${holiday.colors[0]}88` } : undefined}
      >
        <div className="min-w-0 w-[460px] shrink-0 flex items-center gap-4">
          {board.brand?.logo && <img src={board.brand.logo} alt="" className="h-[68px] w-auto max-w-[140px] object-contain shrink-0" />}
          <div className="min-w-0">
            <p className="font-cond font-bold uppercase tracking-[0.3em] text-gold text-[16px] leading-none">Gridiron United · Pick&apos;Em</p>
            <p className="font-cond font-black uppercase text-white text-[40px] leading-tight truncate">{board.league}</p>
          </div>
        </div>
        <div className="flex-1 min-w-0 overflow-hidden flex items-center [justify-content:safe_center] gap-4">
          <span className="font-cond font-black uppercase text-[40px] text-white tracking-wide whitespace-nowrap">{weekTitle(board.week)}</span>
          {holiday && <HolidayPill theme={holiday} />}
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
          {board.shame?.lockAt && board.shame.rows.length > 0 && (
            <Chip><span className="text-amber-300">Picks lock in <Countdown to={board.shame.lockAt} /></span></Chip>
          )}
        </div>
        <HeaderRight offline={offline} location={board.brand?.location} />
      </header>

      {/* Body: games + standings (or the full Board) · the rotating panel */}
      <div className="flex-1 min-h-0 flex gap-[18px] p-5">
        <div className="relative w-[1468px] shrink-0">
          <Crossfade
            k={view === 'board' && board.board ? 'board' : 'games'}
            render={k => (k === 'board' && board.board
              ? <MemoPicksBoardView board={board} />
              : (
                <>
                  <MemoGamesGrid games={games} injuries={injuries} />
                  <MemoStandingsPanel board={board} rows={table} week={showWeek} />
                </>
              ))}
          />
        </div>
        <MemoFeaturePanel board={board} />
      </div>

      <Ticker board={board} greeting={holiday?.greeting.replace('{league}', board.league)} song={song} />
      <SongCard song={song} />
      <Takeover board={board} emoji={holiday?.emoji} />
    </div>
  )
}

/** Asks the board to reload now (a chat message was deleted). */
const TV_REFRESH = 'gu-tv-refresh'

/** A chat message as it lands on the TV, or one taken down (for the chat takeover). */
type TvChatEvent = { id: string; name: string; text: string; gif: string | null; at: string } | { deleted: string }
const TV_CHAT = 'gu-tv-chat'

/** A press of the commissioner's remote (tv_remote), passed around the TV. */
interface TvRemote {
  action: string
  text?: string
  moment?: string
  /** action 'poll': the poll going up (tv_poll) */
  poll?: TvPoll
  /** action 'poll_votes': a poll's new counts */
  pollId?: string
  counts?: number[]
}
interface TvPoll { id: string; question: string; options: string[]; closesAt: string; counts: number[] }
const TV_REMOTE = 'gu-tv-remote'

/** Runs `on` for each press of the commissioner's remote. */
function useTvRemote(on: (r: TvRemote) => void) {
  const latest = useRef(on)
  useEffect(() => { latest.current = on })
  useEffect(() => {
    const hear = (e: Event) => { const r = (e as CustomEvent<TvRemote>).detail; if (r?.action) latest.current(r) }
    window.addEventListener(TV_REMOTE, hear)
    return () => window.removeEventListener(TV_REMOTE, hear)
  }, [])
}

const GAMES_MS = 50_000
const BOARD_MS = 25_000

/** Games for a while, then the full Board for a while — while there's a Board to show. */
function useMainView(hasBoard: boolean): 'games' | 'board' {
  const [view, setView] = useState<'games' | 'board'>('games')
  // The remote: the board now (once anything's locked), or back to the games
  useTvRemote(r => {
    if (r.action === 'board' && hasBoard) setView('board')
    if (r.action === 'clear') setView('games')
  })
  useEffect(() => {
    if (!hasBoard) { setView('games'); return }
    const t = setTimeout(() => setView(v => (v === 'games' ? 'board' : 'games')), view === 'games' ? GAMES_MS : BOARD_MS)
    return () => clearTimeout(t)
  }, [view, hasBoard])
  return hasBoard ? view : 'games'
}

/** How long one view takes to fade into the next. */
const VIEW_FADE_MS = 800
const VIEW_CSS = '@keyframes tv-view-in { from { opacity: 0 } to { opacity: 1 } }'
  + ' @keyframes tv-view-out { from { opacity: 1 } to { opacity: 0 } }'

/**
 * Crossfades between views: the one leaving stays a moment, fading out,
 * while the new one fades in on top. Each is a layer filling the parent
 * (which must be `relative`), keyed so neither remounts mid-fade.
 */
function Crossfade({ k, render }: { k: string; render: (k: string) => ReactNode }) {
  const [shown, setShown] = useState<{ cur: string; prev: string | null }>({ cur: k, prev: null })
  if (shown.cur !== k) setShown({ cur: k, prev: shown.cur })
  useEffect(() => {
    if (!shown.prev) return
    const t = setTimeout(() => setShown(s => ({ ...s, prev: null })), VIEW_FADE_MS)
    return () => clearTimeout(t)
  }, [shown])
  // Still: straight to the new view
  const still = useContext(StillFx)
  const fading = !still && !!shown.prev && shown.prev !== shown.cur
  const layers = fading ? [shown.prev!, shown.cur] : [shown.cur]
  return (
    <>
      <style>{VIEW_CSS}</style>
      {layers.map(l => {
        const leaving = l !== shown.cur
        return (
          <div
            key={l}
            className={clsx('absolute inset-0 flex gap-[18px]', leaving && 'pointer-events-none')}
            style={fading ? { animation: `${leaving ? 'tv-view-out' : 'tv-view-in'} ${VIEW_FADE_MS}ms ease-in-out both` } : undefined}
          >
            {render(l)}
          </div>
        )
      })}
    </>
  )
}

/** The badge someone shows next to their name, sized for across the room. */
function TvFlair({ badge, size }: { badge?: string | null; size: number }) {
  const a = ACHIEVEMENTS.find(x => x.key === badge)
  if (!a) return null
  const Icon = ACHIEVEMENT_ICONS[a.key]
  return (
    <span className="shrink-0 inline-flex items-center justify-center rounded-full bg-gold/20 text-gold" style={{ width: size, height: size }} title={a.label}>
      <Icon style={{ width: size * 0.62, height: size * 0.62 }} aria-label={a.label} />
    </span>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-field-800 border border-field-700 px-3.5 py-1 text-[19px] font-bold text-field-200 whitespace-nowrap">
      {children}
    </span>
  )
}

function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

function untilLabel(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return 'now'
  const m = Math.floor(ms / 60_000)
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${mm}m` : `${Math.max(1, mm)}m`
}

function Countdown({ to }: { to: string }) {
  const now = useNow(20_000)
  return <>{untilLabel(to, now)}</>
}

// ── Games ─────────────────────────────────────────────────────
function GamesGrid({ games, injuries }: { games: TvGame[]; injuries: Map<string, TvInjury[]> }) {
  const now = useNow(30_000)
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
      <style>{TILE_CSS}</style>
      {games.map(g => <GameTile key={g.id} g={g} big={cols <= 3} injuries={injuries} now={now} />)}
    </div>
  )
}

const TILE_CSS = '@keyframes tv-flip { 0% { transform: perspective(300px) rotateX(-90deg); opacity: 0 } 55% { transform: perspective(300px) rotateX(20deg); opacity: 1 } 80% { transform: perspective(300px) rotateX(-8deg) } 100% { transform: none } }'
  + ' @keyframes tv-burst { 0% { opacity: 0 } 8% { opacity: 1 } 75% { opacity: 1 } 100% { opacity: 0 } }'
  + ' @keyframes tv-burst-text { 0% { transform: scale(.4); opacity: 0 } 14% { transform: scale(1.12); opacity: 1 } 24% { transform: scale(1) } 100% { transform: scale(1.04) } }'
  + ' @keyframes tv-live-ring { 0% { transform: scale(1); opacity: .9 } 100% { transform: scale(2); opacity: 0 } }'

/** A kickoff that's this close fills its ring. */
const RING_MS = 2 * 3_600_000
/** How long a score's flash stays on its tile. */
const BURST_MS = 3200

/** A score that flips like a stadium scoreboard when it changes (not when it first shows). */
function FlipNumber({ value, className }: { value: number | string; className?: string }) {
  const last = useRef(value)
  const [flips, setFlips] = useState(0)
  useEffect(() => {
    if (last.current === value) return
    last.current = value
    setFlips(n => n + 1)
  }, [value])
  return (
    <span key={flips} className={clsx('inline-block', className)} style={flips ? { animation: 'tv-flip .7s cubic-bezier(.2,.8,.2,1) both' } : undefined}>
      {value}
    </span>
  )
}

/** What a jump in the score most likely was. */
function scoreLabel(points: number): string {
  if (points >= 6 && points <= 8) return 'TOUCHDOWN'
  if (points === 3) return 'FIELD GOAL'
  if (points === 2) return 'TWO POINTS'
  if (points === 1) return 'EXTRA POINT'
  return `+${points}`
}

/** The ring before kickoff: fills over the last two hours, then pulses red once the game's on. */
function KickoffRing({ kickoff, now, live }: { kickoff: string; now: number; live: boolean }) {
  const still = useContext(StillFx)
  if (live) {
    return (
      <span className="relative w-[18px] h-[18px] shrink-0 flex items-center justify-center" aria-hidden>
        <span className="absolute inset-0 rounded-full border-2 border-red-500" style={still ? undefined : { animation: 'tv-live-ring 1.6s ease-out infinite' }} />
        <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
      </span>
    )
  }
  const left = new Date(kickoff).getTime() - now
  if (left > RING_MS) return null
  const r = 7.5, c = 2 * Math.PI * r
  const p = Math.min(1, Math.max(0, 1 - left / RING_MS))
  const close = left < 15 * 60_000
  // The pulse is on a wrapper: fading part of an SVG repaints the tile every frame
  return (
    <span className={clsx('shrink-0 flex', close && 'animate-pulse')} aria-hidden>
      <svg width="20" height="20" viewBox="0 0 20 20" className="-rotate-90">
        <circle cx="10" cy="10" r={r} fill="none" strokeWidth="3" className="stroke-field-700" />
        <circle
          cx="10" cy="10" r={r} fill="none" strokeWidth="3" strokeLinecap="round"
          stroke={close ? '#f87171' : 'rgb(var(--gold))'}
          strokeDasharray={c} strokeDashoffset={c * (1 - p)}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
    </span>
  )
}

const MemoGamesGrid = memo(GamesGrid)

/** "CHI -3.5" — the favorite's line, from the home team's number. */
function lineLabel(g: { home: string; away: string; spread: number | null }): string | null {
  if (g.spread == null) return null
  if (g.spread === 0) return 'Pick’em'
  return g.spread < 0 ? `${g.home} ${g.spread}` : `${g.away} -${g.spread}`
}

/** The short injury flag for a team: "QB OUT", "2 OUT", or "Q". */
function injuryFlag(list: TvInjury[] | undefined): { text: string; out: boolean } | null {
  if (!list?.length) return null
  const out = list.filter(i => i.status === 'out')
  if (out.some(i => i.pos === 'QB')) return { text: 'QB OUT', out: true }
  if (out.length) return { text: `${out.length} OUT`, out: true }
  return { text: list.some(i => i.pos === 'QB') ? 'QB Q' : 'Q', out: false }
}

function GameTile({ g, big, injuries, now }: { g: TvGame; big: boolean; injuries: Map<string, TvInjury[]>; now: number }) {
  const final = g.state === 'final'
  const live = g.state === 'live'
  const pre = g.state === 'pre'
  const started = live || final
  const untilKickoff = new Date(g.kickoff).getTime() - now

  // A score: the tile flashes the scoring team's color ("TOUCHDOWN")
  const [burst, setBurst] = useState<{ team: string; label: string; n: number } | null>(null)
  const lastScore = useRef<{ away: number; home: number } | null>(null)
  useEffect(() => {
    const was = lastScore.current
    const next = { away: g.awayScore ?? 0, home: g.homeScore ?? 0 }
    lastScore.current = started ? next : null
    if (!was || !started) return
    const away = next.away - was.away, home = next.home - was.home
    if (away <= 0 && home <= 0) return
    const team = away >= home ? g.away : g.home
    setBurst(b => ({ team, label: scoreLabel(Math.max(away, home)), n: (b?.n ?? 0) + 1 }))
  }, [g.awayScore, g.homeScore, started, g.away, g.home])
  useEffect(() => {
    if (!burst) return
    const t = setTimeout(() => setBurst(null), BURST_MS)
    return () => clearTimeout(t)
  }, [burst])
  const winner = final && g.awayScore != null && g.homeScore != null && g.awayScore !== g.homeScore
    ? (g.homeScore > g.awayScore ? g.home : g.away) : null
  const fav = g.homeChance == null || final ? null
    : g.homeChance >= 0.5 ? { team: g.home, pct: g.homeChance } : { team: g.away, pct: 1 - g.homeChance }
  const a = g.riders?.away.length ?? 0
  const h = g.riders?.home.length ?? 0
  const redZone = live && !!g.redZone

  const side = (team: string, score: number | null, riders: number | null) => {
    const logo = teamLogoUrl({ abbr: team }, 'NFL')
    const lost = winner != null && winner !== team
    const hurt = pre ? injuryFlag(injuries.get(team)) : null
    return (
      <div className={clsx('flex items-center gap-2', lost && 'opacity-40')}>
        {logo
          ? <img src={logo} alt="" className={clsx('object-contain shrink-0', big ? 'w-12 h-12' : 'w-9 h-9')} />
          : <span className={clsx('shrink-0', big ? 'w-12' : 'w-9')} />}
        <span className={clsx('font-cond font-black tracking-wide', big ? 'text-[36px]' : 'text-[27px]')}>{team}</span>
        {live && g.possession === team && <span className="text-[17px] leading-none" title="Has the ball">🏈</span>}
        {riders != null && (
          <span className="rounded-md bg-field-800 px-1.5 text-[15px] font-bold text-field-300 tabular-nums" title="League picks">{riders}</span>
        )}
        {hurt && (
          <span className={clsx('rounded px-1 text-[12px] font-black tracking-wide', hurt.out ? 'bg-red-500/25 text-red-300' : 'bg-amber-500/20 text-amber-300')}>{hurt.text}</span>
        )}
        <span className={clsx('ml-auto font-cond font-black tabular-nums', big ? 'text-[44px]' : 'text-[33px]', started ? 'text-white' : 'text-field-700')}>
          {started ? <FlipNumber value={score ?? 0} /> : '–'}
        </span>
      </div>
    )
  }

  const awayGlow = teamGlow(g.away), homeGlow = teamGlow(g.home)
  const awayLogo = teamLogoUrl({ abbr: g.away }, 'NFL'), homeLogo = teamLogoUrl({ abbr: g.home }, 'NFL')
  const burstGlow = burst ? teamGlow(burst.team) : null

  return (
    <div
      className={clsx(
        'relative overflow-hidden min-h-0 rounded-xl border-2',
        redZone ? 'border-red-500 bg-red-500/[0.08] shadow-[0_0_24px_rgba(239,68,68,0.3)]'
          : live ? 'border-gold bg-gold/[0.08] shadow-[0_0_24px_rgba(206,123,69,0.25)]'
          : final ? 'border-field-800 bg-field-900/60'
          : 'border-field-700 bg-field-900/80',
      )}
      style={burstGlow ? { borderColor: burstGlow, boxShadow: `0 0 36px ${burstGlow}99`, transition: 'box-shadow .4s, border-color .4s' } : undefined}
    >
      {/* Both teams' colors, and their logos big and faded behind */}
      <div className={clsx('absolute inset-0 pointer-events-none', final && 'opacity-75')} aria-hidden>
        <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${awayGlow}40 0%, ${awayGlow}10 42%, ${homeGlow}10 58%, ${homeGlow}40 100%)` }} />
        {awayLogo && <img src={awayLogo} alt="" className="absolute -left-[8%] -top-[30%] h-[95%] w-auto opacity-[0.24]" onError={e => { e.currentTarget.style.display = 'none' }} />}
        {homeLogo && <img src={homeLogo} alt="" className="absolute -right-[8%] -bottom-[30%] h-[95%] w-auto opacity-[0.24]" onError={e => { e.currentTarget.style.display = 'none' }} />}
      </div>
      <div className="relative h-full flex flex-col justify-between px-3.5 py-2.5">
        <div className="flex items-center gap-2 text-[16px] font-bold">
          {(live || (pre && untilKickoff <= RING_MS)) && <KickoffRing kickoff={g.kickoff} now={now} live={live} />}
          <span className={clsx('truncate', live ? 'text-gold' : final ? 'text-field-400' : pre && untilKickoff <= RING_MS ? 'text-white' : 'text-field-300')}>
            {g.state === 'void' ? 'Postponed' : final ? 'Final' : live ? g.clock
              : untilKickoff <= 0 ? 'Kicking off'
              : untilKickoff <= RING_MS ? `In ${untilLabel(g.kickoff, now)}`
              : kickoffLabel(g.kickoff)}
          </span>
          <span className="ml-auto flex items-center gap-1 shrink-0">
            {/* Stadium weather, for the games still to come */}
            {pre && (() => {
              const wx = weatherLabel(g.weather)
              if (!wx) return null
              const alert = wx.alerts[0]
              return (
                <span className={clsx('text-[14px] whitespace-nowrap', alert ? 'text-amber-300' : 'text-field-400')} title={[wx.base, ...wx.alerts].join(' · ')}>
                  {wx.icon} {alert ?? wx.base}
                </span>
              )
            })()}
            {redZone && <span className="rounded bg-red-600 text-white text-[12px] font-black px-1.5 py-0.5 tracking-wider">RED ZONE</span>}
            {g.tiebreaker && <span className="rounded bg-gold/15 text-gold text-[13px] font-black px-1.5 py-0.5 tracking-wider">TB</span>}
          </span>
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
            {live
              ? (g.downDistance ? <span className="font-bold text-field-100">{g.downDistance}</span> : null)
              : fav ? <span className="font-black text-white">{fav.team} {Math.round(fav.pct * 100)}%</span>
              : final ? (winner ? `${winner} wins` : 'Tie')
              : ''}
          </span>
          <span className="ml-auto shrink-0 whitespace-nowrap">
            {live && fav && <span className="font-black text-white">{fav.team} {Math.round(fav.pct * 100)}%</span>}
            {pre && !g.riders ? <>🔒 {g.picked}</> : pre && lineLabel(g) ? lineLabel(g) : null}
            {pre && g.total != null && <span className="ml-2">O/U {g.total}</span>}
          </span>
        </div>
      </div>
      {/* The score flash */}
      {burst && burstGlow && (
        <div
          key={burst.n}
          className="absolute inset-0 pointer-events-none flex items-center justify-center gap-3"
          style={{ background: `radial-gradient(circle at center, ${burstGlow}f0 0%, ${burstGlow}b0 55%, ${burstGlow}60 100%)`, animation: `tv-burst ${BURST_MS}ms ease-out both` }}
        >
          <TeamLogo team={burst.team} className={big ? 'w-16 h-16' : 'w-11 h-11'} />
          <span
            className={clsx('font-cond font-black italic text-white tracking-wide leading-none drop-shadow-[0_3px_8px_rgba(0,0,0,0.6)]', big ? 'text-[44px]' : 'text-[32px]')}
            style={{ animation: `tv-burst-text ${BURST_MS}ms cubic-bezier(.2,.8,.2,1) both` }}
          >
            {burst.label}
          </span>
        </div>
      )}
    </div>
  )
}

/** A team's logo; hides itself if the image can't load (the abbreviation still shows). */
function TeamLogo({ team, className }: { team: string; className: string }) {
  const src = teamLogoUrl({ abbr: team }, 'NFL')
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      className={clsx('object-contain shrink-0', className)}
      onError={e => { e.currentTarget.style.display = 'none' }}
    />
  )
}

// ── The full Board: every player's pick on every game ─────────
function PicksBoardView({ board }: { board: TvBoard }) {
  const b = board.board!
  const byUser = new Map(b.rows.map(r => [r.userId, r]))
  const rows = board.week_table
  const hasTb = b.games.some(g => g.tiebreaker)
  const cols = `270px 76px repeat(${b.games.length}, minmax(0, 1fr))${hasTb ? ' 64px' : ''}`

  return (
    <div className="w-[1468px] shrink-0 flex flex-col rounded-2xl border-2 border-field-800 bg-field-900/85 overflow-hidden">
      <div className="px-5 py-2.5 border-b-2 border-field-800 flex items-baseline justify-between">
        <p className="font-cond font-black uppercase text-white text-[28px] tracking-wide">The Board</p>
        <p className="font-cond font-bold uppercase tracking-wider text-field-400 text-[15px]">Every pick · 🔒 shows at kickoff</p>
      </div>
      <div className="flex-1 min-h-0 flex flex-col px-3 py-1.5">
        <div className="shrink-0 grid items-end gap-x-1 pb-1 border-b border-field-800" style={{ gridTemplateColumns: cols }}>
          <span />
          <span className="text-center font-cond font-bold text-[14px] text-field-400 uppercase">Pts</span>
          {b.games.map(g => (
            <span key={g.id} className={clsx('flex flex-col items-center gap-0.5 font-cond font-black leading-none text-[13px]', g.live ? 'text-gold' : 'text-field-300')}>
              {[g.away, g.home].map(t => (
                <span key={t} className={clsx('flex items-center gap-1', g.winner && g.winner !== t && 'opacity-35', g.winner === t && 'text-white')}>
                  <TeamLogo team={t} className="w-[22px] h-[22px]" />
                  {t}
                </span>
              ))}
              {g.live && <span className="text-[10px] text-red-400">LIVE</span>}
            </span>
          ))}
          {hasTb && <span className="text-center font-cond font-bold text-[14px] text-gold uppercase">TB</span>}
        </div>
        {rows.map(r => {
          const cells = byUser.get(r.userId)?.cells ?? {}
          return (
            <div key={r.userId} className={clsx('flex-1 min-h-0 max-h-[44px] grid items-center gap-x-1', r.winner && 'bg-gold/10 rounded-md')} style={{ gridTemplateColumns: cols }}>
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-6 text-right font-cond font-black text-[18px] text-field-400 tabular-nums">{r.rank}</span>
                <span className="truncate text-[19px] font-bold text-white">{r.name}</span>
                <TvFlair badge={r.flair} size={20} />
                {r.belt && <BeltIcon className="w-[22px] h-[14px]" />}
              </span>
              <span className="text-center font-cond font-black text-[20px] text-white tabular-nums">
                {r.correct}<span className="text-field-500 text-[15px]">/{r.played}</span>
              </span>
              {b.games.map(g => {
                const pick = cells[g.id]
                const decided = g.winner != null
                const right = decided && pick === g.winner
                const wrong = decided && pick != null && pick !== '?' && pick !== g.winner
                return (
                  <span
                    key={g.id}
                    className={clsx(
                      'h-[82%] flex items-center justify-center gap-1 rounded font-cond font-black text-[15px]',
                      pick == null ? 'text-field-700'
                        : pick === '?' ? 'text-field-600'
                        : right ? (g.final ? 'bg-emerald-500/25 text-emerald-200' : 'bg-emerald-500/10 text-emerald-300')
                        : wrong ? (g.final ? 'bg-red-500/20 text-red-300' : 'bg-red-500/10 text-red-300/80')
                        : 'bg-field-800 text-field-100',
                    )}
                  >
                    {pick == null ? '—' : pick === '?' ? '🔒' : (
                      <>
                        <TeamLogo team={pick} className="w-[24px] h-[24px]" />
                        {pick}
                      </>
                    )}
                  </span>
                )
              })}
              {hasTb && (
                <span className="text-center font-cond font-black text-[17px] text-field-300 tabular-nums">
                  {byUser.get(r.userId)?.tiebreaker ?? '—'}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const MemoPicksBoardView = memo(PicksBoardView)

// ── Standings ─────────────────────────────────────────────────
const TABLE_ROWS = 20
/** How long a ▲/▼ stays next to someone who just moved. */
const RANK_MOVE_MS = 10_000
const STANDINGS_CSS = '@keyframes tv-row-up { from { background-color: rgb(16 185 129 / .35) } to { background-color: transparent } }'
  + ' @keyframes tv-row-down { from { background-color: rgb(239 68 68 / .3) } to { background-color: transparent } }'
  + ' @keyframes tv-pop { 0% { transform: scale(0) } 60% { transform: scale(1.3) } 100% { transform: scale(1) } }'

/**
 * Rows slide from their old spots to their new ones when the order
 * changes (FLIP). offsetTop, not getBoundingClientRect: the whole TV is
 * scaled, and the slide is in the unscaled pixels.
 */
function useFlipRows(box: RefObject<HTMLElement | null>, order: string, page: number) {
  const last = useRef<{ page: number; tops: Map<string, number> } | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const tops = new Map<string, number>()
    const was = last.current?.page === page ? last.current.tops : null
    for (const row of el.querySelectorAll<HTMLElement>('[data-flip]')) {
      const key = row.dataset.flip!
      tops.set(key, row.offsetTop)
      const from = was?.get(key)
      if (from != null && from !== row.offsetTop) {
        row.animate?.([{ transform: `translateY(${from - row.offsetTop}px)` }, { transform: 'none' }], { duration: 900, easing: 'cubic-bezier(.22,1,.36,1)' })
      }
    }
    last.current = { page, tops }
  }, [box, order, page])
}

/** Who just moved in the standings, and by how many places (up is positive), for a few seconds. */
function useRankMoves(rows: TvRow[], mode: string): Map<string, number> {
  const last = useRef<{ mode: string; ranks: Map<string, number> } | null>(null)
  const [moves, setMoves] = useState<Map<string, number>>(() => new Map())
  const ranks = rows.map(r => `${r.userId}:${r.rank}`).join()
  useEffect(() => {
    const was = last.current?.mode === mode ? last.current.ranks : null
    last.current = { mode, ranks: new Map(rows.map(r => [r.userId, r.rank])) }
    if (!was) return
    const m = new Map<string, number>()
    for (const r of rows) {
      const before = was.get(r.userId)
      if (before != null && before !== r.rank) m.set(r.userId, before - r.rank)
    }
    if (m.size === 0) return
    setMoves(m)
    const t = setTimeout(() => setMoves(new Map()), RANK_MOVE_MS)
    return () => clearTimeout(t)
    // `ranks` stands for the rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranks, mode])
  return moves
}

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
  const box = useRef<HTMLDivElement>(null)
  useFlipRows(box, shown.map(r => r.userId).join(), page)
  const moves = useRankMoves(rows, week ? `week-${board.week}` : 'season')

  return (
    <div className="w-[440px] shrink-0 flex flex-col rounded-2xl border-2 border-field-800 bg-field-900/85 overflow-hidden">
      <style>{STANDINGS_CSS}</style>
      {board.complete && board.winners.length > 0 ? (
        <div className="px-5 py-3 bg-gold/15 border-b-2 border-gold/40">
          <p className="font-cond font-bold uppercase tracking-[0.25em] text-gold text-[16px]">{weekTitle(board.week)} champion</p>
          <p className="font-cond font-black uppercase text-white text-[30px] leading-tight truncate">🏆 {board.winners.join(' & ')}</p>
        </div>
      ) : (
        <div className="px-5 py-3 border-b-2 border-field-800 flex items-baseline justify-between">
          <p className="font-cond font-black uppercase text-white text-[28px] tracking-wide">{week ? 'This week' : 'Season'}</p>
          {withChance && (
            <div className="text-right leading-tight">
              <p className="font-cond font-bold uppercase tracking-wider text-field-400 text-[15px]">Chance to win</p>
              {board.trend_label && <p className="font-cond font-bold uppercase tracking-wider text-field-500 text-[12px]">▲▼ {board.trend_label}</p>}
            </div>
          )}
        </div>
      )}
      <div ref={box} key={page} className="relative flex-1 min-h-0 flex flex-col px-2 py-1.5 rise-in">
        {shown.map(r => {
          const delta = r.chance != null && r.trendFrom != null ? r.chance - r.trendFrom : 0
          const moved = moves.get(r.userId) ?? 0
          return (
            <div
              key={r.userId}
              data-flip={r.userId}
              className={clsx('flex-1 max-h-[46px] min-h-0 flex items-center gap-2 px-2 rounded-lg', r.winner && 'bg-gold/15')}
              style={moved ? { animation: `${moved > 0 ? 'tv-row-up' : 'tv-row-down'} 3s ease-out` } : undefined}
            >
              <span className="w-7 text-right font-cond font-black text-[21px] text-field-400 tabular-nums">{r.rank}</span>
              {r.avatarUrl
                ? <img src={r.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                : <span className="w-7 h-7 rounded-full bg-field-700 flex items-center justify-center text-[14px] font-black text-gold shrink-0">{r.name[0]?.toUpperCase()}</span>}
              <span className="min-w-0 flex-1 truncate text-[21px] font-bold text-white">{r.name}</span>
              {moved !== 0 && (
                <span
                  className={clsx('shrink-0 rounded-md px-1.5 font-cond font-black text-[16px] tabular-nums', moved > 0 ? 'bg-emerald-500/25 text-emerald-300' : 'bg-red-500/25 text-red-300')}
                  style={{ animation: 'tv-pop .5s ease-out both' }}
                >
                  {moved > 0 ? '▲' : '▼'}{Math.abs(moved)}
                </span>
              )}
              <TvFlair badge={r.flair} size={22} />
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

const MemoStandingsPanel = memo(StandingsPanel)

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

function SpotlightCard({ p }: { p: TvSpotlight }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {p.avatarUrl
          ? <img src={p.avatarUrl} alt="" className="w-20 h-20 rounded-2xl object-cover shrink-0" />
          : <span className="w-20 h-20 rounded-2xl bg-field-700 flex items-center justify-center text-[36px] font-black text-gold shrink-0">{p.name[0]?.toUpperCase()}</span>}
        <div className="min-w-0">
          <p className="font-cond font-black uppercase text-white text-[32px] leading-tight truncate">{p.name}</p>
          <p className="text-[18px] text-field-300">#{p.rank} of {p.of} · <span className="font-bold text-white">{p.correct}–{p.played - p.correct}</span>{p.weeksWon > 0 && <> · {p.weeksWon}×🏆</>}</p>
        </div>
      </div>
      {p.archetype && (
        <div>
          <p className="font-cond font-bold uppercase tracking-[0.15em] text-[15px] text-field-400">Pick DNA</p>
          <p className="font-cond font-black uppercase text-[26px] text-gold leading-tight">{p.archetype.title}</p>
          <p className="text-[17px] text-field-300 leading-snug">{p.archetype.blurb}</p>
        </div>
      )}
      {(p.twin || p.nemesis) && (
        <div className="space-y-1">
          {p.twin && <p className="text-[18px] text-field-200"><span className="font-bold text-gold">Twin:</span> {p.twin.name} · same pick {Math.round(p.twin.agree * 100)}%</p>}
          {p.nemesis && <p className="text-[18px] text-field-200"><span className="font-bold text-red-400">Nemesis:</span> {p.nemesis.name} · {p.nemesis.youRight}–{p.nemesis.theyRight} in their {p.nemesis.split} splits</p>}
        </div>
      )}
      {p.beltWeeks.length > 0 && (
        <p className="flex items-center gap-2 text-[18px] text-field-200"><BeltIcon className="w-[28px] h-[17px]" /> Held the Belt: {p.beltWeeks.map(w => `W${w}`).join(', ')}</p>
      )}
      {p.badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {p.badges.map(b => <span key={b} className="rounded-md bg-gold/15 border border-gold/30 px-2 py-0.5 text-[15px] font-bold text-gold">{b}</span>)}
        </div>
      )}
    </div>
  )
}

/**
 * Everyone's tiebreaker guess on a number line, with the tiebreaker
 * game's combined score climbing it live. Only once the guesses are
 * public (the game has locked). Players tied for first, the ones it
 * decides, are gold; the closest of them right now gets a star; guesses
 * the score has already passed are dimmed (it only goes up).
 */
function TiebreakerLine({ b }: { b: TvBoard }) {
  const tb = b.games.find(g => g.tiebreaker)
  const byId = new Map(b.week_table.map(r => [r.userId, r]))
  const guesses = (b.board?.rows ?? [])
    .filter(r => r.tiebreaker != null)
    .map(r => ({ name: byId.get(r.userId)?.name ?? 'Someone', guess: r.tiebreaker as number, correct: byId.get(r.userId)?.correct ?? 0 }))
  if (!tb || guesses.length === 0) return null

  const started = tb.state === 'live' || tb.state === 'final'
  const final = tb.state === 'final'
  const total = (tb.awayScore ?? 0) + (tb.homeScore ?? 0)
  const top = Math.max(...b.week_table.map(r => r.correct))
  const contending = (c: number) => c === top

  // One row per guess value, highest at the top
  const groups = [...guesses.reduce((m, g) => m.set(g.guess, [...(m.get(g.guess) ?? []), g]), new Map<number, typeof guesses>())]
    .map(([guess, people]) => ({ guess, people }))
    .sort((a, b) => b.guess - a.guess)
  const marks = [...groups.map(g => g.guess), ...(started ? [total] : []), ...(tb.total != null ? [tb.total] : [])]
  const lo = Math.min(...marks) - 3, hi = Math.max(...marks) + 3
  const H = 600, GAP = 30
  const yOf = (v: number) => ((hi - v) / (hi - lo)) * H

  // Labels at their value, nudged apart so none overlap
  const ys = groups.map(g => yOf(g.guess))
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + GAP)
  const over = ys.length ? ys[ys.length - 1] - H : 0
  if (over > 0) for (let i = 0; i < ys.length; i++) ys[i] -= over
  for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - GAP)

  const closest = started
    ? Math.min(...guesses.filter(g => contending(g.correct)).map(g => Math.abs(g.guess - total)))
    : null

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-cond font-black text-[24px] text-white">{tb.away} @ {tb.home}</span>
        <span className={clsx('font-cond font-black text-[26px] tabular-nums', started ? 'text-gold' : 'text-field-400')}>
          {started ? `${final ? 'Final' : 'Total'} ${total}` : 'Not started'}
        </span>
      </div>
      <div className="relative" style={{ height: H }}>
        {/* The axis */}
        <span className="absolute left-[52px] top-0 bottom-0 w-[3px] bg-field-700 rounded" />
        {/* Vegas' total */}
        {tb.total != null && (
          <div className="absolute left-0 right-0 flex items-center" style={{ top: yOf(tb.total) }}>
            <span className="w-[44px] text-right text-[13px] font-bold text-field-500 -translate-y-1/2">O/U</span>
            <span className="ml-3 flex-1 border-t-2 border-dashed border-field-600 -translate-y-1/2" />
          </div>
        )}
        {/* The live total */}
        {started && (
          <div className="absolute left-0 right-0 flex items-center z-10 transition-[top] duration-1000" style={{ top: yOf(total) }}>
            <span className="w-[44px] text-right font-cond font-black text-[20px] text-gold -translate-y-1/2 tabular-nums">{total}</span>
            <span className="ml-3 flex-1 h-[4px] bg-gold rounded -translate-y-1/2 shadow-[0_0_14px_rgba(206,123,69,0.7)]" />
          </div>
        )}
        {/* Guesses */}
        {groups.map((g, i) => {
          const passed = started && !final && g.guess < total
          const lead = closest != null && g.people.some(p => contending(p.correct)) && Math.abs(g.guess - total) === closest
          return (
            <div key={g.guess}>
              <span className="absolute left-[48px] w-[11px] h-[11px] rounded-full bg-field-400 -translate-y-1/2" style={{ top: yOf(g.guess) }} />
              <div
                className={clsx('absolute left-[70px] right-0 flex items-baseline gap-2 -translate-y-1/2 whitespace-nowrap', passed && 'opacity-35')}
                style={{ top: ys[i] }}
              >
                <span className="font-cond font-black text-[21px] text-white tabular-nums w-9 text-right">{g.guess}</span>
                <span className="min-w-0 truncate text-[18px]">
                  {g.people.map((p, k) => (
                    <span key={p.name} className={clsx(contending(p.correct) ? 'font-bold text-gold' : 'text-field-300')}>
                      {k > 0 && ', '}{p.name}
                    </span>
                  ))}
                </span>
                {lead && <span className="text-gold text-[18px]">★</span>}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[14px] text-field-500"><span className="text-gold font-bold">Gold</span>: tied for first, where the tiebreaker decides it · ★ closest right now</p>
    </div>
  )
}

function panelsFor(b: TvBoard, spot: number): Panel[] {
  const out: Panel[] = []
  const names = (list: string[], max = 4) => list.length <= max ? list.join(', ') : `${list.slice(0, max).join(', ')} +${list.length - max}`
  const spots = b.spotlights ?? []
  const spotlight = (n: number): Panel | null => {
    if (!spots.length) return null
    const p = spots[n % spots.length]
    return { key: `spot-${n % 2}`, title: '⭐ Player spotlight', body: <SpotlightCard p={p} /> }
  }

  // The tiebreaker, first while that game's being played
  const tbGame = b.games.find(g => g.tiebreaker)
  const tbPanel: Panel | null = tbGame && (b.board?.rows ?? []).some(r => r.tiebreaker != null)
    ? { key: 'tiebreaker', title: '🎯 Tiebreaker watch', body: <TiebreakerLine b={b} /> }
    : null
  if (tbPanel && tbGame?.state === 'live') out.push(tbPanel)

  if (b.shame && b.shame.rows.length) {
    const sh = b.shame
    out.push({ key: 'shame', title: '⏰ Still owe picks', body: (
      <div className="space-y-3">
        {sh.lockAt && (
          <p className="font-cond font-black uppercase text-[34px] text-amber-300 leading-tight">Locks in <Countdown to={sh.lockAt} /></p>
        )}
        {sh.rows.slice(0, 12).map(r => (
          <div key={r.name} className="flex items-baseline justify-between gap-3">
            <span className="text-[22px] font-bold text-white truncate">{r.name}</span>
            <span className={clsx('shrink-0 text-[16px] font-bold', r.none ? 'text-red-400' : 'text-amber-300')}>
              {r.none ? 'No picks at all' : r.missing > 0 ? `${r.missing} game${r.missing === 1 ? '' : 's'} missing` : 'No tiebreaker'}
            </span>
          </div>
        ))}
        {sh.rows.length > 12 && <p className="text-[16px] text-field-400">+{sh.rows.length - 12} more</p>}
      </div>
    ) })
  }
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
  // Before or after that game, it takes its turn with the rest
  if (tbPanel && tbGame?.state !== 'live') out.push(tbPanel)
  const first = spotlight(spot * 2)
  if (first) out.push(first)
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
  if (b.conquest) out.push({ key: 'conquest', title: '⚔️ Conquest', body: <ConquestPanel b={b} /> })
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
  if (b.next_week?.games.length) {
    const nw = b.next_week
    out.push({ key: 'next', title: `📅 ${weekTitle(nw.week)} preview`, body: (
      <div className="space-y-1">
        {nw.games.slice(0, 16).map((g, i) => (
          <div key={i} className="flex items-baseline justify-between gap-2">
            <span className="font-cond font-black text-[21px] text-white whitespace-nowrap">{g.away} @ {g.home}</span>
            <span className="text-[15px] text-field-400 truncate text-right">
              {kickoffLabel(g.kickoff)}{lineLabel(g) ? ` · ${lineLabel(g)}` : ''}{g.total != null ? ` · ${g.total}` : ''}
            </span>
          </div>
        ))}
      </div>
    ) })
  }
  if (b.injuries?.length) {
    out.push({ key: 'injuries', title: '🩹 Injury report', body: (
      <div className="space-y-2">
        {b.injuries.slice(0, 12).map((x, i) => {
          const logo = teamLogoUrl({ abbr: x.team }, 'NFL')
          return (
            <div key={i} className="flex items-center gap-2.5">
              {logo ? <img src={logo} alt="" className="w-8 h-8 object-contain shrink-0" /> : <span className="w-8 font-cond font-black text-[15px]">{x.team}</span>}
              <span className="min-w-0 flex-1 truncate text-[20px] font-bold text-white">{x.name} <span className="text-field-400 font-normal">{x.pos}</span></span>
              <span className={clsx('shrink-0 rounded px-1.5 text-[14px] font-black tracking-wider', x.status === 'out' ? 'bg-red-500/25 text-red-300' : 'bg-amber-500/20 text-amber-300')}>
                {x.status === 'out' ? 'OUT' : 'QUESTIONABLE'}
              </span>
            </div>
          )
        })}
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
  const second = spotlight(spot * 2 + 1)
  if (second) out.push(second)
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
/** A panel fades out for this long before the next one fades in. */
const PANEL_FADE_MS = 450
const PANEL_CSS = '@keyframes tv-panel-out { from { opacity: 1; transform: none } to { opacity: 0; transform: translateY(-12px) } }'

function FeaturePanel({ board }: { board: TvBoard }) {
  const still = useContext(StillFx)
  const [i, setI] = useState(0)
  const [out, setOut] = useState(false)
  // Which panels there are doesn't depend on whose spotlight it is
  const count = useMemo(() => panelsFor(board, 0).length, [board])
  // Each lap through the panels moves on to the next two players
  const spot = count ? Math.floor(i / count) : 0
  const panels = useMemo(() => panelsFor(board, spot), [board, spot])
  const keys = panels.map(p => p.key).join(',')
  useEffect(() => {
    setI(0)
    setOut(false)
    if (count <= 1) return
    let swap: ReturnType<typeof setTimeout>
    const t = setInterval(() => {
      // Still: straight to the next one
      if (still) { setI(x => x + 1); return }
      setOut(true)
      swap = setTimeout(() => { setI(x => x + 1); setOut(false) }, PANEL_FADE_MS)
    }, PANEL_MS)
    return () => { clearInterval(t); clearTimeout(swap) }
    // Restart only when the set of panels changes, not on every refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys])
  const leave: CSSProperties | undefined = out ? { animation: `tv-panel-out ${PANEL_FADE_MS}ms ease-in both` } : undefined
  if (panels.length === 0) return <div className="flex-1 min-w-0" />
  const at = i % panels.length
  const panel = panels[at]
  const next = panels[(at + 1) % panels.length]

  return (
    <div className="flex-1 min-w-0 flex flex-col rounded-2xl border-2 border-field-800 bg-field-900/85 overflow-hidden">
      <style>{PANEL_CSS}</style>
      <div className="px-5 py-3 border-b-2 border-field-800">
        <p key={panel.key + i} className="font-cond font-black uppercase text-white text-[26px] tracking-wide truncate rise-in" style={leave}>{panel.title}</p>
      </div>
      <div key={panel.key + i} className="flex-1 min-h-0 overflow-hidden px-5 py-4 rise-in" style={leave}>
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

const MemoFeaturePanel = memo(FeaturePanel)

// ── The ticker ────────────────────────────────────────────────
function Ticker({ board, greeting, song }: { board: TvBoard; greeting?: string; song: NowPlaying | null }) {
  const still = useContext(StillFx)
  const strip = useSongFade(song)
  const items = useMemo(() => {
    const out: string[] = []
    // A holiday theme's greeting leads
    if (greeting) out.push(greeting)
    if (board.pin) out.push(`📌 ${board.pin}`)
    out.push(...board.upsets.map(u => `🚨 ${u}`))
    // The last play in every live game
    for (const g of board.games) {
      if (g.state === 'live' && g.lastPlay) out.push(`🏈 ${g.away} @ ${g.home}: ${g.lastPlay}`)
    }
    if (board.shame?.rows.length && board.shame.lockAt) {
      out.push(`⏰ Picks lock ${kickoffLabel(board.shame.lockAt)} · still waiting on ${board.shame.rows.map(r => r.name).join(', ')}`)
    }
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
    for (const x of (board.injuries ?? []).filter(i => i.status === 'out').slice(0, 4)) out.push(`🩹 ${x.team} ${x.pos} ${x.name} is out`)
    if (board.nextKickoff) {
      const g = board.games.find(x => x.kickoff === board.nextKickoff && x.state === 'pre')
      out.push(`Next kickoff: ${g ? `${g.away} @ ${g.home}, ` : ''}${kickoffLabel(board.nextKickoff)}`)
    }
    return out
  }, [board, greeting])

  if (items.length === 0 && !strip.shown) return <div className="h-[56px] shrink-0" />
  const text = items.join('     •     ')
  const seconds = Math.max(30, Math.round(text.length * 0.2))
  return (
    <div className="h-[56px] shrink-0 border-t-2 border-field-800 bg-field-900/90 overflow-hidden flex items-center">
      {strip.shown && <SongStrip song={strip.shown} leaving={strip.leaving} />}
      {still ? <TickerSteps items={items} /> : (
      <>
      <style>{'@keyframes tv-ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }'}</style>
      {/* Its own lane, so the scrolling text never runs under the song */}
      <div className="flex-1 min-w-0 h-full overflow-hidden flex items-center">
        <div className="flex whitespace-nowrap" style={{ animation: `tv-ticker ${seconds}s linear infinite` }}>
          {[0, 1].map(i => (
            <span key={i} className="whitespace-pre font-cond font-bold text-[27px] text-field-200 tracking-wide">
              {text + '     •     '}
            </span>
          ))}
        </div>
      </div>
      </>
      )}
    </div>
  )
}

/** How long each ticker item shows when nothing moves (?fx=still). */
const TICKER_STEP_MS = 7000

/** Still: the ticker one item at a time, a few seconds each, instead of a scroll that never stops. */
function TickerSteps({ items }: { items: string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    setI(0)
    if (items.length <= 1) return
    const t = setInterval(() => setI(x => x + 1), TICKER_STEP_MS)
    return () => clearInterval(t)
  }, [items.length])
  const item = items[i % Math.max(1, items.length)] ?? ''
  return (
    <div className="flex-1 min-w-0 h-full flex items-center px-6">
      <span className={clsx('truncate font-cond font-bold text-field-200 tracking-wide', item.length > 90 ? 'text-[22px]' : 'text-[27px]')}>{item}</span>
    </div>
  )
}

// ── Takeovers: the full screen now and then ───────────────────
// Before a lock that's under three hours away: who still owes picks.
// Otherwise the Commish's latest roast, and the champion once the
// week's final.
const TAKEOVER_EVERY = 5 * 60_000
// The roast's turn on screen: long enough to catch, not to read all of it
const TAKEOVER_FOR = 20_000

function Takeover({ board, emoji }: { board: TvBoard; emoji?: string }) {
  const now = useNow(60_000)
  const sh = board.shame
  const urgent = !!sh?.lockAt && sh.rows.length > 0 && new Date(sh.lockAt).getTime() - now < 3 * 3600_000
  const roast = board.roast?.text ? board.roast : null
  const champ = board.complete && board.winners.length ? board.winners : null
  const [on, setOn] = useState(false)
  // The remote: the roast now, or clear the screen
  const [forced, setForced] = useState(false)
  const forcedTimer = useRef<ReturnType<typeof setTimeout>>()
  useTvRemote(r => {
    if (r.action === 'roast' && roast) {
      setForced(true)
      clearTimeout(forcedTimer.current)
      forcedTimer.current = setTimeout(() => setForced(false), TAKEOVER_FOR)
    }
    if (r.action === 'clear') { clearTimeout(forcedTimer.current); setForced(false); setOn(false) }
  })
  useEffect(() => () => clearTimeout(forcedTimer.current), [])
  const kind = forced ? 'roast' : urgent ? 'shame' : roast || champ ? 'roast' : null
  useEffect(() => {
    if (!kind) { setOn(false); return }
    let hide: ReturnType<typeof setTimeout>
    const show = () => { setOn(true); hide = setTimeout(() => setOn(false), kind === 'roast' && roast ? TAKEOVER_FOR : 15_000) }
    const first = setTimeout(show, 60_000)
    const every = setInterval(show, TAKEOVER_EVERY)
    return () => { clearTimeout(first); clearInterval(every); clearTimeout(hide) }
  }, [kind, roast])
  if (!(on || forced) || !kind) return null

  if (kind === 'shame' && sh?.lockAt) {
    return (
      <div className="absolute inset-0 z-10 bg-field-950/[0.97] flex flex-col items-center justify-center px-24 py-16 text-center rise-in">
        <p className="font-cond font-bold uppercase tracking-[0.3em] text-amber-300 text-[32px]">Picks lock in</p>
        <p className="font-cond font-black uppercase text-white text-[120px] leading-none mb-10"><Countdown to={sh.lockAt} /></p>
        <p className="font-cond font-bold uppercase tracking-[0.2em] text-field-400 text-[28px] mb-4">Still waiting on</p>
        <p className="text-[46px] font-bold text-white leading-snug max-w-[1600px]">
          {sh.rows.map(r => r.name + (r.none ? '' : r.missing ? ` (${r.missing} left)` : ' (tiebreaker)')).join(' · ')}
        </p>
      </div>
    )
  }

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
          <p className="font-cond font-black uppercase tracking-[0.2em] text-gold text-[30px] mb-4">{emoji ?? '🎙️'} The Commish · {weekTitle(roast.week)} roast</p>
          <p className="text-[27px] leading-[1.45] text-white whitespace-pre-line" style={{ columnCount: roast.text.length > 700 ? 2 : 1, columnGap: 64 }}>
            {roast.text}
          </p>
        </div>
      )}
    </div>
  )
}

// ── The pick reveal ───────────────────────────────────────────
// Full screen, the moment games lock: each one with how the shop picked
// it, most lopsided first and the closest split last.
const REVEAL_INTRO = 3500
const REVEAL_GAME = 7000

function RevealShow({ board, games, onDone }: { board: TvBoard; games: TvGame[]; onDone: () => void }) {
  const share = (g: TvGame) => {
    const a = g.riders?.away.length ?? 0, h = g.riders?.home.length ?? 0
    return a + h ? Math.max(a, h) / (a + h) : 0
  }
  const order = useMemo(
    () => [...games].sort((x, y) => share(y) - share(x) || new Date(x.kickoff).getTime() - new Date(y.kickoff).getTime()),
    [games],
  )
  const [step, setStep] = useState(-1) // -1: the intro
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const t = setTimeout(() => {
      if (step + 1 >= order.length) done.current()
      else setStep(s => s + 1)
    }, step < 0 ? REVEAL_INTRO : REVEAL_GAME)
    return () => clearTimeout(t)
  }, [step, order.length])

  // The split bar grows in after each game appears
  const [grow, setGrow] = useState(false)
  useEffect(() => {
    setGrow(false)
    const t = setTimeout(() => setGrow(true), 450)
    return () => clearTimeout(t)
  }, [step])

  if (step < 0) {
    return (
      <div className="absolute inset-0 z-30 bg-field-950 flex flex-col items-center justify-center text-center rise-in">
        <p className="font-cond font-bold uppercase tracking-[0.35em] text-gold text-[34px]">{board.league} · {weekTitle(board.week)}</p>
        <p className="font-cond font-black uppercase text-white text-[150px] leading-none mt-4">🔒 Picks are in</p>
        <p className="text-field-300 text-[38px] mt-6">{order.length === 1 ? 'One game just locked' : `${order.length} games just locked`}. Here&apos;s how the shop picked.</p>
      </div>
    )
  }

  const g = order[Math.min(step, order.length - 1)]
  const a = g.riders?.away ?? [], h = g.riders?.home ?? []
  const n = a.length + h.length
  const callout = n === 0 ? 'Nobody picked this one'
    : a.length === 0 || h.length === 0 ? 'Unanimous'
    : a.length === 1 ? `Only ${a[0]} took ${g.away}`
    : h.length === 1 ? `Only ${h[0]} took ${g.home}`
    : Math.abs(a.length - h.length) <= 1 ? 'The shop is split'
    : null

  const side = (team: string, people: string[], align: 'left' | 'right') => (
    <div className={clsx('flex-1 min-w-0 flex flex-col', align === 'left' ? 'items-start text-left' : 'items-end text-right')}>
      <div className={clsx('flex items-center gap-6', align === 'right' && 'flex-row-reverse')}>
        <TeamLogo team={team} className="w-[190px] h-[190px]" />
        <div>
          <p className="font-cond font-black text-white text-[96px] leading-none">{team}</p>
          <p className="font-cond font-black text-gold text-[52px] leading-tight tabular-nums">{people.length} {people.length === 1 ? 'pick' : 'picks'}</p>
        </div>
      </div>
      <p className="mt-6 text-[26px] leading-snug text-field-200 max-w-[760px]">{people.join(', ') || '—'}</p>
    </div>
  )

  return (
    <div key={g.id} className="absolute inset-0 z-30 bg-field-950 flex flex-col px-24 py-16 rise-in">
      <div className="flex items-baseline justify-between">
        <p className="font-cond font-bold uppercase tracking-[0.3em] text-gold text-[28px]">🔒 Picks are in · {weekTitle(board.week)}</p>
        <p className="font-cond font-bold text-field-400 text-[26px] tabular-nums">{step + 1} of {order.length}</p>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-10">
        <div className="flex items-start gap-12">
          {side(g.away, a, 'left')}
          <span className="font-cond font-black text-field-600 text-[60px] self-center">@</span>
          {side(g.home, h, 'right')}
        </div>

        {n > 0 && (
          <div className="flex h-[46px] rounded-full overflow-hidden bg-field-800">
            <span className="bg-field-300 transition-[width] duration-[1200ms] ease-out" style={{ width: grow ? `${(a.length / n) * 100}%` : '0%' }} />
            <span className="ml-auto bg-gold transition-[width] duration-[1200ms] ease-out" style={{ width: grow ? `${(h.length / n) * 100}%` : '0%' }} />
          </div>
        )}

        {callout && (
          <p className={clsx(
            'text-center font-cond font-black uppercase text-[64px] leading-none transition-opacity duration-700',
            grow ? 'opacity-100' : 'opacity-0',
            callout === 'The shop is split' ? 'text-white' : 'text-gold',
          )}>
            {callout}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Live from phones: reactions and chat ──────────────────────
// One channel, tv:<code>, carries both. A member taps an emoji in the
// app (send_tv_reaction) and it floats up the screen with their name
// under it. Every message in the league chat (league_messages_to_tv)
// and in the TV chat (send_tv_message: the TV's own, never in the league
// chat) pops up in the bottom-left corner for a few seconds; one that's
// unsent or deleted comes straight off, and the board reloads so the
// trash talk panel drops it too.
// ?preview=chat shows three sample messages, to see how they look.
interface Floater { id: number; emoji: string; name: string; x: number; drift: number; size: number; dur: number }
interface ChatPop { id: number; msgId: string | null; name: string; avatar: string | null; text: string; gif: string | null; thread: string | null; dur: number }

const CHAT_PREVIEW = [
  { name: 'Preview', text: 'Bears ain\'t ready. Book it.' },
  { name: 'Preview', text: 'Whoever took the Jets this week, explain yourself', thread: 'NYJ @ BUF' },
  { name: 'Preview', text: '🔥🔥🔥 called it' },
]

/** This TV's presence on its channel, for the commissioner's remote: on lighter effects, and its Spotify speaker. */
interface TvStatus { lite: boolean; still: boolean; speaker: SpeakerState; perf: TvPerf | null; asleep: boolean; sleep: SleepReason | null }
const tvPresence = (since: string, s: TvStatus) => ({
  on: true, since, fx: s.still ? 'still' : s.lite ? 'lite' : 'full', speaker: s.speaker,
  fps: s.perf?.fps ?? null, slow: s.perf?.slow ?? null, silk: SILK, asleep: s.asleep, sleep: s.sleep,
})

function LiveFromPhones({ code, status }: { code: string; status: TvStatus }) {
  const [floaters, setFloaters] = useState<Floater[]>([])
  const [chats, setChats] = useState<ChatPop[]>([])
  // What the remote sees of this TV: on since when, its effects, its
  // speaker, its frames a second, asleep after hours
  const joined = useRef<{ channel: ReturnType<typeof supabase.channel>; since: string } | null>(null)
  const now = useRef(status)
  const { lite, still, speaker, perf, asleep, sleep } = status
  useEffect(() => {
    now.current = { lite, still, speaker, perf, asleep, sleep }
    if (joined.current) void joined.current.channel.track(tvPresence(joined.current.since, now.current))
  }, [lite, still, speaker, perf, asleep, sleep])
  useEffect(() => {
    let n = 0
    const timers: ReturnType<typeof setTimeout>[] = []
    const onChat = (p: { id?: string; name?: string; avatar?: string | null; text?: string; gif?: string | null; thread?: string | null }) => {
      const text = String(p.text ?? '').slice(0, 240)
      const gif = typeof p.gif === 'string' && /^https:\/\//.test(p.gif) ? p.gif : null
      if (!text && !gif) return
      // Long enough to read: 8s, plus a bit per character, up to 16s
      const c: ChatPop = {
        id: ++n,
        msgId: typeof p.id === 'string' ? p.id : null,
        name: String(p.name ?? 'Someone').slice(0, 30),
        avatar: typeof p.avatar === 'string' ? p.avatar : null,
        text,
        gif,
        thread: p.thread ? String(p.thread).slice(0, 20) : null,
        dur: Math.min(16_000, (gif ? 10_000 : 8_000) + text.length * 40),
      }
      // Four on screen at most: a burst drops the oldest
      setChats(list => [...list.slice(-3), c])
      window.dispatchEvent(new CustomEvent<TvChatEvent>(TV_CHAT, {
        detail: { id: c.msgId ?? `live-${c.id}`, name: c.name, text: c.text, gif: c.gif, at: new Date().toISOString() },
      }))
      timers.push(setTimeout(() => setChats(list => list.filter(x => x.id !== c.id)), c.dur))
    }
    // Private: only the database posts here (tv_broadcast); presence tells
    // the commissioner's remote this TV is on
    const channel = supabase
      .channel(`tv:${code}`, { config: { private: true, presence: { key: 'tv' } } })
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        const p = payload as { emoji?: string; name?: string }
        if (!p?.emoji) return
        const f: Floater = {
          id: ++n,
          emoji: p.emoji,
          name: String(p.name ?? '').slice(0, 24),
          x: 4 + Math.random() * 90,
          drift: (Math.random() - 0.5) * 180,
          size: 70 + Math.random() * 44,
          dur: 4200 + Math.random() * 1800,
        }
        // Keep it to a screenful: a flood drops the oldest
        setFloaters(list => [...list.slice(-60), f])
        timers.push(setTimeout(() => setFloaters(list => list.filter(x => x.id !== f.id)), f.dur + 200))
      })
      .on('broadcast', { event: 'chat' }, ({ payload }) => onChat(payload ?? {}))
      .on('broadcast', { event: 'chat_delete' }, ({ payload }) => {
        const id = (payload as { id?: string })?.id
        if (!id) return
        setChats(list => list.filter(c => c.msgId !== id))
        window.dispatchEvent(new CustomEvent<TvChatEvent>(TV_CHAT, { detail: { deleted: id } }))
        window.dispatchEvent(new Event(TV_REFRESH))
      })
      // Votes on a poll (league_poll_votes_to_tv), for the poll on screen
      .on('broadcast', { event: 'poll_votes' }, ({ payload }) => {
        const p = payload as { id?: string; counts?: number[] }
        if (p?.id && Array.isArray(p.counts)) {
          window.dispatchEvent(new CustomEvent<TvRemote>(TV_REMOTE, { detail: { action: 'poll_votes', pollId: p.id, counts: p.counts } }))
        }
      })
      // The commissioner's remote (tv_remote)
      .on('broadcast', { event: 'remote' }, ({ payload }) => {
        window.dispatchEvent(new CustomEvent<TvRemote>(TV_REMOTE, { detail: payload as TvRemote }))
      })
      .subscribe(status => {
        if (status !== 'SUBSCRIBED') return
        joined.current = { channel, since: joined.current?.since ?? new Date().toISOString() }
        void channel.track(tvPresence(joined.current.since, now.current))
      })
    if (new URLSearchParams(window.location.search).get('preview') === 'chat') {
      CHAT_PREVIEW.forEach((p, i) => timers.push(setTimeout(() => onChat(p), 1500 + i * 2500)))
    }
    return () => { timers.forEach(clearTimeout); joined.current = null; supabase.removeChannel(channel) }
  }, [code])

  return (
    <>
      {/* Asleep: nothing pops up (the chat still lands on the chat screen once woken) */}
      {!asleep && <FloatingReactions items={floaters} />}
      {!asleep && <ChatPopups items={chats} />}
    </>
  )
}

// ── Music: the song on the league's Spotify ───────────────────
// tv-now-playing, asked again as each song should end and every 30
// seconds while one's on (a skip shows within half a minute); once a
// minute when nothing is, every 5 minutes after half an hour of quiet.
interface NowPlaying {
  title: string
  artist: string
  album: string | null
  art: string | null
  progressMs: number
  durationMs: number
  /** When it was asked, to run the progress bar from */
  at: number
}

// ?preview=music: a sample song, to see the strip and the card without Spotify
const SAMPLE_SONG = { title: 'Thunderstruck', artist: 'AC/DC', album: 'The Razors Edge', art: null, progressMs: 40_000, durationMs: 292_000 }

function useNowPlaying(code: string, on: boolean): NowPlaying | null {
  const [song, setSong] = useState<NowPlaying | null>(null)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('preview') === 'music') { setSong({ ...SAMPLE_SONG, at: Date.now() }); return }
    if (!on) { setSong(null); return }
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    let quietSince = Date.now()
    const load = async () => {
      let next = 60_000
      try {
        const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tv-now-playing?token=${encodeURIComponent(code)}`, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
          cache: 'no-store',
        })
        const d = await r.json()
        if (!alive) return
        if (d.playing && d.title) {
          quietSince = Date.now()
          setSong({ title: d.title, artist: d.artist ?? '', album: d.album ?? null, art: d.art ?? null, progressMs: d.progressMs ?? 0, durationMs: d.durationMs ?? 0, at: Date.now() })
          next = Math.max(4000, Math.min(30_000, (d.durationMs ?? 0) - (d.progressMs ?? 0) + 1500))
        } else {
          setSong(null)
          const quiet = Date.now() - quietSince
          next = d.retryAfterSec ? d.retryAfterSec * 1000
            : d.connected === false ? 10 * 60_000
            : quiet > 2 * 3600_000 ? 15 * 60_000
            : quiet > 30 * 60_000 ? 5 * 60_000
            : 60_000
        }
      } catch {
        next = 60_000
      }
      if (alive) timer = setTimeout(due, next)
    }
    const { due, stop } = onScreen(load)
    load()
    return () => { alive = false; clearTimeout(timer); stop() }
  }, [code, on])
  return song
}

// ── The TV as a Spotify speaker ───────────────────────────────
// Spotify's Web Playback SDK makes this page a Spotify Connect device
// ("Watts Upfitting TV"): pick it in Spotify's list of devices and the
// music plays out of the TV. Needs Premium, a browser that can play
// Spotify's protected audio, and a click on the page (or OK on the TV's
// remote) before the browser lets it make sound. The token comes from
// tv-spotify-token, which only hands one out while the commissioner has
// the speaker on.
type SpeakerState = 'off' | 'connecting' | 'ready' | 'blocked' | 'unsupported' | 'premium' | 'auth' | 'error'

interface SpotifyPlayer {
  connect(): Promise<boolean>
  disconnect(): void
  addListener(event: string, cb: (arg: any) => void): boolean
  activateElement?(): Promise<void>
  resume(): Promise<void>
}
type SpotifyPlayerClass = new (options: { name: string; volume: number; getOAuthToken: (cb: (token: string) => void) => void }) => SpotifyPlayer

/** When the TV's speaker last played (the six-hourly reload waits for it to go quiet). */
let speakerPlayedAt = 0

let spotifySdk: Promise<SpotifyPlayerClass> | null = null
function loadSpotifySdk(): Promise<SpotifyPlayerClass> {
  spotifySdk ??= new Promise((resolve, reject) => {
    const w = window as any
    if (w.Spotify?.Player) { resolve(w.Spotify.Player); return }
    w.onSpotifyWebPlaybackSDKReady = () => resolve(w.Spotify.Player)
    const script = document.createElement('script')
    script.src = 'https://sdk.scdn.co/spotify-player.js'
    script.async = true
    script.onerror = () => { spotifySdk = null; reject(new Error("Spotify's player didn't load")) }
    document.head.appendChild(script)
  })
  return spotifySdk
}

function useSpotifySpeaker(code: string, on: boolean, name: string): SpeakerState {
  const [state, setState] = useState<SpeakerState>('off')
  useEffect(() => {
    if (!on) { setState('off'); return }
    let alive = true
    let player: SpotifyPlayer | null = null
    let blocked = false
    const set = (s: SpeakerState) => {
      if (!alive) return
      blocked = s === 'blocked'
      setState(s)
    }
    set('connecting')
    const token = async () => {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tv-spotify-token?token=${encodeURIComponent(code)}`, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        cache: 'no-store',
      })
      if (!r.ok) throw new Error(String(r.status))
      return ((await r.json()) as { token: string }).token
    }
    loadSpotifySdk().then(Player => {
      if (!alive) return
      player = new Player({ name, volume: 1, getOAuthToken: cb => { token().then(cb, () => set('auth')) } })
      player.addListener('ready', () => set('ready'))
      player.addListener('not_ready', () => set('connecting'))
      player.addListener('initialization_error', () => set('unsupported'))
      player.addListener('authentication_error', () => set('auth'))
      player.addListener('account_error', () => set('premium'))
      // Spotify sent music here, but the browser won't make sound without a click first
      player.addListener('autoplay_failed', () => set('blocked'))
      player.addListener('player_state_changed', (s: { paused: boolean } | null) => {
        if (!s || s.paused) return
        speakerPlayedAt = Date.now()
        if (blocked) set('ready')
      })
      void player.connect()
    }, () => set('error'))
    // A click on the TV (or OK on its remote) lets the page make sound; music
    // the browser held back starts now
    const unlock = () => {
      if (!player) return
      void player.activateElement?.()
      if (blocked) { void player.resume(); set('ready') }
    }
    window.addEventListener('click', unlock, true)
    window.addEventListener('keydown', unlock, true)
    return () => {
      alive = false
      window.removeEventListener('click', unlock, true)
      window.removeEventListener('keydown', unlock, true)
      player?.disconnect()
    }
  }, [code, on, name])
  return state
}

/** Spotify's sending music to the TV, but the browser needs a click before it plays sound. */
function SpeakerBlocked() {
  return (
    <div className="absolute left-8 bottom-[76px] z-[27] pointer-events-none flex items-center gap-4 rounded-2xl border-2 border-[#1DB954]/60 bg-field-900/[0.97] shadow-2xl shadow-black/60 px-5 py-3.5 rise-in">
      <span className="text-[40px] leading-none">🔇</span>
      <div className="leading-tight">
        <p className="font-cond font-black text-[28px] text-white">Spotify’s playing on this TV</p>
        <p className="text-[20px] text-field-300">Click the screen (or press OK on the TV’s remote) to turn the sound on</p>
      </div>
    </div>
  )
}

/**
 * Polling that stops while the TV page can't be seen (the screen's off,
 * the device asleep, the tab hidden): a call that comes due then waits,
 * and runs the moment the page is back on screen. `due` is what the
 * poller's timer calls instead of `load`.
 */
function onScreen(load: () => void): { due: () => void; stop: () => void } {
  let waiting = false
  const due = () => {
    if (document.visibilityState === 'hidden') waiting = true
    else load()
  }
  const back = () => {
    if (document.visibilityState === 'visible' && waiting) { waiting = false; load() }
  }
  document.addEventListener('visibilitychange', back)
  return { due, stop: () => document.removeEventListener('visibilitychange', back) }
}

const MUSIC_CSS = '@keyframes tv-eq { 0%, 100% { transform: scaleY(.3) } 50% { transform: scaleY(1) } }'
  + ' @keyframes tv-song-in { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }'
  + ' @keyframes tv-song-out { from { opacity: 1; transform: none } to { opacity: 0; transform: translateY(14px) } }'

/** How long the song card and strip take to fade in or out. */
const SONG_FADE_MS = 700
const SONG_CARD_MS = 8000
const fade = (leaving: boolean): CSSProperties => ({
  animation: `${leaving ? 'tv-song-out' : 'tv-song-in'} ${SONG_FADE_MS}ms ease-${leaving ? 'in' : 'out'} both`,
})

/** The last song, kept a moment after the music stops so it can fade out. */
function useSongFade(song: NowPlaying | null): { shown: NowPlaying | null; leaving: boolean } {
  const [shown, setShown] = useState(song)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (song) { setShown(song); setLeaving(false); return }
    setLeaving(true)
    const t = setTimeout(() => { setShown(null); setLeaving(false) }, SONG_FADE_MS)
    return () => clearTimeout(t)
  }, [song])
  return { shown, leaving }
}

/** Three bouncing bars: music's on. */
function Equalizer({ size }: { size: number }) {
  // Still: the bars hold still
  const still = useContext(StillFx)
  return (
    <span className="inline-flex items-end gap-[3px] shrink-0" style={{ height: size }} aria-hidden>
      {[0.9, 0.6, 1.1].map((d, i) => (
        <span
          key={i}
          className="w-[4px] h-full rounded-sm bg-[#1DB954] origin-bottom"
          style={still ? { transform: `scaleY(${[0.6, 1, 0.75][i]})` } : { animation: `tv-eq ${d}s ease-in-out ${i * 0.15}s infinite` }}
        />
      ))}
    </span>
  )
}

/** How far into the song, run on from when it was asked. */
function SongProgress({ song }: { song: NowPlaying }) {
  // Still: a step every 5 seconds, not a glide every second
  const still = useContext(StillFx)
  const now = useNow(still ? 5000 : 1000)
  const done = song.durationMs ? Math.min(1, (song.progressMs + now - song.at) / song.durationMs) : 0
  // Grown with a transform, not its width, so the TV doesn't redo the
  // layout and repaint every frame the whole time music plays
  return (
    <div
      className="absolute left-0 bottom-0 w-full h-[3px] bg-[#1DB954] origin-left"
      style={{ transform: `scaleX(${done})`, transition: still ? undefined : 'transform 1s linear' }}
    />
  )
}

/** The song, at the left end of the ticker. */
function SongStrip({ song, leaving }: { song: NowPlaying; leaving: boolean }) {
  return (
    <div className="relative h-full w-[540px] shrink-0 flex items-center gap-3 px-4 bg-field-950 border-r-2 border-field-800" style={fade(leaving)}>
      <style>{MUSIC_CSS}</style>
      {song.art
        ? <img src={song.art} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />
        : <span className="w-10 h-10 rounded-md bg-field-800 flex items-center justify-center text-[22px] shrink-0">♪</span>}
      <Equalizer size={22} />
      <div className="min-w-0 leading-tight">
        <p className="text-[20px] font-bold text-white truncate">{song.title}</p>
        <p className="text-[15px] text-field-400 truncate">{song.artist}</p>
      </div>
      <SongProgress song={song} />
    </div>
  )
}

/** When the song changes: a bigger card above the ticker, bottom right, for 8 seconds. */
function SongCard({ song }: { song: NowPlaying | null }) {
  const key = song ? `${song.title}\u0000${song.artist}` : null
  const [shown, setShown] = useState<NowPlaying | null>(null)
  const [leaving, setLeaving] = useState(false)
  const last = useRef<string | null>(null)
  useEffect(() => {
    if (!key || key === last.current) return
    last.current = key
    setShown(song)
    setLeaving(false)
    const out = setTimeout(() => setLeaving(true), SONG_CARD_MS - SONG_FADE_MS)
    const gone = setTimeout(() => setShown(null), SONG_CARD_MS)
    return () => { clearTimeout(out); clearTimeout(gone) }
    // Only a new song (not every refresh of the same one) shows the card
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!shown) return null
  return (
    <div
      key={key ?? ''}
      style={fade(leaving)}
      className="absolute right-8 bottom-[76px] z-[27] pointer-events-none flex items-center gap-5 rounded-2xl border-2 border-[#1DB954]/60 bg-field-900/[0.97] shadow-2xl shadow-black/60 p-4 max-w-[720px]"
    >
      <style>{MUSIC_CSS}</style>
      {shown.art
        ? <img src={shown.art} alt="" className="w-[140px] h-[140px] rounded-xl object-cover shrink-0" />
        : <span className="w-[140px] h-[140px] rounded-xl bg-field-800 flex items-center justify-center text-[64px] shrink-0">♪</span>}
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-cond font-bold uppercase tracking-[0.25em] text-[#1DB954] text-[18px] mb-2"><Equalizer size={16} /> Now playing</p>
        <p className="font-cond font-black text-white text-[40px] leading-tight line-clamp-2">{shown.title}</p>
        <p className="text-[24px] text-field-300 truncate mt-1">{shown.artist}</p>
      </div>
    </div>
  )
}

// ── The commissioner's remote ─────────────────────────────────
// Presses from Commish panel → Shop TV (tv_remote): an announcement full
// screen, the season standings, the chat, any moment, back to normal, or
// a reload.
// The roast and the picks board are the Takeover's and the main view's.
const ANNOUNCE_MS = 15_000
const STANDINGS_MS = 20_000
const CHAT_MS = 25_000
const MAP_MS = 30_000
const NOTE_MS = 6000
const isMoment = (m: unknown): m is TvMoment => TV_MOMENTS.some(x => x.kind === m)

type RemoteShow = { kind: 'announce' | 'note'; text: string } | { kind: 'standings' | 'chat' | 'map' }

function RemoteOverlay({ board, colors }: { board: TvBoard; colors: [string, string] }) {
  const [show, setShow] = useState<(RemoteShow & { id: number }) | null>(null)
  const [moment, setMoment] = useState<{ kind: TvMoment; id: number } | null>(null)
  const n = useRef(0)
  const showTimer = useRef<ReturnType<typeof setTimeout>>()
  const momentTimer = useRef<ReturnType<typeof setTimeout>>()
  const put = (s: RemoteShow, ms: number) => {
    clearTimeout(showTimer.current)
    setShow({ ...s, id: ++n.current })
    showTimer.current = setTimeout(() => setShow(null), ms)
  }
  useTvRemote(r => {
    switch (r.action) {
      case 'announce':
        if (r.text) put({ kind: 'announce', text: r.text.slice(0, 140) }, ANNOUNCE_MS)
        break
      case 'standings':
        put({ kind: 'standings' }, STANDINGS_MS)
        break
      case 'map':
        if (board.conquest) put({ kind: 'map' }, MAP_MS)
        else put({ kind: 'note', text: 'No war going on yet' }, NOTE_MS)
        break
      case 'chat':
        put({ kind: 'chat' }, CHAT_MS)
        // The latest words, not the last poll's
        window.dispatchEvent(new Event(TV_REFRESH))
        break
      case 'board':
        if (!board.board?.games.some(g => g.locked)) put({ kind: 'note', text: 'The picks board shows once a game locks' }, NOTE_MS)
        break
      case 'roast':
        if (!board.roast?.text) put({ kind: 'note', text: 'No roast yet this week' }, NOTE_MS)
        break
      case 'replay':
        if (!board.replay) put({ kind: 'note', text: 'The replay plays once the week is final' }, NOTE_MS)
        break
      case 'moment':
        if (isMoment(r.moment)) {
          const kind = r.moment
          clearTimeout(momentTimer.current)
          setMoment({ kind, id: ++n.current })
          momentTimer.current = setTimeout(() => setMoment(null), MOMENT_MS[kind])
        }
        break
      case 'clear':
        clearTimeout(showTimer.current)
        clearTimeout(momentTimer.current)
        setShow(null)
        setMoment(null)
        break
      case 'reload':
        window.location.reload()
        break
    }
  })
  useEffect(() => () => { clearTimeout(showTimer.current); clearTimeout(momentTimer.current) }, [])

  return (
    <>
      {moment && (
        <div className="absolute inset-0 pointer-events-none z-[7] overflow-hidden" aria-hidden>
          <style>{MOMENT_CSS}</style>
          <PlayMoment key={moment.id} kind={moment.kind} colors={colors} />
        </div>
      )}
      {show?.kind === 'announce' && <Announcement key={show.id} text={show.text} />}
      {show?.kind === 'standings' && <StandingsTakeover key={show.id} board={board} />}
      {show?.kind === 'chat' && <ChatTakeover key={show.id} board={board} />}
      {show?.kind === 'map' && <ConquestMapShow key={show.id} b={board} />}
      <LivePoll />
      {show?.kind === 'note' && (
        // Centered by the row, not a transform: the fade-in animates transform
        <div key={show.id} className="absolute top-[110px] inset-x-0 z-[35] flex justify-center pointer-events-none">
          <div className="rise-in rounded-full border-2 border-gold/50 bg-field-900/95 px-8 py-3 text-[26px] font-bold text-white">{show.text}</div>
        </div>
      )}
    </>
  )
}

// ── A live poll ───────────────────────────────────────────────
// Started from the remote (tv_poll): full screen while it's open, the
// bars moving as votes come in (league_poll_votes_to_tv), then the
// result for 15 seconds after it closes.
const POLL_AFTER_MS = 15_000

function LivePoll() {
  const [poll, setPoll] = useState<TvPoll | null>(null)
  const now = useNow(1000)
  useTvRemote(r => {
    if (r.action === 'poll' && r.poll?.id) setPoll(r.poll)
    if (r.action === 'poll_votes') setPoll(p => (p && p.id === r.pollId && r.counts ? { ...p, counts: r.counts } : p))
    if (r.action === 'clear') setPoll(null)
  })
  const closesAt = poll ? new Date(poll.closesAt).getTime() : 0
  const pollId = poll?.id
  useEffect(() => {
    if (!pollId) return
    const t = setTimeout(() => setPoll(null), Math.max(0, closesAt + POLL_AFTER_MS - Date.now()))
    return () => clearTimeout(t)
  }, [pollId, closesAt])
  if (!poll) return null

  const total = poll.counts.reduce((a, b) => a + b, 0)
  const open = now < closesAt
  const top = Math.max(0, ...poll.counts)
  const left = Math.max(0, Math.ceil((closesAt - now) / 1000))
  return (
    <div className="absolute inset-0 z-[34] bg-field-950/[0.97] flex flex-col px-28 py-16 rise-in">
      <div className="flex items-center justify-between mb-6">
        <p className="font-cond font-bold uppercase tracking-[0.3em] text-gold text-[30px]">📊 Live poll · vote in the app chat</p>
        <p className={clsx('font-cond font-black text-[44px] tabular-nums', open ? 'text-white' : 'text-gold')}>
          {open ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Final'}
        </p>
      </div>
      <p className="font-cond font-black text-white text-[80px] leading-[1.05] mb-12 max-w-[1700px]">{poll.question}</p>
      <div className="flex flex-col gap-6">
        {poll.options.map((o, i) => {
          const n = poll.counts[i] ?? 0
          const pct = total ? Math.round((n / total) * 100) : 0
          const lead = !open && n === top && n > 0
          return (
            <div key={i}>
              <div className="flex items-baseline justify-between mb-2">
                <span className={clsx('text-[42px] font-bold', lead ? 'text-gold' : 'text-white')}>{lead && '🏆 '}{o}</span>
                <span className="font-cond font-black text-[40px] text-white tabular-nums">{n} <span className="text-field-400 text-[30px]">· {pct}%</span></span>
              </div>
              <div className="h-8 rounded-full bg-field-800 overflow-hidden">
                <div className={clsx('h-full rounded-full', lead ? 'bg-gold' : 'bg-gold/60')} style={{ width: `${total ? (n / total) * 100 : 0}%`, transition: 'width .6s ease-out' }} />
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-auto text-[28px] text-field-400">{total} vote{total === 1 ? '' : 's'}{open ? ' so far' : ''}</p>
    </div>
  )
}

// ── The replay ────────────────────────────────────────────────
// The finished week, slide by slide: the champion, the Belt, the
// headlines, the worst pick, the bad beat, the receipts that aged badly,
// badges, who moved, and last place. It plays a few minutes after the
// week goes final, every half hour after until the next week opens, and
// from the remote.
const REPLAY_SLIDE_MS = 10_000
const REPLAY_EVERY = 30 * 60_000

interface ReplaySlide { key: string; label: string; body: ReactNode }

const place = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`
const names = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} & ${xs[xs.length - 1]}`

function replaySlides(r: TvReplay): ReplaySlide[] {
  const big = 'font-cond font-black text-white leading-[1.05]'
  const out: ReplaySlide[] = [{
    key: 'champ', label: `${weekTitle(r.week)} champion`,
    body: (
      <>
        <p className={clsx(big, 'text-[120px]')}>🏆 {names(r.champion.names)}</p>
        <p className="text-[46px] text-field-200 mt-6">{r.champion.correct} of {r.champion.played} right</p>
        {r.champion.tiebreak && (
          <p className="text-[36px] text-gold mt-3">Won it on the tiebreaker: guessed {r.champion.tiebreak.guess}{r.champion.tiebreak.actual != null ? `, the total was ${r.champion.tiebreak.actual}` : ''}</p>
        )}
      </>
    ),
  }]
  if (r.belt?.holders.length) {
    const b = r.belt
    out.push({
      key: 'belt', label: 'The Belt',
      body: <p className={clsx(big, 'text-[96px]')}>{b.defended ? `${names(b.holders)} keeps the Belt` : b.from.length ? `${names(b.holders)} takes the Belt from ${names(b.from)}` : `${names(b.holders)} wins the Belt`}</p>,
    })
  }
  for (const h of r.headlines.slice(0, 3)) {
    out.push({
      key: `h-${h.label}`, label: h.label,
      body: (
        <>
          <p className={clsx(big, 'text-[110px]')}>{h.headline}</p>
          <p className="text-[42px] text-field-300 mt-6">{h.detail}</p>
        </>
      ),
    })
  }
  for (const [i, b] of r.blown.slice(0, 1).entries()) {
    out.push({
      key: `blown-${i}`, label: 'Worst pick of the week',
      body: (
        <>
          <p className={clsx(big, 'text-[96px]')}>{names(b.names)} took {b.took}</p>
          <p className="text-[42px] text-field-300 mt-6">{b.right} of {b.of} got {b.winner} right</p>
        </>
      ),
    })
  }
  if (r.badBeat) {
    const bb = r.badBeat
    out.push({
      key: 'beat', label: 'Bad beat of the week',
      body: (
        <>
          <p className={clsx(big, 'text-[96px]')}>{bb.loser} was {Math.round(bb.peak * 100)}% to win</p>
          <p className="text-[42px] text-field-300 mt-6">Lost {bb.loserScore}–{bb.winnerScore} to {bb.winner}. Ask {names(bb.victims.slice(0, 6))}{bb.victims.length > 6 ? ` and ${bb.victims.length - 6} more` : ''}.</p>
        </>
      ),
    })
  }
  if (r.agedWorst.length) {
    out.push({
      key: 'receipts', label: 'Receipts that aged badly',
      body: (
        <div className="space-y-8">
          {r.agedWorst.map((x, i) => (
            <div key={i}>
              <p className="text-[56px] italic text-white leading-tight">“{x.reason}”</p>
              <p className="text-[32px] text-field-400 mt-1">{x.name} on {x.team} ❌</p>
            </div>
          ))}
        </div>
      ),
    })
  }
  if (r.badges.length) {
    out.push({
      key: 'badges', label: 'Badges earned',
      body: (
        <div className="space-y-5">
          {r.badges.map((b, i) => (
            <p key={i} className="text-[48px] text-white"><span className="font-bold text-gold">🏅 {b.name}</span> · {b.label} <span className="text-field-400 text-[32px]">{b.detail}</span></p>
          ))}
        </div>
      ),
    })
  }
  if (r.climber || r.faller) {
    out.push({
      key: 'moves', label: 'On the move',
      body: (
        <div className="space-y-8">
          {r.climber && <p className={clsx(big, 'text-[84px]')}>⬆️ {r.climber.name}: {place(r.climber.from)} to {place(r.climber.to)}</p>}
          {r.faller && <p className={clsx(big, 'text-[84px] text-red-300')}>⬇️ {r.faller.name}: {place(r.faller.from)} to {place(r.faller.to)}</p>}
        </div>
      ),
    })
  }
  if (r.basement?.names.length) {
    out.push({
      key: 'basement', label: 'Last place',
      body: (
        <>
          <p className={clsx(big, 'text-[110px]')}>🗑️ {names(r.basement.names)}</p>
          <p className="text-[46px] text-field-300 mt-6">{r.basement.correct} of {r.basement.played}. See you next week.</p>
        </>
      ),
    })
  }
  return out
}

function ReplayShow({ board }: { board: TvBoard }) {
  const r = board.replay ?? null
  const slides = useMemo(() => (r ? replaySlides(r) : []), [r])
  const [playing, setPlaying] = useState(false)
  const [i, setI] = useState(0)
  const week = r?.week ?? null
  // A few minutes after the week goes final (or the TV comes on), then every half hour
  useEffect(() => {
    if (week == null) { setPlaying(false); return }
    const start = () => { setI(0); setPlaying(true) }
    const first = setTimeout(start, 3 * 60_000)
    const every = setInterval(start, REPLAY_EVERY)
    return () => { clearTimeout(first); clearInterval(every) }
  }, [week])
  useTvRemote(x => {
    if (x.action === 'replay' && r) { setI(0); setPlaying(true) }
    if (x.action === 'clear') setPlaying(false)
  })
  useEffect(() => {
    if (!playing) return
    const t = setTimeout(() => (i + 1 >= slides.length ? setPlaying(false) : setI(i + 1)), REPLAY_SLIDE_MS)
    return () => clearTimeout(t)
  }, [playing, i, slides.length])
  const slide = slides[i]
  if (!playing || !slide || !r) return null
  return (
    <div className="absolute inset-0 z-[33] bg-field-950/[0.97] flex flex-col px-28 py-16">
      <div className="flex items-center justify-between">
        <p className="font-cond font-black uppercase tracking-[0.3em] text-gold text-[30px]">📼 {board.league} · {weekTitle(r.week)} replay</p>
        <div className="flex gap-2">
          {slides.map((x, j) => <span key={x.key} className={clsx('w-3 h-3 rounded-full', j === i ? 'bg-gold' : j < i ? 'bg-gold/40' : 'bg-field-700')} />)}
        </div>
      </div>
      <div key={slide.key} className="flex-1 flex flex-col justify-center rise-in">
        <p className="font-cond font-bold uppercase tracking-[0.25em] text-field-400 text-[34px] mb-6">{slide.label}</p>
        {slide.body}
      </div>
    </div>
  )
}

// ── Receipts as a game ends ───────────────────────────────────
// When the TV sees a game go final, it pops up the best receipt on the
// winner and the worst on the loser for 14 seconds, one game at a time.
// ?preview=receipts shows the week's finished games' cards.
const RECEIPT_MS = 14_000

function ReceiptsPop({ board }: { board: TvBoard }) {
  const seen = useRef<Map<string, string> | null>(null)
  const [queue, setQueue] = useState<TvGameReceipt[]>([])
  useEffect(() => {
    const states = new Map(board.games.map(g => [g.id, g.state]))
    const was = seen.current
    seen.current = states
    const receipts = board.gameReceipts ?? []
    if (!was) {
      // On load, nothing old pops up (unless previewing)
      if (new URLSearchParams(window.location.search).get('preview') === 'receipts') setQueue(receipts.slice(0, 4))
      return
    }
    const ended = board.games.filter(g => g.state === 'final' && was.get(g.id) && was.get(g.id) !== 'final').map(g => g.id)
    const fresh = receipts.filter(r => ended.includes(r.gameId) && (r.best || r.worst))
    if (fresh.length) setQueue(q => [...q, ...fresh])
  }, [board])
  const current = queue[0]
  useEffect(() => {
    if (!current) return
    const t = setTimeout(() => setQueue(q => q.slice(1)), RECEIPT_MS)
    return () => clearTimeout(t)
  }, [current])
  useTvRemote(x => { if (x.action === 'clear') setQueue([]) })
  if (!current) return null
  const r = current
  const side = (label: string, icon: string, x: TvGameReceipt['best'], tone: string) => x && (
    <div className="flex-1 min-w-0">
      <p className={clsx('font-cond font-bold uppercase tracking-[0.2em] text-[22px] mb-2', tone)}>{icon} {label}</p>
      <p className="text-[34px] italic text-white leading-snug line-clamp-3">“{x.reason}”</p>
      <p className="text-[24px] text-field-400 mt-2">{x.name} on {x.team}</p>
    </div>
  )
  return (
    <div key={r.gameId} className="absolute top-[118px] inset-x-0 mx-auto z-[26] w-[1240px] rise-in rounded-3xl border-2 border-gold/50 bg-field-900/[0.97] shadow-2xl shadow-black/70 px-10 py-7 pointer-events-none">
      <div className="flex items-baseline justify-between mb-5">
        <p className="font-cond font-black uppercase tracking-[0.2em] text-gold text-[28px]">🧾 Receipts · Final</p>
        <p className="font-cond font-black text-[34px] text-white">
          {r.away} {r.awayScore} – {r.home} {r.homeScore} <span className="text-field-400 text-[26px]">· {r.right} of {r.pickers} had {r.winner}</span>
        </p>
      </div>
      <div className="flex gap-10">
        {side('Aged well', '✅', r.best, 'text-nfl')}
        {side('Aged badly', '❌', r.worst, 'text-red-400')}
      </div>
    </div>
  )
}

/** The commissioner's words, full screen. */
function Announcement({ text }: { text: string }) {
  const size = text.length > 100 ? 64 : text.length > 50 ? 84 : 112
  return (
    <div className="absolute inset-0 z-[35] bg-field-950/[0.96] flex flex-col items-center justify-center px-28 text-center rise-in">
      <p className="font-cond font-bold uppercase tracking-[0.35em] text-gold text-[34px] mb-8">📣 From the commissioner</p>
      <p className="font-cond font-black text-white leading-[1.05] max-w-[1640px] break-words" style={{ fontSize: size }}>{text}</p>
    </div>
  )
}

/** The season standings, full screen: everyone, two columns past twelve. */
function StandingsTakeover({ board }: { board: TvBoard }) {
  const rows = board.season_table.slice(0, 24)
  const two = rows.length > 12
  return (
    <div className="absolute inset-0 z-[35] bg-field-950/[0.97] flex flex-col px-24 py-14 rise-in">
      <p className="font-cond font-bold uppercase tracking-[0.3em] text-gold text-[30px]">{board.league}</p>
      <p className="font-cond font-black uppercase text-white text-[72px] leading-none mb-8">Season standings</p>
      {rows.length === 0 ? (
        <p className="text-field-300 text-[36px]">The standings start once Week 1 is final</p>
      ) : (
        <div className={clsx('grid gap-x-16 gap-y-2 flex-1 content-start', two ? 'grid-cols-2 grid-flow-col' : 'grid-cols-1 max-w-[1000px]')} style={two ? { gridTemplateRows: `repeat(${Math.ceil(rows.length / 2)}, minmax(0, auto))` } : undefined}>
          {rows.map(r => (
            <div key={r.userId} className={clsx('flex items-center gap-4 rounded-xl px-4 py-2', r.rank === 1 && 'bg-gold/15')}>
              <span className="w-10 text-right font-cond font-black text-[32px] text-field-400 tabular-nums">{r.rank}</span>
              {r.avatarUrl
                ? <img src={r.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
                : <span className="w-11 h-11 rounded-full bg-field-700 flex items-center justify-center text-[20px] font-black text-gold shrink-0">{r.name[0]?.toUpperCase()}</span>}
              <span className="min-w-0 flex-1 truncate text-[32px] font-bold text-white">{r.name}</span>
              <TvFlair badge={r.flair} size={28} />
              {r.belt && <BeltIcon className="w-[30px] h-[19px]" />}
              <span className="font-cond font-black text-[34px] text-white tabular-nums">
                {r.correct}<span className="text-field-500">–{r.played - r.correct}</span>
              </span>
              {!!r.weeksWon && <span className="w-16 text-right text-[22px] font-bold text-gold">🏆 {r.weeksWon}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The chat full screen (the remote's Chat): the week's words from the
 * league chat and the TV chat, newest at the bottom, and anything said
 * while it's up lands at the bottom too (the pop-ups are underneath it).
 */
function ChatTakeover({ board }: { board: TvBoard }) {
  const [live, setLive] = useState<{ id: string; name: string; text: string; gif: string | null; at: string }[]>([])
  const [gone, setGone] = useState<string[]>([])
  useEffect(() => {
    const hear = (e: Event) => {
      const d = (e as CustomEvent<TvChatEvent>).detail
      if ('deleted' in d) setGone(g => [...g, d.deleted])
      else setLive(l => [...l, d])
    }
    window.addEventListener(TV_CHAT, hear)
    return () => window.removeEventListener(TV_CHAT, hear)
  }, [])
  const saved = [...(board.chat ?? [])].reverse().map(m => ({ id: m.id ?? `${m.name}-${m.at}`, name: m.name, text: m.text, gif: null as string | null, at: m.at }))
  const known = new Set(saved.map(m => m.id))
  const msgs = [...saved, ...live.filter(m => !known.has(m.id))].filter(m => !gone.includes(m.id)).slice(-8)
  return (
    <div className="absolute inset-0 z-[35] bg-field-950/[0.97] flex flex-col px-24 py-14 rise-in">
      <p className="font-cond font-bold uppercase tracking-[0.3em] text-gold text-[30px]">{board.league}</p>
      <p className="font-cond font-black uppercase text-white text-[72px] leading-none mb-8">💬 Trash talk</p>
      {msgs.length === 0 ? (
        <p className="text-field-300 text-[36px]">Quiet in here. Say something in the chat, or from the TV button in the app.</p>
      ) : (
        // Newest at the bottom; too many and the oldest go off the top
        <div className="flex-1 min-h-0 flex flex-col justify-end gap-6 overflow-hidden">
          {msgs.map(m => (
            <div key={m.id} className="shrink-0 max-w-[1560px] rise-in">
              <p className="text-[24px]"><span className="font-bold text-gold">{m.name}</span> <span className="text-field-500">{ago(m.at)}</span></p>
              {m.text && <p className="text-[40px] text-white leading-snug line-clamp-2">{m.text}</p>}
              {m.gif && <img src={m.gif} alt="" className="mt-2 h-[180px] w-auto rounded-xl" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ChatPopups({ items }: { items: ChatPop[] }) {
  if (items.length === 0) return null
  return (
    <div className="absolute left-8 bottom-[76px] z-30 pointer-events-none flex flex-col items-start gap-3 max-w-[760px]">
      <style>{'@keyframes tv-chat { 0% { transform: translateX(-80px); opacity: 0 } 5% { transform: translateX(0); opacity: 1 } 92% { transform: translateX(0); opacity: 1 } 100% { transform: translateX(-30px); opacity: 0 } }'}</style>
      {items.map(c => (
        <div
          key={c.id}
          className="flex items-start gap-4 rounded-2xl border-2 border-gold/50 bg-field-900/95 px-5 py-3.5 shadow-2xl shadow-black/60"
          style={{ animation: `tv-chat ${c.dur}ms ease-out forwards` }}
        >
          {c.avatar
            ? <img src={c.avatar} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
            : <span className="w-14 h-14 rounded-full bg-field-700 flex items-center justify-center text-[26px] font-black text-gold shrink-0">{c.name[0]?.toUpperCase()}</span>}
          <div className="min-w-0">
            <p className="flex items-center gap-3 leading-none mb-1.5">
              <span className="font-cond font-black text-[24px] text-gold">{c.name}</span>
              {c.thread && <span className="rounded-full bg-field-800 border border-field-600 px-2.5 py-0.5 text-[16px] font-bold text-field-300">{c.thread}</span>}
            </p>
            {c.text && <p className="text-[28px] leading-snug text-white break-words line-clamp-3">{c.text}</p>}
            {c.gif && <img src={c.gif} alt="GIF" className="mt-1 max-h-[220px] max-w-[420px] rounded-xl" />}
          </div>
        </div>
      ))}
    </div>
  )
}

function FloatingReactions({ items }: { items: Floater[] }) {
  return (
    <div className="absolute inset-0 z-40 pointer-events-none overflow-hidden">
      <style>{'@keyframes tv-float { 0% { transform: translate(0, 0) scale(.5); opacity: 0 } 10% { transform: translate(calc(var(--dx) * .1), -90px) scale(1); opacity: 1 } 75% { opacity: 1 } 100% { transform: translate(var(--dx), -960px) scale(1.12); opacity: 0 } }'}</style>
      {items.map(f => (
        <div
          key={f.id}
          className="absolute bottom-[60px] flex flex-col items-center"
          style={{ left: `${f.x}%`, '--dx': `${f.drift}px`, animation: `tv-float ${f.dur}ms ease-out forwards` } as CSSProperties}
        >
          <span style={{ fontSize: f.size, lineHeight: 1 }}>{f.emoji}</span>
          {f.name && (
            <span className="mt-1 rounded-full bg-black/70 px-2.5 py-0.5 text-[18px] font-bold text-white whitespace-nowrap">{f.name}</span>
          )}
        </div>
      ))}
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

/** The time ("7:42 PM") and the date ("Tue, Oct 6"). */
function useClock(): { time: string; date: string } {
  const fmt = () => {
    const d = new Date()
    return {
      time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    }
  }
  const [now, setNow] = useState(fmt)
  useEffect(() => {
    const t = setInterval(() => setNow(was => {
      const n = fmt()
      return n.time === was.time && n.date === was.date ? was : n
    }), 15_000)
    return () => clearInterval(t)
  }, [])
  return now
}
