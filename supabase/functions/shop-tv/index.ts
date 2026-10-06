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
  nflSeasonFor, isVoid, isFinal, isLive, computeWeek, computeWinOdds, recentSlateLabel, computeUpsetWatch, computeBelt,
  computeStandings, weekWinners, isWeekComplete, homeWinChance, gameClockLabel, winnerOf,
  computeWeekStats, describeWeekStats, computeWhoCanWin, computeBadBeats, computeAchievements, ACHIEVEMENTS,
  computePickDNA, computePickMatches, keyInjuries, rankOf, tiebreakerTotal,
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

/** The live situation columns sync-nfl-schedule writes (not part of the core Game). */
type SituationGame = Game & { possession?: string | null; down_distance?: string | null; red_zone?: boolean | null; last_play?: string | null; weather?: unknown }

const GAME_COLS = 'id, week, game_date, home_team, away_team, home_score, away_score, status, is_tiebreaker, pregame_home_wp, spread, over_under, live_home_wp, period, clock, game_story, possession, down_distance, red_zone, last_play, weather'

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
type TvPick = Pick & { reason?: string | null }
const seasonCache = new Map<string, { at: number; picks: TvPick[] }>()

async function seasonPicks(admin: ReturnType<typeof createClient>, leagueId: string, season: number): Promise<TvPick[]> {
  const hit = seasonCache.get(leagueId)
  if (hit && Date.now() - hit.at < 120_000) return hit.picks
  const picks: TvPick[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('pickem_picks')
      .select('game_id, user_id, week, picked_team, tiebreaker_score, reason')
      .eq('league_id', leagueId)
      .eq('season', season)
      .order('id')
      .range(from, from + 999)
    if (error) throw error
    picks.push(...((data ?? []) as TvPick[]))
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
    const since = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString()
    const [{ data: league }, { data: memberRows }, { data: gameRows }, { data: pin }, { data: chatRows }, { data: roastRows }, { data: pollRows }, { data: spotify }] = await Promise.all([
      admin.from('leagues')
        .select('id, name, league_type, pick_lock_type, pick_deadline_day, pick_deadline_time, pick_deadline_tz, brand_logo_url, brand_color, tv_theme')
        .eq('id', tv.league_id).maybeSingle(),
      admin.from('league_members')
        .select('user_id, badge_flair, profile:profiles(username, display_name, avatar_url, favorite_nfl_team)')
        .eq('league_id', tv.league_id),
      admin.from('nfl_games').select(GAME_COLS).eq('season', season),
      admin.from('league_pins').select('message').eq('league_id', tv.league_id).maybeSingle(),
      // The main chat's latest words (text only)
      admin.from('league_messages')
        .select('user_id, message, created_at')
        .eq('league_id', tv.league_id).eq('is_system', false).is('game_id', null).is('deleted_at', null)
        .not('message', 'like', 'IMAGE:%').not('message', 'like', 'GIF:%').not('message', 'like', 'POLL:%').gte('created_at', since)
        .order('created_at', { ascending: false }).limit(8),
      admin.from('league_messages')
        .select('message, created_at')
        .eq('league_id', tv.league_id).eq('is_system', true).like('message', 'PICKEM_ROAST:%').gte('created_at', since)
        .order('created_at', { ascending: false }).limit(1),
      admin.from('league_polls')
        .select('id, question, options, closes_at, created_by, created_at')
        .eq('league_id', tv.league_id).gte('created_at', since)
        .order('created_at', { ascending: false }).limit(1),
      admin.from('league_spotify').select('league_id').eq('league_id', tv.league_id).maybeSingle(),
    ])
    if (!league || league.league_type !== 'pickem') return json({ error: 'not found' }, 404)

    const members = (memberRows ?? []) as unknown as Member[]
    const avatarOf = new Map(members.map(m => [m.user_id, (m.profile as { avatar_url?: string | null } | null)?.avatar_url ?? null]))
    // The badge each person shows next to their name
    const flairOf = new Map((memberRows ?? []).map((m: { user_id: string; badge_flair?: string | null }) => [m.user_id, m.badge_flair ?? null]))
    const games = ((gameRows ?? []) as Game[]).filter(g => g.game_date)
    const week = currentWeek(games, now)
    const wkGames = games.filter(g => g.week === week)
      .sort((a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime())

    const [{ data: settings }, allPicks, { data: hurt }] = await Promise.all([
      admin.from('pickem_week_settings').select('pick_deadline')
        .eq('league_id', league.id).eq('season', season).eq('week', week).maybeSingle(),
      seasonPicks(admin, league.id, season),
      admin.from('players')
        .select('id, name, team, pos, status, depth_chart_rank, avg_pts, status_changed_at')
        .eq('league', 'NFL').eq('depth_chart_rank', 1).neq('status', 'active'),
    ])
    const wkPicks = allPicks.filter(p => p.week === week)
    const isOpen = stillPickable(wkGames, now, settings?.pick_deadline, league)
    const deadline = weekDeadline(wkGames, settings?.pick_deadline, league)

    // ── The week ────────────────────────────────────────────
    const rows = computeWeek(wkGames, wkPicks, members)
    const odds = computeWinOdds(wkGames, wkPicks, rows, { isOpen, viewerId: '__league__', sims: 3000, recent: true })
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
        possession: isLive(g) ? (g as SituationGame).possession ?? null : null,
        downDistance: isLive(g) ? (g as SituationGame).down_distance ?? null : null,
        redZone: isLive(g) ? !!(g as SituationGame).red_zone : false,
        lastPlay: isLive(g) ? (g as SituationGame).last_play ?? null : null,
        kickoff: g.game_date,
        homeChance: isVoid(g) ? null : homeWinChance(g),
        spread: g.spread ?? null,
        total: g.over_under ?? null,
        weather: (g as SituationGame).weather ?? null,
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
      // The arrow: which way it's going since the games on now kicked off
      trendFrom: odds?.recent?.get(r.userId) ?? null,
      // TV pages loaded before trendFrom existed draw their arrow from
      // this (they reload every 6 hours); drop it after a day or so
      kickoffChance: odds?.recent?.get(r.userId) ?? null,
      belt: beltIds.has(r.userId),
      flair: flairOf.get(r.userId) ?? null,
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
      flair: flairOf.get(r.userId) ?? null,
    }))

    // ── The ticker ──────────────────────────────────────────
    const visible = wkPicks.filter(p => { const g = wkGames.find(x => x.id === p.game_id); return g && !isOpen(g) })
    const upsets = computeUpsetWatch(wkGames, visible).map(u =>
      `Upset watch: ${u.crowdPicks} of ${u.pickers} took ${u.crowd}, down ${u.dogScore}–${u.crowdScore} to ${u.dog} (${Math.round(u.chance * 100)}% to come back)`)
    const nextKickoff = wkGames.filter(g => !isFinal(g) && !isLive(g) && !isVoid(g) && new Date(g.game_date) > now)[0]?.game_date ?? null
    const matchup = (g: Game) => `${g.away_team} @ ${g.home_team}`

    // The week at a glance
    const summary = {
      final: wkGames.filter(g => isFinal(g)).length,
      live: wkGames.filter(g => isLive(g)).length,
      left: wkGames.filter(g => !isFinal(g) && !isLive(g) && !isVoid(g)).length,
      right: played.reduce((n, r) => n + r.correct, 0),
      wrong: played.reduce((n, r) => n + (r.played - r.correct), 0),
    }

    // The week's storylines, from locked picks only
    const headlines = started
      ? describeWeekStats(computeWeekStats(wkGames, visible, rows)).map(l => ({ label: l.label, headline: l.headline, detail: l.detail, team: l.team ?? null }))
      : []

    // The games that decide the week: each side's biggest winners
    const withSwings = started && !complete
      ? computeWinOdds(wkGames, wkPicks, rows, { isOpen, viewerId: '__league__', sims: 3000, swings: true })
      : null
    const top3 = (m: Map<string, number>) => [...m.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([id, chance]) => ({ name: nameById.get(id) ?? 'Someone', chance }))
    const stakes = (withSwings?.swings ?? [])
      // Only games that have locked: before that, "if PHI wins, these people
      // gain" reads as who picked PHI, even though hidden picks aren't used
      .filter(sw => !sw.settled && sw.stakes > 0.02 && !isOpen(sw.game))
      .slice(0, 4)
      .map(sw => ({
        game: matchup(sw.game),
        away: sw.game.away_team,
        home: sw.game.home_team,
        stakes: sw.stakes,
        homeChance: sw.homeChance,
        ifAway: top3(sw.ifAway),
        ifHome: top3(sw.ifHome),
      }))

    // Who can still win (late in the week)
    const who = started && !complete ? computeWhoCanWin(wkGames, wkPicks, rows, { isOpen, viewerId: '__league__' }) : null
    const teamOf = new Map(wkGames.map(g => [g.id, g]))
    const whoCanWin = who ? {
      remaining: who.remaining,
      rows: who.rows.filter(r => r.status !== 'out').map(r => ({
        name: r.name,
        status: r.status,
        needs: r.needs.map(n => n.team),
        tiebreaker: r.tiebreaker,
      })),
      out: who.rows.filter(r => r.status === 'out').length,
    } : null

    // Pick receipts on games that have locked, newest first
    const receipts = wkPicks
      .filter(p => p.reason && teamOf.has(p.game_id) && !isOpen(teamOf.get(p.game_id)!))
      .map(p => {
        const g = teamOf.get(p.game_id)!
        const w = winnerOf(g)
        return {
          name: nameById.get(p.user_id) ?? 'Someone',
          team: p.picked_team,
          opponent: p.picked_team === g.home_team ? g.away_team : g.home_team,
          reason: String(p.reason),
          result: !isFinal(g) || w == null ? null : w === p.picked_team ? 'hit' : 'miss',
          at: g.game_date,
        }
      })
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 8)

    // The season's worst bad beats
    const beats = computeBadBeats(seasonGames, allPicks)
      .sort((a, b) => b.peak - a.peak)
      .slice(0, 5)
      .map(b => ({
        week: b.week,
        loser: b.loser, winner: b.winner, loserScore: b.loserScore, winnerScore: b.winnerScore,
        peak: b.peak,
        victims: b.victims.map(id => nameById.get(id) ?? 'Someone'),
      }))

    // Badges earned in the latest finished week
    const achievements = computeAchievements(seasonGames, allPicks, members)
    const lastDone = Math.max(0, ...[...achievements.values()].flat().flatMap(a => a.weeks))
    const badges = lastDone
      ? [...achievements.entries()].flatMap(([id, list]) => list
          .flatMap(a => a.events.filter(e => e.week === lastDone).map(e => ({ key: a.key, e })))
          .map(({ key, e }) => {
            const def = ACHIEVEMENTS.find(x => x.key === key)
            return { name: nameById.get(id) ?? 'Someone', label: def?.label ?? key, detail: e.detail }
          }))
      : []

    // Season leaders
    const leaders = {
      bestRecord: seasonRows[0] ? { name: seasonRows[0].name, correct: seasonRows[0].correct, played: seasonRows[0].played } : null,
      mostWeeks: [...seasonRows].sort((a, b) => b.weeksWon - a.weeksWon)[0]?.weeksWon
        ? seasonRows.filter(r => r.weeksWon === Math.max(...seasonRows.map(x => x.weeksWon))).map(r => r.name)
        : [],
      weeksWon: Math.max(0, ...seasonRows.map(r => r.weeksWon)),
      bestPct: [...seasonRows].filter(r => r.played >= 10).sort((a, b) => b.pct - a.pct)[0] ?? null,
      basement: seasonRows.slice(-3).reverse().map(r => ({ name: r.name, correct: r.correct, played: r.played })),
    }

    // ── Receipts as each game ends ──────────────────────────
    // The TV pops these up when it sees a game go final: the best receipt
    // on the winner and the worst on the loser (the longest of each, the
    // most to read out)
    type WkPick = (typeof wkPicks)[number]
    const longest = (ps: WkPick[]) => [...ps].sort((a, b) => String(b.reason).length - String(a.reason).length)[0]
    const card = (p: WkPick | undefined) => (p ? { name: nameById.get(p.user_id) ?? 'Someone', team: p.picked_team, reason: String(p.reason) } : null)
    const gameReceipts = wkGames.filter(g => isFinal(g) && winnerOf(g)).flatMap(g => {
      const w = winnerOf(g)!
      const on = wkPicks.filter(p => p.game_id === g.id)
      const said = on.filter(p => p.reason)
      if (said.length === 0) return []
      return [{
        gameId: g.id, away: g.away_team, home: g.home_team, awayScore: g.away_score, homeScore: g.home_score, winner: w,
        right: on.filter(p => p.picked_team === w).length, pickers: on.length,
        best: card(longest(said.filter(p => p.picked_team === w))),
        worst: card(longest(said.filter(p => p.picked_team !== w))),
      }]
    })

    // ── The replay: the finished week, slide by slide ─────────
    // The TV plays it when the week goes final, every half hour after
    // until the next week opens, and from the commissioner's remote
    const replay = complete && played.length > 0 ? (() => {
      const top = played[0]
      const decidedByTiebreak = played.filter(r => r.correct === top.correct).length > winners.length
      // Picks nearly everyone got right that someone still blew
      const blown = wkGames.flatMap(g => {
        const w = winnerOf(g)
        if (!w) return []
        const on = wkPicks.filter(p => p.game_id === g.id)
        const wrong = on.filter(p => p.picked_team !== w)
        if (on.length < 5 || wrong.length === 0 || wrong.length > Math.max(2, Math.floor(on.length / 5))) return []
        return [{
          names: wrong.map(p => nameById.get(p.user_id) ?? 'Someone'),
          took: w === g.home_team ? g.away_team : g.home_team,
          winner: w, right: on.length - wrong.length, of: on.length, share: wrong.length / on.length,
        }]
      }).sort((a, b) => a.share - b.share).slice(0, 2)
      const beat = computeBadBeats(seasonGames, allPicks).filter(b => b.week === week).sort((a, b) => b.peak - a.peak)[0]
      // The Belt: this week's winners, and who had it before
      const lineage = belt?.lineage ?? []
      const before = lineage.length > 1 && lineage[lineage.length - 1].week === week ? lineage[lineage.length - 2].winners.map(w => w.name) : []
      // Receipts that aged worst
      const agedWorst = wkPicks.filter(p => {
        const g = teamOf.get(p.game_id)
        const w = g ? winnerOf(g) : null
        return !!p.reason && !!w && w !== p.picked_team
      }).slice(0, 3).map(p => card(p)!)
      // Who climbed and who fell in the season standings
      const was = computeStandings(seasonGames.filter(g => g.week < week), allPicks, members).filter(r => r.played > 0)
      const now = computeStandings(seasonGames.filter(g => g.week <= week), allPicks, members).filter(r => r.played > 0)
      const rankWas = new Map(was.map((r, i) => [r.userId, rankOf(was, i)]))
      const moves = now
        .map((r, i) => ({ name: r.name, from: rankWas.get(r.userId), to: rankOf(now, i) }))
        .filter((m): m is { name: string; from: number; to: number } => m.from != null && m.from !== m.to)
        .sort((a, b) => (b.from - b.to) - (a.from - a.to))
      const bottom = played[played.length - 1]
      return {
        week,
        champion: {
          names: winners, correct: top.correct, played: top.played,
          tiebreak: decidedByTiebreak && top.tiebreakerGuess != null ? { guess: top.tiebreakerGuess, actual: tiebreakerTotal(wkGames) } : null,
        },
        headlines: headlines.slice(0, 4),
        blown,
        badBeat: beat ? {
          loser: beat.loser, winner: beat.winner, loserScore: beat.loserScore, winnerScore: beat.winnerScore,
          peak: beat.peak, victims: beat.victims.map(id => nameById.get(id) ?? 'Someone'),
        } : null,
        belt: winners.length ? { holders: winners, from: before, defended: winners.some(n => before.includes(n)) } : null,
        agedWorst,
        badges: lastDone === week ? badges.slice(0, 6) : [],
        climber: moves[0] && moves[0].from > moves[0].to ? moves[0] : null,
        faller: moves.length && moves[moves.length - 1].from < moves[moves.length - 1].to ? moves[moves.length - 1] : null,
        basement: bottom ? { names: played.filter(r => r.correct === bottom.correct).map(r => r.name), correct: bottom.correct, played: bottom.played } : null,
      }
    })() : null

    // ── The Board: every pick on every game (hidden until it locks) ──
    const pickOf = new Map(wkPicks.map(p => [`${p.user_id}:${p.game_id}`, p]))
    const board = {
      games: wkGames.filter(g => !isVoid(g)).map(g => ({ id: g.id, away: g.away_team, home: g.home_team, winner: isFinal(g) || isLive(g) ? winnerOf(g) : null, final: isFinal(g), live: isLive(g), tiebreaker: !!g.is_tiebreaker, locked: !isOpen(g) })),
      rows: weekTable.map(r => ({
        userId: r.userId,
        cells: Object.fromEntries(wkGames.filter(g => !isVoid(g)).map(g => {
          const p = pickOf.get(`${r.userId}:${g.id}`)
          return [g.id, !p ? null : isOpen(g) ? '?' : p.picked_team]
        })),
        tiebreaker: (() => {
          const tb = wkGames.find(g => g.is_tiebreaker)
          const p = tb ? pickOf.get(`${r.userId}:${tb.id}`) : null
          return tb && p && !isOpen(tb) ? p.tiebreaker_score ?? null : null
        })(),
      })),
    }

    // ── Wall of shame: who still owes picks, while any game can be picked ──
    const openGames = wkGames.filter(g => isOpen(g))
    const tbOpen = openGames.find(g => g.is_tiebreaker)
    const lockAt = deadline && deadline > now ? deadline.toISOString()
      : openGames.length ? openGames.map(g => g.game_date).sort()[0] : null
    const shame = openGames.length === 0 ? null : {
      lockAt,
      open: openGames.length,
      rows: rows
        .map(r => {
          const mine = openGames.filter(g => pickOf.has(`${r.userId}:${g.id}`)).length
          const noTb = !!tbOpen && pickOf.get(`${r.userId}:${tbOpen.id}`)?.tiebreaker_score == null
          return { name: r.name, missing: openGames.length - mine, none: mine === 0 && !r.submitted, noTiebreaker: noTb }
        })
        .filter(x => x.missing > 0 || x.noTiebreaker)
        .sort((a, b) => Number(b.none) - Number(a.none) || b.missing - a.missing),
    }

    // ── Player spotlights: one card per player, the TV rotates through them ──
    const openIds = new Set(openGames.map(g => g.id))
    const lockedPicks = allPicks.filter(p => !openIds.has(p.game_id))
    const dna = computePickDNA(seasonGames, lockedPicks, members)
    const beltWeeks = new Map<string, number[]>()
    for (const l of belt?.lineage ?? []) for (const w of l.winners) beltWeeks.set(w.userId, [...(beltWeeks.get(w.userId) ?? []), l.week])
    const spotlights = seasonTable.map(r => {
      const d = dna.players.find(p => p.userId === r.userId)
      const m = computePickMatches(seasonGames, lockedPicks, members, r.userId)
      return {
        name: r.name,
        avatarUrl: r.avatarUrl,
        rank: r.rank,
        of: seasonTable.length,
        correct: r.correct,
        played: r.played,
        weeksWon: r.weeksWon,
        archetype: d && d.picks > 0 ? { title: d.archetype.title, blurb: d.archetype.blurb } : null,
        badges: (achievements.get(r.userId) ?? []).map(a => ACHIEVEMENTS.find(x => x.key === a.key)?.label ?? a.key),
        twin: m.twin ? { name: m.twin.name, agree: m.twin.agree } : null,
        nemesis: m.nemesis ? { name: m.nemesis.name, split: m.nemesis.split, youRight: m.nemesis.youRight, theyRight: m.nemesis.theyRight } : null,
        beltWeeks: beltWeeks.get(r.userId) ?? [],
      }
    })

    // ── Next week, once this one's final ──
    const nextGames = complete
      ? games.filter(g => g.week === week + 1 && !isVoid(g)).sort((a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime())
      : []
    const nextWeek = nextGames.length ? {
      week: week + 1,
      games: nextGames.map(g => ({ away: g.away_team, home: g.home_team, kickoff: g.game_date, spread: g.spread ?? null, total: g.over_under ?? null, homeChance: homeWinChance(g) })),
    } : null

    // ── Injury report: key starters out or questionable for the games ahead ──
    const hurtByTeam = keyInjuries((hurt ?? []) as Parameters<typeof keyInjuries>[0])
    const aheadTeams = new Set((nextGames.length ? nextGames : wkGames.filter(g => !isFinal(g) && !isLive(g) && !isVoid(g)))
      .flatMap(g => [g.away_team, g.home_team]))
    const injuries = [...hurtByTeam.entries()]
      .filter(([team]) => aheadTeams.has(team))
      .flatMap(([team, list]) => list.map(p => ({ team, name: p.name, pos: p.pos, status: p.status })))
      .sort((a, b) => Number(b.status === 'out') - Number(a.status === 'out') || Number(b.pos === 'QB') - Number(a.pos === 'QB'))

    // Chat, the roast and the latest poll
    const chat = (chatRows ?? []).map(m => ({ name: nameById.get(m.user_id) ?? 'Someone', text: String(m.message).slice(0, 200), at: m.created_at }))
    let roast: { week: number; text: string } | null = null
    const raw = roastRows?.[0]?.message as string | undefined
    if (raw) {
      const m = raw.match(/^PICKEM_ROAST:\d+:(\d+):(.*)$/s)
      try { if (m) roast = { week: Number(m[1]), text: String(JSON.parse(m[2]).text ?? '') } } catch { roast = null }
    }
    let poll: { question: string; options: { text: string; votes: number }[]; total: number; closesAt: string | null; commish: boolean } | null = null
    const p0 = pollRows?.[0]
    if (p0) {
      const { data: votes } = await admin.from('league_poll_votes').select('option_index').eq('poll_id', p0.id)
      const options = (p0.options as string[]).map((text, i) => ({ text, votes: (votes ?? []).filter(v => v.option_index === i).length }))
      poll = { question: p0.question, options, total: (votes ?? []).length, closesAt: p0.closes_at, commish: p0.created_by == null }
    }

    return json({
      league: league.name,
      // brand_color is the TV's own accent (Commish panel → Shop TV)
      // tv_theme: the commissioner's holiday theme (null: by the calendar)
      // music: a Spotify is connected (the TV then asks tv-now-playing what's on)
      brand: { logo: league.brand_logo_url ?? null, color: league.brand_color ?? null, theme: league.tv_theme ?? null, music: !!spotify },
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
      trend_label: odds?.recentGames ? recentSlateLabel(odds.recentGames) : null,
      season_table: seasonTable,
      belt: belt ? { names: belt.holders.map(h => h.name), reign: Math.max(...belt.holders.map(h => h.reign)) } : null,
      pin: pin?.message ?? null,
      upsets,
      summary,
      headlines,
      stakes,
      who_can_win: whoCanWin,
      receipts,
      gameReceipts,
      replay,
      beats,
      badges,
      badges_week: lastDone || null,
      belt_lineage: belt?.lineage.map(l => ({ week: l.week, names: l.winners.map(w => w.name) })) ?? [],
      belt_longest: belt?.longest ?? null,
      leaders,
      chat,
      roast,
      poll,
      board,
      shame,
      spotlights,
      next_week: nextWeek,
      injuries,
    })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
