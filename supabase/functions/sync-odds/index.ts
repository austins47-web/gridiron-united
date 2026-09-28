// supabase/functions/sync-odds/index.ts
//
// NFL + college betting lines into public.odds_cache, from ESPN's
// scoreboard (DraftKings' line) — this week and next for each. Runs on
// a cron (every 3 hours); the client only ever reads odds_cache.
//
// This used to call The Odds API, whose free plan is 500 credits a
// month. Each run cost 6 (two sports × three markets), so at 8 runs a
// day the month's credits were gone in about 10 days and odds_cache
// sat stale for the rest of the month (last good update: Sept 20,
// 2026). ESPN's scoreboard carries the same line — spread, total and
// both moneylines — at no cost, and it's what sync-nfl-schedule
// already reads.
//
// Keys match what the app looks up: NFL "AWAY@HOME" abbreviations,
// college "Away@Home" by ESPN shortDisplayName (LiveScoresView). A game
// that has kicked off has no line on the scoreboard any more, so it's
// skipped — its last pregame line stays in the cache.
//
// ?dry=1 reports what would be written without writing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { oddsLine } from '../_shared/espn.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

// ESPN 403s requests without a browser-ish user agent (see sync-nfl-schedule)
const ESPN_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; Gridiron-United/1.0)', Accept: 'application/json' }
const BOARDS = {
  NFL: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=40',
  // groups=80: FBS
  CFB: 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=300',
} as const

interface Row {
  game_key: string
  league: 'NFL' | 'CFB'
  home_team: string
  away_team: string
  spread: number | null
  total_points: number | null
  home_win_pct: number | null
  away_win_pct: number | null
  home_moneyline: number | null
  away_moneyline: number | null
  updated_at: string
}

async function board(url: string): Promise<any> {
  const res = await fetch(url, { headers: ESPN_HEADERS })
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`)
  return res.json()
}

/** This week's scoreboard and next week's (by ESPN's own week number). */
async function twoWeeks(base: string): Promise<any[]> {
  const now = await board(base)
  const week = now?.week?.number
  const type = now?.season?.type
  const year = now?.season?.year
  const events = [...(now?.events ?? [])]
  if (week && type && year) {
    try {
      const next = await board(`${base}&dates=${year}&seasontype=${type}&week=${week + 1}`)
      events.push(...(next?.events ?? []))
    } catch { /* past the last week of the season type — this week is enough */ }
  }
  return events
}

function rowsFrom(events: any[], league: 'NFL' | 'CFB', stamp: string): Row[] {
  const rows = new Map<string, Row>()
  for (const ev of events) {
    const comp = ev?.competitions?.[0]
    const odds = comp?.odds?.[0]
    if (!comp || !odds) continue
    const home = comp.competitors?.find((c: any) => c.homeAway === 'home')?.team
    const away = comp.competitors?.find((c: any) => c.homeAway === 'away')?.team
    const key = (t: any) => (league === 'NFL' ? t?.abbreviation : t?.shortDisplayName ?? t?.displayName)
    const h = key(home), a = key(away)
    if (!h || !a) continue
    const l = oddsLine(odds)
    if (l.spread == null && l.homeMl == null && l.overUnder == null) continue
    const homePct = l.homeMl != null && l.awayMl != null && l.homeWp != null ? Math.round(l.homeWp * 100) : null
    rows.set(`${a}@${h}`, {
      game_key: `${a}@${h}`, league, home_team: h, away_team: a,
      spread: l.spread, total_points: l.overUnder,
      home_win_pct: homePct, away_win_pct: homePct == null ? null : 100 - homePct,
      home_moneyline: l.homeMl, away_moneyline: l.awayMl,
      updated_at: stamp,
    })
  }
  return [...rows.values()]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const dryRun = new URL(req.url).searchParams.get('dry') === '1'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const errors: string[] = []
  const stamp = new Date().toISOString()
  const rows: Row[] = []
  for (const league of ['NFL', 'CFB'] as const) {
    try {
      rows.push(...rowsFrom(await twoWeeks(BOARDS[league]), league, stamp))
    } catch (e) {
      errors.push(`${league}: ${String(e)}`)
    }
  }

  let upserted = 0
  if (rows.length && !dryRun) {
    const { error } = await supabase.from('odds_cache').upsert(rows, { onConflict: 'game_key' })
    if (error) errors.push(`upsert: ${error.message}`)
    else upserted = rows.length
  }

  return new Response(JSON.stringify({
    ok: errors.length === 0,
    source: 'espn',
    dryRun,
    nfl: rows.filter(r => r.league === 'NFL').length,
    cfb: rows.filter(r => r.league === 'CFB').length,
    upserted,
    sample: rows.slice(0, 3),
    errors,
  }, null, 2), { headers: CORS })
})
