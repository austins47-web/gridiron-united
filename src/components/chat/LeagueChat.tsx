import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import { Send, MessageSquare, User } from 'lucide-react'
import clsx from 'clsx'

// ── Types ─────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  league_id: string
  user_id: string | null
  message: string
  is_system: boolean
  created_at: string
  profiles?: {
    username: string
    display_name: string | null
    avatar_url: string | null
  }
}

// ── Avatar ────────────────────────────────────────────────────

function MiniAvatar({ profile }: { profile?: ChatMessage['profiles'] }) {
  const initials = (profile?.display_name || profile?.username || '?').slice(0, 2).toUpperCase()
  return profile?.avatar_url ? (
    <img
      src={profile.avatar_url}
      alt=""
      className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-field-600"
    />
  ) : (
    <div className="w-7 h-7 rounded-full bg-field-700 border border-field-600 flex items-center justify-center shrink-0">
      <span className="text-[10px] font-black text-field-300">{initials}</span>
    </div>
  )
}

// ── Format timestamp ──────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Message bubble ────────────────────────────────────────────

function MessageBubble({ msg, isOwn, showAvatar }: {
  msg: ChatMessage
  isOwn: boolean
  showAvatar: boolean
}) {
  // Prominent trade completed card
  if (msg.is_system && msg.message.startsWith('TRADE_COMPLETED:')) {
    try {
      const data = JSON.parse(msg.message.replace('TRADE_COMPLETED:', ''))
      return (
        <div className="flex justify-center my-3 px-2">
          <div className="trade-chat-card w-full max-w-sm rounded-2xl overflow-hidden border">
            {/* Header */}
            <div className="trade-chat-header flex items-center gap-2 px-4 py-2.5 border-b">
              <span className="text-base">🤝</span>
              <span className="font-cond font-black text-sm uppercase tracking-wider trade-chat-title">
                Trade Completed
              </span>
              <span className="ml-auto text-[10px] trade-chat-time">{formatTime(msg.created_at)}</span>
            </div>
            {/* Trade body */}
            <div className="grid grid-cols-2 trade-chat-body">
              <div className="px-3 py-3 border-r trade-chat-divider">
                <div className="text-[10px] font-bold uppercase tracking-wider trade-chat-label mb-2">
                  {data.proposerName} receives
                </div>
                {(data.proposerGets ?? []).length === 0
                  ? <div className="text-xs italic trade-chat-empty">nothing</div>
                  : (data.proposerGets as string[]).map((name, i) => (
                    <div key={i} className="text-xs font-bold trade-chat-player leading-snug">{name}</div>
                  ))
                }
              </div>
              <div className="px-3 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wider trade-chat-label mb-2">
                  {data.receiverName} receives
                </div>
                {(data.receiverGets ?? []).length === 0
                  ? <div className="text-xs italic trade-chat-empty">nothing</div>
                  : (data.receiverGets as string[]).map((name, i) => (
                    <div key={i} className="text-xs font-bold trade-chat-player leading-snug">{name}</div>
                  ))
                }
              </div>
            </div>
          </div>
        </div>
      )
    } catch {
      // Fall through to plain system message if parse fails
    }
  }

  // Plain system message (non-trade)
  if (msg.is_system) {
    return (
      <div className="flex justify-center my-1">
        <span className="text-[10px] text-field-500 bg-field-800/60 border border-field-700/50 rounded-full px-3 py-1">
          {msg.message}
        </span>
      </div>
    )
  }

  return (
    <div className={clsx('flex gap-2 items-end', isOwn ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar — always reserve space, only show on first msg in group */}
      <div className="w-7 shrink-0">
        {showAvatar && !isOwn && <MiniAvatar profile={msg.profiles} />}
      </div>

      <div className={clsx('flex flex-col max-w-[75%]', isOwn ? 'items-end' : 'items-start')}>
        {/* Name + time — only on first of group */}
        {showAvatar && (
          <div className={clsx('flex items-baseline gap-1.5 mb-1', isOwn ? 'flex-row-reverse' : 'flex-row')}>
            <span className={clsx('text-[11px] font-bold', isOwn ? 'text-gold' : 'text-field-200')}>
              {isOwn ? 'You' : (msg.profiles?.display_name || msg.profiles?.username || 'Unknown')}
            </span>
            <span className="text-[10px] text-field-500">{formatTime(msg.created_at)}</span>
          </div>
        )}

        {/* Bubble */}
        <div className={clsx(
          'px-3 py-2 rounded-2xl text-sm leading-relaxed break-words',
          isOwn
            ? 'bg-gold/20 border border-gold/30 text-white rounded-br-sm'
            : 'bg-field-700 border border-field-600 text-field-100 rounded-bl-sm',
        )}>
          {msg.message}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────

export function LeagueChat() {
  const { activeLeagueId, activeLeague, user, profile } = useAppStore()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // ── Fetch messages ──────────────────────────────────────────
  const { data: messages = [] } = useQuery({
    queryKey: ['league-chat', activeLeagueId],
    enabled: !!activeLeagueId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_messages')
        .select('*, profiles(username, display_name, avatar_url)')
        .eq('league_id', activeLeagueId!)
        .order('created_at', { ascending: true })
        .limit(200)
      if (error) throw error
      return (data ?? []) as ChatMessage[]
    },
  })

  // ── Realtime subscription ───────────────────────────────────
  useEffect(() => {
    if (!activeLeagueId) return

    const channel = supabase
      .channel(`chat:${activeLeagueId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'league_messages',
          filter: `league_id=eq.${activeLeagueId}`,
        },
        async (payload) => {
          // Fetch the new message with profile joined
          const { data } = await supabase
            .from('league_messages')
            .select('*, profiles(username, display_name, avatar_url)')
            .eq('id', payload.new.id)
            .single()

          if (data) {
            qc.setQueryData<ChatMessage[]>(['league-chat', activeLeagueId], prev => [
              ...(prev ?? []),
              data as ChatMessage,
            ])
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeLeagueId, qc])

  // ── Auto-scroll to bottom ───────────────────────────────────
  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, autoScroll])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setAutoScroll(atBottom)
  }, [])

  // ── Send message ────────────────────────────────────────────
  const sendMessage = async () => {
    const trimmed = text.trim()
    if (!trimmed || !activeLeagueId || !user) return

    setSending(true)
    setText('')
    inputRef.current?.focus()

    try {
      const { error } = await supabase
        .from('league_messages')
        .insert({
          league_id: activeLeagueId,
          user_id:   user.id,
          message:   trimmed,
          is_system: false,
        })
      if (error) throw error
      setAutoScroll(true)
    } catch (e: any) {
      setText(trimmed) // restore on failure
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!activeLeagueId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <MessageSquare className="w-10 h-10 text-field-600" />
        <p className="text-field-400 text-sm">Select a league to open the chat</p>
      </div>
    )
  }

  // Group consecutive messages from same user (within 5 minutes)
  const grouped = messages.map((msg, i) => {
    const prev = messages[i - 1]
    const sameUser = prev && prev.user_id === msg.user_id && !msg.is_system && !prev.is_system
    const closeInTime = prev && (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < 5 * 60 * 1000
    const isFirst = !sameUser || !closeInTime
    return { msg, isFirst }
  })

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-field-700 shrink-0">
        <MessageSquare className="w-4 h-4 text-gold" />
        <span className="font-cond font-bold text-sm uppercase tracking-wider text-white">
          League Chat
        </span>
        <span className="text-field-500 text-xs ml-1">— {activeLeague?.name}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-[10px] text-field-400 font-bold">Live</span>
        </div>
      </div>

      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5 min-h-0"
        onScroll={handleScroll}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center gap-2">
            <MessageSquare className="w-8 h-8 text-field-600" />
            <p className="text-field-400 text-sm">No messages yet</p>
            <p className="text-field-600 text-xs">Be the first to say something!</p>
          </div>
        )}

        {grouped.map(({ msg, isFirst }) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isOwn={msg.user_id === user?.id}
            showAvatar={isFirst}
          />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom hint */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true)
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
          }}
          className="mx-4 mb-2 text-xs text-gold bg-gold/10 border border-gold/30 rounded-full px-3 py-1 font-bold hover:bg-gold/20 transition-colors"
        >
          ↓ New messages
        </button>
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-field-700 shrink-0">
        <div className="flex items-center gap-2 bg-field-700 border border-field-600 rounded-xl px-3 py-2 focus-within:border-gold/50 transition-colors">
          <div className="w-6 h-6 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center shrink-0">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <User className="w-3 h-3 text-gold" />
            )}
          </div>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm text-white placeholder-field-500 outline-none min-w-0"
            placeholder="Message the league…"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={500}
            disabled={sending}
          />
          <button
            onClick={sendMessage}
            disabled={!text.trim() || sending}
            className={clsx(
              'shrink-0 p-1.5 rounded-lg transition-all',
              text.trim()
                ? 'text-gold hover:bg-gold/10 hover:scale-110'
                : 'text-field-600 cursor-not-allowed',
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="flex justify-between mt-1 px-1">
          <span className="text-[10px] text-field-600">Enter to send · Shift+Enter for newline</span>
          <span className={clsx('text-[10px]', text.length > 450 ? 'text-yellow-400' : 'text-field-600')}>
            {text.length}/500
          </span>
        </div>
      </div>
    </div>
  )
}
