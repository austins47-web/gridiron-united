// ══════════════════════════════════════════════════════════════
// tv-spotify-play — the remote's "Play on the TV"
//
// POST { league_id, device_id? } (signed in as its commissioner): moves
// whatever the league's Spotify is playing onto the Shop TV's speaker
// (Spotify's transfer playback), so nobody has to find the TV in
// Spotify's list of devices, or be signed in to the same Spotify.
//   device_id: the TV's Spotify device (its presence carries it); without
//              one, the device named "<league> TV" in that list.
//   { ok, playing }    moved; playing: false when nothing's on yet
//   { error, reconnect? }  reconnect: the grant can't move the playback
//              (from before this asked for it), or Spotify revoked it
// Needs the speaker on (Commish panel → Shop TV) and Spotify Premium.
// ══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { spotifyAccess } from '../_shared/spotifyToken.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } })

const RECONNECT = 'Spotify needs connecting again so the remote can send it music (Music on the TV, below).'
const TV_GONE = 'The TV isn’t connected to Spotify right now. Reload the TV from the remote, give it a few seconds, and try again.'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Sign in first' }, 401)
  const { league_id: leagueId, device_id: deviceId } = await req.json().catch(() => ({}))
  if (typeof leagueId !== 'string') return json({ error: 'league_id required' }, 400)
  const { data: isCommish } = await userClient.rpc('is_league_commissioner', { check_league_id: leagueId })
  if (!isCommish) return json({ error: 'Only the commissioner can do this' }, 403)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const [{ data: sp }, { data: league }] = await Promise.all([
    admin.from('league_spotify').select('refresh_token, access_token, expires_at, scopes, tv_player').eq('league_id', leagueId).maybeSingle(),
    admin.from('leagues').select('name').eq('id', leagueId).maybeSingle(),
  ])
  if (!sp) return json({ error: 'Connect Spotify first (Music on the TV, below).' }, 409)
  if (!sp.tv_player) return json({ error: 'Turn on “Play the music on the TV” first (Music on the TV, below).' }, 409)
  if (!String(sp.scopes ?? '').split(' ').includes('user-modify-playback-state')) return json({ error: RECONNECT, reconnect: true }, 403)

  const access = await spotifyAccess(admin, leagueId, sp)
  if ('error' in access) {
    return access.error === 'revoked'
      ? json({ error: RECONNECT, reconnect: true }, 403)
      : json({ error: 'Spotify didn’t answer. Try again in a minute.' }, 503)
  }
  const spotify = (path: string, init: RequestInit = {}) =>
    fetch(`https://api.spotify.com/v1${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${access.token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    }).catch(() => null)

  // The TV: the device its presence named, else the one with its name
  let device = typeof deviceId === 'string' && /^[\w-]{8,128}$/.test(deviceId) ? deviceId : null
  if (!device) {
    const r = await spotify('/me/player/devices')
    const list = r?.ok ? ((await r.json()) as { devices?: { id: string | null; name: string }[] }).devices ?? [] : []
    const name = `${league?.name ?? 'Shop'} TV`
    device = list.find(d => d.id && d.name === name)?.id ?? null
  }
  if (!device) return json({ error: TV_GONE }, 404)

  const moved = await spotify('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [device], play: true }) })
  if (!moved) return json({ error: 'Spotify didn’t answer. Try again in a minute.' }, 503)
  if (!moved.ok) {
    const body = await moved.json().catch(() => null) as { error?: { message?: string; reason?: string } } | null
    if (body?.error?.reason === 'PREMIUM_REQUIRED') return json({ error: 'Spotify only plays on the TV with Premium.' }, 403)
    if (moved.status === 401 || moved.status === 403) return json({ error: RECONNECT, reconnect: true }, 403)
    if (moved.status === 404) return json({ error: TV_GONE }, 404)
    return json({ error: `Spotify said no${body?.error?.message ? `: ${body.error.message}` : ''}. Try again.` }, 502)
  }

  // Moved: is anything playing there? (Nothing on the Spotify yet leaves the TV picked but quiet)
  for (let i = 0; i < 3; i++) {
    await new Promise(r => setTimeout(r, 800))
    const r = await spotify('/me/player')
    if (r?.status !== 200) continue
    const s = await r.json().catch(() => null) as { is_playing?: boolean; device?: { id?: string } } | null
    if (s?.device?.id === device && s.is_playing) return json({ ok: true, playing: true })
  }
  return json({ ok: true, playing: false })
})
