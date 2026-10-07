import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { CITY } from '../../../supabase/functions/_shared/conquest.ts'
import { ConquestMap } from '@/components/conquest/ConquestMap'
import { empires, liveBattles, headline, ownersBefore, type ConquestData, type ConquestMove, type LiveBattle } from '@/components/conquest/conquestView'

// Conquest on the Shop TV: a panel in the rotation, the remote's Map
// (full screen), and the War Report, which plays once for each week the
// server settles. The battles shown live come from the board the TV
// already has: everyone's correct picks so far and the picks that are
// public (the Board's cells).

interface BoardLike {
  week: number
  week_table: { userId: string; correct: number }[]
  board?: { rows: { userId: string; cells: Record<string, string | null> }[] }
}

/** This week's battles as they stand, or none if the war's week isn't this one. */
function useLiveBattles(war: ConquestData | null | undefined, b: BoardLike): LiveBattle[] {
  return useMemo(() => {
    if (!war) return []
    const battleWeek = (war.lastWeek ?? war.startWeek - 1) + 1
    if (b.week !== battleWeek || battleWeek > (war.finalWeek ?? 18)) return []
    const correct = Object.fromEntries(b.week_table.map(r => [r.userId, r.correct]))
    const picks: Record<string, Record<string, string>> = {}
    for (const row of b.board?.rows ?? []) {
      for (const [g, team] of Object.entries(row.cells)) if (team && team !== '?') (picks[row.userId] ??= {})[g] = team
    }
    return liveBattles(war, { correct, picks })
  }, [war, b.week, b.week_table, b.board])
}

const nameFrom = (war: ConquestData) => (id: string | null) => war.players.find(p => p.userId === id)?.name ?? 'Someone'
const colorFrom = (war: ConquestData) => (id: string) => war.players.find(p => p.userId === id)?.color ?? '#555'

function BattleLine({ war, b, big }: { war: ConquestData; b: LiveBattle; big?: boolean }) {
  const nameOf = nameFrom(war), colorOf = colorFrom(war)
  const ahead = b.score[0] > b.score[1]
  return (
    <div className={clsx('flex items-center gap-2', big ? 'text-[22px]' : 'text-[17px]')}>
      <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colorOf(b.attacker) }} />
      <span className="font-bold text-white truncate max-w-[34%]">{nameOf(b.attacker)}</span>
      <span className="text-field-500" title={b.ordered ? 'A chosen attack' : undefined}>{b.ordered ? '🎯' : '⚔'}</span>
      <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colorOf(b.defender) }} />
      <span className="font-bold text-white truncate max-w-[34%]">{nameOf(b.defender)}</span>
      <span className={clsx('ml-auto font-cond font-black tabular-nums', ahead ? 'text-emerald-300' : 'text-field-400')}>{b.score[0]}–{b.score[1]}</span>
      {b.outcome !== 'hold' && b.city && (
        <span className={clsx('shrink-0 font-bold', b.outcome === 'siege' ? 'text-amber-300' : 'text-gold')}>
          {b.outcome === 'siege' ? '🔥' : '→'} {b.city}
        </span>
      )}
    </div>
  )
}

/** The rotating panel: the map, who leads, and the week's fighting. */
export function ConquestPanelBody({ war, battles, week }: { war: ConquestData; battles: LiveBattle[]; week: number }) {
  const ranks = empires(war).filter(e => !e.exiled)
  const exiled = war.players.length - ranks.length
  const swinging = battles.filter(b => b.outcome !== 'hold').length
  return (
    <div className="h-full flex flex-col gap-3">
      <ConquestMap owners={war.owners} besieged={war.besieged} players={war.players} labels="abbr" layout="below" labelScale={2.1} battles={battles} className="w-full" />
      {war.crowned?.[0] && (
        <p className="text-[19px] font-bold text-gold">{war.crowned[0].icon} {war.crowned[0].label}: {war.crowned[0].holders.map(nameFrom(war)).join(' & ')}</p>
      )}
      {week < war.startWeek ? (
        <p className="text-[18px] text-field-300">The war begins Week {war.startWeek}. Every empire attacks the neighbor it picks most differently from.</p>
      ) : (
        <p className="text-[16px] text-field-400">
          {battles.length ? <>⚔️ {battles.length} battles this week{swinging ? `, ${swinging} cities changing hands as it stands` : ''}</> : 'Battles take shape as games kick off'}
          {exiled > 0 && <> · {exiled} in exile</>}
        </p>
      )}
      <div className="space-y-1.5">
        {ranks.slice(0, 5).map((e, i) => (
          <div key={e.userId} className="flex items-center gap-2.5 text-[19px]">
            <span className="w-5 text-right font-cond font-black text-field-500 tabular-nums">{i + 1}</span>
            <span className="w-4 h-4 rounded-sm shrink-0" style={{ background: e.color }} />
            <span className="font-bold text-white truncate">{e.name}</span>
            {e.besieged && <span>🔥</span>}
            <span className="ml-auto font-cond font-black text-white tabular-nums">{e.cities}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The remote's Map: the war full screen. */
export function ConquestTakeover({ war, battles, league, week }: { war: ConquestData; battles: LiveBattle[]; league: string; week: number }) {
  const ranks = empires(war)
  const unclaimed = Object.values(war.owners).filter(o => !o).length
  const shown = [...battles].sort((a, b) => Number(b.outcome !== 'hold') - Number(a.outcome !== 'hold') || Math.abs(a.score[0] - a.score[1]) - Math.abs(b.score[0] - b.score[1])).slice(0, 6)
  return (
    <div className="absolute inset-0 z-[35] bg-field-950/[0.97] flex flex-col px-10 pt-7 pb-6 rise-in">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="font-cond font-bold uppercase tracking-[0.3em] text-gold text-[26px]">{league}</p>
          <p className="font-cond font-black uppercase text-white text-[62px] leading-none">⚔️ Conquest · Week {Math.max(week, war.startWeek)}</p>
        </div>
        <p className="pb-2 font-mono text-[20px] text-[#3fd0ff]">
          {ranks.filter(e => !e.exiled).length} EMPIRES // {unclaimed} UNCLAIMED{battles.length ? ` // ${battles.length} BATTLES` : ''}
        </p>
      </div>
      {/* The map, full width; the week's battles sit under the Northeast zoom */}
      <div className="relative w-full mt-3">
        <ConquestMap owners={war.owners} besieged={war.besieged} players={war.players} labels="names" layout="side" labelScale={1.5} battles={battles} className="w-full" />
        {shown.length > 0 && (
          <div className="absolute" style={{ left: '71.2%', top: '64%', width: '28.6%' }}>
            <p className="font-mono text-[16px] text-[#3fd0ff] mb-1.5">// THIS WEEK, AS IT STANDS</p>
            <div className="space-y-1">{shown.map(b => <BattleLine key={b.attacker} war={war} b={b} />)}</div>
          </div>
        )}
      </div>
      {/* Every empire along the bottom */}
      <div className="mt-auto flex flex-wrap gap-x-7 gap-y-2 text-[21px]">
        {ranks.map(e => (
          <span key={e.userId} className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-sm shrink-0" style={{ background: e.color }} />
            <span className={clsx('font-bold', e.exiled ? 'text-field-500' : 'text-white')}>{e.name}</span>
            {e.besieged && <span>🔥</span>}
            <span className="font-cond font-black text-field-400 tabular-nums">{e.exiled ? 'exile' : e.cities}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── The War Report ────────────────────────────────────────────
const SEEN_KEY = 'gu-tv-war-report'
const INTRO_MS = 3500
const STEP_MS = 4200
const CLAIMS_MS = 5000
const FINALE_MS = 7000
const CORONATION_MS = 14_000
/** The most moves it plays one by one; the rest of the claims go in one step. */
const MAX_STEPS = 10

type Step =
  | { kind: 'intro' }
  | { kind: 'move'; move: ConquestMove; upTo: number }
  | { kind: 'claims'; moves: ConquestMove[]; upTo: number }
  | { kind: 'finale' }
  | { kind: 'coronation' }

/**
 * Once for every week the server settles: the week's war, move by move on
 * the map (the captures, sieges, rebellions and broken sieges, then the
 * new flags all at once), and the empires after it. Remembered on the TV,
 * so each week's report plays once.
 */
export function WarReport({ war, league }: { war: ConquestData; league: string }) {
  const report = war.report
  const reportWeek = report && report.moves.length ? report.week : null
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (reportWeek == null) return
    let seen = -1
    try { seen = Number(localStorage.getItem(SEEN_KEY) ?? -1) } catch { return }
    if (reportWeek <= seen) return
    // A moment after the board's up; only then is it seen
    const t = setTimeout(() => {
      try { localStorage.setItem(SEEN_KEY, String(reportWeek)) } catch { /* plays again after a reload */ }
      setPlaying(true)
    }, 8000)
    return () => clearTimeout(t)
  }, [reportWeek])

  const steps = useMemo<{ step: Step; ms: number }[]>(() => {
    if (!report) return []
    const moves = report.moves
    const big = moves.map((m, i) => ({ m, i })).filter(({ m }) => m.kind !== 'claim').slice(0, MAX_STEPS)
    const out: { step: Step; ms: number }[] = [{ step: { kind: 'intro' }, ms: INTRO_MS }]
    for (const { m, i } of big) out.push({ step: { kind: 'move', move: m, upTo: i + 1 }, ms: STEP_MS })
    const claims = moves.filter(m => m.kind === 'claim')
    if (claims.length) out.push({ step: { kind: 'claims', moves: claims, upTo: moves.length }, ms: CLAIMS_MS })
    out.push({ step: { kind: 'finale' }, ms: FINALE_MS })
    // The war's last week: the titles are crowned
    if (report.week === war.finalWeek && war.crowned?.length) out.push({ step: { kind: 'coronation' }, ms: CORONATION_MS })
    return out
  }, [report, war.finalWeek, war.crowned])

  const [at, setAt] = useState(0)
  useEffect(() => {
    if (!playing) return
    if (at >= steps.length) { setPlaying(false); return }
    const t = setTimeout(() => setAt(x => x + 1), steps[at].ms)
    return () => clearTimeout(t)
  }, [playing, at, steps])

  if (!playing || !report || at >= steps.length) return null
  const step = steps[at].step
  const nameOf = nameFrom(war), colorOf = colorFrom(war)
  if (step.kind === 'coronation' && war.crowned?.length) return <Coronation war={war} league={league} />
  // The map as of this step: the week undone, then the moves so far redone
  const start = ownersBefore(war.owners, report.moves)
  const upTo = step.kind === 'move' || step.kind === 'claims' ? step.upTo : step.kind === 'finale' ? report.moves.length : 0
  const owners = { ...start }
  for (const m of report.moves.slice(0, upTo)) if (m.kind === 'capture' || m.kind === 'claim' || m.kind === 'rebellion') owners[m.team] = m.to
  const besieged: Record<string, string> = step.kind === 'finale' ? war.besieged : Object.fromEntries(
    report.moves.slice(0, upTo).filter(m => m.kind === 'siege').map(m => [m.team, m.to]),
  )
  const ranks = empires({ ...war, owners, besieged })

  return (
    <div className="absolute inset-0 z-[36] bg-field-950/[0.97] flex flex-col items-center px-20 py-12">
      <p className="font-cond font-bold uppercase tracking-[0.3em] text-gold text-[30px]">{league} · Conquest</p>
      <p className="font-cond font-black uppercase text-white text-[72px] leading-none mb-6">⚔️ Week {report.week} War Report</p>
      <div className="flex-1 min-h-0 w-full flex items-center justify-center gap-12">
        <ConquestMap
          owners={owners}
          besieged={besieged}
          players={war.players}
          labels="names"
          layout="side"
          labelScale={1.5}
          highlight={step.kind === 'move' ? step.move.team : null}
          highlightColor={step.kind === 'move' ? colorOf(step.move.to) : undefined}
          className={step.kind === 'finale' ? 'w-[1280px]' : 'w-[1600px]'}
        />
        {step.kind === 'finale' && (
          <div className="w-[480px] shrink-0 space-y-2">
            <p className="font-cond font-bold uppercase tracking-wider text-field-400 text-[22px]">After Week {report.week}</p>
            {ranks.slice(0, 8).map((e, i) => (
              <div key={e.userId} className="flex items-center gap-3 text-[26px]">
                <span className="w-7 text-right font-cond font-black text-field-500 tabular-nums">{e.exiled ? '–' : i + 1}</span>
                <span className="w-5 h-5 rounded-sm shrink-0" style={{ background: e.color }} />
                <span className="font-bold text-white truncate">{e.name}</span>
                {e.besieged && <span>🔥</span>}
                <span className="ml-auto font-cond font-black text-white tabular-nums">{e.cities}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="h-[120px] mt-6 flex items-center justify-center text-center">
        {step.kind === 'intro' && (
          <p className="text-[36px] text-field-200 rise-in">{report.moves.filter(m => m.kind !== 'claim' && m.kind !== 'relief').length} battles won, {report.moves.filter(m => m.kind === 'claim').length} flags planted</p>
        )}
        {step.kind === 'move' && (() => {
          const h = headline(step.move, nameOf)
          return (
            <div key={at} className="rise-in">
              <p className="text-[40px] font-bold text-white leading-tight">{h.icon} {h.text}</p>
              {step.move.kind !== 'relief' && (
                <p className="mt-1 font-cond font-black text-[30px] text-field-400 tabular-nums">{step.move.score[0]}–{step.move.score[1]}</p>
              )}
            </div>
          )
        })()}
        {step.kind === 'claims' && (
          <p key={at} className="text-[34px] font-bold text-white leading-snug rise-in">
            🚩 New flags: {step.moves.slice(0, 6).map(m => `${nameOf(m.to)} in ${CITY[m.team]}`).join(', ')}
            {step.moves.length > 6 ? `, and ${step.moves.length - 6} more` : ''}
          </p>
        )}
        {step.kind === 'finale' && ranks[0] && (
          <p className="text-[38px] font-bold text-white rise-in">👑 {ranks[0].name} holds the biggest empire: {ranks[0].cities} cities</p>
        )}
      </div>
    </div>
  )
}

// ── Wired to the board ────────────────────────────────────────
type WarBoard = BoardLike & { league: string; conquest?: ConquestData | null }

/** The panel in the rotation, with the week's battles worked out from the board. */
export function ConquestPanel({ b }: { b: WarBoard }) {
  const battles = useLiveBattles(b.conquest, b)
  return b.conquest ? <ConquestPanelBody war={b.conquest} battles={battles} week={b.week} /> : null
}

/** The remote's Map, with the week's battles worked out from the board. */
export function ConquestMapShow({ b }: { b: WarBoard }) {
  const battles = useLiveBattles(b.conquest, b)
  return b.conquest ? <ConquestTakeover war={b.conquest} battles={battles} league={b.league} week={b.week} /> : null
}

/** The war's over: the Emperor, full screen, and the season's other titles. */
function Coronation({ war, league }: { war: ConquestData; league: string }) {
  const [emperor, ...rest] = war.crowned!
  const nameOf = nameFrom(war), colorOf = colorFrom(war)
  const co = emperor.holders.length > 1
  return (
    <div className="absolute inset-0 z-[36] bg-field-950/[0.98] flex flex-col items-center justify-center px-20 text-center">
      <p className="font-cond font-bold uppercase tracking-[0.35em] text-gold text-[30px]">{league} · Conquest is over</p>
      <p className="mt-6 text-[130px] leading-none rise-in">👑</p>
      <p className={clsx('mt-4 font-cond font-black uppercase leading-none rise-in', co ? 'text-[80px]' : 'text-[110px]')}>
        {emperor.holders.map((id, i) => (
          <span key={id}>{i > 0 && <span className="text-field-500"> & </span>}<span style={{ color: colorOf(id) }}>{nameOf(id)}</span></span>
        ))}
      </p>
      <p className="mt-3 font-cond font-black uppercase text-white text-[52px] tracking-wide">
        {co ? `Co-${emperor.label}s` : emperor.label} · {emperor.value} {emperor.value === 1 ? 'city' : 'cities'}
      </p>
      {rest.length > 0 && (
        <div className="mt-12 grid grid-cols-2 gap-x-16 gap-y-4 text-left">
          {rest.map(t => (
            <div key={t.key} className="flex items-center gap-4 text-[30px]">
              <span className="w-10 text-center">{t.icon}</span>
              <span className="font-bold text-white w-[260px]">{t.label}</span>
              <span className="w-5 h-5 rounded-sm shrink-0" style={{ background: colorOf(t.holders[0]) }} />
              <span className="font-bold text-field-200">{t.holders.map(nameOf).join(' & ')}</span>
              <span className="text-field-500 text-[22px]">{t.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
