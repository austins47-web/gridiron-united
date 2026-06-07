import { useEffect, useRef } from 'react'
import { X, Bell, CheckCheck, Trash2 } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { formatDistanceToNow } from 'date-fns'

const TYPE_ICONS: Record<string, string> = {
  trade_offer: '🤝',
  draft_pick: '🎯',
  waiver_result: '📋',
  matchup_result: '🏆',
  league_invite: '📨',
  system: '📣',
}

interface Props {
  onClose: () => void
}

export function NotificationsPanel({ onClose }: Props) {
  const { notifications, unreadCount, markAllRead, clearAllNotifications } = useAppStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref}
      className="absolute right-0 top-full mt-2 w-80 bg-field-700 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Bell size={15} className="text-gold" />
          <span className="font-cond font-black text-sm uppercase tracking-wider text-gray-200">
            Notifications
          </span>
          {unreadCount > 0 && (
            <span className="bg-gold text-field-900 font-cond font-black text-[10px] px-1.5 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button onClick={markAllRead}
              className="p-1.5 rounded hover:bg-white/5 text-gray-500 hover:text-gold transition-colors"
              title="Mark all read">
              <CheckCheck size={14} />
            </button>
          )}
          {notifications.length > 0 && (
            <button onClick={clearAllNotifications}
              className="p-1.5 rounded hover:bg-white/5 text-gray-500 hover:text-red-400 transition-colors"
              title="Clear all notifications">
              <Trash2 size={14} />
            </button>
          )}
          <button onClick={onClose}
            className="p-1.5 rounded hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-600 text-sm">
            No notifications yet
          </div>
        ) : (
          notifications.map(n => (
            <div key={n.id}
              className={`flex gap-3 px-4 py-3 border-b border-white/[0.05] transition-colors hover:bg-white/[0.03]
                ${!n.is_read ? 'bg-gold/[0.03]' : ''}`}>
              <div className="text-lg leading-none pt-0.5 shrink-0">
                {TYPE_ICONS[n.type] ?? '📣'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-cond font-bold text-sm text-gray-200 leading-tight">
                  {n.title}
                  {!n.is_read && (
                    <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-gold align-middle" />
                  )}
                </div>
                {n.body && (
                  <div className="text-xs text-gray-500 mt-0.5 leading-snug">{n.body}</div>
                )}
                <div className="text-[10px] text-gray-600 mt-1">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {notifications.length > 0 && (
        <div className="px-4 py-2 border-t border-white/10 text-center">
          <span className="text-xs text-gray-600">{notifications.length} total notifications</span>
        </div>
      )}
    </div>
  )
}
