import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import { useUnreadChat } from '@/hooks/useUnreadChat'
import clsx from 'clsx'

interface Tab { to: string; label: string; emoji: string; badge?: boolean }

/**
 * Replaces the old horizontally-scrolling league sub-nav (Roster,
 * Matchup, Players, Draft Room, Scoring, Trades, Chat, Commissioner,
 * Settings all in one row) with a fixed bottom tab bar - a fantasy
 * league has too many destinations to fit in one row without
 * scrolling sideways, which buried Chat/Commissioner/Settings off
 * the edge of a phone screen. Only the 3 most-used pages (Roster,
 * Matchup, Players) get a permanent slot; everything else lives
 * behind "More", which never grows the bar itself no matter how many
 * pages get added later.
 *
 * Pick'em leagues have far fewer destinations (Pick'Em, Chat,
 * Settings, and Commissioner for the commissioner) - those all fit
 * as primary tabs directly, so there's no "More" for them at all.
 */
export function LeagueBottomBar() {
  const { activeLeagueId, activeLeague, myMembership } = useAppStore()
  const location = useLocation()
  const navigate = useNavigate()
  const { hasUnread: hasUnreadChat } = useUnreadChat(activeLeagueId)
  const [moreOpen, setMoreOpen] = useState(false)

  if (!activeLeagueId) return null

  const isCommissioner = myMembership?.is_commissioner
  const isPickEm = activeLeague?.league_type === 'pickem'

  const primary: Tab[] = isPickEm
    ? [
        { to: '/app/pickem',   label: "Pick'Em",  emoji: '🏈' },
        { to: '/app/chat',     label: 'Chat',      emoji: '💬', badge: hasUnreadChat },
        ...(isCommissioner ? [{ to: '/app/commissioner', label: 'Commish', emoji: '⚙️' }] : []),
        { to: '/app/settings', label: 'Settings', emoji: '🛠️' },
      ]
    : [
        { to: '/app/roster',  label: 'Roster',  emoji: '📋' },
        { to: '/app/matchup', label: 'Matchup', emoji: '⚔️' },
        { to: '/app/players', label: 'Players', emoji: '🔍' },
      ]

  const more: Tab[] = isPickEm ? [] : [
    { to: '/app/draft',   label: 'Draft Room', emoji: '🎯' },
    { to: '/app/scoring', label: 'Scoring',    emoji: '📊' },
    { to: '/app/trades',  label: 'Trades',     emoji: '🔄' },
    { to: '/app/chat',    label: 'Chat',       emoji: '💬', badge: hasUnreadChat },
    ...(isCommissioner ? [{ to: '/app/commissioner', label: 'Commissioner', emoji: '⚙️' }] : []),
    { to: '/app/settings', label: 'Settings',  emoji: '🛠️' },
  ]

  const moreActive = more.some(m => location.pathname.startsWith(m.to))
  const moreHasBadge = more.some(m => m.badge)

  return (
    <>
      {moreOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setMoreOpen(false)} />
          <div className="fixed left-0 right-0 bottom-14 z-50 bg-field-800 border-t border-x border-field-700 rounded-t-2xl p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="w-9 h-1 rounded-full bg-field-600 mx-auto mb-3" />
            <div className="grid grid-cols-3 gap-2">
              {more.map(m => (
                <button
                  key={m.to}
                  onClick={() => { navigate(m.to); setMoreOpen(false) }}
                  className={clsx(
                    'relative flex flex-col items-center gap-1.5 py-3 rounded-xl border font-cond font-bold text-xs uppercase tracking-wider transition-colors',
                    location.pathname.startsWith(m.to)
                      ? 'text-gold border-gold/40 bg-gold/10'
                      : 'text-field-300 border-field-700 bg-field-900 hover:text-white hover:border-field-500',
                  )}
                >
                  {m.badge && <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-gold" />}
                  <span className="text-lg leading-none">{m.emoji}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex bg-field-900 border-t border-field-700 pb-[env(safe-area-inset-bottom)]">
        {primary.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            onClick={() => setMoreOpen(false)}
            className={({ isActive }) => clsx(
              'relative flex-1 flex flex-col items-center gap-0.5 py-2 font-cond font-bold text-[10px] uppercase tracking-wider transition-colors',
              isActive && !moreOpen ? 'text-gold' : 'text-field-400 hover:text-white',
            )}
          >
            {t.badge && <span className="absolute top-1 right-[calc(50%-15px)] w-1.5 h-1.5 rounded-full bg-gold" />}
            <span className="text-lg leading-none">{t.emoji}</span>
            {t.label}
          </NavLink>
        ))}
        {more.length > 0 && (
          <button
            onClick={() => setMoreOpen(v => !v)}
            className={clsx(
              'relative flex-1 flex flex-col items-center gap-0.5 py-2 font-cond font-bold text-[10px] uppercase tracking-wider transition-colors',
              moreOpen || moreActive ? 'text-gold' : 'text-field-400 hover:text-white',
            )}
          >
            {moreHasBadge && !moreOpen && <span className="absolute top-1 right-[calc(50%-15px)] w-1.5 h-1.5 rounded-full bg-gold" />}
            <span className="text-lg leading-none">{moreOpen ? '✕' : '⋯'}</span>
            More
          </button>
        )}
      </nav>
    </>
  )
}
