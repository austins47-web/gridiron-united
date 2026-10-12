// The week being played, as it stands (the conquest function's 'sofar':
// what settling it now would do, saved nowhere), for the War Office's
// poster and newsreel before the week's last game.
import { supabase } from '@/lib/supabase'
import type { ConquestData, ConquestMove } from './conquestView'

export interface SoFar {
  week: number
  /** games still to play */
  pending: number
  owners: Record<string, string | null>
  besieged: Record<string, string>
  moves: ConquestMove[]
}

/** As it stands: by the Shop TV's code, or signed in as a member of the league. */
export async function fetchSoFar(by: { token: string } | { leagueId: string }): Promise<SoFar | null> {
  if ('token' in by) {
    const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/conquest`, {
      method: 'POST',
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sofar', token: by.token }),
      cache: 'no-store',
    })
    if (!r.ok) return null
    return ((await r.json()) as { sofar?: SoFar | null }).sofar ?? null
  }
  const { data, error } = await supabase.functions.invoke('conquest', { body: { action: 'sofar', league_id: by.leagueId } })
  if (error) return null
  return (data as { sofar?: SoFar | null })?.sofar ?? null
}

/** The war as if the week settled now: its map after the week, and the week's moves as the report. */
export const warAsItStands = (war: ConquestData, s: SoFar): ConquestData => ({
  ...war,
  owners: s.owners,
  besieged: s.besieged,
  report: { week: s.week, moves: s.moves },
})
