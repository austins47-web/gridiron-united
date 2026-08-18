import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')!

// Call through our own sportsdata proxy which handles ESPN auth/UA correctly
async function proxyFetch(endpoint: string) {
  const r = await fetch(
    `${SUPABASE_URL}/functions/v1/sportsdata?endpoint=${encodeURIComponent(endpoint)}`,
    { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
  )
  if (!r.ok) throw new Error(`proxy ${r.status}: ${endpoint}`)
  return r.json()
}

function mapStatus(name: string): string {
  const s = name?.toLowerCase() ?? ''
  if (s.includes('progress') || s.includes('halftime') || s.includes('end_period')) return 'in_progress'
  if (s.includes('final') || s.includes('complete')) return 'final'
  return 'scheduled'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const now    = new Date()
  const season = now.getFullYear()
  const upserted: string[] = []
  const errors: string[] = []

  // For CFB we need current week — derive from date
  // CFB season: weeks 1-15 roughly, starts early Sep
  const cfbWeek = Math.max(1, Math.ceil((now.getTime() - new Date('2026-08-28').getTime()) / (7 * 24 * 60 * 60 * 1000)))
  const nflWeek = Math.max(1, Math.ceil((now.getTime() - new Date('2026-09-04').getTime()) / (7 * 24 * 60 * 60 * 1000)))

  const scoreboardSources = [
    { league: 'NFL', endpoint: 'nfl/live-scores',              week: Math.min(nflWeek, 18) },
    { league: 'CFB', endpoint: `cfb/scores/${season}/${cfbWeek}`, week: Math.min(cfbWeek, 15) },
  ]

  // Fetch both scoreboards in parallel — they don't depend on each other.
  const fetched = await Promise.all(
    scoreboardSources.map(async (s) => {
      try {
        return { ...s, data: await proxyFetch(s.endpoint) }
      } catch (e: any) {
        errors.push(`${s.league}: ${e.message}`)
        return { ...s, data: null }
      }
    })
  )

  // Build every row first, then write each league in ONE batched
  // upsert. The previous version issued a separate round trip per
  // game — 70+ sequential calls on a full CFB Saturday, which blew
  // past pg_net's 5s timeout every run.
  for (const { league, week, data } of fetched) {
    if (!data) continue

    const rows = (data.events ?? []).flatMap((event: any) => {
      const comp = event.competitions?.[0]
      if (!comp) return []
      const home = comp.competitors?.find((c: any) => c.homeAway === 'home')
      const away = comp.competitors?.find((c: any) => c.homeAway === 'away')
      return [{
        game_id:    String(event.id),
        league,
        season,
        week,
        home_team:  home?.team?.abbreviation ?? '',
        away_team:  away?.team?.abbreviation ?? '',
        home_score: parseInt(home?.score ?? '0') || 0,
        away_score: parseInt(away?.score ?? '0') || 0,
        status:     mapStatus(event.status?.type?.name ?? ''),
        start_time: event.date ? new Date(event.date).toISOString() : null,
        updated_at: now.toISOString(),
      }]
    })

    if (rows.length === 0) continue

    const { error } = await supabase
      .from('live_games')
      .upsert(rows, { onConflict: 'game_id' })

    if (error) errors.push(`${league} batch: ${error.message}`)
    else upserted.push(...rows.map((r: any) => r.game_id))
  }

  // Expire stale in_progress games
  if (upserted.length > 0) {
    await supabase.from('live_games')
      .update({ status: 'final', updated_at: now.toISOString() })
      .eq('status', 'in_progress')
      .lt('last_polled_at', new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString())
      .not('game_id', 'in', `(${upserted.map(g => `"${g}"`).join(',')})`)
  }

  return new Response(JSON.stringify({
    upserted: upserted.length,
    week_nfl: Math.min(nflWeek, 18),
    week_cfb: Math.min(cfbWeek, 15),
    ms: Date.now() - now.getTime(),
    errors,
  }), { headers: CORS })
})
