// ══════════════════════════════════════════════════════════════
// Conquest: the league as a war over a map of the 32 NFL cities: each
// city's territory is the counties nearest its stadium (the app draws it
// from src/components/conquest/usMap.ts, built from the same borders).
// Shared by the conquest edge function (which settles each finished
// week) and the app and Shop TV (which show this week's battles live).
//
// The rules, all from the picks people already make:
// - Everyone starts with a capital. Each week every empire attacks one
//   neighbor: the one it ordered an attack on (before the week's first
//   kickoff), or else the one it picked most differently from. Beat
//   their week's score (ties go to the defender) and take one of their
//   cities along your border, an outlying city before their capital.
// - A capital doesn't fall at the first defeat: it goes under siege. The
//   next one to beat its owner while it's besieged takes it; a week with
//   nobody beating them and the siege lifts.
// - The top half of the week each plant a flag in one unclaimed city
//   next to them, best score first: the one they chose (before the
//   week's first kickoff) if it's still free, or else automatic.
// - Level scores: the closer guess on the week's tiebreaker game goes
//   first, then the better season win %.
// - Lose your last city and you're in exile: outscore whoever holds your
//   capital in any week to take it back (a rebellion).
// - Sea lanes (dotted on the map) count as borders, Risk style.
// - A city changes hands at most once a week; everything is decided on
//   the map as it stood when the week began.
// ══════════════════════════════════════════════════════════════

/** Each stadium on the map (the app's map space, 1000×620): for ordering, never for borders. */
export const POS: Record<string, [number, number]> = {
  ARI: [204.9,398.2],
  ATL: [728,405.9],
  BAL: [846.7,257.7],
  BUF: [795.1,185.9],
  CAR: [788.7,363.1],
  CHI: [651.4,226.5],
  CIN: [711.1,284.2],
  CLE: [751.6,222.7],
  DAL: [489.5,442.2],
  DEN: [353.9,274],
  DET: [726.5,207],
  GB: [638.9,166.9],
  HOU: [522,512.3],
  IND: [680.8,272.2],
  JAX: [791.4,476.5],
  KC: [536.9,297.2],
  LAC: [111.3,397],
  LAR: [94.9,365.6],
  LV: [162.6,330.3],
  MIA: [834.8,570],
  MIN: [554.5,160.8],
  NE: [921.2,173.7],
  NO: [627,502.6],
  NYG: [882.1,213.7],
  NYJ: [893.6,212.3],
  PHI: [868.4,238.4],
  PIT: [783.9,242.2],
  SEA: [107.9,45.7],
  SF: [50.3,272.1],
  TB: [782.1,531.9],
  TEN: [678.3,355.6],
  WSH: [844.2,266.9],
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

export const TERRITORIES = Object.keys(POS).sort()

/** Each city's land borders: territories whose counties share a border (water doesn't count). */
const LAND_BORDERS: Record<string, string[]> = {
  ARI: ["DAL","DEN","LAC","LV"],
  ATL: ["CAR","JAX","NO","TEN"],
  BAL: ["BUF","PHI","PIT","WSH"],
  BUF: ["BAL","CLE","NE","NYG","PHI","PIT"],
  CAR: ["ATL","CIN","JAX","PIT","TEN","WSH"],
  CHI: ["DET","GB","IND","KC","MIN"],
  CIN: ["CAR","CLE","DET","IND","PIT","TEN"],
  CLE: ["BUF","CIN","DET","PIT"],
  DAL: ["ARI","DEN","HOU","KC","NO","TEN"],
  DEN: ["ARI","DAL","KC","LV","MIN","SEA"],
  DET: ["CHI","CIN","CLE","GB","IND"],
  GB: ["CHI","DET","MIN"],
  HOU: ["DAL","NO"],
  IND: ["CHI","CIN","DET","KC","TEN"],
  JAX: ["ATL","CAR","NO","TB"],
  KC: ["CHI","DAL","DEN","IND","MIN","TEN"],
  LAC: ["ARI","LAR","LV"],
  LAR: ["LAC","LV","SF"],
  LV: ["ARI","DEN","LAC","LAR","SEA","SF"],
  MIA: ["TB"],
  MIN: ["CHI","DEN","GB","KC"],
  NE: ["BUF","NYG","NYJ"],
  NO: ["ATL","DAL","HOU","JAX","TEN"],
  NYG: ["BUF","NE","NYJ","PHI"],
  NYJ: ["NE","NYG"],
  PHI: ["BAL","BUF","NYG"],
  PIT: ["BAL","BUF","CAR","CIN","CLE","WSH"],
  SEA: ["DEN","LV","SF"],
  SF: ["LAR","LV","SEA"],
  TB: ["JAX","MIA"],
  TEN: ["ATL","CAR","CIN","DAL","IND","KC","NO"],
  WSH: ["BAL","CAR","PIT"],
}

/**
 * Sea lanes, Risk style: routes across water that count as a border, so
 * the Florida cities (a peninsula with Miami a dead end) aren't boxed in.
 * The map draws them as dotted lines.
 */
export const SEA_LANES: [string, string][] = [
  ['CAR', 'MIA'], // the Atlantic, up the coast
  ['HOU', 'MIA'], // the southern Gulf
  ['NO', 'TB'],   // the northern Gulf
]

/** Each city's neighbors: its land borders and its sea lanes. */
export const ADJ: Record<string, string[]> = Object.fromEntries(
  Object.entries(LAND_BORDERS).map(([t, land]) => [t, [...new Set([
    ...land,
    ...SEA_LANES.filter(l => l.includes(t)).map(([a, b]) => (a === t ? b : a)),
  ])].sort()]),
)

/** How many steps apart two cities are on the map. */
export function steps(a: string, b: string): number {
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
  /** user id → how far their guess on the week's tiebreaker game was from its total (no guess: not here) */
  tiebreak?: Record<string, number>
  /** user id → season win % through the week (0–1) */
  winPct?: Record<string, number>
}

/** Attack orders for a week: attacker → the empire they chose to attack. */
export type Orders = Record<string, string>

/** Flag orders for a week: player → the unclaimed city they chose to claim. */
export type Claims = Record<string, string>

export interface Battle {
  attacker: string
  defender: string
  /** chosen by an order (not the automatic pick) */
  ordered?: boolean
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
  /** a claim: the city the player chose (not the automatic one) */
  chosen?: boolean
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

/**
 * Level scores, settled the Pick'Em way: the closer tiebreaker guess (no
 * guess ranks last), then the better season win %. Negative when a goes
 * first; 0 when even that's level.
 */
export function tiebreak(week: WeekScores, a: string, b: string): number {
  const da = week.tiebreak?.[a] ?? Infinity, db = week.tiebreak?.[b] ?? Infinity
  if (da !== db) return da < db ? -1 : 1
  const pa = week.winPct?.[a] ?? 0, pb = week.winPct?.[b] ?? 0
  return pb - pa
}

function median(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * This week's battles: every empire against the neighbor it ordered an
 * attack on, if that one's still on its border; otherwise the neighbor it
 * picked most differently from (the bigger empire on a tie). No automatic
 * battle for an empire that agreed with every neighbor on everything.
 */
export function plannedBattles(state: ConquestState, week: WeekScores, players: string[], orders: Orders = {}): Battle[] {
  const out: Battle[] = []
  for (const a of [...players].sort()) {
    if (!citiesOf(state.owners, a).length) continue
    const target = orders[a]
    if (target && neighborsOf(state.owners, a).includes(target)) {
      out.push({ attacker: a, defender: target, ordered: true, disagree: disagreements(week, a, target), score: [correctOf(week, a), correctOf(week, target)] })
      continue
    }
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
  state: ConquestState, week: WeekScores, players: string[], orders: Orders = {}, claims: Claims = {},
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

  // 2. Battles, the biggest wins first (the same margin: the better week)
  const wins = plannedBattles(state, week, players, orders)
    .filter(b => b.score[0] > b.score[1])
    .sort((x, y) => (y.score[0] - y.score[1]) - (x.score[0] - x.score[1])
      || y.score[0] - x.score[0]
      || tiebreak(week, x.attacker, y.attacker)
      || x.attacker.localeCompare(y.attacker))
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

  // 3. The top half each plant a flag next to them, best score first: the
  //    city they chose if it's still free, or else the one touching the
  //    most of their cities
  const growers = sorted
    .filter(p => citiesOf(start, p).length && c(p) >= mid)
    .sort((x, y) => c(y) - c(x) || tiebreak(week, x, y) || citiesOf(start, x).length - citiesOf(start, y).length || x.localeCompare(y))
  for (const p of growers) {
    const mine = new Set(citiesOf(start, p))
    const bordering = (t: string) => ADJ[t].filter(n => mine.has(n)).length
    const options = TERRITORIES
      .filter(t => start[t] == null && owners[t] == null && bordering(t) > 0)
      .sort((x, y) => Number(y === claims[p]) - Number(x === claims[p]) || bordering(y) - bordering(x) || x.localeCompare(y))
    const t = options[0]
    if (!t) continue
    owners[t] = p
    changed.add(t)
    moves.push({ kind: 'claim', team: t, from: null, to: p, score: [c(p), mid], ...(t === claims[p] ? { chosen: true } : {}) })
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
  for (const { userId, favorite } of order.filter(o => o.favorite && POS[o.favorite])) {
    const options = free()
    if (!options.length) break
    const fav = favorite!
    const t = owners[fav] == null ? fav
      : options.sort((x, y) => steps(fav, x) - steps(fav, y) || x.localeCompare(y))[0]
    place(userId, t)
  }
  for (const { userId } of order.filter(o => !o.favorite || !POS[o.favorite])) {
    const options = free()
    if (!options.length) break
    const held = TERRITORIES.filter(t => owners[t] != null)
    const room = (t: string) => (held.length ? Math.min(...held.map(h => steps(t, h))) : 0)
    // Farthest from everyone; on a tie, a spread that depends on who it is
    const spin = (t: string) => [...(userId + t)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
    place(userId, options.sort((x, y) => room(y) - room(x) || spin(x) - spin(y))[0])
  }
  return capitals
}

/** Colors that read on the TV and stand apart from their neighbors' (a golden-angle walk round the wheel). */
/**
 * The empires' colors, picked by hand to tell apart: sixteen solid, then
 * eight lighter ones that carry a texture (stripes or dots) so they can't
 * be mistaken for a solid one, colorblind or not.
 */
export const PALETTE: { color: string; pattern?: 'stripes' | 'dots' }[] = [
  { color: 'hsl(4 86% 58%)' },     // red
  { color: 'hsl(27 96% 55%)' },    // orange
  { color: 'hsl(47 96% 54%)' },    // amber
  { color: 'hsl(78 68% 48%)' },    // lime
  { color: 'hsl(140 62% 44%)' },   // green
  { color: 'hsl(172 72% 40%)' },   // teal
  { color: 'hsl(192 88% 52%)' },   // cyan
  { color: 'hsl(213 92% 62%)' },   // azure
  { color: 'hsl(234 78% 66%)' },   // blue
  { color: 'hsl(262 74% 66%)' },   // violet
  { color: 'hsl(287 68% 58%)' },   // purple
  { color: 'hsl(312 74% 60%)' },   // magenta
  { color: 'hsl(338 84% 64%)' },   // pink
  { color: 'hsl(18 55% 46%)' },    // rust
  { color: 'hsl(58 42% 46%)' },    // olive
  { color: 'hsl(200 22% 62%)' },   // steel
  { color: 'hsl(150 58% 72%)', pattern: 'stripes' },  // mint
  { color: 'hsl(48 90% 74%)', pattern: 'stripes' },   // cream
  { color: 'hsl(10 92% 76%)', pattern: 'stripes' },   // salmon
  { color: 'hsl(222 72% 80%)', pattern: 'stripes' },  // periwinkle
  { color: 'hsl(275 55% 78%)', pattern: 'dots' },     // lavender
  { color: 'hsl(185 60% 68%)', pattern: 'dots' },     // aqua
  { color: 'hsl(95 50% 68%)', pattern: 'dots' },      // pale lime
  { color: 'hsl(330 70% 80%)', pattern: 'dots' },     // rose
]

export function empireColor(i: number): string {
  return PALETTE[i % PALETTE.length].color
}

/** An empire color's texture, if it has one. */
export const patternOf = (color: string) => PALETTE.find(p => p.color === color)?.pattern ?? null

// ── The titles ────────────────────────────────────────────────
export interface Title {
  key: 'emperor' | 'warlord' | 'siege' | 'unbreakable' | 'comeback' | 'pioneer'
  icon: string
  label: string
  /** what it's for */
  blurb: string
  /** who holds it: the leader, or everyone still tied for it */
  holders: string[]
  value: number
}

const TITLE_INFO: Record<Title['key'], { icon: string; label: string; blurb: string }> = {
  emperor: { icon: '👑', label: 'Emperor', blurb: 'the biggest empire' },
  warlord: { icon: '⚔️', label: 'Warlord', blurb: 'the most cities taken' },
  siege: { icon: '🔥', label: 'Siege Master', blurb: 'the most sieges laid' },
  unbreakable: { icon: '🛡️', label: 'Unbreakable', blurb: 'the most sieges survived' },
  comeback: { icon: '✊', label: 'Comeback Kid', blurb: 'the most rebellions' },
  pioneer: { icon: '🚩', label: 'Pioneer', blurb: 'the most flags planted' },
}

/**
 * The season's titles from the war log and the map as it stands: who
 * leads each (the race during the season; crowned after the last week).
 * A title nobody's earned (a count of 0) isn't given. A tie goes to the
 * bigger empire; still tied, they share it (nobody's out in front yet).
 */
export function titles(moves: Pick<Move, 'kind' | 'to' | 'from'>[], owners: Record<string, string | null>, players: string[]): Title[] {
  const cities = (u: string) => citiesOf(owners, u).length
  const count = (pred: (m: Pick<Move, 'kind' | 'to' | 'from'>) => boolean) => {
    const n: Record<string, number> = {}
    for (const m of moves) if (pred(m)) n[m.to] = (n[m.to] ?? 0) + 1
    return n
  }
  const tallies: Record<Title['key'], Record<string, number>> = {
    emperor: Object.fromEntries(players.map(u => [u, cities(u)])),
    warlord: count(m => m.kind === 'capture' || m.kind === 'rebellion'),
    siege: count(m => m.kind === 'siege'),
    unbreakable: count(m => m.kind === 'relief'),
    comeback: count(m => m.kind === 'rebellion'),
    pioneer: count(m => m.kind === 'claim'),
  }
  const out: Title[] = []
  for (const key of Object.keys(TITLE_INFO) as Title['key'][]) {
    const ranked = players.map(u => ({ u, v: tallies[key][u] ?? 0, c: cities(u) })).filter(x => x.v > 0)
    if (!ranked.length) continue
    const top = Math.max(...ranked.map(x => x.v))
    let lead = ranked.filter(x => x.v === top)
    const most = Math.max(...lead.map(x => x.c))
    lead = lead.filter(x => x.c === most)
    out.push({ key, ...TITLE_INFO[key], holders: lead.map(x => x.u).sort(), value: top })
  }
  return out
}
