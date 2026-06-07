import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import {
  useLeagueTrades, useProposeTrade, useRespondTrade,
  useCommissionerTrade, useVoteTrade, useTradesRealtime, type TradeWithDetails
} from '@/hooks/useTrades'
import { useMyRoster, useRoster } from '@/hooks/useRoster'
import type { LeagueMember, Player } from '@/types/database'
import {
  ArrowLeftRight, Plus, X, Check, ChevronDown, ChevronUp,
  Clock, AlertCircle, User, Search, Shield, RefreshCw
} from 'lucide-react'
import clsx from 'clsx'

const POS_COLOR: Record<string, string> = {
  QB:  'bg-red-500/20 text-red-300',
  RB:  'bg-emerald-500/20 text-emerald-300',
  WR:  'bg-blue-500/20 text-blue-300',
  TE:  'bg-orange-500/20 text-orange-300',
  K:   'bg-purple-500/20 text-purple-300',
  DST: 'bg-yellow-500/20 text-yellow-300',
}

function PosBadge({ pos }: { pos: string }) {
  return (
    <span className={clsx('text-xs font-black uppercase rounded px-1.5 py-0.5 shrink-0',
      POS_COLOR[pos] ?? 'bg-field-700 text-field-300')}>
      {pos}
    </span>
  )
}

function PlayerRow({ player, selected, onToggle, disabled }: {
  player: Player; selected: boolean; onToggle?: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onToggle} disabled={disabled}
      className={clsx(
        'flex items-center gap-2 px-3 py-2 rounded-lg border text-left w-full transition-all',
        selected ? 'bg-gold/15 border-gold/50 ring-1 ring-gold/30'
                 : 'bg-field-800 border-field-700 hover:border-field-500',
        disabled && 'opacity-50 cursor-default pointer-events-none',
      )}>
      <PosBadge pos={player.pos} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white truncate">{player.name}</div>
        <div className="text-xs text-field-400">{player.team}</div>
      </div>
      {selected && <Check className="w-3.5 h-3.5 text-gold shrink-0" />}
    </button>
  )
}

type TStatus = TradeWithDetails['status']

function StatusBadge({ status }: { status: TStatus }) {
  const map: Record<TStatus, { label: string; cls: string }> = {
    pending:   { label: 'Pending',  cls: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
    accepted:  { label: 'Accepted', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    rejected:  { label: 'Rejected', cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
    countered: { label: 'Countered',cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    expired:   { label: 'Expired',  cls: 'bg-field-600/20 text-field-400 border-field-600/30' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-field-700 text-field-300 border-field-600' }
  return <span className={clsx('text-xs font-black uppercase px-2 py-0.5 rounded-full border', cls)}>{label}</span>
}

function timeLeft(exp: string) {
  const ms = new Date(exp).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const h = Math.floor(ms / 3600000)
  if (h >= 24) return `${Math.floor(h / 24)}d left`
  return `${h}h left`
}

// ── Single trade card ────────────────────────────────────────
function TradeCard({ trade, myId, isCommissioner, leagueId }: {
  trade: TradeWithDetails; myId: string; isCommissioner: boolean; leagueId: string
}) {
  const [open, setOpen] = useState(false)
  const [countering, setCountering] = useState(false)
  const [cMine, setCMine]   = useState<number[]>([])
  const [cTheirs, setCTheirs] = useState<number[]>([])

  const respond     = useRespondTrade(leagueId)
  const commTrade   = useCommissionerTrade(leagueId)
  const voteTrade   = useVoteTrade(leagueId)
  const { activeLeague } = useAppStore()
  const tradeMode   = activeLeague?.trade_mode ?? 'instant'

  const isProposer = trade.proposer_id === myId
  const isReceiver = trade.receiver_id === myId
  const isPending  = trade.status === 'pending'
  const isExpired  = new Date(trade.expires_at) < new Date()

  const other     = isProposer ? trade.receiver   : trade.proposer
  const otherName = other?.display_name || other?.username || 'Unknown'
  const iGive     = isProposer ? trade.proposer_players  : trade.receiver_players
  const iReceive  = isProposer ? trade.receiver_players  : trade.proposer_players
  const theirId   = isProposer ? trade.receiver_id : trade.proposer_id

  const myRoster    = useMyRoster(leagueId)
  const theirRoster = useRoster(leagueId, countering ? theirId : null)

  const toggleC   = (set: (fn: (a: number[]) => number[]) => void, id: number) =>
    set(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id])

  return (
    <div className={clsx('border rounded-xl overflow-hidden',
      isPending && !isExpired ? 'bg-field-800 border-field-700' : 'bg-field-800/40 border-field-700/40')}>

      {/* Summary row */}
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(o => !o)}>
        <ArrowLeftRight className="w-4 h-4 text-gold shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white text-sm">
              {isProposer ? `You → ${otherName}` : `${otherName} → You`}
            </span>
            <StatusBadge status={trade.status} />
          </div>
          <div className="text-xs text-field-400 mt-0.5">
            {iGive.length} for {iReceive.length}
            {isPending && !isExpired ? ` · ${timeLeft(trade.expires_at)}` : isExpired && isPending ? ' · Expired' : ''}
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-field-500" /> : <ChevronDown className="w-4 h-4 text-field-500" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-field-700/50 space-y-4">

          {/* Player columns */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-field-400 font-bold uppercase tracking-wider mb-1.5">
                {isProposer ? 'You give' : `${otherName} gives`}
              </div>
              {iGive.length === 0
                ? <p className="text-field-600 text-xs italic">Nothing</p>
                : iGive.map(p => <PlayerRow key={p.id} player={p} selected={false} disabled />)
              }
            </div>
            <div>
              <div className="text-xs text-field-400 font-bold uppercase tracking-wider mb-1.5">
                {isProposer ? `${otherName} gives` : 'You give'}
              </div>
              {iReceive.length === 0
                ? <p className="text-field-600 text-xs italic">Nothing</p>
                : iReceive.map(p => <PlayerRow key={p.id} player={p} selected={false} disabled />)
              }
            </div>
          </div>

          {/* Message */}
          {trade.message && (
            <p className="text-sm text-field-300 italic bg-field-900/60 rounded-lg px-3 py-2">
              "{trade.message}"
            </p>
          )}

          {/* Counter builder */}
          {countering && (
            <div className="bg-field-900 border border-gold/20 rounded-xl p-3 space-y-3">
              <p className="text-sm font-bold text-white">Counter Offer</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-field-400 mb-1">You offer</p>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {(myRoster.data ?? []).map(r => (
                      <PlayerRow key={r.id} player={r.player}
                        selected={cMine.includes(r.player_id)}
                        onToggle={() => toggleC(setCMine, r.player_id)} />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-field-400 mb-1">You want</p>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {(theirRoster.data ?? []).map(r => (
                      <PlayerRow key={r.id} player={r.player}
                        selected={cTheirs.includes(r.player_id)}
                        onToggle={() => toggleC(setCTheirs, r.player_id)} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-gold flex-1 text-sm"
                  disabled={cMine.length === 0 && cTheirs.length === 0}
                  onClick={() => {
                    respond.mutate({ tradeId: trade.id, action: 'countered',
                      counterProposerIds: cMine, counterReceiverIds: cTheirs })
                    setCountering(false)
                  }}>
                  Send Counter
                </button>
                <button className="btn-ghost !px-3" onClick={() => setCountering(false)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Actions — pending & not expired */}
          {isPending && !isExpired && !countering && (
            <div className="flex gap-2 flex-wrap">
              {isReceiver && <>
                <button className="btn-gold text-sm flex items-center gap-1.5"
                  disabled={respond.isPending}
                  onClick={() => respond.mutate({ tradeId: trade.id, action: 'accepted' })}>
                  <Check className="w-3.5 h-3.5" /> Accept
                </button>
                <button className="btn-ghost text-sm flex items-center gap-1.5 !border-blue-500/40 !text-blue-300 hover:!bg-blue-500/10"
                  onClick={() => setCountering(true)}>
                  <RefreshCw className="w-3.5 h-3.5" /> Counter
                </button>
                <button className="btn-ghost text-sm flex items-center gap-1.5 !border-red-500/30 !text-red-400 hover:!bg-red-500/10"
                  disabled={respond.isPending}
                  onClick={() => respond.mutate({ tradeId: trade.id, action: 'rejected' })}>
                  <X className="w-3.5 h-3.5" /> Decline
                </button>
              </>}
              {isProposer && (
                <button className="btn-ghost text-sm flex items-center gap-1.5 !border-red-500/30 !text-red-400 hover:!bg-red-500/10"
                  disabled={respond.isPending}
                  onClick={() => respond.mutate({ tradeId: trade.id, action: 'rejected' })}>
                  <X className="w-3.5 h-3.5" /> Withdraw
                </button>
              )}
            </div>
          )}

          {/* Commissioner review queue */}
          {trade.status === 'countered' && tradeMode === 'commissioner_review' && (
            <div className="space-y-2">
              <p className="text-xs text-yellow-300 font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Awaiting commissioner review
              </p>
              {isCommissioner && (
                <div className="flex gap-2">
                  <button className="btn-gold text-sm flex items-center gap-1.5"
                    disabled={commTrade.isPending}
                    onClick={() => commTrade.mutate({ tradeId: trade.id, decision: 'approve' })}>
                    <Check className="w-3.5 h-3.5" /> Approve Trade
                  </button>
                  <button className="btn-ghost text-sm flex items-center gap-1.5 !border-red-500/30 !text-red-400 hover:!bg-red-500/10"
                    disabled={commTrade.isPending}
                    onClick={() => commTrade.mutate({ tradeId: trade.id, decision: 'veto' })}>
                    <Shield className="w-3.5 h-3.5" /> Veto
                  </button>
                </div>
              )}
            </div>
          )}

          {/* League vote mode */}
          {trade.status === 'countered' && tradeMode === 'league_vote' && (() => {
            const votes = trade.votes ?? []
            const vetoCount    = votes.filter(v => v.vote === 'veto').length
            const approveCount = votes.filter(v => v.vote === 'approve').length
            const myVote       = votes.find(v => v.user_id === useAppStore.getState().user?.id)
            const required     = activeLeague?.trade_votes_required ?? 4
            const notInvolved  = !isProposer && !isReceiver
            return (
              <div className="space-y-2">
                <p className="text-xs text-blue-300 font-bold flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  League vote — {vetoCount}/{required} vetoes to block · {approveCount} approvals
                </p>
                {/* Vote progress bar */}
                <div className="h-1.5 bg-field-700 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (vetoCount / required) * 100)}%` }} />
                </div>
                {notInvolved && (
                  <div className="flex gap-2">
                    <button
                      className={clsx('text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold transition-colors',
                        myVote?.vote === 'approve'
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'btn-ghost !border-emerald-500/30 !text-emerald-400 hover:!bg-emerald-500/10')}
                      onClick={() => voteTrade.mutate({ tradeId: trade.id, vote: 'approve' })}>
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      className={clsx('text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold transition-colors',
                        myVote?.vote === 'veto'
                          ? 'bg-red-500/20 border-red-500/40 text-red-300'
                          : 'btn-ghost !border-red-500/30 !text-red-400 hover:!bg-red-500/10')}
                      onClick={() => voteTrade.mutate({ tradeId: trade.id, vote: 'veto' })}>
                      <Shield className="w-3.5 h-3.5" /> Veto
                    </button>
                  </div>
                )}
                {(isProposer || isReceiver) && !myVote && (
                  <p className="text-xs text-field-500 italic">You're involved — other members vote</p>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ── Propose trade modal ──────────────────────────────────────
function ProposeModal({ leagueId, onClose }: { leagueId: string; onClose: () => void }) {
  const { user } = useAppStore()
  const [step, setStep]         = useState<'team' | 'players'>('team')
  const [target, setTarget]     = useState<LeagueMember | null>(null)
  const [myPicks, setMyPicks]   = useState<number[]>([])
  const [theirPicks, setTheirPicks] = useState<number[]>([])
  const [msg, setMsg]           = useState('')
  const [myQ, setMyQ]           = useState('')
  const [theirQ, setTheirQ]     = useState('')

  const propose    = useProposeTrade(leagueId)
  const myRoster   = useMyRoster(leagueId)
  const theirRoster = useRoster(leagueId, target?.user_id ?? null)

  const { data: members = [] } = useQuery({
    queryKey: ['league-members', leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_members')
        .select('*, profiles(id, username, display_name, avatar_url)')
        .eq('league_id', leagueId)
      if (error) throw error
      return data as LeagueMember[]
    },
  })

  const others = members.filter(m => m.user_id !== user?.id)
  const myFiltered    = (myRoster.data ?? []).filter(r =>
    !myQ || r.player.name.toLowerCase().includes(myQ.toLowerCase()) || r.player.pos.toLowerCase().includes(myQ.toLowerCase()))
  const theirFiltered = (theirRoster.data ?? []).filter(r =>
    !theirQ || r.player.name.toLowerCase().includes(theirQ.toLowerCase()) || r.player.pos.toLowerCase().includes(theirQ.toLowerCase()))

  const toggle = (set: (fn: (a: number[]) => number[]) => void, id: number) =>
    set(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box w-full max-w-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-gold" />
            <h2 className="font-cond font-black text-xl text-white uppercase tracking-wider">
              {step === 'team' ? 'Choose Trade Partner' : 'Select Players'}
            </h2>
          </div>
          <button onClick={onClose} className="text-field-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {step === 'team' ? (
          <div className="space-y-2 overflow-y-auto flex-1">
            {others.length === 0 && (
              <p className="text-field-400 text-sm text-center py-8">No other teams in this league yet.</p>
            )}
            {others.map(m => {
              const p = m.profiles as any
              return (
                <button key={m.id}
                  onClick={() => { setTarget(m); setStep('players') }}
                  className="w-full flex items-center gap-3 bg-field-800 hover:bg-field-700 border border-field-700 hover:border-gold/40 rounded-xl px-4 py-3 transition-all text-left">
                  <div className="w-8 h-8 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center shrink-0">
                    {p?.avatar_url
                      ? <img src={p.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                      : <User className="w-4 h-4 text-gold" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-white text-sm">{p?.display_name || p?.username || m.team_name}</p>
                    <p className="text-xs text-field-400">{m.team_name} · {m.wins}–{m.losses}</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-field-500 -rotate-90" />
                </button>
              )
            })}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <button onClick={() => setStep('team')} className="text-gold text-sm font-bold hover:underline">← Back</button>
              <span className="text-field-500 text-sm">|</span>
              <span className="text-field-300 text-sm">
                With <span className="text-white font-bold">
                  {((target?.profiles as any)?.display_name) || target?.team_name}
                </span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
              {/* My roster */}
              <div className="flex flex-col min-h-0">
                <p className="text-xs font-bold uppercase tracking-wider text-field-400 mb-1.5">
                  You offer {myPicks.length > 0 && <span className="text-gold">({myPicks.length})</span>}
                </p>
                <div className="relative mb-2 shrink-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-field-500" />
                  <input className="input !pl-8 !py-1.5 text-sm" placeholder="Filter…"
                    value={myQ} onChange={e => setMyQ(e.target.value)} />
                </div>
                <div className="flex-1 overflow-y-auto space-y-1">
                  {myFiltered.map(r => (
                    <PlayerRow key={r.id} player={r.player}
                      selected={myPicks.includes(r.player_id)}
                      onToggle={() => toggle(setMyPicks, r.player_id)} />
                  ))}
                </div>
              </div>

              {/* Their roster */}
              <div className="flex flex-col min-h-0">
                <p className="text-xs font-bold uppercase tracking-wider text-field-400 mb-1.5">
                  You receive {theirPicks.length > 0 && <span className="text-gold">({theirPicks.length})</span>}
                </p>
                <div className="relative mb-2 shrink-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-field-500" />
                  <input className="input !pl-8 !py-1.5 text-sm" placeholder="Filter…"
                    value={theirQ} onChange={e => setTheirQ(e.target.value)} />
                </div>
                <div className="flex-1 overflow-y-auto space-y-1">
                  {theirFiltered.length === 0
                    ? <p className="text-field-500 text-xs text-center py-6">No players on their roster</p>
                    : theirFiltered.map(r => (
                      <PlayerRow key={r.id} player={r.player}
                        selected={theirPicks.includes(r.player_id)}
                        onToggle={() => toggle(setTheirPicks, r.player_id)} />
                    ))
                  }
                </div>
              </div>
            </div>

            {/* Summary */}
            {(myPicks.length > 0 || theirPicks.length > 0) && (
              <div className="mt-3 shrink-0 p-2.5 bg-gold/10 border border-gold/20 rounded-lg text-sm text-field-200">
                <span className="text-gold font-bold">{myPicks.length} player{myPicks.length !== 1 ? 's' : ''}</span>
                {' '}for{' '}
                <span className="text-gold font-bold">{theirPicks.length} player{theirPicks.length !== 1 ? 's' : ''}</span>
              </div>
            )}

            <input className="input text-sm mt-3 shrink-0" placeholder="Add a message (optional)…"
              value={msg} onChange={e => setMsg(e.target.value)} maxLength={200} />

            <button className="btn-gold w-full mt-3 shrink-0"
              disabled={propose.isPending || (myPicks.length === 0 && theirPicks.length === 0)}
              onClick={() => {
                if (!target?.user_id) return
                propose.mutate({
                  receiverId: target.user_id,
                  proposerPlayerIds: myPicks,
                  receiverPlayerIds: theirPicks,
                  message: msg || undefined,
                }, { onSuccess: onClose })
              }}>
              {propose.isPending ? 'Sending…' : 'Send Trade Proposal'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main view ────────────────────────────────────────────────
export function TradeCenter() {
  const { activeLeagueId, activeLeague, user, myMembership } = useAppStore()
  const [showPropose, setShowPropose] = useState(false)
  const [filter, setFilter] = useState<'pending' | 'mine' | 'all'>('pending')

  const { data: trades = [], isLoading } = useLeagueTrades(activeLeagueId)
  useTradesRealtime(activeLeagueId)

  const isCommissioner = myMembership?.is_commissioner ?? false
  const pendingIncoming = trades.filter(t => t.status === 'pending' && t.receiver_id === user?.id).length

  const filtered = useMemo(() => {
    if (filter === 'pending') return trades.filter(t => t.status === 'pending')
    if (filter === 'mine')    return trades.filter(t => t.proposer_id === user?.id || t.receiver_id === user?.id)
    return trades
  }, [trades, filter, user?.id])

  if (!activeLeagueId) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <ArrowLeftRight className="w-10 h-10 text-field-600" />
      <p className="text-field-400 text-sm">Select a league to view trades</p>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="section-title">Trade Center</h1>
          <p className="text-field-400 text-sm mt-1">{activeLeague?.name}</p>
        </div>
        <button className="btn-gold flex items-center gap-2" onClick={() => setShowPropose(true)}>
          <Plus className="w-4 h-4" /> Propose Trade
        </button>
      </div>

      {pendingIncoming > 0 && (
        <div className="flex items-center gap-3 bg-gold/10 border border-gold/30 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-gold shrink-0" />
          <span className="text-sm font-bold text-white">
            {pendingIncoming} trade offer{pendingIncoming > 1 ? 's' : ''} waiting for your response
          </span>
          <button onClick={() => setFilter('pending')} className="ml-auto text-gold text-xs font-bold hover:underline">
            Review
          </button>
        </div>
      )}

      <div className="pill-tabs flex gap-1 bg-field-800 border border-field-700 rounded-lg p-0.5">
        {(['pending', 'mine', 'all'] as const).map(f => {
          const label = f === 'pending'
            ? `Pending${trades.filter(t => t.status === 'pending').length > 0 ? ` (${trades.filter(t => t.status === 'pending').length})` : ''}`
            : f === 'mine' ? 'My Trades' : 'All'
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={clsx('flex-1 py-2 text-xs font-cond font-bold uppercase tracking-wider rounded-md transition-colors',
                filter === f ? 'bg-field-700 text-white' : 'text-field-400 hover:text-white')}>
              {label}
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <div className="text-center text-field-400 text-sm py-8">Loading trades…</div>
      ) : filtered.length === 0 ? (
        <div className="panel text-center py-12 space-y-3">
          <ArrowLeftRight className="w-10 h-10 text-field-600 mx-auto" />
          <p className="text-field-400 text-sm">
            {filter === 'pending' ? 'No pending trades' : 'No trades yet'}
          </p>
          <button className="btn-gold mx-auto" onClick={() => setShowPropose(true)}>
            Propose a Trade
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(trade => (
            <TradeCard key={trade.id} trade={trade}
              myId={user?.id ?? ''} isCommissioner={isCommissioner} leagueId={activeLeagueId} />
          ))}
        </div>
      )}

      <div className="panel text-xs text-field-500 space-y-1">
        <p className="font-bold text-field-400 mb-1">Trade Rules
          <span className="ml-2 font-normal text-field-500">·</span>
          <span className={clsx('ml-2 font-black uppercase', {
            'text-emerald-400': activeLeague?.trade_mode === 'instant' || !activeLeague?.trade_mode,
            'text-yellow-400':  activeLeague?.trade_mode === 'commissioner_review',
            'text-blue-400':    activeLeague?.trade_mode === 'league_vote',
          })}>
            {activeLeague?.trade_mode === 'commissioner_review'
              ? `Commissioner Review (${activeLeague.trade_review_hours}h)`
              : activeLeague?.trade_mode === 'league_vote'
              ? `League Vote (${activeLeague.trade_votes_required} vetoes)`
              : 'Instant'}
          </span>
        </p>
        <p>• Proposals expire after 48 hours if not responded to</p>
        <p>• You can counter any incoming offer with different players</p>
        {(!activeLeague?.trade_mode || activeLeague.trade_mode === 'instant') &&
          <p>• Accepted trades execute immediately</p>}
        {activeLeague?.trade_mode === 'commissioner_review' &&
          <p>• Accepted trades enter a {activeLeague.trade_review_hours}h review window — commissioner can veto</p>}
        {activeLeague?.trade_mode === 'league_vote' &&
          <p>• Accepted trades go to a league vote — {activeLeague.trade_votes_required} vetoes blocks the trade</p>}
        {isCommissioner && activeLeague?.trade_mode === 'commissioner_review' &&
          <p className="text-yellow-400">• You have commissioner review access for all pending trades</p>}
        <p>• Trade deadline: Week {activeLeague?.trade_deadline_week ?? 13}</p>
      </div>

      {showPropose && <ProposeModal leagueId={activeLeagueId} onClose={() => setShowPropose(false)} />}
    </div>
  )
}
