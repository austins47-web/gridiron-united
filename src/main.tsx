import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import './index.css'

import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'

// Pages / Layouts
import { AppShell } from '@/components/layout/AppShell'
import { AuthPage } from '@/components/auth/AuthPage'
import { RosterView } from '@/components/roster/RosterView'
import { PlayersView } from '@/components/players/PlayersView'
import { LeaguesView } from '@/components/leagues/LeaguesView'
import { DraftRoom } from '@/components/draft/DraftRoom'
import { ScoringView } from '@/components/scoring/ScoringView'
import { AccountPage } from '@/components/auth/AccountPage'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { CommissionerPanel } from '@/components/commissioner/CommissionerPanel'
import { MockDraftHub } from '@/components/mock/MockDraftHub'
import { SocialHub } from '@/components/social/SocialHub'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
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
  const { setUser, setSession, setProfile, setAuthLoading, setNotifications } = useAppStore()

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

  return <>{children}</>
}

// LeagueRouter: remounts all league-specific pages when the active league changes.
// This guarantees each league has completely isolated state — roster, draft, players, scoring.
function LeagueRouter() {
  const activeLeagueId = useAppStore(s => s.activeLeagueId)

  return (
    // key={activeLeagueId} forces React to fully unmount and remount when league changes
    <Routes key={activeLeagueId ?? 'no-league'}>
      <Route index element={<Navigate to="/roster" replace />} />
      <Route path="roster" element={<RosterView />} />
      <Route path="players" element={<PlayersView />} />
      <Route path="draft" element={<DraftRoom />} />
      <Route path="scoring" element={<ScoringView />} />
      <Route path="commissioner" element={<CommissionerPanel />} />
    </Routes>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppInitializer>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route
              path="/"
              element={
                <AuthGuard>
                  <AppShell />
                </AuthGuard>
              }
            >
              {/* These routes don't need league isolation */}
              <Route path="leagues" element={<LeaguesView />} />
              <Route path="mock" element={<MockDraftHub />} />
              <Route path="social" element={<SocialHub />} />
              <Route path="account" element={<AccountPage />} />
              {/* All league-specific routes go through LeagueRouter */}
              <Route path="/*" element={<LeagueRouter />} />
            </Route>
            <Route path="*" element={<Navigate to="/roster" replace />} />
          </Routes>
        </AppInitializer>
      </BrowserRouter>
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: '#1c3320',
            color: '#f0f0e8',
            border: '1px solid rgba(245,197,24,0.2)',
            fontFamily: 'Barlow Condensed, sans-serif',
            fontWeight: 700,
            fontSize: '14px',
            letterSpacing: '0.04em',
          },
          success: { iconTheme: { primary: '#F5C518', secondary: '#1a0800' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
    </QueryClientProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
