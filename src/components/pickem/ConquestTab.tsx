import { useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Swords, Loader2, ChevronDown, Crosshair, Crown, Lock, Flag, Shield, ArrowLeftRight, Info, X } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { CURRENT_SEASON } from '@/lib/season'
import { CITY, ADJ, TERRITORIES, MEDAL_INFO, SECOND_FRONT_AT, citiesOf, neighborsOf, startOdds, imbalance, type MedalKind } from '../../../supabase/functions/_shared/conquest.ts'
import { WarMap } from '@/components/conquest/WarMap'
import { empires, liveBattles, headline, titles, seasonMedals, capitalsOf, swatch, type ConquestData, type ConquestMove, type ConquestPlayer, type Title } from '@/components/conquest/conquestView'
import { ConquestIcon } from '@/components/conquest/ConquestIcon'
import { MedalBadge } from '@/components/conquest/MedalBadge'
import { CipherOrders, cipherOf } from '@/components/conquest/CipherOrders'

/**
 * Conquest in the app (Pick'Em → Map): the war map, your empire, this
 * week's battles as they stand (only from picks everyone can already
 * see), your attack and flag for the week (before its first kickoff), the season's
 * title race, the empires, and the war log. The commissioner starts the
 * war here (the conquest function); the server settles each finished week.
 */
export function ConquestTab({ leagueId, week, games, allPicks, weekRows, leagueMembers, userId, deadline, isCommissioner }: {
  leagueId: string
  week: number
  games: any[]
  allPicks: any[]
  weekRows: { userId: string; correct: number }[]
  leagueMembers: any[]
  userId: string | undefined
  deadline: string | null
  isCommissioner: boolean
}) {
  const qc = useQueryClient()
  const key = ['conquest', leagueId, CURRENT_SEASON]
  const { data: raw, isLoading } = useQuery({
    queryKey: key,
    staleTime: 60_000,
    queryFn: async (): Promise<(ConquestData & { log: (ConquestMove & { week: number })[] }) | null> => {
      const { data: war, error } = await supabase.from('conquest_games').select('start_week, last_resolved_week, final_week, crowned')
        .eq('league_id', leagueId).eq('season', CURRENT_SEASON).maybeSingle()
      if (error) throw error
      if (!war) return null
      const battleWeek = (war.last_resolved_week ?? war.start_week - 1) + 1
      // This week's orders: yours, and everyone's once the first kickoff reveals them
      const [{ data: players }, { data: cities }, { data: moves }, { data: first }, { data: orders }] = await Promise.all([
        supabase.from('conquest_players').select('user_id, color, capital, city_weeks').eq('league_id', leagueId).eq('season', CURRENT_SEASON),
        supabase.from('conquest_territories').select('team, owner_id, besieged_by').eq('league_id', leagueId).eq('season', CURRENT_SEASON),
        supabase.from('conquest_moves').select('week, kind, team, from_user, to_user, score_for, score_against, exiled, with_team, tactic')
          .eq('league_id', leagueId).eq('season', CURRENT_SEASON).order('week', { ascending: false }).order('id'),
        supabase.from('nfl_games').select('game_date').eq('season', CURRENT_SEASON).eq('week', battleWeek).order('game_date').limit(1).maybeSingle(),
        supabase.from('conquest_orders').select('user_id, target_id, claim, fortify, tribute, ambush, target2').eq('league_id', leagueId).eq('season', CURRENT_SEASON).eq('week', battleWeek),
      ])
      const log = (moves ?? []).map((m: any) => ({
        week: m.week, kind: m.kind, team: m.team, from: m.from_user, to: m.to_user,
        score: [Number(m.score_for), Number(m.score_against)] as [number, number], exiled: m.exiled, withTeam: m.with_team, tactic: m.tactic,
      }))
      const { data: abroad } = await supabase.from('conquest_outposts').select('key, name, week, owner_id, game_id')
        .eq('league_id', leagueId).eq('season', CURRENT_SEASON).order('week')
      return {
        startWeek: war.start_week,
        lastWeek: war.last_resolved_week,
        // Names go on when it's drawn: the member list may still be loading now
        players: (players ?? []).map((p: any): ConquestPlayer => ({ userId: p.user_id, color: p.color, capital: p.capital, name: '', cityWeeks: p.city_weeks ?? 0 })),
        owners: Object.fromEntries((cities ?? []).map((c: any) => [c.team, c.owner_id])),
        besieged: Object.fromEntries((cities ?? []).filter((c: any) => c.besieged_by).map((c: any) => [c.team, c.besieged_by])),
        report: null,
        finalWeek: war.final_week,
        lockAt: first?.game_date ?? null,
        orders: Object.fromEntries((orders ?? []).filter((o: any) => o.target_id).map((o: any) => [o.user_id, o.target_id])),
        claims: Object.fromEntries((orders ?? []).filter((o: any) => o.claim).map((o: any) => [o.user_id, o.claim])),
        fortified: (orders ?? []).filter((o: any) => o.fortify).map((o: any) => o.user_id),
        tributes: Object.fromEntries((orders ?? []).filter((o: any) => o.tribute).map((o: any) => [o.user_id, o.tribute])),
        ambushes: Object.fromEntries((orders ?? []).filter((o: any) => o.ambush).map((o: any) => [o.user_id, o.ambush])),
        seconds: Object.fromEntries((orders ?? []).filter((o: any) => o.target2).map((o: any) => [o.user_id, o.target2])),
        outposts: (abroad ?? []).map((o: any) => ({ key: o.key, name: o.name, week: o.week, owner: o.owner_id, gameId: o.game_id })),
        crowned: (war.crowned as Title[] | null) ?? null,
        log,
      }
    },
  })

  // The war with everyone's name on it
  const data = useMemo(() => {
    if (!raw) return raw
    const nameOf = (id: string) => {
      const m = leagueMembers.find((x: any) => x.user_id === id)
      return m?.profile?.display_name || m?.profile?.username || 'Someone'
    }
    return { ...raw, players: raw.players.map(p => ({ ...p, name: nameOf(p.userId) })) }
  }, [raw, leagueMembers])

  const [starting, setStarting] = useState(false)
  const start = async () => {
    setStarting(true)
    const { data: started, error } = await supabase.functions.invoke('conquest', { body: { action: 'start', league_id: leagueId } })
    setStarting(false)
    if (error) {
      const msg = await (error as any)?.context?.json?.().then((b: any) => b?.error).catch(() => null)
      toast.error(msg ?? 'Couldn’t start the war')
      return
    }
    const moved = (started?.balanced ?? []).length
    toast.success(`The war is on. Capitals are handed out${moved ? `, ${moved === 1 ? 'one' : moved} moved for a fair start` : ''}.`)
    qc.invalidateQueries({ queryKey: key })
  }

  // This week's battles, from the picks everyone can see (kicked off, or past the deadline)
  const battleWeek = data ? (data.lastWeek ?? data.startWeek - 1) + 1 : null
  const battles = useMemo(() => {
    if (!data || week !== battleWeek || battleWeek > (data.finalWeek ?? 18)) return []
    const now = Date.now()
    const seen = new Set(games
      .filter((g: any) => now >= new Date(g.game_date).getTime() || (!!deadline && now >= new Date(deadline).getTime()))
      .map((g: any) => g.id))
    const picks: Record<string, Record<string, string>> = {}
    for (const p of allPicks) {
      if (!seen.has(p.game_id) || !p.picked_team) continue
      ;(picks[p.user_id] ??= {})[p.game_id] = p.picked_team
    }
    const correct = Object.fromEntries(weekRows.map(r => [r.userId, r.correct]))
    return liveBattles(data, { correct, picks })
  }, [data, week, battleWeek, games, allPicks, weekRows, deadline])

  const [rules, setRules] = useState(false)
  // Which section shows under the map (null: whichever matters now)
  const [section, setSection] = useState<Section | null>(null)
  const { data: trades = [] } = useTrades(leagueId)
  const sender = useOrderSender(leagueId, () => qc.invalidateQueries({ queryKey: key }))
  const [allLog, setAllLog] = useState(false)

  if (isLoading) return <div className="panel p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-field-400" /></div>

  if (!data) {
    return (
      <div className="panel p-6 text-center space-y-3">
        <Swords className="w-8 h-8 text-gold mx-auto" />
        <p className="font-cond font-black uppercase text-white text-xl tracking-wide">Conquest</p>
        <p className="text-sm text-field-400 max-w-md mx-auto">
          The league goes to war over a map of the 32 NFL cities. Beat a neighbor’s weekly score to take their land,
          all from the picks you already make.
        </p>
        {isCommissioner
          ? (
            <button onClick={start} disabled={starting} className="btn-gold mx-auto">
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />} Start the war
            </button>
          )
          : <p className="text-xs text-field-500">The commissioner hasn’t started a war yet.</p>}
      </div>
    )
  }

  const ranks = empires(data)
  // Your orders on the map: tap an enemy on your border to attack it, open land beside you for your flag
  const myCities = userId ? citiesOf(data.owners, userId) : []
  const lockAt = data.lockAt ? new Date(data.lockAt) : null
  const ordersOpen = !!userId && myCities.length > 0 && battleWeek != null && battleWeek <= (data.finalWeek ?? 18)
    && week === battleWeek && !(lockAt && Date.now() >= lockAt.getTime())
  const myTarget = userId ? data.orders?.[userId] ?? null : null
  const myClaim = userId ? data.claims?.[userId] ?? null : null
  const phone = typeof window !== 'undefined' && window.innerWidth < 640
  const nameOf = (id: string | null) => data.players.find(p => p.userId === id)?.name ?? 'Someone'
  const colorOf = (id: string) => data.players.find(p => p.userId === id)?.color ?? '#666'
  const me = ranks.find(e => e.userId === userId)
  const started = week >= data.startWeek
  const mine = battles.filter(b => b.attacker === userId || b.defender === userId)
  const others = battles.filter(b => b.attacker !== userId && b.defender !== userId)
  const logWeeks = [...new Set(data.log.map(m => m.week))]
  const shownWeeks = allLog ? logWeeks : logWeeks.slice(0, 2)

  const battleRow = (b: (typeof battles)[number]) => {
    const city = b.city ? CITY[b.city] : null
    const ahead = b.score[0] > b.score[1]
    return (
      <li key={`${b.attacker}>${b.defender}`} className={clsx('flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm', (b.attacker === userId || b.defender === userId) ? 'bg-gold/10 border border-gold/30' : 'bg-field-800/60')}>
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={swatch(colorOf(b.attacker))} />
        <span className="font-bold text-white truncate">{nameOf(b.attacker)}</span>
        {b.tactic === 'ambush' ? <span className="shrink-0" title="An ambush, sprung">🪤</span>
          : b.ordered ? <ConquestIcon name="target" title="Chose this attack" className="w-3.5 h-3.5 text-red-400 shrink-0" /> : <Swords className="w-3.5 h-3.5 text-field-500 shrink-0" />}
        {b.tactic === 'second' && <span className="shrink-0 text-[10px] font-bold uppercase text-field-400" title="A second front: it needs a win by 2">2nd</span>}
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={swatch(colorOf(b.defender))} />
        <span className="font-bold text-white truncate">{nameOf(b.defender)}</span>
        <span className={clsx('ml-auto shrink-0 font-cond font-black tabular-nums', ahead ? 'text-nfl' : 'text-field-300')}>{b.score[0]}–{b.score[1]}</span>
        <span className="shrink-0 text-[11px] text-field-400 w-[7.5rem] text-right">
          {b.outcome === 'take' ? <>{b.cut && <span title="Cut off from its capital">✂ </span>}takes {city}</> : b.outcome === 'siege' ? <><ConquestIcon name="siege" className="inline w-3 h-3 -mt-0.5 text-red-400" /> besieges {city}</> : 'holds'}
        </span>
      </li>
    )
  }

  // ── Under the map, one section at a time. It opens on what matters now: your orders
  //    before kickoff, the battles while they're fought, the standings after ──
  const locked = !!lockAt && Date.now() >= lockAt.getTime()
  const live = battleWeek != null && week === battleWeek && battleWeek <= (data.finalWeek ?? 18)
  const auto: Section = live && !locked && myCities.length > 0 ? 'orders' : live && locked && started ? 'battles' : 'standings'
  const shown = section ?? auto
  const offers = trades.filter(t => t.to_user === userId).length

  return (
    <div className="cq-tab space-y-3">
      <div className="panel p-4">
        <div className="flex items-center gap-2 mb-1">
          <Swords className="w-4 h-4 text-gold" />
          <p className="font-cond font-black uppercase text-white tracking-wide">
            Conquest · {started ? `Week ${Math.min(week, battleWeek ?? week)}` : `starts Week ${data.startWeek}`}
          </p>
          <button onClick={() => setRules(true)} className="ml-auto p-1 -m-1 rounded-full text-field-400 hover:text-white" aria-label="How it works" title="How it works">
            <Info className="w-4 h-4" />
          </button>
        </div>
        {me && (
          <p className="text-sm text-field-300">
            {me.exiled
              ? <>You’re in exile. Outscore whoever holds <span className="font-bold text-white">{me.capital ? CITY[me.capital] : 'your capital'}</span> to take it back.</>
              : <>Your empire: <span className="font-bold text-white">{me.cities} {me.cities === 1 ? 'city' : 'cities'}</span>{me.capital ? <>, capital <span className="font-bold text-white">{CITY[me.capital]}</span></> : null}{me.besieged ? <span className="text-amber-300"> · under siege <ConquestIcon name="siege" className="inline w-3.5 h-3.5 -mt-0.5 text-red-400" /></span> : null}</>}
          </p>
        )}
        <WarMap
          war={data} log={data.log} userId={userId} battles={battles}
          ordersOpen={ordersOpen} myTarget={myTarget} myClaim={myClaim}
          onAttack={sender.attack} onFlag={sender.flag} busy={sender.busy}
          seenKey={`gu-conquest-replay-${leagueId}-${CURRENT_SEASON}`} labelScale={phone ? 2.1 : 1.5}
        />
      </div>

      <div className="grid grid-cols-4 gap-1" role="tablist" aria-label="The war">
        {SECTIONS.map(t => (
          <button
            key={t.key} role="tab" aria-selected={shown === t.key} onClick={() => setSection(t.key)}
            className={clsx(
              'relative font-cond font-bold text-xs uppercase tracking-wider px-1 py-2 rounded-lg border transition-colors',
              shown === t.key ? 'border-gold/50 text-gold bg-gold/10' : 'border-field-600 text-field-400 bg-field-800 hover:text-white',
            )}
          >
            {t.label}
            {t.key === 'orders' && offers > 0 && <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-gold" aria-label="A trade offer is waiting" />}
          </button>
        ))}
      </div>

      {shown === 'orders' && (
        <>
          {isCommissioner && data.lastWeek == null && !locked && (
            <FairStart war={data} leagueId={leagueId} onMoved={() => qc.invalidateQueries({ queryKey: key })} />
          )}
          {!userId || !live ? (
            <Note>Orders are for the week being fought{battleWeek != null && battleWeek <= (data.finalWeek ?? 18) ? `: Week ${battleWeek}` : ''}.</Note>
          ) : me?.exiled ? (
            <Note>You’re in exile: no orders until you retake {me.capital ? CITY[me.capital] : 'your capital'}. Outscore whoever holds it, any week.</Note>
          ) : (
            <>
              <OrdersCard war={data} userId={userId} week={battleWeek!} sender={sender} />
              <Trades war={data} leagueId={leagueId} userId={userId} locked={locked} onDone={() => qc.invalidateQueries({ queryKey: key })} />
            </>
          )}
        </>
      )}

      {shown === 'battles' && (
        <>
          {userId && live && <CodedOrders war={data} leagueId={leagueId} week={battleWeek!} userId={userId} locked={locked} hideSeen />}
          {started && live ? (
            <div className="panel p-4">
              <p className="font-cond font-bold text-sm uppercase tracking-wider text-white mb-2">This week’s battles</p>
          {battles.length === 0 ? (
            <p className="text-xs text-field-400">Battles take shape as games kick off: each empire attacks the neighbor it picked most differently from.</p>
          ) : (
            <>
              <p className="text-[11px] text-field-500 mb-2">If it ended right now. It settles once every game is final.</p>
              <ul className="space-y-1.5">{[...mine, ...others].map(battleRow)}</ul>
            </>
          )}
            </div>
          ) : (
            <Note>The week’s battles show here once its games kick off.</Note>
          )}
        </>
      )}

      {shown === 'standings' && (
        <>
          <TitleRace war={data} userId={userId} />
          <EmpireList war={data} ranks={ranks} userId={userId} />
        </>
      )}

      {shown === 'log' && (logWeeks.length > 0 ? (
        <div className="panel p-4">
          <p className="font-cond font-bold text-sm uppercase tracking-wider text-white mb-2">War log</p>
          {shownWeeks.map(w => (
            <div key={w} className="mb-3 last:mb-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gold mb-1">Week {w}</p>
              <ul className="space-y-1">
                {data.log.filter(m => m.week === w).map((m, i) => {
                  const h = headline(m, nameOf)
                  return (
                    <li key={i} className="flex items-start gap-2 text-sm text-field-200">
                      <span className="shrink-0">{h.icon}</span>
                      <span className="min-w-0">{h.text}{SCORED.has(m.kind) && <span className="text-field-500"> · {m.score[0]}–{m.score[1]}</span>}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          {logWeeks.length > 2 && (
            <button onClick={() => setAllLog(a => !a)} className="text-xs font-bold text-gold hover:text-gold-light">
              {allLog ? 'Show fewer weeks' : `Show all ${logWeeks.length} weeks`}
            </button>
          )}
        </div>
      ) : (
        <Note>The war log fills in as each week settles.</Note>
      ))}

      {rules && <RulesSheet onClose={() => setRules(false)} />}
    </div>
  )
}

/** The sections under the map */
type Section = 'orders' | 'battles' | 'standings' | 'log'
const SECTIONS: { key: Section; label: string }[] = [
  { key: 'orders', label: 'Orders' }, { key: 'battles', label: 'Battles' }, { key: 'standings', label: 'Standings' }, { key: 'log', label: 'Log' },
]
/** War log lines that came from a score (a trade or a tribute didn't) */
const SCORED = new Set(['capture', 'siege', 'rebellion', 'claim'])

function Note({ children }: { children: ReactNode }) {
  return <div className="panel p-4 text-sm text-field-400">{children}</div>
}

/**
 * How the war works, in a sheet over the page (the ⓘ by the title): put on the
 * document's body, so nothing on the page can pin it inside the page, and above
 * the bottom bar; it scrolls within itself if the rules run longer than the screen.
 */
function RulesSheet({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 sm:p-4" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label="How Conquest works" onClick={e => e.stopPropagation()}
        className="cq-sheet w-full sm:max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl sm:rounded-2xl bg-field-800 border border-field-700 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center gap-2 mb-3">
          <Swords className="w-4 h-4 text-gold" />
          <p className="font-cond font-black uppercase text-white tracking-wide">How it works</p>
          <button onClick={onClose} className="ml-auto p-1 -m-1 text-field-400 hover:text-white" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <ul className="text-sm text-field-300 space-y-1.5 list-disc pl-4">
          <li>Each week your empire attacks one neighbor: the one you choose below (before the week’s first kickoff), or else the one you picked most differently from. Everyone’s choices come out at kickoff.</li>
          <li>Beat their score for the week and take one of their cities on your border. Ties go to the defender.</li>
          <li>A capital (<ConquestIcon name="capital" className="inline w-3 h-3 -mt-0.5 text-gold" />) doesn’t fall the first time: it goes under siege (<ConquestIcon name="siege" className="inline w-3 h-3 -mt-0.5 text-red-400" />). Lose again while besieged and it falls; a week nobody beats you and the siege lifts.</li>
          <li>The top half of the week each plant a flag in an open city next to them: the one you choose below, or else automatic. Best scores claim first; if yours is gone, you get your next open city.</li>
          <li>Level scores are settled like Pick’Em: the closer tiebreaker guess, then the better season win %. A battle that ends level still goes to the defender.</li>
          <li>Dotted lines on the map are sea lanes: the cities at each end border each other, like Risk.</li>
          <li>Lose everything and you’re in exile: outscore whoever holds your capital any week to take it back.</li>
          <li>Dig in instead of attacking: anyone attacking you that week has to win by 2 or more. Not two weeks running.</li>
          <li>Capital under siege? Pay tribute: hand one of your other cities to the besieger and the siege lifts before the week’s battles, so your capital can’t fall that week.</li>
          <li>Trade a city for another player’s (never a capital) when you both agree. Trades happen before the week’s first kickoff.</li>
          <li>Weeks settle once every game is final. After Week 18 the titles are crowned: Emperor (the biggest empire; on a tie, whoever held the most cities week by week all season), Warlord, Siege Master, Unbreakable, Comeback Kid and Iron Grip (the most cities held, added up week after week).</li>
          <li>Lie in ambush instead of attacking: name an empire on your border, and if it attacks you and you outscore it, you take one of its cities.</li>
          <li>An empire of {SECOND_FRONT_AT} or more cities opens a second front: a second attack each week (yours to choose, or automatic) that takes a city only with a win by 2.</li>
          <li>Supply lines: a city cut off from its capital (not joined to it through your own cities, by land or sea lane) defends at −1, so one point short still takes it. It’s marked on the map with a broken link.</li>
          <li>Outposts: when the NFL plays abroad, an outpost appears off the coast. The best week among everyone who picked that game right wins it, and it counts as a city (for Emperor and Iron Grip) to the season’s end. It can’t be attacked.</li>
          <li>Cities that would change hands if the week ended now pulse on the map.</li>
        </ul>
      </div>
    </div>
  , document.body)
}

type War = ConquestData & { log: (ConquestMove & { week: number })[] }

type OrderSender = ReturnType<typeof useOrderSender>

/** Saves your attack and flag for the week (the orders card and the map both use it). */
function useOrderSender(leagueId: string, onSaved: () => void) {
  const [busy, setBusy] = useState<string | null>(null)
  const send = async (key: string, body: Record<string, unknown>, done: string) => {
    setBusy(key)
    const { error } = await supabase.functions.invoke('conquest', { body: { league_id: leagueId, ...body } })
    setBusy(null)
    if (error) {
      const msg = await (error as any)?.context?.json?.().then((b: any) => b?.error).catch(() => null)
      toast.error(msg ?? 'Couldn’t save your orders')
      return
    }
    toast.success(done)
    onSaved()
  }
  return {
    busy,
    attack: (id: string | null, name?: string) => send(`atk:${id ?? 'auto'}`, { action: 'target', target: id },
      id ? `You’re attacking ${name ?? 'them'} this week` : 'Attack back to automatic'),
    flag: (team: string | null) => send(`flag:${team ?? 'auto'}`, { action: 'claim', team },
      team ? `Your flag goes to ${CITY[team] ?? team} if you finish in the top half` : 'Flag back to automatic'),
    ambush: (id: string | null, name?: string) => send(`amb:${id ?? 'off'}`, { action: 'ambush', target: id },
      id ? `Lying in wait for ${name ?? 'them'}: no attack this week` : 'Back to attacking'),
    second: (id: string | null, name?: string) => send(`sec:${id ?? 'auto'}`, { action: 'second', target: id },
      id ? `Your second front: ${name ?? 'them'}` : 'Second front back to automatic'),
    fortify: (on: boolean) => send(on ? 'dig:on' : 'dig:off', { action: 'fortify', on },
      on ? 'You’re dug in this week: no attack, and they need to win by 2' : 'Back to attacking'),
    tribute: (team: string | null) => send(`tribute:${team ?? 'none'}`, { action: 'tribute', team },
      team ? `${CITY[team] ?? team} goes as tribute, and the siege lifts before the battles` : 'No tribute'),
  }
}

/**
 * Your orders for the week, both optional: the attack (any empire on your
 * border; automatic is the one you pick most differently from) and the
 * flag (the open city you'd claim with a top-half week; automatic is the
 * one touching most of your cities). Locks at the week's first kickoff,
 * when everyone's choices come out.
 */
function OrdersCard({ war, userId, week, sender }: { war: War; userId: string; week: number; sender: OrderSender }) {
  const { busy, attack, flag, fortify, tribute, ambush, second } = sender
  // Each order shows as one line; "Change" opens its choices (and picking one closes them)
  const [editing, setEditing] = useState<'attack' | 'second' | 'tribute' | 'flag' | null>(null)
  const mine = citiesOf(war.owners, userId)
  if (!mine.length) return null
  const lockAt = war.lockAt ? new Date(war.lockAt) : null
  const locked = !!lockAt && Date.now() >= lockAt.getTime()
  const target = war.orders?.[userId] ?? null
  const dugIn = (war.fortified ?? []).includes(userId)
  const waitingFor = war.ambushes?.[userId] ?? null
  const secondTarget = war.seconds?.[userId] ?? null
  const player = (id: string) => war.players.find(p => p.userId === id)
  // Tribute: your capital's under siege, and you've another city to pay with
  const myCapital = player(userId)?.capital ?? null
  const besieger = myCapital && war.owners[myCapital] === userId ? war.besieged[myCapital] ?? null : null
  const payWith = besieger ? mine.filter(t => t !== myCapital) : []
  const paying = war.tributes?.[userId] && payWith.includes(war.tributes[userId]) ? war.tributes[userId] : null
  const mineSet = new Set(mine)
  const bordering = (t: string) => ADJ[t].filter(n => mineSet.has(n)).length
  const neighbors = neighborsOf(war.owners, userId).map(id => {
    const theirs = citiesOf(war.owners, id)
    const p = player(id)
    return {
      id, name: p?.name ?? 'Someone', color: p?.color ?? '#666', cities: theirs.length,
      // Your cities on that border
      via: theirs.flatMap(t => ADJ[t].filter(n => mineSet.has(n))).filter((v, i, a) => a.indexOf(v) === i),
      // Their capital's under siege: one more win and it falls
      weak: !!p?.capital && war.owners[p.capital] === id && !!war.besieged[p.capital],
    }
  }).sort((a, b) => Number(b.weak) - Number(a.weak) || a.cities - b.cities || a.name.localeCompare(b.name))

  // The open cities you could claim, the automatic one first, and who else can reach each
  const open = TERRITORIES
    .filter(t => war.owners[t] == null && bordering(t) > 0)
    .sort((x, y) => bordering(y) - bordering(x) || x.localeCompare(y))
    .map(t => ({ team: t, rivals: [...new Set(ADJ[t].map(n => war.owners[n]).filter((o): o is string => !!o && o !== userId))] }))
  const autoClaim = open[0]?.team ?? null
  const claim = war.claims?.[userId] && open.some(o => o.team === war.claims![userId]) ? war.claims[userId] : null

  const row = (on: boolean) => clsx('w-full flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm text-left', on ? 'border-gold bg-gold/10' : 'border-field-700 bg-field-800/60 hover:border-field-500')
  const spin = <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
  const lockLabel = lockAt?.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  const pick = (go: () => void) => () => { go(); setEditing(null) }
  const summary = (key: 'attack' | 'second' | 'tribute' | 'flag', icon: ReactNode, label: string, value: string) => (
    <button
      onClick={() => setEditing(e => (e === key ? null : key))}
      className={clsx('w-full flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm text-left', editing === key ? 'border-gold/60 bg-gold/5' : 'border-field-700 bg-field-800/60 hover:border-field-500')}
    >
      {icon}
      <span className="w-14 shrink-0 text-[11px] font-bold uppercase tracking-wider text-field-400">{label}</span>
      <span className="font-bold text-white truncate">{value}</span>
      <span className="ml-auto shrink-0 text-[11px] font-bold text-gold">{editing === key ? 'Done' : 'Change'}</span>
    </button>
  )
  const choices = 'space-y-1.5 ml-2 pl-2 border-l border-field-700'
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 mb-1">
        <Crosshair className="w-4 h-4 text-gold" />
        <p className="font-cond font-bold text-sm uppercase tracking-wider text-white">Your orders · Week {week}</p>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-field-400">
          <Lock className="w-3 h-3" /> {locked ? 'Locked' : `Locks ${lockLabel ?? 'at the first kickoff'}`}
        </span>
      </div>
      {locked ? (
        <div className="text-sm text-field-300 space-y-1">
          <p>
            {dugIn ? <Shield className="inline w-3.5 h-3.5 mr-1 text-field-400" /> : <Swords className="inline w-3.5 h-3.5 mr-1 text-field-400" />}
            {dugIn ? <>Dug in: no attack, and anyone attacking you needs to win by 2.</>
              : waitingFor ? <>🪤 Lying in wait for <span className="font-bold text-white">{player(waitingFor)?.name ?? 'Someone'}</span>: if they attack you and you outscore them, you take one of their cities.</>
              : target ? <>Attacking <span className="font-bold text-white">{player(target)?.name ?? 'Someone'}</span> (your choice).</> : 'Attack: automatic, the neighbor you pick most differently from.'}
          </p>
          {paying && (
            <p>🪙 Tribute: <span className="font-bold text-white">{CITY[paying]}</span> to {player(besieger!)?.name ?? 'your besieger'}, and the siege lifts.</p>
          )}
          {open.length > 0 && (
            <p>
              <Flag className="inline w-3.5 h-3.5 mr-1 text-field-400" />
              Flag: <span className="font-bold text-white">{CITY[claim ?? autoClaim!]}</span>{claim ? ' (your choice)' : ' (automatic)'}, if you finish in the top half.
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-field-400 mb-2">All optional, and nobody sees them until kickoff.</p>
          <div className="space-y-1.5">
            {summary('attack', dugIn ? <Shield className="w-3.5 h-3.5 text-[#3fd0ff] shrink-0" /> : waitingFor ? <span className="shrink-0 text-sm" aria-hidden>🪤</span> : <Swords className="w-3.5 h-3.5 text-field-400 shrink-0" />, 'Attack',
              dugIn ? 'Dig in: no attack' : waitingFor ? `Ambush: ${player(waitingFor)?.name ?? 'Someone'}` : target ? player(target)?.name ?? 'Someone' : 'Automatic')}
            {editing === 'attack' && (
              <div className={choices}>
                <button onClick={pick(() => (dugIn ? fortify(false) : waitingFor ? ambush(null) : attack(null)))} disabled={!!busy} className={row(!target && !dugIn && !waitingFor)}>
                  {busy === 'atk:auto' || busy === 'dig:off' ? spin : <Swords className="w-3.5 h-3.5 text-field-400 shrink-0" />}
                  <span className="font-bold text-white shrink-0 whitespace-nowrap">Automatic</span>
                  <span className="text-[11px] text-field-500 truncate">the neighbor you pick most differently from</span>
                </button>
                <button onClick={pick(() => fortify(!dugIn))} disabled={!!busy} className={row(dugIn)}>
                  {busy === 'dig:on' ? spin : <Shield className="w-3.5 h-3.5 text-[#3fd0ff] shrink-0" />}
                  <span className="font-bold text-white shrink-0 whitespace-nowrap">Dig in</span>
                  <span className="text-[11px] text-field-500 truncate">no attack; they must win by 2</span>
                </button>
                {neighbors.map(n => (
                  <button key={n.id} onClick={pick(() => attack(n.id, n.name))} disabled={!!busy} className={row(target === n.id)}>
                    {busy === `atk:${n.id}` ? spin : <span className="w-3 h-3 rounded-sm shrink-0" style={swatch(n.color)} />}
                    <span className="font-bold text-white truncate">{n.name}</span>
                    {n.weak && <ConquestIcon name="siege" title="Capital under siege: one more win and it falls" className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                    <span className="ml-auto shrink-0 text-[11px] text-field-400">
                      {n.cities} {n.cities === 1 ? 'city' : 'cities'}<span className="hidden sm:inline"> · via {n.via.map(t => CITY[t] ?? t).join(', ')}</span>
                    </span>
                  </button>
                ))}
                <p className="pt-1 text-[11px] text-field-500">Or lie in ambush (no attack): if they attack you and you outscore them, you take one of their cities.</p>
                {neighbors.map(n => (
                  <button key={`amb-${n.id}`} onClick={pick(() => ambush(n.id, n.name))} disabled={!!busy} className={row(waitingFor === n.id)}>
                    {busy === `amb:${n.id}` ? spin : <span className="shrink-0" aria-hidden>🪤</span>}
                    <span className="font-bold text-white truncate">Ambush {n.name}</span>
                  </button>
                ))}
              </div>
            )}

            {mine.length >= SECOND_FRONT_AT && (
              <>
                {summary('second', <Swords className="w-3.5 h-3.5 text-field-400 shrink-0" />, '2nd front', secondTarget ? player(secondTarget)?.name ?? 'Someone' : 'Automatic')}
                {editing === 'second' && (
                  <div className={choices}>
                    <p className="text-[11px] text-field-500">An empire of {SECOND_FRONT_AT}+ cities attacks a second neighbor too: it takes a city only with a win by 2.</p>
                    <button onClick={pick(() => second(null))} disabled={!!busy} className={row(!secondTarget)}>
                      {busy === 'sec:auto' ? spin : <Swords className="w-3.5 h-3.5 text-field-400 shrink-0" />}
                      <span className="font-bold text-white shrink-0 whitespace-nowrap">Automatic</span>
                      <span className="text-[11px] text-field-500 truncate">the next neighbor you pick most differently from</span>
                    </button>
                    {neighbors.filter(n => n.id !== target).map(n => (
                      <button key={`sec-${n.id}`} onClick={pick(() => second(n.id, n.name))} disabled={!!busy} className={row(secondTarget === n.id)}>
                        {busy === `sec:${n.id}` ? spin : <span className="w-3 h-3 rounded-sm shrink-0" style={swatch(n.color)} />}
                        <span className="font-bold text-white truncate">{n.name}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-field-400">{n.cities} {n.cities === 1 ? 'city' : 'cities'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {besieger && payWith.length > 0 && (
              <>
                {summary('tribute', <span className="shrink-0 text-sm" aria-hidden>🪙</span>, 'Tribute', paying ? `Pay with ${CITY[paying]}` : 'None')}
                {editing === 'tribute' && (
                  <div className={choices}>
                    <p className="text-[11px] text-field-500">
                      Under siege by {player(besieger)?.name ?? 'someone'}. Hand them a city and the siege lifts before the battles: {myCapital ? CITY[myCapital] : 'your capital'} can’t fall this week.
                    </p>
                    <button onClick={pick(() => tribute(null))} disabled={!!busy} className={row(!paying)}>
                      {busy === 'tribute:none' ? spin : <Shield className="w-3.5 h-3.5 text-field-400 shrink-0" />}
                      <span className="font-bold text-white shrink-0 whitespace-nowrap">No tribute</span>
                      <span className="text-[11px] text-field-500 truncate">hold out</span>
                    </button>
                    {payWith.map(t => (
                      <button key={t} onClick={pick(() => tribute(t))} disabled={!!busy} className={row(paying === t)}>
                        {busy === `tribute:${t}` ? spin : <span className="shrink-0" aria-hidden>🪙</span>}
                        <span className="font-bold text-white truncate">Pay with {CITY[t] ?? t}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {open.length > 0 && (
              <>
                {summary('flag', <Flag className="w-3.5 h-3.5 text-field-400 shrink-0" />, 'Flag', claim ? CITY[claim] ?? claim : `Automatic · ${CITY[autoClaim!]}`)}
                {editing === 'flag' && (
                  <div className={choices}>
                    <p className="text-[11px] text-field-500">Planted only with a top-half week. Better weeks claim first; if yours is gone, you get your next open city.</p>
                    <button onClick={pick(() => flag(null))} disabled={!!busy} className={row(!claim)}>
                      {busy === 'flag:auto' ? spin : <Flag className="w-3.5 h-3.5 text-field-400 shrink-0" />}
                      <span className="font-bold text-white shrink-0 whitespace-nowrap">Automatic</span>
                      <span className="text-[11px] text-field-500 truncate">{CITY[autoClaim!]}</span>
                    </button>
                    {open.map(o => (
                      <button key={o.team} onClick={pick(() => flag(o.team))} disabled={!!busy} className={row(claim === o.team)}>
                        {busy === `flag:${o.team}` ? spin : <Flag className="w-3.5 h-3.5 text-gold shrink-0" />}
                        <span className="font-bold text-white truncate">{CITY[o.team] ?? o.team}</span>
                        <span className={clsx('ml-auto shrink-0 text-[11px]', o.rivals.length ? 'text-field-400' : 'font-bold text-nfl')}>
                          {o.rivals.length === 0 ? 'only you can reach it' : `${o.rivals.length} ${o.rivals.length === 1 ? 'other' : 'others'} can reach it`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

type Trade = { id: string; from_user: string; to_user: string; give_team: string; get_team: string; week: number; status: string }

/** Your open trade offers, made and received (the RLS shows only yours) */
function useTrades(leagueId: string) {
  return useQuery({
    queryKey: ['conquest-trades', leagueId, CURRENT_SEASON],
    staleTime: 30_000,
    refetchInterval: 2 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('conquest_trades').select('id, from_user, to_user, give_team, get_team, week, status')
        .eq('league_id', leagueId).eq('season', CURRENT_SEASON).eq('status', 'pending').order('created_at')
      if (error) throw error
      return (data ?? []) as Trade[]
    },
  })
}

/**
 * Trades: offer one of your cities for one of someone else's (never a
 * capital), and answer the offers made to you. One line until it's opened
 * (offers to you always show). Swaps happen at once, before the week's
 * first kickoff; after it, offers wait for the week to settle, and any not
 * answered by then run out.
 */
function Trades({ war, leagueId, userId, locked, onDone }: { war: War; leagueId: string; userId: string; locked: boolean; onDone: () => void }) {
  const qc = useQueryClient()
  const key = ['conquest-trades', leagueId, CURRENT_SEASON]
  const { data: trades = [] } = useTrades(leagueId)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [give, setGive] = useState('')
  const [withId, setWithId] = useState('')
  const [get, setGet] = useState('')
  const capitalOf = (id: string) => war.players.find(p => p.userId === id)?.capital ?? null
  const nameOf = (id: string) => war.players.find(p => p.userId === id)?.name ?? 'Someone'
  const tradeable = (id: string) => citiesOf(war.owners, id).filter(t => t !== capitalOf(id))
  const mine = tradeable(userId)
  const partners = war.players.filter(p => p.userId !== userId && tradeable(p.userId).length > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
  const incoming = trades.filter(t => t.to_user === userId)
  const outgoing = trades.filter(t => t.from_user === userId)
  if (!mine.length && !incoming.length && !outgoing.length) return null

  const call = async (busyKey: string, body: Record<string, unknown>, done: string) => {
    setBusy(busyKey)
    const { error } = await supabase.functions.invoke('conquest', { body: { league_id: leagueId, ...body } })
    setBusy(null)
    if (error) {
      const msg = await (error as any)?.context?.json?.().then((b: any) => b?.error).catch(() => null)
      toast.error(msg ?? 'Couldn’t do that')
      return false
    }
    toast.success(done)
    qc.invalidateQueries({ queryKey: key })
    onDone()
    return true
  }
  const offer = async () => {
    if (await call('offer', { action: 'trade_offer', to: withId, give, get }, `Offer sent to ${nameOf(withId)}`)) { setGive(''); setGet('') }
  }
  const select = 'w-full rounded-lg border border-field-700 bg-field-800 px-2 py-1.5 text-sm text-white'
  const spin = <Loader2 className="w-3.5 h-3.5 animate-spin" />
  const status = incoming.length ? `${incoming.length} ${incoming.length === 1 ? 'offer' : 'offers'} for you`
    : outgoing.length ? `${outgoing.length} sent` : locked ? 'closed until the week settles' : 'swap a city with another player'
  return (
    <div className="panel p-4">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 text-left" aria-expanded={open}>
        <ArrowLeftRight className="w-4 h-4 text-gold shrink-0" />
        <span className="font-cond font-bold text-sm uppercase tracking-wider text-white">Trades</span>
        <span className={clsx('text-[11px] truncate', incoming.length ? 'font-bold text-gold' : 'text-field-400')}>{status}</span>
        <ChevronDown className={clsx('ml-auto w-4 h-4 text-field-400 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {incoming.length > 0 && (
        <ul className="space-y-1.5 mt-3">
          {incoming.map(t => (
            <li key={t.id} className="rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-2 text-sm">
              <p className="text-field-200"><span className="font-bold text-white">{nameOf(t.from_user)}</span> offers <span className="font-bold text-white">{CITY[t.give_team]}</span> for your <span className="font-bold text-white">{CITY[t.get_team]}</span></p>
              {!locked && (
                <div className="flex gap-2 mt-1.5">
                  <button onClick={() => call(`yes:${t.id}`, { action: 'trade_reply', trade_id: t.id, accept: true }, `${CITY[t.give_team]} is yours`)} disabled={!!busy} className="btn-gold !py-1 !px-3 text-xs">
                    {busy === `yes:${t.id}` ? spin : 'Accept'}
                  </button>
                  <button onClick={() => call(`no:${t.id}`, { action: 'trade_reply', trade_id: t.id, accept: false }, 'Offer declined')} disabled={!!busy} className="rounded-lg border border-field-600 px-3 py-1 text-xs font-bold text-field-300 hover:text-white">
                    {busy === `no:${t.id}` ? spin : 'Decline'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-3">
          <p className="text-xs text-field-400 mb-3">
            {locked
              ? 'Trades are closed until this week settles. Offers not answered by then run out.'
              : 'Swap a city for someone else’s, never a capital. It happens the moment they accept, before the week’s first kickoff.'}
          </p>
          {outgoing.length > 0 && (
            <ul className="space-y-1.5 mb-3">
              {outgoing.map(t => (
                <li key={t.id} className="flex items-center gap-2 rounded-lg bg-field-800/60 px-2.5 py-2 text-sm">
                  <span className="text-field-300 truncate">You offered <span className="font-bold text-white">{CITY[t.give_team]}</span> for {nameOf(t.to_user)}’s <span className="font-bold text-white">{CITY[t.get_team]}</span></span>
                  <button onClick={() => call(`cancel:${t.id}`, { action: 'trade_cancel', trade_id: t.id }, 'Offer withdrawn')} disabled={!!busy} className="ml-auto shrink-0 text-[11px] font-bold text-field-400 hover:text-white">
                    {busy === `cancel:${t.id}` ? spin : 'Withdraw'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!locked && mine.length > 0 && partners.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] items-end">
              <label className="text-[11px] text-field-400">You give
                <select value={give} onChange={e => setGive(e.target.value)} className={select}>
                  <option value="">Your city…</option>
                  {mine.map(t => <option key={t} value={t}>{CITY[t]}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-field-400">To
                <select value={withId} onChange={e => { setWithId(e.target.value); setGet('') }} className={select}>
                  <option value="">Player…</option>
                  {partners.map(p => <option key={p.userId} value={p.userId}>{p.name}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-field-400">For
                <select value={get} onChange={e => setGet(e.target.value)} disabled={!withId} className={select}>
                  <option value="">Their city…</option>
                  {withId && tradeable(withId).map(t => <option key={t} value={t}>{CITY[t]}</option>)}
                </select>
              </label>
              <button onClick={offer} disabled={!!busy || !give || !withId || !get} className="btn-gold justify-center">
                {busy === 'offer' ? spin : 'Offer'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The commissioner's look at the starts, before the war's first kickoff:
 * each player's estimated chance of the crown against a fair share
 * (startOdds), and if it's lopsided, a button to even it out (the server
 * moves the fewest capitals that fix it, never off a favorite team's city).
 */
function FairStart({ war, leagueId, onMoved }: { war: War; leagueId: string; onMoved: () => void }) {
  const [busy, setBusy] = useState(false)
  const caps = war.players.filter(p => p.capital)
  const odds = startOdds(caps.map(p => p.capital!))
  const off = imbalance(caps.map(p => p.capital!))
  const lopsided = off > 0.3
  const rows = [...caps].sort((a, b) => odds[b.capital!] - odds[a.capital!])
  const even = async () => {
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('conquest', { body: { action: 'balance', league_id: leagueId } })
    setBusy(false)
    if (error) {
      const msg = await (error as any)?.context?.json?.().then((b: any) => b?.error).catch(() => null)
      toast.error(msg ?? 'Couldn’t move the capitals')
      return
    }
    const moves: { userId: string; from: string; to: string }[] = data?.moves ?? []
    const name = (u: string) => war.players.find(p => p.userId === u)?.name ?? 'Someone'
    toast.success(moves.length ? moves.map(m => `${name(m.userId)}: ${CITY[m.from]} → ${CITY[m.to]}`).join(' · ') : 'Already as even as it gets')
    onMoved()
  }
  return (
    <div className={clsx('panel p-4', lopsided && 'border-amber-500/40')}>
      <p className="font-cond font-bold text-sm uppercase tracking-wider text-white mb-1">Fair start · only you see this</p>
      <p className="text-xs text-field-400 mb-3">
        {lopsided
          ? 'Some capitals start well ahead of others: open land next to them that nobody else is near. Moving a capital or two evens it out.'
          : 'The starts are even: nobody’s far ahead on where they begin.'}
        {' '}Each player’s chance of ending as Emperor, against a fair share, if everyone picked equally well.
      </p>
      <ul className="space-y-1 mb-3">
        {rows.map(p => {
          const v = odds[p.capital!]
          return (
            <li key={p.userId} className="flex items-center gap-2 text-xs">
              <span className="w-28 truncate text-field-300">{p.name}</span>
              <span className="w-24 truncate text-field-500">{CITY[p.capital!]}</span>
              <span className="flex-1 h-2 rounded bg-field-800 overflow-hidden">
                <span className={clsx('block h-full rounded', v > 2 || v < 0.5 ? 'bg-amber-500' : 'bg-field-400')} style={{ width: `${Math.min(100, (v / 3) * 100)}%` }} />
              </span>
              <span className={clsx('w-10 text-right tabular-nums', v > 2 || v < 0.5 ? 'text-amber-400' : 'text-field-400')}>×{v.toFixed(1)}</span>
            </li>
          )
        })}
      </ul>
      {lopsided && (
        <button onClick={even} disabled={busy} className="btn-gold">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />} Even it out
        </button>
      )}
    </div>
  )
}

/** The season's titles: the race as it stands, or the crowned ones once the war's over. */
function TitleRace({ war, userId }: { war: War; userId: string | undefined }) {
  const abroad: Record<string, number> = {}
  for (const o of war.outposts ?? []) if (o.owner) abroad[o.owner] = (abroad[o.owner] ?? 0) + 1
  const list = war.crowned ?? titles(war.log, war.owners, war.players.map(p => p.userId), Object.fromEntries(war.players.map(p => [p.userId, p.cityWeeks ?? 0])), abroad)
  if (!list.length) return null
  const player = (id: string) => war.players.find(p => p.userId === id)
  return (
    <div className={clsx('panel p-4', war.crowned && 'border-gold/40')}>
      <p className="flex items-center gap-2 font-cond font-bold text-sm uppercase tracking-wider text-white mb-2">
        <Crown className="w-4 h-4 text-gold" /> {war.crowned ? 'Crowned' : `Title race · crowned after Week ${war.finalWeek ?? 18}`}
      </p>
      <ul className="space-y-1.5">
        {list.map(t => {
          const tied = t.holders.length > 1
          return (
            <li key={t.key} className={clsx('flex items-start gap-2 text-sm rounded-md px-2 py-1.5', !!userId && t.holders.includes(userId) && 'bg-gold/10')}>
              <span className="w-6 shrink-0 text-center leading-5">{t.icon}</span>
              {/* The title, who holds it and the count on one line; what it's for under it, so a phone never squeezes out the name */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white shrink-0 whitespace-nowrap">{t.label}</span>
                  {tied ? (
                    <span className="text-field-400 truncate">
                      {t.holders.length <= 3 ? `${t.holders.map(id => player(id)?.name ?? 'Someone').join(' & ')}, tied` : `${t.holders.length}-way tie`}
                    </span>
                  ) : (
                    <>
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={swatch(player(t.holders[0])?.color ?? '#666')} />
                      <span className="font-bold text-field-200 truncate">{player(t.holders[0])?.name ?? 'Someone'}</span>
                    </>
                  )}
                  <span className="ml-auto shrink-0 font-cond font-black tabular-nums text-field-300">{t.value}</span>
                </div>
                <p className="text-[11px] text-field-500 truncate">{t.blurb}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Every empire, biggest first, with the medals each player's won this season beside their name. */
function EmpireList({ war, ranks, userId }: { war: War; ranks: ReturnType<typeof empires>; userId: string | undefined }) {
  const medals = useMemo(() => seasonMedals(war.log, capitalsOf(war.players)), [war.log, war.players])
  const KINDS: MedalKind[] = ['honor', 'purple_heart', 'service_cross']
  return (
    <div className="panel p-4">
      <p className="font-cond font-bold text-sm uppercase tracking-wider text-white mb-2">Empires</p>
      <ul className="space-y-1">
        {ranks.map((e, i) => {
          const list = medals.get(e.userId) ?? []
          return (
            <li key={e.userId} className={clsx('flex items-center gap-2 text-sm rounded-md px-2 py-1', e.userId === userId && 'bg-gold/10')}>
              <span className="w-5 text-right font-cond font-black text-field-500 tabular-nums">{e.exiled ? '–' : i + 1}</span>
              <span className="w-3 h-3 rounded-sm shrink-0" style={swatch(e.color)} />
              <span className={clsx('truncate font-bold', e.exiled ? 'text-field-500' : 'text-white')}>{e.name}</span>
              {e.besieged && <ConquestIcon name="siege" title="Capital under siege" className="w-3.5 h-3.5 text-red-400 shrink-0" />}
              <span className="flex items-center gap-1 shrink-0">
                {KINDS.map(k => {
                  const n = list.filter(m => m.kind === k).length
                  return n ? (
                    <span key={k} className="flex items-center" title={`${MEDAL_INFO[k].name}${n > 1 ? ` ×${n}` : ''}`}>
                      <MedalBadge kind={k} className="w-2.5 h-4" />
                      {n > 1 && <span className="text-[10px] font-bold text-field-400 tabular-nums">{n}</span>}
                    </span>
                  ) : null
                })}
              </span>
              <span className="ml-auto shrink-0 text-field-300 tabular-nums">{e.exiled ? 'in exile' : `${e.cities} ${e.cities === 1 ? 'city' : 'cities'}`}</span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-field-500">
        {KINDS.map(k => (
          <span key={k} className="flex items-center gap-1"><MedalBadge kind={k} className="w-2 h-3.5" />{MEDAL_INFO[k].short}: {MEDAL_INFO[k].why}</span>
        ))}
      </p>
    </div>
  )
}

/**
 * The week's attack orders as coded messages: before the first kickoff,
 * who's sealed one (a cipher each; yours you can read), and after it, the
 * orders decrypted, letter by letter the first time you see them.
 */
function CodedOrders({ war, leagueId, week, userId, locked, hideSeen = false }: { war: War; leagueId: string; week: number; userId: string; locked: boolean; hideSeen?: boolean }) {
  const { data: sealed = [] } = useQuery({
    queryKey: ['conquest-sealed', leagueId, week],
    enabled: !locked,
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('conquest_sealed_orders', { p_league: leagueId })
      if (error) throw error
      return (data ?? []) as string[]
    },
  })
  const seenKey = `gu-conquest-decrypted-${leagueId}-${CURRENT_SEASON}-${week}`
  const [animate] = useState(() => {
    if (!locked) return false
    try {
      if (localStorage.getItem(seenKey)) return false
      localStorage.setItem(seenKey, '1')
    } catch { /* fine: it plays again */ }
    return true
  })
  const nameOf = (id: string) => war.players.find(p => p.userId === id)?.name ?? 'Someone'
  const colorOf = (id: string) => war.players.find(p => p.userId === id)?.color ?? '#666'
  const orders = war.orders ?? {}
  const dug = war.fortified ?? []
  const waits = war.ambushes ?? {}
  const mineSealed = orders[userId] || dug.includes(userId) || war.tributes?.[userId] || waits[userId] || war.seconds?.[userId]
  const ids = locked ? [...new Set([...Object.keys(orders), ...dug, ...Object.keys(waits)])] : [...new Set([...sealed, ...(mineSealed ? [userId] : [])])]
  const rows = ids
    .sort((a, b) => Number(b === userId) - Number(a === userId) || nameOf(a).localeCompare(nameOf(b)))
    .map(id => ({
      key: id,
      name: nameOf(id),
      color: colorOf(id),
      // Yours you can always read
      target: !(locked || id === userId) ? null : orders[id] ? nameOf(orders[id]) : dug.includes(id) ? '🛡 Dug in' : waits[id] ? `🪤 Ambush: ${nameOf(waits[id])}` : null,
      code: cipherOf(`${leagueId}|${week}|${id}`),
    }))
  const empires = war.players.filter(p => citiesOf(war.owners, p.userId).length).length
  if (hideSeen && locked && !animate) return null
  if (!rows.length) return null
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 mb-2">
        {locked ? <span aria-hidden>🔓</span> : <Lock className="w-3.5 h-3.5 text-[#3fd0ff]" />}
        <p className="font-cond font-bold text-sm uppercase tracking-wider text-white">{locked ? 'Orders decrypted' : 'Sealed orders'}</p>
        <span className="ml-auto text-[11px] text-field-500">{rows.length} of {empires} empires</span>
      </div>
      <CipherOrders rows={rows} animate={animate} />
      <p className="mt-2 text-[11px] text-field-500">
        {locked
          ? 'Everyone else attacks automatically: the neighbor they picked most differently from.'
          : 'Attack orders stay in code until the week’s first kickoff. Yours you can read.'}
      </p>
    </div>
  )
}
