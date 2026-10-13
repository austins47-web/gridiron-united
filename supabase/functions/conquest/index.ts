// ══════════════════════════════════════════════════════════════
// conquest — Conquest's server side (the rules: _shared/conquest.ts)
//
// POST { action: 'start', league_id, start_week?, restart? } — signed in
//   as the commissioner: hands out capitals and colors and starts the war
//   (at the next week to kick off, unless start_week says otherwise).
// POST { action: 'target', league_id, target } — signed in, at war: your
//   attack this week (target: the empire's user id, or null for the
//   automatic pick). Only an empire on your border, and only before the
//   week's first kickoff.
// POST { action: 'claim', league_id, team } — the same for your flag: the
//   unclaimed city next to you you'd claim if you finish in the top half
//   (null: automatic).
// POST { action: 'resolve' } — anyone (the hourly conquest-resolve cron):
//   settles every war's finished weeks, oldest first, up to its final week
//   (then crowns the season's titles). Each week settles once (claimed by
//   moving last_resolved_week on), so calling it again, or twice at once,
//   does nothing more.
// POST { action: 'sofar', token } (the Shop TV) or { action: 'sofar',
//   league_id } (signed in, a member): this week as it stands — what
//   settling it now would do, from the games finished so far, saved
//   nowhere. For the War Office's poster and newsreel before Monday night.
// ══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isFinal, isVoid, isWeekComplete, winnerOf, nflSeasonFor, tiebreakerTotal, type Game } from '../_shared/pickemCore.ts'
import { sendWebPush, type VapidKeys } from '../_shared/webPush.ts'
import {
  TERRITORIES, POS, CITY, assignCapitals, balanceCapitals, startOdds, empireColor, outpostFor, tiebreak, SECOND_FRONT_AT, resolveWeek, citiesOf, neighborsOf, titles,
  ADJ, type ConquestState, type WeekScores, type Orders, type Claims, type Move,
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
  const body = await req.json().catch(() => ({})) as {
    action?: string; league_id?: string; token?: string; start_week?: number; restart?: boolean; target?: string | null; team?: string | null
    on?: boolean; to?: string; give?: string; get?: string; trade_id?: string; accept?: boolean
  }

  try {
    if (body.action === 'resolve') return json(await resolveAll(admin))

    if (body.action === 'sofar') {
      let leagueId: string | null = null
      if (typeof body.token === 'string' && body.token) {
        const { data } = await admin.from('league_tv_tokens').select('league_id').eq('token', body.token).maybeSingle()
        leagueId = (data?.league_id as string | undefined) ?? null
      } else if (typeof body.league_id === 'string') {
        const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
        const { data: { user } } = await userClient.auth.getUser()
        if (!user) return json({ error: 'Sign in first' }, 401)
        const { data: member } = await admin.from('league_members').select('user_id').eq('league_id', body.league_id).eq('user_id', user.id).maybeSingle()
        if (member) leagueId = body.league_id
      }
      if (!leagueId) return json({ error: 'Not your league' }, 403)
      return json({ sofar: await soFar(admin, leagueId) })
    }

    if (body.action === 'target' || body.action === 'claim' || body.action === 'fortify' || body.action === 'tribute' || body.action === 'ambush' || body.action === 'second') {
      if (typeof body.league_id !== 'string') return json({ error: 'league_id required' }, 400)
      const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
      const { data: { user } } = await userClient.auth.getUser()
      if (!user) return json({ error: 'Sign in first' }, 401)
      const team = typeof body.team === 'string' ? body.team : null
      return await setOrder(admin, body.league_id, user.id,
        body.action === 'target' ? { target: typeof body.target === 'string' ? body.target : null }
          : body.action === 'claim' ? { claim: team }
            : body.action === 'fortify' ? { fortify: !!body.on }
              : body.action === 'ambush' ? { ambush: typeof body.target === 'string' ? body.target : null }
                : body.action === 'second' ? { target2: typeof body.target === 'string' ? body.target : null }
                  : { tribute: team })
    }

    if (body.action === 'trade_offer' || body.action === 'trade_reply' || body.action === 'trade_cancel') {
      if (typeof body.league_id !== 'string') return json({ error: 'league_id required' }, 400)
      const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
      const { data: { user } } = await userClient.auth.getUser()
      if (!user) return json({ error: 'Sign in first' }, 401)
      if (body.action === 'trade_offer') {
        if (typeof body.to !== 'string' || typeof body.give !== 'string' || typeof body.get !== 'string') return json({ error: 'to, give and get required' }, 400)
        return await tradeOffer(admin, body.league_id, user.id, body.to, body.give, body.get)
      }
      if (typeof body.trade_id !== 'string') return json({ error: 'trade_id required' }, 400)
      return body.action === 'trade_reply'
        ? await tradeReply(admin, body.league_id, user.id, body.trade_id, !!body.accept)
        : await tradeCancel(admin, body.league_id, user.id, body.trade_id)
    }

    if (body.action === 'balance') {
      if (typeof body.league_id !== 'string') return json({ error: 'league_id required' }, 400)
      const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
      const { data: { user } } = await userClient.auth.getUser()
      if (!user) return json({ error: 'Sign in first' }, 401)
      const { data: isCommish } = await userClient.rpc('is_league_commissioner', { check_league_id: body.league_id })
      if (!isCommish) return json({ error: 'Only the commissioner can move capitals' }, 403)
      return await balance(admin, body.league_id)
    }

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
  const placed = assignCapitals(members.map(m => ({ userId: m.userId, favorite: m.favorite && POS[m.favorite] ? m.favorite : null })))
  // Then a fair start: anyone not on their favorite team's city can be moved to even out
  // everyone's chances (someone placed near a favorite that was taken, only if it's clearly better)
  const favorite = new Map(members.map(m => [m.userId, m.favorite]))
  const keep = new Set(Object.keys(placed).filter(u => placed[u] === favorite.get(u)))
  const nearFavorite = new Set(Object.keys(placed).filter(u => !keep.has(u) && favorite.get(u)))
  const { capitals, moves: balanced } = balanceCapitals(placed, keep, nearFavorite)
  // Colors walk the wheel west to east, so neighbors never look alike
  const byPlace = Object.entries(capitals).sort(([, a], [, b]) => POS[a][0] - POS[b][0] || POS[a][1] - POS[b][1])
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
  return json({ started: true, season, start_week: week, players: members.length, capitals, balanced, odds: startOdds(Object.values(capitals)) })
}

/**
 * Evens out the starts (the commissioner's call, before the war's first
 * kickoff, so no battle's been fought on the old map): anyone not on their
 * favorite team's city can move to an open one, the moves that help most
 * (balanceCapitals). Their old capital goes back to open land.
 */
async function balance(admin: SupabaseClient, leagueId: string) {
  const season = nflSeasonFor(new Date())
  const { data: war } = await admin.from('conquest_games').select('start_week, last_resolved_week')
    .eq('league_id', leagueId).eq('season', season).maybeSingle()
  if (!war) return json({ error: 'No war yet' }, 404)
  const { data: first } = await admin.from('nfl_games').select('game_date')
    .eq('season', season).eq('week', war.start_week).order('game_date').limit(1).maybeSingle()
  if (war.last_resolved_week != null || (first && Date.now() >= new Date(first.game_date as string).getTime())) {
    return json({ error: 'The war’s first battles have begun: capitals stay where they are' }, 409)
  }
  const [{ data: players }, members] = await Promise.all([
    admin.from('conquest_players').select('user_id, capital').eq('league_id', leagueId).eq('season', season),
    membersOf(admin, leagueId),
  ])
  const favorite = new Map(members.map(m => [m.userId, m.favorite]))
  const placed: Record<string, string> = Object.fromEntries((players ?? []).filter(p => p.capital).map(p => [p.user_id as string, p.capital as string]))
  const keep = new Set(Object.keys(placed).filter(u => placed[u] === favorite.get(u)))
  const nearFavorite = new Set(Object.keys(placed).filter(u => !keep.has(u) && favorite.get(u)))
  const { capitals, moves } = balanceCapitals(placed, keep, nearFavorite)
  for (const m of moves) {
    await admin.from('conquest_players').update({ capital: m.to }).eq('league_id', leagueId).eq('season', season).eq('user_id', m.userId)
    await admin.from('conquest_territories').update({ owner_id: null, since_week: null, besieged_by: null }).eq('league_id', leagueId).eq('season', season).eq('team', m.from)
    await admin.from('conquest_territories').update({ owner_id: m.userId, since_week: war.start_week, besieged_by: null }).eq('league_id', leagueId).eq('season', season).eq('team', m.to)
  }
  return json({ moves, odds: startOdds(Object.values(capitals)) })
}

/** The week's orders besides attacks and flags: who's dug in, and who's paying tribute with what */
function otherOrders(rows: { user_id: string; fortify?: boolean | null; tribute?: string | null; ambush?: string | null; target2?: string | null }[]) {
  return {
    fortified: rows.filter(o => o.fortify).map(o => o.user_id),
    tributes: Object.fromEntries(rows.filter(o => o.tribute).map(o => [o.user_id, o.tribute as string])),
    ambushes: Object.fromEntries(rows.filter(o => o.ambush).map(o => [o.user_id, o.ambush as string])),
    seconds: Object.fromEntries(rows.filter(o => o.target2).map(o => [o.user_id, o.target2 as string])),
  }
}

/** The week being played, if its orders (and trades) are still open: before its first kickoff. */
async function openWeek(admin: SupabaseClient, leagueId: string, season: number): Promise<{ week: number } | Response> {
  const { data: war } = await admin.from('conquest_games').select('start_week, last_resolved_week, final_week')
    .eq('league_id', leagueId).eq('season', season).maybeSingle()
  if (!war) return json({ error: 'No war going on' }, 404)
  const week = (war.last_resolved_week ?? war.start_week - 1) + 1
  if (week > war.final_week) return json({ error: 'The war is over' }, 409)
  const { data: first } = await admin.from('nfl_games').select('game_date')
    .eq('season', season).eq('week', week).order('game_date').limit(1).maybeSingle()
  if (first && new Date(first.game_date).getTime() <= Date.now()) return json({ error: 'Trades close at the week’s first kickoff and reopen once it settles' }, 409)
  return { week }
}

async function nameOfUser(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin.from('profiles').select('display_name, username').eq('id', userId).maybeSingle()
  return (data?.display_name as string | undefined)?.trim() || (data?.username as string | undefined) || 'Someone'
}

/** A trade's news to one player: in the app, and to their phone unless they've turned war telegrams off. */
async function tellTrade(admin: SupabaseClient, leagueId: string, userId: string, from: string, title: string, body: string) {
  await admin.from('notifications').insert({
    user_id: userId, league_id: leagueId, type: 'conquest_trade', title, body, is_read: false,
    data: { league_id: leagueId }, sender_id: from,
  })
  const { data: prefs } = await admin.from('notification_preferences')
    .select('league_id, notify_conquest, updated_at').eq('user_id', userId).order('updated_at', { ascending: false })
  const pref = (prefs ?? []).find(p => p.league_id === leagueId) ?? (prefs ?? []).find(p => p.league_id === null)
  const vapid: VapidKeys = {
    publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
    privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
    subject: Deno.env.get('VAPID_SUBJECT') ?? 'https://www.gridironunited.app',
  }
  if (pref?.notify_conquest === false || !vapid.publicKey || !vapid.privateKey) return
  const path = '/app/war'
  const payload = JSON.stringify({ title: `🤝 ${title}`, body, url: path, tag: `conquest-trade-${leagueId}`, icon: '/icons/notify/reminder.png' })
  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId)
  for (const s of subs ?? []) {
    try {
      const r = await sendWebPush(s, payload, vapid, { ttlSec: 24 * 3600, urgency: 'normal' })
      if (r.gone) await admin.from('push_subscriptions').delete().eq('id', s.id)
    } catch { /* one phone's trouble isn't the trade's */ }
  }
}

/**
 * Offer a trade: one of your cities for one of theirs, neither a capital,
 * before the week's first kickoff. Three open offers at most.
 */
async function tradeOffer(admin: SupabaseClient, leagueId: string, userId: string, to: string, give: string, get: string) {
  const season = nflSeasonFor(new Date())
  const open = await openWeek(admin, leagueId, season)
  if (open instanceof Response) return open
  if (to === userId) return json({ error: 'Trade with someone else' }, 400)
  const [{ data: players }, { data: cities }, { data: mine }] = await Promise.all([
    admin.from('conquest_players').select('user_id, capital').eq('league_id', leagueId).eq('season', season).in('user_id', [userId, to]),
    admin.from('conquest_territories').select('team, owner_id').eq('league_id', leagueId).eq('season', season).in('team', [give, get]),
    admin.from('conquest_trades').select('id, to_user, give_team, get_team').eq('league_id', leagueId).eq('season', season).eq('status', 'pending').eq('from_user', userId),
  ])
  const capital = new Map((players ?? []).map(p => [p.user_id as string, p.capital as string | null]))
  if (!capital.has(userId) || !capital.has(to)) return json({ error: 'You both have to be in the war' }, 400)
  const owner = new Map((cities ?? []).map(c => [c.team as string, c.owner_id as string | null]))
  if (owner.get(give) !== userId) return json({ error: 'That city isn’t yours' }, 400)
  if (owner.get(get) !== to) return json({ error: 'That city isn’t theirs' }, 400)
  if (give === capital.get(userId) || get === capital.get(to)) return json({ error: 'Capitals can’t be traded' }, 400)
  if ((mine ?? []).length >= 3) return json({ error: 'You have three offers out already: cancel one first' }, 409)
  if ((mine ?? []).some(t => t.to_user === to && t.give_team === give && t.get_team === get)) return json({ error: 'You’ve already offered that' }, 409)
  const { data: trade, error } = await admin.from('conquest_trades')
    .insert({ league_id: leagueId, season, week: open.week, from_user: userId, to_user: to, give_team: give, get_team: get })
    .select('id').single()
  if (error) throw error
  const who = await nameOfUser(admin, userId)
  await tellTrade(admin, leagueId, to, userId, `${who} offers a trade`, `${CITY[give] ?? give} for your ${CITY[get] ?? get}. Answer before the week’s first kickoff.`)
  return json({ trade: trade.id })
}

/** Accept or decline a trade offered to you. Accepted, the two cities swap at once (conquest_apply_trade). */
async function tradeReply(admin: SupabaseClient, leagueId: string, userId: string, tradeId: string, accept: boolean) {
  const season = nflSeasonFor(new Date())
  const { data: t } = await admin.from('conquest_trades').select('*').eq('id', tradeId).eq('league_id', leagueId).maybeSingle()
  if (!t || t.to_user !== userId) return json({ error: 'No such offer' }, 404)
  if (t.status !== 'pending') return json({ error: `That offer’s ${t.status}` }, 409)
  const who = await nameOfUser(admin, userId)
  if (!accept) {
    await admin.from('conquest_trades').update({ status: 'declined', decided_at: new Date().toISOString() }).eq('id', tradeId)
    await tellTrade(admin, leagueId, t.from_user, userId, `${who} turned down your trade`, `${CITY[t.give_team] ?? t.give_team} for ${CITY[t.get_team] ?? t.get_team}: no deal.`)
    return json({ declined: true })
  }
  const open = await openWeek(admin, leagueId, season)
  if (open instanceof Response) return open
  const { data: result, error } = await admin.rpc('conquest_apply_trade', { p_trade: tradeId, p_week: open.week })
  if (error) throw error
  if (result !== 'ok') return json({ error: 'One of those cities has changed hands (or become a capital): the offer’s void' }, 409)
  await tellTrade(admin, leagueId, t.from_user, userId, `${who} took your trade`, `${CITY[t.get_team] ?? t.get_team} is yours, and ${CITY[t.give_team] ?? t.give_team} is theirs.`)
  return json({ accepted: true })
}

/** Take back an offer you made, while it's still open. */
async function tradeCancel(admin: SupabaseClient, leagueId: string, userId: string, tradeId: string) {
  const { data, error } = await admin.from('conquest_trades').update({ status: 'cancelled', decided_at: new Date().toISOString() })
    .eq('id', tradeId).eq('league_id', leagueId).eq('from_user', userId).eq('status', 'pending').select('id')
  if (error) throw error
  if (!data?.length) return json({ error: 'No open offer to cancel' }, 404)
  return json({ cancelled: true })
}

/**
 * Your orders this week, before the first kickoff: the attack (an empire
 * on your border) or the flag (an unclaimed city next to you). Null puts
 * that one back to automatic; the other is kept.
 */
async function setOrder(admin: SupabaseClient, leagueId: string, userId: string, change: { target?: string | null; claim?: string | null; fortify?: boolean; tribute?: string | null; ambush?: string | null; target2?: string | null }) {
  const season = nflSeasonFor(new Date())
  const { data: war } = await admin.from('conquest_games').select('start_week, last_resolved_week, final_week')
    .eq('league_id', leagueId).eq('season', season).maybeSingle()
  if (!war) return json({ error: 'No war going on' }, 404)
  const week = (war.last_resolved_week ?? war.start_week - 1) + 1
  if (week > war.final_week) return json({ error: 'The war is over' }, 409)
  const { data: first } = await admin.from('nfl_games').select('game_date')
    .eq('season', season).eq('week', week).order('game_date').limit(1).maybeSingle()
  if (first && new Date(first.game_date).getTime() <= Date.now()) {
    return json({ error: 'Orders lock at the week’s first kickoff' }, 409)
  }
  const { data: cities } = await admin.from('conquest_territories').select('team, owner_id, besieged_by').eq('league_id', leagueId).eq('season', season)
  const owners: Record<string, string | null> = Object.fromEntries(TERRITORIES.map(t => [t, null]))
  for (const c of cities ?? []) owners[c.team] = c.owner_id
  if (!citiesOf(owners, userId).length) return json({ error: 'You’re in exile: retake your capital first' }, 409)
  if (change.fortify) {
    // Not two weeks running
    const { data: last } = await admin.from('conquest_orders').select('fortify')
      .eq('league_id', leagueId).eq('season', season).eq('week', week - 1).eq('user_id', userId).maybeSingle()
    if (last?.fortify) return json({ error: 'You dug in last week: you can’t two weeks running' }, 409)
  }
  if (change.tribute) {
    const { data: me } = await admin.from('conquest_players').select('capital').eq('league_id', leagueId).eq('season', season).eq('user_id', userId).maybeSingle()
    const cap = me?.capital as string | undefined
    const siege = (cities ?? []).find(c => c.team === cap)
    if (!cap || owners[cap] !== userId || !siege?.besieged_by) return json({ error: 'Tribute is only for a capital under siege' }, 409)
    if (owners[change.tribute] !== userId || change.tribute === cap) return json({ error: 'Pay with one of your other cities' }, 400)
  }
  if (change.target && !neighborsOf(owners, userId).includes(change.target)) return json({ error: 'That empire isn’t on your border' }, 400)
  if (change.ambush && !neighborsOf(owners, userId).includes(change.ambush)) return json({ error: 'You can only lie in wait for an empire on your border' }, 400)
  if (change.target2) {
    if (citiesOf(owners, userId).length < SECOND_FRONT_AT) return json({ error: `A second front takes an empire of ${SECOND_FRONT_AT} cities` }, 409)
    if (!neighborsOf(owners, userId).includes(change.target2)) return json({ error: 'That empire isn’t on your border' }, 400)
  }
  if (change.claim) {
    const mine = new Set(citiesOf(owners, userId))
    if (!(change.claim in owners) || owners[change.claim] != null || !ADJ[change.claim].some(n => mine.has(n))) {
      return json({ error: 'That city isn’t open on your border' }, 400)
    }
  }
  const key = { league_id: leagueId, season, week, user_id: userId }
  const { data: had } = await admin.from('conquest_orders').select('target_id, claim, fortify, tribute, ambush, target2').match(key).maybeSingle()
  // Attacking, digging in and lying in ambush are one or another: choosing one drops the others
  let target = 'target' in change ? change.target ?? null : had?.target_id ?? null
  let fortify = 'fortify' in change ? !!change.fortify : !!had?.fortify
  let ambush = 'ambush' in change ? change.ambush ?? null : had?.ambush ?? null
  if ('target' in change && target) { fortify = false; ambush = null }
  if ('fortify' in change && fortify) { target = null; ambush = null }
  if ('ambush' in change && ambush) { target = null; fortify = false }
  const claim = 'claim' in change ? change.claim ?? null : had?.claim ?? null
  const tribute = 'tribute' in change ? change.tribute ?? null : had?.tribute ?? null
  const target2 = 'target2' in change ? change.target2 ?? null : had?.target2 ?? null
  const { error } = target == null && claim == null && !fortify && tribute == null && ambush == null && target2 == null
    ? await admin.from('conquest_orders').delete().match(key)
    : await admin.from('conquest_orders').upsert({ ...key, target_id: target, claim, fortify, tribute, ambush, target2, created_at: new Date().toISOString() })
  if (error) throw error
  return json({ week, target, claim, fortify, tribute, ambush, target2 })
}

async function resolveAll(admin: SupabaseClient) {
  const { data: wars, error } = await admin.from('conquest_games').select('*')
  if (error) throw error
  const settled: { league: string; week: number; moves: number }[] = []
  for (const war of wars ?? []) {
    for (;;) {
      const prev: number | null = war.last_resolved_week
      const week = (prev ?? war.start_week - 1) + 1
      if (week > war.final_week) break
      const { data: games } = await admin.from('nfl_games')
        .select('id, week, season, home_team, away_team, home_score, away_score, status, game_date, is_tiebreaker, venue_city, venue_country')
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
      if (week === war.final_week) await crown(admin, war.league_id, war.season)
    }
  }
  return { settled }
}

async function settleWeek(admin: SupabaseClient, leagueId: string, season: number, week: number, games: Game[]): Promise<number> {
  const [{ data: players }, { data: territories }, members, { data: picks }] = await Promise.all([
    admin.from('conquest_players').select('user_id, capital, color, city_weeks').eq('league_id', leagueId).eq('season', season),
    admin.from('conquest_territories').select('team, owner_id, besieged_by').eq('league_id', leagueId).eq('season', season),
    membersOf(admin, leagueId),
    admin.from('pickem_picks').select('user_id, game_id, picked_team, tiebreaker_score').eq('league_id', leagueId).eq('season', season).eq('week', week),
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
    const capitals = assignCapitals(joiners.map(m => ({ userId: m.userId, favorite: m.favorite && POS[m.favorite] ? m.favorite : null })), owners)
    // Not on their favorite's city: the open city whose start is nearest fair, with the map as it is
    for (const m of joiners) {
      if (!capitals[m.userId] || capitals[m.userId] === m.favorite) continue
      const held = TERRITORIES.filter(t => owners[t] != null || Object.values(capitals).includes(t))
      const open = TERRITORIES.filter(t => owners[t] == null && (t === capitals[m.userId] || !Object.values(capitals).includes(t)))
      const fair = (t: string) => Math.abs((startOdds([...held.filter(h => h !== capitals[m.userId]), t])[t] ?? 1) - 1)
      capitals[m.userId] = open.sort((a, b) => fair(a) - fair(b) || a.localeCompare(b))[0] ?? capitals[m.userId]
    }
    let i = inWar.size
    for (const m of joiners) {
      const capital = capitals[m.userId]
        ?? (m.favorite && POS[m.favorite] ? m.favorite : TERRITORIES[[...m.userId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TERRITORIES.length])
      const row = { league_id: leagueId, season, user_id: m.userId, color: empireColor(i++), capital, joined_week: week }
      await admin.from('conquest_players').insert(row)
      inWar.set(m.userId, { ...row, city_weeks: 0 })
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
  // Level scores: the closer tiebreaker guess, then the better season win %
  const total = tiebreakerTotal(games)
  scores.tiebreak = {}
  for (const p of picks ?? []) {
    if (total != null && p.tiebreaker_score != null && p.user_id in scores.picks) scores.tiebreak[p.user_id] = Math.abs(p.tiebreaker_score - total)
  }
  // (a week has already been claimed by now: a hiccup here just skips this tiebreaker)
  scores.winPct = await seasonWinPct(admin, leagueId, season, week).catch(() => ({}))

  const state: ConquestState = {
    owners,
    capitals: Object.fromEntries(roster.map(u => [u, inWar.get(u)!.capital as string]).filter(([, c]) => !!c)),
    besieged,
  }
  // The week's attack orders (anyone's no longer on a border falls back to automatic)
  // The week's orders: attacks and flags (one no longer possible falls back to automatic)
  const { data: orderRows } = await admin.from('conquest_orders').select('user_id, target_id, claim, fortify, tribute, ambush, target2')
    .eq('league_id', leagueId).eq('season', season).eq('week', week)
  const orders: Orders = Object.fromEntries((orderRows ?? []).filter(o => o.target_id).map(o => [o.user_id, o.target_id]))
  const claims: Claims = Object.fromEntries((orderRows ?? []).filter(o => o.claim).map(o => [o.user_id, o.claim]))
  const after = resolveWeek(state, scores, roster, orders, claims, otherOrders(orderRows ?? []))
  const moves = [...after.moves]
  // Outposts: each game played abroad this week goes to the best week among those who
  // picked it right (level: the closer tiebreaker guess, then season win %); nobody
  // right, and it's nobody's. It counts as a city to the season's end. One outpost a
  // city: when the NFL goes back there, that game's winner takes it over (nobody
  // right, and its holder keeps it).
  for (const g of games as (Game & { venue_city?: string | null; venue_country?: string | null })[]) {
    const op = outpostFor(g.venue_city, g.venue_country)
    if (!op || isVoid(g) || !isFinal(g)) continue
    const won = winnerOf(g)
    const right = won ? roster.filter(u => scores.picks[u]?.[g.id] === won) : []
    const best = right.sort((a, b) => (scores.correct[b] ?? 0) - (scores.correct[a] ?? 0) || tiebreak(scores, a, b) || a.localeCompare(b))[0] ?? null
    const { data: held } = await admin.from('conquest_outposts').select('game_id, owner_id')
      .eq('league_id', leagueId).eq('season', season).eq('key', op.key).maybeSingle()
    if (held) {
      // Back in a city the war's been to: the winner takes its outpost over
      if (held.game_id === g.id || !best || best === held.owner_id) continue
      const { error: tookErr } = await admin.from('conquest_outposts').update({ game_id: g.id, week, owner_id: best })
        .eq('league_id', leagueId).eq('season', season).eq('key', op.key)
      if (tookErr) throw tookErr
      moves.push({ kind: 'outpost', team: op.key, from: (held.owner_id as string | null) ?? null, to: best, score: [scores.correct[best] ?? 0, 0], withTeam: op.name })
      continue
    }
    const { data: made } = await admin.from('conquest_outposts')
      .upsert({ league_id: leagueId, season, game_id: g.id, key: op.key, name: op.name, week, owner_id: best }, { onConflict: 'league_id,season,key', ignoreDuplicates: true })
      .select('game_id')
    if (made?.length && best) moves.push({ kind: 'outpost', team: op.key, from: null, to: best, score: [scores.correct[best] ?? 0, 0], withTeam: op.name })
  }
  // Trade offers nobody answered before the week began run out with it
  await admin.from('conquest_trades').update({ status: 'expired', decided_at: new Date().toISOString() })
    .eq('league_id', leagueId).eq('season', season).eq('status', 'pending').lte('week', week)
  // Who owns what, and which capitals are under siege, after the week
  for (const t of TERRITORIES) {
    const owner = after.owners[t] ?? null
    const siege = after.besieged[t] ?? null
    if (owner === (owners[t] ?? null) && siege === (besieged[t] ?? null)) continue
    const row: Record<string, unknown> = { owner_id: owner, besieged_by: siege }
    if (owner !== (owners[t] ?? null)) row.since_week = week
    await admin.from('conquest_territories').update(row).eq('league_id', leagueId).eq('season', season).eq('team', t)
  }
  // Everyone's city-weeks: the cities they hold now the week's settled (Emperor's tiebreak);
  // an outpost counts as a city
  const { data: heldAbroad } = await admin.from('conquest_outposts').select('owner_id').eq('league_id', leagueId).eq('season', season)
  for (const u of roster) {
    const held = TERRITORIES.filter(t => after.owners[t] === u).length + (heldAbroad ?? []).filter(o => o.owner_id === u).length
    if (!held) continue
    await admin.from('conquest_players').update({ city_weeks: Number(inWar.get(u)?.city_weeks ?? 0) + held })
      .eq('league_id', leagueId).eq('season', season).eq('user_id', u)
  }
  if (moves.length) {
    const { error } = await admin.from('conquest_moves').insert(moves.map(m => ({
      league_id: leagueId, season, week, kind: m.kind, team: m.team, from_user: m.from, to_user: m.to,
      score_for: m.score[0], score_against: m.score[1], exiled: !!m.exiled, with_team: m.withTeam ?? null, tactic: m.tactic ?? null,
    })))
    if (error) throw error
  }
  return moves.length
}

/**
 * The week being played, as it stands: what settleWeek would do with the
 * games finished so far (the same scores, tiebreakers, orders and rules),
 * written nowhere. Null before any of its games has finished, or once
 * there's no week left to play. Anyone who's joined since the week began
 * isn't in it yet; anyone who's left has lost their cities already.
 */
async function soFar(admin: SupabaseClient, leagueId: string) {
  const season = nflSeasonFor(new Date())
  const { data: war } = await admin.from('conquest_games').select('start_week, last_resolved_week, final_week')
    .eq('league_id', leagueId).eq('season', season).maybeSingle()
  if (!war) return null
  const week = ((war.last_resolved_week as number | null) ?? (war.start_week as number) - 1) + 1
  if (week > (war.final_week as number)) return null
  const { data: gameRows } = await admin.from('nfl_games')
    .select('id, week, season, home_team, away_team, home_score, away_score, status, game_date, is_tiebreaker')
    .eq('season', season).eq('week', week)
  const games = (gameRows ?? []) as Game[]
  const counted = new Map(games.filter(g => !isVoid(g) && isFinal(g)).map(g => [g.id, g]))
  if (!counted.size) return null
  const pending = games.filter(g => !isVoid(g) && !isFinal(g)).length

  const [{ data: players }, { data: territories }, members, { data: picks }, { data: orderRows }] = await Promise.all([
    admin.from('conquest_players').select('user_id, capital').eq('league_id', leagueId).eq('season', season),
    admin.from('conquest_territories').select('team, owner_id, besieged_by').eq('league_id', leagueId).eq('season', season),
    membersOf(admin, leagueId),
    admin.from('pickem_picks').select('user_id, game_id, picked_team, tiebreaker_score').eq('league_id', leagueId).eq('season', season).eq('week', week),
    admin.from('conquest_orders').select('user_id, target_id, claim, fortify, tribute, ambush, target2').eq('league_id', leagueId).eq('season', season).eq('week', week),
  ])
  const memberIds = new Set(members.map(m => m.userId))
  const owners: Record<string, string | null> = Object.fromEntries(TERRITORIES.map(t => [t, null]))
  const besieged: Record<string, string> = {}
  for (const t of territories ?? []) {
    owners[t.team] = t.owner_id && memberIds.has(t.owner_id) ? t.owner_id : null
    if (t.besieged_by) besieged[t.team] = t.besieged_by
  }
  const roster = (players ?? []).map(p => p.user_id as string).filter(u => memberIds.has(u))
  const scores: WeekScores = { correct: {}, picks: {} }
  for (const u of roster) { scores.correct[u] = 0; scores.picks[u] = {} }
  for (const p of picks ?? []) {
    const g = counted.get(p.game_id)
    if (!g || !(p.user_id in scores.picks) || !p.picked_team) continue
    scores.picks[p.user_id][p.game_id] = p.picked_team
    if (winnerOf(g) === p.picked_team) scores.correct[p.user_id]++
  }
  const total = tiebreakerTotal(games)
  scores.tiebreak = {}
  for (const p of picks ?? []) {
    if (total != null && p.tiebreaker_score != null && p.user_id in scores.picks) scores.tiebreak[p.user_id] = Math.abs(p.tiebreaker_score - total)
  }
  scores.winPct = await seasonWinPct(admin, leagueId, season, week).catch(() => ({}))
  const state: ConquestState = {
    owners,
    capitals: Object.fromEntries((players ?? []).filter(p => roster.includes(p.user_id) && p.capital).map(p => [p.user_id, p.capital])),
    besieged,
  }
  const orders: Orders = Object.fromEntries((orderRows ?? []).filter(o => o.target_id).map(o => [o.user_id, o.target_id]))
  const claims: Claims = Object.fromEntries((orderRows ?? []).filter(o => o.claim).map(o => [o.user_id, o.claim]))
  const after = resolveWeek(state, scores, roster, orders, claims, otherOrders(orderRows ?? []))
  return {
    week,
    pending,
    owners: after.owners,
    besieged: after.besieged,
    moves: after.moves.map(m => ({ kind: m.kind, team: m.team, from: m.from, to: m.to, score: m.score, exiled: !!m.exiled, withTeam: m.withTeam, tactic: m.tactic })),
  }
}

/** Everyone's season win % through a week: correct picks over picks on finished games. */
async function seasonWinPct(admin: SupabaseClient, leagueId: string, season: number, week: number): Promise<Record<string, number>> {
  const { data: games } = await admin.from('nfl_games')
    .select('id, week, season, home_team, away_team, home_score, away_score, status, game_date')
    .eq('season', season).lte('week', week)
  const counted = new Map((games ?? []).filter(g => !isVoid(g as Game) && isFinal(g as Game)).map(g => [g.id, g as Game]))
  const tally: Record<string, { won: number; played: number }> = {}
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await admin.from('pickem_picks').select('user_id, game_id, picked_team')
      .eq('league_id', leagueId).eq('season', season).lte('week', week).order('id').range(from, from + 999)
    if (error) throw error
    for (const p of page ?? []) {
      const g = counted.get(p.game_id)
      if (!g || !p.picked_team) continue
      const t = tally[p.user_id] ??= { won: 0, played: 0 }
      t.played++
      if (winnerOf(g) === p.picked_team) t.won++
    }
    if (!page || page.length < 1000) break
  }
  return Object.fromEntries(Object.entries(tally).map(([u, t]) => [u, t.played ? t.won / t.played : 0]))
}

/** The war's over: the season's titles, from the war log and the final map, kept for good. */
async function crown(admin: SupabaseClient, leagueId: string, season: number) {
  const [{ data: moves }, { data: cities }, { data: players }] = await Promise.all([
    admin.from('conquest_moves').select('kind, from_user, to_user').eq('league_id', leagueId).eq('season', season),
    admin.from('conquest_territories').select('team, owner_id').eq('league_id', leagueId).eq('season', season),
    admin.from('conquest_players').select('user_id, city_weeks').eq('league_id', leagueId).eq('season', season),
  ])
  const { data: abroad } = await admin.from('conquest_outposts').select('owner_id').eq('league_id', leagueId).eq('season', season)
  const outposts: Record<string, number> = {}
  for (const o of abroad ?? []) if (o.owner_id) outposts[o.owner_id] = (outposts[o.owner_id] ?? 0) + 1
  const owners: Record<string, string | null> = Object.fromEntries((cities ?? []).map(c => [c.team, c.owner_id]))
  const log = (moves ?? []).map(m => ({ kind: m.kind as Move['kind'], from: m.from_user as string | null, to: m.to_user as string }))
  const cityWeeks = Object.fromEntries((players ?? []).map(p => [p.user_id as string, Number(p.city_weeks ?? 0)]))
  const crowned = titles(log, owners, (players ?? []).map(p => p.user_id as string), cityWeeks, outposts)
  await admin.from('conquest_games').update({ crowned }).eq('league_id', leagueId).eq('season', season)
}
