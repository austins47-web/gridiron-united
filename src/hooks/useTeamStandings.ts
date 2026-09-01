import { useQuery } from '@tanstack/react-query'

const PROXY = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sportsdata`
const ANON  = import.meta.env.VITE_SUPABASE_ANON_KEY

async function proxyFetch(endpoint: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ endpoint, ...params })
  const res = await fetch(`${PROXY}?${qs}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

// ── Types ─────────────────────────────────────────────────────

export interface StandingsTeam {
  abbr: string
  name: string
  logo: string
  wins: number
  losses: number
  ties: number
  record: string   // "3-0" display string, straight from ESPN
  streak: string
  pct: number
  teamId: string    // ESPN team id, for TeamPage navigation
  rank?: number     // AP Top 25 rank, CFB only, when ranked
}

export interface StandingsGroup {
  name: string      // division (NFL) or conference (CFB)
  teams: StandingsTeam[]
}

export interface BracketGame {
  id: string
  round: string     // "Wild Card", "First Round", etc.
  label: string      // full note text, e.g. "...at the Rose Bowl"
  home: { abbr: string; name: string; logo: string; score: string; teamId: string } | null
  away: { abbr: string; name: string; logo: string; score: string; teamId: string } | null
  isTbd: boolean
  status: 'pre' | 'in' | 'post'
}

export interface RankedTeam {
  rank: number
  teamId: string
  abbr: string
  name: string
  logo: string
  record: string
  points: number
  firstPlaceVotes: number
  trend: string   // "-1", "+2", "-" (no change)
}

// ── NFL division map — ESPN's standings endpoint groups only by
// conference, not division, so this is hardcoded. Division
// alignments are stable across seasons (last changed 2002), same
// justification as every other hardcoded team/conference map
// already in this codebase.
const NFL_DIVISIONS: Record<string, string> = {
  BUF: 'AFC East', MIA: 'AFC East', NE: 'AFC East', NYJ: 'AFC East',
  BAL: 'AFC North', CIN: 'AFC North', CLE: 'AFC North', PIT: 'AFC North',
  HOU: 'AFC South', IND: 'AFC South', JAX: 'AFC South', TEN: 'AFC South',
  DEN: 'AFC West', KC: 'AFC West', LAC: 'AFC West', LV: 'AFC West',
  DAL: 'NFC East', NYG: 'NFC East', PHI: 'NFC East', WSH: 'NFC East',
  CHI: 'NFC North', DET: 'NFC North', GB: 'NFC North', MIN: 'NFC North',
  ATL: 'NFC South', CAR: 'NFC South', NO: 'NFC South', TB: 'NFC South',
  ARI: 'NFC West', LAR: 'NFC West', SF: 'NFC West', SEA: 'NFC West',
}

function statVal(stats: any[], type: string): number {
  return stats.find((s: any) => s.type === type)?.value ?? 0
}
function statStr(stats: any[], type: string): string {
  return stats.find((s: any) => s.type === type)?.displayValue ?? ''
}

function toStandingsTeam(entry: any): StandingsTeam {
  const stats = entry.stats ?? []
  const overall = stats.find((s: any) => s.name === 'overall')
  const record = overall?.summary ?? overall?.displayValue ?? '0-0'

  // Parse wins/losses/ties from the "W-L" or "W-L-T" record string
  // rather than separate type:'wins'/type:'losses' stat entries —
  // confirmed those aren't reliably present. A real CFB team (NC
  // State, 0-1 after a real loss) had a type:'wins' stat but NO
  // type:'losses' stat anywhere in its whole stats array, so losses
  // silently defaulted to 0 for every CFB team regardless of their
  // actual record. The "W-L" record string itself was correct the
  // whole time; parsing it directly can't have this gap, since
  // there's nothing league-specific about a dash-separated string.
  const parts = record.split('-').map((n: string) => parseInt(n, 10))
  const wins = Number.isFinite(parts[0]) ? parts[0] : statVal(stats, 'wins')
  const losses = Number.isFinite(parts[1]) ? parts[1] : statVal(stats, 'losses')
  const ties = Number.isFinite(parts[2]) ? parts[2] : statVal(stats, 'ties')

  return {
    abbr: entry.team?.abbreviation ?? '',
    name: entry.team?.displayName ?? entry.team?.shortDisplayName ?? '',
    logo: entry.team?.logos?.[0]?.href ?? '',
    teamId: entry.team?.id ?? '',
    wins,
    losses,
    ties,
    record,
    streak: statStr(stats, 'streak'),
    pct: statVal(stats, 'winpercent'),
  }
}

function groupNflByDivision(data: any): StandingsGroup[] {
  const divisions = new Map<string, StandingsTeam[]>()
  for (const conf of data.children ?? []) {
    for (const entry of conf.standings?.entries ?? []) {
      const div = NFL_DIVISIONS[entry.team?.abbreviation] ?? 'Other'
      if (!divisions.has(div)) divisions.set(div, [])
      divisions.get(div)!.push(toStandingsTeam(entry))
    }
  }
  const order = ['AFC East', 'AFC North', 'AFC South', 'AFC West', 'NFC East', 'NFC North', 'NFC South', 'NFC West']
  return order
    .filter(d => divisions.has(d))
    .map(name => ({ name, teams: divisions.get(name)!.sort((a, b) => b.pct - a.pct) }))
}

// ── NFL standings — grouped into 8 divisions ───────────────────
//
// Always requests regular season (seasontype=2) explicitly. If
// every team comes back 0-0 — genuinely populated data, just no
// games played yet, confirmed directly against ESPN rather than
// assumed — the regular season hasn't actually started playing
// games, so this falls back to preseason (seasontype=1) instead,
// which DOES have real records right now. The moment any real
// regular-season game gets reported anywhere in the league, this
// automatically stops falling back — no hardcoded date, nothing
// to update season to season. isPreseason tells the UI which one
// it's actually looking at, so preseason records are always
// clearly labeled rather than shown as if they were the real thing.
export function useNflStandings() {
  return useQuery({
    queryKey: ['nfl-standings'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ groups: StandingsGroup[]; isPreseason: boolean }> => {
      const regular = groupNflByDivision(await proxyFetch('nfl/standings', { seasontype: '2' }))
      const anyGamesPlayed = regular.some(g => g.teams.some(t => t.wins + t.losses + t.ties > 0))
      if (anyGamesPlayed) return { groups: regular, isPreseason: false }

      const pre = groupNflByDivision(await proxyFetch('nfl/standings', { seasontype: '1' }))
      return { groups: pre, isPreseason: true }
    },
  })
}

// ── CFB rankings — AP Top 25 specifically (ESPN also returns
// Coaches Poll, FCS, and D-II polls in the same response; AP is
// the one most people mean by "the rankings")
export function useCfbRankings() {
  return useQuery({
    queryKey: ['cfb-rankings'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RankedTeam[]> => {
      const data = await proxyFetch('cfb/rankings')
      const ap = (data.rankings ?? []).find((r: any) => r.name === 'AP Top 25')
      return (ap?.ranks ?? []).map((r: any) => ({
        rank: r.current,
        teamId: r.team?.id ?? '',
        abbr: r.team?.abbreviation ?? '',
        name: r.team?.displayName ?? r.team?.location ?? '',
        logo: r.team?.logos?.[0]?.href ?? r.team?.logo ?? '',
        record: r.recordSummary ?? '',
        points: r.points ?? 0,
        firstPlaceVotes: r.firstPlaceVotes ?? 0,
        trend: r.trend ?? '-',
      }))
    },
  })
}

// ── CFB standings — ESPN already groups by conference. Same
// return shape as useNflStandings ({ groups, isPreseason }) so both
// can be consumed identically — CFB has no separate preseason phase
// with its own games (unlike NFL), so isPreseason is always false.
// Also cross-references the AP Top 25 onto each team by teamId, so
// a ranked team's number shows up directly in its standings row.
export function useCfbStandings() {
  return useQuery({
    queryKey: ['cfb-standings'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ groups: StandingsGroup[]; isPreseason: boolean }> => {
      const [data, rankData] = await Promise.all([
        proxyFetch('cfb/standings'),
        proxyFetch('cfb/rankings'),
      ])
      const ap = (rankData.rankings ?? []).find((r: any) => r.name === 'AP Top 25')
      const rankByTeamId = new Map<string, number>(
        (ap?.ranks ?? []).map((r: any) => [r.team?.id, r.current])
      )
      const groups = (data.children ?? [])
        .map((conf: any) => ({
          name: conf.name,
          teams: (conf.standings?.entries ?? [])
            .map((entry: any) => {
              const team = toStandingsTeam(entry)
              const rank = rankByTeamId.get(team.teamId)
              return rank ? { ...team, rank } : team
            })
            .sort((a: StandingsTeam, b: StandingsTeam) => b.pct - a.pct),
        }))
        // Skip conferences ESPN hasn't populated yet (seen empty
        // this early in preseason) rather than show a blank section
        .filter((g: StandingsGroup) => g.teams.length > 0)
      return { groups, isPreseason: false }
    },
  })
}

function toBracketTeam(competitor: any) {
  if (!competitor) return null
  return {
    abbr: competitor.team?.abbreviation ?? 'TBD',
    name: competitor.team?.displayName ?? 'TBD',
    logo: competitor.team?.logos?.[0]?.href ?? competitor.team?.logo ?? '',
    score: competitor.score ?? '',
    teamId: competitor.team?.id ?? '',
  }
}

function toBracketGame(ev: any, round: string): BracketGame {
  const comp = ev.competitions?.[0]
  const cs = comp?.competitors ?? []
  const home = cs.find((c: any) => c.homeAway === 'home')
  const away = cs.find((c: any) => c.homeAway === 'away')
  const state = comp?.status?.type?.state ?? 'pre'
  return {
    id: ev.id,
    round,
    label: comp?.notes?.[0]?.headline ?? round,
    home: toBracketTeam(home),
    away: toBracketTeam(away),
    isTbd: (home?.team?.abbreviation ?? 'TBD') === 'TBD',
    status: state === 'in' ? 'in' : state === 'post' ? 'post' : 'pre',
  }
}

// ── NFL bracket — 4 known postseason weeks, week 4 is always a
// bye between Conference Championships and the Super Bowl ────
export function useNflBracket() {
  return useQuery({
    queryKey: ['nfl-bracket'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, BracketGame[]>> => {
      const rounds = [
        { week: 1, label: 'Wild Card' },
        { week: 2, label: 'Divisional' },
        { week: 3, label: 'Conference Championship' },
        { week: 5, label: 'Super Bowl' },
      ]
      const results = await Promise.all(
        rounds.map(r => proxyFetch(`nfl/scores/2026/${r.week}`, { seasontype: '3' }))
      )
      const out: Record<string, BracketGame[]> = {}
      rounds.forEach((r, i) => {
        out[r.label] = (results[i].events ?? []).map((ev: any) => toBracketGame(ev, r.label))
      })
      return out
    },
  })
}

// ── CFB bracket — all postseason games (bowls + CFP) come back
// as a single week; filter to just the 12-team playoff itself
// using the note text confirmed against real ESPN data ────────
function cfpRoundFromNote(note: string): string | null {
  if (note.includes('First Round')) return 'First Round'
  if (note.includes('Quarterfinal')) return 'Quarterfinal'
  if (note.includes('Semifinal')) return 'Semifinal'
  if (note.includes('National Championship')) return 'National Championship'
  return null
}

export function useCfbBracket() {
  return useQuery({
    queryKey: ['cfb-bracket'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, BracketGame[]>> => {
      const data = await proxyFetch('cfb/scores/2026/1', { seasontype: '3' })
      const out: Record<string, BracketGame[]> = {
        'First Round': [], 'Quarterfinal': [], 'Semifinal': [], 'National Championship': [],
      }
      for (const ev of data.events ?? []) {
        const note = ev.competitions?.[0]?.notes?.[0]?.headline ?? ''
        const round = cfpRoundFromNote(note)
        if (!round) continue // not a CFP game — one of the ~35 other bowls
        out[round].push(toBracketGame(ev, round))
      }
      return out
    },
  })
}
