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
  nflSeasonFor, type Game,
} from '../_shared/pickemCore.ts'
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
}

// ══ PROVIDER — swap this one function to change email vendors ══
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
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

// ── Email template — dark, on-brand, no external assets ───────
function renderEmail(r: Reminder): string {
  const accent = r.urgent ? '#CE7B45' : '#A3A3A3'
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#141414;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#141414;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#1C1C1C;border:1px solid #303030;border-radius:16px;overflow:hidden;">

        <!-- gold chain marker -->
        <tr><td style="height:3px;background:#CE7B45;font-size:0;line-height:0;">&nbsp;</td></tr>

        <tr><td style="padding:28px 28px 8px;">
          <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${accent};font-weight:700;">
            ${escapeHtml(r.leagueName)}
          </div>
          <div style="font-size:24px;font-weight:800;color:#ffffff;margin-top:8px;line-height:1.2;">
            ${escapeHtml(r.heading)}
          </div>
          <div style="font-size:15px;color:#A3A3A3;margin-top:10px;line-height:1.5;">
            ${escapeHtml(r.body)}
          </div>
        </td></tr>

        <tr><td style="padding:20px 28px 28px;">
          <a href="${APP_URL}${r.ctaPath}"
             style="display:inline-block;background:#CE7B45;color:#0A0A0A;text-decoration:none;
                    font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;">
            ${escapeHtml(r.ctaLabel)}
          </a>
        </td></tr>

        <tr><td style="padding:16px 28px;border-top:1px solid #303030;">
          <div style="font-size:11px;color:#666666;line-height:1.6;">
            You're receiving this because email reminders are on for
            <strong style="color:#A3A3A3;">${escapeHtml(r.leagueName)}</strong>.<br>
            <a href="${APP_URL}/app/settings" style="color:#CE7B45;">Manage or turn off reminders</a>
          </div>
        </td></tr>
      </table>

      <div style="font-size:11px;color:#4A4A4A;margin-top:16px;">Gridiron United</div>
    </td></tr>
  </table>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
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

    // prefs lookup: `${user}:${league ?? 'global'}`
    const prefFor = (userId: string, leagueId: string) => {
      const rows = prefsRows ?? []
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
    type NotifyKey = 'notify_pickem_deadline' | 'notify_draft' | 'notify_on_the_clock' | 'notify_trades' | 'notify_lineup' | 'notify_weekly_recap'
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
            const unpicked = scope.filter(g => !mine.some(p => p.game_id === g.id)).length
            const tb = scope.find(g => g.is_tiebreaker)
            const tbMissing = !!tb && !mine.some(p => p.game_id === tb.id && p.tiebreaker_score != null)
            if (unpicked === 0 && !tbMissing) continue

            const copy = pickReminderCopy({
              kind: onDeadline ? 'deadline' : tag === 'p' ? 'week' : 'day',
              week: l.week, at: l.at, tz, hours: Math.round(hrs), leagueName: lg.name,
              unpicked, tbMissing,
              noneYet: !mine.some(p => p.week === l.week),
            })
            reminders.push({
              userId: m.user_id, ...to,
              leagueId: lg.id, leagueName: lg.name,
              eventType: 'pickem_deadline',
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
              dedupeKey: `clock:${lg.id}:r${ds.current_round}:p${ds.current_pick}`,
              subject: `You're on the clock - ${lg.name}`,
              heading: "You're on the clock",
              body: `Round ${ds.current_round}, pick ${ds.current_pick}. Make your selection before the timer runs out.`,
              ctaLabel: 'Draft now', ctaPath: '/app/draft',
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
          dedupeKey: `trade:${t.id}:new`,
          subject: `${who} sent you a trade - ${lg.name}`,
          heading: `Trade offer from ${who}`,
          body: 'Review the offer and accept, counter, or decline.',
          ctaLabel: 'Review trade', ctaPath: '/app/trades',
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
            dedupeKey: `trade:${t.id}:exp12`,
            subject: `Trade from ${who} expires soon - ${lg.name}`,
            heading: 'A trade offer is about to expire',
            body: `The offer from ${who} expires in about 12 hours. Respond before it lapses.`,
            ctaLabel: 'Review trade', ctaPath: '/app/trades',
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
            dedupeKey: `lineup:${lg.id}:${season}:w${wk}`,
            subject: `Your lineup is empty - ${lg.name}`,
            heading: 'You have no players started',
            body: `Week ${wk} kicks off today and your lineup is empty. Set it before game time.`,
            ctaLabel: 'Set lineup', ctaPath: '/app/roster',
            urgent: true,
          })
        }
      }
    }

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

        for (const m of lgMembers) {
          const to = reach(m.user_id, lg.id, 'notify_weekly_recap')
          // Phones already got the result the moment the week went final
          // (section 6) — the Tuesday recap stays an email.
          if (!to?.email) continue

          reminders.push({
            userId: m.user_id, ...to, push: false,
            leagueId: lg.id, leagueName: lg.name,
            eventType: 'weekly_recap',
            dedupeKey: recapKey,
            subject: `Week ${wk} wrapped - ${lg.name}`,
            heading: `Week ${wk} is in the books`,
            body: 'See where you landed in the standings and how the rest of the league did.',
            ctaLabel: 'View standings', ctaPath: '/app/leagues',
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
        const body = `${lg.name} · You went ${r.correct}/${r.played}` +
          (won ? '' : `, ${ordinal(place)} of ${played.length}`) + '. Tap for the full results.'
        reminders.push({
          userId: r.userId, email: null, push: true, pushOnly: true,
          leagueId: lg.id, leagueName: lg.name,
          eventType: 'pickem_week_final',
          dedupeKey: `weekfinal:${lg.id}:${season}:w${wk}`,
          subject: title, heading: title, body,
          pushTitle: title, pushBody: body,
          pushTag: `weekfinal-${lg.id}-w${wk}`,
          ctaLabel: 'See results', ctaPath: `/app/pickem?week=${wk}`,
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
            dedupeKey: `alive:${lg.id}:${season}:w${wk}`,
            subject: title, heading: title, body,
            pushTitle: title, pushBody: body,
            pushTag: `alive-${lg.id}-w${wk}`,
            pushTtlSec: 2 * 3600,
            ctaLabel: 'Standings', ctaPath: `/app/pickem?week=${wk}`,
          })
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
          })
          sent++
          continue
        }

        try {
          if (channel === 'email') {
            await sendEmail(r.email!, r.subject, renderEmail(r))
          } else {
            const payload = JSON.stringify({
              title: r.pushTitle ?? r.heading,
              body: r.pushBody ?? `${r.leagueName} · ${r.body}`,
              url: r.ctaPath,
              tag: r.pushTag ?? `${r.eventType}-${r.leagueId}`,
            })
            const took = await pushTo(r.userId, payload, r.pushTtlSec ?? 12 * 3600, !!r.urgent)
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

/** "Week 3", or the playoff round's name. */
function weekName(w: number): string {
  return w === 19 ? 'Wild Card weekend' : w === 20 ? 'the Divisional round'
    : w === 21 ? 'Championship weekend' : w === 22 ? 'the Super Bowl' : `Week ${w}`
}

function ordinal(n: number): string {
  const v = n % 100
  return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
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
