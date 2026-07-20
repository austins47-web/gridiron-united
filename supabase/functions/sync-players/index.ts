import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SDIO_KEY             = Deno.env.get('SPORTSDATAIO_KEY') ?? ''
const SUPABASE_URL         = Deno.env.get('APP_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const NFL_BASE = 'https://api.sportsdata.io/v3/nfl'
const CFB_BASE = 'https://api.sportsdata.io/v3/cfb'
const H = { 'Ocp-Apim-Subscription-Key': SDIO_KEY }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sdio(url: string) {
  const res = await fetch(url, { headers: H })
  if (!res.ok) throw new Error(`SDIO ${res.status}: ${url}`)
  return res.json()
}

// ── Shared helpers ─────────────────────────────────────────────

function mapStatus(s: string): string {
  if (!s || s === 'Active') return 'active'
  if (s === 'Questionable') return 'questionable'
  if (s === 'Out' || s === 'Doubtful') return 'out'
  if (s === 'IR' || s === 'PUP' || s === 'NFI') return 'ir'
  return 'active'
}

// ── NFL maps ───────────────────────────────────────────────────

const NFL_POS: Record<string, string> = {
  QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', FB: 'RB',
}

const NFL_TEAM: Record<string, string> = {
  ARI:'Arizona Cardinals',   ATL:'Atlanta Falcons',    BAL:'Baltimore Ravens',
  BUF:'Buffalo Bills',       CAR:'Carolina Panthers',  CHI:'Chicago Bears',
  CIN:'Cincinnati Bengals',  CLE:'Cleveland Browns',   DAL:'Dallas Cowboys',
  DEN:'Denver Broncos',      DET:'Detroit Lions',      GB:'Green Bay Packers',
  HOU:'Houston Texans',      IND:'Indianapolis Colts', JAX:'Jacksonville Jaguars',
  KC:'Kansas City Chiefs',   LAC:'Los Angeles Chargers',LAR:'Los Angeles Rams',
  LV:'Las Vegas Raiders',    MIA:'Miami Dolphins',     MIN:'Minnesota Vikings',
  NE:'New England Patriots', NO:'New Orleans Saints',  NYG:'New York Giants',
  NYJ:'New York Jets',       PHI:'Philadelphia Eagles',PIT:'Pittsburgh Steelers',
  SEA:'Seattle Seahawks',    SF:'San Francisco 49ers', TB:'Tampa Bay Buccaneers',
  TEN:'Tennessee Titans',    WAS:'Washington Commanders',
}

const NFL_CONF: Record<string, string> = {
  ARI:'NFC West', ATL:'NFC South', BAL:'AFC North', BUF:'AFC East',
  CAR:'NFC South', CHI:'NFC North', CIN:'AFC North', CLE:'AFC North',
  DAL:'NFC East',  DEN:'AFC West',  DET:'NFC North', GB:'NFC North',
  HOU:'AFC South', IND:'AFC South', JAX:'AFC South', KC:'AFC West',
  LAC:'AFC West',  LAR:'NFC West',  LV:'AFC West',   MIA:'AFC East',
  MIN:'NFC North', NE:'AFC East',   NO:'NFC South',  NYG:'NFC East',
  NYJ:'AFC East',  PHI:'NFC East',  PIT:'AFC North', SEA:'NFC West',
  SF:'NFC West',   TB:'NFC South',  TEN:'AFC South', WAS:'NFC East',
}

// ── CFB maps ───────────────────────────────────────────────────

const CFB_POS: Record<string, string> = {
  QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', FB: 'RB', HB: 'RB',
}

// Which CFB conferences we include (FBS only)
const INCLUDED_CONFS = new Set([
  'SEC', 'Big Ten', 'Big 12', 'ACC', 'Pac-12', 'American',
  'Mountain West', 'Conference USA', 'Mid-American', 'Sun Belt',
  'Independent',
])

// ── NFL sync ───────────────────────────────────────────────────

async function syncNFL(supabase: any, season: string, week: string) {
  const [allPlayers, projections] = await Promise.all([
    sdio(`${NFL_BASE}/scores/json/Players`),
    sdio(`${NFL_BASE}/projections/json/PlayerGameProjectionStatsByWeek/${season}REG/${week}`),
  ])

  const projMap = new Map<number, any>()
  for (const p of projections) projMap.set(p.PlayerID, p)

  const rows: any[] = []

  // Skill position players
  for (const p of allPlayers) {
    const pos = NFL_POS[p.Position]
    if (!pos) continue
    if (!p.Team || !NFL_TEAM[p.Team]) continue
    if (p.Status === 'Inactive' || p.Status === 'Practice Squad') continue

    const proj   = projMap.get(p.PlayerID)
    const projPts = proj?.FantasyPointsPPR ?? proj?.FantasyPoints ?? 0
    const adp     = proj?.AverageDraftPositionPPR ?? proj?.AverageDraftPosition ?? 999

    rows.push({
      id:          p.PlayerID,
      name:        p.Name,
      team:        NFL_TEAM[p.Team],
      pos,
      league:      'NFL',
      conference:  NFL_CONF[p.Team] ?? null,
      avg_pts:     projPts,
      proj_pts:    projPts,
      adp,
      status:      mapStatus(p.InjuryStatus ?? p.Status ?? ''),
      injury_note: p.InjuryBodyPart ? `${p.InjuryBodyPart}${p.InjuryNotes ? ': ' + p.InjuryNotes : ''}` : null,
      is_rookie:   (p.Experience ?? 0) <= 1,
      updated_at:  new Date().toISOString(),
    })
  }

  // DST — one per team
  const teamEntries = Object.entries(NFL_TEAM)
  for (let i = 0; i < teamEntries.length; i++) {
    const [abbr, fullName] = teamEntries[i]
    const dstProj = projections.find((p: any) => p.Team === abbr && p.Position === 'DST')
    rows.push({
      id:          90000 + i,
      name:        `${fullName} D/ST`,
      team:        fullName,
      pos:         'DST',
      league:      'NFL',
      conference:  NFL_CONF[abbr] ?? null,
      avg_pts:     dstProj?.FantasyPoints ?? 5,
      proj_pts:    dstProj?.FantasyPoints ?? 5,
      adp:         dstProj?.AverageDraftPosition ?? 150,
      status:      'active',
      injury_note: null,
      is_rookie:   false,
      updated_at:  new Date().toISOString(),
    })
  }

  return { rows, projCount: projMap.size }
}

// ── CFB sync ───────────────────────────────────────────────────

async function syncCFB(supabase: any, season: string) {
  // Fetch teams first to build school name + conference map
  const teams: any[] = await sdio(`${CFB_BASE}/scores/json/Teams`)
  const teamMap = new Map<string, { name: string; conf: string }>()
  for (const t of teams) {
    if (!t.Key) continue
    teamMap.set(t.Key, { name: t.School ?? t.Key, conf: t.Conference ?? '' })
  }

  // Fetch all CFB players
  const allPlayers: any[] = await sdio(`${CFB_BASE}/scores/json/Players`)

  // Use last complete season stats as avg_pts proxy
  // Try week 15 (bowl season) for best coverage
  let statsMap = new Map<number, any>()
  try {
    const stats: any[] = await sdio(`${CFB_BASE}/stats/json/PlayerSeasonStats/${season}`)
    for (const s of stats) statsMap.set(s.PlayerID, s)
  } catch {
    // Season stats might not be available yet — fall back to empty
  }

  const rows: any[] = []
  let cfbId = 200000 // base ID offset for CFB to avoid collision with NFL

  const seen = new Set<number>()

  for (const p of allPlayers) {
    if (seen.has(p.PlayerID)) continue
    seen.add(p.PlayerID)

    const pos = CFB_POS[p.Position]
    if (!pos) continue
    if (!p.Team) continue

    const teamInfo = teamMap.get(p.Team)
    if (!teamInfo) continue

    // Only include FBS conferences
    if (!INCLUDED_CONFS.has(teamInfo.conf) && teamInfo.conf !== '') continue

    // Skip non-skill players on tiny programs
    const stats = statsMap.get(p.PlayerID)
    const avgPts = stats?.FantasyPoints ?? 0

    rows.push({
      id:          50000000 + p.PlayerID, // large offset so CFB IDs never clash with NFL
      name:        `${p.FirstName} ${p.LastName}`,
      team:        teamInfo.name,
      pos,
      league:      'CFB',
      conference:  teamInfo.conf || null,
      avg_pts:     avgPts,
      proj_pts:    avgPts,
      adp:         avgPts > 20 ? 50 : avgPts > 10 ? 100 : avgPts > 5 ? 200 : 999,
      status:      mapStatus(p.InjuryStatus ?? ''),
      injury_note: p.InjuryBodyPart ?? null,
      is_rookie:   p.Class === 'Freshman' || p.Class === 'Sophomore',
      updated_at:  new Date().toISOString(),
    })
  }

  return { rows }
}

// ── Upsert helper ──────────────────────────────────────────────

async function upsertBatched(supabase: any, rows: any[]) {
  let count = 0
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200)
    const { error } = await supabase
      .from('players')
      .upsert(batch, { onConflict: 'id' })
    if (error) throw new Error(`Upsert batch ${Math.floor(i/200)} failed: ${error.message}`)
    count += batch.length
  }
  return count
}

// ── Main handler ───────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const params   = new URL(req.url).searchParams
    const season   = params.get('season') ?? '2026'
    // 'auto' computes current NFL week from the season start date
    const weekParam = params.get('week') ?? 'auto'
    const NFL_START = new Date('2026-09-03').getTime()
    const week = weekParam === 'auto'
      ? String(Math.max(1, Math.min(18, Math.floor((Date.now() - NFL_START) / (7 * 86400000)) + 1)))
      : weekParam

    // Run NFL and CFB syncs in parallel
    const [nfl, cfb] = await Promise.all([
      syncNFL(supabase, season, week),
      syncCFB(supabase, season),
    ])

    const allRows = [...nfl.rows, ...cfb.rows]
    const upserted = await upsertBatched(supabase, allRows)

    return new Response(JSON.stringify({
      success:         true,
      total:           upserted,
      nfl:             nfl.rows.length,
      cfb:             cfb.rows.length,
      nflProjections:  nfl.projCount,
      season,
      week,
      syncedAt:        new Date().toISOString(),
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    console.error('sync-players error:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
