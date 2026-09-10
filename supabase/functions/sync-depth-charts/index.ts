import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')!

// NFL only — ESPN doesn't publish depth charts for college football at
// all (confirmed directly: the CFB team page has Roster/Stats/Schedule
// tabs but no Depth Chart tab, and the equivalent API endpoint returns
// an empty stub with no positions data). CFB's role signal instead
// comes from real current-season usage share, computed directly in
// the blend job's SQL from live_player_stats - see
// 20260910163000_role_weighted_blend.sql.
const TEAM_ID: Record<string, number> = {
  ARI:22, ATL:1,  BAL:33, BUF:2,  CAR:29, CHI:3,  CIN:4,  CLE:5,
  DAL:6,  DEN:7,  DET:8,  GB:9,   HOU:34, IND:11, JAX:30, KC:12,
  LAC:24, LAR:14, LV:13,  MIA:15, MIN:16, NE:17,  NO:18,  NYG:19,
  NYJ:20, PHI:21, PIT:23, SEA:26, SF:25,  TB:27,  TEN:10, WAS:28,
}

// ESPN's depth chart is split by personnel group/formation (e.g.
// "3WR 1TE", "Base 3-4 D", "Special Teams"), and within a group, WR
// slots are further split into wr1/wr2/wr3 sub-depths (each its own
// starter + backups) rather than one flat WR ordering. Overall depth
// rank per canonical fantasy position is derived by taking, for every
// athlete, the BEST (lowest) rank they appear at across every
// group/slot that maps to that position - a player might show up in
// more than one offensive personnel package.
const POS_KEY_MAP: Record<string, string> = {
  qb: 'QB', rb: 'RB', te: 'TE', pk: 'K',
  wr1: 'WR', wr2: 'WR', wr3: 'WR',
}

function extractRanks(depthchart: any[]): Map<string, { pos: string; rank: number }> {
  // athleteId -> best {pos, rank} seen
  const best = new Map<string, { pos: string; rank: number }>()
  for (const group of depthchart ?? []) {
    for (const [slotKey, slotData] of Object.entries<any>(group.positions ?? {})) {
      const pos = POS_KEY_MAP[slotKey]
      if (!pos) continue
      const athletes: any[] = slotData.athletes ?? []
      athletes.forEach((a, idx) => {
        const rank = idx + 1
        const id = String(a.id)
        const existing = best.get(id)
        if (!existing || rank < existing.rank) best.set(id, { pos, rank })
      })
    }
  }
  return best
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const now = new Date().toISOString()

  const results = await Promise.all(
    Object.entries(TEAM_ID).map(async ([abbr, teamId]) => {
      try {
        const url = `${SUPABASE_URL}/functions/v1/sportsdata?endpoint=${encodeURIComponent(`nfl/teams/${teamId}/depthchart`)}`
        const r = await fetch(url, {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        })
        if (!r.ok) return { abbr, ranks: new Map<string, { pos: string; rank: number }>() }
        const data = await r.json()
        return { abbr, ranks: extractRanks(data.depthchart ?? []) }
      } catch {
        return { abbr, ranks: new Map<string, { pos: string; rank: number }>() }
      }
    })
  )

  // espn_athlete_id -> depth_chart_rank (NFL players store id =
  // espn_athlete_id + 1_000_000, so espn ids are derived from id
  // rather than read off the table directly)
  const rankByEspnId = new Map<number, number>()
  let teamsWithData = 0
  for (const { ranks } of results) {
    if (ranks.size > 0) teamsWithData++
    for (const [espnId, { rank }] of ranks) {
      rankByEspnId.set(Number(espnId), rank)
    }
  }

  // Pull current NFL skill-position players (paginated - see
  // sync-nfl-projections for why an unbounded select() is unsafe here).
  const allPlayers: any[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data: page, error } = await supabase
      .from('players')
      .select('id, pos')
      .eq('league', 'NFL')
      .in('pos', ['QB', 'RB', 'WR', 'TE', 'K'])
      .order('id', { ascending: true })
      .range(offset, offset + 999)
    if (error) return new Response(JSON.stringify({ error: error.message }), { headers: CORS, status: 500 })
    if (!page?.length) break
    allPlayers.push(...page)
    if (page.length < 1000) break
  }

  let updated = 0
  let matched = 0
  const errors: string[] = []
  const batchSize = 25
  for (let i = 0; i < allPlayers.length; i += batchSize) {
    const batch = allPlayers.slice(i, i + batchSize)
    const results2 = await Promise.all(batch.map(p => {
      const espnId = p.id - 1_000_000
      const rank = rankByEspnId.get(espnId) ?? null
      return supabase.from('players')
        .update({ depth_chart_rank: rank, updated_at: now })
        .eq('id', p.id)
        .then(({ error }) => ({ error, hasRank: rank !== null }))
    }))
    for (const { error, hasRank } of results2) {
      if (error) errors.push(error.message)
      else { updated++; if (hasRank) matched++ }
    }
  }

  return new Response(JSON.stringify({
    success: errors.length === 0,
    teamsWithData,
    teamsTotal: Object.keys(TEAM_ID).length,
    playersProcessed: allPlayers.length,
    playersMatchedToDepthChart: matched,
    updated,
    errors,
    syncedAt: now,
  }), { headers: CORS })
})
