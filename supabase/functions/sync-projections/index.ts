import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Daily projections + ADP sync via Sleeper API ─────────────
// Sleeper has a fully public, no-key-required API.
// Covers NFL player ADP, rankings, and projected stats.
// ESPN injuries also pulled for status updates.

const SUPABASE_URL         = Deno.env.get('APP_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; Gridiron-United/1.0)', 'Accept': 'application/json' }

async function get(url: string) {
  const res = await fetch(url, { headers: HEADERS })
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // ── 1. Sleeper players endpoint (all NFL players with ADP) ─
    // Returns a map of player_id → player object with adp data
    const [sleeperPlayers, sleeperADP] = await Promise.all([
      get('https://api.sleeper.app/v1/players/nfl'),
      get('https://api.sleeper.app/v1/stats/nfl/projections/2026/1?season_type=regular').catch(() => ({})),
    ])

    // ── 2. ESPN injury report ─────────────────────────────────
    const injuryMap = new Map<string, { status: string; note: string | null }>()
    try {
      const injData = await get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries')
      for (const team of (injData.injuries ?? [])) {
        for (const item of (team.injuries ?? [])) {
          const name = item.athlete?.displayName ?? ''
          if (name) {
            injuryMap.set(name.toLowerCase(), {
              status: mapStatus(item.status ?? ''),
              note:   item.longComment ?? item.shortComment ?? null,
            })
          }
        }
      }
    } catch (e) {
      console.error('ESPN injuries failed:', e)
    }

    // ── 3. Build updates from Sleeper data ────────────────────
    // Sleeper player objects have: full_name, team, position, 
    // fantasy_positions, search_rank, adp (in various formats)
    const updates: Array<{
      name: string
      team: string
      proj_pts: number
      adp: number
      status: string
      injury_note: string | null
    }> = []

    for (const [playerId, p] of Object.entries(sleeperPlayers as Record<string, any>)) {
      // Only active NFL skill players
      if (p.sport !== 'nfl') continue
      if (!p.active) continue
      if (!['QB','RB','WR','TE','K'].includes(p.position)) continue
      if (!p.full_name) continue

      // Get projected points from sleeper projections if available
      const proj = (sleeperADP as Record<string, any>)[playerId]
      const projPts = proj?.pts_ppr ?? proj?.pts_half_ppr ?? proj?.pts_std ?? 0

      // ADP: Sleeper provides search_rank as a proxy; they also have
      // a separate ADP endpoint per scoring type
      const adp = p.search_rank ?? 999

      const injury = injuryMap.get((p.full_name as string).toLowerCase())

      updates.push({
        name:        p.full_name,
        team:        p.team ?? '',
        proj_pts:    Number(projPts) || 0,
        adp:         Number(adp) || 999,
        status:      injury?.status ?? mapStatus(p.injury_status ?? ''),
        injury_note: injury?.note ?? p.injury_notes ?? null,
      })
    }

    // ── 4. Fetch current player IDs from DB to match by name ─
    const { data: dbPlayers } = await supabase
      .from('players')
      .select('id, name')
      .eq('league', 'NFL')
      .neq('pos', 'DST')

    // Build name → id map (lowercase for matching)
    const nameToId = new Map<string, number>()
    for (const p of (dbPlayers ?? [])) {
      nameToId.set(p.name.toLowerCase(), p.id)
    }

    // Build upsert rows matched by name
    const upsertRows: any[] = []
    for (const u of updates) {
      const id = nameToId.get(u.name.toLowerCase())
      if (!id) continue
      upsertRows.push({
        id,
        proj_pts:    u.proj_pts,
        avg_pts:     u.proj_pts,
        adp:         u.adp,
        status:      u.status,
        injury_note: u.injury_note,
        updated_at:  new Date().toISOString(),
      })
    }

    // Also apply ESPN injuries to matched players
    for (const [name, injury] of injuryMap.entries()) {
      const id = nameToId.get(name)
      if (!id) continue
      const existing = upsertRows.find(r => r.id === id)
      if (existing) {
        existing.status      = injury.status
        existing.injury_note = injury.note
      } else {
        upsertRows.push({ id, status: injury.status, injury_note: injury.note, updated_at: new Date().toISOString() })
      }
    }

    // Upsert in batches of 200
    let updated = 0
    for (let i = 0; i < upsertRows.length; i += 200) {
      const batch = upsertRows.slice(i, i + 200)
      const { error } = await supabase
        .from('players')
        .upsert(batch, { onConflict: 'id' })
      if (!error) updated += batch.length
    }

    return new Response(JSON.stringify({
      success:   true,
      updated,
      injuries:  injuryMap.size,
      players:   updates.length,
      syncedAt:  new Date().toISOString(),
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    console.error('sync-projections error:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
