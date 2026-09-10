import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── CFB projections/ADP, via ESPN (mirrors sync-nfl-projections) ──
// This used to pull raw stats from CollegeFootballData (CFBD), which
// genuinely worked and wrote real rows into player_proj_stats - but
// keyed by CFBD's own player IDs, which have no relationship to the
// ESPN athlete IDs this app's players table is built on everywhere
// else (CFB player id = 50000000 + espn_athlete_id). Those rows could
// never be joined back to a real player no matter how correct the
// stats were. And separately, exactly like the NFL version before it
// was fixed, this never wrote proj_pts/avg_pts/adp onto players at
// all - only into player_proj_stats. Rewritten to use the same ESPN
// pipeline that already works for NFL instead of a second, mismatched
// ID system.

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')!

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Route through sportsdata proxy (handles ESPN UA/auth correctly).
// One retry after a short backoff — same rate-limit behavior observed
// on the NFL side: a solo request always succeeds, but concurrent
// bursts see the majority fail transiently.
async function fetchStats(espnId: number, attempt = 0): Promise<any | null> {
  try {
    const url = `${SUPABASE_URL}/functions/v1/sportsdata?endpoint=${encodeURIComponent(`athlete/stats/CFB/${espnId}`)}`
    const r = await fetch(url, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    })
    if (!r.ok) {
      if (attempt === 0) { await sleep(400); return fetchStats(espnId, 1) }
      return null
    }
    return await r.json()
  } catch {
    if (attempt === 0) { await sleep(400); return fetchStats(espnId, 1) }
    return null
  }
}

// Parse ESPN career stats into whatever season is actually most
// recent for that player, rather than requiring a specific year —
// coverage varies a lot for CFB (transfers, redshirts, walk-ons).
function parseLatestSeasonStats(data: any): Record<string, number> | null {
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

    const rows: any[] = (cat.statistics ?? []).filter((s: any) => s.season?.year && s.stats)
    if (rows.length === 0) continue
    const latest = rows.reduce((a, b) => (b.season.year > a.season.year ? b : a))

    const names: string[] = cat.names ?? []
    const vals: string[]  = latest.stats ?? []
    const n = (key: string) => {
      const i = names.indexOf(key)
      if (i < 0) return 0
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
      const fg0_39 = n('fieldGoalsMade0to39')  || n('fieldGoalsMade')
      const fg40_49 = n('fieldGoalsMade40to49')
      const fg50   = n('fieldGoalsMade50Plus') || n('fieldGoalsMade50to59')
      result.fg_0_39   = fg0_39
      result.fg_40_49  = fg40_49
      result.fg_50_plus = fg50
      result.fg_miss   = n('fieldGoalsMissed')
      result.pat_made  = n('extraPointsMade')
    }
  }

  // CFB's category stat blocks don't include a gamesPlayed field at
  // all (unlike NFL's, which do) - result.games_played was always 0
  // here as a result, and gating on "> 0" silently failed every
  // single CFB player regardless of real production. A full college
  // regular season is a stable, known 12 games, so that's used as a
  // flat estimate purely for the per-game average below - the gate
  // itself only checks for actual non-zero production now.
  const hasStats =
    result.pass_yards > 0 || result.rush_yards > 0 || result.rec_yards > 0 ||
    result.fg_0_39 > 0 || result.fg_40_49 > 0 || result.fg_50_plus > 0 || result.pat_made > 0
  if (!hasStats) return null
  result.games_played = 12
  return result
}

// Same simplified scoring formula as sync-nfl-projections — doesn't
// need to match any real league's rules exactly, just needs to rank
// players sensibly and give everyone a real number instead of 0.
function fantasyPoints(s: Record<string, number>): number {
  return (
    s.pass_yards * 0.04 + s.pass_tds * 4 + s.pass_ints * -2 +
    s.rush_yards * 0.1  + s.rush_tds * 6 +
    s.rec_yards  * 0.1  + s.rec_tds  * 6 + s.receptions * 0.5 +
    s.fg_0_39 * 3 + s.fg_40_49 * 4 + s.fg_50_plus * 5 + s.pat_made * 1 + s.fg_miss * -1
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const params   = new URL(req.url).searchParams
  const pos      = params.get('pos')  // optional: QB, RB, WR, TE, K — or all if omitted
  const batchSize = 10                // parallel ESPN calls per batch — larger batches
                                       // saw the large majority of requests fail under load

  // ESPN/the sportsdata proxy only reliably answers roughly the
  // first ~50-60 requests of a given invocation before the rest
  // start failing outright — a fresh invocation gets a fresh
  // allowance, so chunkOffset lets repeated calls page through the
  // full (much larger, ~4000-player) CFB pool instead of only ever
  // retrying the same leading slice.
  const chunkOffset = Number(params.get('chunkOffset') ?? 0)
  const chunkSize   = Number(params.get('chunkSize') ?? 60)

  // Fetch CFB players from DB, paginated past PostgREST's 1000-row
  // default cap (this pool is ~4000 players).
  const allPlayers: any[] = []
  for (let offset = 0; ; offset += 1000) {
    let q = supabase
      .from('players')
      .select('id, name, espn_athlete_id, pos')
      .eq('league', 'CFB')
      .order('id', { ascending: true })
      .range(offset, offset + 999)
    if (pos) q = (q as any).eq('pos', pos)
    const { data: page, error } = await q
    if (error) return new Response(JSON.stringify({ error: error.message }), { headers: CORS, status: 500 })
    if (!page?.length) break
    allPlayers.push(...page)
    if (page.length < 1000) break
  }
  const players = allPlayers.slice(chunkOffset, chunkOffset + chunkSize)
  if (!players.length) {
    return new Response(JSON.stringify({ skipped: 0, totalForPos: allPlayers.length, msg: `Nothing at chunkOffset=${chunkOffset}` }), { headers: CORS })
  }

  console.log(`Processing ${players.length} of ${allPlayers.length} CFB players (pos=${pos ?? 'all'}, chunkOffset=${chunkOffset})`)

  const now = new Date().toISOString()
  const projRows: any[] = []
  const avgPtsByPlayerId = new Map<number, number>()
  let fetched = 0

  for (let i = 0; i < players.length; i += batchSize) {
    const batch = players.slice(i, i + batchSize)

    const results = await Promise.all(
      batch.map(async (p: any) => {
        // CFB: espn_athlete_id is stored directly on the row (unlike
        // NFL, no id-offset derivation needed or possible here).
        const espnId = p.espn_athlete_id
        if (!espnId || espnId <= 0) return { player: p, espnId, stats: null }
        const data = await fetchStats(espnId)
        const stats = data ? parseLatestSeasonStats(data) : null
        return { player: p, espnId, stats }
      })
    )

    for (const { player, espnId, stats } of results) {
      if (!stats) continue
      fetched++
      projRows.push({
        espn_athlete_id:    espnId,
        player_id:          player.id,
        season:             new Date().getFullYear(),
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
        proj_fumbles_lost:  0,
        proj_2pt_convs:     0,
        source:             'espn',
        updated_at:         now,
      })
      const total = fantasyPoints(stats)
      avgPtsByPlayerId.set(player.id, total / Math.max(1, stats.games_played))
    }

    console.log(`Batch ${Math.floor(i/batchSize)+1}: ${results.filter(r => r.stats).length}/${batch.length} had stats`)
    await sleep(150)
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

  // Turn those averages into proj_pts/avg_pts/adp on players — same
  // approach as sync-nfl-projections: real numbers for everyone this
  // run actually found stats for, ranked within this run (a global
  // rank across all chunks/positions gets recomputed separately in
  // one pass once every chunk has been processed).
  // Excludes avgPts <= 0 - see sync-nfl-projections for why: a net-
  // zero/negative fantasy total shouldn't come back as a low ADP
  // just because everyone else in this chunk had no stats at all.
  const ranked = [...avgPtsByPlayerId.entries()]
    .filter(([, avgPts]) => avgPts > 0)
    .sort((a, b) => b[1] - a[1])
  const playerUpdateRows = ranked.map(([playerId, avgPts], idx) => ({
    id:        playerId,
    proj_pts:  Math.round(avgPts * 10) / 10,
    avg_pts:   Math.round(avgPts * 10) / 10,
    adp:       idx + 1,
  }))

  // Plain per-row updates, not upsert — see sync-nfl-projections for
  // why upsert() is unsafe here (its INSERT path can hit players.name's
  // NOT NULL constraint even though every id already exists).
  let playersUpdated = 0
  const updateBatchSize = 25
  for (let i = 0; i < playerUpdateRows.length; i += updateBatchSize) {
    const batch = playerUpdateRows.slice(i, i + updateBatchSize)
    const results = await Promise.all(batch.map(row =>
      supabase.from('players')
        .update({ proj_pts: row.proj_pts, avg_pts: row.avg_pts, adp: row.adp, updated_at: now })
        .eq('id', row.id)
    ))
    for (const { error: pErr } of results) {
      if (pErr) errors.push(pErr.message)
      else playersUpdated++
    }
  }

  return new Response(JSON.stringify({
    success: errors.length === 0,
    pos: pos ?? 'all',
    processed: players.length,
    totalForPos: allPlayers.length,
    chunkOffset,
    nextChunkOffset: chunkOffset + players.length < allPlayers.length ? chunkOffset + players.length : null,
    fetched,
    upserted,
    playersUpdated,
    errors,
    syncedAt: now,
  }), { headers: CORS })
})
