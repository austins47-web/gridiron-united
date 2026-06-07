import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import type { Profile } from '@/types/database'
import {
  Users, MessageCircle, Search, UserPlus, UserCheck, UserX,
  Send, ChevronRight, ChevronUp, Shield, Trophy, ArrowLeft, Clock,
  CheckCheck
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

// ── Types ──────────────────────────────────────────────────────────────
interface Friendship {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'declined' | 'blocked'
  created_at: string
  friend?: Profile
}

interface DirectMessage {
  id: string
  sender_id: string
  receiver_id: string
  body: string
  is_read: boolean
  created_at: string
  sender?: Profile
}

interface FriendLeague {
  id: string
  name: string
  scoring_type: string
  draft_status: string
  team_name: string
  wins: number
  losses: number
  points_for: number
  is_commissioner: boolean
}

interface FriendRosterEntry {
  slot: string
  player: {
    id: number
    name: string
    pos: string
    team: string
    league: string
    avg_pts: number
    proj_pts: number
    status: string
    is_rookie: boolean
  }
}

type SocialView = 'friends' | 'requests' | 'messages' | 'profile' | 'conversation'

// ── Main Component ─────────────────────────────────────────────────────
export function SocialHub() {
  const { user, profile } = useAppStore()
  const [view, setView] = useState<SocialView>('friends')
  const [selectedFriend, setSelectedFriend] = useState<Profile | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<Profile | null>(null)
  const qc = useQueryClient()

  // Friends list (accepted)
  const { data: friends = [] } = useQuery({
    queryKey: ['friends', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('friendships')
        .select('*, friend_requester:profiles!friendships_requester_id_fkey(*), friend_addressee:profiles!friendships_addressee_id_fkey(*)')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user!.id},addressee_id.eq.${user!.id}`)
      if (error) return []
      return (data ?? []).map(f => ({
        ...f,
        friend: f.requester_id === user!.id ? f.friend_addressee : f.friend_requester,
      })) as Friendship[]
    },
  })

  // Pending requests (incoming)
  const { data: incomingRequests = [] } = useQuery({
    queryKey: ['friend-requests-in', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('friendships')
        .select('*, requester:profiles!friendships_requester_id_fkey(*)')
        .eq('addressee_id', user!.id)
        .eq('status', 'pending')
      if (error) return []
      return (data ?? []).map(f => ({ ...f, friend: f.requester })) as Friendship[]
    },
  })

  // Outgoing pending requests
  const { data: outgoingRequests = [] } = useQuery({
    queryKey: ['friend-requests-out', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('friendships')
        .select('*, addressee:profiles!friendships_addressee_id_fkey(*)')
        .eq('requester_id', user!.id)
        .eq('status', 'pending')
      return (data ?? []).map(f => ({ ...f, friend: f.addressee })) as Friendship[]
    },
  })

  // Unread DM count per friend
  const { data: unreadCounts = {} } = useQuery({
    queryKey: ['dm-unread', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('direct_messages')
        .select('sender_id')
        .eq('receiver_id', user!.id)
        .eq('is_read', false)
      const counts: Record<string, number> = {}
      data?.forEach(m => { counts[m.sender_id] = (counts[m.sender_id] ?? 0) + 1 })
      return counts
    },
  })

  // Realtime: incoming messages & friend requests
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`social:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `receiver_id=eq.${user.id}` }, () => {
        qc.invalidateQueries({ queryKey: ['dm-unread', user.id] })
        qc.invalidateQueries({ queryKey: ['conversation'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
        qc.invalidateQueries({ queryKey: ['friends', user.id] })
        qc.invalidateQueries({ queryKey: ['friend-requests-in', user.id] })
        qc.invalidateQueries({ queryKey: ['friend-requests-out', user.id] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)
  const pendingCount = incomingRequests.length

  // Sub-views
  if (view === 'profile' && selectedFriend) {
    return <FriendProfile
      friend={selectedFriend}
      onBack={() => { setView('friends'); setSelectedFriend(null) }}
      onMessage={() => { setSelectedConversation(selectedFriend); setView('conversation') }}
    />
  }
  if (view === 'conversation' && selectedConversation) {
    return <Conversation
      friend={selectedConversation}
      onBack={() => setView('messages')}
    />
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Users className="w-6 h-6 text-gold" />
        <div>
          <h1 className="section-title">Social</h1>
          <p className="text-field-400 text-sm">Friends, messages, and league connections</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-field-700">
        {[
          { id: 'friends' as SocialView, label: 'Friends', count: friends.length },
          { id: 'requests' as SocialView, label: 'Requests', count: pendingCount },
          { id: 'messages' as SocialView, label: 'Messages', count: totalUnread },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors',
              view === tab.id ? 'border-gold text-gold' : 'border-transparent text-field-400 hover:text-white',
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={clsx(
                'text-xs px-1.5 py-0.5 rounded-full font-black',
                tab.id === 'requests' ? 'bg-red-500 text-white' :
                tab.id === 'messages' ? 'bg-gold text-field-950' :
                'bg-field-700 text-field-300',
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Friends tab */}
      {view === 'friends' && (
        <FriendsTab
          friends={friends}
          outgoingRequests={outgoingRequests}
          unreadCounts={unreadCounts}
          onViewProfile={(f) => { setSelectedFriend(f); setView('profile') }}
          onMessage={(f) => { setSelectedConversation(f); setView('conversation') }}
        />
      )}

      {/* Requests tab */}
      {view === 'requests' && (
        <RequestsTab
          incoming={incomingRequests}
          outgoing={outgoingRequests}
        />
      )}

      {/* Messages tab */}
      {view === 'messages' && (
        <MessagesTab
          friends={friends}
          unreadCounts={unreadCounts}
          onOpen={(f) => { setSelectedConversation(f); setView('conversation') }}
        />
      )}
    </div>
  )
}

// ── Friends Tab ────────────────────────────────────────────────────────
function FriendsTab({ friends, outgoingRequests, unreadCounts, onViewProfile, onMessage }: {
  friends: Friendship[]
  outgoingRequests: Friendship[]
  unreadCounts: Record<string, number>
  onViewProfile: (f: Profile) => void
  onMessage: (f: Profile) => void
}) {
  const { user } = useAppStore()
  const qc = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [searching, setSearching] = useState(false)

  const pendingIds = new Set(outgoingRequests.map(r => r.addressee_id))
  const friendIds = new Set(friends.map(f => f.friend?.id).filter(Boolean))

  const searchUsers = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return }
    setSearching(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .neq('id', user!.id)
      .limit(8)
    setSearchResults(data ?? [])
    setSearching(false)
  }, [user?.id])

  const sendRequest = useMutation({
    mutationFn: async (addresseeId: string) => {
      const { error } = await supabase
        .from('friendships')
        .insert({ requester_id: user!.id, addressee_id: addresseeId, status: 'pending' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friend-requests-out', user?.id] })
      toast.success('Friend request sent!')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const removeFriend = useMutation({
    mutationFn: async (friendshipId: string) => {
      const { error } = await supabase.from('friendships').delete().eq('id', friendshipId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friends', user?.id] })
      toast.success('Friend removed')
    },
    onError: (e: any) => toast.error(e.message),
  })

  return (
    <div className="space-y-4">
      {/* Search to add */}
      <div className="panel space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <UserPlus className="w-4 h-4 text-gold" />
          <span className="font-bold text-white">Find Friends</span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-field-400" />
          <input
            className="input pl-9"
            placeholder="Search by username or display name…"
            onChange={e => { setSearchQuery(e.target.value); searchUsers(e.target.value) }}
          />
        </div>

        {searchResults.length > 0 && (
          <div className="space-y-1">
            {searchResults.map(p => {
              const isFriend = friendIds.has(p.id)
              const isPending = pendingIds.has(p.id)
              return (
                <div key={p.id} className="flex items-center gap-3 p-2.5 bg-field-800/50 rounded-lg">
                  <Avatar profile={p} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-bold text-sm truncate">{p.display_name || p.username}</div>
                    <div className="text-field-400 text-xs">@{p.username}</div>
                  </div>
                  {isFriend ? (
                    <span className="text-xs text-green-400 font-bold flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5" /> Friends
                    </span>
                  ) : isPending ? (
                    <span className="text-xs text-field-400 font-bold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Pending
                    </span>
                  ) : (
                    <button
                      className="btn-gold !py-1 !px-3 text-xs"
                      onClick={() => sendRequest.mutate(p.id)}
                      disabled={sendRequest.isPending}
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Add
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {searching && <p className="text-field-400 text-sm text-center py-2">Searching…</p>}
      </div>

      {/* Friends list */}
      {friends.length === 0 ? (
        <div className="panel text-center py-10">
          <Users className="w-10 h-10 text-gold/30 mx-auto mb-3" />
          <p className="text-white font-bold mb-1">No friends yet</p>
          <p className="text-field-400 text-sm">Search above to find and add friends.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-field-400 uppercase tracking-wider">
            Your Friends ({friends.length})
          </h3>
          {friends.map(f => {
            if (!f.friend) return null
            const unread = unreadCounts[f.friend.id] ?? 0
            return (
              <div key={f.id} className="panel flex items-center gap-3 hover:border-gold/20 border border-transparent transition-colors">
                <button className="flex-1 flex items-center gap-3 text-left min-w-0" onClick={() => onViewProfile(f.friend!)}>
                  <Avatar profile={f.friend} size="md" />
                  <div className="min-w-0">
                    <div className="text-white font-bold truncate">{f.friend.display_name || f.friend.username}</div>
                    <div className="text-field-400 text-xs">@{f.friend.username}</div>
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    className="relative btn-ghost !py-1.5 !px-2"
                    onClick={() => onMessage(f.friend!)}
                    title="Send message"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {unread > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-gold text-field-950 text-[10px] font-black rounded-full flex items-center justify-center">
                        {unread}
                      </span>
                    )}
                  </button>
                  <button
                    className="btn-ghost !py-1.5 !px-2"
                    onClick={() => onViewProfile(f.friend!)}
                    title="View profile"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    className="btn-ghost !py-1.5 !px-2 text-red-400 hover:text-red-300"
                    onClick={() => removeFriend.mutate(f.id)}
                    title="Remove friend"
                  >
                    <UserX className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Requests Tab ───────────────────────────────────────────────────────
function RequestsTab({ incoming, outgoing }: { incoming: Friendship[]; outgoing: Friendship[] }) {
  const { user } = useAppStore()
  const qc = useQueryClient()

  const respond = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'accepted' | 'declined' }) => {
      const { error } = await supabase.from('friendships').update({ status }).eq('id', id)
      if (error) throw error
      return status
    },
    onSuccess: (status) => {
      qc.invalidateQueries({ queryKey: ['friends', user?.id] })
      qc.invalidateQueries({ queryKey: ['friend-requests-in', user?.id] })
      toast.success(status === 'accepted' ? 'Friend request accepted!' : 'Request declined')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const cancelRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('friendships').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friend-requests-out', user?.id] })
      toast.success('Request cancelled')
    },
  })

  return (
    <div className="space-y-5">
      {/* Incoming */}
      <div>
        <h3 className="text-xs font-bold text-field-400 uppercase tracking-wider mb-3">
          Incoming Requests ({incoming.length})
        </h3>
        {incoming.length === 0 ? (
          <div className="panel text-center py-6 text-field-400 text-sm">No pending requests</div>
        ) : (
          <div className="space-y-2">
            {incoming.map(f => f.friend && (
              <div key={f.id} className="panel flex items-center gap-3">
                <Avatar profile={f.friend} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold">{f.friend.display_name || f.friend.username}</div>
                  <div className="text-field-400 text-xs">@{f.friend.username} · wants to be friends</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    className="btn-ghost !py-1.5 !px-3 text-red-400 border border-red-400/30 text-sm"
                    onClick={() => respond.mutate({ id: f.id, status: 'declined' })}
                    disabled={respond.isPending}
                  >
                    <UserX className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="btn-gold !py-1.5 !px-3 text-sm"
                    onClick={() => respond.mutate({ id: f.id, status: 'accepted' })}
                    disabled={respond.isPending}
                  >
                    <UserCheck className="w-3.5 h-3.5" /> Accept
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outgoing */}
      {outgoing.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-field-400 uppercase tracking-wider mb-3">
            Sent Requests ({outgoing.length})
          </h3>
          <div className="space-y-2">
            {outgoing.map(f => f.friend && (
              <div key={f.id} className="panel flex items-center gap-3">
                <Avatar profile={f.friend} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold">{f.friend.display_name || f.friend.username}</div>
                  <div className="text-field-400 text-xs">@{f.friend.username} · awaiting response</div>
                </div>
                <button
                  className="btn-ghost !py-1 !px-2 text-xs text-field-400"
                  onClick={() => cancelRequest.mutate(f.id)}
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Messages Tab ───────────────────────────────────────────────────────
function MessagesTab({ friends, unreadCounts, onOpen }: {
  friends: Friendship[]
  unreadCounts: Record<string, number>
  onOpen: (f: Profile) => void
}) {
  const { user } = useAppStore()

  // Get most recent message per friend conversation
  const { data: previews = {} } = useQuery({
    queryKey: ['dm-previews', user?.id],
    enabled: friends.length > 0,
    queryFn: async () => {
      const friendIds = friends.map(f => f.friend?.id).filter(Boolean) as string[]
      if (!friendIds.length) return {}
      const result: Record<string, DirectMessage> = {}
      for (const fid of friendIds) {
        const { data } = await supabase
          .from('direct_messages')
          .select('*')
          .or(`and(sender_id.eq.${user!.id},receiver_id.eq.${fid}),and(sender_id.eq.${fid},receiver_id.eq.${user!.id})`)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        if (data) result[fid] = data as DirectMessage
      }
      return result
    },
  })

  // Sort friends: unread first, then by most recent message
  const sorted = [...friends].sort((a, b) => {
    const ua = unreadCounts[a.friend?.id ?? ''] ?? 0
    const ub = unreadCounts[b.friend?.id ?? ''] ?? 0
    if (ua !== ub) return ub - ua
    const ta = previews[a.friend?.id ?? '']?.created_at ?? ''
    const tb = previews[b.friend?.id ?? '']?.created_at ?? ''
    return tb.localeCompare(ta)
  })

  if (friends.length === 0) {
    return (
      <div className="panel text-center py-10">
        <MessageCircle className="w-10 h-10 text-gold/30 mx-auto mb-3" />
        <p className="text-white font-bold mb-1">No conversations yet</p>
        <p className="text-field-400 text-sm">Add friends to start messaging.</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {sorted.map(f => {
        if (!f.friend) return null
        const unread = unreadCounts[f.friend.id] ?? 0
        const preview = previews[f.friend.id]
        const isOwnMessage = preview?.sender_id === user?.id
        return (
          <button
            key={f.id}
            className="panel w-full flex items-center gap-3 text-left hover:border-gold/20 border border-transparent transition-colors"
            onClick={() => onOpen(f.friend!)}
          >
            <div className="relative shrink-0">
              <Avatar profile={f.friend} size="md" />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-gold text-field-950 text-[10px] font-black rounded-full flex items-center justify-center">
                  {unread}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={clsx('font-bold text-sm truncate', unread > 0 ? 'text-white' : 'text-field-300')}>
                  {f.friend.display_name || f.friend.username}
                </span>
                {preview && (
                  <span className="text-field-500 text-xs shrink-0 ml-2">
                    {timeAgo(preview.created_at)}
                  </span>
                )}
              </div>
              <div className={clsx('text-xs truncate mt-0.5', unread > 0 ? 'text-white' : 'text-field-400')}>
                {preview
                  ? `${isOwnMessage ? 'You: ' : ''}${preview.body}`
                  : 'Start a conversation'}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-field-600 shrink-0" />
          </button>
        )
      })}
    </div>
  )
}

// ── Conversation (DM thread) ───────────────────────────────────────────
function Conversation({ friend, onBack }: { friend: Profile; onBack: () => void }) {
  const { user } = useAppStore()
  const qc = useQueryClient()
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data: messages = [] } = useQuery({
    queryKey: ['conversation', user?.id, friend.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('direct_messages')
        .select('*')
        .or(`and(sender_id.eq.${user!.id},receiver_id.eq.${friend.id}),and(sender_id.eq.${friend.id},receiver_id.eq.${user!.id})`)
        .order('created_at', { ascending: true })
      if (error) throw error

      // Mark as read
      await supabase
        .from('direct_messages')
        .update({ is_read: true })
        .eq('sender_id', friend.id)
        .eq('receiver_id', user!.id)
        .eq('is_read', false)

      qc.invalidateQueries({ queryKey: ['dm-unread', user!.id] })
      qc.invalidateQueries({ queryKey: ['dm-previews', user!.id] })
      return (data ?? []) as DirectMessage[]
    },
  })

  // Realtime for this conversation
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`dm:${[user.id, friend.id].sort().join('-')}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'direct_messages',
      }, () => {
        qc.invalidateQueries({ queryKey: ['conversation', user.id, friend.id] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id, friend.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const sendMessage = async () => {
    if (!body.trim() || sending) return
    setSending(true)
    const { error } = await supabase.from('direct_messages').insert({
      sender_id: user!.id,
      receiver_id: friend.id,
      body: body.trim(),
    })
    if (error) toast.error(error.message)
    else {
      setBody('')
      qc.invalidateQueries({ queryKey: ['conversation', user!.id, friend.id] })
      qc.invalidateQueries({ queryKey: ['dm-previews', user!.id] })
    }
    setSending(false)
  }

  // Group messages by date
  const grouped = groupByDate(messages)

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col h-[calc(100vh-160px)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-field-700 shrink-0">
        <button className="btn-ghost !py-1 !px-2" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Avatar profile={friend} size="sm" />
        <div>
          <div className="text-white font-bold">{friend.display_name || friend.username}</div>
          <div className="text-field-400 text-xs">@{friend.username}</div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-1">
        {grouped.map(({ date, msgs }) => (
          <div key={date}>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-field-700" />
              <span className="text-field-500 text-xs">{date}</span>
              <div className="flex-1 h-px bg-field-700" />
            </div>
            {msgs.map((msg, i) => {
              const isOwn = msg.sender_id === user?.id
              const prevMsg = msgs[i - 1]
              const showAvatar = !isOwn && msg.sender_id !== prevMsg?.sender_id
              return (
                <div key={msg.id} className={clsx('flex gap-2 mb-1', isOwn ? 'justify-end' : 'justify-start')}>
                  {!isOwn && (
                    <div className="w-7 shrink-0">
                      {showAvatar && <Avatar profile={friend} size="xs" />}
                    </div>
                  )}
                  <div className={clsx(
                    'max-w-[75%] px-3 py-2 rounded-2xl text-sm',
                    isOwn
                      ? 'bg-gold text-field-950 rounded-br-sm font-medium'
                      : 'bg-field-800 text-white rounded-bl-sm',
                  )}>
                    {msg.body}
                    <div className={clsx('text-xs mt-0.5 flex items-center gap-1 justify-end', isOwn ? 'text-field-700' : 'text-field-500')}>
                      {formatTime(msg.created_at)}
                      {isOwn && <CheckCheck className="w-3 h-3" />}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        {messages.length === 0 && (
          <div className="text-center text-field-400 text-sm py-8">
            Start a conversation with {friend.display_name || friend.username}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 pt-3 border-t border-field-700 shrink-0">
        <input
          className="input flex-1"
          placeholder="Type a message…"
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          maxLength={2000}
        />
        <button
          className="btn-gold !px-3"
          onClick={sendMessage}
          disabled={!body.trim() || sending}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── Friend Profile ─────────────────────────────────────────────────────
function FriendProfile({ friend, onBack, onMessage }: {
  friend: Profile
  onBack: () => void
  onMessage: () => void
}) {
  const { user } = useAppStore()
  const [rosterLeagueId, setRosterLeagueId] = useState<string | null>(null)
  const [expandedLeague, setExpandedLeague] = useState<string | null>(null)

  // Friend's leagues
  const { data: friendLeagues = [] } = useQuery({
    queryKey: ['friend-leagues', friend.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('league_members')
        .select('*, league:leagues(id, name, scoring_type, draft_status, num_teams)')
        .eq('user_id', friend.id)
      return (data ?? []).map(m => ({
        id: (m.league as any)?.id,
        name: (m.league as any)?.name,
        scoring_type: (m.league as any)?.scoring_type,
        draft_status: (m.league as any)?.draft_status,
        team_name: m.team_name,
        wins: m.wins,
        losses: m.losses,
        points_for: m.points_for,
        is_commissioner: m.is_commissioner,
      })) as FriendLeague[]
    },
  })

  // Friend's roster in a specific league
  const { data: friendRoster = [] } = useQuery({
    queryKey: ['friend-roster', friend.id, expandedLeague],
    enabled: !!expandedLeague,
    queryFn: async () => {
      const { data } = await supabase
        .from('rosters')
        .select('slot, player:players(id, name, pos, team, league, avg_pts, proj_pts, status, is_rookie)')
        .eq('user_id', friend.id)
        .eq('league_id', expandedLeague!)
        .eq('week', 0)
        .order('slot')
      return (data ?? []) as FriendRosterEntry[]
    },
  })

  // Shared leagues (leagues both users are in)
  const { data: myLeagues = [] } = useQuery({
    queryKey: ['my-league-ids', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('league_members')
        .select('league_id')
        .eq('user_id', user!.id)
      return new Set((data ?? []).map(m => m.league_id))
    },
  })

  const sharedLeagues = friendLeagues.filter(l => myLeagues.has(l.id))

  const starters = friendRoster.filter(r => !r.slot.startsWith('BN') && !r.slot.startsWith('IR'))
  const bench = friendRoster.filter(r => r.slot.startsWith('BN'))
  const ir = friendRoster.filter(r => r.slot.startsWith('IR'))
  const projTotal = starters.reduce((s, r) => s + (r.player?.proj_pts ?? 0), 0)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Back */}
      <div className="flex items-center gap-3">
        <button className="btn-ghost !py-1 !px-2" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-field-400 text-sm">Back to friends</span>
      </div>

      {/* Profile card */}
      <div className="panel">
        <div className="flex items-center gap-4">
          <Avatar profile={friend} size="xl" />
          <div className="flex-1 min-w-0">
            <div className="text-white font-black text-xl">{friend.display_name || friend.username}</div>
            <div className="text-field-400 text-sm">@{friend.username}</div>
            {friend.bio && <p className="text-field-300 text-sm mt-1">{friend.bio}</p>}
            <div className="flex gap-3 mt-2 flex-wrap">
              {friend.favorite_nfl_team && (
                <span className="text-xs bg-nfl/10 text-nfl px-2 py-0.5 rounded font-bold">
                  🏈 {friend.favorite_nfl_team}
                </span>
              )}
              {friend.favorite_cfb_team && (
                <span className="text-xs bg-cfb/10 text-cfb px-2 py-0.5 rounded font-bold">
                  🎓 {friend.favorite_cfb_team}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button className="btn-gold flex-1" onClick={onMessage}>
            <MessageCircle className="w-4 h-4" /> Message
          </button>
        </div>
      </div>

      {/* Shared leagues callout */}
      {sharedLeagues.length > 0 && (
        <div className="bg-gold/5 border border-gold/20 rounded-lg p-3">
          <div className="flex items-center gap-2 text-gold text-sm font-bold mb-1">
            <Trophy className="w-4 h-4" /> You share {sharedLeagues.length} league{sharedLeagues.length > 1 ? 's' : ''}
          </div>
          <div className="flex flex-wrap gap-1">
            {sharedLeagues.map(l => (
              <span key={l.id} className="text-xs bg-gold/10 text-gold px-2 py-0.5 rounded">{l.name}</span>
            ))}
          </div>
        </div>
      )}

      {/* Friend's leagues */}
      <div>
        <h3 className="section-title text-sm mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-gold" /> Leagues ({friendLeagues.length})
        </h3>
        {friendLeagues.length === 0 ? (
          <div className="panel text-center py-4 text-field-400 text-sm">Not in any leagues yet</div>
        ) : (
          <div className="space-y-2">
            {friendLeagues.map(league => (
              <div key={league.id} className="panel !p-0 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-field-800/50 transition-colors"
                  onClick={() => setExpandedLeague(expandedLeague === league.id ? null : league.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-field-700 flex items-center justify-center font-black text-gold shrink-0">
                      {league.name[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold text-sm truncate">{league.name}</span>
                        {league.is_commissioner && <Shield className="w-3.5 h-3.5 text-gold shrink-0" title="Commissioner" />}
                      </div>
                      <div className="text-field-400 text-xs flex gap-2 mt-0.5">
                        <span>{league.team_name}</span>
                        <span>·</span>
                        <span className="font-bold text-white">{league.wins}-{league.losses}</span>
                        <span>·</span>
                        <span className="uppercase">{league.scoring_type?.replace('_', '-')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={clsx(
                      'text-xs font-bold px-1.5 py-0.5 rounded uppercase',
                      league.draft_status === 'completed' ? 'bg-green-400/10 text-green-400' :
                      league.draft_status === 'in_progress' ? 'bg-gold/20 text-gold' :
                      'bg-field-700 text-field-400',
                    )}>
                      {league.draft_status?.replace('_', ' ')}
                    </span>
                    {expandedLeague === league.id
                      ? <ChevronUp className="w-4 h-4 text-field-400" />
                      : <ChevronRight className="w-4 h-4 text-field-400" />
                    }
                  </div>
                </button>

                {/* Expanded roster */}
                {expandedLeague === league.id && (
                  <div className="border-t border-field-700 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-field-400 uppercase tracking-wider">
                        {league.team_name}'s Roster
                      </span>
                      <span className="text-xs text-field-400">
                        Proj: <span className="text-white font-bold">{projTotal.toFixed(1)}</span>
                      </span>
                    </div>

                    {friendRoster.length === 0 ? (
                      <p className="text-field-400 text-sm text-center py-3">Empty roster</p>
                    ) : (
                      <div className="space-y-2">
                        {/* Starters */}
                        {starters.length > 0 && (
                          <div>
                            <div className="text-xs font-bold text-field-500 uppercase tracking-wider mb-1">Starters</div>
                            <div className="space-y-1">
                              {starters.map(r => <RosterRow key={r.slot} entry={r} />)}
                            </div>
                          </div>
                        )}
                        {/* Bench */}
                        {bench.length > 0 && (
                          <div>
                            <div className="text-xs font-bold text-field-500 uppercase tracking-wider mb-1 mt-2">Bench</div>
                            <div className="space-y-1">
                              {bench.map(r => <RosterRow key={r.slot} entry={r} />)}
                            </div>
                          </div>
                        )}
                        {/* IR */}
                        {ir.length > 0 && (
                          <div>
                            <div className="text-xs font-bold text-field-500 uppercase tracking-wider mb-1 mt-2">IR</div>
                            <div className="space-y-1">
                              {ir.map(r => <RosterRow key={r.slot} entry={r} />)}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Roster Row ──────────────────────────────────────────────────────────
function RosterRow({ entry }: { entry: FriendRosterEntry }) {
  const p = entry.player
  if (!p) return null
  return (
    <div className="flex items-center gap-2 text-xs py-1 border-b border-field-800 last:border-0">
      <span className="text-field-500 w-8 text-right shrink-0">{entry.slot}</span>
      <span className={clsx('pos-badge text-xs', `pos-${p.pos}`)}>{p.pos}</span>
      <span className="text-white font-bold flex-1 truncate flex items-center gap-1">
        {p.name}
        {p.is_rookie && (
          <span className="text-[9px] font-black bg-gold text-field-950 px-0.5 rounded leading-none">R</span>
        )}
      </span>
      <span className="text-field-400 truncate hidden sm:block">{p.team}</span>
      <span className={clsx(
        'text-xs font-bold shrink-0',
        p.status === 'questionable' ? 'text-yellow-400' :
        p.status === 'out' || p.status === 'ir' ? 'text-red-400' : 'text-white',
      )}>
        {p.proj_pts?.toFixed(1)}
      </span>
    </div>
  )
}

// ── Avatar Component ───────────────────────────────────────────────────
function Avatar({ profile, size = 'md' }: { profile: Profile; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' }) {
  const dims = { xs: 'w-6 h-6 text-xs', sm: 'w-8 h-8 text-sm', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base', xl: 'w-16 h-16 text-xl' }
  const initials = (profile.display_name || profile.username || '?').slice(0, 2).toUpperCase()
  return profile.avatar_url ? (
    <img src={profile.avatar_url} alt={initials} className={clsx(dims[size], 'rounded-full object-cover ring-2 ring-field-700 shrink-0')} />
  ) : (
    <div className={clsx(dims[size], 'rounded-full bg-field-700 ring-2 ring-field-600 flex items-center justify-center font-black text-gold shrink-0')}>
      {initials}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function groupByDate(messages: DirectMessage[]): { date: string; msgs: DirectMessage[] }[] {
  const groups: Record<string, DirectMessage[]> = {}
  messages.forEach(m => {
    const date = new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    if (!groups[date]) groups[date] = []
    groups[date].push(m)
  })
  return Object.entries(groups).map(([date, msgs]) => ({ date, msgs }))
}
