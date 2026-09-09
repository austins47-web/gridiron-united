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

  // Discover the real current week from ESPN directly, rather than
  // computing it from a hardcoded season-start date. That approach
  // (Math.ceil((now - '2026-08-28') / 7 days)) had already drifted
  // wrong by the time this was checked — it computed Week 2 while
  // the real season, and every actual live game, was still in Week
  // 1. That meant this function was fetching the wrong week's
  // scoreboard entirely, never finding any real games to seed
  // live_games with — which is the actual reason fantasy points had
  // nothing downstream to ever calculate from at all.
  const [nflWeekData, cfbWeekData] = await Promise.all([
    proxyFetch('nfl/current-week').catch(() => null),
    proxyFetch('cfb/current-week').catch(() => null),
  ])
  const nflWeek = nflWeekData?.week ?? 1
  const cfbWeek = cfbWeekData?.week ?? 1
  // The previous week too — not just the current one. Confirmed
  // this is a real, active problem: a late-running game from the
  // prior week (this exact SMU/FSU game, scheduled for a Wednesday
  // while the rest of its week played over the weekend) stayed
  // stuck at 'in_progress' forever the moment ESPN's own current
  // week advanced past it, because this function had stopped
  // querying that week's scoreboard entirely — nothing ever checked
  // its status again, even though it had genuinely gone final.
  // Skipped when it would just duplicate the current week (Week 1
  // has no real "previous" week to check).
  const prevNflWeek = Math.max(1, nflWeek - 1)
  const prevCfbWeek = Math.max(0, cfbWeek - 1)

  const scoreboardSources = [
    { league: 'NFL', endpoint: 'nfl/live-scores',                    week: Math.min(nflWeek, 18) },
    { league: 'CFB', endpoint: `cfb/scores/${season}/${cfbWeek}`,     week: Math.min(cfbWeek, 15) },
    ...(prevNflWeek !== nflWeek ? [{ league: 'NFL', endpoint: `nfl/scores/${season}/${prevNflWeek}`, week: prevNflWeek }] : []),
    ...(prevCfbWeek !== cfbWeek ? [{ league: 'CFB', endpoint: `cfb/scores/${season}/${prevCfbWeek}`, week: prevCfbWeek }] : []),
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
