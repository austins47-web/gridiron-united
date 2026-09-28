// ══════════════════════════════════════════════════════════════
// commish-chat — "@Commish" in a Pick'Em league's chat
//
// The app calls this right after someone posts a message mentioning
// @Commish. Claude answers from the league's data and the answer is
// posted as a system message (COMMISH_REPLY:), threaded to the
// question with reply_to_id.
//
// Only public data goes in: picks on games that have locked (kicked
// off, or past the week's deadline), never an open pick — not even the
// asker's, since the answer is posted for everyone. Win odds and Who
// Can Still Win are worked out from nobody's view for the same reason.
//
// Guards: the caller must be the message's author and a member of the
// league, the message must be under 5 minutes old and unanswered, and
// a league gets at most HOURLY_LIMIT answers an hour.
// ══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0'
import {
  nflSeasonFor, isFinal, isLive, isVoid, isWeekComplete, nameOf, winnerOf, gameClockLabel,
  computeWeek, computeStandings, computeWinOdds, computeWhoCanWin, computeBelt, computeBadBeats,
  computePickDNA, computeAchievements, swingsFor, whenDecided, describeTiebreakerRange, ACHIEVEMENTS,
  type Game, type Pick, type Member,
} from '../_shared/pickemCore.ts'
import { stillPickable } from '../_shared/pickLocks.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } })

const HOURLY_LIMIT = 20

const SYSTEM = `You are The Commish, the resident bot in a friendly NFL Pick'Em league's group chat. Someone just @mentioned you.

Answer their message using only the league data you're given. If the data doesn't cover it, say so plainly; never guess scores, picks or stats. Picks on games that haven't kicked off are secret and you don't have them; if asked, say they're hidden until kickoff.

Keep it short: one to three sentences, under 70 words, conversational and a little playful. Trash talk about picks is fine, but nothing about anyone's looks, identity, family or life outside the pick'em, and keep it PG-13. Plain text only: no markdown, lists or headings. At most one emoji. Use people's names exactly as written; "you" is the person who asked.`

const weekName = (w: number) =>
  w === 19 ? 'Wild Card weekend' : w === 20 ? 'the Divisional round' : w === 21 ? 'Championship weekend' : w === 22 ? 'the Super Bowl' : `Week ${w}`
const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)}%`)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'not signed in' }, 401)

  const { messageId } = await req.json().catch(() => ({}))
  if (!messageId) return json({ error: 'messageId required' }, 400)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ── The question ───────────────────────────────────────────
  const { data: msg } = await admin
    .from('league_messages')
    .select('id, league_id, user_id, message, created_at, is_system, deleted_at')
    .eq('id', messageId)
    .maybeSingle()
  if (!msg || msg.user_id !== user.id || msg.is_system || msg.deleted_at) return json({ error: 'not your message' }, 403)
  if (!/@commish\b/i.test(msg.message)) return json({ error: 'no @Commish in it' }, 400)
  if (Date.now() - new Date(msg.created_at).getTime() > 5 * 60_000) return json({ error: 'too old' }, 400)

  const { data: answered } = await admin
    .from('league_messages').select('id')
    .eq('reply_to_id', messageId).eq('is_system', true).like('message', 'COMMISH_REPLY:%').limit(1)
  if (answered?.length) return json({ ok: true, already: true })

  const { data: league } = await admin
    .from('leagues')
    .select('id, name, league_type, pick_lock_type, pick_deadline_day, pick_deadline_time, pick_deadline_tz')
    .eq('id', msg.league_id).maybeSingle()
  if (!league || league.league_type !== 'pickem') return json({ error: "The Commish only covers Pick'Em leagues" }, 400)

  const { count: recent } = await admin
    .from('league_messages').select('id', { count: 'exact', head: true })
    .eq('league_id', league.id).eq('is_system', true).like('message', 'COMMISH_REPLY:%')
    .gte('created_at', new Date(Date.now() - 3600_000).toISOString())
  if ((recent ?? 0) >= HOURLY_LIMIT) return json({ error: 'The Commish needs a breather' }, 429)

  // ── The league's data ──────────────────────────────────────
  const now = new Date()
  const season = nflSeasonFor(now)
  const [{ data: memberRows }, { data: gameRows }, { data: settings }, { data: chatRows }] = await Promise.all([
    admin.from('league_members').select('user_id, profile:profiles(username, display_name, favorite_nfl_team)').eq('league_id', league.id),
    admin.from('nfl_games')
      .select('id, week, game_date, home_team, away_team, home_score, away_score, status, is_tiebreaker, pregame_home_wp, spread, over_under, live_home_wp, period, clock, game_story')
      .eq('season', season),
    admin.from('pickem_week_settings').select('week, pick_deadline').eq('league_id', league.id).eq('season', season),
    admin.from('league_messages')
      .select('user_id, message, is_system, created_at').eq('league_id', league.id).eq('is_system', false)
      .lt('created_at', msg.created_at).order('created_at', { ascending: false }).limit(8),
  ])
  const members = (memberRows ?? []) as Member[]
  if (!members.some(m => m.user_id === user.id)) return json({ error: 'not in this league' }, 403)
  const games = ((gameRows ?? []) as Game[]).filter(g => !isVoid(g))
  const allPicks: Pick[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from('pickem_picks')
      .select('game_id, user_id, week, picked_team, tiebreaker_score')
      .eq('league_id', league.id).eq('season', season).order('id').range(from, from + 999)
    allPicks.push(...((data ?? []) as Pick[]))
    if (!data || data.length < 1000) break
  }

  const weeks = [...new Set(games.map(g => g.week))].sort((a, b) => a - b)
  const weekGames = (w: number) => games.filter(g => g.week === w)
  // This week: the first that isn't over (else the last)
  const wk = weeks.find(w => !isWeekComplete(weekGames(w))) ?? weeks[weeks.length - 1]
  const override = (w: number) => (settings ?? []).find(s => s.week === w)?.pick_deadline
  const openByWeek = new Map(weeks.map(w => [w, stillPickable(weekGames(w), now, override(w), league)]))
  const isOpen = (g: Game) => openByWeek.get(g.week)?.(g) ?? false
  const gameById = new Map(games.map(g => [g.id, g]))
  // Public picks only: the game has locked
  const picks = allPicks.filter(p => { const g = gameById.get(p.game_id); return g && !isOpen(g) })
  const nameById = new Map(members.map(m => [m.user_id, nameOf(m)]))
  const asker = nameById.get(user.id) ?? 'Someone'

  const wkGames = weekGames(wk)
  const wkRows = computeWeek(wkGames, picks.filter(p => p.week === wk), members)
  const standings = computeStandings(games, picks, members)
  const odds = computeWinOdds(wkGames, picks, wkRows, { isOpen, viewerId: '__league__', swings: true })
  const who = computeWhoCanWin(wkGames, picks, wkRows, { isOpen, viewerId: '__league__' })
  const belt = computeBelt(games, picks, members)
  const beats = computeBadBeats(games, picks).slice(0, 3)
  const dna = computePickDNA(games, picks, members)
  const badges = computeAchievements(games, picks, members)
  const tb = wkGames.find(g => g.is_tiebreaker)

  const finals = wkGames.filter(isFinal).length, live = wkGames.filter(isLive).length
  const lines: string[] = [
    `League: ${league.name}. Season ${season}. It's ${weekName(wk)}: ${finals} of ${wkGames.length} games final, ${live} live.`,
    `Asked by: ${asker}.`,
    '',
    'Season standings (correct picks on finished games):',
    ...standings.filter(s => s.played > 0).map((s, i) =>
      `${i + 1}. ${s.name}: ${s.correct}-${s.played - s.correct}, ${pct(s.pct)}, weeks won ${s.weeksWon}${s.streak >= 2 ? `, on a ${s.streak}-week win streak` : ''}`),
    '',
    `${weekName(wk)} so far: ` + wkRows.filter(r => r.submitted)
      .map(r => `${r.name} ${r.correct}/${r.played}${tb && !isOpen(tb) && r.tiebreakerGuess != null ? ` (tiebreaker guess ${r.tiebreakerGuess})` : ''}`).join('; '),
    '',
    `${weekName(wk)} games:`,
    ...wkGames.map(g => {
      const status = isFinal(g) ? `final ${g.away_team} ${g.away_score}-${g.home_score} ${g.home_team}`
        : isLive(g) ? `live ${g.away_team} ${g.away_score ?? 0}-${g.home_score ?? 0} ${g.home_team}, ${gameClockLabel(g)}`
        : `kicks off ${g.game_date}`
      const line = g.spread != null ? `, line ${g.home_team} ${g.spread > 0 ? '+' : ''}${g.spread}` : ''
      const gp = picks.filter(p => p.game_id === g.id)
      const side = (t: string) => gp.filter(p => p.picked_team === t).map(p => nameById.get(p.user_id) ?? '?')
      const pickedBy = isOpen(g) ? 'picks hidden until kickoff'
        : `${g.away_team} picked by ${side(g.away_team).join(', ') || 'nobody'}; ${g.home_team} picked by ${side(g.home_team).join(', ') || 'nobody'}`
      return `- ${g.away_team} @ ${g.home_team}${g.is_tiebreaker ? ' (tiebreaker game)' : ''}: ${status}${line}. ${pickedBy}.`
    }),
  ]
  if (odds) {
    lines.push('', 'Chance to win the week (simulated): ' + [...odds.now].sort((a, b) => b[1] - a[1]).filter(([, p]) => p > 0.005)
      .map(([id, p]) => `${nameById.get(id)} ${pct(p)}`).join(', '))
    const big = (odds.swings ?? []).filter(s => !s.settled).slice(0, 3)
    if (big.length) {
      lines.push('Games that decide the week most: ' + big.map(s =>
        `${s.game.away_team} @ ${s.game.home_team} (matters to ${swingsFor(s).map(id => nameById.get(id)).join(', ') || 'nobody much'})`).join('; '))
    }
  }
  if (who) {
    lines.push('Who can still win: ' + who.rows.filter(r => r.status !== 'out').map(r =>
      `${r.name}${r.status === 'clinched' ? ' (clinched)' : ''}${r.needs.length ? `, needs ${r.needs.map(n => n.team).join(' + ')}` : ''}${r.tiebreaker ? `, needs a tiebreaker total ${describeTiebreakerRange(r.tiebreaker)}` : ''}`).join('; '))
  }
  if (belt) {
    lines.push('', `The Belt (last finished week's winner): ${belt.holders.map(h => `${h.name}, ${h.reign} week${h.reign === 1 ? '' : 's'} straight`).join(' & ')}. `
      + `Past champs: ${belt.lineage.map(l => `W${l.week} ${l.winners.map(w => w.name).join(' & ')}`).join(', ')}.`)
  }
  if (beats.length) {
    lines.push('Worst bad beats this season: ' + beats.map(b =>
      `${b.loser} at ${pct(b.peak)} in week ${b.week}, lost ${b.loserScore}-${b.winnerScore}${b.decided ? `, ${b.winner} went ahead ${whenDecided(b.decided)}` : ''} (picked by ${b.victims.map(id => nameById.get(id)).join(', ')})`).join('; '))
  }
  lines.push('', 'Pick DNA (share of finished picks): ' + dna.players.filter(p => p.picks > 0).map(p =>
    `${p.name}: ${p.archetype.title}; favorites ${pct(p.chalk)}, against the crowd ${pct(p.contrarian)}, home teams ${pct(p.homer)}`
    + `${p.favoriteTeam ? `, picks ${p.favoriteTeam} ${pct(p.loyalty)} of the time` : ''}, right ${pct(p.hitRate)}`).join('; '))
  const badgeLines = [...badges].map(([id, list]) => `${nameById.get(id)}: ${list.map(a => {
    const label = ACHIEVEMENTS.find(x => x.key === a.key)?.label
    return a.weeks.length > 1 ? `${label} x${a.weeks.length}` : label
  }).join(', ')}`)
  if (badgeLines.length) lines.push('Badges earned: ' + badgeLines.join('; '))
  const recentChat = (chatRows ?? []).reverse().map(c => `${nameById.get(c.user_id) ?? 'Someone'}: ${String(c.message).slice(0, 200)}`)
  if (recentChat.length) lines.push('', 'Recent chat, oldest first:', ...recentChat)

  const question = msg.message.trim()
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'The Commish is not set up' }, 500)

  let text: string | null = null
  try {
    const client = new Anthropic({ apiKey })
    const res = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      // A refusal is retried on another model rather than leaving the question hanging
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `League data:\n${lines.join('\n')}\n\n${asker} asks:\n${question}`,
      }],
    })
    if (res.stop_reason !== 'refusal') {
      text = res.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim() || null
    }
  } catch (e) {
    return json({ error: e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e) }, 502)
  }
  if (!text) text = "I'll sit this one out."

  const { error } = await admin.from('league_messages').insert({
    league_id: league.id, user_id: null, is_system: true, reply_to_id: messageId,
    message: 'COMMISH_REPLY:' + JSON.stringify({ askedBy: asker, question: question.slice(0, 200), text }),
  })
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
})
