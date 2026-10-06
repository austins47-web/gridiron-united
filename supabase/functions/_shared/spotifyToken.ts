// The league's Spotify access token (league_spotify), refreshed and saved
// when it has run out. Used by tv-now-playing (what's on) and
// tv-spotify-token (the TV playing the music itself).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface SpotifyRow { refresh_token: string; access_token: string | null; expires_at: string | null }

/**
 * The token and when it runs out, or why there isn't one: `revoked`
 * (Spotify said no to the refresh: the connection is deleted and the
 * commissioner has to connect again) or `unavailable` (Spotify isn't set
 * up here, or didn't answer).
 */
export async function spotifyAccess(
  admin: SupabaseClient, leagueId: string, sp: SpotifyRow,
): Promise<{ token: string; expiresAt: number } | { error: 'revoked' | 'unavailable' }> {
  if (sp.access_token && sp.expires_at && new Date(sp.expires_at).getTime() > Date.now()) {
    return { token: sp.access_token, expiresAt: new Date(sp.expires_at).getTime() }
  }
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID')
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET')
  if (!clientId || !clientSecret) return { error: 'unavailable' }
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: sp.refresh_token }),
  }).catch(() => null)
  if (!r?.ok) {
    // Revoked at Spotify's end: the commissioner has to connect again
    if (r?.status === 400) {
      await admin.from('league_spotify').delete().eq('league_id', leagueId)
      return { error: 'revoked' }
    }
    return { error: 'unavailable' }
  }
  const t = await r.json() as { access_token: string; refresh_token?: string; expires_in: number }
  // A minute early, so a token handed out is never about to die
  const expiresAt = Date.now() + (t.expires_in - 60) * 1000
  await admin.from('league_spotify').update({
    access_token: t.access_token,
    ...(t.refresh_token ? { refresh_token: t.refresh_token } : {}),
    expires_at: new Date(expiresAt).toISOString(),
  }).eq('league_id', leagueId)
  return { token: t.access_token, expiresAt }
}
