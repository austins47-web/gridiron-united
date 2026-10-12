// Lines read aloud by a recorded voice (the newsreel-voice function): the
// newsreel's announcer, or the roast's reader; for the TV by its code or for
// a league member.
import { supabase } from '@/lib/supabase'

export type VoiceFrom = { token: string } | { leagueId: string }

/** A link to each line's recording (null for one that couldn't be made), or null if there aren't any (no voice service set up, the day's limit, a hiccup). */
export async function fetchVoices(lines: string[], from: VoiceFrom, voice = 'newsreel'): Promise<(string | null)[] | null> {
  try {
    if ('token' in from) {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsreel-voice`, {
        method: 'POST',
        headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: from.token, lines, voice }),
      })
      if (!r.ok) return null
      return ((await r.json()) as { voices?: (string | null)[] | null }).voices ?? null
    }
    const { data, error } = await supabase.functions.invoke('newsreel-voice', { body: { league_id: from.leagueId, lines, voice } })
    if (error) return null
    return (data as { voices?: (string | null)[] | null })?.voices ?? null
  } catch {
    return null
  }
}
