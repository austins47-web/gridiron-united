// ══════════════════════════════════════════════════════════════
// calendar — every Pick'Em pick lock as a calendar feed
//
// GET ?token=<calendar token> returns an iCalendar feed (RFC 5545) of
// when picks lock in each of the user's Pick'Em leagues, each with an
// alert an hour before — something a phone's calendar will remind
// them about whatever happens with email or push. Calendar apps poll
// it, so it answers without a login: the token (calendar_tokens,
// handed out by the calendar_token() RPC) is the key. Served at
// https://www.gridironunited.app/calendar/<token>/pickem.ics through
// a Vercel rewrite. verify_jwt is off for this function (config.toml).
//
// Locks match the app: a week's deadline (per-week override, else the
// league rule) when there is one; otherwise each game day's first
// kickoff, days in Eastern time — the same grouping as the pick
// reminders.
// ══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { nflSeasonFor, isVoid, isFinal, type Game } from '../_shared/pickemCore.ts'
import { partsInZone, weekDeadline, type LockRule } from '../_shared/pickLocks.ts'

const SITE = 'https://www.gridironunited.app'
const ET = 'America/New_York'

const weekName = (w: number) =>
  w === 19 ? 'Wild Card' : w === 20 ? 'Divisional round' : w === 21 ? 'Conference championships' : w === 22 ? 'Super Bowl' : `Week ${w}`

/** 2026-09-28T00:15:00Z → 20260928T001500Z */
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1')
const enc = new TextEncoder()
/** RFC 5545 line folding: at most 75 octets, continued with a leading space. */
function fold(line: string): string {
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    if (enc.encode(cur + ch).length > 75) { out.push(cur); cur = ' ' + ch } else cur += ch
  }
  out.push(cur)
  return out.join('\r\n')
}
const etTime = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(d) + ' ET'
const etDay = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'long' }).format(d)

serve(async (req) => {
  const token = (new URL(req.url).searchParams.get('token') ?? '').replace(/\.ics$/, '')
  if (!/^[a-f0-9]{32}$/.test(token)) return new Response('Not found', { status: 404 })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: owner } = await admin.from('calendar_tokens').select('user_id').eq('token', token).maybeSingle()
  if (!owner) return new Response('Not found', { status: 404 })

  const now = new Date()
  const season = nflSeasonFor(now)
  const { data: memberships } = await admin
    .from('league_members')
    .select('league:leagues(id, name, league_type, pick_lock_type, pick_deadline_day, pick_deadline_time, pick_deadline_tz)')
    .eq('user_id', owner.user_id)
  const leagues = (memberships ?? [])
    .map(m => m.league as unknown as (LockRule & { id: string; name: string; league_type: string }) | null)
    .filter((l): l is LockRule & { id: string; name: string; league_type: string } => !!l && l.league_type === 'pickem')

  const [{ data: gameRows }, { data: settings }] = await Promise.all([
    admin.from('nfl_games').select('id, week, game_date, home_team, away_team, home_score, away_score, status, is_tiebreaker').eq('season', season),
    leagues.length
      ? admin.from('pickem_week_settings').select('league_id, week, pick_deadline').eq('season', season).in('league_id', leagues.map(l => l.id))
      : Promise.resolve({ data: [] as { league_id: string; week: number; pick_deadline: string | null }[] }),
  ])
  const games = ((gameRows ?? []) as Game[]).filter(g => g.game_date && !isVoid(g))
  const weeks = [...new Set(games.map(g => g.week))].sort((a, b) => a - b)
  const since = now.getTime() - 14 * 86400_000

  const events: string[] = []
  const event = (uid: string, at: Date, title: string, detail: string[], week: number) => {
    const url = `${SITE}/app/pickem?week=${week}`
    events.push([
      'BEGIN:VEVENT',
      `UID:${uid}@gridironunited.app`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(at)}`,
      `DTEND:${stamp(new Date(at.getTime() + 15 * 60_000))}`,
      fold(`SUMMARY:${esc(title)}`),
      fold(`DESCRIPTION:${esc([...detail, '', `Make your picks: ${url}`].join('\n'))}`),
      fold(`URL:${url}`),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-PT1H',
      fold(`DESCRIPTION:${esc(`${title} in an hour`)}`),
      'END:VALARM',
      'END:VEVENT',
    ].join('\r\n'))
  }

  for (const lg of leagues) {
    const suffix = leagues.length > 1 ? ` (${lg.name})` : ''
    for (const wk of weeks) {
      const wkGames = games.filter(g => g.week === wk)
      if (wkGames.every(g => new Date(g.game_date).getTime() < since)) continue
      if (wkGames.every(isFinal) && wkGames.every(g => new Date(g.game_date).getTime() < now.getTime())) continue
      const override = (settings ?? []).find(s => s.league_id === lg.id && s.week === wk)?.pick_deadline
      const deadline = weekDeadline(wkGames, override, lg)
      const gameLine = (g: Game) => `${g.away_team} @ ${g.home_team} · ${etTime(new Date(g.game_date))}${g.is_tiebreaker ? ' (tiebreaker)' : ''}`
      const byKickoff = [...wkGames].sort((a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime())

      if (deadline) {
        event(`${lg.id}-${season}-w${wk}`, deadline, `🏈 ${weekName(wk)} picks lock${suffix}`,
          [`Every ${weekName(wk)} pick locks now.`, '', ...byKickoff.map(gameLine)], wk)
        continue
      }
      // Kickoff lock: one event per game day, at its first kickoff
      const byDay = new Map<string, Game[]>()
      for (const g of byKickoff) {
        const p = partsInZone(new Date(g.game_date), ET)
        const key = `${p.year}-${p.month}-${p.day}`
        byDay.set(key, [...(byDay.get(key) ?? []), g])
      }
      for (const [day, dayGames] of byDay) {
        const at = new Date(dayGames[0].game_date)
        event(`${lg.id}-${season}-w${wk}-${day}`, at, `🏈 ${weekName(wk)} picks lock: ${etDay(at)}${suffix}`,
          [`Each game locks at its kickoff; the first one's now.`, '', ...dayGames.map(gameLine)], wk)
      }
    }
  }

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    "PRODID:-//Gridiron United//Pick'Em deadlines//EN",
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${esc("Pick'Em deadlines")}`),
    fold(`X-WR-CALDESC:${esc("When your Gridiron United Pick'Em picks lock")}`),
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n')

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="pickem-deadlines.ics"',
      'Cache-Control': 'private, max-age=900',
    },
  })
})
