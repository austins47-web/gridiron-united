import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SDIO_KEY  = Deno.env.get('SPORTSDATAIO_KEY') ?? ''
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const NFL = 'https://api.sportsdata.io/v3/nfl'
const HEADERS = { 'Ocp-Apim-Subscription-Key': SDIO_KEY }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Map SportsDataIO position to our PlayerPos type
function mapPos(pos: string): string | null {
  const map: Record<string, string> = {
    QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K',
    FB: 'RB', // treat fullbacks as RB
  }
  return map[pos] ?? null
}

// Map SportsDataIO team abbr to our full team name
const TEAM_MAP: Record<string, string> = {
  ARI: 'Arizona Cardinals',   ATL: 'Atlanta Falcons',
  BAL: 'Baltimore Ravens',    BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers',   CHI: 'Chicago Bears',
  CIN: 'Cincinnati Bengals',  CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys',      DEN: 'Denver Broncos',
  DET: 'Detroit Lions',       GB:  'Green Bay Packers',
  HOU: 'Houston Texans',      IND: 'Indianapolis Colts',
  JAX: 'Jacksonville Jaguars',KC:  'Kansas City Chiefs',
  LAC: 'Los Angeles Chargers',LAR: 'Los Angeles Rams',
  LV:  'Las Vegas Raiders',   MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings',   NE:  'New England Patriots',
  NO:  'New Orleans Saints',  NYG: 'New York Giants',
  NYJ: 'New York Jets',       PHI: 'Philadelphia Eagles',
  PIT: 'Pittsburgh Steelers', SEA: 'Seattle Seahawks',
  SF:  'San Francisco 49ers', TB:  'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans',    WAS: 'Washington Commanders',
}

const CONF_MAP: Record<string, string> = {
  ARI: 'NFC West',  ATL: 'NFC South', BAL: 'AFC North', BUF: 'AFC East',
  CAR: 'NFC South', CHI: 'NFC North', CIN: 'AFC North', CLE: 'AFC North',
  DAL: 'NFC East',  DEN: 'AFC West',  DET: 'NFC North', GB:  'NFC North',
  HOU: 'AFC South', IND: 'AFC South', JAX: 'AFC South', KC:  'AFC West',
  LAC: 'AFC West',  LAR: 'NFC West',  LV:  'AFC West',  MIA: 'AFC East',
  MIN: 'NFC North', NE:  'AFC East',  NO:  'NFC South', NYG: 'NFC East',
  NYJ: 'AFC East',  PHI: 'NFC East',  PIT: 'AFC North', SEA: 'NFC West',
  SF:  'NFC West',  TB:  'NFC South', TEN: 'AFC South', WAS: 'NFC East',
}

function mapStatus(s: string): string {
  if (!s || s === 'Active') return 'active'
  if (s === 'Questionable') return 'questionable'
  if (s === 'Out' || s === 'Doubtful') return 'out'
  if (s === 'IR' || s === 'PUP' || s === 'NFI') return 'ir'
  return 'active'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const season = new URL(req.url).searchParams.get('season') ?? '2026'
    const week   = new URL(req.url).searchParams.get('week')   ?? '1'

    // 1. Fetch all active NFL players
    const playersRes = await fetch(`${NFL}/scores/json/Players`, { headers: HEADERS })
    if (!playersRes.ok) throw new Error(`Players fetch failed: ${playersRes.status}`)
    const allPlayers: any[] = await playersRes.json()

    // 2. Fetch projections for this week
    const projRes = await fetch(`${NFL}/projections/json/PlayerGameProjectionStatsByWeek/${season}REG/${week}`, { headers: HEADERS })
    if (!projRes.ok) throw new Error(`Projections fetch failed: ${projRes.status}`)
    const projections: any[] = await projRes.json()

    // Build projection map keyed by PlayerID
    const projMap = new Map<number, any>()
    for (const p of projections) projMap.set(p.PlayerID, p)

    // 3. Build upsert rows — only active players with a valid position and team
    const rows: any[] = []
    for (const p of allPlayers) {
      const pos = mapPos(p.Position)
      if (!pos) continue
      if (!p.Team || !TEAM_MAP[p.Team]) continue
      if (p.Status === 'Inactive' || p.Status === 'Practice Squad') continue

      const proj = projMap.get(p.PlayerID)
      const projPts  = proj?.FantasyPointsPPR  ?? proj?.FantasyPoints ?? 0
      const adp      = proj?.AverageDraftPositionPPR ?? proj?.AverageDraftPosition ?? 999

      rows.push({
        id:           p.PlayerID,
        name:         p.Name,
        team:         TEAM_MAP[p.Team],
        pos,
        league:       'NFL',
        conference:   CONF_MAP[p.Team] ?? null,
        avg_pts:      projPts,
        proj_pts:     projPts,
        adp:          adp,
        status:       mapStatus(p.InjuryStatus ?? p.Status ?? ''),
        injury_note:  p.InjuryBodyPart ?? p.InjuryNotes ?? null,
        is_rookie:    (p.Experience ?? 0) <= 1,
        updated_at:   new Date().toISOString(),
      })
    }

    // 4. Also add DST entries (one per team)
    const teams = Object.entries(TEAM_MAP)
    for (const [abbr, fullName] of teams) {
      const dstProj = projections.find(p => p.Team === abbr && p.Position === 'DST')
      rows.push({
        id:          90000 + teams.findIndex(([a]) => a === abbr),
        name:        `${fullName} D/ST`,
        team:        fullName,
        pos:         'DST',
        league:      'NFL',
        conference:  CONF_MAP[abbr] ?? null,
        avg_pts:     dstProj?.FantasyPoints ?? 5,
        proj_pts:    dstProj?.FantasyPoints ?? 5,
        adp:         dstProj?.AverageDraftPosition ?? 150,
        status:      'active',
        injury_note: null,
        is_rookie:   false,
        updated_at:  new Date().toISOString(),
      })
    }

    // 5. Upsert in batches of 200
    let upserted = 0
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200)
      const { error } = await supabase
        .from('players')
        .upsert(batch, { onConflict: 'id' })
      if (error) throw new Error(`Upsert batch ${i/200} failed: ${error.message}`)
      upserted += batch.length
    }

    return new Response(JSON.stringify({
      success: true,
      players: upserted,
      withProjections: projMap.size,
      season,
      week,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
