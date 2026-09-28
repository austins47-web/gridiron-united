// ══════════════════════════════════════════════════════════════
// shop-tv — the live Pick'Em board behind /tv/<code>
//
// GET ?token=<8-character TV code> returns everything the Shop TV page
// shows for the league's current week: every game (score, clock, win
// chance, and who in the league is riding each side once it locks),
// the live standings with each player's chance to win the week, the
// Belt, crowd picks in trouble and the pinned announcement. A TV can't
// sign in, so the code (league_tv_tokens, handed out by the
// commissioner through league_tv_token()) is the key; verify_jwt is off
// for this function (config.toml).
//
// Nobody's pick on a game that can still be picked is shown, only how
// many have picked it — the same rule as the app.
// ══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  nflSeasonFor, isVoid, isFinal, isLive, nameOf, computeWeek, computeWinOdds, computeUpsetWatch, computeBelt,
  computeStandings, weekWinners, isWeekComplete, homeWinChance, gameClockLabel,
  type Game, type Pick, type Member,
} from '../_shared/pickemCore.ts'
import { partsInZone, zonedTimeToUtc, stillPickable, weekDeadline } from '../_shared/pickLocks.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
})

const GAME_COLS = 'id, week, game_date, home_team, away_team, home_score, away_score, status, is_tiebreaker, pregame_home_wp, spread, over_under, live_home_wp, period, clock'

/**
 * The week the league is on: a week stays current until Tuesday 11:59 PM
 * Eastern after its last game (src/lib/pickemWeek.ts, which the app uses).
 */
function currentWeek(games: Game[], now: Date): number {
  const last = new Map<number, number>()
  for (const g of games) {
    if (!g.game_date || isVoid(g)) continue
    last.set(g.week, Math.max(last.get(g.week) ?? -Infinity, new Date(g.game_date).getTime()))
  }
  const weeks = [...last.keys()].sort((a, b) => a - b)
  if (weeks.length === 0) return 1
  for (const w of weeks) {
    const p = partsInZone(new Date(last.get(w)!), 'America/New_York')
    const tue = new Date(Date.UTC(p.year, p.month - 1, p.day + ((2 - p.weekday + 7) % 7)))
    const end = zonedTimeToUtc(tue.getUTCFullYear(), tue.getUTCMonth() + 1, tue.getUTCDate(), 23, 59, 'America/New_York')
    if (now < end) return w
  }
  return weeks[weeks.length - 1]
}

// A season of picks is a few pages; TVs poll every ~15s, so keep it briefly
const seasonCache = new Map<string, { at: number; picks: Pick[] }>()

async function seasonPicks(admin: ReturnType<typeof createClient>, leagueId: string, season: number): Promise<Pick[]> {
  const hit = seasonCache.get(leagueId)
  if (hit && Date.now() - hit.at < 120_000) return hit.picks
  const picks: Pick[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('pickem_picks')
      .select('game_id, user_id, week, picked_team, tiebreaker_score')
      .eq('league_id', leagueId)
      .eq('season', season)
      .order('id')
      .range(from, from + 999)
    if (error) throw error
    picks.push(...((data ?? []) as Pick[]))
    if (!data || data.length < 1000) break
  }
  seasonCache.set(leagueId, { at: Date.now(), picks })
  return picks
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const token = (new URL(req.url).searchParams.get('token') ?? '').toLowerCase()
  if (!/^[a-z2-9]{8}$/.test(token)) return json({ error: 'not found' }, 404)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: tv } = await admin.from('league_tv_tokens').select('league_id').eq('token', token).maybeSingle()
  if (!tv) return json({ error: 'not found' }, 404)

  try {
    const now = new Date()
    const season = nflSeasonFor(now)
    const [{ data: league }, { data: memberRows }, { data: gameRows }, { data: pin }] = await Promise.all([
      admin.from('leagues')
        .select('id, name, league_type, pick_lock_type, pick_deadline_day, pick_deadline_time, pick_deadline_tz')
        .eq('id', tv.league_id).maybeSingle(),
      admin.from('league_members')
        .select('user_id, profile:profiles(username, display_name, avatar_url)')
        .eq('league_id', tv.league_id),
      admin.from('nfl_games').select(GAME_COLS).eq('season', season),
      admin.from('league_pins').select('message').eq('league_id', tv.league_id).maybeSingle(),
    ])
    if (!league || league.league_type !== 'pickem') return json({ error: 'not found' }, 404)

    const members = (memberRows ?? []) as unknown as Member[]
    const avatarOf = new Map(members.map(m => [m.user_id, (m.profile as { avatar_url?: string | null } | null)?.avatar_url ?? null]))
    const games = ((gameRows ?? []) as Game[]).filter(g => g.game_date)
    const week = currentWeek(games, now)
    const wkGames = games.filter(g => g.week === week)
      .sort((a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime())

    const [{ data: settings }, allPicks] = await Promise.all([
      admin.from('pickem_week_settings').select('pick_deadline')
        .eq('league_id', league.id).eq('season', season).eq('week', week).maybeSingle(),
      seasonPicks(admin, league.id, season),
    ])
    const wkPicks = allPicks.filter(p => p.week === week)
    const isOpen = stillPickable(wkGames, now, settings?.pick_deadline, league)
    const deadline = weekDeadline(wkGames, settings?.pick_deadline, league)

    // ── The week ────────────────────────────────────────────
    const rows = computeWeek(wkGames, wkPicks, members)
    const odds = computeWinOdds(wkGames, wkPicks, rows, { isOpen, viewerId: '__league__', sims: 3000 })
    const complete = wkGames.length > 0 && isWeekComplete(wkGames)
    const started = wkGames.some(g => isLive(g) || isFinal(g))
    const winners = complete ? weekWinners(rows).map(r => r.name) : []
    const nameById = new Map(rows.map(r => [r.userId, r.name]))

    const tiles = wkGames.map(g => {
      const locked = !isOpen(g)
      const on = wkPicks.filter(p => p.game_id === g.id)
      return {
        id: g.id,
        away: g.away_team, home: g.home_team,
        awayScore: g.away_score, homeScore: g.home_score,
        state: isVoid(g) ? 'void' : isFinal(g) ? 'final' : isLive(g) ? 'live' : 'pre',
        clock: isLive(g) ? gameClockLabel(g) : null,
        kickoff: g.game_date,
        homeChance: isVoid(g) ? null : homeWinChance(g),
        spread: g.spread ?? null,
        tiebreaker: !!g.is_tiebreaker,
        picked: on.length,
        riders: locked ? {
          away: on.filter(p => p.picked_team === g.away_team).map(p => nameById.get(p.user_id) ?? 'Someone'),
          home: on.filter(p => p.picked_team === g.home_team).map(p => nameById.get(p.user_id) ?? 'Someone'),
        } : null,
      }
    })

    // ── Standings: the week once it's started, else the season ─
    const seasonGames = games.filter(g => g.week <= week)
    const belt = computeBelt(seasonGames, allPicks, members)
    const beltIds = new Set(belt?.holders.map(h => h.userId) ?? [])
    const played = rows.filter(r => r.submitted)
    const weekTable = played.map(r => ({
      userId: r.userId,
      name: r.name,
      avatarUrl: avatarOf.get(r.userId) ?? null,
      correct: r.correct,
      played: r.played,
      rank: 1 + played.filter(o => o.correct > r.correct).length,
      chance: odds?.now.get(r.userId) ?? null,
      kickoffChance: odds?.kickoff.get(r.userId) ?? null,
      belt: beltIds.has(r.userId),
      winner: winners.includes(r.name),
    }))
    const seasonRows = computeStandings(seasonGames.filter(g => g.week < week || complete), allPicks, members)
      .filter(r => r.played > 0)
    const seasonTable = seasonRows.map(r => ({
      userId: r.userId,
      name: r.name,
      avatarUrl: avatarOf.get(r.userId) ?? null,
      correct: r.correct,
      played: r.played,
      rank: 1 + seasonRows.filter(o => o.correct > r.correct).length,
      weeksWon: r.weeksWon,
      belt: beltIds.has(r.userId),
    }))

    // ── The ticker ──────────────────────────────────────────
    const visible = wkPicks.filter(p => { const g = wkGames.find(x => x.id === p.game_id); return g && !isOpen(g) })
    const upsets = computeUpsetWatch(wkGames, visible).map(u =>
      `Upset watch: ${u.crowdPicks} of ${u.pickers} took ${u.crowd}, down ${u.dogScore}–${u.crowdScore} to ${u.dog} (${Math.round(u.chance * 100)}% to come back)`)
    const nextKickoff = wkGames.filter(g => !isFinal(g) && !isLive(g) && !isVoid(g) && new Date(g.game_date) > now)[0]?.game_date ?? null

    return json({
      league: league.name,
      season,
      week,
      now: now.toISOString(),
      started,
      complete,
      winners,
      deadline: deadline?.toISOString() ?? null,
      pickedIn: played.length,
      members: members.length,
      nextKickoff,
      games: tiles,
      week_table: weekTable,
      season_table: seasonTable,
      belt: belt ? { names: belt.holders.map(h => h.name), reign: Math.max(...belt.holders.map(h => h.reign)) } : null,
      pin: pin?.message ?? null,
      upsets,
    })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
