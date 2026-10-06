// ══════════════════════════════════════════════════════════════
// tv-now-playing — the song on the league's Spotify, for the Shop TV
//
// GET ?token=<8-character TV code> (like shop-tv: a TV can't sign in):
//   { connected: false }                     no Spotify connected
//   { connected: true, playing: false }      nothing on, or paused
//   { connected: true, playing: true, title, artist, album, art,
//     progressMs, durationMs }               what's on
// Refreshes the access token (league_spotify) when it runs out. The TV
// calls this as each song should end and every 30 seconds while playing.
// ══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

  const token = (new URL(req.url).searchParams.get('token') ?? '').toLowerCase()
  if (!/^[a-z2-9]{8}$/.test(token)) return json({ error: 'not found' }, 404)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: tv } = await admin.from('league_tv_tokens').select('league_id').eq('token', token).maybeSingle()
  if (!tv) return json({ error: 'not found' }, 404)
  const { data: sp } = await admin.from('league_spotify').select('refresh_token, access_token, expires_at').eq('league_id', tv.league_id).maybeSingle()
  if (!sp) return json({ connected: false })

  // A fresh access token when this one's run out
  let access = sp.access_token as string | null
  if (!access || !sp.expires_at || new Date(sp.expires_at).getTime() <= Date.now()) {
    const clientId = Deno.env.get('SPOTIFY_CLIENT_ID')
    const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET')
    if (!clientId || !clientSecret) return json({ connected: true, playing: false })
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: sp.refresh_token }),
    })
    if (!r.ok) {
      // Revoked at Spotify's end: the commissioner has to connect again
      if (r.status === 400) await admin.from('league_spotify').delete().eq('league_id', tv.league_id)
      return json({ connected: r.status !== 400, playing: false })
    }
    const t = await r.json() as { access_token: string; refresh_token?: string; expires_in: number }
    access = t.access_token
    await admin.from('league_spotify').update({
      access_token: t.access_token,
      ...(t.refresh_token ? { refresh_token: t.refresh_token } : {}),
      expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    }).eq('league_id', tv.league_id)
  }

  const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode', {
    headers: { Authorization: `Bearer ${access}` },
  })
  if (res.status === 204) return json({ connected: true, playing: false })
  if (res.status === 429) return json({ connected: true, playing: false, retryAfterSec: Number(res.headers.get('Retry-After') ?? 60) })
  if (!res.ok) return json({ connected: true, playing: false })

  const now = await res.json() as any
  const item = now?.item
  if (!item) return json({ connected: true, playing: false })
  const episode = now.currently_playing_type === 'episode'
  const images = (episode ? item.images ?? item.show?.images : item.album?.images) ?? []
  return json({
    connected: true,
    playing: !!now.is_playing,
    title: String(item.name ?? ''),
    artist: episode ? String(item.show?.name ?? '') : (item.artists ?? []).map((a: { name: string }) => a.name).join(', '),
    album: episode ? null : String(item.album?.name ?? ''),
    // The 300px cover: big enough for the TV, not the 640px original
    art: (images.find((i: { width: number }) => i.width && i.width <= 320) ?? images[0])?.url ?? null,
    progressMs: Number(now.progress_ms ?? 0),
    durationMs: Number(item.duration_ms ?? 0),
  })
})
