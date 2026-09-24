// supabase/functions/sync-nfl-schedule/index.ts
//
// The real NFL schedule, from ESPN — all 18 regular-season weeks and
// the playoffs, for whichever season it currently is.
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
// Weeks: 1–18 are the regular season. The playoffs continue the
// numbering the Pick'Em page already uses — 19 Wild Card,
// 20 Divisional, 21 Conference Championships, 22 Super Bowl. (ESPN
// numbers playoff weeks 1–5 under seasontype 3; its week 4 is the Pro
// Bowl, which isn't synced.)
//
// Each synced week also gets its tiebreaker game (the week's last
// game, via set_week_tiebreaker) if it doesn't have one yet — nothing
// else sets it, so without this a new season or the playoffs would
// have no tiebreaker.
//
// Query params:
//   ?week=N       sync one week only (1–22)
//   ?full=1       sync every week, regular season + playoffs (backfill)
//   (default)     "light" mode: just the current week + the previous one,
//                 following ESPN's current week through the playoffs —
//                 cheap enough to run on a short cron so a game going
//                 final shows up in nfl_games (and Pick'Em scoring)
//                 almost immediately
//   ?season=YYYY  default: the current season (nflSeasonFor — July–June)
//   ?dry=1        report what would change without writing

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { nflSeasonFor } from '../_shared/pickemCore.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' }
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'

// ESPN 403s bare/default-user-agent requests. Every other ESPN call
// in this codebase (the sportsdata proxy) already sends this — this
// function just hadn't been given it yet.
const ESPN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Gridiron-United/1.0)',
  'Accept': 'application/json',
}

/** Which ESPN request fills an app week. */
interface SyncTarget { appWeek: number; seasontype: 2 | 3; espnWeek: number }

// ESPN playoff week → app week (4 is the Pro Bowl — skipped)
const PLAYOFF_WEEKS: Record<number, number> = { 1: 19, 2: 20, 3: 21, 5: 22 }

function targetFor(appWeek: number): SyncTarget | null {
  if (appWeek >= 1 && appWeek <= 18) return { appWeek, seasontype: 2, espnWeek: appWeek }
  const espn = Object.keys(PLAYOFF_WEEKS).find(k => PLAYOFF_WEEKS[Number(k)] === appWeek)
  return espn ? { appWeek, seasontype: 3, espnWeek: Number(espn) } : null
}

const ALL_WEEKS = [...Array.from({ length: 18 }, (_, i) => i + 1), 19, 20, 21, 22]

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
  const season = Number(url.searchParams.get('season') ?? nflSeasonFor(new Date()))
  const dryRun = url.searchParams.get('dry') === '1'
  const oneWeek = url.searchParams.get('week')
  const fullSync = url.searchParams.get('full') === '1'

  let weeks: number[]
  if (oneWeek) {
    weeks = [Number(oneWeek)]
  } else if (fullSync) {
    weeks = ALL_WEEKS
  } else {
    // Default "light" mode: current week + the previous one, the same
    // pair detect-games checks. This is what the every-minute cron
    // actually calls (no params), so a game going final needs to show
    // up in nfl_games — and therefore Pick'Em scoring — within about a
    // minute, not wait for a full 18-week ESPN refetch. The previous
    // week is included for the same reason detect-games checks it: a
    // late-running game (Wednesday MAC game, weather delay, etc.) can
    // still be live after ESPN's own "current week" has rolled over.
    //
    // ESPN's scoreboard says which part of the season it's in: type 2
    // regular season, 3 playoffs, anything else (preseason/offseason)
    // → just keep next season's Week 1 fresh.
    let currentWeek = 1
    try {
      const wkRes = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=1`,
        { headers: ESPN_HEADERS }
      )
      if (wkRes.ok) {
        const j = await wkRes.json()
        const type = j?.season?.type
        const n = j?.week?.number ?? 1
        currentWeek = type === 3 ? (PLAYOFF_WEEKS[n] ?? 22)   // Pro Bowl week: the Super Bowl's next
          : type === 2 ? n
          : 1
      }
    } catch { /* fall back to week 1 */ }
    const prevWeek = Math.max(1, currentWeek - 1)
    weeks = prevWeek !== currentWeek ? [prevWeek, currentWeek] : [currentWeek]
  }
  const targets = weeks.map(targetFor).filter((t): t is SyncTarget => t != null)

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
    targets.map(async ({ appWeek: week, seasontype, espnWeek }) => {
      try {
        const res = await fetch(`${ESPN}?dates=${season}&seasontype=${seasontype}&week=${espnWeek}&limit=20`, { headers: ESPN_HEADERS })
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
      else {
        totalUpserted += rows.length
        // Tiebreaker: the week's last game — set once, if it has none
        const { data: tb } = await supabase
          .from('nfl_games').select('id')
          .eq('season', season).eq('week', week).eq('is_tiebreaker', true)
          .limit(1)
        if (!tb || tb.length === 0) {
          const { error: tbErr } = await supabase.rpc('set_week_tiebreaker', { p_sport: 'nfl', p_season: season, p_week: week })
          if (tbErr) errors.push(`week ${week} tiebreaker: ${tbErr.message}`)
        }
      }
    }
  }

  return new Response(JSON.stringify({
    ok: errors.length === 0,
    dryRun,
    season,
    mode: oneWeek ? 'single-week' : fullSync ? 'full' : 'light',
    weeks: targets.map(t => t.appWeek),
    weeksSynced: targets.length,
    totalUpserted,
    report,
    errors,
  }, null, 2), { headers: CORS })
})
