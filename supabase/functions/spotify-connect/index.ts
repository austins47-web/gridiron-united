// ══════════════════════════════════════════════════════════════
// spotify-connect — connecting a league's Spotify for the Shop TV
//
// POST { league_id } (signed in as its commissioner): returns the
//   Spotify page to approve it on, with a one-time state.
// GET ?code&state (Spotify sends the commissioner back here): trades
//   the code for tokens, saves them in league_spotify, and goes back to
//   the Commish panel.
//
// Needs SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET (a Spotify developer
// app whose redirect URI is this function's URL). Read-only scopes: what's
// playing, nothing else.
// ══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } })

const SCOPES = 'user-read-currently-playing user-read-playback-state'
const STATE_TTL_MS = 15 * 60_000

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = Deno.env.get('SUPABASE_URL')!
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID')
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET')
  const appUrl = Deno.env.get('APP_URL') ?? 'https://www.gridironunited.app'
  const redirectUri = `${url}/functions/v1/spotify-connect`
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const back = (result: string) =>
    Response.redirect(`${appUrl}/app/commissioner?tab=extras&spotify=${encodeURIComponent(result)}`, 302)

  // ── Start: the commissioner asks for Spotify's approval page ──
  if (req.method === 'POST') {
    if (!clientId || !clientSecret) return json({ error: "Spotify isn't set up for this app yet" }, 503)
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Sign in first' }, 401)
    const { league_id: leagueId } = await req.json().catch(() => ({}))
    if (typeof leagueId !== 'string') return json({ error: 'league_id required' }, 400)
    const { data: isCommish } = await userClient.rpc('is_league_commissioner', { check_league_id: leagueId })
    if (!isCommish) return json({ error: 'Only the commissioner can connect Spotify' }, 403)

    const bytes = crypto.getRandomValues(new Uint8Array(24))
    const state = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
    await admin.from('spotify_auth_states').delete().lt('created_at', new Date(Date.now() - STATE_TTL_MS).toISOString())
    const { error } = await admin.from('spotify_auth_states').insert({ state, league_id: leagueId, user_id: user.id })
    if (error) return json({ error: error.message }, 500)

    const authorize = new URL('https://accounts.spotify.com/authorize')
    authorize.search = new URLSearchParams({
      response_type: 'code', client_id: clientId, scope: SCOPES, redirect_uri: redirectUri, state, show_dialog: 'true',
    }).toString()
    return json({ url: authorize.toString() })
  }

  // ── Back from Spotify ──
  const params = new URL(req.url).searchParams
  const state = params.get('state') ?? ''
  const code = params.get('code')
  if (!clientId || !clientSecret) return back('not-set-up')
  if (params.get('error') || !code || !/^[0-9a-f]{48}$/.test(state)) return back('cancelled')

  const { data: pending } = await admin.from('spotify_auth_states').select('league_id, user_id, created_at').eq('state', state).maybeSingle()
  await admin.from('spotify_auth_states').delete().eq('state', state)
  if (!pending || Date.now() - new Date(pending.created_at).getTime() > STATE_TTL_MS) return back('expired')

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  })
  if (!tokenRes.ok) return back('failed')
  const tokens = await tokenRes.json() as { access_token: string; refresh_token: string; expires_in: number }

  // Whose Spotify it is, for the Commish panel
  const me = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
    .then(r => (r.ok ? r.json() : null)).catch(() => null) as { display_name?: string; id?: string } | null

  const { error } = await admin.from('league_spotify').upsert({
    league_id: pending.league_id,
    connected_by: pending.user_id,
    spotify_name: me?.display_name ?? me?.id ?? null,
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expires_at: new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString(),
    connected_at: new Date().toISOString(),
  })
  return back(error ? 'failed' : 'connected')
})
