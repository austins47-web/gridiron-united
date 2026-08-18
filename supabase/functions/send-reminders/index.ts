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
//   APP_URL          — https://gridiron-united.vercel.app
//   CRON_SECRET      — any random string; must match the caller
// ══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL = Deno.env.get('APP_URL') ?? 'https://gridiron-united.vercel.app'
const FROM    = Deno.env.get('REMINDER_FROM') ?? 'Gridiron United <onboarding@resend.dev>'

// ── Types ─────────────────────────────────────────────────────
interface Reminder {
  userId: string
  email: string
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
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Resend ${res.status}: ${detail}`)
  }
}

// ── Email template — dark, on-brand, no external assets ───────
function renderEmail(r: Reminder): string {
  const accent = r.urgent ? '#F5A623' : '#8a9ab8'
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#0e1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0e1117;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#161b27;border:1px solid #273044;border-radius:16px;overflow:hidden;">

        <!-- gold chain marker -->
        <tr><td style="height:3px;background:#F5A623;font-size:0;line-height:0;">&nbsp;</td></tr>

        <tr><td style="padding:28px 28px 8px;">
          <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${accent};font-weight:700;">
            ${escapeHtml(r.leagueName)}
          </div>
          <div style="font-size:24px;font-weight:800;color:#ffffff;margin-top:8px;line-height:1.2;">
            ${escapeHtml(r.heading)}
          </div>
          <div style="font-size:15px;color:#8a9ab8;margin-top:10px;line-height:1.5;">
            ${escapeHtml(r.body)}
          </div>
        </td></tr>

        <tr><td style="padding:20px 28px 28px;">
          <a href="${APP_URL}${r.ctaPath}"
             style="display:inline-block;background:#F5A623;color:#08090f;text-decoration:none;
                    font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;">
            ${escapeHtml(r.ctaLabel)}
          </a>
        </td></tr>

        <tr><td style="padding:16px 28px;border-top:1px solid #273044;">
          <div style="font-size:11px;color:#5a6a8a;line-height:1.6;">
            You're getting this because you have reminders on for this league.
            <a href="${APP_URL}/app/settings" style="color:#8a9ab8;">Manage your reminders</a>.
          </div>
        </td></tr>
      </table>

      <div style="font-size:11px;color:#3a4560;margin-top:16px;">Gridiron United</div>
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
      supabase.from('leagues').select('id, name, league_type, current_week, season, draft_status, pick_lock_type, pick_deadline_day, pick_deadline_time'),
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

    // ══ 1. PICK'EM DEADLINES ═════════════════════════════════
    // Only for leagues on a fixed weekly deadline.
    for (const lg of leagues ?? []) {
      if (lg.league_type !== 'pickem') continue
      if (lg.pick_lock_type !== 'deadline') continue
      if (lg.pick_deadline_day == null || !lg.pick_deadline_time) continue

      const next = nextWeeklyDeadline(lg.pick_deadline_day, lg.pick_deadline_time)
      const hrs = hoursUntil(next.toISOString())
      const wk = lg.current_week ?? 1

      nearMisses.push({
        league: lg.name,
        type: 'pickem_deadline',
        deadlineUtc: next.toISOString(),
        hoursUntil: Number(hrs.toFixed(2)),
        note: 'fires when hoursUntil is within 0.5 of a member lead time (default 24 or 2)',
      })

      const lgMembers = (members ?? []).filter(m => m.league_id === lg.id)

      // Who has already picked this week?
      const { data: picks } = await supabase
        .from('pickem_picks')
        .select('user_id')
        .eq('league_id', lg.id)
        .eq('week', wk)
        .eq('season', lg.season ?? 2026)
      const picked = new Set((picks ?? []).map(p => p.user_id))

      for (const m of lgMembers) {
        if (picked.has(m.user_id)) continue          // already done — don't nag
        const pref = prefFor(m.user_id, lg.id)
        if (!pref.email_enabled || !pref.notify_pickem_deadline) continue

        for (const [target, tag] of [[pref.lead_primary, 'p'], [pref.lead_secondary, 's']] as const) {
          if (!inWindow(hrs, target)) continue
          const email = emailOf(m.user_id)
          if (!email) continue
          reminders.push({
            userId: m.user_id, email,
            leagueId: lg.id, leagueName: lg.name,
            eventType: 'pickem_deadline',
            dedupeKey: `pickem:${lg.id}:${lg.season ?? 2026}:w${wk}:${tag}`,
            subject: `Week ${wk} picks due in ${Math.round(hrs)}h - ${lg.name}`,
            heading: `Your Week ${wk} picks aren't in`,
            body: `Picks lock in about ${Math.round(hrs)} hours. Get them in before the deadline.`,
            ctaLabel: 'Make picks', ctaPath: '/app/pickem',
            urgent: target <= 4,
          })
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
        const pref = prefFor(ds.current_user_id, lg.id)
        if (pref.email_enabled && pref.notify_on_the_clock) {
          const email = emailOf(ds.current_user_id)
          if (email) {
            reminders.push({
              userId: ds.current_user_id, email,
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
      const pref = prefFor(t.receiver_id, lg.id)
      if (!pref.email_enabled || !pref.notify_trades) continue
      const email = emailOf(t.receiver_id)
      if (!email) continue

      const proposer: any = profileById.get(t.proposer_id ?? '')
      const who = proposer?.display_name || proposer?.username || 'A league member'

      // New offer — within the last 20 minutes
      const ageMin = (Date.now() - new Date(t.created_at).getTime()) / 60000
      if (ageMin <= 20) {
        reminders.push({
          userId: t.receiver_id, email,
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
            userId: t.receiver_id, email,
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
    // Fires Sunday morning for in-season fantasy leagues with an
    // empty roster for the current week.
    const dow = now.getUTCDay()          // 0 = Sunday
    const utcHour = now.getUTCHours()
    if (dow === 0 && utcHour === 14) {   // ~9am ET Sunday
      for (const lg of leagues ?? []) {
        if (lg.league_type === 'pickem') continue
        if (lg.draft_status === 'pre_draft') continue

        const lgMembers = (members ?? []).filter(m => m.league_id === lg.id)
        const { data: rosters } = await supabase
          .from('rosters')
          .select('user_id')
          .eq('league_id', lg.id)
          .eq('week', 0)

        const hasRoster = new Set((rosters ?? []).map(r => r.user_id))

        for (const m of lgMembers) {
          if (hasRoster.has(m.user_id)) continue
          const pref = prefFor(m.user_id, lg.id)
          if (!pref.email_enabled || !pref.notify_lineup) continue
          const email = emailOf(m.user_id)
          if (!email) continue

          reminders.push({
            userId: m.user_id, email,
            leagueId: lg.id, leagueName: lg.name,
            eventType: 'lineup_empty',
            dedupeKey: `lineup:${lg.id}:w${lg.current_week ?? 1}`,
            subject: `Your lineup is empty - ${lg.name}`,
            heading: 'You have no players started',
            body: `Week ${lg.current_week ?? 1} kicks off today and your lineup is empty. Set it before game time.`,
            ctaLabel: 'Set lineup', ctaPath: '/app/roster',
            urgent: true,
          })
        }
      }
    }

    // ══ 5. WEEKLY RECAP — Monday morning ═════════════════════
    if (dow === 2 && utcHour === 14) {   // Tuesday ~9am ET
      for (const lg of leagues ?? []) {
        if (lg.draft_status === 'pre_draft') continue
        const wk = lg.current_week ?? 1
        const lgMembers = (members ?? []).filter(m => m.league_id === lg.id)

        for (const m of lgMembers) {
          const pref = prefFor(m.user_id, lg.id)
          if (!pref.email_enabled || !pref.notify_weekly_recap) continue
          const email = emailOf(m.user_id)
          if (!email) continue

          reminders.push({
            userId: m.user_id, email,
            leagueId: lg.id, leagueName: lg.name,
            eventType: 'weekly_recap',
            dedupeKey: `recap:${lg.id}:w${wk}`,
            subject: `Week ${wk} wrapped - ${lg.name}`,
            heading: `Week ${wk} is in the books`,
            body: 'See where you landed in the standings and how the rest of the league did.',
            ctaLabel: 'View standings', ctaPath: '/app/leagues',
          })
        }
      }
    }

    // ══ SEND ═════════════════════════════════════════════════
    let sent = 0, skipped = 0, failed = 0
    const results: any[] = []

    for (const r of reminders) {
      // Idempotency — has this exact reminder already gone out?
      const { data: existing } = await supabase
        .from('reminder_log')
        .select('id')
        .eq('user_id', r.userId)
        .eq('dedupe_key', r.dedupeKey)
        .eq('channel', 'email')
        .maybeSingle()

      if (existing) { skipped++; continue }

      if (dryRun) {
        results.push({ to: r.email, subject: r.subject, dedupeKey: r.dedupeKey })
        sent++
        continue
      }

      try {
        await sendEmail(r.email, r.subject, renderEmail(r))
        await supabase.from('reminder_log').insert({
          user_id: r.userId, league_id: r.leagueId,
          event_type: r.eventType, dedupe_key: r.dedupeKey,
          channel: 'email', status: 'sent',
        })
        sent++
      } catch (e) {
        failed++
        await supabase.from('reminder_log').insert({
          user_id: r.userId, league_id: r.leagueId,
          event_type: r.eventType, dedupe_key: r.dedupeKey,
          channel: 'email', status: 'failed', error: String(e),
        })
      }
    }

    return new Response(JSON.stringify({
      ok: true, dryRun, considered: reminders.length, sent, skipped, failed,
      ...(dryRun ? { preview: results, nearMisses } : {}),
    }), { headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } })

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    })
  }
})

// ── Next occurrence of a weekly deadline (day 0-6, "HH:MM") ───
function nextWeeklyDeadline(day: number, time: string): Date {
  const [h, m] = time.split(':').map(Number)
  const now = new Date()
  const d = new Date(now)
  d.setUTCHours(h, m, 0, 0)
  const delta = (day - d.getUTCDay() + 7) % 7
  d.setUTCDate(d.getUTCDate() + delta)
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 7)
  return d
}
