import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import { useAnchoredPortal } from '@/hooks/useAnchoredPortal'
import { Send, MessageSquare, Image as ImageIcon, Search, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { UserProfileModal } from './UserProfileModal'

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

function MessageText({ text, myUsername, onMentionClick }: {
  text: string
  myUsername?: string
  onMentionClick: (username: string) => void
}) {
  const parts = text.split(/(@\w+)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const handle = part.slice(1).toLowerCase()
          const isMe = myUsername && handle === myUsername.toLowerCase()
          return (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); onMentionClick(part.slice(1)) }}
              className={clsx(
                'font-bold rounded px-0.5 cursor-pointer hover:underline transition-opacity hover:opacity-80',
                isMe ? 'bg-gold/30 text-gold' : 'text-gold/80',
              )}
            >
              {part}
            </button>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

// ── Message bubble ────────────────────────────────────────────

function MessageBubble({ msg, isOwn, showAvatar, myUsername, myAvatarUrl, onMentionClick, isNew }: {
  msg: ChatMessage
  isOwn: boolean
  showAvatar: boolean
  myUsername?: string
  myAvatarUrl?: string | null
  onMentionClick: (username: string) => void
  isNew?: boolean
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

  // Image / GIF — same prefixed-message-text convention as
  // TRADE_COMPLETED: above, just for user-sent content instead of a
  // system-generated card. IMAGE: is a user's own upload (Supabase
  // Storage URL); GIF: is a GIPHY result. Rendered inside the same
  // bubble wrapper (avatar, sender, timestamp) as a normal message —
  // only what's inside the bubble itself changes.
  const isImage = msg.message.startsWith('IMAGE:')
  const isGif   = msg.message.startsWith('GIF:')
  const mediaUrl = isImage ? msg.message.slice('IMAGE:'.length)
                  : isGif  ? msg.message.slice('GIF:'.length)
                  : null

  return (
    <div className={clsx('flex gap-2 items-end', isOwn ? 'flex-row-reverse' : 'flex-row')}>
      <div className="w-7 shrink-0">
        {showAvatar && !isOwn && <MiniAvatar profile={msg.profiles} />}
        {showAvatar && isOwn && (
          myAvatarUrl ? (
            <img src={myAvatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-gold/40" />
          ) : (
            <div className="chat-avatar-fallback w-7 h-7 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center shrink-0">
              <span className="text-xs font-black text-gold">
                {(myUsername || '?').slice(0, 2).toUpperCase()}
              </span>
            </div>
          )
        )}
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
          mediaUrl
            ? 'rounded-2xl overflow-hidden border max-w-[220px]'
            : 'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words shadow-sm',
          isOwn
            ? clsx('chat-bubble-own border-gold/30', !mediaUrl && 'bg-gold/20 text-white rounded-br-md')
            : clsx('chat-bubble-other border-field-600', !mediaUrl && 'bg-field-700 text-field-100 rounded-bl-md'),
          isNew && 'message-reveal',
        )}>
          {mediaUrl ? (
            // max-h caps user-uploaded photos, which — unlike GIPHY
            // GIFs (always 200px tall at the source) — have no
            // guaranteed aspect ratio. object-contain keeps the
            // whole image visible rather than cropping it to fit.
            <img src={mediaUrl} alt={isGif ? 'GIF' : 'Shared image'}
              className="block w-full max-h-[280px] object-contain bg-field-900" loading="lazy" />
          ) : (
            <MessageText text={msg.message} myUsername={myUsername} onMentionClick={onMentionClick} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── GIF picker ────────────────────────────────────────────────

interface GifResult { id: string; title: string; url: string }

function GifPicker({ onSelect, onClose, anchorRef }: {
  onSelect: (url: string) => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement>
}) {
  const [query, setQuery] = useState('')
  const [gifs, setGifs] = useState<GifResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { searchRef.current?.focus() }, [])

  // Portaled + position computed from real viewport coordinates —
  // this is what actually fixes the top-row-clipped bug. The chat
  // panel is a bounded, clipped container; a plain CSS `absolute`
  // popover growing upward from the input gets visually cut off by
  // that panel's own overflow boundary the moment it's taller than
  // the room actually available above the input, regardless of the
  // popover's own styling. Portaling to document.body with a
  // computed position/max-height sidesteps that entirely.
  const anchorStyle = useAnchoredPortal(anchorRef, true, { matchAnchorWidth: false })

  // Trending on open, debounced re-search as the person types —
  // not on every keystroke, to avoid hammering the proxy.
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const url = import.meta.env.VITE_SUPABASE_URL
        const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
        const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''
        const r = await fetch(`${url}/functions/v1/giphy-search${qs}`, {
          headers: { apikey: anon, Authorization: `Bearer ${anon}` },
        })
        const data = await r.json()
        if (!r.ok || data.error) throw new Error(data.error ?? 'GIF search failed')
        setGifs(data.gifs ?? [])
      } catch (e: any) {
        setError(e.message ?? 'GIF search failed')
        setGifs([])
      } finally {
        setLoading(false)
      }
    }, query ? 350 : 0)
    return () => clearTimeout(t)
  }, [query])

  if (!anchorStyle) return null

  return createPortal(
    <div
      style={{ position: 'fixed', left: anchorStyle.left, bottom: anchorStyle.bottom, maxHeight: anchorStyle.maxHeight }}
      className="z-50 w-72 flex flex-col bg-field-800 border border-field-600 rounded-xl overflow-hidden shadow-2xl"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-field-700 shrink-0">
        <Search className="w-3.5 h-3.5 text-field-500 shrink-0" />
        <input
          ref={searchRef}
          className="flex-1 bg-transparent text-sm text-white placeholder-field-500 outline-none min-w-0"
          placeholder="Search GIFs…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onClose()}
        />
        <button onClick={onClose} className="text-field-500 hover:text-white transition-colors text-xs font-bold shrink-0">
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-field-500 animate-spin" />
          </div>
        )}
        {!loading && error && (
          <p className="text-field-400 text-xs text-center py-6 px-3">{error}</p>
        )}
        {!loading && !error && gifs.length === 0 && (
          <p className="text-field-400 text-xs text-center py-6">No GIFs found</p>
        )}
        {!loading && !error && gifs.length > 0 && (
          // grid-cols-4 within a fixed w-72 popover -> small,
          // predictable ~68px square tiles regardless of how wide
          // the chat panel itself happens to be. The outer
          // container's maxHeight (from useAnchoredPortal, clamped
          // to real available viewport space) is what actually
          // fixed the top-row-clipped bug — this flex-1 scroll area
          // just fills whatever's left after the header.
          <div className="grid grid-cols-4 gap-1.5">
            {gifs.map(g => (
              <button key={g.id} onClick={() => onSelect(g.url)}
                className="rounded-lg overflow-hidden border border-field-700 hover:border-gold/50 transition-colors aspect-square bg-field-900">
                <img src={g.url} alt={g.title} className="w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
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
    <MentionDropdownInner anchorRef={anchorRef} filtered={filtered} onSelect={onSelect} />
  )
}

function MentionDropdownInner({ anchorRef, filtered, onSelect }: {
  anchorRef: React.RefObject<HTMLElement>
  filtered: Member[]
  onSelect: (m: Member) => void
}) {
  // Same latent clipping bug as the GIF picker had, just never
  // reported — member lists usually short enough to fit by luck,
  // not by correctness. matchAnchorWidth: true keeps this one
  // spanning the input's full width, unlike the GIF picker's fixed
  // w-72, since these are full-width text rows, not a thumbnail grid.
  const anchorStyle = useAnchoredPortal(anchorRef, true, { matchAnchorWidth: true })
  if (!anchorStyle) return null

  return createPortal(
    <div
      style={{ position: 'fixed', left: anchorStyle.left, bottom: anchorStyle.bottom, width: anchorStyle.width, maxHeight: anchorStyle.maxHeight }}
      className="z-50 flex flex-col bg-field-800 border border-field-600 rounded-xl overflow-hidden shadow-2xl"
    >
      <div className="px-3 py-1.5 text-xs text-field-500 font-bold uppercase tracking-wider border-b border-field-700 shrink-0">
        Mention a teammate
      </div>
      <div className="overflow-y-auto min-h-0">
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
                <span className="text-[12px] font-black text-gold">
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
    </div>,
    document.body,
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
  const [profileUsername, setProfileUsername] = useState<string | null>(null)

  // ── Image + GIF state ───────────────────────────────────────
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // Message reveal — same isolated-tracking technique as the draft
  // pick reveal (a completely separate feature, unrelated state):
  // flag whichever message is newest, briefly, so it can play a
  // one-time reveal instead of just popping into the list. Doesn't
  // matter whether it arrived via realtime, was sent by this
  // person, or (rare) a page reload's already-loaded batch — that
  // last case is exactly why prevTopMsgId starts null and the very
  // first effect run is treated as "not new": nobody wants the
  // entire chat history animating in at once on load.
  const [justArrivedMsgId, setJustArrivedMsgId] = useState<string | null>(null)
  const prevTopMsgId = useRef<string | null>(null)
  useEffect(() => {
    const topId = messages.length > 0 ? messages[messages.length - 1].id : null
    if (topId && prevTopMsgId.current !== null && topId !== prevTopMsgId.current) {
      setJustArrivedMsgId(topId)
      const t = setTimeout(() => setJustArrivedMsgId(null), 900)
      prevTopMsgId.current = topId
      return () => clearTimeout(t)
    }
    prevTopMsgId.current = topId
  }, [messages])

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

  // ── Send an image or GIF — same insert path as a text message,
  // just no trimmed-text requirement and no @mention scanning
  // (nobody's typing an @handle into a GIF).
  const sendMediaMessage = async (prefix: 'IMAGE:' | 'GIF:', url: string) => {
    if (!activeLeagueId || !user) return
    try {
      const { error } = await supabase
        .from('league_messages')
        .insert({
          league_id: activeLeagueId,
          user_id: user.id,
          message: prefix + url,
          is_system: false,
        })
      if (error) throw error
      setAutoScroll(true)
    } catch (e: any) {
      toast.error('Failed to send: ' + e.message)
    }
  }

  const handleGifSelect = (url: string) => {
    setShowGifPicker(false)
    sendMediaMessage('GIF:', url)
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow selecting the same file again later
    if (!file || !user) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Image must be under 8MB')
      return
    }

    setUploadingImage(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('chat-images')
        .upload(path, file, { contentType: file.type })
      if (uploadError) throw uploadError

      const { data: pub } = supabase.storage.from('chat-images').getPublicUrl(path)
      await sendMediaMessage('IMAGE:', pub.publicUrl)
    } catch (e: any) {
      toast.error('Failed to upload image: ' + e.message)
    } finally {
      setUploadingImage(false)
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
  const myAvatarUrl = profile?.avatar_url

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-field-700 shrink-0">
        <MessageSquare className="w-4 h-4 text-gold" />
        <span className="font-cond font-bold text-sm uppercase tracking-wider text-white">League Chat</span>
        <span className="text-field-500 text-xs ml-1">— {activeLeague?.name}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-nfl" />
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
            myAvatarUrl={myAvatarUrl}
            onMentionClick={setProfileUsername}
            isNew={msg.id === justArrivedMsgId}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Scroll hint */}
      {!autoScroll && (
        <button onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
          className="chat-scroll-btn rise-in mx-4 mb-2 text-xs text-gold bg-gold/10 border border-gold/30 rounded-full px-3 py-1 font-bold hover:bg-gold/20 transition-colors">
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

          {/* GIF picker — same floating position as the mention
              dropdown, just triggered by a button instead of typing */}
          {showGifPicker && (
            <GifPicker onSelect={handleGifSelect} onClose={() => setShowGifPicker(false)} anchorRef={inputWrapRef as any} />
          )}

          <div className="chat-input-wrap flex items-center gap-2 bg-field-700 border border-field-600 rounded-xl px-3 py-2 focus-within:border-gold/50 transition-colors">
            <div className="w-6 h-6 rounded-full overflow-hidden bg-gold/20 border border-gold/30 flex items-center justify-center shrink-0">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                : <span className="text-[12px] font-black text-gold">{(profile?.username || '?').slice(0,2).toUpperCase()}</span>
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

            {/* Hidden file input, triggered by the image button below */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={handleImageSelect}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage || sending}
              title="Send a photo"
              className={clsx(
                'shrink-0 p-1.5 rounded-lg transition-colors',
                uploadingImage ? 'text-field-600 cursor-wait' : 'text-field-400 hover:text-gold hover:bg-gold/10',
              )}
            >
              {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setShowGifPicker(v => !v)}
              title="Send a GIF"
              className={clsx(
                'shrink-0 p-1.5 rounded-lg font-cond font-black text-[11px] uppercase tracking-wider leading-none transition-colors',
                showGifPicker ? 'text-gold bg-gold/10' : 'text-field-400 hover:text-gold hover:bg-gold/10',
              )}
            >
              GIF
            </button>

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
          <span className={clsx('text-xs', text.length > 450 ? 'text-gold' : 'text-field-600')}>
            {text.length}/500
          </span>
        </div>
      </div>

      {/* User profile modal — opens when @mention is clicked */}
      {profileUsername && (
        <UserProfileModal
          username={profileUsername}
          onClose={() => setProfileUsername(null)}
        />
      )}
    </div>
  )
}
