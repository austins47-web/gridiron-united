// The newsreel's lines as recordings of the Transatlantic announcer (the
// newsreel-voice function), for the TV by its code or for a league member.
import { supabase } from '@/lib/supabase'

export type VoiceFrom = { token: string } | { leagueId: string }

/** A link to each line's recording, or null if there aren't any (no voice service set up, the day's limit, a hiccup). */
export async function fetchVoices(lines: string[], from: VoiceFrom): Promise<string[] | null> {
  try {
    if ('token' in from) {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsreel-voice`, {
        method: 'POST',
        headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: from.token, lines }),
      })
      if (!r.ok) return null
      return ((await r.json()) as { voices?: string[] | null }).voices ?? null
    }
    const { data, error } = await supabase.functions.invoke('newsreel-voice', { body: { league_id: from.leagueId, lines } })
    if (error) return null
    return (data as { voices?: string[] | null })?.voices ?? null
  } catch {
    return null
  }
}
