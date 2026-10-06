// ══════════════════════════════════════════════════════════════
// Conquest: the league as a war over a hex map of the 32 NFL cities.
// Shared by the conquest edge function (which settles each finished
// week) and the app and Shop TV (which show this week's battles live).
//
// The rules, all from the picks people already make:
// - Everyone starts with a capital. Each week every empire attacks one
//   neighbor: the one it picked most differently from that week. Beat
//   their week's score (ties go to the defender) and take one of their
//   cities along your border, an outlying city before their capital.
// - A capital doesn't fall at the first defeat: it goes under siege. The
//   next one to beat its owner while it's besieged takes it; a week with
//   nobody beating them and the siege lifts.
// - The top half of the week each grow into one unclaimed city next to
//   them, best score first.
// - Lose your last city and you're in exile: outscore whoever holds your
//   capital in any week to take it back (a rebellion).
// - A city changes hands at most once a week; everything is decided on
//   the map as it stood when the week began.
// ══════════════════════════════════════════════════════════════

/** Where each city sits: [column, row] on a pointy-top hex grid, odd rows shifted half a hex right. */
export const MAP: Record<string, [number, number]> = {
  SEA: [1, 2], SF: [0, 3], LAR: [0, 4], LAC: [1, 4], LV: [1, 3], ARI: [2, 4], DEN: [2, 3], KC: [3, 3],
  DAL: [4, 4], HOU: [3, 5], MIN: [4, 1], GB: [5, 1], CHI: [5, 2], DET: [6, 1], IND: [4, 3], CIN: [5, 3],
  CLE: [6, 2], PIT: [6, 3], BUF: [7, 1], TEN: [5, 4], ATL: [6, 4], NO: [4, 5], JAX: [6, 5], TB: [5, 5],
  MIA: [6, 6], CAR: [7, 4], WSH: [8, 4], BAL: [7, 3], PHI: [7, 2], NYG: [8, 2], NYJ: [8, 3], NE: [9, 2],
}

/** The city names, for headlines ("seizes Kansas City"). */
export const CITY: Record<string, string> = {
  SEA: 'Seattle', SF: 'San Francisco', LAR: 'Los Angeles', LAC: 'San Diego', LV: 'Las Vegas', ARI: 'Arizona',
  DEN: 'Denver', KC: 'Kansas City', DAL: 'Dallas', HOU: 'Houston', MIN: 'Minnesota', GB: 'Green Bay',
  CHI: 'Chicago', DET: 'Detroit', IND: 'Indianapolis', CIN: 'Cincinnati', CLE: 'Cleveland', PIT: 'Pittsburgh',
  BUF: 'Buffalo', TEN: 'Nashville', ATL: 'Atlanta', NO: 'New Orleans', JAX: 'Jacksonville', TB: 'Tampa Bay',
  MIA: 'Miami', CAR: 'Carolina', WSH: 'Washington', BAL: 'Baltimore', PHI: 'Philadelphia', NYG: 'New Jersey',
  NYJ: 'New York', NE: 'New England',
}

export const TERRITORIES = Object.keys(MAP).sort()

const around = (c: number, r: number): [number, number][] => (r % 2 === 0
  ? [[c - 1, r], [c + 1, r], [c - 1, r - 1], [c, r - 1], [c - 1, r + 1], [c, r + 1]]
  : [[c - 1, r], [c + 1, r], [c, r - 1], [c + 1, r - 1], [c, r + 1], [c + 1, r + 1]])

/** Each city's neighbors on the map. */
export const ADJ: Record<string, string[]> = (() => {
  const at = new Map(Object.entries(MAP).map(([t, [c, r]]) => [`${c},${r}`, t]))
  return Object.fromEntries(Object.entries(MAP).map(([t, [c, r]]) => [
    t, around(c, r).map(([a, b]) => at.get(`${a},${b}`)).filter((x): x is string => !!x).sort(),
  ]))
})()

/** A hex's center, in hex widths (rows are √3/2 apart). */
export function hexCenter(team: string): [number, number] {
  const [c, r] = MAP[team]
  return [c + (r % 2 ? 0.5 : 0), r * Math.sqrt(3) / 2]
}

/** How many steps apart two cities are on the map. */
export function hexDistance(a: string, b: string): number {
  if (a === b) return 0
  const seen = new Set([a])
  let frontier = [a], d = 0
  while (frontier.length) {
    d++
    const next: string[] = []
    for (const t of frontier) for (const n of ADJ[t]) {
      if (n === b) return d
      if (!seen.has(n)) { seen.add(n); next.push(n) }
    }
    frontier = next
  }
  return Infinity
}

export interface ConquestState {
  /** city → its owner's user id, or null while unclaimed */
  owners: Record<string, string | null>
  /** user id → their capital (their starting city) */
  capitals: Record<string, string>
  /** capital → who has it under siege (since last week) */
  besieged?: Record<string, string>
}

export interface WeekScores {
  /** user id → correct picks so far */
  correct: Record<string, number>
  /** user id → game id → the team they picked (only games that count, or that can be seen) */
  picks: Record<string, Record<string, string>>
}

export interface Battle {
  attacker: string
  defender: string
  /** games the two picked differently */
  disagree: number
  /** [attacker's correct, defender's correct] */
  score: [number, number]
}

export type MoveKind = 'capture' | 'siege' | 'relief' | 'claim' | 'rebellion'

export interface Move {
  kind: MoveKind
  team: string
  /** the loser (a siege's or relief's: the capital's owner) */
  from: string | null
  /** the winner (a siege's: the besieger; a relief's: the owner, who held) */
  to: string
  /** [the winner's correct, the loser's (or the week's median, for an unclaimed city)] */
  score: [number, number]
  /** the loser lost their last city */
  exiled?: boolean
}

export const citiesOf = (owners: Record<string, string | null>, user: string): string[] =>
  TERRITORIES.filter(t => owners[t] === user)

/** The owners of the cities bordering someone's empire. */
export function neighborsOf(owners: Record<string, string | null>, user: string): string[] {
  const out = new Set<string>()
  for (const t of citiesOf(owners, user)) for (const n of ADJ[t]) {
    const o = owners[n]
    if (o && o !== user) out.add(o)
  }
  return [...out].sort()
}

/** Games two people picked differently (both picked). */
export function disagreements(week: WeekScores, a: string, b: string): number {
  const pa = week.picks[a] ?? {}, pb = week.picks[b] ?? {}
  let n = 0
  for (const g of Object.keys(pa)) if (pb[g] && pb[g] !== pa[g]) n++
  return n
}

const correctOf = (week: WeekScores, u: string) => week.correct[u] ?? 0

function median(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * This week's battles: every empire against the neighbor it picked most
 * differently from (the bigger empire on a tie). None for an empire that
 * agreed with every neighbor on everything.
 */
export function plannedBattles(state: ConquestState, week: WeekScores, players: string[]): Battle[] {
  const out: Battle[] = []
  for (const a of [...players].sort()) {
    if (!citiesOf(state.owners, a).length) continue
    let best: { b: string; d: number; size: number } | null = null
    for (const b of neighborsOf(state.owners, a)) {
      const d = disagreements(week, a, b)
      const size = citiesOf(state.owners, b).length
      if (!best || d > best.d || (d === best.d && size > best.size)) best = { b, d, size }
    }
    if (best && best.d > 0) {
      out.push({ attacker: a, defender: best.b, disagree: best.d, score: [correctOf(week, a), correctOf(week, best.b)] })
    }
  }
  return out
}

/** Settles a week: the moves, who owns what after them, and which capitals are under siege. */
export function resolveWeek(
  state: ConquestState, week: WeekScores, players: string[],
): { moves: Move[]; owners: Record<string, string | null>; besieged: Record<string, string> } {
  const start = state.owners
  const owners: Record<string, string | null> = { ...start }
  const wasBesieged = state.besieged ?? {}
  const besieged: Record<string, string> = {}
  const beaten = new Set<string>()
  const changed = new Set<string>()
  const moves: Move[] = []
  const c = (u: string) => correctOf(week, u)
  const mid = median(players.map(c))
  const sorted = [...players].sort()

  // 1. Rebellions: the exiled retake their capital by outscoring its holder
  for (const p of sorted) {
    const cap = state.capitals[p]
    if (!cap || citiesOf(start, p).length) continue
    const holder = start[cap]
    if (holder === p || changed.has(cap)) continue
    const wins = holder ? c(p) > c(holder) : c(p) >= mid
    if (!wins) continue
    owners[cap] = p
    changed.add(cap)
    moves.push({ kind: 'rebellion', team: cap, from: holder ?? null, to: p, score: [c(p), holder ? c(holder) : mid] })
  }

  // 2. Battles, the biggest wins first
  const wins = plannedBattles(state, week, players)
    .filter(b => b.score[0] > b.score[1])
    .sort((x, y) => (y.score[0] - y.score[1]) - (x.score[0] - x.score[1]) || x.attacker.localeCompare(y.attacker))
  for (const b of wins) {
    beaten.add(b.defender)
    const mine = new Set(citiesOf(start, b.attacker))
    const bordering = (t: string) => ADJ[t].filter(n => mine.has(n)).length
    const options = citiesOf(start, b.defender)
      .filter(t => owners[t] === b.defender && !changed.has(t) && bordering(t) > 0)
      .sort((x, y) =>
        Number(x === state.capitals[b.defender]) - Number(y === state.capitals[b.defender])
        || bordering(y) - bordering(x)
        || x.localeCompare(y))
    const t = options[0]
    if (!t) continue
    changed.add(t)
    // A capital not already under siege goes under siege instead of falling
    if (t === state.capitals[b.defender] && !wasBesieged[t]) {
      besieged[t] = b.attacker
      moves.push({ kind: 'siege', team: t, from: b.defender, to: b.attacker, score: b.score })
      continue
    }
    owners[t] = b.attacker
    moves.push({
      kind: 'capture', team: t, from: b.defender, to: b.attacker, score: b.score,
      exiled: citiesOf(owners, b.defender).length === 0,
    })
  }

  // Sieges nobody pressed this week lift; ones that fell or changed hands are over
  for (const [t, by] of Object.entries(wasBesieged)) {
    const owner = start[t]
    if (!owner || owners[t] !== owner || besieged[t]) continue
    if (beaten.has(owner)) besieged[t] = by
    else moves.push({ kind: 'relief', team: t, from: owner, to: owner, score: [correctOf(week, owner), correctOf(week, by)] })
  }

  // 3. The top half each grow into one unclaimed neighbor, best score first
  const growers = sorted
    .filter(p => citiesOf(start, p).length && c(p) >= mid)
    .sort((x, y) => c(y) - c(x) || citiesOf(start, x).length - citiesOf(start, y).length || x.localeCompare(y))
  for (const p of growers) {
    const mine = new Set(citiesOf(start, p))
    const bordering = (t: string) => ADJ[t].filter(n => mine.has(n)).length
    const options = TERRITORIES
      .filter(t => start[t] == null && owners[t] == null && bordering(t) > 0)
      .sort((x, y) => bordering(y) - bordering(x) || x.localeCompare(y))
    const t = options[0]
    if (!t) continue
    owners[t] = p
    changed.add(t)
    moves.push({ kind: 'claim', team: t, from: null, to: p, score: [c(p), mid] })
  }

  return { moves, owners, besieged }
}

/**
 * Starting capitals: a favorite team's city if it's free, else the free
 * city nearest it; everyone without a favorite spread as far from the
 * others as the map allows. `order` decides who chooses first.
 */
export function assignCapitals(
  order: { userId: string; favorite: string | null }[], taken: Record<string, string | null> = {},
): Record<string, string> {
  const owners: Record<string, string | null> = Object.fromEntries(TERRITORIES.map(t => [t, taken[t] ?? null]))
  const capitals: Record<string, string> = {}
  const free = () => TERRITORIES.filter(t => owners[t] == null)
  const place = (u: string, t: string) => { owners[t] = u; capitals[u] = t }
  for (const { userId, favorite } of order.filter(o => o.favorite && MAP[o.favorite])) {
    const options = free()
    if (!options.length) break
    const fav = favorite!
    const t = owners[fav] == null ? fav
      : options.sort((x, y) => hexDistance(fav, x) - hexDistance(fav, y) || x.localeCompare(y))[0]
    place(userId, t)
  }
  for (const { userId } of order.filter(o => !o.favorite || !MAP[o.favorite])) {
    const options = free()
    if (!options.length) break
    const held = TERRITORIES.filter(t => owners[t] != null)
    const room = (t: string) => (held.length ? Math.min(...held.map(h => hexDistance(t, h))) : 0)
    // Farthest from everyone; on a tie, a spread that depends on who it is
    const spin = (t: string) => [...(userId + t)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
    place(userId, options.sort((x, y) => room(y) - room(x) || spin(x) - spin(y))[0])
  }
  return capitals
}

/** Colors that read on the TV and stand apart from their neighbors' (a golden-angle walk round the wheel). */
export function empireColor(i: number): string {
  const hue = Math.round((i * 137.508 + 12) % 360)
  const light = [56, 64, 48][i % 3]
  return `hsl(${hue} 72% ${light}%)`
}
