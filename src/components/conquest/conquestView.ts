// What the app and the Shop TV show of Conquest (the rules themselves:
// supabase/functions/_shared/conquest.ts): the empires, this week's
// battles as they stand, and the war log's headlines.
import type { CSSProperties } from 'react'
import {
  CITY, citiesOf, plannedBattles, ADJ, patternOf, cutOff, marginNeeded,
  weekMedals, type Medal,
  type ConquestState, type WeekScores, type MoveKind, type Orders, type Claims, type Title,
} from '../../../supabase/functions/_shared/conquest.ts'

export { titles, type Title } from '../../../supabase/functions/_shared/conquest.ts'

/** An empire's color swatch, with the same stripes or dots its land has on the map. */
export function swatch(color: string): CSSProperties {
  const p = patternOf(color)
  if (p === 'stripes') return { backgroundColor: color, backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.38) 0 1.5px, transparent 1.5px 4px)' }
  if (p === 'dots') return { backgroundColor: color, backgroundImage: 'radial-gradient(rgba(0,0,0,0.42) 0.9px, transparent 1.2px)', backgroundSize: '3.5px 3.5px' }
  return { background: color }
}

export interface ConquestPlayer {
  userId: string; color: string; capital: string | null; name: string; avatarUrl?: string | null
  /** cities held, added up every settled week (Emperor's tiebreak) */
  cityWeeks?: number
}

export interface ConquestMove {
  kind: MoveKind
  team: string
  from: string | null
  to: string
  score: [number, number]
  exiled?: boolean
  /** the other city in it: a tribute's, the capital it freed; a trade's, the city that went the other way; an outpost's, its name */
  withTeam?: string | null
  /** how a city was won: an ambush sprung, a second front, or cut off from its capital */
  tactic?: 'ambush' | 'second' | 'cut' | null
}

/** An outpost abroad (one a city; the latest game played there): who holds it, if anyone, since `week` */
export interface Outpost { key: string; name: string; week: number; owner: string | null; gameId: string }

/**
 * The outposts as they stood after a week (the history slider, a replay): each
 * one's holder then, from the war log's outpost moves (an outpost changes hands
 * when the NFL goes back to its city). One nobody's ever won shows from its week.
 */
export function outpostsAt(outposts: Outpost[], log: (ConquestMove & { week: number })[], week: number): Outpost[] {
  return outposts.flatMap(o => {
    const moves = log.filter(m => m.kind === 'outpost' && m.team === o.key && m.week <= week).sort((a, b) => a.week - b.week)
    if (moves.length) return [{ ...o, owner: moves[moves.length - 1].to, week: moves[moves.length - 1].week }]
    return !o.owner && o.week <= week ? [o] : []
  })
}

/** The war as the TV gets it (shop-tv) and the app reads it. */
export interface ConquestData {
  startWeek: number
  lastWeek: number | null
  players: ConquestPlayer[]
  owners: Record<string, string | null>
  besieged: Record<string, string>
  report: { week: number; moves: ConquestMove[] } | null
  /** The war's last week (18, the regular season's) */
  finalWeek?: number
  /** When this week's attacks lock (its first kickoff) */
  lockAt?: string | null
  /** This week's attack orders, attacker → target (public once they lock) */
  orders?: Orders
  /** Before they lock: who's sealed an attack order (not on whom) */
  sealed?: string[]
  /** How the league has its map drawn (the TV's, and phones' until they pick): radar, parchment or the war room */
  mapLook?: 'radar' | 'parchment' | 'warroom'
  /** This week's flag orders, player → the open city they'd claim (yours, and everyone's once they lock) */
  claims?: Claims
  /** Who's dug in this week (yours, and everyone's once orders lock) */
  fortified?: string[]
  /** Tribute this week: player → the city they hand their besieger (yours, and everyone's once orders lock) */
  tributes?: Record<string, string>
  /** Ambushes this week: player → the empire they're lying in wait for (yours, and everyone's once orders lock) */
  ambushes?: Record<string, string>
  /** Second fronts this week: player → its target, when they chose one (yours, and everyone's once orders lock) */
  seconds?: Record<string, string>
  /** The outposts won abroad so far (each counts as a city) */
  outposts?: Outpost[]
  /** The season's titles, once the war's over */
  crowned?: Title[] | null
}

export interface Empire {
  userId: string
  name: string
  color: string
  cities: number
  capital: string | null
  /** their capital is under siege */
  besieged: boolean
  exiled: boolean
}

/** Every player, biggest empire first (the exiled last). */
export function empires(war: Pick<ConquestData, 'owners' | 'besieged' | 'players' | 'outposts'>): Empire[] {
  return war.players
    .map(p => {
      const land = citiesOf(war.owners, p.userId).length
      // An outpost counts as a city; exile is about the map (no city on it)
      const cities = land + (war.outposts ?? []).filter(o => o.owner === p.userId).length
      return {
        userId: p.userId, name: p.name, color: p.color, cities, capital: p.capital,
        besieged: !!p.capital && war.owners[p.capital] === p.userId && !!war.besieged[p.capital],
        exiled: land === 0,
      }
    })
    .sort((a, b) => b.cities - a.cities || Number(a.besieged) - Number(b.besieged) || a.name.localeCompare(b.name))
}

export interface LiveBattle {
  attacker: string
  defender: string
  /** the attacker chose this one (an order), rather than the automatic pick */
  ordered?: boolean
  score: [number, number]
  /** the city that changes hands if it ends like this (null: nothing to take) */
  city: string | null
  /** ending like this: the attacker takes it, puts it under siege, or the defender holds */
  outcome: 'take' | 'siege' | 'hold'
  /** a second front, or an ambush sprung */
  tactic?: 'second' | 'ambush'
  /** won one point short: the city's cut off from its capital */
  cut?: boolean
}

/**
 * This week's battles as they stand: who's attacking whom (from the
 * picks so far) and what happens if it ends like this. A city wanted
 * twice goes to the bigger win, as when the week's settled.
 */
export function liveBattles(war: Pick<ConquestData, 'owners' | 'besieged' | 'players' | 'orders' | 'fortified' | 'tributes' | 'ambushes' | 'seconds'>, week: WeekScores): LiveBattle[] {
  const capitals = Object.fromEntries(war.players.filter(p => p.capital).map(p => [p.userId, p.capital!]))
  // Tribute's paid before the battles: the week's fought on that map
  const owners = { ...war.owners }, besieged = { ...war.besieged }
  for (const [p, t] of Object.entries(war.tributes ?? {})) {
    const cap = capitals[p], by = cap ? besieged[cap] : undefined
    if (!cap || !by || t === cap || owners[cap] !== p || owners[t] !== p) continue
    owners[t] = by
    delete besieged[cap]
  }
  const fortified = new Set(war.fortified ?? [])
  const state: ConquestState = { owners, capitals, besieged }
  const players = war.players.map(p => p.userId)
  const battles = plannedBattles(state, week, players, war.orders ?? {}, { fortified: [...fortified], ambushes: war.ambushes, seconds: war.seconds })
  const cut = cutOff(owners, capitals)
  const taken = new Set<string>()
  const order = [...battles].sort((a, b) => (b.score[0] - b.score[1]) - (a.score[0] - a.score[1]))
  const out = new Map<(typeof battles)[number], LiveBattle>()
  for (const b of order) {
    const margin = b.score[0] - b.score[1], need = marginNeeded(b, fortified)
    const mine = new Set(citiesOf(owners, b.attacker))
    const bordering = (t: string) => ADJ[t].filter(n => mine.has(n)).length
    const options = citiesOf(owners, b.defender)
      .filter(t => !taken.has(t) && bordering(t) > 0)
      .sort((x, y) => Number(x === capitals[b.defender]) - Number(y === capitals[b.defender]) || bordering(y) - bordering(x) || x.localeCompare(y))
    // A win takes the city at stake; one point short, only a city cut off from its capital
    const reach = margin >= need ? options : margin === need - 1 ? options.filter(t => cut.has(t)) : []
    const city = reach[0] ?? options[0] ?? null
    const winning = reach.length > 0
    if (winning && city) taken.add(city)
    const outcome: LiveBattle['outcome'] = !winning || !city ? 'hold'
      : city === capitals[b.defender] && !besieged[city] ? 'siege' : 'take'
    out.set(b, {
      attacker: b.attacker, defender: b.defender, ordered: b.ordered, score: b.score, city, outcome,
      ...(b.tactic ? { tactic: b.tactic } : {}), ...(winning && margin < need ? { cut: true } : {}),
    })
  }
  return battles.map(b => out.get(b)!)
}

/** A war log line: "Chud.M seizes Miami from Caleb". */
export function headline(m: ConquestMove, nameOf: (id: string | null) => string): { icon: string; text: string } {
  const city = CITY[m.team] ?? m.team
  switch (m.kind) {
    case 'capture':
      return {
        icon: m.tactic === 'ambush' ? '🪤' : '⚔️',
        text: (m.tactic === 'ambush' ? `${nameOf(m.to)} springs an ambush and seizes ${city} from ${nameOf(m.from)}`
          : m.tactic === 'second' ? `${nameOf(m.to)} opens a second front and seizes ${city} from ${nameOf(m.from)}`
          : m.tactic === 'cut' ? `${nameOf(m.to)} seizes ${city}, cut off from ${nameOf(m.from)}'s capital`
          : `${nameOf(m.to)} seizes ${city} from ${nameOf(m.from)}`)
          + (m.exiled ? `, driving ${nameOf(m.from)} into exile` : ''),
      }
    case 'siege':
      return {
        icon: m.tactic === 'ambush' ? '🪤' : '🔥',
        text: `${nameOf(m.to)} ${m.tactic === 'ambush' ? 'springs an ambush and lays' : m.tactic === 'second' ? 'opens a second front and lays' : 'lays'} siege to ${nameOf(m.from)}'s capital, ${city}`,
      }
    case 'relief':
      return { icon: '🛡️', text: `${city} holds: the siege on ${nameOf(m.to)}'s capital is broken` }
    case 'rebellion':
      return { icon: '✊', text: `${nameOf(m.to)} rises up and retakes ${city}${m.from ? ` from ${nameOf(m.from)}` : ''}` }
    case 'claim':
      return { icon: '🚩', text: `${nameOf(m.to)} plants a flag in ${city}` }
    case 'tribute':
      return { icon: '🪙', text: `${nameOf(m.from)} pays tribute: ${city} goes to ${nameOf(m.to)}${m.withTeam ? `, and the siege of ${CITY[m.withTeam] ?? m.withTeam} lifts` : ''}` }
    case 'trade':
      return { icon: '🤝', text: `${nameOf(m.from)} trades ${city} to ${nameOf(m.to)}${m.withTeam ? ` for ${CITY[m.withTeam] ?? m.withTeam}` : ''}` }
    case 'outpost':
      return { icon: '🏝️', text: m.from ? `${nameOf(m.to)} takes the ${m.withTeam ?? m.team} outpost from ${nameOf(m.from)}` : `${nameOf(m.to)} wins the ${m.withTeam ?? m.team} outpost, overseas` }
  }
}

/** Who owned what before a week's moves (the moves undone, last first). */
export function ownersBefore(owners: Record<string, string | null>, moves: ConquestMove[]): Record<string, string | null> {
  const before = { ...owners }
  for (const m of [...moves].reverse()) if (changesHands(m)) before[m.team] = m.from
  return before
}

/** A move in the war log, with the week it was made */
export type LoggedMove = ConquestMove & { week: number }

/** A move that hands a city to someone else: taken, claimed, retaken, paid in tribute or traded */
export const changesHands = (m: Pick<ConquestMove, 'kind'>) =>
  m.kind === 'capture' || m.kind === 'claim' || m.kind === 'rebellion' || m.kind === 'tribute' || m.kind === 'trade'

/** The log oldest first: week by week, and within a week in the order the moves were made */
export function chronological(log: LoggedMove[]): LoggedMove[] {
  const weeks = [...new Set(log.map(m => m.week))].sort((a, b) => a - b)
  return weeks.flatMap(w => log.filter(m => m.week === w))
}

/**
 * The map as it stood after a week (the week before the war's first: the
 * opening map): who owned what, with the moves since undone (latest
 * first), and which capitals were under siege, played forward to then.
 */
export function mapAfter(owners: Record<string, string | null>, log: LoggedMove[], week: number): { owners: Record<string, string | null>; besieged: Record<string, string> } {
  const then = { ...owners }
  const later = chronological(log).filter(m => m.week > week)
  for (let i = later.length - 1; i >= 0; i--) if (changesHands(later[i])) then[later[i].team] = later[i].from
  return { owners: then, besieged: siegesAfter(chronological(log).filter(m => m.week <= week)) }
}

/** The capitals under siege after some moves (oldest first): laid by a siege, over at a relief or a fall. */
export function siegesAfter(moves: ConquestMove[], from: Record<string, string> = {}): Record<string, string> {
  const besieged = { ...from }
  for (const m of moves) {
    if (m.kind === 'siege') besieged[m.team] = m.to
    else if (m.kind === 'relief' || changesHands(m)) delete besieged[m.team]
    // Tribute lifts the siege on the payer's capital
    if (m.kind === 'tribute' && m.withTeam) delete besieged[m.withTeam]
  }
  return besieged
}

/** Who owned a city after some moves (oldest first). */
export function ownersAfter(owners: Record<string, string | null>, moves: ConquestMove[]): Record<string, string | null> {
  const after = { ...owners }
  for (const m of moves) if (changesHands(m)) after[m.team] = m.to
  return after
}

export interface CityStory {
  /** everyone who's held it, oldest first, and the week they took it (null: since the war began) */
  holders: { userId: string | null; since: number | null }[]
  /** everything that happened there, oldest first */
  events: LoggedMove[]
}

/** A city's story from the war log: who's held it, and what happened there. */
export function cityStory(owners: Record<string, string | null>, log: LoggedMove[], team: string): CityStory {
  const events = chronological(log).filter(m => m.team === team)
  const changes = events.filter(changesHands)
  const holders: CityStory['holders'] = [{ userId: changes.length ? changes[0].from : owners[team] ?? null, since: null }]
  for (const m of changes) holders.push({ userId: m.to, since: m.week })
  return { holders, events }
}

/** Each player's capital, from the war's players (for weekMedals) */
export const capitalsOf = (players: { userId: string; capital: string | null }[]): Record<string, string> =>
  Object.fromEntries(players.filter(p => p.capital).map(p => [p.userId, p.capital!]))

/** Everyone's medals over the season, from the war log (weekMedals, week by week). */
export function seasonMedals(log: (ConquestMove & { week: number })[], capitals: Record<string, string> = {}): Map<string, (Medal & { week: number })[]> {
  const out = new Map<string, (Medal & { week: number })[]>()
  for (const week of [...new Set(log.map(m => m.week))].sort((a, b) => a - b)) {
    for (const medal of weekMedals(log.filter(m => m.week === week), capitals)) {
      out.set(medal.to, [...(out.get(medal.to) ?? []), { ...medal, week }])
    }
  }
  return out
}
