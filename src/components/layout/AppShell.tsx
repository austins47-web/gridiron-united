import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Bell, User, ChevronDown, Zap } from 'lucide-react'
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
    { to: '/roster',       label: 'Roster',      emoji: '🏟' },
    { to: '/players',      label: 'Players',     emoji: '🔍' },
    { to: '/leagues',      label: 'Leagues',     emoji: '🏆' },
    { to: '/draft',        label: 'Draft Room',  emoji: '🎯' },
    { to: '/mock',         label: 'Mock Draft',  emoji: '🧪' },
    { to: '/social',       label: 'Social',      emoji: '👥' },
    { to: '/scoring',      label: 'Scoring',     emoji: '📊' },
    ...(isCommissioner ? [{ to: '/commissioner', label: 'Commissioner', emoji: '⚙️' }] : []),
  ]

  return (
    <div className="min-h-screen flex flex-col">

      {/* Header — darkest layer */}
      <header className="sticky top-0 z-40 bg-field-950 border-b border-field-700 flex items-center justify-between px-4 h-14 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="font-cond font-black text-xl uppercase tracking-wider">
            <span className="text-gold">Gridiron</span>
            <span className="text-white"> United</span>
          </div>
          <div className="hidden md:flex items-center gap-1.5">
            <span className="font-cond font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-cfb/20 text-cfb border border-cfb/30">CFB</span>
            <span className="font-cond font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-nfl/20 text-nfl border border-nfl/30">NFL</span>
          </div>
        </div>

        {/* League selector */}
        <div className="hidden md:block">
          <LeagueSelector />
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {activeLeague && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-field-400">
              <div className="live-dot" />
              <span className="font-cond font-bold uppercase tracking-wider text-[10px]">Live</span>
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
                  onClick={() => { navigate('/account'); setShowUserMenu(false) }}
                  className="w-full text-left px-3 py-2.5 text-sm text-field-200 hover:bg-field-700 hover:text-gold transition-colors flex items-center gap-2"
                >
                  <User size={14} /> Account Settings
                </button>
                <button
                  onClick={() => { navigate('/draft'); setShowUserMenu(false) }}
                  className="w-full text-left px-3 py-2.5 text-sm text-field-200 hover:bg-field-700 hover:text-gold transition-colors flex items-center gap-2"
                >
                  <Zap size={14} /> Draft Room
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
      <div className="md:hidden px-4 py-2 bg-field-900 border-b border-field-700">
        <LeagueSelector />
      </div>

      {/* Nav — middle layer, clearly distinct from header and content */}
      <nav className="sticky top-14 z-30 bg-field-900 border-b border-field-700 flex overflow-x-auto shrink-0">
        {navItems.map(({ to, label, emoji }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
          >
            <span className="mr-1.5">{emoji}</span>{label}
          </NavLink>
        ))}
      </nav>

      {/* Main content — lightest layer */}
      <main className="flex-1 overflow-auto bg-field-900">
        <div className="max-w-[1400px] mx-auto p-4 md:p-6">
          <Outlet />
        </div>
      </main>

    </div>
  )
}
