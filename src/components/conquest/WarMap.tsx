import { useEffect, useMemo, useState } from 'react'
import { X, Loader2, History, Play, Swords, Flag } from 'lucide-react'
import clsx from 'clsx'
import { CITY, ADJ, citiesOf, neighborsOf } from '../../../supabase/functions/_shared/conquest.ts'
import { ConquestMap } from './ConquestMap'
import { ZoomPan } from './ZoomPan'
import { ConquestIcon } from './ConquestIcon'
import {
  headline, mapAfter, ownersAfter, siegesAfter, chronological, cityStory, swatch,
  type ConquestData, type LiveBattle, type LoggedMove,
} from './conquestView'

const INTRO_MS = 1400
const STEP_MS = 1900

/**
 * The app's war map, with what's around it: tap a city for its story (and,
 * before the week's first kickoff, to attack it or plant your flag), drag
 * the slider back through the weeks to see the map as it stood, and the
 * first time you open it after a week settles, that week plays out on it,
 * move by move.
 */
export function WarMap({ war, log, userId, battles, ordersOpen, myTarget, myClaim, onAttack, onFlag, busy, seenKey, labelScale }: {
  war: ConquestData
  /** the war log, as the app reads it (newest week first) */
  log: LoggedMove[]
  userId: string | undefined
  /** this week's battles as they stand */
  battles: LiveBattle[]
  /** orders can still be given (before the week's first kickoff) */
  ordersOpen: boolean
  myTarget: string | null
  myClaim: string | null
  onAttack: (id: string | null, name?: string) => void
  onFlag: (team: string | null) => void
  busy: string | null
  /** where "seen the replay of week N" is remembered, per league */
  seenKey: string
  labelScale: number
}) {
  const [mapZoom, setMapZoom] = useState(1)
  const [card, setCard] = useState<string | null>(null)
  const [viewWeek, setViewWeek] = useState<number | null>(null)
  const [replay, setReplay] = useState<{ week: number; at: number } | null>(null)
  const nameOf = (id: string | null) => war.players.find(p => p.userId === id)?.name ?? 'Someone'
  const colorOf = (id: string) => war.players.find(p => p.userId === id)?.color ?? '#666'

  // ── The week replay ──────────────────────────────────────────
  // Its steps: each battle's result one by one, then every flag planted at once
  const stepsOf = (week: number): LoggedMove[][] => {
    const moves = chronological(log).filter(m => m.week === week)
    const claims = moves.filter(m => m.kind === 'claim')
    return [...moves.filter(m => m.kind !== 'claim').map(m => [m]), ...(claims.length ? [claims] : [])]
  }
  // Once per settled week, the first time you're here after it
  useEffect(() => {
    const week = war.lastWeek
    if (week == null || !log.some(m => m.week === week)) return
    let seen = 0
    try { seen = Number(localStorage.getItem(seenKey) ?? 0) } catch { /* plays every time, then */ }
    if (seen >= week) return
    try { localStorage.setItem(seenKey, String(week)) } catch { /* fine */ }
    setViewWeek(null)
    setCard(null)
    setReplay({ week, at: -1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [war.lastWeek, seenKey, log.length])
  useEffect(() => {
    if (!replay) return
    if (replay.at >= stepsOf(replay.week).length) return
    const t = setTimeout(() => setReplay(r => r && { ...r, at: r.at + 1 }), replay.at < 0 ? INTRO_MS : STEP_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay])

  // ── What the map shows: the replay, a past week, or now ──────
  const lastWeek = war.lastWeek
  const past = !replay && viewWeek != null && lastWeek != null && viewWeek < lastWeek
  const shown = useMemo(() => {
    if (replay) {
      const before = mapAfter(war.owners, log, replay.week - 1)
      const done = stepsOf(replay.week).slice(0, Math.max(0, replay.at + 1)).flat()
      return { owners: ownersAfter(before.owners, done), besieged: siegesAfter(done, before.besieged) }
    }
    if (past) return mapAfter(war.owners, log, viewWeek!)
    return { owners: war.owners, besieged: war.besieged }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay, past, viewWeek, war.owners, war.besieged, log])
  const live = !replay && !past
  const step = replay ? stepsOf(replay.week)[replay.at] : undefined
  const stepCity = step && step.length === 1 ? step[0] : null

  const tap = (team: string | null) => {
    if (replay) return
    setCard(c => (team && team !== c ? team : null))
  }

  return (
    <div>
      {replay && (
        <ReplayBanner
          week={replay.week} at={replay.at} steps={stepsOf(replay.week)} nameOf={nameOf}
          onSkip={() => setReplay(null)} onAgain={() => setReplay({ week: replay.week, at: -1 })}
        />
      )}
      {!replay && live && ordersOpen && (
        <p className="mt-2 text-[11px] text-field-400">Tap a city for its story, or to attack it or plant your flag there.</p>
      )}
      {past && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-gold/10 border border-gold/30 px-2.5 py-1.5 text-xs text-field-200">
          <History className="w-3.5 h-3.5 text-gold shrink-0" />
          <span>The map {viewWeek! < war.startWeek ? 'when the war began' : `after Week ${viewWeek}`}</span>
          <button onClick={() => setViewWeek(null)} className="ml-auto font-bold text-gold hover:text-gold-light">Back to now</button>
        </div>
      )}

      <ZoomPan className="mt-2" onTap={tap} onZoom={s => setMapZoom(Math.round(s * 4) / 4)}>
        <ConquestMap
          owners={shown.owners} besieged={shown.besieged} players={war.players} you={userId}
          orders={live ? { target: myTarget, flag: myClaim } : undefined}
          highlight={stepCity?.team ?? card}
          highlightColor={stepCity ? colorOf(stepCity.to) : undefined}
          labels="names" layout="none" labelScale={labelScale}
          battles={live ? battles : []} zoom={mapZoom} declutter className="w-full"
        />
      </ZoomPan>

      {card && !replay && (
        <CityCard
          team={card} war={war} owners={shown.owners} besieged={shown.besieged} log={log}
          userId={userId} canOrder={live && ordersOpen} myTarget={myTarget} myClaim={myClaim}
          onAttack={onAttack} onFlag={onFlag} busy={busy} nameOf={nameOf} colorOf={colorOf}
          onClose={() => setCard(null)}
        />
      )}

      {lastWeek != null && !replay && (
        <div className="mt-3 flex items-center gap-3">
          <History className="w-4 h-4 text-field-400 shrink-0" />
          <input
            type="range" aria-label="The map after each week"
            min={war.startWeek - 1} max={lastWeek} step={1} value={viewWeek ?? lastWeek}
            onChange={e => setViewWeek(Number(e.target.value) >= lastWeek ? null : Number(e.target.value))}
            className="flex-1 accent-[rgb(var(--gold))]"
          />
          <span className="w-24 shrink-0 text-right text-[11px] font-bold text-field-300">
            {!past ? 'Now' : viewWeek! < war.startWeek ? 'The start' : `After Wk ${viewWeek}`}
          </span>
          {log.some(m => m.week === lastWeek) && (
            <button
              onClick={() => { setViewWeek(null); setCard(null); setReplay({ week: lastWeek, at: -1 }) }}
              className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-gold hover:text-gold-light"
              title={`Watch Week ${lastWeek} play out`}
            >
              <Play className="w-3.5 h-3.5" /> Wk {lastWeek}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** The replay's running commentary over the map: the move being made, then the week's tally. */
function ReplayBanner({ week, at, steps, nameOf, onSkip, onAgain }: {
  week: number
  at: number
  steps: LoggedMove[][]
  nameOf: (id: string | null) => string
  onSkip: () => void
  onAgain: () => void
}) {
  const done = at >= steps.length
  const all = steps.flat()
  const count = (k: LoggedMove['kind']) => all.filter(m => m.kind === k).length
  const step = steps[at]
  let line: { icon: string; text: string; score?: string }
  if (at < 0) line = { icon: '⚔️', text: `Week ${week} at war: here's what happened` }
  else if (done) {
    const parts = [
      count('capture') && `${count('capture')} ${count('capture') === 1 ? 'city' : 'cities'} taken`,
      count('siege') && `${count('siege')} ${count('siege') === 1 ? 'siege' : 'sieges'} laid`,
      count('rebellion') && `${count('rebellion')} ${count('rebellion') === 1 ? 'rebellion' : 'rebellions'}`,
      count('claim') && `${count('claim')} ${count('claim') === 1 ? 'flag' : 'flags'} planted`,
    ].filter(Boolean)
    line = { icon: '🗺️', text: `Week ${week}: ${parts.join(', ') || 'a quiet week'}` }
  } else if (step.length > 1) {
    line = { icon: '🚩', text: `New flags: ${step.slice(0, 4).map(m => `${nameOf(m.to)} in ${CITY[m.team] ?? m.team}`).join(', ')}${step.length > 4 ? `, and ${step.length - 4} more` : ''}` }
  } else {
    const h = headline(step[0], nameOf)
    line = { ...h, score: step[0].kind !== 'relief' ? `${step[0].score[0]}–${step[0].score[1]}` : undefined }
  }
  return (
    <div className="mt-2 rounded-lg border border-gold/40 bg-field-900/90 px-3 py-2">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gold">
        <span>Week {week} replay</span>
        {at >= 0 && !done && <span className="text-field-500">{at + 1} of {steps.length}</span>}
        {done
          ? <button onClick={onAgain} className="ml-auto flex items-center gap-1 text-gold hover:text-gold-light"><Play className="w-3 h-3" /> Again</button>
          : null}
        <button onClick={onSkip} className={clsx('flex items-center gap-1 text-field-400 hover:text-white', !done && 'ml-auto')}>
          {done ? <><X className="w-3 h-3" /> Close</> : 'Skip'}
        </button>
      </div>
      <p key={at} className="mt-1 text-sm text-white rise-in">
        <span className="mr-1">{line.icon}</span>{line.text}
        {line.score && <span className="ml-1 font-cond font-black text-field-400 tabular-nums">{line.score}</span>}
      </p>
    </div>
  )
}

/** A city's card: who holds it and since when, who held it before, what's happened there, and (before kickoff) your move. */
function CityCard({ team, war, owners, besieged, log, userId, canOrder, myTarget, myClaim, onAttack, onFlag, busy, nameOf, colorOf, onClose }: {
  team: string
  war: ConquestData
  owners: Record<string, string | null>
  besieged: Record<string, string>
  log: LoggedMove[]
  userId: string | undefined
  canOrder: boolean
  myTarget: string | null
  myClaim: string | null
  onAttack: (id: string | null, name?: string) => void
  onFlag: (team: string | null) => void
  busy: string | null
  nameOf: (id: string | null) => string
  colorOf: (id: string) => string
  onClose: () => void
}) {
  const owner = owners[team] ?? null
  const holder = owner ? war.players.find(p => p.userId === owner) : undefined
  const capital = !!holder && holder.capital === team
  const story = cityStory(owners, log.filter(m => m.week <= (war.lastWeek ?? Infinity)), team)
  const current = story.holders[story.holders.length - 1]
  const reachers = [...new Set(ADJ[team].map(n => owners[n]).filter((o): o is string => !!o))]
  const mine = userId ? citiesOf(owners, userId) : []
  const myBorder = userId ? neighborsOf(owners, userId) : []

  const action = (() => {
    if (!canOrder || !userId || !mine.length) return null
    if (owner === userId) return <p className="text-xs text-field-400">One of your cities.</p>
    if (owner && myBorder.includes(owner)) {
      const on = myTarget === owner
      return (
        <button onClick={() => onAttack(on ? null : owner, nameOf(owner))} disabled={!!busy} className={clsx('btn-gold w-full justify-center text-sm', on && 'opacity-80')}>
          {busy?.startsWith('atk') ? <Loader2 className="w-4 h-4 animate-spin" /> : on ? <ConquestIcon name="target" className="w-4 h-4" /> : <Swords className="w-4 h-4" />}
          {on ? `Attacking ${nameOf(owner)}: tap to go back to automatic` : `Attack ${nameOf(owner)} this week`}
        </button>
      )
    }
    if (!owner && ADJ[team].some(n => mine.includes(n))) {
      const on = myClaim === team
      return (
        <button onClick={() => onFlag(on ? null : team)} disabled={!!busy} className={clsx('btn-gold w-full justify-center text-sm', on && 'opacity-80')}>
          {busy?.startsWith('flag') ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
          {on ? 'Your flag goes here: tap to go back to automatic' : 'Plant my flag here (with a top-half week)'}
        </button>
      )
    }
    return <p className="text-xs text-field-500">Not on your border.</p>
  })()

  return (
    <div className="mt-3 rounded-xl border border-field-700 bg-field-800/60 p-3 rise-in">
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <p className="font-cond font-black uppercase text-white text-lg leading-tight">{CITY[team] ?? team} <span className="text-field-500 text-sm">{team}</span></p>
          <div className="mt-1 flex items-center gap-1.5 text-sm">
            {owner ? (
              <>
                <span className="w-3 h-3 rounded-sm shrink-0" style={swatch(colorOf(owner))} />
                <span className="font-bold text-white">{owner === userId ? 'Yours' : nameOf(owner)}</span>
                {capital && <span className="flex items-center gap-1 text-[11px] text-field-300"><ConquestIcon name="capital" className="w-3 h-3 text-gold" /> capital</span>}
                <span className="text-[11px] text-field-400">· {current.since == null ? 'since the war began' : `since Week ${current.since}`}</span>
              </>
            ) : (
              <span className="text-field-300">Open land</span>
            )}
          </div>
          {besieged[team] && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-amber-300">
              <ConquestIcon name="siege" className="w-3 h-3 text-red-400" /> Under siege by {nameOf(besieged[team])}
            </p>
          )}
        </div>
        <button onClick={onClose} aria-label="Close" className="ml-auto shrink-0 text-field-400 hover:text-white"><X className="w-4 h-4" /></button>
      </div>

      {story.holders.length > 1 && (
        <p className="mt-2 text-[11px] text-field-400">
          {story.holders.map((h, i) => (
            <span key={i}>
              {i > 0 && <span className="text-field-600"> → </span>}
              <span className="text-field-200">{h.userId ? nameOf(h.userId) : 'open'}</span>
              {h.since != null && <span> (Wk {h.since})</span>}
            </span>
          ))}
        </p>
      )}

      {story.events.length > 0 && (
        <ul className="mt-2 space-y-1">
          {[...story.events].reverse().map((m, i) => {
            const h = headline(m, nameOf)
            return (
              <li key={i} className="flex items-start gap-2 text-xs text-field-200">
                <span className="shrink-0 w-10 text-field-500 font-bold">Wk {m.week}</span>
                <span className="shrink-0">{h.icon}</span>
                <span className="min-w-0">{h.text}{m.kind !== 'relief' && <span className="text-field-500"> · {m.score[0]}–{m.score[1]}</span>}</span>
              </li>
            )
          })}
        </ul>
      )}
      {story.events.length === 0 && (
        <p className="mt-2 text-xs text-field-500">{owner ? 'No battles here yet.' : 'Nobody has claimed it yet.'}</p>
      )}

      {!owner && reachers.length > 0 && (
        <p className="mt-2 text-[11px] text-field-400">Within reach of {reachers.map(r => (r === userId ? 'you' : nameOf(r))).join(', ')}.</p>
      )}

      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
