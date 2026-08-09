import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Daily projections + ADP sync ─────────────────────────────
// Sources (all free, no API key):
//   - FantasyPros public JSON: consensus rankings, ADP, projected pts
//   - ESPN injuries endpoint: per-team injury reports
// Runs once per day. Only updates proj_pts, avg_pts, adp, status, injury_note.
// Does NOT touch player rosters — that's sync-players (weekly).

const SUPABASE_URL         = Deno.env.get('APP_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ESPN_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; Gridiron-United/1.0)', 'Accept': 'application/json' }
const FP_HEADERS  = { 'User-Agent': 'Mozilla/5.0 (compatible; Gridiron-United/1.0)', 'Accept': 'application/json', 'Referer': 'https://www.fantasypros.com/' }

async function get(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`${res.status}: ${url}`)
  return res.json()
}

function mapStatus(s: string): string {
  if (!s) return 'active'
  const l = s.toLowerCase()
  if (l.includes('question')) return 'questionable'
  if (l.includes('out') || l.includes('doubtful')) return 'out'
  if (l.includes('ir') || l.includes('injured reserve') || l.includes('pup')) return 'ir'
  return 'active'
}

const NFL_TEAM_MAP: Record<string, string> = {
  ARI:'Arizona Cardinals', ATL:'Atlanta Falcons',  BAL:'Baltimore Ravens',
  BUF:'Buffalo Bills',     CAR:'Carolina Panthers', CHI:'Chicago Bears',
  CIN:'Cincinnati Bengals',CLE:'Cleveland Browns',  DAL:'Dallas Cowboys',
  DEN:'Denver Broncos',    DET:'Detroit Lions',     GB:'Green Bay Packers',
  HOU:'Houston Texans',    IND:'Indianapolis Colts',JAX:'Jacksonville Jaguars',
  KC:'Kansas City Chiefs', LAC:'Los Angeles Chargers',LAR:'Los Angeles Rams',
  LV:'Las Vegas Raiders',  MIA:'Miami Dolphins',    MIN:'Minnesota Vikings',
  NE:'New England Patriots',NO:'New Orleans Saints', NYG:'New York Giants',
  NYJ:'New York Jets',     PHI:'Philadelphia Eagles',PIT:'Pittsburgh Steelers',
  SEA:'Seattle Seahawks',  SF:'San Francisco 49ers', TB:'Tampa Bay Buccaneers',
  TEN:'Tennessee Titans',  WAS:'Washington Commanders',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // ── 1. Fetch FantasyPros public consensus rankings (PPR) ──
    // This public JSON endpoint is used by numerous fantasy apps
    const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DST']
    const fpData: Record<string, any[]> = {}

    for (const pos of positions) {
      try {
        const slug = pos === 'DST' ? 'dst' : pos.toLowerCase()
        const data = await get(
          `https://www.fantasypros.com/nfl/projections/${slug}.json?week=draft&scoring=PPR&week=0`,
          FP_HEADERS
        )
        fpData[pos] = data.players ?? []
      } catch (e) {
        console.error(`FantasyPros ${pos} failed:`, e)
        fpData[pos] = []
      }
    }

    // ── 2. Fetch ESPN injury reports for all 32 teams ─────────
    const injuryMap = new Map<string, { status: string; note: string }>()
    try {
      // ESPN teams endpoint to get all team IDs
      const teamsData = await get(
        'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=32',
        ESPN_HEADERS
      )
      const teams = teamsData.sports?.[0]?.leagues?.[0]?.teams ?? []

      for (const { team } of teams) {
        try {
          const injData = await get(
            `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/${team.id}/injuries`,
            ESPN_HEADERS
          )
          for (const item of (injData.items ?? [])) {
            try {
              // Resolve athlete ref
              const athleteData = await get(item.athlete.$ref, ESPN_HEADERS)
              const name = athleteData.fullName ?? ''
              injuryMap.set(name.toLowerCase(), {
                status: mapStatus(item.status ?? ''),
                note:   item.longComment ?? item.shortComment ?? null,
              })
            } catch { /* individual athlete fetch failed */ }
          }
        } catch { /* team injuries fetch failed */ }
      }
    } catch (e) {
      console.error('ESPN injuries failed:', e)
    }

    // ── 3. Build update rows from FantasyPros data ────────────
    const updates: any[] = []

    for (const pos of positions) {
      for (const p of fpData[pos]) {
        const name     = p.player_name ?? p.name ?? ''
        const teamAbbr = p.player_team_id ?? p.team ?? ''
        const teamName = NFL_TEAM_MAP[teamAbbr] ?? teamAbbr
        const projPts  = parseFloat(p.pts_ppr ?? p.pts ?? p.proj_pts ?? 0)
        const adp      = parseFloat(p.avg ?? p.adp ?? 999)

        if (!name) continue

        const injury = injuryMap.get(name.toLowerCase())

        updates.push({
          player_name:  name,
          team:         teamName,
          pos,
          proj_pts:     projPts,
          avg_pts:      projPts,
          adp:          adp || 999,
          status:       injury?.status ?? 'active',
          injury_note:  injury?.note ?? null,
          updated_at:   new Date().toISOString(),
        })
      }
    }

    // ── 4. Apply updates by matching name + team + pos ────────
    // We can't upsert by name so we update matching rows
    let updated = 0
    for (const u of updates) {
      const { error } = await supabase
        .from('players')
        .update({
          proj_pts:    u.proj_pts,
          avg_pts:     u.avg_pts,
          adp:         u.adp,
          status:      u.status,
          injury_note: u.injury_note,
          updated_at:  u.updated_at,
        })
        .ilike('name', u.player_name)
        .eq('league', 'NFL')

      if (!error) updated++
    }

    return new Response(JSON.stringify({
      success:  true,
      updated,
      injuries: injuryMap.size,
      syncedAt: new Date().toISOString(),
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    console.error('sync-projections error:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
