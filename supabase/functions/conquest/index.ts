// ══════════════════════════════════════════════════════════════
// conquest — Conquest's server side (the rules: _shared/conquest.ts)
//
// POST { action: 'start', league_id, start_week?, restart? } — signed in
//   as the commissioner: hands out capitals and colors and starts the war
//   (at the next week to kick off, unless start_week says otherwise).
// POST { action: 'resolve' } — anyone (the hourly conquest-resolve cron):
//   settles every war's finished weeks, oldest first. Each week settles
//   once (claimed by moving last_resolved_week on), so calling it again,
//   or twice at once, does nothing more.
// ══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isFinal, isVoid, isWeekComplete, winnerOf, nflSeasonFor, type Game } from '../_shared/pickemCore.ts'
import {
  TERRITORIES, MAP, hexCenter, assignCapitals, empireColor, resolveWeek,
  type ConquestState, type WeekScores,
} from '../_shared/conquest.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(url, serviceKey)
  const body = await req.json().catch(() => ({})) as { action?: string; league_id?: string; start_week?: number; restart?: boolean }

  try {
    if (body.action === 'resolve') return json(await resolveAll(admin))

    if (body.action === 'start') {
      if (typeof body.league_id !== 'string') return json({ error: 'league_id required' }, 400)
      // The commissioner, or the server itself
      const auth = req.headers.get('Authorization') ?? ''
      if (!(await isServerKey(url, serviceKey, auth))) {
        const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
        const { data: { user } } = await userClient.auth.getUser()
        if (!user) return json({ error: 'Sign in first' }, 401)
        const { data: isCommish } = await userClient.rpc('is_league_commissioner', { check_league_id: body.league_id })
        if (!isCommish) return json({ error: 'Only the commissioner can start the war' }, 403)
      }
      return await start(admin, body.league_id, body.start_week, !!body.restart)
    }
    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

/** A service-role key (whatever its format): only one can list the users. */
async function isServerKey(url: string, serviceKey: string, auth: string): Promise<boolean> {
  const key = auth.replace(/^Bearer\s+/i, '')
  if (!key) return false
  if (key === serviceKey) return true
  const probe = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 })
  return !error
}

async function membersOf(admin: SupabaseClient, leagueId: string) {
  const { data, error } = await admin
    .from('league_members')
    .select('user_id, joined_at, profile:profiles(favorite_nfl_team)')
    .eq('league_id', leagueId)
  if (error) throw error
  return (data ?? [])
    .map((m: any) => ({ userId: m.user_id as string, joined: m.joined_at as string | null, favorite: (m.profile?.favorite_nfl_team as string | null) ?? null }))
    // The longest-standing members choose first
    .sort((a, b) => (a.joined ?? '').localeCompare(b.joined ?? '') || a.userId.localeCompare(b.userId))
}

async function start(admin: SupabaseClient, leagueId: string, startWeek: number | undefined, restart: boolean) {
  const { data: league } = await admin.from('leagues').select('league_type').eq('id', leagueId).maybeSingle()
  if (league?.league_type !== 'pickem') return json({ error: 'Conquest is for Pick\'Em leagues' }, 400)
  const season = nflSeasonFor(new Date())
  const { data: existing } = await admin.from('conquest_games').select('league_id').eq('league_id', leagueId).eq('season', season).maybeSingle()
  if (existing && !restart) return json({ error: 'The war has already started' }, 409)
  if (existing) await admin.from('conquest_games').delete().eq('league_id', leagueId).eq('season', season)

  // The next week to kick off
  let week = startWeek
  if (!week) {
    const { data: next } = await admin.from('nfl_games').select('week')
      .eq('season', season).gt('game_date', new Date().toISOString()).order('game_date').limit(1).maybeSingle()
    week = next?.week ?? 1
  }

  const members = await membersOf(admin, leagueId)
  const capitals = assignCapitals(members.map(m => ({ userId: m.userId, favorite: m.favorite && MAP[m.favorite] ? m.favorite : null })))
  // Colors walk the wheel west to east, so neighbors never look alike
  const byPlace = Object.entries(capitals).sort(([, a], [, b]) => hexCenter(a)[0] - hexCenter(b)[0] || hexCenter(a)[1] - hexCenter(b)[1])
  const color = new Map(byPlace.map(([u], i) => [u, empireColor(i)]))

  const { error: gErr } = await admin.from('conquest_games').insert({ league_id: leagueId, season, start_week: week })
  if (gErr) throw gErr
  const { error: pErr } = await admin.from('conquest_players').insert(members.map(m => ({
    league_id: leagueId, season, user_id: m.userId, color: color.get(m.userId) ?? empireColor(members.length), capital: capitals[m.userId] ?? null, joined_week: week,
  })))
  if (pErr) throw pErr
  const ownerOf = new Map(Object.entries(capitals).map(([u, t]) => [t, u]))
  const { error: tErr } = await admin.from('conquest_territories').insert(TERRITORIES.map(t => ({
    league_id: leagueId, season, team: t, owner_id: ownerOf.get(t) ?? null, since_week: ownerOf.has(t) ? week : null,
  })))
  if (tErr) throw tErr
  return json({ started: true, season, start_week: week, players: members.length, capitals })
}

async function resolveAll(admin: SupabaseClient) {
  const { data: wars, error } = await admin.from('conquest_games').select('*')
  if (error) throw error
  const settled: { league: string; week: number; moves: number }[] = []
  for (const war of wars ?? []) {
    for (;;) {
      const prev: number | null = war.last_resolved_week
      const week = (prev ?? war.start_week - 1) + 1
      const { data: games } = await admin.from('nfl_games')
        .select('id, week, season, home_team, away_team, home_score, away_score, status, game_date')
        .eq('season', war.season).eq('week', week)
      if (!games?.length || !isWeekComplete(games as Game[])) break

      // Claim the week, so it only ever settles once
      let claim = admin.from('conquest_games').update({ last_resolved_week: week })
        .eq('league_id', war.league_id).eq('season', war.season)
      claim = prev == null ? claim.is('last_resolved_week', null) : claim.eq('last_resolved_week', prev)
      const { data: claimed } = await claim.select('league_id')
      if (!claimed?.length) break
      war.last_resolved_week = week

      const moves = await settleWeek(admin, war.league_id, war.season, week, games as Game[])
      settled.push({ league: war.league_id, week, moves })
    }
  }
  return { settled }
}

async function settleWeek(admin: SupabaseClient, leagueId: string, season: number, week: number, games: Game[]): Promise<number> {
  const [{ data: players }, { data: territories }, members, { data: picks }] = await Promise.all([
    admin.from('conquest_players').select('user_id, capital, color').eq('league_id', leagueId).eq('season', season),
    admin.from('conquest_territories').select('team, owner_id, besieged_by').eq('league_id', leagueId).eq('season', season),
    membersOf(admin, leagueId),
    admin.from('pickem_picks').select('user_id, game_id, picked_team').eq('league_id', leagueId).eq('season', season).eq('week', week),
  ])
  const owners: Record<string, string | null> = Object.fromEntries(TERRITORIES.map(t => [t, null]))
  const besieged: Record<string, string> = {}
  for (const t of territories ?? []) {
    owners[t.team] = t.owner_id
    if (t.besieged_by) besieged[t.team] = t.besieged_by
  }
  const memberIds = new Set(members.map(m => m.userId))
  const inWar = new Map((players ?? []).map(p => [p.user_id as string, p]))

  // Anyone who left the league: their cities go back to unclaimed
  for (const t of TERRITORIES) {
    const o = owners[t]
    if (o && !memberIds.has(o)) {
      owners[t] = null
      await admin.from('conquest_territories').update({ owner_id: null, since_week: week }).eq('league_id', leagueId).eq('season', season).eq('team', t)
    }
  }
  // Anyone new joins: a free city if there is one; if not, they start in
  // exile with a capital to rebel for (their favorite team's, or one dealt them)
  const joiners = members.filter(m => !inWar.has(m.userId))
  if (joiners.length) {
    const capitals = assignCapitals(joiners.map(m => ({ userId: m.userId, favorite: m.favorite && MAP[m.favorite] ? m.favorite : null })), owners)
    let i = inWar.size
    for (const m of joiners) {
      const capital = capitals[m.userId]
        ?? (m.favorite && MAP[m.favorite] ? m.favorite : TERRITORIES[[...m.userId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TERRITORIES.length])
      const row = { league_id: leagueId, season, user_id: m.userId, color: empireColor(i++), capital, joined_week: week }
      await admin.from('conquest_players').insert(row)
      inWar.set(m.userId, row)
      if (capitals[m.userId]) {
        owners[capital] = m.userId
        await admin.from('conquest_territories').update({ owner_id: m.userId, since_week: week }).eq('league_id', leagueId).eq('season', season).eq('team', capital)
      }
    }
  }

  // The week: correct picks on the games that were played, and who picked what
  const counted = new Map(games.filter(g => !isVoid(g) && isFinal(g)).map(g => [g.id, g]))
  const scores: WeekScores = { correct: {}, picks: {} }
  const roster = [...inWar.keys()].filter(u => memberIds.has(u))
  for (const u of roster) { scores.correct[u] = 0; scores.picks[u] = {} }
  for (const p of picks ?? []) {
    const g = counted.get(p.game_id)
    if (!g || !(p.user_id in scores.picks) || !p.picked_team) continue
    scores.picks[p.user_id][p.game_id] = p.picked_team
    if (winnerOf(g) === p.picked_team) scores.correct[p.user_id]++
  }

  const state: ConquestState = {
    owners,
    capitals: Object.fromEntries(roster.map(u => [u, inWar.get(u)!.capital as string]).filter(([, c]) => !!c)),
    besieged,
  }
  const after = resolveWeek(state, scores, roster)
  const moves = after.moves
  // Who owns what, and which capitals are under siege, after the week
  for (const t of TERRITORIES) {
    const owner = after.owners[t] ?? null
    const siege = after.besieged[t] ?? null
    if (owner === (owners[t] ?? null) && siege === (besieged[t] ?? null)) continue
    const row: Record<string, unknown> = { owner_id: owner, besieged_by: siege }
    if (owner !== (owners[t] ?? null)) row.since_week = week
    await admin.from('conquest_territories').update(row).eq('league_id', leagueId).eq('season', season).eq('team', t)
  }
  if (moves.length) {
    const { error } = await admin.from('conquest_moves').insert(moves.map(m => ({
      league_id: leagueId, season, week, kind: m.kind, team: m.team, from_user: m.from, to_user: m.to,
      score_for: m.score[0], score_against: m.score[1], exiled: !!m.exiled,
    })))
    if (error) throw error
  }
  return moves.length
}
