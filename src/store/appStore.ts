import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Profile, League, LeagueMember, Notification } from '@/types/database'
import type { User, Session } from '@supabase/supabase-js'

interface AppState {
  // Auth
  user: User | null
  session: Session | null
  profile: Profile | null
  authLoading: boolean

  // Active league context
  activeLeagueId: string | null
  activeLeague: League | null
  myMembership: LeagueMember | null

  // Notifications
  notifications: Notification[]
  unreadCount: number

  // Actions
  setUser: (user: User | null) => void
  setSession: (session: Session | null) => void
  setProfile: (profile: Profile | null) => void
  setAuthLoading: (loading: boolean) => void
  setActiveLeague: (league: League | null, membership: LeagueMember | null) => void
  setActiveLeagueId: (id: string | null) => void
  setNotifications: (notifications: Notification[]) => void
  addNotification: (notification: Notification) => void
  markAllRead: () => Promise<void>
  clearAllNotifications: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  authLoading: true,
  activeLeagueId: null,
  activeLeague: null,
  myMembership: null,
  notifications: [],
  unreadCount: 0,

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setAuthLoading: (authLoading) => set({ authLoading }),

  setActiveLeague: (activeLeague, myMembership) =>
    set({ activeLeague, myMembership, activeLeagueId: activeLeague?.id ?? null }),

  setActiveLeagueId: (activeLeagueId) => set({ activeLeagueId }),

  setNotifications: (notifications) =>
    set({ notifications, unreadCount: notifications.filter(n => !n.is_read).length }),

  addNotification: (notification) =>
    set(s => ({
      notifications: [notification, ...s.notifications],
      unreadCount: s.unreadCount + (notification.is_read ? 0 : 1),
    })),

  markAllRead: async () => {
    const { user } = get()
    if (!user) return
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
    set(s => ({
      notifications: s.notifications.map(n => ({ ...n, is_read: true })),
      unreadCount: 0,
    }))
  },

  clearAllNotifications: async () => {
    const { user } = get()
    if (!user) return
    await supabase
      .from('notifications')
      .delete()
      .eq('user_id', user.id)
    set({ notifications: [], unreadCount: 0 })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({
      user: null,
      session: null,
      profile: null,
      activeLeagueId: null,
      activeLeague: null,
      myMembership: null,
      notifications: [],
      unreadCount: 0,
    })
  },
}))
