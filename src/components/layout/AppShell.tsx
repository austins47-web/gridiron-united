import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Bell, User, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { NotificationsPanel } from '@/components/ui/NotificationsPanel'
import { LeagueSelector } from '@/components/leagues/LeagueSelector'

export function AppShell() {
  const { profile, unreadCount, signOut, activeLeague, activeLeagueId, myMembership } = useAppStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [showNotifs, setShowNotifs] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const isCommissioner = myMembership?.is_commissioner
  const isPickEm = activeLeague?.league_type === 'pickem'

  // ── Global tabs — always visible ──────────────────────────
  const globalTabs = [
    { to: "/app/leagues", label: "My Leagues", emoji: "🏆" },
    { to: '/app/scores',  label: 'Live Scores', emoji: '📡' },
    { to: '/app/mock',    label: 'Mock Draft',  emoji: '🧪' },
    { to: '/app/social',  label: 'Social',      emoji: '👥' },
  ]

  // ── League tabs — only when a league is selected ──────────
  const leagueTabs = activeLeagueId ? [
    ...(!isPickEm ? [
      { to: '/app/roster',  label: 'Roster',    emoji: '📋' },
      { to: '/app/players', label: 'Players',   emoji: '🔍' },
      { to: '/app/draft',   label: 'Draft Room', emoji: '🎯' },
      { to: '/app/scoring', label: 'Scoring',   emoji: '📊' },
    ] : [
      { to: '/app/pickem',  label: "Pick'Em",   emoji: '🏈' },
    ]),
    ...(!isPickEm ? [{ to: '/app/trades', label: 'Trades', emoji: '🔄' }] : []),
    { to: '/app/chat', label: 'Chat', emoji: '💬' },
    ...(isCommissioner ? [{ to: '/app/commissioner', label: 'Commissioner', emoji: '⚙️' }] : []),
  ] : []

  // Detect if we're on a league-specific route
  const leagueRoutes = ['/app/roster', '/app/players', '/app/draft', '/app/scoring', '/app/commissioner', '/app/pickem', '/app/chat', '/app/trades']
  const isOnLeagueRoute = leagueRoutes.some(r => location.pathname.startsWith(r))
  const isChat = location.pathname.startsWith('/app/chat')

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Header ── */}
      <header className="app-shell-top-nav sticky top-0 z-40 bg-field-950 border-b border-field-700 flex items-center justify-between px-4 h-14 shrink-0">
        {/* Logo */}
        <button
          onClick={() => navigate('/app/leagues')}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <div className="font-cond font-black text-xl uppercase tracking-wider">
            <span className="text-gold">Gridiron</span>
            <span className="text-white"> United</span>
          </div>
          <div className="hidden md:flex items-center gap-1.5">
            <span className="font-cond font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-cfb/20 text-cfb border border-cfb/30">CFB</span>
            <span className="font-cond font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-nfl/20 text-nfl border border-nfl/30">NFL</span>
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
              className="relative p-2 rounded-lg hover:bg-field-700 transition-colors text-field-400 hover:text-white"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-gold text-field-950 font-cond font-black text-[9px] flex items-center justify-center">
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
              <div className="absolute right-0 top-full mt-1 w-48 bg-field-800 border border-field-600 rounded-xl overflow-hidden shadow-2xl z-50">
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
      <nav className="app-shell-sub-nav sticky top-14 z-30 bg-field-900 border-b border-field-700 flex overflow-x-auto shrink-0">
        {globalTabs.map(({ to, label, emoji }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
          >
            <span className="mr-1.5">{emoji}</span>{label}
          </NavLink>
        ))}
      </nav>

      {/* ── League sub-nav — only when a league is selected ── */}
      {activeLeagueId && leagueTabs.length > 0 && (
        <nav className="app-shell-sub-nav sticky top-[calc(3.5rem+41px)] z-20 bg-field-800 border-b border-field-700 flex overflow-x-auto shrink-0">
          {/* League name pill */}
          <div className="flex items-center px-3 border-r border-field-700 shrink-0">
            <span className="font-cond font-bold text-xs uppercase tracking-wider text-gold/70 truncate max-w-[120px]">
              {activeLeague?.name ?? 'League'}
            </span>
          </div>

          {leagueTabs.map(({ to, label, emoji }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `font-cond font-bold text-xs uppercase tracking-wider px-4 py-2.5
                 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5
                 ${isActive
                   ? 'text-gold border-b-gold bg-field-700/40'
                   : 'text-field-400 border-transparent hover:text-white hover:bg-field-700/30'
                 }`
              }
            >
              <span>{emoji}</span>{label}
            </NavLink>
          ))}
        </nav>
      )}

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col min-h-0 bg-field-900">
        {/* No league selected + on a league route → prompt */}
        {!activeLeagueId && isOnLeagueRoute ? (
          <div className="max-w-md mx-auto text-center py-20 px-6">
            <div className="text-5xl mb-4">🏆</div>
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
            <Outlet />
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <div className="max-w-[1400px] mx-auto p-4 md:p-6">
              <Outlet />
            </div>
          </div>
        )}
      </main>

    </div>
  )
}
