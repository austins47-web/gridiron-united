// ══════════════════════════════════════════════════════════════
// send-reminders — the reminder engine
//
// Runs on a schedule (every 15 min). Each pass:
//   1. Works out which reminders are DUE right now
//   2. Filters by each user's preferences
//   3. Skips anything already in reminder_log (idempotency)
//   4. Sends, then logs
//
// The provider lives in ONE function (`sendEmail`) so swapping
// Resend for SendGrid/SES is a ~10 line change.
//
// Secrets required:
//   RESEND_API_KEY   — from resend.com
//   REMINDER_FROM    — e.g. "Gridiron United <noreply@yourdomain.com>"
//   APP_URL          — https://www.gridironunited.app
//   CRON_SECRET      — any random string; must match the caller
// ══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  isFinal, isVoid, computeWeek, computeWeekStats, computeWhoCanWin, describeTiebreakerRange, tiebreakerTotal,
  nflSeasonFor, computeStandings, rankOf, describeWeekStats, type Game,
} from '../_shared/pickemCore.ts'
import { renderEmail, ordinal, type RichEmail, type PickRow } from './email.ts'
import { sendWebPush, type VapidKeys } from '../_shared/webPush.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL = Deno.env.get('APP_URL') ?? 'https://www.gridironunited.app'
const FROM    = Deno.env.get('REMINDER_FROM') ?? 'Gridiron United <onboarding@resend.dev>'

// Web push (phone/browser notifications) — off if the keys aren't set
const VAPID: VapidKeys | null = Deno.env.get('VAPID_PRIVATE_KEY') && Deno.env.get('VAPID_PUBLIC_KEY')
  ? {
      publicKey: Deno.env.get('VAPID_PUBLIC_KEY')!,
      privateKey: Deno.env.get('VAPID_PRIVATE_KEY')!,
      subject: Deno.env.get('VAPID_SUBJECT') ?? 'https://www.gridironunited.app',
    }
  : null

interface PushRow { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }

// ── Types ─────────────────────────────────────────────────────
interface Reminder {
  userId: string
  /** Address to email, or null when email is off for them. */
  email: string | null
  /** They have at least one device with push notifications on. */
  push: boolean
  /** A phone-only alert — never emailed. */
  pushOnly?: boolean
  /** Push text; defaults to the heading, and the league + body. */
  pushTitle?: string
  pushBody?: string
  /** Same-tag notifications replace each other on the device. */
  pushTag?: string
  /** How long a push stays worth delivering (e.g. until the picks lock). */
  pushTtlSec?: number
  /** Push: its image + title emoji, when not the eventType's (PUSH_LOOK). */
  pushLook?: PushLook
  /** Push: up to two buttons under it (Android, computers). */
  pushActions?: { action: string; title: string; path: string }[]
  /** Push: the number on the home-screen app icon, e.g. open picks. */
  pushBadge?: number
  /** Push: stays on a computer screen until dismissed. */
  pushSticky?: boolean
  leagueId: string
  leagueName: string
  eventType: string
  dedupeKey: string
  subject: string
  heading: string
  body: string
  ctaLabel: string
  ctaPath: string
  urgent?: boolean
  /** Email: small gold line above the headline, e.g. "LOCKS IN 2H". */
  kicker?: string
  /** Email: inbox preview text (defaults to the body). */
  preheader?: string
  /** Email: the content block for this kind of email. */
  rich?: RichEmail
}

// ══ PROVIDER — swap this one function to change email vendors ══
async function sendEmail(to: string, subject: string, html: string, text: string): Promise<void> {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) throw new Error('RESEND_API_KEY not set')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject,
      html,
      text,
      headers: {
        // Gmail and Yahoo require these on bulk mail. Without them
        // reminders are far more likely to land in spam.
        'List-Unsubscribe': `<${APP_URL}/app/settings>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Resend ${res.status}: ${detail}`)
  }
}

/**
 * An app link that opens in the reminder's league: the app switches
 * to the league named by ?league= (LeagueSelector), so a Pick'Em
 * reminder from one league never opens on another.
 */
const inLeague = (path: string, leagueId: string) =>
  `${path}${path.includes('?') ? '&' : '?'}league=${encodeURIComponent(leagueId)}`

// ── Push: how each kind of alert looks ────────────────────────
// The image beside it (public/icons/notify/, on Android and computers)
// and the emoji leading its title — the one per-alert touch an iPhone
// shows, since it always uses the app icon.
interface PushLook { icon: string; emoji: string }
const PUSH_LOOK: Record<string, PushLook> = {
  pickem_deadline:   { icon: 'reminder',   emoji: '🏈' },
  pickem_week_final: { icon: 'result',     emoji: '🏁' },
  pickem_alive:      { icon: 'alive',      emoji: '⚔️' },
  pickem_lead:       { icon: 'lead',       emoji: '🔥' },
  pickem_clinch:     { icon: 'clinch',     emoji: '👑' },
  pickem_tb:         { icon: 'tiebreaker', emoji: '🎯' },
  on_the_clock:      { icon: 'draft',      emoji: '⏱️' },
  trade_offer:       { icon: 'trade',      emoji: '🤝' },
  trade_expiring:    { icon: 'trade',      emoji: '⌛' },
  lineup_empty:      { icon: 'lineup',     emoji: '🚨' },
}
const WON_LOOK: PushLook = { icon: 'result', emoji: '🏆' }

const pushPayload = (r: Reminder) => {
  const look = r.pushLook ?? PUSH_LOOK[r.eventType]
  const title = r.pushTitle ?? r.heading
  return JSON.stringify({
    title: look ? `${look.emoji} ${title}` : title,
    body: r.pushBody ?? `${r.leagueName} · ${r.body}`,
    url: inLeague(r.ctaPath, r.leagueId),
    tag: r.pushTag ?? `${r.eventType}-${r.leagueId}`,
    icon: look ? `/icons/notify/${look.icon}.png` : undefined,
    actions: r.pushActions?.map(a => ({ action: a.action, title: a.title, url: inLeague(a.path, r.leagueId) })),
    badgeCount: r.pushBadge,
    requireInteraction: r.pushSticky || undefined,
    urgent: r.urgent || undefined,
  })
}

// ── Email: see email.ts for the template ──────────────────────
const emailFor = (r: Reminder) => renderEmail({
  leagueName: r.leagueName,
  subject: r.subject,
  preheader: r.preheader ?? r.body,
  kicker: r.kicker ?? r.leagueName,
  heading: r.heading,
  body: r.body,
  ctaLabel: r.ctaLabel,
  ctaUrl: `${APP_URL}${inLeague(r.ctaPath, r.leagueId)}`,
  manageUrl: `${APP_URL}/app/settings`,
  iconUrl: `${APP_URL}/icons/icon-192.png`,
  rich: r.rich,
  urgent: r.urgent,
})

/**
 * Every row of a query, a page at a time — the API returns at most
 * 1,000 rows per request (a season of a league's picks passes that).
 */
async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}

// ── Helpers ───────────────────────────────────────────────────
const HOUR = 3600_000
function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / HOUR
}
/**
 * True when `hrs` sits inside the window we're checking this pass.
 *
 * The window must be at least half the cron interval, or a pass can
 * land either side of the target and miss the reminder completely.
 * Running every 15 min => 0.25h half-interval; 0.5h gives margin for
 * a slow pass without ever double-firing (reminder_log guards that).
 */
function inWindow(hrs: number, target: number, slackHours = 0.5): boolean {
  return hrs > 0 && Math.abs(hrs - target) <= slackHours
}

// ══════════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Simple shared-secret guard so this can't be triggered by randoms
  const secret = Deno.env.get('CRON_SECRET')
  const url = new URL(req.url)
  const provided = url.searchParams.get('key') ?? req.headers.get('x-cron-key')
  if (secret && provided !== secret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    })
  }

  const dryRun = url.searchParams.get('dry') === '1'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const reminders: Reminder[] = []
  const nearMisses: any[] = []
  const now = new Date()

  try {
    // ── Load the shared context in one pass ───────────────────
    const [
      { data: leagues },
      { data: members },
      { data: profiles },
      { data: prefsRows },
    ] = await Promise.all([
      supabase.from('leagues').select('id, name, league_type, player_pool, season, draft_status, pick_lock_type, pick_deadline_day, pick_deadline_time, pick_deadline_tz'),
      supabase.from('league_members').select('id, league_id, user_id, team_name'),
      supabase.from('profiles').select('id, username, display_name'),
      supabase.from('notification_preferences').select('*'),
    ])

    // Recipient addresses come from auth.users via a service-role RPC
    const { data: emailRows } = await supabase.rpc('user_emails')
    const emailById = new Map((emailRows ?? []).map((r: any) => [r.id, r.email]))

    const leagueById  = new Map((leagues ?? []).map(l => [l.id, l]))
    const profileById = new Map((profiles ?? []).map(p => [p.id, p]))

    // prefs lookup: the league's row, else the global one — newest
    // first, since the (user_id, league_id) unique constraint never
    // matched a NULL league_id and some users have many global rows
    // (the last one saved is what they chose)
    const prefsNewestFirst = [...(prefsRows ?? [])]
      .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
    const prefFor = (userId: string, leagueId: string) => {
      const rows = prefsNewestFirst
      const scoped = rows.find(r => r.user_id === userId && r.league_id === leagueId)
      const global = rows.find(r => r.user_id === userId && r.league_id === null)
      const pick = (k: string, dflt: any) =>
        scoped?.[k] ?? global?.[k] ?? dflt
      return {
        email_enabled:          pick('email_enabled', true),
        notify_pickem_deadline: pick('notify_pickem_deadline', true),
        notify_draft:           pick('notify_draft', true),
        notify_on_the_clock:    pick('notify_on_the_clock', true),
        notify_trades:          pick('notify_trades', true),
        notify_lineup:          pick('notify_lineup', true),
        notify_weekly_recap:    pick('notify_weekly_recap', true),
        notify_live_alerts:     pick('notify_live_alerts', false),
        lead_primary:   Number(pick('lead_hours_primary', 24)),
        lead_secondary: Number(pick('lead_hours_secondary', 2)),
      }
    }

    const emailOf = (userId: string): string | null =>
      emailById.get(userId) ?? null

    // Devices with push on, by user
    const { data: pushRows } = VAPID
      ? await supabase.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth')
      : { data: [] }
    const pushByUser = new Map<string, PushRow[]>()
    for (const r of (pushRows ?? []) as PushRow[]) pushByUser.set(r.user_id, [...(pushByUser.get(r.user_id) ?? []), r])

    // Who to reach, and how, for one kind of event: null when they've
    // switched it off or have no way to receive it. Event toggles apply
    // to email and push alike; "email me" only governs email.
    type NotifyKey = 'notify_pickem_deadline' | 'notify_draft' | 'notify_on_the_clock' | 'notify_trades' | 'notify_lineup' | 'notify_weekly_recap' | 'notify_live_alerts'
    const reach = (userId: string, leagueId: string, notify: NotifyKey) => {
      const pref = prefFor(userId, leagueId)
      if (!pref[notify]) return null
      const email = pref.email_enabled ? emailOf(userId) : null
      const push = (pushByUser.get(userId)?.length ?? 0) > 0
      return email || push ? { email, push } : null
    }

    // Sends one push to every device of a user; returns how many took it.
    const pushTo = async (userId: string, payload: string, ttlSec: number, urgent: boolean): Promise<number> => {
      let ok = 0
      for (const d of pushByUser.get(userId) ?? []) {
        try {
          const r = await sendWebPush(d, payload, VAPID!, { ttlSec, urgency: urgent ? 'high' : 'normal' })
          if (r.status >= 200 && r.status < 300) {
            ok++
            await supabase.from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('id', d.id)
          } else if (r.gone) {
            await supabase.from('push_subscriptions').delete().eq('id', d.id)
          }
        } catch { /* one bad device shouldn't stop the rest */ }
      }
      return ok
    }

    // ── The schedule, for working out which week is which ──────
    // leagues.current_week is never written, so it read Week 1 all
    // season; weeks come from the schedule instead. The season comes
    // from the date (nflSeasonFor), so Pick'Em leagues roll into a new
    // season on their own, and a fantasy league from a past season is
    // left alone.
    const season = nflSeasonFor(now)
    const hasCfbPool = (leagues ?? []).some(l => l.league_type !== 'pickem' && l.player_pool === 'cfb')
    const [{ data: nflGames }, { data: weekSettings }, { data: cfbGames }] = await Promise.all([
      supabase.from('nfl_games').select('id, season, week, game_date, status, is_tiebreaker, home_team, away_team, home_score, away_score').eq('season', season),
      supabase.from('pickem_week_settings').select('league_id, season, week, pick_deadline').eq('season', season),
      hasCfbPool
        ? supabase.from('cfb_games').select('id, season, week, game_date, status, is_tiebreaker, home_team, away_team, home_score, away_score').eq('season', season)
        : Promise.resolve({ data: [] }),
    ])
    // College-only fantasy leagues run on the college schedule
    const cfbWeeks = new Map<number, SchedGame[]>()
    for (const g of (cfbGames ?? []) as SchedGame[]) {
      if (!g.game_date || isVoid(g)) continue
      cfbWeeks.set(g.week, [...(cfbWeeks.get(g.week) ?? []), g])
    }

    // season -> week -> games. Postponed/canceled games are left out:
    // they can't be picked and never finish (see isVoid).
    const scheduleBySeason = new Map<number, Map<number, SchedGame[]>>()
    for (const g of nflGames ?? []) {
      if (!g.game_date || isVoid(g)) continue
      const weeks = scheduleBySeason.get(g.season) ?? new Map<number, SchedGame[]>()
      scheduleBySeason.set(g.season, weeks)
      weeks.set(g.week, [...(weeks.get(g.week) ?? []), g])
    }

    // ══ 1. PICK'EM PICK REMINDERS ════════════════════════════
    // Every reminder is about specific open games the member hasn't
    // picked (or a missing tiebreaker guess) — someone who's picked
    // everything never hears from this.
    //
    // Deadline leagues: one lock per week, the deadline the Pick'Em
    // page shows (per-week override, else the league rule anchored to
    // that week's first kickoff), at both lead times. Not the
    // "current" week: a 48h reminder for a Thursday deadline goes out
    // Tuesday, before the page rolls over.
    //
    // Kickoff leagues (each game locks at its own kickoff): the early
    // lead time counts down to the week's first kickoff and covers the
    // whole week; the final lead time counts down to the first kickoff
    // of each game day (Thu, Sun, Mon …) and covers that day's games.
    for (const lg of leagues ?? []) {
      if (lg.league_type !== 'pickem') continue
      const weeks = scheduleBySeason.get(season)
      if (!weeks) continue

      const onDeadline = lg.pick_lock_type === 'deadline' && lg.pick_deadline_day != null && !!lg.pick_deadline_time
      const tz = onDeadline ? (lg.pick_deadline_tz || 'UTC') : 'America/New_York'

      let locks: PickLock[] = []
      if (onDeadline) {
        const overrides = new Map<number, string>(
          (weekSettings ?? [])
            .filter(s => s.league_id === lg.id && s.season === season && s.pick_deadline)
            .map(s => [s.week, s.pick_deadline]),
        )
        const upcoming = nextPickemDeadline(weeks, overrides, lg.pick_deadline_day, lg.pick_deadline_time, tz, now)
        if (upcoming) {
          locks = [{
            week: upcoming.week, at: upcoming.deadline, key: null, weekStart: true,
            games: openGames(weeks.get(upcoming.week) ?? [], now),
          }]
        }
      } else {
        locks = kickoffLocks(weeks, now)
      }
      // Lead times top out at 48h — nothing further out can fire yet
      locks = locks.filter(l => hoursUntil(l.at.toISOString()) <= 48.5)
      if (locks.length === 0) continue

      for (const l of locks) {
        nearMisses.push({
          league: lg.name,
          type: onDeadline ? 'pickem_deadline' : (l.weekStart ? 'pickem_first_kickoff' : 'pickem_game_day'),
          week: l.week,
          lockUtc: l.at.toISOString(),
          lockLocal: formatInZone(l.at, tz),
          openGames: l.games.length,
          hoursUntil: Number(hoursUntil(l.at.toISOString()).toFixed(2)),
          note: 'fires when hoursUntil is within 0.5 of a member lead time (default 24 or 2), for members with open picks',
        })
      }

      const { data: picks } = await supabase
        .from('pickem_picks')
        .select('user_id, game_id, week, tiebreaker_score')
        .eq('league_id', lg.id)
        .eq('season', season)
        .in('week', [...new Set(locks.map(l => l.week))])

      for (const m of (members ?? []).filter(x => x.league_id === lg.id)) {
        const pref = prefFor(m.user_id, lg.id)
        const to = reach(m.user_id, lg.id, 'notify_pickem_deadline')
        if (!to) continue
        const mine = (picks ?? []).filter(p => p.user_id === m.user_id)

        for (const l of locks) {
          const hrs = hoursUntil(l.at.toISOString())
          for (const [target, tag] of [[pref.lead_primary, 'p'], [pref.lead_secondary, 's']] as const) {
            if (!inWindow(hrs, target)) continue
            // The early reminder only runs ahead of a week's first lock,
            // and covers every open game that week
            if (tag === 'p' && !l.weekStart) continue
            const scope = tag === 'p' ? openGames(weeks.get(l.week) ?? [], now) : l.games
            const unpickedGames = scope
              .filter(g => !mine.some(p => p.game_id === g.id))
              .sort((x, y) => new Date(x.game_date).getTime() - new Date(y.game_date).getTime())
            const unpicked = unpickedGames.length
            const tb = scope.find(g => g.is_tiebreaker)
            const tbMissing = !!tb && !mine.some(p => p.game_id === tb.id && p.tiebreaker_score != null)
            if (unpicked === 0 && !tbMissing) continue

            const copy = pickReminderCopy({
              kind: onDeadline ? 'deadline' : tag === 'p' ? 'week' : 'day',
              week: l.week, at: l.at, tz, hours: Math.round(hrs), leagueName: lg.name,
              unpicked, tbMissing,
              noneYet: !mine.some(p => p.week === l.week),
            })
            const kind = onDeadline ? 'deadline' : tag === 'p' ? 'week' : 'day'
            const h = Math.round(hrs)
            const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(l.at)
            const shown = unpickedGames.slice(0, 6)
            const rich: RichEmail | undefined = unpicked > 0 ? {
              kind: 'picks',
              games: shown.map((g): PickRow => ({ away: g.away_team, home: g.home_team, when: shortWhen(g.game_date, tz), tiebreaker: g.is_tiebreaker })),
              more: unpicked - shown.length,
              lockLabel: kind === 'week' ? `First kickoff in ${h}h` : `Locks in ${h}h`,
              tbMissing,
              tbGame: tb ? `${tb.away_team} @ ${tb.home_team}` : undefined,
            } : undefined
            reminders.push({
              userId: m.user_id, ...to,
              leagueId: lg.id, leagueName: lg.name,
              eventType: 'pickem_deadline',
              kicker: unpicked === 0 ? `Week ${l.week} · Tiebreaker`
                : kind === 'day' ? `${day} · Week ${l.week}`
                : kind === 'week' ? `Week ${l.week} kickoff`
                : `Week ${l.week} deadline`,
              preheader: unpicked > 0
                ? `${unpicked} game${unpicked === 1 ? '' : 's'} still open — ${shown[0].away_team} @ ${shown[0].home_team} kicks off ${shortWhen(shown[0].game_date, tz)}.`
                : `Add your tiebreaker guess before ${tb ? `${tb.away_team} @ ${tb.home_team}` : 'it'} kicks off.`,
              rich,
              // Push: when it locks, then the open games themselves
              pushBody: [
                `${lg.name} · ${kind === 'week' ? `First kickoff in ${h}h` : `Locks in ${h}h`}`,
                ...shown.slice(0, 3).map(g => `${g.away_team} @ ${g.home_team} · ${shortWhen(g.game_date, tz)}`),
                ...(unpicked > 3 ? [`+${unpicked - 3} more`] : []),
                ...(tbMissing ? [unpicked > 0 ? 'Your tiebreaker guess is missing too' : 'No guess means you lose every tie'] : []),
              ].join('\n'),
              pushActions: [{ action: 'picks', title: unpicked > 0 ? 'Make picks' : 'Add guess', path: `/app/pickem?week=${l.week}` }],
              pushBadge: unpicked || undefined,
              // One reminder per league-week on the device: the 2h nudge
              // replaces the earlier one, and it's dropped once picks lock
              pushTag: `pickem-${lg.id}-w${l.week}`,
              pushTtlSec: Math.max(600, Math.round((l.at.getTime() - now.getTime()) / 1000)),
              dedupeKey: l.key
                ? `pickem:${lg.id}:${season}:w${l.week}:${l.key}:${tag}`
                : `pickem:${lg.id}:${season}:w${l.week}:${tag}`,
              ...copy,
              ctaPath: `/app/pickem?week=${l.week}`,
              urgent: target <= 4,
            })
          }
        }
      }
    }

    // ══ 2. DRAFT — starting soon / on the clock ══════════════
    const { data: draftStates } = await supabase
      .from('draft_state')
      .select('league_id, status, current_user_id, current_round, current_pick, pick_started_at')

    for (const ds of draftStates ?? []) {
      const lg: any = leagueById.get(ds.league_id)
      if (!lg) continue

      // On the clock — fires once per pick
      if (ds.status === 'active' && ds.current_user_id) {
        const to = reach(ds.current_user_id, lg.id, 'notify_on_the_clock')
        if (to) {
          {
            reminders.push({
              userId: ds.current_user_id, ...to,
              leagueId: lg.id, leagueName: lg.name,
              eventType: 'on_the_clock',
              kicker: `Round ${ds.current_round} · Pick ${ds.current_pick}`,
              preheader: `The draft is waiting on you — round ${ds.current_round}, pick ${ds.current_pick}.`,
              dedupeKey: `clock:${lg.id}:r${ds.current_round}:p${ds.current_pick}`,
              subject: `You're on the clock - ${lg.name}`,
              heading: "You're on the clock",
              body: `Round ${ds.current_round}, pick ${ds.current_pick}. Make your selection before the timer runs out.`,
              ctaLabel: 'Draft now', ctaPath: '/app/draft',
              pushActions: [{ action: 'draft', title: 'Draft now', path: '/app/draft' }],
              pushSticky: true,
              urgent: true,
            })
          }
        }
      }
    }

    // ══ 3. TRADES — new offers + expiring ════════════════════
    const { data: trades } = await supabase
      .from('trades')
      .select('id, league_id, proposer_id, receiver_id, status, expires_at, created_at')
      .eq('status', 'pending')

    for (const t of trades ?? []) {
      const lg: any = leagueById.get(t.league_id)
      if (!lg || !t.receiver_id) continue
      const to = reach(t.receiver_id, lg.id, 'notify_trades')
      if (!to) continue

      const proposer: any = profileById.get(t.proposer_id ?? '')
      const who = proposer?.display_name || proposer?.username || 'A league member'

      // New offer — within the last 20 minutes
      const ageMin = (Date.now() - new Date(t.created_at).getTime()) / 60000
      if (ageMin <= 20) {
        reminders.push({
          userId: t.receiver_id, ...to,
          leagueId: lg.id, leagueName: lg.name,
          eventType: 'trade_offer',
          kicker: 'New trade offer',
          preheader: `${who} wants to make a deal. Accept, counter, or decline.`,
          dedupeKey: `trade:${t.id}:new`,
          subject: `${who} sent you a trade - ${lg.name}`,
          heading: `Trade offer from ${who}`,
          body: 'Review the offer and accept, counter, or decline.',
          ctaLabel: 'Review trade', ctaPath: '/app/trades',
          pushActions: [{ action: 'trade', title: 'Review trade', path: '/app/trades' }],
        })
      }

      // Expiring soon
      if (t.expires_at) {
        const hrs = hoursUntil(t.expires_at)
        if (inWindow(hrs, 12, 0.3)) {
          reminders.push({
            userId: t.receiver_id, ...to,
            leagueId: lg.id, leagueName: lg.name,
            eventType: 'trade_expiring',
            kicker: 'Expires in 12h',
            preheader: `The offer from ${who} expires in about 12 hours.`,
            dedupeKey: `trade:${t.id}:exp12`,
            subject: `Trade from ${who} expires soon - ${lg.name}`,
            heading: 'A trade offer is about to expire',
            body: `The offer from ${who} expires in about 12 hours. Respond before it lapses.`,
            ctaLabel: 'Review trade', ctaPath: '/app/trades',
            pushActions: [{ action: 'trade', title: 'Review trade', path: '/app/trades' }],
            urgent: true,
          })
        }
      }
    }

    // ══ 4. LINEUP NOT SET ════════════════════════════════════
    // Fires Sunday morning for this season's fantasy leagues with an
    // empty roster. The week is the one kicking off today, from the
    // schedule (college schedule for a college-only league).
    const dow = now.getUTCDay()          // 0 = Sunday
    const utcHour = now.getUTCHours()
    if (dow === 0 && utcHour === 14) {   // ~9am ET Sunday
      for (const lg of leagues ?? []) {
        if (lg.league_type === 'pickem') continue
        if (lg.draft_status === 'pre_draft') continue
        if (lg.season !== season) continue
        const wk = upcomingWeek(lg.player_pool === 'cfb' ? cfbWeeks : scheduleBySeason.get(season), now)
        if (wk == null) continue

        const lgMembers = (members ?? []).filter(m => m.league_id === lg.id)
        const { data: rosters } = await supabase
          .from('rosters')
          .select('user_id')
          .eq('league_id', lg.id)
          .eq('week', 0)

        const hasRoster = new Set((rosters ?? []).map(r => r.user_id))

        for (const m of lgMembers) {
          if (hasRoster.has(m.user_id)) continue
          const to = reach(m.user_id, lg.id, 'notify_lineup')
          if (!to) continue

          reminders.push({
            userId: m.user_id, ...to,
            leagueId: lg.id, leagueName: lg.name,
            eventType: 'lineup_empty',
            kicker: `Week ${wk} · Kickoff today`,
            preheader: `Week ${wk} kicks off today and nobody's in your lineup.`,
            dedupeKey: `lineup:${lg.id}:${season}:w${wk}`,
            subject: `Your lineup is empty - ${lg.name}`,
            heading: 'You have no players started',
            body: `Week ${wk} kicks off today and your lineup is empty. Set it before game time.`,
            ctaLabel: 'Set lineup', ctaPath: '/app/roster',
            pushActions: [{ action: 'lineup', title: 'Set lineup', path: '/app/roster' }],
            urgent: true,
          })
        }
      }
    }

    // The Pick'Em recap email's content: the week's winner, the top of
    // the table, the Week Stats and the season picture — one set of
    // numbers for the league, personalized per player by forUser().
    const pickemRecap = async (leagueId: string, wk: number, lgMembers: { user_id: string }[]) => {
      const seasonGames = [...(scheduleBySeason.get(season)?.values() ?? [])].flat()
      const wkGames = scheduleBySeason.get(season)?.get(wk) ?? []
      const seasonPicks = await fetchAllRows((from, to) => supabase
        .from('pickem_picks')
        .select('game_id, user_id, week, picked_team, tiebreaker_score')
        .eq('league_id', leagueId).eq('season', season)
        .order('id').range(from, to))
      const wkPicks = seasonPicks.filter(p => p.week === wk)
      const people = lgMembers.map(m => ({ user_id: m.user_id, profile: profileById.get(m.user_id) ?? null }))
      const rows = computeWeek(wkGames, wkPicks, people)
      const played = rows.filter(r => r.submitted)
      if (played.length === 0) return null
      const top = played[0]
      const winners = played.filter(r => r.correct === top.correct && (r.tiebreakerDiff ?? Infinity) === (top.tiebreakerDiff ?? Infinity))
      const placeOf = (r: typeof played[number]) => 1 + played.filter(o =>
        o.correct > r.correct || (o.correct === r.correct && (o.tiebreakerDiff ?? Infinity) < (r.tiebreakerDiff ?? Infinity))).length
      const total = Math.max(...played.map(r => r.played), 0)
      const winnerNames = winners.map(w => w.name).join(' & ')
      const stats = describeWeekStats(computeWeekStats(wkGames, wkPicks, rows))
      const standings = computeStandings(seasonGames, seasonPicks, people)
      const record = (c: number, pl: number) => `${c}–${Math.max(0, pl - c)}`

      return {
        forUser(userId: string) {
          const me = played.find(r => r.userId === userId)
          const won = !!me && winners.includes(me)
          const si = standings.findIndex(r => r.userId === userId)
          const leader = standings[0]
          const rich: RichEmail = {
            kind: 'recap',
            weekLabel: weekTitle(wk),
            winners: winners.map(w => w.name),
            winnerLine: `${top.correct}/${total}${total ? ` · ${Math.round((top.correct / total) * 100)}%` : ''}`,
            decidedByTiebreak: played.filter(r => r.correct === top.correct).length > winners.length,
            you: me ? { correct: me.correct, played: me.played, place: placeOf(me), of: played.length, won } : undefined,
            top: played.slice(0, 5).map(r => ({ place: placeOf(r), name: r.name, score: `${r.correct}/${r.played}`, you: r.userId === userId })),
            stats,
            season: si >= 0 && leader && leader.played > 0 ? {
              place: rankOf(standings, si), of: standings.length,
              record: record(standings[si].correct, standings[si].played),
              leader: leader.name, leaderRecord: record(leader.correct, leader.played),
              youLead: rankOf(standings, si) === 1,
            } : undefined,
          }
          return {
            rich,
            subject: won ? `You won ${weekTitle(wk)}! - ${lgName(leagueId)}` : `${weekTitle(wk)} results: ${winnerNames} won - ${lgName(leagueId)}`,
            heading: won ? (winners.length > 1 ? `You tied for ${weekTitle(wk)}` : `You won ${weekTitle(wk)}`) : `${winnerNames} won ${weekTitle(wk)}`,
            body: won
              ? `${me!.correct} of ${me!.played} right — the best in the league this week. Here's how it all shook out.`
              : me ? `You went ${me.correct}/${me.played} and finished ${ordinal(placeOf(me))} of ${played.length}. Here's how the week shook out.`
              : `Here's how the week shook out.`,
            preheader: `${winnerNames} won with ${top.correct}/${total}.${me && !won ? ` You finished ${ordinal(placeOf(me))} of ${played.length}.` : ''} Plus the Week Stats.`,
          }
        },
      }
    }
    const lgName = (id: string) => (leagueById.get(id) as any)?.name ?? ''

    // ══ 5. WEEKLY RECAP — Tuesday morning ════════════════════
    if (dow === 2 && utcHour === 14) {   // Tuesday ~9am ET
      for (const lg of leagues ?? []) {
        // Recaps the week that just wrapped, from the schedule — and
        // skips a Tuesday with no freshly finished week (preseason,
        // offseason) rather than recapping Week 1. Fantasy: this
        // season's drafted leagues only. (Pick'Em leagues never draft,
        // so their draft_status stays 'pre_draft' — that check used to
        // skip every Pick'Em recap.) The season is in the key so next
        // season's Week N isn't mistaken for this one's.
        const isPickem = lg.league_type === 'pickem'
        if (!isPickem && (lg.draft_status === 'pre_draft' || lg.season !== season)) continue
        const wk = justFinishedWeek(
          !isPickem && lg.player_pool === 'cfb' ? cfbWeeks : scheduleBySeason.get(season), now)
        if (wk == null) continue
        const recapKey = `recap:${lg.id}:${season}:w${wk}`
        const lgMembers = (members ?? []).filter(m => m.league_id === lg.id)
        // Pick'Em: the week's results, personalized per player (built
        // only if someone here actually gets the email)
        const recap = isPickem && lgMembers.some(m => reach(m.user_id, lg.id, 'notify_weekly_recap')?.email)
          ? await pickemRecap(lg.id, wk, lgMembers)
          : null

        for (const m of lgMembers) {
          const to = reach(m.user_id, lg.id, 'notify_weekly_recap')
          // Phones already got the result the moment the week went final
          // (section 6) — the Tuesday recap stays an email.
          if (!to?.email) continue

          const personal = recap?.forUser(m.user_id)
          reminders.push({
            userId: m.user_id, ...to, push: false,
            leagueId: lg.id, leagueName: lg.name,
            eventType: 'weekly_recap',
            dedupeKey: recapKey,
            subject: personal?.subject ?? `Week ${wk} wrapped - ${lg.name}`,
            heading: personal?.heading ?? `Week ${wk} is in the books`,
            body: personal?.body ?? 'See where you landed in the standings and how the rest of the league did.',
            kicker: `${weekTitle(wk)} results`,
            preheader: personal?.preheader,
            rich: personal?.rich,
            ctaLabel: 'See full standings',
            ctaPath: isPickem ? `/app/pickem?week=${wk}&tab=standings` : '/app/leagues',
          })
        }
      }
    }

    // ══ 6. PICK'EM WEEK FINAL → LEAGUE CHAT + PHONES ══════════
    // As soon as a week goes final (every pass, not just recap day):
    //   - posts the winner and Week Stats to the league's chat, once —
    //     the season/week prefix is checked first; rendered by
    //     PickemWeekFinalCard in the app
    //   - pushes each player their own result to their phone
    //     ("You won Week 3!" / "Week 3 final: Riley won · you went
    //     12/16, 2nd of 8"), deduped per player through reminder_log
    // Only for a week whose last game kicked off in the past 48h, so a
    // deploy or a brand-new league doesn't backfill old weeks.
    const chatPosts: { league: string; week: number }[] = []
    for (const lg of leagues ?? []) {
      if (lg.league_type !== 'pickem') continue
      const weeks = scheduleBySeason.get(season)
      const wk = justFinishedWeek(weeks, now, 48 * HOUR)
      if (wk == null) continue

      const prefix = `PICKEM_WEEK_FINAL:${season}:${wk}:`
      const { data: already } = await supabase
        .from('league_messages')
        .select('id')
        .eq('league_id', lg.id)
        .eq('is_system', true)
        .like('message', `${prefix}%`)
        .limit(1)
      const posted = !!already && already.length > 0

      const { data: wkPicks } = await supabase
        .from('pickem_picks')
        .select('game_id, user_id, week, picked_team, tiebreaker_score')
        .eq('league_id', lg.id)
        .eq('season', season)
        .eq('week', wk)
      const wkMembers = (members ?? [])
        .filter(m => m.league_id === lg.id)
        .map(m => ({ user_id: m.user_id, profile: profileById.get(m.user_id) ?? null }))
      const wkGames = weeks?.get(wk) ?? []

      // Same winner rule as the app's WeekRecap: most correct, then
      // closest tiebreaker guess; an exact tie on both is shared.
      const rows = computeWeek(wkGames, wkPicks ?? [], wkMembers)
      const played = rows.filter(r => r.submitted)
      if (played.length === 0) continue
      const top = played[0]
      const winners = played.filter(r =>
        r.correct === top.correct && (r.tiebreakerDiff ?? Infinity) === (top.tiebreakerDiff ?? Infinity))

      const payload = {
        season, week: wk,
        winners: winners.map(w => w.name),
        correct: top.correct,
        total: Math.max(...played.map(r => r.played), 0),
        decidedByTiebreak: played.filter(r => r.correct === top.correct).length > winners.length,
        tiebreakerTotal: tiebreakerTotal(wkGames),
        winnerGuess: top.tiebreakerGuess,
        stats: computeWeekStats(wkGames, wkPicks ?? [], rows),
      }
      if (!posted) {
        chatPosts.push({ league: lg.name, week: wk })
        if (!dryRun) {
          await supabase.from('league_messages').insert({
            league_id: lg.id, user_id: null, is_system: true,
            message: prefix + JSON.stringify(payload),
          })
        }
      }

      const winnerNames = winners.map(w => w.name).join(' & ')
      // The week's headline stat (usually the biggest upset) as a teaser
      const teaser = describeWeekStats(payload.stats).find(l => l.key !== 'league')
      for (const r of played) {
        const to = reach(r.userId, lg.id, 'notify_weekly_recap')
        if (!to?.push) continue
        const won = winners.includes(r)
        const place = 1 + played.filter(o =>
          o.correct > r.correct ||
          (o.correct === r.correct && (o.tiebreakerDiff ?? Infinity) < (r.tiebreakerDiff ?? Infinity))).length
        const title = won
          ? (winners.length > 1 ? `You tied for the ${weekName(wk)} win!` : `You won ${weekName(wk)}!`)
          : `${weekName(wk)} final: ${winnerNames} won`
        const body = [
          `${lg.name} · You went ${r.correct}/${r.played}` + (won ? ' — best in the league' : `, ${ordinal(place)} of ${played.length}`),
          ...(teaser ? [`${teaser.label}: ${teaser.headline}`] : []),
        ].join('\n')
        reminders.push({
          userId: r.userId, email: null, push: true, pushOnly: true,
          leagueId: lg.id, leagueName: lg.name,
          eventType: 'pickem_week_final',
          dedupeKey: `weekfinal:${lg.id}:${season}:w${wk}`,
          subject: title, heading: title, body,
          pushTitle: title, pushBody: body,
          pushTag: `weekfinal-${lg.id}-w${wk}`,
          // A win gets the trophy, and stays up on a computer until seen
          pushLook: won ? WON_LOOK : undefined,
          pushSticky: won,
          pushActions: [
            { action: 'board', title: 'See every pick', path: `/app/pickem?week=${wk}&tab=board` },
            { action: 'chat', title: 'League chat', path: '/app/chat' },
          ],
          ctaLabel: 'See results', ctaPath: `/app/pickem?week=${wk}&tab=standings`,
        })
      }
    }

    // ══ 7. PICK'EM "STILL ALIVE" — before the last game day ══
    // Two hours before the first kickoff of a week's last game day
    // (usually Monday night), phones get who can still win it — the
    // same computeWhoCanWin the Standings panel runs: "You can still
    // win Week 3 · you need PHI and a tiebreaker total of 47 or less",
    // or "You've clinched". Eliminated players aren't told. Phone
    // only, once per player per week, under the weekly-recap toggle.
    for (const lg of leagues ?? []) {
      if (lg.league_type !== 'pickem') continue
      for (const [wk, wkGames] of scheduleBySeason.get(season) ?? []) {
        const lastDay = lastGameDayKickoff(wkGames)
        if (!lastDay || !inWindow(hoursUntil(lastDay.toISOString()), 2)) continue

        const { data: wkPicks } = await supabase
          .from('pickem_picks')
          .select('game_id, user_id, week, picked_team, tiebreaker_score')
          .eq('league_id', lg.id)
          .eq('season', season)
          .eq('week', wk)
        const wkMembers = (members ?? [])
          .filter(m => m.league_id === lg.id)
          .map(m => ({ user_id: m.user_id, profile: profileById.get(m.user_id) ?? null }))
        const rows = computeWeek(wkGames, wkPicks ?? [], wkMembers)
        const who = computeWhoCanWin(wkGames, wkPicks ?? [], rows)
        if (!who) continue
        const aliveCount = who.rows.filter(r => r.status !== 'out').length

        for (const r of who.rows) {
          if (r.status === 'out') continue
          const to = reach(r.userId, lg.id, 'notify_weekly_recap')
          if (!to?.push) continue
          let title: string, body: string
          if (r.status === 'clinched') {
            title = `You've clinched ${weekName(wk)}!`
            body = `${lg.name} · Nobody can catch you, whatever happens.`
          } else {
            title = `You can still win ${weekName(wk)}`
            const teams = r.needs.map(n => n.team).join(' + ')
            const tb = r.tiebreaker ? `a tiebreaker total ${describeTiebreakerRange(r.tiebreaker)}` : ''
            body = `${lg.name} · ` + (
              teams && tb ? `You need ${teams} and ${tb}.`
              : teams ? `You need ${teams}.`
              : tb ? `You need ${tb}.`
              : `${aliveCount} players are still alive, and you've got a few ways to win.`
            )
          }
          reminders.push({
            userId: r.userId, email: null, push: true, pushOnly: true,
            leagueId: lg.id, leagueName: lg.name,
            eventType: 'pickem_alive',
            // Clinching shares the live alert's key (section 8), so a
            // player who clinched is only told once, whichever sees it first
            dedupeKey: r.status === 'clinched'
              ? `clinch:${lg.id}:${season}:w${wk}`
              : `alive:${lg.id}:${season}:w${wk}`,
            subject: title, heading: title, body,
            pushTitle: title, pushBody: body,
            pushTag: `alive-${lg.id}-w${wk}`,
            pushTtlSec: 2 * 3600,
            pushLook: r.status === 'clinched' ? PUSH_LOOK.pickem_clinch : undefined,
            pushSticky: r.status === 'clinched',
            pushActions: [{ action: 'board', title: 'Watch the Board', path: `/app/pickem?week=${wk}&tab=board` }],
            ctaLabel: 'Standings', ctaPath: `/app/pickem?week=${wk}&tab=standings`,
          })
        }
      }
    }

    // ══ 8. PICK'EM LIVE ALERTS — opt-in, phone only ══════════
    // While a week is being played (some games final, some not), for
    // players who turned on "Live game alerts":
    //   - lead:   you're now alone in first, counting finished games
    //             only — told once per lead change (the last lead alert
    //             in this league-week decides whether it's news)
    //   - clinch: nobody can catch you now (computeWhoCanWin)
    //   - tiebreaker sweat, only for players whose every path to
    //     winning runs through the tiebreaker: once when the live
    //     total gets within 7 of your guess, once when it passes it
    // Every pass (15 min), so alerts land within a few minutes of the
    // score sync picking up the result.
    for (const lg of leagues ?? []) {
      if (lg.league_type !== 'pickem') continue
      const weeks = scheduleBySeason.get(season)
      // The week being played: the first with both finished and
      // unfinished games (earlier weeks are complete)
      const live = [...(weeks ?? [])].sort((a, b) => a[0] - b[0])
        .find(([, gs]) => gs.some(isFinal) && gs.some(g => !isFinal(g)))
      if (!live) continue
      const [wk, wkGames] = live

      const lgMembers = (members ?? []).filter(m => m.league_id === lg.id)
      // Nobody opted in with a phone — skip the picks query entirely
      const optedIn = lgMembers.filter(m => reach(m.user_id, lg.id, 'notify_live_alerts')?.push)
      if (optedIn.length === 0) continue

      const { data: wkPicks } = await supabase
        .from('pickem_picks')
        .select('game_id, user_id, week, picked_team, tiebreaker_score')
        .eq('league_id', lg.id)
        .eq('season', season)
        .eq('week', wk)
      const wkMembers = lgMembers.map(m => ({ user_id: m.user_id, profile: profileById.get(m.user_id) ?? null }))
      const finals = wkGames.filter(isFinal)
      const liveAlert = (userId: string, kind: 'lead' | 'clinch' | 'tb', dedupeKey: string, title: string, body: string) => {
        if (!optedIn.some(m => m.user_id === userId)) return
        const board = { action: 'board', title: 'Watch the Board', path: `/app/pickem?week=${wk}&tab=board` }
        const standings = { action: 'standings', title: 'Standings', path: `/app/pickem?week=${wk}&tab=standings` }
        reminders.push({
          userId, email: null, push: true, pushOnly: true,
          leagueId: lg.id, leagueName: lg.name,
          eventType: `pickem_${kind}`,
          dedupeKey, subject: title, heading: title, body,
          pushTitle: title, pushBody: body,
          pushTag: `${kind}-${lg.id}-w${wk}`,
          pushTtlSec: 3600, urgent: true,
          pushSticky: kind === 'clinch',
          // The tiebreaker sweat opens the Board, where every guess sits
          // in the last game's box; the rest open the standings
          pushActions: kind === 'tb' ? [board, standings] : [board],
          ctaLabel: 'Standings', ctaPath: (kind === 'tb' ? board : standings).path,
        })
      }

      // Lead — finished games only, so a live game can't flip it back and forth
      const settled = computeWeek(finals, wkPicks ?? [], wkMembers).filter(r => r.submitted)
      const [first, second] = settled
      if (first && first.correct > 0 && first.correct > (second?.correct ?? -1)) {
        const { data: lastLead } = await supabase
          .from('reminder_log')
          .select('user_id')
          .eq('event_type', 'pickem_lead')
          .like('dedupe_key', `lead:${lg.id}:${season}:w${wk}:%`)
          .order('sent_at', { ascending: false })
          .limit(1)
        if (lastLead?.[0]?.user_id !== first.userId) {
          const left = wkGames.length - finals.length
          liveAlert(first.userId, 'lead', `lead:${lg.id}:${season}:w${wk}:${finals.length}`,
            `You took the lead in ${weekName(wk)}`,
            `${lg.name} · You're ${first.correct}–${first.played - first.correct}, alone in first with ${left} game${left === 1 ? '' : 's'} left.`)
        }
      }

      // Clinch + tiebreaker sweat
      const rows = computeWeek(wkGames, wkPicks ?? [], wkMembers)
      const who = computeWhoCanWin(wkGames, wkPicks ?? [], rows)
      const tb = wkGames.find(g => g.is_tiebreaker)
      const tbLive = !!tb && tb.status === 'in_progress'
      const total = tb ? (tb.home_score ?? 0) + (tb.away_score ?? 0) : 0
      for (const r of who?.rows ?? []) {
        if (r.status === 'clinched') {
          liveAlert(r.userId, 'clinch', `clinch:${lg.id}:${season}:w${wk}`,
            `You've clinched ${weekName(wk)}!`,
            `${lg.name} · Nobody can catch you, whatever happens.`)
        }
        if (r.status !== 'alive' || !r.tiebreaker || !tbLive || !tb) continue
        const guess = rows.find(x => x.userId === r.userId)?.tiebreakerGuess
        if (guess == null) continue
        const game = `${tb.away_team} @ ${tb.home_team}`
        if (total < guess && total >= guess - 7) {
          liveAlert(r.userId, 'tb', `tbclose:${lg.id}:${season}:w${wk}`,
            `${game} is at ${total}`,
            `${lg.name} · You guessed ${guess} for the tiebreaker, ${guess - total} to go.`)
        } else if (total > guess) {
          liveAlert(r.userId, 'tb', `tbpass:${lg.id}:${season}:w${wk}`,
            `${game} is at ${total}`,
            `${lg.name} · That's past your tiebreaker guess of ${guess}.`)
        }
      }
    }

    // ══ SEND ═════════════════════════════════════════════════
    let sent = 0, skipped = 0, failed = 0
    const results: any[] = []

    for (const r of reminders) {
      const channels: ('email' | 'push')[] = []
      if (r.email && !r.pushOnly) channels.push('email')
      if (r.push && VAPID) channels.push('push')

      for (const channel of channels) {
        // Idempotency — has this exact reminder already gone out on
        // this channel? (Email and push are logged separately.)
        const { data: existing } = await supabase
          .from('reminder_log')
          .select('id')
          .eq('user_id', r.userId)
          .eq('dedupe_key', r.dedupeKey)
          .eq('channel', channel)
          .maybeSingle()

        if (existing) { skipped++; continue }

        if (dryRun) {
          results.push({
            channel, to: channel === 'email' ? r.email : `push:${r.userId}`,
            subject: channel === 'email' ? r.subject : (r.pushTitle ?? r.heading),
            dedupeKey: r.dedupeKey,
            ...(channel === 'push' ? { push: JSON.parse(pushPayload(r)) } : {}),
          })
          sent++
          continue
        }

        try {
          if (channel === 'email') {
            const { html, text } = emailFor(r)
            await sendEmail(r.email!, r.subject, html, text)
          } else {
            const took = await pushTo(r.userId, pushPayload(r), r.pushTtlSec ?? 12 * 3600, !!r.urgent)
            if (took === 0) throw new Error('no device accepted the notification')
          }
          await supabase.from('reminder_log').insert({
            user_id: r.userId, league_id: r.leagueId,
            event_type: r.eventType, dedupe_key: r.dedupeKey,
            channel, status: 'sent',
          })
          sent++
        } catch (e) {
          failed++
          await supabase.from('reminder_log').insert({
            user_id: r.userId, league_id: r.leagueId,
            event_type: r.eventType, dedupe_key: r.dedupeKey,
            channel, status: 'failed', error: String(e),
          })
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true, dryRun, considered: reminders.length, sent, skipped, failed,
      chatPosts: chatPosts.length,
      ...(dryRun ? { preview: results, nearMisses, chatPreview: chatPosts } : {}),
    }), { headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } })

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    })
  }
})

// ══ Timezone-aware weekly deadlines ═══════════════════════════
// A weekly deadline is a WALL-CLOCK time in a zone ("Wednesdays at
// 5pm Mountain"), not a fixed UTC offset — Mountain is UTC-6 in
// summer and UTC-7 in winter. We resolve local -> UTC using the
// offset actually in effect on that date, so the deadline stays at
// the same local time across daylight saving.

function offsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value
  const asUTC = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  )
  return asUTC - date.getTime()
}

function zonedTimeToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number, tz: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0)
  let ts = naive
  for (let i = 0; i < 3; i++) {
    const next = naive - offsetMs(new Date(ts), tz)
    if (next === ts) break
    ts = next
  }
  return new Date(ts)
}

function partsInZone(date: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    weekday: DOW.indexOf(p.weekday),
  }
}

/**
 * The occurrence of a weekly rule that applies to a week: the latest
 * one at or before that week's first kickoff, looking back at most 6
 * days. A copy of weeklyDeadlineForWeek in src/lib/deadline.ts (see
 * there for why 6) — keep the two in step, or reminders and the
 * Pick'Em page will disagree about when a week locks.
 */
function weeklyDeadlineForWeek(
  firstKickoff: Date, day: number, time: string, tz: string,
): Date | null {
  const [h, m] = time.split(':').map(Number)
  for (let back = 0; back <= 6; back++) {
    const probe = new Date(firstKickoff.getTime() - back * 86400_000)
    const pp = partsInZone(probe, tz)
    if (pp.weekday !== day) continue
    const candidate = zonedTimeToUtc(pp.year, pp.month, pp.day, h, m, tz)
    if (candidate.getTime() <= firstKickoff.getTime()) return candidate
  }
  return null
}

// ══ Pick'Em weeks, from the schedule ═════════════════════════
/** A schedule row — the full shared Game, so the Pick'Em core can score it. */
type SchedGame = Game

/** A moment picks lock that a reminder can count down to. */
interface PickLock {
  week: number
  at: Date
  /** Part of the dedupe key for kickoff leagues; null keeps a deadline league's key as it was. */
  key: string | null
  /** The week's first lock — the early (primary) reminder only runs ahead of this one. */
  weekStart: boolean
  /** Games that lock here and are still open. */
  games: SchedGame[]
}

/** Games that haven't kicked off yet (so can still be picked). */
function openGames(games: SchedGame[], now: Date): SchedGame[] {
  return games.filter(g =>
    new Date(g.game_date).getTime() > now.getTime() && !isFinal(g) && g.status !== 'in_progress')
}

/**
 * Kickoff leagues: one lock per game day per week, at that day's
 * first kickoff (days in Eastern time, so a London 9:30 AM game and
 * the 1 PM slate share Sunday). The week's earliest kickoff is its
 * weekStart lock.
 */
function kickoffLocks(weeks: Map<number, SchedGame[]>, now: Date): PickLock[] {
  const out: PickLock[] = []
  for (const [week, games] of weeks) {
    const firstKickoff = Math.min(...games.map(g => new Date(g.game_date).getTime()))
    const byDay = new Map<string, SchedGame[]>()
    for (const g of openGames(games, now)) {
      const pp = partsInZone(new Date(g.game_date), 'America/New_York')
      const day = `${pp.year}-${pp.month}-${pp.day}`
      byDay.set(day, [...(byDay.get(day) ?? []), g])
    }
    for (const dayGames of byDay.values()) {
      const at = new Date(Math.min(...dayGames.map(g => new Date(g.game_date).getTime())))
      out.push({
        week, at, key: `k${at.toISOString().slice(0, 13)}`,
        weekStart: at.getTime() === firstKickoff, games: dayGames,
      })
    }
  }
  return out
}

/**
 * Subject/heading/body for a pick reminder.
 *   deadline — deadline leagues: everything locks at once
 *   week     — kickoff leagues, early reminder: the week's first kickoff
 *   day      — kickoff leagues, final nudge: one game day's first kickoff
 */
function pickReminderCopy(o: {
  kind: 'deadline' | 'week' | 'day'
  week: number; at: Date; tz: string; hours: number; leagueName: string
  unpicked: number; tbMissing: boolean; noneYet: boolean
}): Pick<Reminder, 'subject' | 'heading' | 'body' | 'ctaLabel'> {
  const { kind, week: wk, at, tz, hours: h, leagueName, unpicked: n, tbMissing, noneYet } = o
  const s = n === 1 ? '' : 's'
  const when = formatInZone(at, tz)
  const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(at)

  if (n === 0) {
    const lock = kind === 'deadline' ? `Picks lock ${when}` : `It locks at kickoff, ${when}`
    return {
      subject: `Week ${wk} tiebreaker guess missing - ${leagueName}`,
      heading: `Your Week ${wk} tiebreaker guess isn't in`,
      body: `${lock} — about ${h} hours from now. Without a guess you lose every tie.`,
      ctaLabel: 'Add guess',
    }
  }

  const tbLine = tbMissing ? ' Your tiebreaker guess is missing too — without one you lose every tie.' : ''
  if (kind === 'deadline') {
    return {
      subject: `Week ${wk} picks due in ${h}h - ${leagueName}`,
      heading: noneYet ? `Your Week ${wk} picks aren't in` : `${n} of your Week ${wk} picks aren't in`,
      body: `Picks lock ${when} — about ${h} hours from now. Get them in before then.${tbLine}`,
      ctaLabel: 'Make picks',
    }
  }
  if (kind === 'week') {
    return {
      subject: `Week ${wk} kicks off in ${h}h - ${leagueName}`,
      heading: noneYet ? `Your Week ${wk} picks aren't in` : `${n} Week ${wk} game${s} still unpicked`,
      body: `The first game kicks off ${when} — about ${h} hours from now. Each game locks at its own kickoff.${tbLine}`,
      ctaLabel: 'Make picks',
    }
  }
  return {
    subject: `${n} ${day} pick${s} lock${n === 1 ? 's' : ''} in ${h}h - ${leagueName}`,
    heading: `${n} ${day} game${s} still unpicked`,
    body: `${day}'s first game kicks off ${when} — about ${h} hours from now, and picks lock at kickoff.${tbLine}`,
    ctaLabel: 'Make picks',
  }
}

/**
 * The next Pick'Em deadline still ahead of `now`, and the week it
 * locks. Per-week override first, else the league rule — the same
 * precedence as resolveWeekDeadline in src/lib/deadline.ts.
 */
function nextPickemDeadline(
  weeks: Map<number, SchedGame[]> | undefined,
  overrides: Map<number, string>,
  day: number, time: string, tz: string, now: Date,
): { week: number; deadline: Date } | null {
  let best: { week: number; deadline: Date } | null = null
  for (const [week, games] of weeks ?? []) {
    const override = overrides.get(week)
    const firstKickoff = new Date(Math.min(...games.map(g => new Date(g.game_date).getTime())))
    const deadline = override
      ? new Date(override)
      : weeklyDeadlineForWeek(firstKickoff, day, time, tz)
    if (!deadline || deadline.getTime() <= now.getTime()) continue
    if (!best || deadline.getTime() < best.deadline.getTime()) best = { week, deadline }
  }
  return best
}

/**
 * The week that just wrapped: every game final (the schedule already
 * leaves postponed games out, matching isWeekComplete), and the last one
 * kicked off within `maxAgeMs` (4 days by default) — so an offseason
 * Tuesday never recaps a months-old week.
 */
function justFinishedWeek(weeks: Map<number, SchedGame[]> | undefined, now: Date, maxAgeMs = 4 * 24 * HOUR): number | null {
  let best: number | null = null
  for (const [week, games] of weeks ?? []) {
    if (games.length === 0 || !games.every(isFinal)) continue
    const sinceLastKickoff = now.getTime() - Math.max(...games.map(g => new Date(g.game_date).getTime()))
    if (sinceLastKickoff < 0 || sinceLastKickoff > maxAgeMs) continue
    if (best == null || week > best) best = week
  }
  return best
}

/** The week of the next game still to be played (today's, on a game day). */
function upcomingWeek(weeks: Map<number, SchedGame[]> | undefined, now: Date): number | null {
  let best: { week: number; at: number } | null = null
  for (const [week, games] of weeks ?? []) {
    for (const g of games) {
      if (isFinal(g)) continue
      const at = new Date(g.game_date).getTime()
      if (at < now.getTime() - 12 * HOUR) continue   // stale row that never got a result
      if (!best || at < best.at) best = { week, at }
    }
  }
  return best?.week ?? null
}

/** "Sun 4:25 PM" in a zone — the kickoff line in pick-reminder emails. */
function shortWhen(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' })
    .format(new Date(iso)).replace(/[\u202F\u00A0]/g, ' ')
}

/** "Week 3", or the playoff round as a title ("Wild Card Weekend"). */
function weekTitle(w: number): string {
  return w === 19 ? 'Wild Card Weekend' : w === 20 ? 'Divisional Round'
    : w === 21 ? 'Championship Weekend' : w === 22 ? 'the Super Bowl' : `Week ${w}`
}

/** "Week 3", or the playoff round's name. */
function weekName(w: number): string {
  return w === 19 ? 'Wild Card weekend' : w === 20 ? 'the Divisional round'
    : w === 21 ? 'Championship weekend' : w === 22 ? 'the Super Bowl' : `Week ${w}`
}

/** First kickoff of a week's last game day (days in Eastern time). */
function lastGameDayKickoff(games: SchedGame[]): Date | null {
  if (games.length === 0) return null
  const dayOf = (g: SchedGame) => {
    const pp = partsInZone(new Date(g.game_date), 'America/New_York')
    return pp.year * 10000 + pp.month * 100 + pp.day
  }
  const last = Math.max(...games.map(dayOf))
  return new Date(Math.min(...games.filter(g => dayOf(g) === last).map(g => new Date(g.game_date).getTime())))
}

/** Render an instant in a zone, e.g. 'Wed, Aug 19, 5:00 PM MDT'. */
function formatInZone(date: Date, tz: string): string {
  try {
    // Intl inserts U+202F before AM/PM, which renders as "?" in some
    // mail clients — normalise it to a plain space.
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }).format(date).replace(/[\u202F\u00A0]/g, ' ')
  } catch {
    return date.toISOString()
  }
}
