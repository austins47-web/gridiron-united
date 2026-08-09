import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Weekly heavy sync: NFL + CFB player rosters ───────────────
// Runs once a week (Tuesday 3am UTC).
// Only fetches player lists — no projections (those are in sync-projections).
// CFB player list: ~3MB. NFL player list: ~1MB. Teams: ~50KB.
// Total per run: ~4MB. At once/week = ~16MB/month vs ~6GB/month at 30min.

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

function mapStatus(s: string): string {
  if (!s || s === 'Active') return 'active'
  if (s === 'Questionable') return 'questionable'
  if (s === 'Out' || s === 'Doubtful') return 'out'
  if (s === 'IR' || s === 'PUP' || s === 'NFI') return 'ir'
  return 'active'
}

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

const CFB_POS: Record<string, string> = {
  QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', FB: 'RB', HB: 'RB',
}

const INCLUDED_CONFS = new Set([
  'Southeastern', 'Big Ten', 'Big 12', 'Atlantic Coast', 'Pac-12', 'American',
  'Mountain West', 'Conference USA', 'Mid-American', 'Sun Belt - East', 'Sun Belt - West',
  'FBS Independents',
])

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const season = new URL(req.url).searchParams.get('season') ?? '2026'

    // ── NFL players ──────────────────────────────────────────
    const allNFL: any[] = await sdio(`${NFL_BASE}/scores/json/Players`)
    const nflRows: any[] = []
    const nflNames = new Set<string>()

    for (const p of allNFL) {
      const pos = NFL_POS[p.Position]
      if (!pos) continue
      if (!p.Team || !NFL_TEAM[p.Team]) continue
      if (p.Status === 'Inactive' || p.Status === 'Practice Squad') continue

      nflNames.add(p.Name.toLowerCase())
      nflRows.push({
        id:          p.PlayerID,
        name:        p.Name,
        team:        NFL_TEAM[p.Team],
        pos,
        league:      'NFL',
        conference:  NFL_CONF[p.Team] ?? null,
        status:      mapStatus(p.InjuryStatus ?? p.Status ?? ''),
        injury_note: p.InjuryBodyPart ? `${p.InjuryBodyPart}${p.InjuryNotes ? ': ' + p.InjuryNotes : ''}` : null,
        is_rookie:   p.Experience === 0,
        // Don't touch avg_pts/proj_pts/adp — those are managed by sync-projections
        updated_at:  new Date().toISOString(),
      })
    }

    // DST — one per team
    const teamEntries = Object.entries(NFL_TEAM)
    for (let i = 0; i < teamEntries.length; i++) {
      const [abbr, fullName] = teamEntries[i]
      nflRows.push({
        id:          90000 + i,
        name:        `${fullName} D/ST`,
        team:        fullName,
        pos:         'DST',
        league:      'NFL',
        conference:  NFL_CONF[abbr] ?? null,
        status:      'active',
        injury_note: null,
        is_rookie:   false,
        updated_at:  new Date().toISOString(),
      })
    }

    // ── CFB players ──────────────────────────────────────────
    const [cfbTeams, allCFB, cfbStats] = await Promise.all([
      sdio(`${CFB_BASE}/scores/json/Teams`),
      sdio(`${CFB_BASE}/scores/json/Players`),
      sdio(`${CFB_BASE}/stats/json/PlayerSeasonStats/${Number(season) - 1}`).catch(() => []),
    ])

    const teamMap = new Map<string, { name: string; conf: string }>()
    for (const t of cfbTeams) {
      if (t.Key) teamMap.set(t.Key, { name: t.School ?? t.Key, conf: t.Conference ?? '' })
    }

    const statsMap = new Map<number, any>()
    for (const s of cfbStats) statsMap.set(s.PlayerID, s)

    const cfbRows: any[] = []
    const seen = new Set<number>()

    for (const p of allCFB) {
      const pos = CFB_POS[p.Position]
      if (!pos || !p.Team) continue

      const teamInfo = teamMap.get(p.Team)
      if (!teamInfo) continue
      if (!INCLUDED_CONFS.has(teamInfo.conf) && teamInfo.conf !== '') continue

      const fullName = `${p.FirstName} ${p.LastName}`
      if (nflNames.has(fullName.toLowerCase())) continue

      if (seen.has(p.PlayerID)) continue
      seen.add(p.PlayerID)

      const stats  = statsMap.get(p.PlayerID)
      const avgPts = stats?.FantasyPoints ?? 0

      cfbRows.push({
        id:          50000000 + p.PlayerID,
        name:        fullName,
        team:        teamInfo.name,
        pos,
        league:      'CFB',
        conference:  teamInfo.conf || null,
        avg_pts:     avgPts,
        proj_pts:    avgPts,
        adp:         avgPts > 20 ? 50 : avgPts > 10 ? 100 : avgPts > 5 ? 200 : 999,
        status:      mapStatus(p.InjuryStatus ?? ''),
        injury_note: p.InjuryBodyPart ?? null,
        is_rookie:   false,
        depth_pos:   p.Class ?? null,
        updated_at:  new Date().toISOString(),
      })
    }

    const total = await upsertBatched(supabase, [...nflRows, ...cfbRows])

    return new Response(JSON.stringify({
      success: true, total,
      nfl: nflRows.length, cfb: cfbRows.length,
      syncedAt: new Date().toISOString(),
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    console.error('sync-players error:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
