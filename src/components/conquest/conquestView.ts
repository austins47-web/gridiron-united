// What the app and the Shop TV show of Conquest (the rules themselves:
// supabase/functions/_shared/conquest.ts): the empires, this week's
// battles as they stand, and the war log's headlines.
import type { CSSProperties } from 'react'
import {
  CITY, citiesOf, plannedBattles, ADJ, patternOf,
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

export interface ConquestPlayer { userId: string; color: string; capital: string | null; name: string; avatarUrl?: string | null }

export interface ConquestMove {
  kind: MoveKind
  team: string
  from: string | null
  to: string
  score: [number, number]
  exiled?: boolean
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
  /** This week's flag orders, player → the open city they'd claim (yours, and everyone's once they lock) */
  claims?: Claims
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
export function empires(war: Pick<ConquestData, 'owners' | 'besieged' | 'players'>): Empire[] {
  return war.players
    .map(p => {
      const cities = citiesOf(war.owners, p.userId).length
      return {
        userId: p.userId, name: p.name, color: p.color, cities, capital: p.capital,
        besieged: !!p.capital && war.owners[p.capital] === p.userId && !!war.besieged[p.capital],
        exiled: cities === 0,
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
}

/**
 * This week's battles as they stand: who's attacking whom (from the
 * picks so far) and what happens if it ends like this. A city wanted
 * twice goes to the bigger win, as when the week's settled.
 */
export function liveBattles(war: Pick<ConquestData, 'owners' | 'besieged' | 'players' | 'orders'>, week: WeekScores): LiveBattle[] {
  const capitals = Object.fromEntries(war.players.filter(p => p.capital).map(p => [p.userId, p.capital!]))
  const state: ConquestState = { owners: war.owners, capitals, besieged: war.besieged }
  const players = war.players.map(p => p.userId)
  const battles = plannedBattles(state, week, players, war.orders ?? {})
  const taken = new Set<string>()
  const order = [...battles].sort((a, b) => (b.score[0] - b.score[1]) - (a.score[0] - a.score[1]))
  const out = new Map<string, LiveBattle>()
  for (const b of order) {
    const winning = b.score[0] > b.score[1]
    const mine = new Set(citiesOf(war.owners, b.attacker))
    const bordering = (t: string) => ADJ[t].filter(n => mine.has(n)).length
    const options = citiesOf(war.owners, b.defender)
      .filter(t => !taken.has(t) && bordering(t) > 0)
      .sort((x, y) => Number(x === capitals[b.defender]) - Number(y === capitals[b.defender]) || bordering(y) - bordering(x) || x.localeCompare(y))
    const city = options[0] ?? null
    if (winning && city) taken.add(city)
    const outcome: LiveBattle['outcome'] = !winning || !city ? 'hold'
      : city === capitals[b.defender] && !war.besieged[city] ? 'siege' : 'take'
    out.set(b.attacker, { attacker: b.attacker, defender: b.defender, ordered: b.ordered, score: b.score, city, outcome })
  }
  return battles.map(b => out.get(b.attacker)!)
}

/** A war log line: "Chud.M seizes Miami from Caleb". */
export function headline(m: ConquestMove, nameOf: (id: string | null) => string): { icon: string; text: string } {
  const city = CITY[m.team] ?? m.team
  switch (m.kind) {
    case 'capture':
      return { icon: '⚔️', text: `${nameOf(m.to)} seizes ${city} from ${nameOf(m.from)}${m.exiled ? `, driving ${nameOf(m.from)} into exile` : ''}` }
    case 'siege':
      return { icon: '🔥', text: `${nameOf(m.to)} lays siege to ${nameOf(m.from)}'s capital, ${city}` }
    case 'relief':
      return { icon: '🛡️', text: `${city} holds: the siege on ${nameOf(m.to)}'s capital is broken` }
    case 'rebellion':
      return { icon: '✊', text: `${nameOf(m.to)} rises up and retakes ${city}${m.from ? ` from ${nameOf(m.from)}` : ''}` }
    case 'claim':
      return { icon: '🚩', text: `${nameOf(m.to)} plants a flag in ${city}` }
  }
}

/** Who owned what before a week's moves (the moves undone, last first). */
export function ownersBefore(owners: Record<string, string | null>, moves: ConquestMove[]): Record<string, string | null> {
  const before = { ...owners }
  for (const m of [...moves].reverse()) {
    if (m.kind === 'capture' || m.kind === 'claim' || m.kind === 'rebellion') before[m.team] = m.from
  }
  return before
}

/** A move in the war log, with the week it was made */
export type LoggedMove = ConquestMove & { week: number }

const changesHands = (m: ConquestMove) => m.kind === 'capture' || m.kind === 'claim' || m.kind === 'rebellion'

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
