import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Music, Loader2, Unplug, Speaker } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'

/** What came back from Spotify (spotify-connect sends ?spotify=…). */
const RETURN_MESSAGES: Record<string, [ok: boolean, text: string]> = {
  connected: [true, 'Spotify connected. The TV shows the song within a minute.'],
  cancelled: [false, 'Spotify wasn’t connected.'],
  expired: [false, 'That took too long. Try connecting again.'],
  failed: [false, 'Spotify didn’t connect. Try again.'],
  'not-set-up': [false, 'Spotify isn’t set up for this app yet.'],
  player: [true, 'The TV is a Spotify speaker now: pick it in Spotify’s list of devices.'],
  'no-player': [false, 'Spotify didn’t give permission to play music. Try again.'],
}

/**
 * Music on the TV: the commissioner connects their Spotify
 * (spotify-connect) and the Shop TV shows the song playing on it
 * (tv-now-playing). It only sees what's playing, unless the commissioner
 * also turns on the TV's speaker: then it asks Spotify for permission to
 * play too, and the TV shows up in Spotify's device list
 * (tv-spotify-token, Spotify's Web Playback SDK).
 */
export function TvMusicSetting({ leagueId }: { leagueId: string }) {
  const qc = useQueryClient()
  const key = ['league-spotify', leagueId]
  const { data: status, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('league_spotify_status', { p_league: leagueId })
      if (error) throw error
      return data?.[0] ?? { connected: false, spotify_name: null, connected_at: null, can_play: false, tv_player: false }
    },
  })

  // Back from Spotify: say how it went, once
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const result = params.get('spotify')
    if (!result) return
    const [ok, text] = RETURN_MESSAGES[result] ?? [false, 'Spotify didn’t connect. Try again.']
    if (ok) toast.success(text)
    else toast.error(text)
    qc.invalidateQueries({ queryKey: key })
    const next = new URLSearchParams(params)
    next.delete('spotify')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const [busy, setBusy] = useState(false)
  // player: also ask for permission to play music, for the TV's speaker
  const connect = async (player = false) => {
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('spotify-connect', { body: { league_id: leagueId, player } })
    if (error || !data?.url) {
      const msg = await (error as any)?.context?.json?.().then((b: any) => b?.error).catch(() => null)
      toast.error(msg ?? 'Couldn’t start connecting Spotify')
      setBusy(false)
      return
    }
    window.location.href = data.url
  }
  const disconnect = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('disconnect_league_spotify', { p_league: leagueId })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: key })
    toast.success('Spotify disconnected. The TV stops showing songs.')
  }
  const setSpeaker = async (on: boolean) => {
    setBusy(true)
    const { error } = await supabase.rpc('set_league_spotify_tv_player', { p_league: leagueId, p_on: on })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: key })
    toast.success(on ? 'The TV is a Spotify speaker: pick it in Spotify’s list of devices.' : 'The TV stopped being a Spotify speaker.')
  }

  return (
    <div className="pt-3 border-t border-field-700">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="flex items-center gap-1.5 font-cond font-bold text-sm uppercase tracking-wider text-white">
          <Music className="w-3.5 h-3.5 text-[#1DB954]" /> Music on the TV
        </span>
        {(busy || isLoading) && <Loader2 className="w-3.5 h-3.5 animate-spin text-field-400" />}
      </div>
      <p className="text-field-400 text-xs mb-3">
        Connect the Spotify that plays in the shop, and the TV shows the song that’s on: the cover, the artist and how far
        in, with a bigger card each time the song changes. It only sees what’s playing.
      </p>
      {status?.connected ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#1DB954]/40 bg-[#1DB954]/[0.06] px-3 py-2.5">
          <span className="text-sm text-field-200 min-w-0 truncate">
            <span className="font-bold text-[#1DB954]">Connected</span>{status.spotify_name ? ` to ${status.spotify_name}` : ''}
          </span>
          <button onClick={disconnect} disabled={busy} className="btn-ghost !py-1.5 !px-3 !text-xs shrink-0">
            <Unplug className="w-3.5 h-3.5" /> Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={() => connect()}
          disabled={busy || isLoading}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#1DB954] px-4 py-2.5 text-sm font-bold text-black hover:brightness-110 disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Music className="w-4 h-4" />} Connect Spotify
        </button>
      )}
      {status?.connected && (
        <div className="mt-2 rounded-xl border border-field-700 bg-field-800/60 px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-bold text-white">
                <Speaker className="w-3.5 h-3.5 text-[#1DB954]" /> Play the music on the TV
              </p>
              <p className="text-xs text-field-400 mt-0.5">
                The TV shows up in Spotify’s list of devices, like a speaker. Pick it on your phone and the music comes
                out of the TV. Needs Spotify Premium.
              </p>
            </div>
            {status.can_play ? (
              <button
                role="switch"
                aria-checked={status.tv_player}
                aria-label="Play the music on the TV"
                onClick={() => setSpeaker(!status.tv_player)}
                disabled={busy}
                className={clsx('relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5', status.tv_player ? 'bg-[#1DB954]' : 'bg-field-600', busy && 'opacity-60')}
              >
                <span className={clsx('absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all', status.tv_player ? 'left-[22px]' : 'left-0.5')} />
              </button>
            ) : (
              <button onClick={() => connect(true)} disabled={busy} className="shrink-0 rounded-lg bg-[#1DB954] px-3 py-1.5 text-xs font-bold text-black hover:brightness-110 disabled:opacity-60">
                Turn on
              </button>
            )}
          </div>
          <p className="text-[11px] text-field-500 mt-2">
            {status.can_play
              ? 'While it’s on, anyone with the TV’s link can play music through this Spotify.'
              : 'Spotify asks you once more, for permission to play music.'}
          </p>
        </div>
      )}
    </div>
  )
}
