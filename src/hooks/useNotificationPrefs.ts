import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import toast from 'react-hot-toast'

export interface NotificationPrefs {
  id?: string
  user_id: string
  league_id: string | null
  email_enabled: boolean
  sms_enabled: boolean
  notify_pickem_deadline: boolean
  notify_draft: boolean
  notify_on_the_clock: boolean
  notify_trades: boolean
  notify_lineup: boolean
  notify_weekly_recap: boolean
  lead_hours_primary: number
  lead_hours_secondary: number
}

export const PREF_DEFAULTS: Omit<NotificationPrefs, 'user_id' | 'league_id'> = {
  email_enabled: true,
  sms_enabled: false,
  notify_pickem_deadline: true,
  notify_draft: true,
  notify_on_the_clock: true,
  notify_trades: true,
  notify_lineup: true,
  notify_weekly_recap: true,
  lead_hours_primary: 24,
  lead_hours_secondary: 2,
}

/**
 * Every notification preference row for the current user — their
 * global default (league_id null) plus any league overrides.
 */
export function useNotificationPrefs() {
  const { user } = useAppStore()
  return useQuery({
    queryKey: ['notification-prefs', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user!.id)
      if (error) throw error
      return (data ?? []) as NotificationPrefs[]
    },
  })
}

/**
 * Resolve the effective settings for a league: the league-specific
 * row if one exists, otherwise the global row, otherwise defaults.
 */
export function resolvePrefs(
  rows: NotificationPrefs[],
  leagueId: string | null,
): Omit<NotificationPrefs, 'user_id' | 'league_id'> & { source: 'league' | 'global' | 'default' } {
  const scoped = leagueId ? rows.find(r => r.league_id === leagueId) : undefined
  const global = rows.find(r => r.league_id === null)
  const base   = scoped ?? global

  if (!base) return { ...PREF_DEFAULTS, source: 'default' }

  const { id, user_id, league_id, ...rest } = base as any
  return { ...PREF_DEFAULTS, ...rest, source: scoped ? 'league' : 'global' }
}

/** Upsert one preference row (global when leagueId is null). */
export function useSaveNotificationPrefs() {
  const qc = useQueryClient()
  const { user } = useAppStore()

  return useMutation({
    mutationFn: async (params: {
      leagueId: string | null
      updates: Partial<NotificationPrefs>
    }) => {
      if (!user) throw new Error('Not logged in')

      const { data, error } = await supabase
        .from('notification_preferences')
        .upsert(
          {
            user_id: user.id,
            league_id: params.leagueId,
            ...PREF_DEFAULTS,
            ...params.updates,
          },
          { onConflict: 'user_id,league_id' },
        )
        .select()
        .single()

      if (error) throw error
      return data as NotificationPrefs
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-prefs'] })
    },
    onError: (e: any) => toast.error(e.message ?? 'Could not save settings'),
  })
}

/** Delete a league override so it falls back to the global default. */
export function useClearLeaguePrefs() {
  const qc = useQueryClient()
  const { user } = useAppStore()

  return useMutation({
    mutationFn: async (leagueId: string) => {
      if (!user) throw new Error('Not logged in')
      const { error } = await supabase
        .from('notification_preferences')
        .delete()
        .eq('user_id', user.id)
        .eq('league_id', leagueId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-prefs'] })
      toast.success('Using your global settings for this league')
    },
    onError: (e: any) => toast.error(e.message),
  })
}
