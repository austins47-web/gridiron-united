import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CFBD_KEY             = Deno.env.get('CFBD_KEY')!

async function cfbd(path: string) {
  const r = await fetch(`https://api.collegefootballdata.com${path}`, {
    headers: { 'Authorization': `Bearer ${CFBD_KEY}`, 'Accept': 'application/json' }
  })
  if (!r.ok) throw new Error(`CFBD ${r.status}: ${path}`)
  return r.json()
}

// Determine stat year: use previous season as baseline during offseason,
// switch to current season once at least 3 weeks have been played
function getStatYear(): { year: number; useRolling: boolean } {
  const now = new Date()
  const month = now.getMonth() + 1 // 1-12
  // CFB season runs Sep-Jan. Jan-Aug = use previous year. Sep+ = current year
  const year = month >= 9 ? now.getFullYear() : now.getFullYear() - 1
  const useRolling = month >= 9 // rolling 4-week average during season
  return { year, useRolling }
}

// Fetch all player stats for a category and year, return as Map<playerId, Map<statType, value>>
async function fetchStats(
  year: number, category: string
): Promise<Map<number, Map<string, number>>> {
  const rows: any[] = await cfbd(
    `/stats/player/season?year=${year}&seasonType=regular&category=${category}`
  )
  const out = new Map<number, Map<string, number>>()
  for (const row of rows) {
    const pid = parseInt(row.playerId ?? '0')
    if (!pid) continue
    if (!out.has(pid)) out.set(pid, new Map())
    out.get(pid)!.set(String(row.statType).toUpperCase(), parseFloat(row.stat) || 0)
  }
  return out
}

// Fetch rolling 4-week stats (used during season for hot streak / injury recency weighting)
async function fetchRollingStats(
  year: number, category: string, currentWeek: number
): Promise<Map<number, Map<string, number>>> {
  const startWeek = Math.max(1, currentWeek - 3)
  const rows: any[] = await cfbd(
    `/stats/player/season?year=${year}&seasonType=regular&category=${category}&startWeek=${startWeek}&endWeek=${currentWeek}`
  )
  const out = new Map<number, Map<string, number>>()
  for (const row of rows) {
    const pid = parseInt(row.playerId ?? '0')
    if (!pid) continue
    if (!out.has(pid)) out.set(pid, new Map())
    out.get(pid)!.set(String(row.statType).toUpperCase(), parseFloat(row.stat) || 0)
  }
  return out
}

// Fetch games played per player (to calculate per-game averages)
async function fetchGamesPlayed(year: number): Promise<Map<number, number>> {
  const rows: any[] = await cfbd(
    `/stats/player/season?year=${year}&seasonType=regular&category=passing`
  )
  const out = new Map<number, number>()
  // CFBD doesn't expose games played directly — infer from ATT > 0 rows
  // Instead fetch team game counts and use that as proxy
  // For accuracy: use the player_game endpoint to count distinct games
  // For efficiency: use team season game count (all players on team played same # of games approx)
  // We'll use a flat estimate of 12 games for full season, fewer if recent
  const now = new Date()
  const month = now.getMonth() + 1
  const gamesEstimate = month >= 1 && month <= 1 ? 14 // bowl season complete
    : month >= 12 ? 13
    : month >= 11 ? 11
    : month >= 10 ? 9
    : month >= 9  ? 3
    : 12 // offseason: use full season
  for (const row of rows) {
    const pid = parseInt(row.playerId ?? '0')
    if (pid && !out.has(pid)) out.set(pid, gamesEstimate)
  }
  return out
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { year, useRolling } = getStatYear()

  // Get current CFB week if in-season
  let currentWeek = 1
  if (useRolling) {
    const weeksSinceStart = Math.ceil(
      (Date.now() - new Date(`${year}-08-28`).getTime()) / (7 * 24 * 60 * 60 * 1000)
    )
    currentWeek = Math.max(1, Math.min(weeksSinceStart, 15))
  }

  console.log(`Syncing CFB projections: year=${year} useRolling=${useRolling} week=${currentWeek}`)

  // Fetch all stat categories in parallel (3-4 CFBD API calls total)
  const [passingStats, rushingStats, receivingStats, gamesPlayed] = await Promise.all([
    fetchStats(year, 'passing'),
    fetchStats(year, 'rushing'),
    fetchStats(year, 'receiving'),
    fetchGamesPlayed(year),
  ])

  // If in-season, also fetch rolling stats for recency weighting
  let rollingPassing = new Map<number, Map<string, number>>()
  let rollingRushing = new Map<number, Map<string, number>>()
  let rollingReceiving = new Map<number, Map<string, number>>()

  if (useRolling && currentWeek >= 4) {
    ;[rollingPassing, rollingRushing, rollingReceiving] = await Promise.all([
      fetchRollingStats(year, 'passing',  currentWeek),
      fetchRollingStats(year, 'rushing',  currentWeek),
      fetchRollingStats(year, 'receiving', currentWeek),
    ])
  }

  // Collect all unique player IDs across all categories
  const allPlayerIds = new Set<number>([
    ...passingStats.keys(),
    ...rushingStats.keys(),
    ...receivingStats.keys(),
  ])

  console.log(`Total unique players with stats: ${allPlayerIds.size}`)

  // Build projection rows
  const rows: any[] = []
  const now = new Date().toISOString()

  for (const playerId of allPlayerIds) {
    const games = gamesPlayed.get(playerId) ?? 12

    // Full season stats
    const pass = passingStats.get(playerId)
    const rush = rushingStats.get(playerId)
    const recv = receivingStats.get(playerId)

    // Rolling stats (if available — use 50/50 blend with season for stability)
    const rPass = rollingPassing.get(playerId)
    const rRush = rollingRushing.get(playerId)
    const rRecv = rollingReceiving.get(playerId)

    const blend = (season: number, rolling: number | undefined, rollingGames = 4) => {
      if (rolling === undefined || !useRolling) return season
      // Weight rolling 4-week average 60%, full season 40%
      const seasonPG = season / Math.max(games, 1)
      const rollingPG = rolling / Math.max(rollingGames, 1)
      return ((seasonPG * 0.4) + (rollingPG * 0.6)) * games
    }

    const g = (m: Map<string, number> | undefined, key: string) => m?.get(key) ?? 0

    const row: any = {
      espn_athlete_id:    playerId,
      season:             year,
      games_played:       games,
      source:             'cfbd',
      updated_at:         now,

      // Passing
      proj_pass_yards:    blend(g(pass, 'YDS'),         g(rPass, 'YDS')),
      proj_pass_tds:      blend(g(pass, 'TD'),          g(rPass, 'TD')),
      proj_pass_ints:     blend(g(pass, 'INT'),         g(rPass, 'INT')),
      proj_pass_attempts: blend(g(pass, 'ATT'),         g(rPass, 'ATT')),
      proj_pass_comps:    blend(g(pass, 'COMPLETIONS'), g(rPass, 'COMPLETIONS')),

      // Rushing
      proj_rush_yards:    blend(g(rush, 'YDS'), g(rRush, 'YDS')),
      proj_rush_tds:      blend(g(rush, 'TD'),  g(rRush, 'TD')),
      proj_rush_attempts: blend(g(rush, 'CAR'), g(rRush, 'CAR')),

      // Receiving
      proj_rec_yards:   blend(g(recv, 'YDS'), g(rRecv, 'YDS')),
      proj_rec_tds:     blend(g(recv, 'TD'),  g(rRecv, 'TD')),
      proj_receptions:  blend(g(recv, 'REC'), g(rRecv, 'REC')),

      // Misc (no CFBD source — leave at 0, will be updated mid-season)
      proj_fumbles_lost: 0,
      proj_2pt_convs:    0,
    }

    // Only include players with meaningful stats (filter out FCS teams etc.)
    const hasMeaningfulStats =
      row.proj_pass_yards > 0 || row.proj_rush_yards > 0 || row.proj_rec_yards > 0

    if (hasMeaningfulStats) rows.push(row)
  }

  console.log(`Projection rows to upsert: ${rows.length}`)

  // Upsert in batches of 200
  let upserted = 0
  const errors: string[] = []

  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200)
    const { error } = await supabase
      .from('player_proj_stats')
      .upsert(batch, { onConflict: 'espn_athlete_id' })
    if (error) {
      errors.push(`Batch ${Math.floor(i / 200)}: ${error.message}`)
    } else {
      upserted += batch.length
    }
  }

  return new Response(
    JSON.stringify({
      success: errors.length === 0,
      year, useRolling, currentWeek,
      totalPlayers: allPlayerIds.size,
      upserted,
      errors,
      syncedAt: now,
    }),
    { headers: CORS }
  )
})
