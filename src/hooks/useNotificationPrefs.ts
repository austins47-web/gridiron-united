import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import toast from 'react-hot-toast'

export interface NotificationPrefs {
  id?: string
  updated_at?: string
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
  /** Opt-in, phone only: lead changes, clinching, tiebreaker sweat during games. */
  notify_live_alerts: boolean
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
  notify_live_alerts: false,
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
 * The row for one scope (a league, or global when leagueId is null) —
 * the most recently saved one. The (user_id, league_id) unique
 * constraint never matched a NULL league_id, so every global save used
 * to insert a new row; some users have dozens. Reading the newest one
 * means the last thing they chose is what counts.
 */
export function latestPrefsRow(rows: NotificationPrefs[], leagueId: string | null): NotificationPrefs | undefined {
  return rows
    .filter(r => r.league_id === leagueId)
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))[0]
}

/**
 * Resolve the effective settings for a league: the league-specific
 * row if one exists, otherwise the global row, otherwise defaults.
 */
export function resolvePrefs(
  rows: NotificationPrefs[],
  leagueId: string | null,
): Omit<NotificationPrefs, 'user_id' | 'league_id'> & { source: 'league' | 'global' | 'default' } {
  const scoped = leagueId ? latestPrefsRow(rows, leagueId) : undefined
  const global = latestPrefsRow(rows, null)
  const base   = scoped ?? global

  if (!base) return { ...PREF_DEFAULTS, source: 'default' }

  const { id, user_id, league_id, updated_at, created_at, ...rest } = base as any
  return { ...PREF_DEFAULTS, ...rest, source: scoped ? 'league' : 'global' }
}

/**
 * Save changes to one scope's preferences (global when leagueId is
 * null).
 *
 * Updates the scope's existing row in place, touching only the fields
 * changed. This used to upsert { ...defaults, ...changes } on
 * (user_id, league_id), which (a) never matched a NULL league_id, so
 * each global save inserted another row, and (b) reset every other
 * setting to its default on each save. A scope with no row yet starts
 * from what the user currently sees (for a league override, their
 * global settings), not from the defaults.
 */
export function useSaveNotificationPrefs() {
  const qc = useQueryClient()
  const { user } = useAppStore()
  const key = ['notification-prefs', user?.id]

  return useMutation({
    mutationFn: async (params: {
      leagueId: string | null
      updates: Partial<NotificationPrefs>
    }) => {
      if (!user) throw new Error('Not logged in')
      const rows = qc.getQueryData<NotificationPrefs[]>(key) ?? []
      const existing = latestPrefsRow(rows, params.leagueId)
      const now = new Date().toISOString()

      if (existing?.id) {
        const { data, error } = await supabase
          .from('notification_preferences')
          .update({ ...params.updates, updated_at: now })
          .eq('id', existing.id)
          .select()
          .single()
        if (error) throw error
        return data as NotificationPrefs
      }

      const { source: _source, ...current } = resolvePrefs(rows, params.leagueId)
      const { data, error } = await supabase
        .from('notification_preferences')
        .insert({ ...current, ...params.updates, user_id: user.id, league_id: params.leagueId, updated_at: now })
        .select()
        .single()
      if (error) throw error
      return data as NotificationPrefs
    },
    onSuccess: (saved) => {
      // Put the saved row in the cache right away, so a quick second
      // change updates it instead of inserting another row before the
      // refetch lands
      qc.setQueryData<NotificationPrefs[]>(key, rows =>
        [...(rows ?? []).filter(r => r.id !== saved.id), saved])
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
