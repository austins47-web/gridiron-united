// A settled week of Conquest told the way the papers would: the newsreel's
// lines (what's said, where the camera goes, which moves it shows) and the
// War Office's posters. Built from the week's war report alone, so the TV
// and the commissioner's preview tell the same story.
import { CITY } from '../../../supabase/functions/_shared/conquest.ts'
import { ownersBefore, type ConquestData, type ConquestMove } from './conquestView'
import { M } from './mapGeometry'

/** Where the camera looks: the map point it centers on and how far in (1 = the whole country) */
export type Shot = { x: number; y: number; z: number }
export const WHOLE_MAP: Shot = { x: M.width / 2, y: M.height / 2, z: 1 }

export interface ReelLine {
  text: string
  shot: Shot
  /** the moves this line reveals on the map (indexes into the story's moves) */
  reveals: number[]
  /** attack arrows drawn with it: from a city to a city, in the attacker's color */
  arrows: { from: string; to: string; color: string }[]
  /** cities named on screen while it plays */
  labels: string[]
}

export interface PosterSpec {
  key: string
  /** the two lines of the headline */
  head: [string, string]
  /** which headline line is the loud one (the other is the smaller line) */
  big: 0 | 1
  ribbon: string
  ribbonColor: string
  fine: string
  /** the sunburst's color */
  ray: string
  /** the cities the map medallion frames */
  focus: string[]
  arrow: { from: string; to: string } | null
  label: string[]
}

export interface WarStory {
  week: number
  /** games still to play: the week as it stands (warSoFar), not settled yet */
  pending: number
  /** who held what before the week's moves */
  before: Record<string, string | null>
  moves: ConquestMove[]
  lines: ReelLine[]
  posters: PosterSpec[]
}

const cityName = (t: string) => CITY[t] ?? t
const at = (t: string): [number, number] => M.stadium[t] ?? [M.width / 2, M.height / 2]

/** A shot that takes in all these cities, as close as it can (but not closer than 2.6×) */
function shotOf(teams: string[]): Shot {
  if (!teams.length) return WHOLE_MAP
  const pts = teams.map(at)
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const z = Math.max(1, Math.min(2.6, M.height / (y1 - y0 + 170), (M.height * 16) / 9 / (x1 - x0 + 260)))
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z }
}

/** A list read aloud: "A", "A and B", "A, B and C" */
const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** A color washed toward the poster's paper, for the sunburst behind the map */
export function paperTint(color: string, amount = 0.55): string {
  const m = color.match(/hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/)
  if (!m) return '#c9cfae'
  const [h, s, l] = [Number(m[1]), Number(m[2]), Number(m[3])]
  return `hsl(${h} ${Math.round(s * 0.55)}% ${Math.round(l + (82 - l) * amount)}%)`
}

const GAIN: Record<string, number> = { capture: 3, rebellion: 3, siege: 2, claim: 1, relief: 0 }

/**
 * The week's story, or null before any week's settled (or if nothing
 * happened). With `pending`, the week as it stands with that many games
 * still to play: told as news so far, not the final word.
 */
export function weekStory(war: ConquestData, pending = 0): WarStory | null {
  const report = war.report
  if (!report || !report.moves.length) return null
  const week = report.week
  const moves = report.moves
  const final = war.finalWeek != null && week >= war.finalWeek
  const player = new Map(war.players.map(p => [p.userId, p]))
  const name = (u: string | null) => (u && player.get(u)?.name?.trim()) || 'Someone'
  const color = (u: string | null) => (u && player.get(u)?.color) || '#888888'
  const capital = (u: string) => player.get(u)?.capital ?? null
  const before = ownersBefore(war.owners, moves)
  // Where an attacker struck from: their capital, if they held it going in
  const base = (u: string) => {
    const c = capital(u)
    return c && before[c] === u ? c : null
  }

  // The week's biggest conqueror: the most won (a city taken counts most)
  const gains = new Map<string, number>()
  const correct = new Map<string, number>()
  for (const m of moves) {
    if (m.kind === 'relief') continue
    gains.set(m.to, (gains.get(m.to) ?? 0) + (GAIN[m.kind] ?? 0))
    correct.set(m.to, Math.max(correct.get(m.to) ?? 0, m.score[0]))
  }
  const hero = [...gains.keys()].sort((a, b) =>
    (gains.get(b)! - gains.get(a)!) || (correct.get(b)! - correct.get(a)!) || name(a).localeCompare(name(b)))[0]
  if (!hero) return null
  const H = name(hero), heroCap = capital(hero)
  const heroCity = heroCap ? cityName(heroCap) : null

  const idx = (m: ConquestMove) => moves.indexOf(m)
  const battle = (m: ConquestMove) => m.kind === 'capture' || m.kind === 'siege' || m.kind === 'rebellion'
  const heroBattles = moves.filter(m => m.to === hero && battle(m)).slice(0, 2)
  const heroClaims = moves.filter(m => m.to === hero && m.kind === 'claim').slice(0, 2)
  const shown = new Set<number>()
  const lines: ReelLine[] = []
  const add = (text: string, teams: string[], ms: ConquestMove[], arrows: ReelLine['arrows'] = [], labels = teams) => {
    for (const m of ms) shown.add(idx(m))
    lines.push({ text, shot: teams.length ? shotOf(teams) : WHOLE_MAP, reveals: ms.map(idx), arrows, labels })
  }
  const arrowFor = (m: ConquestMove) => {
    const from = m.kind === 'rebellion' ? null : base(m.to)
    return from && from !== m.team ? [{ from, to: m.team, color: color(m.to) }] : []
  }

  add(`Gridiron United News. Dispatch from the front: Week ${week}${pending ? ', as it stands' : ''}.`, [], [], [], [])
  add(
    `No general marched harder this week than ${H}${heroCity ? ` of ${heroCity}` : ''}. ${correct.get(hero)} correct calls!`,
    heroCap ? [heroCap] : heroBattles.map(m => m.team).slice(0, 1), [],
  )
  for (const m of heroBattles) {
    const city = cityName(m.team), L = name(m.from)
    const text = m.kind === 'siege'
      ? `${H}'s armies laid siege to ${city}. ${L}'s defenders could muster only ${m.score[1]}.`
      : m.kind === 'rebellion'
        ? `${H} rose up and took back ${city}!`
        : m.exiled
          ? `${H}'s armies took ${city}, and ${L}'s empire is no more!`
          : `${H}'s armies stormed ${city}, beating ${L} ${m.score[0]} to ${m.score[1]}.`
    add(text, [...(base(hero) ? [base(hero)!] : []), m.team], [m], arrowFor(m))
  }
  if (heroClaims.length) {
    add(
      `And the ${heroCity ?? H} flag now flies over ${andList(heroClaims.map(m => cityName(m.team)))}.`,
      heroClaims.map(m => m.team), heroClaims,
    )
  }

  // The rest of the front: cities taken first, then rebellions, sieges and sieges broken
  const ORDER = ['capture', 'rebellion', 'siege', 'relief']
  const rest = moves
    .filter(m => !shown.has(idx(m)) && m.kind !== 'claim')
    .sort((a, b) => Number(!!b.exiled) - Number(!!a.exiled) || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
  let said = 0
  for (let i = 0; i < rest.length && said < 4; i++) {
    const m = rest[i], city = cityName(m.team), T = name(m.to), L = name(m.from)
    const next = rest[i + 1]
    if (m.kind === 'siege' && next?.kind === 'siege') {
      add(`${T}'s forces encircle ${city}, and ${name(next.to)}'s troops dig in around ${cityName(next.team)}.`,
        [m.team, next.team], [m, next], [...arrowFor(m), ...arrowFor(next)])
      i++
    } else if (m.kind === 'capture') {
      add(m.exiled ? `${city} has fallen to ${T}. ${L}'s empire is no more!` : `${T} stormed ${city}, beating ${L} ${m.score[0]} to ${m.score[1]}.`,
        [m.team], [m], arrowFor(m))
    } else if (m.kind === 'rebellion') {
      add(`${T} rose up and took back ${city}!`, [m.team], [m])
    } else if (m.kind === 'siege') {
      add(`${T}'s forces encircle ${city}.`, [m.team], [m], arrowFor(m))
    } else {
      add(`In ${city}, ${T} broke the siege!`, [m.team], [m])
    }
    said++
  }

  // The tally, with everything else on the map
  const taken = moves.filter(m => m.kind === 'capture' || m.kind === 'rebellion').length
  const sieged = Object.keys(war.besieged ?? {}).length
  const flags = moves.filter(m => m.kind === 'claim').length
  const parts = [
    taken ? `${taken} ${taken === 1 ? 'city' : 'cities'} changed hands` : '',
    sieged ? `${sieged} ${sieged === 1 ? 'capital' : 'capitals'} under siege` : '',
    flags ? `${flags} ${flags === 1 ? 'flag' : 'flags'} planted on open land` : '',
  ].filter(Boolean)
  const left = moves.filter(m => !shown.has(idx(m)))
  add(parts.length ? `${parts.join('. ')}.` : 'A quiet week on the front.', [], left, [], [])
  add(pending
    ? `But the war is not over. ${pending === 1 ? 'One game remains' : `${pending} games remain`}. Will the besieged hold? Stay tuned, and pick wisely.`
    : final
    ? 'And so the war is over. This has been the Commish, reporting from the front.'
    : `The war rolls on in Week ${week + 1}. Pick wisely. This has been the Commish, reporting from the front.`, [], [], [], [])

  // ── The War Office's posters ──
  const posters: PosterSpec[] = []
  const lead = heroBattles[0] ?? moves.find(m => m.to === hero && m.kind === 'claim')!
  const LEAD = cityName(lead.team).toUpperCase()
  const ribbon = lead.kind === 'siege' ? `…OUT OF ${LEAD}!`
    : lead.kind === 'capture' ? `${LEAD} IS OURS!`
      : lead.kind === 'rebellion' ? `${LEAD} IS FREE!`
        : `PLANT THE FLAG IN ${LEAD}!`
  const heroFocus = [...new Set([...(heroCap ? [heroCap] : []), ...heroBattles.map(m => m.team), ...heroClaims.map(m => m.team)])]
  posters.push({
    key: 'hero',
    head: [H.toUpperCase(), 'WANTS YOU'],
    big: 0,
    ribbon,
    ribbonColor: '#a8322a',
    fine: pending ? `AS IT STANDS · ${correct.get(hero)} CORRECT · WEEK ${week} · WAR OFFICE` : `${correct.get(hero)} CORRECT · WEEK ${week} · GRIDIRON UNITED WAR OFFICE`,
    ray: paperTint(color(hero)),
    focus: heroFocus,
    arrow: battle(lead) && base(hero) && base(hero) !== lead.team ? { from: base(hero)!, to: lead.team } : null,
    label: heroFocus,
  })
  // A capital that fell gets remembered; failing that, one under siege rallies
  const fell = moves.find(m => m.kind === 'capture' && m.from && capital(m.from) === m.team)
  const siege = heroBattles.find(m => m.kind === 'siege') ?? moves.find(m => m.kind === 'siege')
  if (fell) {
    const CITY_UP = cityName(fell.team).toUpperCase()
    posters.push({
      key: 'fell',
      head: ['REMEMBER', `${CITY_UP}!`],
      big: 1,
      ribbon: final ? 'NEVER FORGET' : `TAKE IT BACK IN WEEK ${week + 1}`,
      ribbonColor: '#2d3e5a',
      fine: `${CITY_UP} FELL TO ${name(fell.to).toUpperCase()} · WEEK ${week}`,
      ray: paperTint(color(fell.from)),
      focus: [fell.team],
      arrow: null,
      label: [fell.team],
    })
  } else if (siege && !final) {
    const CITY_UP = cityName(siege.team).toUpperCase()
    posters.push({
      key: 'siege',
      head: [CITY_UP, 'WILL NOT FALL!'],
      big: 1,
      ribbon: `BREAK THE SIEGE IN WEEK ${week + 1}`,
      ribbonColor: '#2d3e5a',
      fine: `UNDER SIEGE BY ${name(siege.to).toUpperCase()} · A CAPITAL BEATEN TWICE FALLS`,
      ray: paperTint(color(siege.from)),
      focus: [siege.team],
      arrow: null,
      label: [siege.team],
    })
  }

  return { week, pending, before, moves, lines, posters }
}

/** Who holds what, and which capitals are besieged, once these moves have played out. */
export function mapAfterMoves(before: Record<string, string | null>, moves: ConquestMove[], shownIdx: Iterable<number>) {
  const owners = { ...before }
  const sieges: Record<string, string> = {}
  for (const i of shownIdx) {
    const m = moves[i]
    if (!m) continue
    if (m.kind === 'capture' || m.kind === 'claim' || m.kind === 'rebellion') { owners[m.team] = m.to; delete sieges[m.team] }
    if (m.kind === 'siege') sieges[m.team] = m.to
    if (m.kind === 'relief') delete sieges[m.team]
  }
  return { owners, sieges }
}

export { cityName }
