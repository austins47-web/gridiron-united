import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Daily lightweight sync: NFL projections + injuries only ───
// Runs once a day (3am UTC).
// Only fetches projections (~960 players, ~200KB) and injury report (~50KB).
// Does NOT fetch the full player list — that's sync-players (weekly).
// Total per run: ~250KB. At once/day = ~7MB/month.

const SDIO_KEY             = Deno.env.get('SPORTSDATAIO_KEY') ?? ''
const SUPABASE_URL         = Deno.env.get('APP_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const NFL_BASE = 'https://api.sportsdata.io/v3/nfl'
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const params = new URL(req.url).searchParams
    const season = params.get('season') ?? '2026'

    // Auto-compute current week
    const weekParam = params.get('week') ?? 'auto'
    const NFL_START = new Date('2026-09-03').getTime()
    const week = weekParam === 'auto'
      ? String(Math.max(1, Math.min(18, Math.floor((Date.now() - NFL_START) / (7 * 86400000)) + 1)))
      : weekParam

    // ── Fetch projections + injury report in parallel ────────
    const [projections, injuries] = await Promise.all([
      sdio(`${NFL_BASE}/projections/json/PlayerGameProjectionStatsByWeek/${season}REG/${week}`),
      sdio(`${NFL_BASE}/scores/json/InjuredPlayers`).catch(() => []),
    ])

    // Build injury map keyed by PlayerID
    const injuryMap = new Map<number, any>()
    for (const i of injuries) injuryMap.set(i.PlayerID, i)

    // ── Update proj_pts, avg_pts, adp, status, injury_note ──
    const projUpdates: any[] = []
    const dstUpdates: any[] = []

    for (const p of projections) {
      if (p.Position === 'DST') {
        // DST — update by team name
        const teamName = NFL_TEAM[p.Team]
        if (!teamName) continue
        dstUpdates.push({
          name:     `${teamName} D/ST`,
          proj_pts: p.FantasyPoints ?? 5,
          avg_pts:  p.FantasyPoints ?? 5,
          adp:      p.AverageDraftPosition ?? 150,
          updated_at: new Date().toISOString(),
        })
        continue
      }

      const injury = injuryMap.get(p.PlayerID)
      const projPts = p.FantasyPointsPPR ?? p.FantasyPoints ?? 0
      const adp     = p.AverageDraftPositionPPR ?? p.AverageDraftPosition ?? 999

      projUpdates.push({
        id:          p.PlayerID,
        proj_pts:    projPts,
        avg_pts:     projPts,
        adp,
        status:      mapStatus(injury?.Status ?? p.InjuryStatus ?? ''),
        injury_note: injury?.InjuryBodyPart
          ? `${injury.InjuryBodyPart}${injury.InjuryNotes ? ': ' + injury.InjuryNotes : ''}`
          : null,
        updated_at:  new Date().toISOString(),
      })
    }

    // Upsert projection updates in batches
    let updated = 0
    for (let i = 0; i < projUpdates.length; i += 200) {
      const batch = projUpdates.slice(i, i + 200)
      const { error } = await supabase
        .from('players')
        .upsert(batch, { onConflict: 'id', ignoreDuplicates: false })
      if (error) throw new Error(`Proj upsert failed: ${error.message}`)
      updated += batch.length
    }

    // Update DST rows by name match
    for (const dst of dstUpdates) {
      await supabase
        .from('players')
        .update({ proj_pts: dst.proj_pts, avg_pts: dst.avg_pts, adp: dst.adp, updated_at: dst.updated_at })
        .eq('name', dst.name)
        .eq('pos', 'DST')
    }

    return new Response(JSON.stringify({
      success:     true,
      projections: updated,
      dst:         dstUpdates.length,
      injuries:    injuryMap.size,
      season,
      week,
      syncedAt:    new Date().toISOString(),
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    console.error('sync-projections error:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
