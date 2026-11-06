import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'

/** Autopilot only picks at random (Favorites, Home teams and League majority were too strong). */
export type AutopilotRule = 'random'

export const AUTOPILOT_LABELS: Record<AutopilotRule, string> = {
  random: 'Random',
}

/** Your autopilot rule in a league (pickem_autopilot), and changing it. */
export function useAutopilot(leagueId: string | null | undefined) {
  const user = useAppStore(s => s.user)
  const qc = useQueryClient()
  const key = ['pickem-autopilot', leagueId, user?.id]
  const { data: rule = null, isLoading } = useQuery({
    queryKey: key,
    enabled: !!leagueId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pickem_autopilot')
        .select('rule')
        .eq('league_id', leagueId!)
        .eq('user_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return (data?.rule ?? null) as AutopilotRule | null
    },
  })

  const setRule = async (next: AutopilotRule | null) => {
    if (!leagueId || !user) return
    const { error } = next
      ? await supabase.from('pickem_autopilot').upsert({ league_id: leagueId, user_id: user.id, rule: next }, { onConflict: 'league_id,user_id' })
      : await supabase.from('pickem_autopilot').delete().eq('league_id', leagueId).eq('user_id', user.id)
    if (error) { toast.error(`Couldn't save autopilot: ${error.message}`); return }
    qc.setQueryData(key, next)
    toast.success(next ? 'Autopilot on: a coin flip for any game you miss' : 'Autopilot off')
  }

  return { rule, setRule, loading: isLoading }
}
