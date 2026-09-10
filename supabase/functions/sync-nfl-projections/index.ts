import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')!

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Route through sportsdata proxy (handles ESPN UA/auth correctly).
// One retry after a short backoff — at the original concurrency
// (30 parallel athlete lookups per batch, ~35 batches back to back)
// the large majority of requests were failing (a solo request always
// succeeded in isolation), which looks like transient rate-limiting/
// timeouts under load rather than anything wrong with any specific
// player's data.
async function fetchStats(espnId: number, attempt = 0): Promise<any | null> {
  try {
    const url = `${SUPABASE_URL}/functions/v1/sportsdata?endpoint=${encodeURIComponent(`athlete/stats/NFL/${espnId}`)}`
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

// Parse ESPN career stats response into that player's most recent
// completed season. Was hardcoded to require a literal season.year
// === 2025 row - most players' career-stats payload simply doesn't
// have one (ESPN's coverage lags per player: some already show 2025,
// plenty still cap out at 2024, backups even earlier), so this was
// silently treating almost every player as statless. Taking whatever
// season is actually most recent for each player fixes that without
// needing to know in advance which year ESPN has for them.
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

    // Most recent season this category actually has a row for
    const rows: any[] = (cat.statistics ?? []).filter((s: any) => s.season?.year && s.stats)
    if (rows.length === 0) continue
    const latest = rows.reduce((a, b) => (b.season.year > a.season.year ? b : a))

    const names: string[] = cat.names ?? []
    const vals: string[]  = latest.stats ?? []
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

  // Must have played at least 1 game and had some meaningful stats.
  // Checks every scoring category a kicker can rack up points in —
  // this previously missed fg_40_49/fg_50_plus entirely, so a kicker
  // who'd only made long field goals (no 0-39s, no PATs recorded)
  // looked statless and got skipped.
  const hasStats = result.games_played > 0 && (
    result.pass_yards > 0 || result.rush_yards > 0 || result.rec_yards > 0 ||
    result.fg_0_39 > 0 || result.fg_40_49 > 0 || result.fg_50_plus > 0 || result.pat_made > 0
  )
  return hasStats ? result : null
}

// ── Fantasy points from raw season stats ─────────────────────
// A simplified standard/half-PPR-ish formula (no 300/100-yard bonus
// tiers — those need per-game splits, not a season total) used only
// to produce a reasonable proj_pts/ADP for every player, independent
// of any third-party projections feed. Doesn't need to match a real
// league's actual scoring rules exactly - just needs to rank players
// sensibly and not show 0 for everyone.
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
  const batchSize = 10                // parallel ESPN calls per batch — was 30, which
                                       // saw the large majority of requests fail under load
  // ESPN/the sportsdata proxy only reliably answers roughly the
  // first ~50-60 requests of any given invocation before the rest
  // start failing outright (observed directly: re-running the same
  // position repeatedly re-covers the exact same leading slice of
  // players every time, never reaching further ones) — a fresh
  // invocation gets a fresh allowance, so ?chunkOffset lets repeated
  // calls page through the full list instead of only ever retrying
  // the same first chunk.
  const chunkOffset = Number(params.get('chunkOffset') ?? 0)
  const chunkSize   = Number(params.get('chunkSize') ?? 60)

  // Fetch NFL players from DB (exclude DST — no individual stats).
  // Paginated — a single unbounded select() silently caps at 1000
  // rows, and this table has 1033+ NFL non-DST rows (current rosters
  // plus old entries from past syncs that were never cleaned up), so
  // an un-paginated fetch was arbitrarily excluding roughly 3% of
  // players from every run - real, current stars included, since
  // there's no ordering guaranteeing "current roster" sorts first.
  const allPlayers: any[] = []
  for (let offset = 0; ; offset += 1000) {
    let q = supabase
      .from('players')
      .select('id, name, espn_athlete_id, pos')
      .eq('league', 'NFL')
      .neq('pos', 'DST')
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

  console.log(`Processing ${players.length} of ${allPlayers.length} NFL players (pos=${pos ?? 'all'}, chunkOffset=${chunkOffset})`)

  const now = new Date().toISOString()
  const projRows: any[] = []
  // playerId -> per-game fantasy point average, used below to rank
  // everyone processed in this run into an ADP. Kept separate from
  // projRows since that's shaped for player_proj_stats, not players.
  const avgPtsByPlayerId = new Map<number, number>()
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

  // ── Turn those averages into proj_pts/avg_pts/adp on players ──
  // ADP here is a derived "best player available" ranking (highest
  // projected average first), not a real market-consensus ADP - but
  // every player who has any 2025 stats gets a real, non-zero number
  // instead of the fallback 999, which is what actually matters for
  // "doesn't have to be perfect but has to work for everyone".
  // Only ranks within whatever this run processed - if called with
  // ?pos=, the ranking is position-scoped, not global.
  // Excludes avgPts <= 0 - real stats but a net-zero or negative
  // fantasy total (token usage, or a couple of categories that
  // happen to cancel out) shouldn't come back as, say, "ADP #4"
  // just because everyone else in this particular chunk had no
  // stats at all - that's not a rankable player.
  const ranked = [...avgPtsByPlayerId.entries()]
    .filter(([, avgPts]) => avgPts > 0)
    .sort((a, b) => b[1] - a[1])
  const playerUpdateRows = ranked.map(([playerId, avgPts], idx) => ({
    id:        playerId,
    proj_pts:  Math.round(avgPts * 10) / 10,
    avg_pts:   Math.round(avgPts * 10) / 10,
    adp:       idx + 1,
  }))

  // Plain per-row updates, not upsert — every id here came straight
  // out of the players table moments ago, so there's nothing to
  // insert. upsert() still builds an INSERT ... ON CONFLICT under
  // the hood though, and that INSERT path requires satisfying every
  // NOT NULL column (name, team, pos, league) even when every row is
  // actually going to hit the UPDATE branch — one row that doesn't
  // cleanly conflict-match for any reason takes the whole batch's
  // "insert" down with a not-null violation on name, at which point
  // *none* of that batch's real updates land either.
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
