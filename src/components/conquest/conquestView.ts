// What the app and the Shop TV show of Conquest (the rules themselves:
// supabase/functions/_shared/conquest.ts): the empires, this week's
// battles as they stand, and the war log's headlines.
import {
  CITY, citiesOf, plannedBattles, ADJ,
  type ConquestState, type WeekScores, type MoveKind,
} from '../../../supabase/functions/_shared/conquest.ts'

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
export function liveBattles(war: Pick<ConquestData, 'owners' | 'besieged' | 'players'>, week: WeekScores): LiveBattle[] {
  const capitals = Object.fromEntries(war.players.filter(p => p.capital).map(p => [p.userId, p.capital!]))
  const state: ConquestState = { owners: war.owners, capitals, besieged: war.besieged }
  const players = war.players.map(p => p.userId)
  const battles = plannedBattles(state, week, players)
  const taken = new Set<string>()
  const order = [...battles].sort((a, b) => (b.score[0] - b.score[1]) - (a.score[0] - a.score[1]))
  const out = new Map<string, LiveBattle>()
  for (const b of order) {
    const winning = b.score[0] > b.score[1]
    const mine = new Set(citiesOf(war.owners, b.attacker))
    const options = citiesOf(war.owners, b.defender)
      .filter(t => !taken.has(t) && ADJ[t].some(n => mine.has(n)))
      .sort((x, y) => Number(x === capitals[b.defender]) - Number(y === capitals[b.defender]) || x.localeCompare(y))
    const city = options[0] ?? null
    if (winning && city) taken.add(city)
    const outcome: LiveBattle['outcome'] = !winning || !city ? 'hold'
      : city === capitals[b.defender] && !war.besieged[city] ? 'siege' : 'take'
    out.set(b.attacker, { attacker: b.attacker, defender: b.defender, score: b.score, city, outcome })
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
