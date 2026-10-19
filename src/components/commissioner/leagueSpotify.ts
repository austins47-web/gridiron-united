import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'

/** The league's Spotify for the Shop TV (league_spotify_status, commissioner only). */
export interface SpotifyStatus {
  connected: boolean; spotify_name: string | null; connected_at: string | null
  can_play: boolean; tv_player: boolean
  /** The grant lets the remote's Play on the TV move the music (tv-spotify-play). */
  can_control: boolean
}

/** The league's Spotify, for Music on the TV and the TV remote. */
export function useSpotifyStatus(leagueId: string, enabled = true) {
  return useQuery({
    queryKey: ['league-spotify', leagueId],
    enabled,
    queryFn: async (): Promise<SpotifyStatus> => {
      const { data, error } = await supabase.rpc('league_spotify_status', { p_league: leagueId })
      if (error) throw error
      return data?.[0] ?? { connected: false, spotify_name: null, connected_at: null, can_play: false, tv_player: false, can_control: false }
    },
  })
}

/** Off to Spotify to approve the connection (player: with playback, for the TV's speaker). False if it couldn't start. */
export async function startSpotifyConnect(leagueId: string, player: boolean): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('spotify-connect', { body: { league_id: leagueId, player } })
  if (error || !data?.url) {
    const msg = await (error as any)?.context?.json?.().then((b: any) => b?.error).catch(() => null)
    toast.error(msg ?? 'Couldn’t start connecting Spotify')
    return false
  }
  window.location.href = data.url
  return true
}
