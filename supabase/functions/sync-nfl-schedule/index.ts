// supabase/functions/sync-nfl-schedule/index.ts
//
// The real 2026 NFL schedule, from ESPN, all 18 weeks.
//
// nfl_games previously had no sync function at all — it was seeded
// once outside this codebase, with real errors: teams appearing in
// 2-3 games in the same week, some weeks short several games, week
// 18 missing outright. Since nothing wrote to it, scores/status also
// never updated once games were actually played, so Pick'Em grading
// would have silently stayed 0-0 all season.
//
// Upserts on espn_event_id (not team names), so re-running this
// UPDATES existing rows in place — a row's uuid stays stable across
// syncs, which means any pick already made against a game survives
// every future refresh. Run this on a cron during the season so
// scores/status flow in as games complete.
//
// Query params:
//   ?week=N       sync one week only (default: 1-18, everything)
//   ?season=YYYY  default 2026
//   ?dry=1        report what would change without writing

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' }
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'

// ESPN 403s bare/default-user-agent requests. Every other ESPN call
// in this codebase (the sportsdata proxy) already sends this — this
// function just hadn't been given it yet.
const ESPN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Gridiron-United/1.0)',
  'Accept': 'application/json',
}

function mapStatus(name: string): string {
  const n = (name || '').toUpperCase()
  if (n.includes('FINAL')) return 'final'
  if (n.includes('IN_PROGRESS') || n.includes('HALFTIME')) return 'in_progress'
  if (n.includes('POSTPONED') || n.includes('CANCELED')) return 'postponed'
  return 'scheduled'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)
  const season = Number(url.searchParams.get('season') ?? 2026)
  const dryRun = url.searchParams.get('dry') === '1'
  const oneWeek = url.searchParams.get('week')
  const weeks = oneWeek ? [Number(oneWeek)] : Array.from({ length: 18 }, (_, i) => i + 1)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const report: any[] = []
  const errors: string[] = []
  let totalUpserted = 0

  // Fetch every week in parallel — 18 requests to ESPN, not 18
  // sequential round trips.
  const fetched = await Promise.all(
    weeks.map(async (week) => {
      try {
        const res = await fetch(`${ESPN}?dates=${season}&seasontype=2&week=${week}&limit=20`, { headers: ESPN_HEADERS })
        if (!res.ok) return { week, error: `ESPN ${res.status}` }
        return { week, data: await res.json() }
      } catch (e) {
        return { week, error: String(e) }
      }
    })
  )

  for (const { week, data, error } of fetched) {
    if (error || !data) { errors.push(`week ${week}: ${error}`); continue }

    const rows: any[] = []
    const seenTeamsThisWeek = new Set<string>()

    for (const ev of data.events ?? []) {
      const comp = ev.competitions?.[0]
      if (!comp) continue
      const home = comp.competitors?.find((c: any) => c.homeAway === 'home')
      const away = comp.competitors?.find((c: any) => c.homeAway === 'away')
      if (!home || !away) continue

      const homeAbbr = home.team?.abbreviation ?? '??'
      const awayAbbr = away.team?.abbreviation ?? '??'

      // A real NFL week can never have a team play twice. If ESPN
      // ever returns that, something upstream is wrong — skip rather
      // than write a schedule we know is impossible, same class of
      // bug this whole sync exists to fix.
      if (seenTeamsThisWeek.has(homeAbbr) || seenTeamsThisWeek.has(awayAbbr)) {
        errors.push(`week ${week}: ESPN listed ${awayAbbr}@${homeAbbr} but one of those teams already has a game this week — skipped`)
        continue
      }
      seenTeamsThisWeek.add(homeAbbr)
      seenTeamsThisWeek.add(awayAbbr)

      rows.push({
        espn_event_id: String(ev.id),
        season,
        week,
        game_date: ev.date,
        home_team: homeAbbr,
        away_team: awayAbbr,
        home_score: home.score != null ? Number(home.score) : null,
        away_score: away.score != null ? Number(away.score) : null,
        status: mapStatus(comp.status?.type?.name ?? ev.status?.type?.name ?? ''),
      })
    }

    report.push({
      week,
      espnGames: (data.events ?? []).length,
      written: rows.length,
      teamsInvolved: seenTeamsThisWeek.size,
      sample: rows.slice(0, 2).map(r => `${r.away_team}@${r.home_team}`),
    })

    if (!dryRun && rows.length) {
      const { error: upErr } = await supabase
        .from('nfl_games')
        .upsert(rows, { onConflict: 'espn_event_id' })
      if (upErr) errors.push(`week ${week} upsert: ${upErr.message}`)
      else totalUpserted += rows.length
    }
  }

  return new Response(JSON.stringify({
    ok: errors.length === 0,
    dryRun,
    season,
    weeksSynced: weeks.length,
    totalUpserted,
    report,
    errors,
  }, null, 2), { headers: CORS })
})
