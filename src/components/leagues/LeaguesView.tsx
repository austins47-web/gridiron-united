import { useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { useMyLeagues, useCreateLeague, useJoinLeague, useStandings, useLeagueRealtime, useLeaveLeague } from '@/hooks/useLeague'
import { LeagueSettingsModal } from './LeagueSettingsModal'
import { BroadcastOpen } from '@/components/ui/BroadcastOpen'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { Trophy, Plus, LogIn, Users, Settings, Copy, Calendar, Shield, ChevronUp, ChevronDown, QrCode, LogOut } from 'lucide-react'
import { QRModal } from './QRModal'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ── Label formatters ────────────────────────────────────────────
const SCORING_LABELS: Record<string, string> = {
  ppr: 'PPR', half_ppr: 'Half PPR', standard: 'Standard',
}
const DRAFT_LABELS: Record<string, string> = {
  snake: 'Snake', linear: 'Linear', auction: 'Auction',
}
const STATUS_LABELS: Record<string, string> = {
  pre_draft: 'Pre-Draft', drafting: 'Drafting', in_progress: 'In Season',
  post_draft: 'In Season', completed: 'Complete',
}
const POOL_LABELS: Record<string, string> = {
  both: 'NFL + CFB', nfl: 'NFL', cfb: 'CFB',
}
const fmt = (map: Record<string, string>, v?: string | null) =>
  v ? (map[v] ?? v.replace(/_/g, ' ')) : ''

// Status chip colors
const STATUS_STYLES: Record<string, string> = {
  pre_draft:   'bg-field-700 text-field-300',
  drafting:    'bg-gold/20 text-gold',
  in_progress: 'bg-nfl/20 text-nfl',
  post_draft:  'bg-nfl/20 text-nfl',
  completed:   'bg-field-700 text-field-400',
}

export function LeaguesView() {
  const { activeLeagueId, activeLeague, myMembership, setActiveLeague } = useAppStore()
  const { data: myLeagues = [], isLoading } = useMyLeagues()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [qrLeague, setQrLeague] = useState<{ name: string; code: string } | null>(null)
  const [leaveTarget, setLeaveTarget] = useState<{ id: string; name: string } | null>(null)
  // User-controlled display order, stored in localStorage
  const [leagueOrder, setLeagueOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('league-order') ?? '[]') } catch { return [] }
  })

  useLeagueRealtime(activeLeagueId)

  // Apply stored order to leagues list
  const orderedLeagues = [...myLeagues].sort((a, b) => {
    const ai = leagueOrder.indexOf(a.league.id)
    const bi = leagueOrder.indexOf(b.league.id)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })

  const moveLeague = (id: string, dir: -1 | 1) => {
    setLeagueOrder(prev => {
      // Build a base order from current leagues if none stored yet
      const base = prev.length ? prev : myLeagues.map(l => l.league.id)
      const ids = [...new Set([...base, ...myLeagues.map(l => l.league.id)])]
      const idx = ids.indexOf(id)
      const target = idx + dir
      if (target < 0 || target >= ids.length) return prev
      const next = [...ids]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      try { localStorage.setItem('league-order', JSON.stringify(next)) } catch {}
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="ai-dot" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title !mb-0">Leagues</h1>
          <p className="text-field-400 text-sm mt-0.5">
            Switch leagues, invite players, and manage membership.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button className="btn-outline" onClick={() => setShowJoin(true)}>
            <LogIn className="w-4 h-4" /> Join
          </button>
          <button className="btn-gold" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> Create
          </button>
        </div>
      </div>

      {myLeagues.length === 0 ? (
        <EmptyLeagues onCreate={() => setShowCreate(true)} onJoin={() => setShowJoin(true)} />
      ) : (
        <>
          {/* ── Switcher strip ── */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="font-cond font-black text-xs uppercase tracking-[0.18em] text-field-300 shrink-0">
                Switch League
              </h2>
              <span className="font-cond font-bold text-xs text-field-500 tabular-nums shrink-0">
                {orderedLeagues.length}
              </span>
              <div className="flex-1 h-px bg-field-700" />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {orderedLeagues.map(({ league, ...membership }) => {
                const active = league.id === activeLeagueId
                return (
                  <button
                    key={league.id}
                    onClick={() => setActiveLeague(league, membership)}
                    className={clsx(
                      'shrink-0 flex items-center gap-2 pl-2 pr-3 py-2 rounded-xl border transition-all',
                      active
                        ? 'border-gold bg-gold/10'
                        : 'border-field-700 bg-field-800/60 hover:border-field-500',
                    )}
                  >
                    <div className={clsx(
                      'w-7 h-7 rounded-lg flex items-center justify-center font-cond font-black text-sm shrink-0',
                      active ? 'bg-gold text-field-950' : 'bg-field-700 text-gold',
                    )}>
                      {league.name[0]?.toUpperCase()}
                    </div>
                    <div className="text-left">
                      <div className={clsx(
                        'font-bold text-sm whitespace-nowrap max-w-[140px] truncate',
                        active ? 'text-gold' : 'text-white',
                      )}>
                        {league.name}
                      </div>
                      <div className="font-cond font-bold text-[11px] uppercase tracking-[0.14em] text-field-500 whitespace-nowrap">
                        {league.league_type === 'pickem' ? "Pick'Em" : fmt(SCORING_LABELS, league.scoring_type)}
                        {membership.is_commissioner ? ' · Commish' : ''}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Active league hub ── */}
          {activeLeague && (
            <LeagueHub
              league={activeLeague}
              membership={myMembership}
              orderedLeagues={orderedLeagues}
              onOpenSettings={() => setShowSettings(true)}
              onShowQR={() => setQrLeague({ name: activeLeague.name, code: activeLeague.invite_code })}
              onLeave={() => setLeaveTarget({ id: activeLeague.id, name: activeLeague.name })}
              onMove={(dir) => moveLeague(activeLeague.id, dir)}
            />
          )}
        </>
      )}

      {qrLeague && <QRModal leagueName={qrLeague.name} inviteCode={qrLeague.code} onClose={() => setQrLeague(null)} />}
      {leaveTarget && (
        <LeaveLeagueModal
          leagueId={leaveTarget.id}
          leagueName={leaveTarget.name}
          onClose={() => setLeaveTarget(null)}
        />
      )}
      {showCreate && <CreateLeagueModal onClose={() => setShowCreate(false)} />}
      {showJoin && <JoinLeagueModal onClose={() => setShowJoin(false)} />}
      {showSettings && activeLeague && (
        <LeagueSettingsModal
          league={activeLeague}
          onClose={() => setShowSettings(false)}
          onSaved={(updated) => {
            setActiveLeague(updated, myMembership)
            setShowSettings(false)
          }}
        />
      )}
    </div>
  )
}

function StandingsPanel({ leagueId }: { leagueId: string | null }) {
  const { data: members = [] } = useStandings(leagueId)

  return (
    <div className="panel">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-gold" />
        <span className="section-title text-sm">Standings</span>
      </div>
      <div className="space-y-1">
        {members.map((m: any, i: number) => (
          <div key={m.id} className="flex items-center justify-between py-1.5 border-b border-field-700/50 last:border-0">
            <div className="flex items-center gap-2">
              <span className="text-field-400 text-xs w-4">{i + 1}</span>
              <div className="w-6 h-6 rounded-full bg-field-700 flex items-center justify-center text-xs font-bold text-gold overflow-hidden shrink-0">
                {m.profile?.avatar_url
                  ? <img src={m.profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  : (m.profile?.display_name || m.profile?.username || '?')[0]?.toUpperCase()
                }
              </div>
              <span className="text-sm text-white">{m.team_name || m.profile?.display_name || m.profile?.username}</span>
            </div>
            <div className="text-xs text-right">
              <span className="text-white font-bold">{m.wins}-{m.losses}</span>
              <span className="text-field-400 ml-2">{m.points_for?.toFixed(1) ?? '0.0'}</span>
            </div>
          </div>
        ))}
        {members.length === 0 && (
          <p className="text-field-400 text-sm text-center py-4">No standings yet</p>
        )}
      </div>
    </div>
  )
}

function LeagueInfoPanel({ league, membership, isCommissioner }: any) {
  const copyInvite = () => {
    navigator.clipboard.writeText(league.invite_code)
    toast.success('Invite code copied!')
  }

  return (
    <div className="panel space-y-3">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-gold" />
        <span className="section-title text-sm">League Info</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        {[
          ['Format', league.league_type === 'pickem' ? "Pick'Em" : league.scoring_type?.toUpperCase()],
          ['Season', `Week ${league.current_week ?? 1}`],
          // Draft type, team cap, and draft status are all draft-lifecycle
          // concepts with no meaning in a Pick'Em league — there's no
          // draft, and the "500" team cap is an internal ceiling we set
          // so joining is never blocked, not a real number to show anyone.
          ...(league.league_type !== 'pickem' ? [
            ['Draft', league.draft_type] as [string, string],
            ['Teams', league.num_teams] as [string, string],
            ['Status', fmt(STATUS_LABELS, league.draft_status)] as [string, string],
            ['Pool', league.player_pool === 'both' ? 'NFL + CFB' : league.player_pool?.toUpperCase() ?? 'Both'] as [string, string],
          ] : []),
        ].map(([label, value]) => (
          <div key={label} className="bg-field-800/50 rounded p-2">
            <div className="text-field-400 text-xs">{label}</div>
            <div className="text-white font-bold capitalize">{value}</div>
          </div>
        ))}
      </div>

      {isCommissioner && (
        <div className="border border-gold/20 rounded p-3 bg-gold/5">
          <div className="text-xs text-field-400 mb-1">Invite Code</div>
          <div className="flex items-center justify-between">
            <span className="text-gold font-mono font-bold text-lg tracking-widest">
              {league.invite_code}
            </span>
            <div className="flex items-center gap-1">
              <button className="btn-ghost text-xs flex items-center gap-1" onClick={copyInvite}>
                <Copy className="w-3 h-3" /> Copy
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-field-700 pt-3">
        <div className="text-xs text-field-400 mb-1">Your Team</div>
        <div className="text-white font-bold">{membership?.team_name ?? 'My Team'}</div>
        {league.league_type !== 'pickem' && (
          <div className="text-xs text-field-400 mt-0.5">
            Draft #{membership?.draft_position ?? '—'} · {membership?.waiver_priority ?? '—'} waiver priority
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyLeagues({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <div className="panel text-center py-12">
      <Trophy className="w-12 h-12 text-gold/40 mx-auto mb-4" />
      <h3 className="text-white font-bold text-lg mb-2">No leagues yet</h3>
      <p className="text-field-400 mb-6">Create your own league or join one with an invite code.</p>
      <div className="flex gap-3 justify-center">
        <button className="btn-outline" onClick={onJoin}>
          <LogIn className="w-4 h-4" /> Join with Code
        </button>
        <button className="btn-gold" onClick={onCreate}>
          <Plus className="w-4 h-4" /> Create League
        </button>
      </div>
    </div>
  )
}

function CreateLeagueModal({ onClose }: { onClose: () => void }) {
  const createLeague = useCreateLeague()
  const [form, setForm] = useState({
    name: '',
    num_teams: 10,
    num_rounds: 15,
    scoring_type: 'ppr',
    draft_type: 'snake',
    is_public: false,
    player_pool: 'both' as 'nfl' | 'cfb' | 'both',
    league_type: 'redraft' as 'redraft' | 'keeper' | 'dynasty' | 'pickem',
  })

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error('League name required')
    if (form.name.trim().length > 40) return toast.error('League name must be 40 characters or less')
    await createLeague.mutateAsync(form)
    onClose()
  }

  return (
    <ModalPortal onClose={onClose}>
      <div className="modal-box w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="section-title mb-4">Create League</h2>
        <div className="space-y-3">
          <div>
            <label className="label">League Name</label>
            <input
              className="input"
              placeholder="My Fantasy League"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              maxLength={40}
            />
            <div className="flex justify-end mt-1">
              <span className={clsx('text-xs font-mono', form.name.length >= 35 ? 'text-gold' : 'text-field-600')}>
                {form.name.length}/40
              </span>
            </div>
          </div>

          <div>
            <label className="label">League Type</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'redraft', label: 'Redraft',   desc: 'Draft every year' },
                { value: 'keeper',  label: 'Keeper',    desc: 'Keep players' },
                { value: 'dynasty', label: 'Dynasty',   desc: 'Keep forever' },
                { value: 'pickem',  label: "Pick'Em",   desc: 'Pick NFL winners' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, league_type: opt.value }))}
                  className={clsx(
                    'flex flex-col items-center gap-0.5 p-3 rounded-lg border-2 transition-all text-center',
                    form.league_type === opt.value
                      ? 'border-gold bg-gold/10 text-gold'
                      : 'border-field-700 bg-field-800 text-field-400 hover:border-field-500 hover:text-white',
                  )}
                >
                  <span className="font-bold text-sm">{opt.label}</span>
                  <span className="text-xs opacity-60">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {form.league_type !== 'pickem' && (
          <div>
            <label className="label">Player Pool</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'both', label: 'NFL + CFB', desc: 'All players' },
                { value: 'nfl',  label: 'NFL Only',  desc: 'Pro players' },
                { value: 'cfb',  label: 'CFB Only',  desc: 'College players' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, player_pool: opt.value }))}
                  className={clsx(
                    'flex flex-col items-center gap-0.5 p-3 rounded-lg border-2 transition-all text-center',
                    form.player_pool === opt.value
                      ? 'border-gold bg-gold/10 text-gold'
                      : 'border-field-700 bg-field-800 text-field-400 hover:border-field-500 hover:text-white',
                  )}
                >
                  <span className="font-bold text-sm">{opt.label}</span>
                  <span className="text-xs opacity-60">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
          )}

          {form.league_type !== 'pickem' && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Teams</label>
              <select className="input" value={form.num_teams} onChange={e => setForm(f => ({ ...f, num_teams: +e.target.value }))}>
                {[8, 10, 12, 14].map(n => <option key={n} value={n}>{n} teams</option>)}
              </select>
            </div>
            <div>
              <label className="label">Rounds</label>
              <select className="input" value={form.num_rounds} onChange={e => setForm(f => ({ ...f, num_rounds: +e.target.value }))}>
                {[8, 10, 12, 14, 15, 16, 18, 20, 22, 25, 30].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Scoring</label>
              <select className="input" value={form.scoring_type} onChange={e => setForm(f => ({ ...f, scoring_type: e.target.value }))}>
                <option value="ppr">PPR</option>
                <option value="half_ppr">Half PPR</option>
                <option value="standard">Standard</option>
              </select>
            </div>
          </div>
          )}

          {form.league_type !== 'pickem' && (
          <div>
            <label className="label">Draft Type</label>
            <select className="input" value={form.draft_type} onChange={e => setForm(f => ({ ...f, draft_type: e.target.value }))}>
              <option value="snake">Snake</option>
              <option value="linear">Linear</option>
              <option value="auction">Auction</option>
            </select>
          </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_public}
              onChange={e => setForm(f => ({ ...f, is_public: e.target.checked }))}
              className="w-4 h-4 accent-gold"
            />
            <span className="text-sm text-white">Public league (visible to all)</span>
          </label>
        </div>

        <div className="flex gap-2 mt-5">
          <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-gold flex-1" onClick={handleSubmit} disabled={createLeague.isPending}>
            {createLeague.isPending ? 'Creating...' : 'Create League'}
          </button>
        </div>
      </div>
    </ModalPortal>
  )
}

function JoinLeagueModal({ onClose }: { onClose: () => void }) {
  const joinLeague = useJoinLeague()
  const [code, setCode] = useState('')

  const handleSubmit = async () => {
    if (code.length < 4) return toast.error('Enter a valid invite code')
    await joinLeague.mutateAsync(code)
    onClose()
  }

  return (
    <ModalPortal onClose={onClose}>
      <div className="modal-box w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h2 className="section-title mb-4">Join League</h2>
        <p className="text-field-400 text-sm mb-4">Enter the invite code from your league commissioner.</p>
        <input
          className="input text-center text-xl tracking-widest font-mono uppercase"
          placeholder="ABC12345"
          maxLength={8}
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        />
        <div className="flex gap-2 mt-4">
          <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-gold flex-1" onClick={handleSubmit} disabled={joinLeague.isPending}>
            {joinLeague.isPending ? 'Joining...' : 'Join League'}
          </button>
        </div>
      </div>
    </ModalPortal>
  )
}


function LeaveLeagueModal({ leagueId, leagueName, onClose }: { leagueId: string; leagueName: string; onClose: () => void }) {
  const leaveLeague = useLeaveLeague()
  const [confirmText, setConfirmText] = useState('')
  const canLeave = confirmText.trim().toUpperCase() === 'LEAVE'

  const handleLeave = async () => {
    try {
      await leaveLeague.mutateAsync(leagueId)
      onClose()
    } catch { /* toast shown by the hook */ }
  }

  return (
    <ModalPortal onClose={onClose}>
      <div className="modal-box w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <LogOut className="w-5 h-5 text-red-400" />
          <h2 className="font-cond font-black text-lg text-white uppercase tracking-wider">
            Leave League
          </h2>
        </div>

        <p className="text-field-300 text-sm mb-3">
          Leave <span className="text-white font-bold">"{leagueName}"</span>? Your roster will be
          released and your history removed. This can't be undone.
        </p>

        <label className="label">
          Type <span className="text-red-400 font-mono">LEAVE</span> to confirm
        </label>
        <input
          className="input mb-4"
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && canLeave && handleLeave()}
          placeholder="LEAVE"
          autoFocus
        />

        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button
            disabled={!canLeave || leaveLeague.isPending}
            onClick={handleLeave}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 font-bold text-white px-4 py-2 rounded-lg transition-colors',
              canLeave && !leaveLeague.isPending
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-field-700 text-field-500 cursor-not-allowed',
            )}
          >
            {leaveLeague.isPending ? 'Leaving…' : 'Leave League'}
          </button>
        </div>
      </div>
    </ModalPortal>
  )
}


// ─── League Hub — everything about the one active league ─────
function LeagueHub({
  league, membership, orderedLeagues, onOpenSettings, onShowQR, onLeave, onMove,
}: any) {
  const isCommissioner = membership?.is_commissioner ?? false
  const isPickem = league.league_type === 'pickem'
  const idx = orderedLeagues.findIndex((l: any) => l.league.id === league.id)
  const isFirst = idx === 0
  const isLast  = idx === orderedLeagues.length - 1

  return (
    <div className="space-y-4">
      <BroadcastOpen
        storageKey={`bcopen-league-${league.id}`}
        tagline={isPickem ? "Pick every game. Beat the league." : "NFL + College. One Roster."}
      />
      {/* Hub header */}
      <div className="jumbotron">
        <div className="relative p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-cond font-bold text-[12px] uppercase tracking-[0.2em] text-gold mb-1">
                Active League
              </div>
              <h2 className="font-cond font-black uppercase text-white leading-none tracking-tight truncate"
                  style={{ fontSize: 'clamp(1.4rem, 4.5vw, 2rem)' }}>
                {league.name}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                {isPickem ? (
                  <span className="text-[12px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-gold/20 text-gold">
                    Pick'Em
                  </span>
                ) : (
                  <>
                    <span className="text-[12px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-field-700 text-field-300">
                      {fmt(SCORING_LABELS, league.scoring_type)}
                    </span>
                    <span className="text-[12px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-field-700 text-field-300">
                      {fmt(DRAFT_LABELS, league.draft_type)}
                    </span>
                    <span className={clsx(
                      'text-[12px] font-bold uppercase tracking-wider px-2 py-0.5 rounded',
                      league.player_pool === 'cfb' ? 'bg-cfb/20 text-cfb'
                      : league.player_pool === 'nfl' ? 'bg-nfl/20 text-nfl'
                      : 'bg-field-700 text-field-300'
                    )}>
                      {fmt(POOL_LABELS, league.player_pool)}
                    </span>
                  </>
                )}
                {!isPickem && (
                  <span className={clsx(
                    'text-[12px] font-bold uppercase tracking-wider px-2 py-0.5 rounded',
                    STATUS_STYLES[league.draft_status] ?? 'bg-field-700 text-field-300'
                  )}>
                    {fmt(STATUS_LABELS, league.draft_status)}
                  </span>
                )}
                {isCommissioner && (
                  <span className="text-[12px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-gold/15 text-gold flex items-center gap-1">
                    <Shield className="w-2.5 h-2.5" /> Commissioner
                  </span>
                )}
              </div>
            </div>

            {/* Reorder in the Home list */}
            <div className="flex flex-col gap-0.5 shrink-0">
              <button
                onClick={() => onMove(-1)}
                disabled={isFirst}
                title="Move up in your league list"
                className="p-1 text-field-600 hover:text-gold disabled:opacity-20 disabled:cursor-default transition-colors"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => onMove(1)}
                disabled={isLast}
                title="Move down in your league list"
                className="p-1 text-field-600 hover:text-gold disabled:opacity-20 disabled:cursor-default transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 mt-4">
            <button className="btn-ghost" onClick={onShowQR}>
              <QrCode className="w-3.5 h-3.5" /> Invite
            </button>
            {isCommissioner && (
              <button className="btn-ghost" onClick={onOpenSettings}>
                <Settings className="w-3.5 h-3.5" /> League settings
              </button>
            )}
            <button
              className="btn-ghost !text-red-400 !border-red-400/30 hover:!border-red-400/60"
              onClick={onLeave}
            >
              <LogOut className="w-3.5 h-3.5" /> Leave
            </button>
          </div>
        </div>
      </div>

      {/* Standings + info */}
      <div className="grid md:grid-cols-2 gap-4">
        <StandingsPanel leagueId={league.id} />
        <LeagueInfoPanel
          league={league}
          membership={membership}
          isCommissioner={isCommissioner}
        />
      </div>
    </div>
  )
}
