import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  Bell, User, ChevronDown, ChevronRight,
  Home, Trophy, Radio, Award, Newspaper, FlaskConical, Users,
} from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { LiveTickerStrip } from './LiveTickerStrip'
import { LeagueBottomBar } from './LeagueBottomBar'
import { NotificationsPanel } from '@/components/ui/NotificationsPanel'
import { LeagueSelector } from '@/components/leagues/LeagueSelector'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import clsx from 'clsx'

export function AppShell() {
  const { profile, unreadCount, signOut, activeLeague, activeLeagueId } = useAppStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [showNotifs, setShowNotifs] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  // ── Global tabs — always visible ──────────────────────────
  const globalTabs = [
    { to: '/app/home',    label: 'Home',       icon: Home },
    { to: "/app/leagues", label: "My Leagues", icon: Trophy },
    { to: '/app/scores',  label: 'Live Scores', icon: Radio },
    { to: '/app/standings', label: 'Standings', icon: Award },
    { to: '/app/news',    label: 'News',         icon: Newspaper },
    { to: '/app/mock',    label: 'Mock Draft',  icon: FlaskConical },
    { to: '/app/social',  label: 'Social',      icon: Users },
  ]

  // League-specific destinations now live in the fixed LeagueBottomBar
  // instead of a horizontally-scrolling top row (see that component
  // for why - too many destinations for one row without burying
  // Chat/Commissioner/Settings off the edge of a phone screen).

  // Detect if we're on a league-specific route
  const leagueRoutes = ['/app/roster', '/app/matchup', '/app/players', '/app/draft', '/app/scoring', '/app/commissioner', '/app/pickem', '/app/chat', '/app/trades', '/app/settings']
  const isOnLeagueRoute = leagueRoutes.some(r => location.pathname.startsWith(r))
  const isChat = location.pathname.startsWith('/app/chat')

  return (
    <div className="min-h-screen flex flex-col">

      {/*
        Header + global nav + live ticker + league sub-nav are one
        sticky unit, not four independently-sticky elements each with
        their own hand-calculated `top` offset (header height, header
        + nav height, header + nav + ticker height...). That approach
        broke twice already — the "nav height" figure baked into those
        offsets was never actually precise (nav-tab's real rendered
        height doesn't match the guess), so the pieces drifted out of
        alignment and the sub-nav ended up sliding partly behind the
        ticker on scroll. Stacking them normally inside one sticky
        wrapper needs no height math at all - whatever they actually
        render at, the whole group moves and locks together.
      */}
      <div className="sticky top-0 z-40 flex flex-col shrink-0 bg-field-950">

      {/* ── Header ── */}
      <header className="app-shell-top-nav bg-field-950 border-b border-field-700 flex items-center justify-between px-4 h-14 shrink-0">
        {/* Logo */}
        <button
          onClick={() => navigate('/app/home')}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <div className="font-cond font-black text-xl uppercase tracking-wider">
            <span className="text-gold">Gridiron</span>
            <span className="text-white"> United</span>
          </div>
          <div className="hidden md:flex items-center gap-1.5">
            <span className="font-cond font-bold text-[12px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-cfb/20 text-cfb border border-cfb/30">CFB</span>
            <span className="font-cond font-bold text-[12px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-nfl/20 text-nfl border border-nfl/30">NFL</span>
          </div>
        </button>

        {/* League selector — center */}
        <div className="hidden md:flex items-center gap-2">
          {activeLeague && (
            <>
              {/* Breadcrumb: Leagues > League Name */}
              <button
                onClick={() => navigate('/app/leagues')}
                className="text-field-500 hover:text-field-300 transition-colors font-cond font-bold text-xs uppercase tracking-wider"
              >
                Leagues
              </button>
              <ChevronRight size={12} className="text-field-600" />
            </>
          )}
          <LeagueSelector />
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {activeLeague && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-field-400">
              <div className="live-dot" />
              <span className="font-cond font-bold uppercase tracking-wider text-xs">Live</span>
            </div>
          )}

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => { setShowNotifs(!showNotifs); setShowUserMenu(false) }}
              className="notif-btn relative p-2 rounded-lg hover:bg-field-700 transition-colors text-field-400 hover:text-white"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-gold text-field-950 font-cond font-black text-[11px] flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showNotifs && <NotificationsPanel onClose={() => setShowNotifs(false)} />}
          </div>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifs(false) }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-field-700 transition-colors"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center">
                  <User size={14} className="text-gold" />
                </div>
              )}
              <span className="hidden sm:block font-cond font-bold text-sm text-field-200">
                {profile?.display_name || profile?.username || '…'}
              </span>
              <ChevronDown size={14} className="text-field-400" />
            </button>

            {showUserMenu && (
              <div className="user-menu-dropdown absolute right-0 top-full mt-1 w-48 bg-field-800 border border-field-600 rounded-xl overflow-hidden shadow-2xl z-50">
                <div className="px-3 py-2.5 border-b border-field-700 bg-field-900/50">
                  <div className="font-cond font-bold text-sm text-white">{profile?.display_name}</div>
                  <div className="text-xs text-field-400">@{profile?.username}</div>
                </div>
                <button
                  onClick={() => { navigate('/app/account'); setShowUserMenu(false) }}
                  className="w-full text-left px-3 py-2.5 text-sm text-field-200 hover:bg-field-700 hover:text-gold transition-colors flex items-center gap-2"
                >
                  <User size={14} /> Account Settings
                </button>
                <div className="border-t border-field-700" />
                <button
                  onClick={() => { signOut(); setShowUserMenu(false) }}
                  className="w-full text-left px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile league selector */}
      <div className="md:hidden px-4 py-2 bg-field-950 border-b border-field-700">
        <LeagueSelector />
      </div>

      {/* ── Global nav ── */}
      <nav className="app-shell-sub-nav bg-field-900 border-b border-field-700 flex overflow-x-auto shrink-0">
        {globalTabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-tab inline-flex items-center gap-2 ${isActive ? 'active' : ''}`}
          >
            <Icon className="w-4 h-4 shrink-0" strokeWidth={2.25} />{label}
          </NavLink>
        ))}
      </nav>

      <LiveTickerStrip />

      </div>

      {/* ── Main content ── */}
      {/* pb-14 reserves room for the fixed LeagueBottomBar below so
          it never overlaps page content - only needed once a league
          is active, since that's the only time the bar renders. */}
      <main className={clsx('flex-1 flex flex-col min-h-0 bg-field-900', activeLeagueId && 'pb-14')}>
        {/* No league selected + on a league route → prompt */}
        {!activeLeagueId && isOnLeagueRoute ? (
          <div className="max-w-md mx-auto text-center py-20 px-6">
            <Trophy className="w-12 h-12 text-gold/40 mx-auto mb-4" strokeWidth={1.5} />
            <h2 className="font-cond font-black text-2xl text-white uppercase tracking-wider mb-2">
              Select a League
            </h2>
            <p className="text-field-400 text-sm mb-6">
              Choose a league from the top bar to view your roster, players, draft room, and more.
            </p>
            <button
              onClick={() => navigate('/app/leagues')}
              className="btn-gold"
            >
              Go to My Leagues
            </button>
          </div>
        ) : isChat ? (
          /* Chat gets full remaining height with no padding */
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <ErrorBoundary label="This page hit an error">
              <Outlet />
            </ErrorBoundary>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <div className="max-w-[1400px] mx-auto p-4 md:p-6">
              <ErrorBoundary label="This page hit an error">
                {/* keyed on pathname so the entrance replays each navigation */}
                <div key={location.pathname} className="route-enter">
                  <Outlet />
                </div>
              </ErrorBoundary>
            </div>
          </div>
        )}
      </main>

      <LeagueBottomBar />

    </div>
  )
}
