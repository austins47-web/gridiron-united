import React, { useEffect, lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import './index.css'
import { registerServiceWorker } from '@/lib/push'
// Catches the browser's one-time install offer (see lib/install.ts)
import '@/lib/install'

import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'

// Pages / Layouts
import { AppShell } from '@/components/layout/AppShell'
import { LoadingScreen } from '@/components/ui/LoadingScreen'

// Every page is its own chunk, downloaded the first time it's opened —
// the whole app used to ship as one 1.46 MB file that phones had to
// download before showing anything. The shell (AppShell, header, bottom
// bar) stays in the main bundle so it paints immediately.
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType<any>>>, name: K) =>
  lazy(() => load().then(m => ({ default: m[name] })))
const LandingPage = page(() => import('@/components/landing/LandingPage'), 'LandingPage')
const AuthPage = page(() => import('@/components/auth/AuthPage'), 'AuthPage')
const RosterView = page(() => import('@/components/roster/RosterView'), 'RosterView')
const MatchupView = page(() => import('@/components/matchup/MatchupView'), 'MatchupView')
const PlayersView = page(() => import('@/components/players/PlayersView'), 'PlayersView')
const LeaguesView = page(() => import('@/components/leagues/LeaguesView'), 'LeaguesView')
const DraftRoom = page(() => import('@/components/draft/DraftRoom'), 'DraftRoom')
const ScoringView = page(() => import('@/components/scoring/ScoringView'), 'ScoringView')
const AccountPage = page(() => import('@/components/auth/AccountPage'), 'AccountPage')
const CommissionerPanel = page(() => import('@/components/commissioner/CommissionerPanel'), 'CommissionerPanel')
const MockDraftHub = page(() => import('@/components/mock/MockDraftHub'), 'MockDraftHub')
const SocialHub = page(() => import('@/components/social/SocialHub'), 'SocialHub')
const PickEmView = page(() => import('@/components/pickem/PickEmView'), 'PickEmView')
const LeagueChat = page(() => import('@/components/chat/LeagueChat'), 'LeagueChat')
const TradeCenter = page(() => import('@/components/trades/TradeCenter'), 'TradeCenter')
const LiveScoresView = page(() => import('@/components/scores/LiveScoresView'), 'LiveScoresView')
const StandingsView = page(() => import('@/components/scores/StandingsView'), 'StandingsView')
const JoinPage = page(() => import('@/components/leagues/JoinPage'), 'JoinPage')
const LeagueSettingsView = page(() => import('@/components/leagues/LeagueSettingsView'), 'LeagueSettingsView')
const HomeView = page(() => import('@/components/home/HomeView'), 'HomeView')
const NewsView = page(() => import('@/components/scores/NewsView'), 'NewsView')

// Once the app is idle, warm the pages people open most, so the first
// tap on them is instant too
const warmCommonPages = () => {
  void import('@/components/home/HomeView')
  void import('@/components/pickem/PickEmView')
  void import('@/components/leagues/LeaguesView')
}
if (typeof window !== 'undefined') {
  const idle = (window as any).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 2500))
  window.addEventListener('load', () => idle(warmCommonPages), { once: true })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 1,
    },
  },
})

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, authLoading } = useAppStore()
  if (authLoading) return <LoadingScreen />
  if (!user) return <Navigate to="/auth" replace />
  return <>{children}</>
}

function AppInitializer({ children }: { children: React.ReactNode }) {
  const { setUser, setSession, setProfile, setAuthLoading, setNotifications, addNotification } = useAppStore()

  // Apply saved theme immediately on mount
  useEffect(() => {
    const saved = localStorage.getItem('gu-theme') ?? 'dark'
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        if (profile) setProfile(profile)

        const { data: notifs } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(50)
        if (notifs) setNotifications(notifs)
      }

      setAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user && event === 'SIGNED_IN') {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()
          if (profile) setProfile(profile)
        }

        if (event === 'SIGNED_OUT') {
          setProfile(null)
        }

        setAuthLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [setUser, setSession, setProfile, setAuthLoading, setNotifications])

  // Realtime: push new notifications into store as they arrive
  useEffect(() => {
    const { user } = useAppStore.getState()
    if (!user) return
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        addNotification(payload.new as any)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [addNotification])

  return <>{children}</>
}

// Wraps league-specific pages so they remount when the active league changes
function LeagueWrapper({ children }: { children: React.ReactNode }) {
  const activeLeagueId = useAppStore(s => s.activeLeagueId)
  return <React.Fragment key={activeLeagueId ?? 'no-league'}>{children}</React.Fragment>
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppInitializer>
          <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route
              path="/app"
              element={
                <AuthGuard>
                  <AppShell />
                </AuthGuard>
              }
            >
              {/* Default /app → /app/leagues */}
              <Route index element={<Navigate to="/app/home" replace />} />
              <Route path="home" element={<HomeView />} />
              {/* These routes don't need league isolation */}
              <Route path="leagues" element={<LeaguesView />} />
              <Route path="scores" element={<LiveScoresView />} />
              <Route path="standings" element={<StandingsView />} />
              <Route path="news" element={<NewsView />} />
              <Route path="mock" element={<MockDraftHub />} />
              <Route path="social" element={<SocialHub />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="pickem" element={<PickEmView />} />
              {/* League-specific routes */}
              <Route path="roster" element={<LeagueWrapper><RosterView /></LeagueWrapper>} />
              <Route path="matchup" element={<LeagueWrapper><MatchupView /></LeagueWrapper>} />
              <Route path="players" element={<LeagueWrapper><PlayersView /></LeagueWrapper>} />
              <Route path="draft" element={<LeagueWrapper><DraftRoom /></LeagueWrapper>} />
              <Route path="scoring" element={<LeagueWrapper><ScoringView /></LeagueWrapper>} />
              <Route path="commissioner" element={<LeagueWrapper><CommissionerPanel /></LeagueWrapper>} />
              <Route path="settings" element={<LeagueWrapper><LeagueSettingsView /></LeagueWrapper>} />
              <Route path="chat" element={<LeagueWrapper><LeagueChat /></LeagueWrapper>} />
              <Route path="trades" element={<LeagueWrapper><TradeCenter /></LeagueWrapper>} />
            </Route>
            <Route path="/join/:code" element={<JoinPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </AppInitializer>
      </BrowserRouter>
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: '#1C1C1C',
            color: '#F5F5F5',
            border: '1px solid rgba(206,123,69,0.3)',
            fontFamily: 'Barlow Condensed, sans-serif',
            fontWeight: 700,
            fontSize: '14px',
            letterSpacing: '0.04em',
          },
          // Copper for success, matching every other "positive/highlighted"
          // indicator in the app — this app deliberately retokenized every
          // other green success color to copper/blue already; the toast
          // config just never got updated. Plain green/yellow (the library
          // defaults) never appear anywhere else on purpose.
          success: { iconTheme: { primary: '#CE7B45', secondary: '#0A0A0A' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
    </QueryClientProvider>
  )
}

// Push notifications (public/sw.js) — registered up front so the
// device can receive them even when Settings was never opened
registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
