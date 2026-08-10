import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')!

// Route through sportsdata proxy (handles ESPN UA/auth correctly)
async function fetchStats(espnId: number): Promise<any | null> {
  try {
    const url = `${SUPABASE_URL}/functions/v1/sportsdata?endpoint=${encodeURIComponent(`athlete/stats/NFL/${espnId}`)}`
    const r = await fetch(url, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    })
    if (!r.ok) return null
    return await r.json()
  } catch { return null }
}

// Parse ESPN career stats response into 2025 season raw stats
function parse2025Stats(data: any): Record<string, number> | null {
  if (!data?.categories) return null

  const result: Record<string, number> = {
    pass_yards: 0, pass_tds: 0, pass_ints: 0, pass_attempts: 0, pass_completions: 0,
    rush_yards: 0, rush_tds: 0, rush_attempts: 0,
    rec_yards: 0, rec_tds: 0, receptions: 0, targets: 0,
    fumbles_lost: 0, two_pt_convs: 0,
    fg_0_39: 0, fg_40_49: 0, fg_50_plus: 0, pat_made: 0, fg_miss: 0,
    games_played: 0,
  }

  for (const cat of data.categories) {
    const catName = cat.name?.toLowerCase()

    // Find the 2025 season row
    const row2025 = cat.statistics?.find((s: any) => s.season?.year === 2025)
    if (!row2025?.stats) continue

    const names: string[] = cat.names ?? []
    const vals: string[]  = row2025.stats ?? []
    const n = (key: string) => {
      const i = names.indexOf(key)
      if (i < 0) return 0
      // ESPN formats large numbers with commas: "3,668" → 3668
      const raw = String(vals[i] ?? '0').replace(/,/g, '')
      return parseFloat(raw) || 0
    }

    if (catName === 'passing') {
      result.games_played   = Math.max(result.games_played, n('gamesPlayed'))
      result.pass_yards     = n('passingYards')
      result.pass_tds       = n('passingTouchdowns')
      result.pass_ints      = n('interceptions')
      result.pass_attempts  = n('passingAttempts')
      result.pass_completions = n('completions')
    } else if (catName === 'rushing') {
      result.games_played   = Math.max(result.games_played, n('gamesPlayed'))
      result.rush_yards     = n('rushingYards')
      result.rush_tds       = n('rushingTouchdowns')
      result.rush_attempts  = n('rushingAttempts')
    } else if (catName === 'receiving') {
      result.games_played   = Math.max(result.games_played, n('gamesPlayed'))
      result.rec_yards      = n('receivingYards')
      result.rec_tds        = n('receivingTouchdowns')
      result.receptions     = n('receptions')
      result.targets        = n('receivingTargets')
    } else if (catName === 'kicking') {
      result.games_played   = Math.max(result.games_played, n('gamesPlayed'))
      // ESPN kicking: fieldGoalsMade, fieldGoalsMissed, fieldGoals (0-19, 20-29, 30-39, 40-49, 50+)
      // fieldGoalsMade/Attempted broken into ranges
      const fg0_39 = n('fieldGoalsMade0to39')  || n('fieldGoalsMade') // fallback
      const fg40_49 = n('fieldGoalsMade40to49')
      const fg50   = n('fieldGoalsMade50Plus') || n('fieldGoalsMade50to59')
      result.fg_0_39   = fg0_39
      result.fg_40_49  = fg40_49
      result.fg_50_plus = fg50
      result.fg_miss   = n('fieldGoalsMissed')
      result.pat_made  = n('extraPointsMade')
    }
  }

  // Must have played at least 1 game and had some meaningful stats
  const hasStats = result.games_played > 0 && (
    result.pass_yards > 0 || result.rush_yards > 0 ||
    result.rec_yards > 0  || result.fg_0_39 > 0 || result.pat_made > 0
  )
  return hasStats ? result : null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const params   = new URL(req.url).searchParams
  const pos      = params.get('pos')  // optional: QB, RB, WR, TE, K — or all if omitted
  const batchSize = 30                // parallel ESPN calls per batch

  // Fetch NFL players from DB (exclude DST — no individual stats)
  let q = supabase
    .from('players')
    .select('id, name, espn_athlete_id, pos')
    .eq('league', 'NFL')
    .neq('pos', 'DST')

  if (pos) q = (q as any).eq('pos', pos)

  const { data: players, error } = await q
  if (error) return new Response(JSON.stringify({ error: error.message }), { headers: CORS, status: 500 })
  if (!players?.length) return new Response(JSON.stringify({ skipped: 0, msg: `No players for pos=${pos}` }), { headers: CORS })

  console.log(`Processing ${players.length} NFL players (pos=${pos ?? 'all'})`)

  const now = new Date().toISOString()
  const projRows: any[] = []
  let fetched = 0

  // Process in parallel batches
  for (let i = 0; i < players.length; i += batchSize) {
    const batch = players.slice(i, i + batchSize)

    const results = await Promise.all(
      batch.map(async (p: any) => {
        // NFL: DB id = espnId + 1_000_000, so espnId = id - 1_000_000
        const espnId = p.espn_athlete_id ?? (p.id - 1_000_000)
        if (espnId <= 0) return { player: p, espnId, stats: null }
        const data = await fetchStats(espnId)
        const stats = data ? parse2025Stats(data) : null
        return { player: p, espnId, stats }
      })
    )

    for (const { player, espnId, stats } of results) {
      if (!stats) continue
      fetched++
      projRows.push({
        espn_athlete_id:    espnId,
        player_id:          player.id,
        season:             2025,
        games_played:       stats.games_played,
        proj_pass_yards:    stats.pass_yards,
        proj_pass_tds:      stats.pass_tds,
        proj_pass_ints:     stats.pass_ints,
        proj_pass_attempts: stats.pass_attempts,
        proj_pass_comps:    stats.pass_completions,
        proj_rush_yards:    stats.rush_yards,
        proj_rush_tds:      stats.rush_tds,
        proj_rush_attempts: stats.rush_attempts,
        proj_rec_yards:     stats.rec_yards,
        proj_rec_tds:       stats.rec_tds,
        proj_receptions:    stats.receptions,
        proj_targets:       stats.targets,
        proj_fg_0_39:       stats.fg_0_39,
        proj_fg_40_49:      stats.fg_40_49,
        proj_fg_50_plus:    stats.fg_50_plus,
        proj_pat:           stats.pat_made,
        proj_fg_miss:       stats.fg_miss,
        proj_fumbles_lost:  0, // ESPN doesn't expose fumbles cleanly in career stats
        proj_2pt_convs:     0,
        source:             'espn',
        updated_at:         now,
      })
    }

    console.log(`Batch ${Math.floor(i/batchSize)+1}: ${results.filter(r => r.stats).length}/${batch.length} had 2025 stats`)
  }

  // Upsert to player_proj_stats
  let upserted = 0
  const errors: string[] = []
  for (let i = 0; i < projRows.length; i += 200) {
    const batch = projRows.slice(i, i + 200)
    const { error: uErr } = await supabase
      .from('player_proj_stats')
      .upsert(batch, { onConflict: 'espn_athlete_id' })
    if (uErr) errors.push(uErr.message)
    else upserted += batch.length
  }

  return new Response(JSON.stringify({
    success: errors.length === 0,
    pos: pos ?? 'all',
    processed: players.length,
    fetched,
    upserted,
    errors,
    syncedAt: now,
  }), { headers: CORS })
})
