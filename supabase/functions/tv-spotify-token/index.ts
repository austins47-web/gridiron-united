// ══════════════════════════════════════════════════════════════
// tv-spotify-token — a Spotify token for the Shop TV to play music with
//
// GET ?token=<8-character TV code> (like shop-tv: a TV can't sign in):
//   { token, expiresAt }   the league's Spotify access token (an hour at
//                          most), for Spotify's Web Playback SDK on the TV
//   403 { error }          the commissioner hasn't turned the TV's speaker
//                          on (Commish panel → Shop TV), or the Spotify
//                          grant has no playback permission
// The TV asks when its player starts and each time the token runs out.
// Anyone with the TV's code can get one, which is why it's off until the
// commissioner turns it on.
// ══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { spotifyAccess } from '../_shared/spotifyToken.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const code = (new URL(req.url).searchParams.get('token') ?? '').toLowerCase()
  if (!/^[a-z2-9]{8}$/.test(code)) return json({ error: 'not found' }, 404)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: tv } = await admin.from('league_tv_tokens').select('league_id').eq('token', code).maybeSingle()
  if (!tv) return json({ error: 'not found' }, 404)
  const { data: sp } = await admin
    .from('league_spotify')
    .select('refresh_token, access_token, expires_at, scopes, tv_player')
    .eq('league_id', tv.league_id)
    .maybeSingle()
  if (!sp?.tv_player || !String(sp.scopes ?? '').split(' ').includes('streaming')) {
    return json({ error: 'The TV speaker is off' }, 403)
  }

  const access = await spotifyAccess(admin, tv.league_id, sp)
  if ('error' in access) return json({ error: access.error }, access.error === 'revoked' ? 403 : 503)
  return json({ token: access.token, expiresAt: access.expiresAt })
})
