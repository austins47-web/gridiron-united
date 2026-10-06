// ══════════════════════════════════════════════════════════════
// tv-now-playing — the song on the league's Spotify, for the Shop TV
//
// GET ?token=<8-character TV code> (like shop-tv: a TV can't sign in):
//   { connected: false }                     no Spotify connected
//   { connected: true, playing: false }      nothing on, or paused
//   { connected: true, playing: true, title, artist, album, art,
//     progressMs, durationMs }               what's on
// Refreshes the access token (_shared/spotifyToken.ts) when it runs out. The TV
// calls this as each song should end and every 30 seconds while playing.
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

  const token = (new URL(req.url).searchParams.get('token') ?? '').toLowerCase()
  if (!/^[a-z2-9]{8}$/.test(token)) return json({ error: 'not found' }, 404)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: tv } = await admin.from('league_tv_tokens').select('league_id').eq('token', token).maybeSingle()
  if (!tv) return json({ error: 'not found' }, 404)
  const { data: sp } = await admin.from('league_spotify').select('refresh_token, access_token, expires_at').eq('league_id', tv.league_id).maybeSingle()
  if (!sp) return json({ connected: false })

  // A fresh access token when this one's run out
  const access = await spotifyAccess(admin, tv.league_id, sp)
  if ('error' in access) return json({ connected: access.error !== 'revoked', playing: false })

  const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode', {
    headers: { Authorization: `Bearer ${access.token}` },
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
