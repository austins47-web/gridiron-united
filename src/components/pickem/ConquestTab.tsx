import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Swords, Loader2, ChevronDown, Crosshair, Crown, Lock, Flag } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { CURRENT_SEASON } from '@/lib/season'
import { CITY, ADJ, TERRITORIES, citiesOf, neighborsOf } from '../../../supabase/functions/_shared/conquest.ts'
import { ConquestMap } from '@/components/conquest/ConquestMap'
import { empires, liveBattles, headline, contested, titles, type ConquestData, type ConquestMove, type ConquestPlayer, type Title } from '@/components/conquest/conquestView'

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
        supabase.from('conquest_players').select('user_id, color, capital').eq('league_id', leagueId).eq('season', CURRENT_SEASON),
        supabase.from('conquest_territories').select('team, owner_id, besieged_by').eq('league_id', leagueId).eq('season', CURRENT_SEASON),
        supabase.from('conquest_moves').select('week, kind, team, from_user, to_user, score_for, score_against, exiled')
          .eq('league_id', leagueId).eq('season', CURRENT_SEASON).order('week', { ascending: false }).order('id'),
        supabase.from('nfl_games').select('game_date').eq('season', CURRENT_SEASON).eq('week', battleWeek).order('game_date').limit(1).maybeSingle(),
        supabase.from('conquest_orders').select('user_id, target_id, claim').eq('league_id', leagueId).eq('season', CURRENT_SEASON).eq('week', battleWeek),
      ])
      const log = (moves ?? []).map((m: any) => ({
        week: m.week, kind: m.kind, team: m.team, from: m.from_user, to: m.to_user,
        score: [Number(m.score_for), Number(m.score_against)] as [number, number], exiled: m.exiled,
      }))
      return {
        startWeek: war.start_week,
        lastWeek: war.last_resolved_week,
        // Names go on when it's drawn: the member list may still be loading now
        players: (players ?? []).map((p: any): ConquestPlayer => ({ userId: p.user_id, color: p.color, capital: p.capital, name: '' })),
        owners: Object.fromEntries((cities ?? []).map((c: any) => [c.team, c.owner_id])),
        besieged: Object.fromEntries((cities ?? []).filter((c: any) => c.besieged_by).map((c: any) => [c.team, c.besieged_by])),
        report: null,
        finalWeek: war.final_week,
        lockAt: first?.game_date ?? null,
        orders: Object.fromEntries((orders ?? []).filter((o: any) => o.target_id).map((o: any) => [o.user_id, o.target_id])),
        claims: Object.fromEntries((orders ?? []).filter((o: any) => o.claim).map((o: any) => [o.user_id, o.claim])),
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
    const { error } = await supabase.functions.invoke('conquest', { body: { action: 'start', league_id: leagueId } })
    setStarting(false)
    if (error) {
      const msg = await (error as any)?.context?.json?.().then((b: any) => b?.error).catch(() => null)
      toast.error(msg ?? 'Couldn’t start the war')
      return
    }
    toast.success('The war is on. Capitals are handed out.')
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
      <li key={b.attacker} className={clsx('flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm', (b.attacker === userId || b.defender === userId) ? 'bg-gold/10 border border-gold/30' : 'bg-field-800/60')}>
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorOf(b.attacker) }} />
        <span className="font-bold text-white truncate">{nameOf(b.attacker)}</span>
        {b.ordered ? <span title="Chose this attack" className="shrink-0">🎯</span> : <Swords className="w-3.5 h-3.5 text-field-500 shrink-0" />}
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorOf(b.defender) }} />
        <span className="font-bold text-white truncate">{nameOf(b.defender)}</span>
        <span className={clsx('ml-auto shrink-0 font-cond font-black tabular-nums', ahead ? 'text-nfl' : 'text-field-300')}>{b.score[0]}–{b.score[1]}</span>
        <span className="shrink-0 text-[11px] text-field-400 w-[7.5rem] text-right">
          {b.outcome === 'take' ? `takes ${city}` : b.outcome === 'siege' ? `🔥 besieges ${city}` : 'holds'}
        </span>
      </li>
    )
  }

  return (
    <div className="space-y-3">
      <div className="panel p-4">
        <div className="flex items-center gap-2 mb-1">
          <Swords className="w-4 h-4 text-gold" />
          <p className="font-cond font-black uppercase text-white tracking-wide">
            Conquest · {started ? `Week ${Math.min(week, battleWeek ?? week)}` : `starts Week ${data.startWeek}`}
          </p>
          <button onClick={() => setRules(r => !r)} className="ml-auto flex items-center gap-1 text-xs font-bold text-field-400 hover:text-white">
            How it works <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', rules && 'rotate-180')} />
          </button>
        </div>
        {rules && (
          <ul className="text-xs text-field-300 space-y-1 mt-2 mb-3 list-disc pl-4">
            <li>Each week your empire attacks one neighbor: the one you choose below (before the week’s first kickoff), or else the one you picked most differently from. Everyone’s choices come out at kickoff.</li>
            <li>Beat their score for the week and take one of their cities on your border. Ties go to the defender.</li>
            <li>A capital (★) doesn’t fall the first time: it goes under siege 🔥. Lose again while besieged and it falls; a week nobody beats you and the siege lifts.</li>
            <li>The top half of the week each plant a flag in an open city next to them: the one you choose below, or else automatic. Best scores claim first; if yours is gone, you get your next open city.</li>
            <li>Level scores are settled like Pick’Em: the closer tiebreaker guess, then the better season win %. A battle that ends level still goes to the defender.</li>
            <li>Dotted lines on the map are sea lanes: the cities at each end border each other, like Risk.</li>
            <li>Lose everything and you’re in exile: outscore whoever holds your capital any week to take it back.</li>
            <li>Weeks settle once every game is final. After Week 18 the titles are crowned: Emperor (the biggest empire), Warlord, Siege Master, Unbreakable, Comeback Kid and Pioneer.</li>
            <li>Cities that would change hands if the week ended now pulse on the map.</li>
          </ul>
        )}
        {me && (
          <p className="text-sm text-field-300">
            {me.exiled
              ? <>You’re in exile. Outscore whoever holds <span className="font-bold text-white">{me.capital ? CITY[me.capital] : 'your capital'}</span> to take it back.</>
              : <>Your empire: <span className="font-bold text-white">{me.cities} {me.cities === 1 ? 'city' : 'cities'}</span>{me.capital ? <>, capital <span className="font-bold text-white">{CITY[me.capital]}</span></> : null}{me.besieged ? <span className="text-amber-300"> · under siege 🔥</span> : null}</>}
          </p>
        )}
        <div className="mt-3 -mx-1 overflow-x-auto rounded-xl">
          <ConquestMap owners={data.owners} besieged={data.besieged} players={data.players} you={userId} labels="names" layout="below" labelScale={1.5} contested={contested(data, battles)} className="w-full min-w-[620px] sm:min-w-0 h-auto" />
        </div>
      </div>

      {userId && battleWeek != null && battleWeek <= (data.finalWeek ?? 18) && week === battleWeek && (
        <OrdersCard leagueId={leagueId} war={data} userId={userId} week={battleWeek} onSaved={() => qc.invalidateQueries({ queryKey: key })} />
      )}

      {started && week === battleWeek && battleWeek <= (data.finalWeek ?? 18) && (
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
      )}

      <TitleRace war={data} userId={userId} />

      <div className="panel p-4">
        <p className="font-cond font-bold text-sm uppercase tracking-wider text-white mb-2">Empires</p>
        <ul className="space-y-1">
          {ranks.map((e, i) => (
            <li key={e.userId} className={clsx('flex items-center gap-2 text-sm rounded-md px-2 py-1', e.userId === userId && 'bg-gold/10')}>
              <span className="w-5 text-right font-cond font-black text-field-500 tabular-nums">{e.exiled ? '–' : i + 1}</span>
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: e.color }} />
              <span className={clsx('truncate font-bold', e.exiled ? 'text-field-500' : 'text-white')}>{e.name}</span>
              {e.besieged && <span title="Capital under siege">🔥</span>}
              <span className="ml-auto shrink-0 text-field-300 tabular-nums">
                {e.exiled ? 'in exile' : `${e.cities} ${e.cities === 1 ? 'city' : 'cities'}`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {logWeeks.length > 0 && (
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
                      <span className="min-w-0">{h.text}{m.kind !== 'relief' && <span className="text-field-500"> · {m.score[0]}–{m.score[1]}</span>}</span>
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
      )}
    </div>
  )
}

type War = ConquestData & { log: (ConquestMove & { week: number })[] }

/**
 * Your orders for the week, both optional: the attack (any empire on your
 * border; automatic is the one you pick most differently from) and the
 * flag (the open city you'd claim with a top-half week; automatic is the
 * one touching most of your cities). Locks at the week's first kickoff,
 * when everyone's choices come out.
 */
function OrdersCard({ leagueId, war, userId, week, onSaved }: { leagueId: string; war: War; userId: string; week: number; onSaved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const mine = citiesOf(war.owners, userId)
  if (!mine.length) return null
  const lockAt = war.lockAt ? new Date(war.lockAt) : null
  const locked = !!lockAt && Date.now() >= lockAt.getTime()
  const target = war.orders?.[userId] ?? null
  const player = (id: string) => war.players.find(p => p.userId === id)
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
  const attack = (id: string | null) => send(`atk:${id ?? 'auto'}`, { action: 'target', target: id },
    id ? `You’re attacking ${player(id)?.name ?? 'them'} this week` : 'Attack back to automatic')
  const flag = (team: string | null) => send(`flag:${team ?? 'auto'}`, { action: 'claim', team },
    team ? `Your flag goes to ${CITY[team] ?? team} if you finish in the top half` : 'Flag back to automatic')

  const row = (on: boolean) => clsx('w-full flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm text-left', on ? 'border-gold bg-gold/10' : 'border-field-700 bg-field-800/60 hover:border-field-500')
  const spin = <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
  const lockLabel = lockAt?.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
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
            <Swords className="inline w-3.5 h-3.5 mr-1 text-field-400" />
            {target ? <>Attacking <span className="font-bold text-white">{player(target)?.name ?? 'Someone'}</span> (your choice).</> : 'Attack: automatic, the neighbor you pick most differently from.'}
          </p>
          {open.length > 0 && (
            <p>
              <Flag className="inline w-3.5 h-3.5 mr-1 text-field-400" />
              Flag: <span className="font-bold text-white">{CITY[claim ?? autoClaim!]}</span>{claim ? ' (your choice)' : ' (automatic)'}, if you finish in the top half.
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-field-400 mb-3">Both are optional, and nobody sees your choices until kickoff.</p>

          <p className="text-[11px] font-bold uppercase tracking-wider text-field-400 mb-1.5">Attack</p>
          <div className="space-y-1.5">
            <button onClick={() => attack(null)} disabled={!!busy} className={row(!target)}>
              {busy === 'atk:auto' ? spin : <Swords className="w-3.5 h-3.5 text-field-400 shrink-0" />}
              <span className="font-bold text-white">Automatic</span>
              <span className="text-[11px] text-field-500 truncate">the neighbor you pick most differently from</span>
            </button>
            {neighbors.map(n => (
              <button key={n.id} onClick={() => attack(n.id)} disabled={!!busy} className={row(target === n.id)}>
                {busy === `atk:${n.id}` ? spin : <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: n.color }} />}
                <span className="font-bold text-white truncate">{n.name}</span>
                {n.weak && <span className="shrink-0 text-[11px] font-bold text-amber-300">🔥 capital under siege</span>}
                <span className="ml-auto shrink-0 text-[11px] text-field-400">
                  {n.cities} {n.cities === 1 ? 'city' : 'cities'} · via {n.via.map(t => CITY[t] ?? t).join(', ')}
                </span>
              </button>
            ))}
          </div>

          {open.length > 0 && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wider text-field-400 mt-4 mb-1">Flag</p>
              <p className="text-[11px] text-field-500 mb-1.5">Planted only with a top-half week. Better weeks claim first; if yours is gone, you get your next open city.</p>
              <div className="space-y-1.5">
                <button onClick={() => flag(null)} disabled={!!busy} className={row(!claim)}>
                  {busy === 'flag:auto' ? spin : <Flag className="w-3.5 h-3.5 text-field-400 shrink-0" />}
                  <span className="font-bold text-white">Automatic</span>
                  <span className="text-[11px] text-field-500 truncate">{CITY[autoClaim!]}</span>
                </button>
                {open.map(o => (
                  <button key={o.team} onClick={() => flag(o.team)} disabled={!!busy} className={row(claim === o.team)}>
                    {busy === `flag:${o.team}` ? spin : <Flag className="w-3.5 h-3.5 text-gold shrink-0" />}
                    <span className="font-bold text-white truncate">{CITY[o.team] ?? o.team}</span>
                    <span className={clsx('ml-auto shrink-0 text-[11px]', o.rivals.length ? 'text-field-400' : 'font-bold text-nfl')}>
                      {o.rivals.length === 0 ? 'only you can reach it'
                        : o.rivals.length <= 2 ? `also reachable by ${o.rivals.map(id => player(id)?.name ?? 'Someone').join(' & ')}`
                        : `${o.rivals.length} others can reach it`}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

/** The season's titles: the race as it stands, or the crowned ones once the war's over. */
function TitleRace({ war, userId }: { war: War; userId: string | undefined }) {
  const list = war.crowned ?? titles(war.log, war.owners, war.players.map(p => p.userId))
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
            <li key={t.key} className={clsx('flex items-center gap-2 text-sm rounded-md px-2 py-1', !!userId && t.holders.includes(userId) && 'bg-gold/10')}>
              <span className="w-6 text-center">{t.icon}</span>
              <span className="font-bold text-white w-28 shrink-0">{t.label}</span>
              {tied ? (
                <span className="text-field-400 truncate">
                  {t.holders.length <= 3 ? `${t.holders.map(id => player(id)?.name ?? 'Someone').join(' & ')}, tied` : `${t.holders.length}-way tie`}
                </span>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: player(t.holders[0])?.color ?? '#666' }} />
                  <span className="font-bold text-field-200 truncate">{player(t.holders[0])?.name ?? 'Someone'}</span>
                </>
              )}
              <span className="ml-auto shrink-0 text-[11px] text-field-400">{t.value} · {t.blurb}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
