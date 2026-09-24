// ══════════════════════════════════════════════════════════════
// push-test — "Send a test notification" from Settings
//
// Sends one notification to every device the signed-in user has
// turned notifications on for, so they can see it working. Only
// ever targets the caller's own devices (resolved from their JWT).
// Devices the push service reports as gone (404/410) are removed.
// ══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWebPush, type VapidKeys } from '../_shared/webPush.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'not signed in' }, 401)

  const vapid: VapidKeys = {
    publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
    privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
    subject: Deno.env.get('VAPID_SUBJECT') ?? 'https://www.gridironunited.app',
  }
  if (!vapid.publicKey || !vapid.privateKey) return json({ error: 'push not configured' }, 500)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', user.id)
  if (!subs || subs.length === 0) return json({ sent: 0, failed: 0, devices: 0 })

  // Looks like the real thing (see send-reminders' pushPayload)
  const payload = JSON.stringify({
    title: "🔔 You're all set",
    body: "Pick reminders, your weekly result and live game alerts will show up here.",
    url: '/app/settings',
    tag: 'push-test',
    icon: '/icons/notify/test.png',
    actions: [{ action: 'pickem', title: "Open Pick'Em", url: '/app/pickem' }],
  })

  let sent = 0, failed = 0
  const errors: { status: number; body?: string }[] = []
  for (const s of subs) {
    try {
      const r = await sendWebPush(s, payload, vapid, { ttlSec: 600, urgency: 'high' })
      if (r.status >= 200 && r.status < 300) {
        sent++
        await admin.from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('id', s.id)
      } else {
        failed++
        errors.push({ status: r.status, body: r.body })
        if (r.gone) await admin.from('push_subscriptions').delete().eq('id', s.id)
      }
    } catch (e) {
      failed++
      errors.push({ status: 0, body: String(e) })
    }
  }
  return json({ sent, failed, devices: subs.length, ...(failed ? { errors } : {}) })
})
