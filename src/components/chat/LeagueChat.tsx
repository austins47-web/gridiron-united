import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { markChatRead } from '@/hooks/useUnreadChat'
import { useAppStore } from '@/store/appStore'
import { useAnchoredPortal } from '@/hooks/useAnchoredPortal'
import {
  Send, MessageSquare, Image as ImageIcon, Search, Loader2, ArrowLeftRight,
  CornerUpLeft, Pencil, Trash2, Copy, SmilePlus, X,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { UserProfileModal } from './UserProfileModal'
import { PickemWeekFinalCard, PICKEM_WEEK_FINAL_PATTERN, type PickemWeekFinalPayload } from './PickemWeekFinalCard'

// ── Types ─────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  league_id: string
  user_id: string | null
  message: string
  is_system: boolean
  created_at: string
  reply_to_id?: string | null
  edited_at?: string | null
  deleted_at?: string | null
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

// ── Reactions, replies, the message menu ──────────────────────

/** The quick-react palette (the table takes any emoji; these are offered). */
const REACTIONS = ['🔥', '😂', '👍', '❤️', '😮', '💀', '🏈', '🗑️']

interface ReactionRow { message_id: string; user_id: string; emoji: string }
interface ReactionGroup { emoji: string; users: string[]; mine: boolean }
type Align = 'left' | 'right' | 'center'

const senderName = (m?: ChatMessage | null) =>
  m?.profiles?.display_name || m?.profiles?.username || 'Someone'

/** One line of a message, for reply quotes and the composer bar. */
function snippet(m: ChatMessage): string {
  if (m.deleted_at) return 'Message deleted'
  if (m.message.startsWith('IMAGE:')) return '📷 Photo'
  if (m.message.startsWith('GIF:')) return 'GIF'
  if (m.is_system && PICKEM_WEEK_FINAL_PATTERN.test(m.message)) return "🏆 Pick'Em week final"
  if (m.is_system && m.message.startsWith('TRADE_COMPLETED:')) return '🔁 Trade completed'
  return m.message.length > 90 ? m.message.slice(0, 87) + '…' : m.message
}

const alignRow = (align: Align) =>
  align === 'right' ? 'justify-end pr-9' : align === 'left' ? 'justify-start pl-9' : 'justify-center'

function ReplyQuote({ original, isOwn, onJump }: {
  original: ChatMessage | 'missing'; isOwn: boolean; onJump: (id: string) => void
}) {
  const missing = original === 'missing'
  return (
    <button
      onClick={e => { e.stopPropagation(); if (!missing) onJump(original.id) }}
      className={clsx(
        'chat-reply-quote flex items-start gap-1.5 max-w-full mb-1 px-2.5 py-1.5 rounded-xl text-left border-l-2 bg-field-800/80 border-gold/60',
        isOwn ? 'self-end' : 'self-start',
        !missing && 'hover:bg-field-700/80 transition-colors',
      )}
    >
      <CornerUpLeft className="w-3 h-3 text-gold/80 shrink-0 mt-0.5" />
      <span className="min-w-0 text-xs leading-snug">
        {missing
          ? <span className="italic text-field-500">Original message isn&apos;t loaded</span>
          : <>
              <span className="font-bold text-field-200">{senderName(original)}</span>{' '}
              <span className="text-field-400 line-clamp-2">{snippet(original)}</span>
            </>}
      </span>
    </button>
  )
}

function ReactionChips({ groups, align, onToggle, nameOf }: {
  groups: ReactionGroup[]
  align: Align
  onToggle: (emoji: string) => void
  nameOf: (userId: string) => string
}) {
  if (groups.length === 0) return null
  return (
    <div className={clsx('flex flex-wrap gap-1 mt-1', alignRow(align))}>
      {groups.map(g => (
        <button
          key={g.emoji}
          onClick={() => onToggle(g.emoji)}
          title={g.users.map(nameOf).join(', ')}
          className={clsx(
            'chat-reaction inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors',
            g.mine
              ? 'bg-gold/20 border-gold/50 text-white'
              : 'bg-field-800 border-field-600 text-field-300 hover:border-field-500',
          )}
        >
          <span className="text-sm leading-none">{g.emoji}</span>
          <span className="font-bold tabular-nums">{g.users.length}</span>
        </button>
      ))}
    </div>
  )
}

/** Opens under a tapped message: react, reply, copy — and edit/delete your own. */
function MessageMenu({ msg, isOwn, align, myReactions, onReact, onReply, onEdit, onDelete, onClose }: {
  msg: ChatMessage
  isOwn: boolean
  align: Align
  myReactions: Set<string>
  onReact: (emoji: string) => void
  onReply: () => void
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const isText = !msg.is_system && !msg.message.startsWith('IMAGE:') && !msg.message.startsWith('GIF:')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = async () => {
    try { await navigator.clipboard.writeText(msg.message); toast.success('Copied') }
    catch { toast.error("Couldn't copy") }
    onClose()
  }

  return (
    <div className={clsx('flex mt-1', alignRow(align))}>
      <div className="chat-menu rise-in rounded-2xl border border-field-600 bg-field-800 shadow-xl shadow-black/40 p-1.5 max-w-full">
        {confirming ? (
          <div className="flex items-center gap-1 px-1.5 py-1">
            <span className="text-xs text-field-200 mr-1">Delete this message for everyone?</span>
            <button onClick={onDelete} className="text-xs font-bold text-red-400 hover:text-red-300 px-2 py-1 rounded-lg hover:bg-red-500/10">Delete</button>
            <button onClick={() => setConfirming(false)} className="text-xs text-field-400 hover:text-white px-2 py-1">Cancel</button>
          </div>
        ) : (
          <>
            <div className="flex items-center flex-wrap">
              {REACTIONS.map(e => (
                <button
                  key={e}
                  onClick={() => onReact(e)}
                  aria-label={`React ${e}`}
                  className={clsx(
                    'w-9 h-9 rounded-xl text-xl leading-none flex items-center justify-center transition-transform hover:scale-125 active:scale-95',
                    myReactions.has(e) && 'bg-gold/20',
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5 border-t border-field-700 mt-1 pt-1">
              <MenuButton icon={<CornerUpLeft className="w-3.5 h-3.5" />} label="Reply" onClick={onReply} />
              {isText && <MenuButton icon={<Copy className="w-3.5 h-3.5" />} label="Copy" onClick={copy} />}
              {isOwn && isText && <MenuButton icon={<Pencil className="w-3.5 h-3.5" />} label="Edit" onClick={onEdit} />}
              {isOwn && !msg.is_system && (
                <MenuButton icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete" danger onClick={() => setConfirming(true)} />
              )}
              <button onClick={onClose} aria-label="Close" className="ml-auto p-1.5 text-field-500 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MenuButton({ icon, label, onClick, danger = false }: {
  icon: ReactNode; label: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors',
        danger ? 'text-red-400 hover:bg-red-500/10' : 'text-field-200 hover:bg-field-700 hover:text-white',
      )}
    >
      {icon} {label}
    </button>
  )
}

// ── Message bubble ────────────────────────────────────────────

function MessageBubble({ msg, isOwn, showAvatar, myUsername, myAvatarUrl, onMentionClick, isNew, replyTo, onJump, onOpenMenu }: {
  msg: ChatMessage
  isOwn: boolean
  showAvatar: boolean
  myUsername?: string
  myAvatarUrl?: string | null
  onMentionClick: (username: string) => void
  isNew?: boolean
  /** The message this one answers ('missing' when it isn't loaded). */
  replyTo?: ChatMessage | 'missing' | null
  onJump: (id: string) => void
  onOpenMenu: () => void
}) {
  // Trade completed card
  if (msg.is_system && msg.message.startsWith('TRADE_COMPLETED:')) {
    try {
      const data = JSON.parse(msg.message.replace('TRADE_COMPLETED:', ''))
      return (
        <div className="flex justify-center my-3 px-2">
          <div className={clsx(
            'trade-chat-card w-full max-w-sm rounded-2xl overflow-hidden border',
            isNew && 'trade-settle',
          )}>
            <div className="trade-chat-header flex items-center gap-2 px-4 py-2.5 border-b">
              <ArrowLeftRight className="w-4 h-4" strokeWidth={2.25} />
              <span className="font-cond font-black text-base uppercase tracking-wider trade-chat-title">
                Trade Completed
              </span>
              <span className="ml-auto text-xs trade-chat-time">{formatTime(msg.created_at)}</span>
            </div>
            <div className="grid grid-cols-2 trade-chat-body">
              <div className={clsx('px-3 py-3 border-r trade-chat-divider', isNew && 'trade-slide-left')}>
                <div className="text-xs font-bold uppercase tracking-wider trade-chat-label mb-2">
                  {data.proposerName} receives
                </div>
                {(data.proposerGets ?? []).length === 0
                  ? <div className="text-xs italic trade-chat-empty">nothing</div>
                  : (data.proposerGets as string[]).map((name: string, i: number) => (
                    <div key={i} className="text-sm font-bold trade-chat-player leading-snug">{name}</div>
                  ))}
              </div>
              <div className={clsx('px-3 py-3', isNew && 'trade-slide-right')}>
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

  // Pick'Em week final — posted by send-reminders when a week wraps
  if (msg.is_system && PICKEM_WEEK_FINAL_PATTERN.test(msg.message)) {
    try {
      const data = JSON.parse(msg.message.replace(PICKEM_WEEK_FINAL_PATTERN, '')) as PickemWeekFinalPayload
      return <PickemWeekFinalCard data={data} timeLabel={formatTime(msg.created_at)} isNew={isNew} />
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
  const deleted = !!msg.deleted_at
  const isImage = !deleted && msg.message.startsWith('IMAGE:')
  const isGif   = !deleted && msg.message.startsWith('GIF:')
  const mediaUrl = isImage ? msg.message.slice('IMAGE:'.length)
                  : isGif  ? msg.message.slice('GIF:'.length)
                  : null

  return (
    <div className={clsx('group flex gap-2 items-end', isOwn ? 'flex-row-reverse' : 'flex-row')}>
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
        {replyTo && <ReplyQuote original={replyTo} isOwn={isOwn} onJump={onJump} />}
        <div className={clsx('flex items-center gap-1.5 max-w-full', isOwn ? 'flex-row-reverse' : 'flex-row')}>
        {/* Tap a message for reactions, reply, edit, delete */}
        <div
          onClick={deleted ? undefined : onOpenMenu}
          className={clsx(
            !deleted && 'cursor-pointer',
            deleted
              ? 'px-3.5 py-2 rounded-2xl text-sm italic text-field-500 border border-dashed border-field-600'
              : mediaUrl
              ? 'rounded-2xl overflow-hidden border max-w-[220px]'
              : 'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words shadow-sm',
            !deleted && (isOwn
              ? clsx('chat-bubble-own border-gold/30', !mediaUrl && 'bg-gold/20 text-white rounded-br-md')
              : clsx('chat-bubble-other border-field-600', !mediaUrl && 'bg-field-700 text-field-100 rounded-bl-md')),
            isNew && 'message-reveal',
          )}
        >
          {deleted ? (
            'Message deleted'
          ) : mediaUrl ? (
            // max-h caps user-uploaded photos, which — unlike GIPHY
            // GIFs (always 200px tall at the source) — have no
            // guaranteed aspect ratio. object-contain keeps the
            // whole image visible rather than cropping it to fit.
            <img src={mediaUrl} alt={isGif ? 'GIF' : 'Shared image'}
              className="block w-full max-h-[280px] object-contain bg-field-900" loading="lazy" />
          ) : (
            <>
              <MessageText text={msg.message} myUsername={myUsername} onMentionClick={onMentionClick} />
              {msg.edited_at && <span className="ml-1.5 text-[10px] opacity-60 whitespace-nowrap">(edited)</span>}
            </>
          )}
        </div>
        {/* Computers: a react button on hover (phones just tap the message) */}
        {!deleted && (
          <button
            onClick={onOpenMenu}
            aria-label="React or reply"
            className="hidden sm:flex opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-full text-field-500 hover:text-gold hover:bg-field-700 transition-opacity shrink-0"
          >
            <SmilePlus className="w-4 h-4" />
          </button>
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

  // Marks this league's chat as read the moment this page mounts —
  // clears the unread badge on the Chat nav tab (see useUnreadChat).
  useEffect(() => {
    if (activeLeagueId) markChatRead(activeLeagueId)
  }, [activeLeagueId])
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

  // ── Reactions ───────────────────────────────────────────────
  const { data: reactionRows = [] } = useQuery({
    queryKey: ['chat-reactions', activeLeagueId],
    enabled: !!activeLeagueId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_message_reactions')
        .select('message_id, user_id, emoji')
        .eq('league_id', activeLeagueId!)
        .order('created_at', { ascending: true })
        .limit(3000)
      if (error) throw error
      return (data ?? []) as ReactionRow[]
    },
  })
  const reactionsByMessage = useMemo(() => {
    const out = new Map<string, ReactionGroup[]>()
    for (const r of reactionRows) {
      const groups = out.get(r.message_id) ?? []
      let g = groups.find(x => x.emoji === r.emoji)
      if (!g) { g = { emoji: r.emoji, users: [], mine: false }; groups.push(g) }
      g.users.push(r.user_id)
      if (r.user_id === user?.id) g.mine = true
      out.set(r.message_id, groups)
    }
    return out
  }, [reactionRows, user?.id])

  const setReactions = useCallback((fn: (prev: ReactionRow[]) => ReactionRow[]) =>
    qc.setQueryData<ReactionRow[]>(['chat-reactions', activeLeagueId], prev => fn(prev ?? [])), [qc, activeLeagueId])

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user || !activeLeagueId) return
    const mine = reactionRows.some(r => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji)
    const same = (r: ReactionRow) => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji
    // Optimistic — realtime echoes are de-duplicated below
    setReactions(prev => mine ? prev.filter(r => !same(r)) : [...prev.filter(r => !same(r)), { message_id: messageId, user_id: user.id, emoji }])
    const { error } = mine
      ? await supabase.from('league_message_reactions').delete()
          .eq('message_id', messageId).eq('user_id', user.id).eq('emoji', emoji)
      : await supabase.from('league_message_reactions').insert({ message_id: messageId, user_id: user.id, emoji, league_id: activeLeagueId })
    if (error) {
      toast.error("Couldn't save that reaction")
      qc.invalidateQueries({ queryKey: ['chat-reactions', activeLeagueId] })
    }
  }

  // ── Replies, edits, the message menu ────────────────────────
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [editing, setEditing] = useState<ChatMessage | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const closeMenu = useCallback(() => setMenuFor(null), [])

  const jumpTo = (id: string) => {
    const el = document.getElementById(`chat-msg-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlashId(id)
    setTimeout(() => setFlashId(f => (f === id ? null : f)), 1600)
  }

  const startReply = (m: ChatMessage) => {
    setEditing(null)
    setReplyTo(m)
    setMenuFor(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }
  const startEdit = (m: ChatMessage) => {
    setReplyTo(null)
    setEditing(m)
    setText(m.message)
    setMenuFor(null)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(m.message.length, m.message.length)
    })
  }
  const cancelCompose = () => {
    if (editing) setText('')
    setEditing(null)
    setReplyTo(null)
  }
  const deleteMessage = async (m: ChatMessage) => {
    setMenuFor(null)
    const { error } = await supabase
      .from('league_messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', m.id)
    if (error) toast.error("Couldn't delete: " + error.message)
    else qc.setQueryData<ChatMessage[]>(['league-chat', activeLeagueId], prev =>
      (prev ?? []).map(x => (x.id === m.id ? { ...x, message: '', deleted_at: new Date().toISOString() } : x)))
  }

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
          qc.setQueryData<ChatMessage[]>(['league-chat', activeLeagueId], prev =>
            (prev ?? []).some(m => m.id === data.id) ? prev! : [...(prev ?? []), data as ChatMessage])
        }
      })
      // Edits and deletes — keep the sender's profile already loaded
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'league_messages',
        filter: `league_id=eq.${activeLeagueId}`,
      }, (payload) => {
        const row = payload.new as ChatMessage
        qc.setQueryData<ChatMessage[]>(['league-chat', activeLeagueId], prev =>
          (prev ?? []).map(m => (m.id === row.id ? { ...m, ...row, profiles: m.profiles } : m)))
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'league_message_reactions',
        filter: `league_id=eq.${activeLeagueId}`,
      }, (payload) => {
        const r = payload.new as ReactionRow
        qc.setQueryData<ReactionRow[]>(['chat-reactions', activeLeagueId], prev =>
          (prev ?? []).some(x => x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji)
            ? prev! : [...(prev ?? []), { message_id: r.message_id, user_id: r.user_id, emoji: r.emoji }])
      })
      // Removals can't be filtered by league; the key says which one
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public',
        table: 'league_message_reactions',
      }, (payload) => {
        const r = payload.old as Partial<ReactionRow>
        if (!r.message_id) return
        qc.setQueryData<ReactionRow[]>(['chat-reactions', activeLeagueId], prev =>
          (prev ?? []).filter(x => !(x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji)))
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
    if (e.key === 'Escape' && (replyTo || editing)) { e.preventDefault(); cancelCompose(); return }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Send message ────────────────────────────────────────────
  const sendMessage = async () => {
    const trimmed = text.trim()
    if (!trimmed || !activeLeagueId || !user) return

    // Saving an edit
    if (editing) {
      const target = editing
      setEditing(null)
      setText('')
      if (trimmed === target.message) return
      qc.setQueryData<ChatMessage[]>(['league-chat', activeLeagueId], prev =>
        (prev ?? []).map(m => (m.id === target.id ? { ...m, message: trimmed, edited_at: new Date().toISOString() } : m)))
      const { error } = await supabase.from('league_messages').update({ message: trimmed }).eq('id', target.id)
      if (error) {
        toast.error("Couldn't save the edit: " + error.message)
        qc.invalidateQueries({ queryKey: ['league-chat', activeLeagueId] })
      }
      return
    }

    const answering = replyTo
    setMentionQuery(null)
    setSending(true)
    setText('')
    setReplyTo(null)

    try {
      const { error } = await supabase
        .from('league_messages')
        .insert({
          league_id: activeLeagueId,
          user_id: user.id,
          message: trimmed,
          is_system: false,
          reply_to_id: answering?.id ?? null,
        })
      if (error) throw error
      setAutoScroll(true)

      // ── Tell the person being replied to ────────────────────
      if (answering?.user_id && answering.user_id !== user.id && !answering.is_system) {
        const who = profile?.display_name || profile?.username || 'Someone'
        await supabase.from('notifications').insert({
          user_id: answering.user_id,
          league_id: activeLeagueId,
          type: 'mention',
          title: `${who} replied to you`,
          body: trimmed.length > 60 ? trimmed.slice(0, 57) + '…' : trimmed,
          is_read: false,
          data: { league_id: activeLeagueId },
        })
      }

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
            title: `${senderName} mentioned you`,
            body: trimmed.length > 60 ? trimmed.slice(0, 57) + '…' : trimmed,
            is_read: false,
            data: { league_id: activeLeagueId },
          })
        }
      }
    } catch (e: any) {
      setText(trimmed)
      setReplyTo(answering)
      toast.error("Couldn't send: " + (e?.message ?? e))
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
  const byId = new Map(messages.map(m => [m.id, m]))
  const nameOf = (userId: string) => {
    if (userId === user?.id) return 'You'
    const m = members.find(x => x.user_id === userId)
    return m?.display_name || m?.username || 'Someone'
  }

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
        {grouped.map(({ msg, isFirst }) => {
          const isOwn = msg.user_id === user?.id
          const align: Align = msg.is_system ? 'center' : isOwn ? 'right' : 'left'
          const groups = msg.deleted_at ? [] : (reactionsByMessage.get(msg.id) ?? [])
          const original = msg.reply_to_id ? (byId.get(msg.reply_to_id) ?? 'missing') : null
          // Cards (week final, trades) aren't tappable bubbles — they get a react button
          const isCard = msg.is_system && (PICKEM_WEEK_FINAL_PATTERN.test(msg.message) || msg.message.startsWith('TRADE_COMPLETED:'))
          return (
            <div
              key={msg.id}
              id={`chat-msg-${msg.id}`}
              className={clsx('rounded-xl transition-colors duration-700', flashId === msg.id && 'bg-gold/10')}
            >
              <MessageBubble
                msg={msg}
                isOwn={isOwn}
                showAvatar={isFirst || !!original}
                myUsername={myUsername}
                myAvatarUrl={myAvatarUrl}
                onMentionClick={setProfileUsername}
                isNew={msg.id === justArrivedMsgId}
                replyTo={original}
                onJump={jumpTo}
                onOpenMenu={() => setMenuFor(id => (id === msg.id ? null : msg.id))}
              />
              {(groups.length > 0 || isCard) && (
                <div className={clsx('flex items-center gap-1', isCard && groups.length === 0 && 'justify-center')}>
                  <div className="flex-1">
                    <ReactionChips groups={groups} align={align} onToggle={e => toggleReaction(msg.id, e)} nameOf={nameOf} />
                  </div>
                </div>
              )}
              {isCard && menuFor !== msg.id && (
                <div className="flex justify-center -mt-0.5">
                  <button
                    onClick={() => setMenuFor(msg.id)}
                    className="inline-flex items-center gap-1 text-[11px] text-field-500 hover:text-gold px-2 py-1 rounded-full hover:bg-field-800 transition-colors"
                  >
                    <SmilePlus className="w-3.5 h-3.5" /> React
                  </button>
                </div>
              )}
              {menuFor === msg.id && (
                <MessageMenu
                  msg={msg}
                  isOwn={isOwn}
                  align={align}
                  myReactions={new Set(groups.filter(g => g.mine).map(g => g.emoji))}
                  onReact={e => { toggleReaction(msg.id, e); setMenuFor(null) }}
                  onReply={() => startReply(msg)}
                  onEdit={() => startEdit(msg)}
                  onDelete={() => deleteMessage(msg)}
                  onClose={closeMenu}
                />
              )}
            </div>
          )
        })}
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

          {/* Replying to / editing */}
          {(replyTo || editing) && (
            <div className="chat-compose-bar flex items-center gap-2 mb-1.5 px-3 py-1.5 rounded-xl bg-field-800 border border-field-700 border-l-2 border-l-gold">
              {editing ? <Pencil className="w-3.5 h-3.5 text-gold shrink-0" /> : <CornerUpLeft className="w-3.5 h-3.5 text-gold shrink-0" />}
              <div className="min-w-0 flex-1 text-xs leading-snug">
                <span className="font-bold text-gold">
                  {editing ? 'Editing your message' : `Replying to ${replyTo!.user_id === user?.id ? 'yourself' : senderName(replyTo)}`}
                </span>
                {replyTo && <span className="block text-field-400 truncate">{snippet(replyTo)}</span>}
              </div>
              <button onClick={cancelCompose} aria-label="Cancel" className="p-1 text-field-400 hover:text-white shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
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
              placeholder={editing ? "Edit your message…" : replyTo ? "Write a reply…" : "Message the league… (type @ to mention)"}
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
          <span className="text-xs text-field-600">{editing ? "Enter to save · Esc to cancel" : "Enter to send · @ to mention · tap a message to react or reply"}</span>
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
