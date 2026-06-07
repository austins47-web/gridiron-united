import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Bell, User, ChevronDown, Zap, Shield } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { NotificationsPanel } from '@/components/ui/NotificationsPanel'
import { LeagueSelector } from '@/components/leagues/LeagueSelector'

export function AppShell() {
  const { profile, unreadCount, signOut, activeLeague, activeLeagueId, myMembership } = useAppStore()
  const navigate = useNavigate()
  const [showNotifs, setShowNotifs] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const isCommissioner = myMembership?.is_commissioner

  const navItems = [
    { to: '/roster', label: '🏟 Roster' },
    { to: '/players', label: '🔍 Players' },
    { to: '/leagues', label: '🏆 Leagues' },
    { to: '/draft', label: '🎯 Draft Room' },
    { to: '/mock', label: '🧪 Mock Draft' },
    { to: '/social', label: '👥 Social' },
    { to: '/scoring', label: '📊 Scoring' },
    ...(isCommissioner ? [{ to: '/commissioner', label: '⚙️ Commissioner' }] : []),
  ]

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-field-800 border-b border-white/[0.06] flex items-center justify-between px-4 h-14 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="font-cond font-black text-xl uppercase tracking-wider text-gold">
            Gridiron <span className="text-gray-100 font-normal">United</span>
          </div>
          <div className="hidden md:flex items-center gap-1.5">
            <span className="font-cond font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-cfb/15 text-cfb">CFB</span>
            <span className="font-cond font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-nfl/15 text-nfl">NFL</span>
          </div>
        </div>

        {/* League selector (center) */}
        <div className="hidden md:block">
          <LeagueSelector />
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* Live indicator */}
          {activeLeague && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500">
              <div className="live-dot" />
              <span className="font-cond font-bold uppercase tracking-wider text-[10px]">Live</span>
            </div>
          )}

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => { setShowNotifs(!showNotifs); setShowUserMenu(false); }}
              className="relative p-2 rounded hover:bg-white/5 transition-colors text-gray-400 hover:text-gray-200"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-gold text-field-900 font-cond font-black text-[9px] flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showNotifs && (
              <NotificationsPanel onClose={() => setShowNotifs(false)} />
            )}
          </div>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifs(false); }}
              className="flex items-center gap-2 p-1.5 rounded hover:bg-white/5 transition-colors"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gold/20 flex items-center justify-center">
                  <User size={14} className="text-gold" />
                </div>
              )}
              <span className="hidden sm:block font-cond font-bold text-sm text-gray-300">
                {profile?.display_name || profile?.username || '…'}
              </span>
              <ChevronDown size={14} className="text-gray-500" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-field-700 border border-white/10 rounded-lg overflow-hidden shadow-xl z-50">
                <div className="px-3 py-2 border-b border-white/10">
                  <div className="font-cond font-bold text-sm text-gray-200">{profile?.display_name}</div>
                  <div className="text-xs text-gray-500">@{profile?.username}</div>
                </div>
                <button
                  onClick={() => { navigate('/account'); setShowUserMenu(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-gold transition-colors flex items-center gap-2"
                >
                  <User size={14} /> Account Settings
                </button>
                <button
                  onClick={() => { navigate('/draft'); setShowUserMenu(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-gold transition-colors flex items-center gap-2"
                >
                  <Zap size={14} /> Draft Room
                </button>
                <div className="border-t border-white/10" />
                <button
                  onClick={() => { signOut(); setShowUserMenu(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile league selector */}
      <div className="md:hidden px-4 py-2 bg-field-900 border-b border-white/[0.04]">
        <LeagueSelector />
      </div>

      {/* Nav */}
      <nav className="sticky top-14 z-30 bg-field-800/95 backdrop-blur border-b border-white/[0.06] flex overflow-x-auto shrink-0">
        {navItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `nav-tab ${isActive ? 'active' : ''}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1400px] mx-auto p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
