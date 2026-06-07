import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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

interface Member {
  user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

// ── Avatar ────────────────────────────────────────────────────

function MiniAvatar({ profile }: { profile?: ChatMessage['profiles'] }) {
  const initials = (profile?.display_name || profile?.username || '?').slice(0, 2).toUpperCase()
  return profile?.avatar_url ? (
    <img src={profile.avatar_url} alt=""
      className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-field-600" />
  ) : (
    <div className="chat-avatar-fallback w-7 h-7 rounded-full bg-field-700 border border-field-600 flex items-center justify-center shrink-0">
      <span className="text-xs font-black text-field-300">{initials}</span>
    </div>
  )
}

// ── Format timestamp ──────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMins = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const h = Math.floor(diffMins / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Render message text with @mention highlights ──────────────

function MessageText({ text, myUsername }: { text: string; myUsername?: string }) {
  // Split on @word boundaries and highlight mentions
  const parts = text.split(/(@\w+)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const handle = part.slice(1).toLowerCase()
          const isMe = myUsername && handle === myUsername.toLowerCase()
          return (
            <span key={i} className={clsx(
              'font-bold rounded px-0.5',
              isMe
                ? 'bg-gold/30 text-gold'        // highlight when you're mentioned
                : 'text-gold/80',               // other mentions
            )}>
              {part}
            </span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

// ── Message bubble ────────────────────────────────────────────

function MessageBubble({ msg, isOwn, showAvatar, myUsername }: {
  msg: ChatMessage
  isOwn: boolean
  showAvatar: boolean
  myUsername?: string
}) {
  // Trade completed card
  if (msg.is_system && msg.message.startsWith('TRADE_COMPLETED:')) {
    try {
      const data = JSON.parse(msg.message.replace('TRADE_COMPLETED:', ''))
      return (
        <div className="flex justify-center my-3 px-2">
          <div className="trade-chat-card w-full max-w-sm rounded-2xl overflow-hidden border">
            <div className="trade-chat-header flex items-center gap-2 px-4 py-2.5 border-b">
              <span className="text-base">🤝</span>
              <span className="font-cond font-black text-base uppercase tracking-wider trade-chat-title">
                Trade Completed
              </span>
              <span className="ml-auto text-xs trade-chat-time">{formatTime(msg.created_at)}</span>
            </div>
            <div className="grid grid-cols-2 trade-chat-body">
              <div className="px-3 py-3 border-r trade-chat-divider">
                <div className="text-xs font-bold uppercase tracking-wider trade-chat-label mb-2">
                  {data.proposerName} receives
                </div>
                {(data.proposerGets ?? []).length === 0
                  ? <div className="text-xs italic trade-chat-empty">nothing</div>
                  : (data.proposerGets as string[]).map((name: string, i: number) => (
                    <div key={i} className="text-sm font-bold trade-chat-player leading-snug">{name}</div>
                  ))}
              </div>
              <div className="px-3 py-3">
                <div className="text-xs font-bold uppercase tracking-wider trade-chat-label mb-2">
                  {data.receiverName} receives
                </div>
                {(data.receiverGets ?? []).length === 0
                  ? <div className="text-xs italic trade-chat-empty">nothing</div>
                  : (data.receiverGets as string[]).map((name: string, i: number) => (
                    <div key={i} className="text-sm font-bold trade-chat-player leading-snug">{name}</div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )
    } catch { /* fall through */ }
  }

  // Plain system message
  if (msg.is_system) {
    return (
      <div className="flex justify-center my-1">
        <span className="chat-system-pill text-xs text-field-500 bg-field-800/60 border border-field-700/50 rounded-full px-3 py-1">
          {msg.message}
        </span>
      </div>
    )
  }

  return (
    <div className={clsx('flex gap-2 items-end', isOwn ? 'flex-row-reverse' : 'flex-row')}>
      <div className="w-7 shrink-0">
        {showAvatar && !isOwn && <MiniAvatar profile={msg.profiles} />}
      </div>
      <div className={clsx('flex flex-col max-w-[75%]', isOwn ? 'items-end' : 'items-start')}>
        {showAvatar && (
          <div className={clsx('flex items-baseline gap-1.5 mb-1', isOwn ? 'flex-row-reverse' : 'flex-row')}>
            <span className={clsx('text-xs font-bold', isOwn ? 'text-gold chat-sender-name-own' : 'text-field-200 chat-sender-name')}>
              {isOwn ? 'You' : (msg.profiles?.display_name || msg.profiles?.username || 'Unknown')}
            </span>
            <span className="text-xs text-field-500 chat-time">{formatTime(msg.created_at)}</span>
          </div>
        )}
        <div className={clsx(
          'px-3 py-2 rounded-2xl text-sm leading-relaxed break-words',
          isOwn
            ? 'chat-bubble-own bg-gold/20 border border-gold/30 text-white rounded-br-sm'
            : 'chat-bubble-other bg-field-700 border border-field-600 text-field-100 rounded-bl-sm',
        )}>
          <MessageText text={msg.message} myUsername={myUsername} />
        </div>
      </div>
    </div>
  )
}

// ── @ mention dropdown ────────────────────────────────────────

function MentionDropdown({ members, query, onSelect, anchorRef }: {
  members: Member[]
  query: string
  onSelect: (m: Member) => void
  anchorRef: React.RefObject<HTMLElement>
}) {
  const filtered = members.filter(m => {
    const q = query.toLowerCase()
    return (
      m.username.toLowerCase().startsWith(q) ||
      (m.display_name ?? '').toLowerCase().startsWith(q)
    )
  }).slice(0, 6)

  if (filtered.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-field-800 border border-field-600 rounded-xl overflow-hidden shadow-2xl">
      <div className="px-3 py-1.5 text-xs text-field-500 font-bold uppercase tracking-wider border-b border-field-700">
        Mention a teammate
      </div>
      {filtered.map(m => (
        <button
          key={m.user_id}
          onMouseDown={e => { e.preventDefault(); onSelect(m) }}
          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-field-700 transition-colors text-left"
        >
          {m.avatar_url ? (
            <img src={m.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-black text-gold">
                {(m.display_name || m.username).slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white truncate">
              {m.display_name || m.username}
            </div>
            <div className="text-xs text-field-400">@{m.username}</div>
          </div>
        </button>
      ))}
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
  const inputRef = useRef<HTMLInputElement>(null)
  const inputWrapRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // ── @ mention state ─────────────────────────────────────────
  const [mentionQuery, setMentionQuery] = useState<string | null>(null) // null = not active

  // ── Fetch league members for @ picker ──────────────────────
  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ['chat-members', activeLeagueId],
    enabled: !!activeLeagueId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_members')
        .select('user_id, profiles(username, display_name, avatar_url)')
        .eq('league_id', activeLeagueId!)
      if (error) throw error
      return (data ?? [])
        .filter((m: any) => m.user_id !== user?.id)
        .map((m: any) => ({
          user_id: m.user_id,
          username: m.profiles?.username ?? '',
          display_name: m.profiles?.display_name ?? null,
          avatar_url: m.profiles?.avatar_url ?? null,
        }))
    },
  })

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
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'league_messages',
        filter: `league_id=eq.${activeLeagueId}`,
      }, async (payload) => {
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
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeLeagueId, qc])

  // ── Auto-scroll ─────────────────────────────────────────────
  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, autoScroll])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }, [])

  // ── Input change — detect @ trigger ────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setText(val)

    // Find the @ closest to the cursor that hasn't been completed with a space
    const cursor = e.target.selectionStart ?? val.length
    const textBeforeCursor = val.slice(0, cursor)
    const atMatch = textBeforeCursor.match(/@(\w*)$/)

    if (atMatch) {
      setMentionQuery(atMatch[1]) // query is what's typed after @
    } else {
      setMentionQuery(null)
    }
  }

  // ── Select a member from the dropdown ──────────────────────
  const selectMention = (m: Member) => {
    if (!inputRef.current) return

    const cursor = inputRef.current.selectionStart ?? text.length
    const textBeforeCursor = text.slice(0, cursor)
    const textAfterCursor = text.slice(cursor)

    // Replace the @query with the selected @username + space
    const replaced = textBeforeCursor.replace(/@(\w*)$/, `@${m.username} `)
    const newText = replaced + textAfterCursor
    setText(newText)
    setMentionQuery(null)

    // Move cursor after the inserted mention
    requestAnimationFrame(() => {
      if (inputRef.current) {
        const newCursor = replaced.length
        inputRef.current.focus()
        inputRef.current.setSelectionRange(newCursor, newCursor)
      }
    })
  }

  // Close mention dropdown on Escape
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionQuery !== null) {
      if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); return }
      // Tab or ArrowDown to select first result — skip for now, mouse-only is fine
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Send message ────────────────────────────────────────────
  const sendMessage = async () => {
    const trimmed = text.trim()
    if (!trimmed || !activeLeagueId || !user) return

    setMentionQuery(null)
    setSending(true)
    setText('')

    try {
      const { error } = await supabase
        .from('league_messages')
        .insert({
          league_id: activeLeagueId,
          user_id: user.id,
          message: trimmed,
          is_system: false,
        })
      if (error) throw error
      setAutoScroll(true)

      // ── Notify mentioned users ──────────────────────────────
      const mentionHandles = [...trimmed.matchAll(/@(\w+)/g)].map(m => m[1].toLowerCase())
      if (mentionHandles.length > 0) {
        const mentionedMembers = members.filter(m =>
          mentionHandles.includes(m.username.toLowerCase())
        )
        const senderName = profile?.display_name || profile?.username || 'Someone'
        for (const m of mentionedMembers) {
          await supabase.from('notifications').insert({
            user_id: m.user_id,
            league_id: activeLeagueId,
            type: 'mention',
            title: `💬 ${senderName} mentioned you`,
            body: trimmed.length > 60 ? trimmed.slice(0, 57) + '…' : trimmed,
            is_read: false,
            data: { league_id: activeLeagueId },
          })
        }
      }
    } catch (e: any) {
      setText(trimmed)
    } finally {
      setSending(false)
      requestAnimationFrame(() => inputRef.current?.focus())
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

  const grouped = messages.map((msg, i) => {
    const prev = messages[i - 1]
    const sameUser = prev && prev.user_id === msg.user_id && !msg.is_system && !prev.is_system
    const closeInTime = prev && (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < 5 * 60 * 1000
    return { msg, isFirst: !sameUser || !closeInTime }
  })

  const myUsername = profile?.username

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-field-700 shrink-0">
        <MessageSquare className="w-4 h-4 text-gold" />
        <span className="font-cond font-bold text-sm uppercase tracking-wider text-white">League Chat</span>
        <span className="text-field-500 text-xs ml-1">— {activeLeague?.name}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-xs text-field-400 font-bold">Live</span>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-area flex-1 overflow-y-auto px-4 py-3 space-y-1.5 min-h-0" onScroll={handleScroll}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center gap-2">
            <MessageSquare className="w-8 h-8 text-field-600" />
            <p className="chat-empty text-field-400 text-sm">No messages yet</p>
            <p className="chat-empty text-field-500 text-xs">Be the first to say something!</p>
          </div>
        )}
        {grouped.map(({ msg, isFirst }) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isOwn={msg.user_id === user?.id}
            showAvatar={isFirst}
            myUsername={myUsername}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Scroll hint */}
      {!autoScroll && (
        <button onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
          className="chat-scroll-btn mx-4 mb-2 text-xs text-gold bg-gold/10 border border-gold/30 rounded-full px-3 py-1 font-bold hover:bg-gold/20 transition-colors">
          ↓ New messages
        </button>
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-field-700 shrink-0">
        <div className="relative" ref={inputWrapRef as any}>

          {/* @ mention dropdown — floats above the input */}
          {mentionQuery !== null && (
            <MentionDropdown
              members={members}
              query={mentionQuery}
              onSelect={selectMention}
              anchorRef={inputWrapRef as any}
            />
          )}

          <div className="chat-input-wrap flex items-center gap-2 bg-field-700 border border-field-600 rounded-xl px-3 py-2 focus-within:border-gold/50 transition-colors">
            <div className="w-6 h-6 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center shrink-0">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                : <User className="w-3 h-3 text-gold" />
              }
            </div>
            <input
              ref={inputRef}
              className="chat-input flex-1 bg-transparent text-sm text-white placeholder-field-500 outline-none min-w-0"
              placeholder="Message the league… (type @ to mention)"
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              maxLength={500}
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={!text.trim() || sending}
              className={clsx(
                'shrink-0 p-1.5 rounded-lg transition-all',
                text.trim() ? 'text-gold hover:bg-gold/10 hover:scale-110' : 'text-field-600 cursor-not-allowed',
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex justify-between mt-1 px-1">
          <span className="text-xs text-field-600">Enter to send · @ to mention</span>
          <span className={clsx('text-xs', text.length > 450 ? 'text-yellow-400' : 'text-field-600')}>
            {text.length}/500
          </span>
        </div>
      </div>
    </div>
  )
}
