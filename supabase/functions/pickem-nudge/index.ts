// ══════════════════════════════════════════════════════════════
// pickem-nudge — "Nudge" on the Pick'Em Board
//
// POST { league_id, target_id, week }: from the signed-in member, a
// push to someone whose picks for the week are still open ("Port
// nudged you: 4 games still open"). Both have to be in the league, the
// target needs games (or a tiebreaker guess) they can still pick, and
// each person can be nudged once a day per league, by anyone. Saved in
// pickem_nudges (the Board shows who's been nudged) and the target's
// notifications; the push respects their pick-reminder setting.
// ══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWebPush, type VapidKeys } from '../_shared/webPush.ts'
import { nflSeasonFor, isVoid, type Game } from '../_shared/pickemCore.ts'
import { stillPickable, weekDeadline } from '../_shared/pickLocks.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } })

/** One nudge per person per league in this long */
const ONCE_PER_MS = 20 * 3600_000

const nameOf = (p: { display_name?: string | null; username?: string | null } | null | undefined) =>
  p?.display_name || p?.username || 'Someone'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Sign in to nudge' }, 401)

  const { league_id: leagueId, target_id: targetId, week } = await req.json().catch(() => ({}))
  if (typeof leagueId !== 'string' || typeof targetId !== 'string' || !Number.isInteger(week)) {
    return json({ error: 'league_id, target_id and week required' }, 400)
  }
  if (targetId === user.id) return json({ error: "You can't nudge yourself" }, 400)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const now = new Date()
  const season = nflSeasonFor(now)

  const [
    { data: league },
    { data: members },
    { data: games },
    { data: setting },
    { data: picks },
    { data: recent },
    { data: people },
  ] = await Promise.all([
    admin.from('leagues').select('id, name, league_type, pick_lock_type, pick_deadline_day, pick_deadline_time, pick_deadline_tz').eq('id', leagueId).maybeSingle(),
    admin.from('league_members').select('user_id').eq('league_id', leagueId).in('user_id', [user.id, targetId]),
    admin.from('nfl_games').select('id, week, game_date, status, is_tiebreaker, home_team, away_team, home_score, away_score').eq('season', season).eq('week', week),
    admin.from('pickem_week_settings').select('pick_deadline').eq('league_id', leagueId).eq('season', season).eq('week', week).maybeSingle(),
    admin.from('pickem_picks').select('game_id, tiebreaker_score').eq('league_id', leagueId).eq('user_id', targetId).eq('season', season).eq('week', week),
    admin.from('pickem_nudges').select('nudger_id, created_at').eq('league_id', leagueId).eq('target_id', targetId)
      .gte('created_at', new Date(now.getTime() - ONCE_PER_MS).toISOString()).order('created_at', { ascending: false }).limit(1),
    admin.from('profiles').select('id, username, display_name').in('id', [user.id, targetId]),
  ])

  if (!league || league.league_type !== 'pickem') return json({ error: "Not a Pick'Em league" }, 404)
  if ((members ?? []).length < 2) return json({ error: "You both have to be in this league" }, 403)
  const nudger = nameOf((people ?? []).find(p => p.id === user.id))
  const target = nameOf((people ?? []).find(p => p.id === targetId))

  // What they can still pick: the lock the Pick'Em page enforces
  const wkGames = ((games ?? []) as Game[]).filter(g => g.game_date && !isVoid(g))
  const open = wkGames.filter(stillPickable(wkGames, now, setting?.pick_deadline, league))
  const picked = new Set((picks ?? []).map(p => p.game_id))
  const unpicked = open.filter(g => !picked.has(g.id))
  const tbGame = open.find(g => g.is_tiebreaker)
  const noGuess = !!tbGame && !(picks ?? []).some(p => p.tiebreaker_score != null)
  if (unpicked.length === 0 && !noGuess) return json({ error: `${target} is all set` }, 409)

  if ((recent ?? []).length) {
    const by = (recent![0].nudger_id === user.id) ? 'you' : nameOf((await admin.from('profiles').select('username, display_name').eq('id', recent![0].nudger_id).maybeSingle()).data)
    return json({ error: `${target} was already nudged today by ${by}` }, 429)
  }

  const { error: saveErr } = await admin.from('pickem_nudges').insert({ league_id: leagueId, target_id: targetId, nudger_id: user.id, season, week })
  if (saveErr) return json({ error: saveErr.message }, 500)

  const title = `${nudger} nudged you`
  const body = unpicked.length
    ? `${unpicked.length} game${unpicked.length === 1 ? '' : 's'} still open${noGuess ? ', and no tiebreaker guess' : ''}`
    : 'Your tiebreaker guess is still empty'
  const path = `/app/pickem?week=${week}&league=${encodeURIComponent(leagueId)}`
  await admin.from('notifications').insert({
    user_id: targetId, league_id: leagueId, type: 'nudge', title, body, is_read: false,
    data: { league_id: leagueId, week }, sender_id: user.id,
  })

  // The push, unless they've turned pick reminders off (this league's
  // setting, else their global one; newest first, as send-reminders reads it)
  const { data: prefs } = await admin.from('notification_preferences')
    .select('league_id, notify_pickem_deadline, updated_at').eq('user_id', targetId)
    .order('updated_at', { ascending: false })
  const pref = (prefs ?? []).find(p => p.league_id === leagueId) ?? (prefs ?? []).find(p => p.league_id === null)
  let pushed = 0
  const vapid: VapidKeys = {
    publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
    privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
    subject: Deno.env.get('VAPID_SUBJECT') ?? 'https://www.gridironunited.app',
  }
  if (pref?.notify_pickem_deadline !== false && vapid.publicKey && vapid.privateKey) {
    const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', targetId)
    // Worth delivering until the first of their open games locks
    const deadline = weekDeadline(wkGames, setting?.pick_deadline, league)
    const firstLock = Math.min(...[...unpicked, ...(noGuess && tbGame ? [tbGame] : [])]
      .map(g => Math.min(new Date(g.game_date).getTime(), deadline?.getTime() ?? Infinity)))
    const ttlSec = Math.max(300, Math.min(86_400, Math.round((firstLock - now.getTime()) / 1000)))
    const payload = JSON.stringify({
      title: `👉 ${title}`,
      body: `${league.name} · ${body}`,
      url: path,
      tag: `nudge-${leagueId}`,
      icon: '/icons/notify/reminder.png',
      actions: [{ action: 'picks', title: 'Make my picks', url: path }],
      urgent: true,
    })
    for (const s of subs ?? []) {
      try {
        const r = await sendWebPush(s, payload, vapid, { ttlSec, urgency: 'high' })
        if (r.status >= 200 && r.status < 300) {
          pushed++
          await admin.from('push_subscriptions').update({ last_success_at: now.toISOString() }).eq('id', s.id)
        } else if (r.gone) {
          await admin.from('push_subscriptions').delete().eq('id', s.id)
        }
      } catch { /* one bad device shouldn't stop the rest */ }
    }
  }

  return json({ ok: true, target, open: unpicked.length, noGuess, pushed })
})
