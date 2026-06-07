import { useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { useMyLeagues, useCreateLeague, useJoinLeague, useStandings, useLeagueMembers, useLeagueRealtime } from '@/hooks/useLeague'
import { LeagueSettingsModal } from './LeagueSettingsModal'
import { Trophy, Plus, LogIn, Users, Settings, Copy, Calendar, Shield, ChevronUp, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export function LeaguesView() {
  const { activeLeagueId, activeLeague, myMembership, setActiveLeague } = useAppStore()
  const { data: myLeagues = [], isLoading } = useMyLeagues()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
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
        <h1 className="section-title">My Leagues</h1>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={() => setShowJoin(true)}>
            <LogIn className="w-4 h-4" /> Join
          </button>
          <button className="btn-gold" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> Create
          </button>
        </div>
      </div>

      {/* League cards */}
      {myLeagues.length === 0 ? (
        <EmptyLeagues onCreate={() => setShowCreate(true)} onJoin={() => setShowJoin(true)} />
      ) : (
        <div className="grid gap-3">
          {orderedLeagues.map(({ league, ...membership }, idx) => (
            <LeagueCard
              key={league.id}
              league={league}
              membership={membership}
              isActive={league.id === activeLeagueId}
              isFirst={idx === 0}
              isLast={idx === orderedLeagues.length - 1}
              onSelect={() => setActiveLeague(league, membership)}
              onMoveUp={() => moveLeague(league.id, -1)}
              onMoveDown={() => moveLeague(league.id, 1)}
            />
          ))}
        </div>
      )}

      {/* Active League Detail */}
      {activeLeague && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="section-title">{activeLeague.name}</h2>
            {myMembership?.is_commissioner && (
              <button className="btn-outline" onClick={() => setShowSettings(true)}>
                <Settings className="w-4 h-4" /> Settings
              </button>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <StandingsPanel leagueId={activeLeagueId} />
            <LeagueInfoPanel
              league={activeLeague}
              membership={myMembership}
              isCommissioner={myMembership?.is_commissioner ?? false}
            />
          </div>
        </div>
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

function LeagueCard({ league, membership, isActive, isFirst, isLast, onSelect, onMoveUp, onMoveDown }: any) {
  return (
    <div
      className={clsx(
        'card cursor-pointer transition-all border-2',
        isActive
          ? 'border-gold/60 bg-field-800/60'
          : 'border-transparent hover:border-gold/20 hover:bg-field-800/40',
      )}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={clsx(
            'w-10 h-10 rounded-full flex items-center justify-center font-black text-lg shrink-0',
            isActive ? 'bg-gold text-field-950' : 'bg-field-700 text-gold',
          )}>
            {league.name[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">{league.name}</span>
              {membership.is_commissioner && (
                <Shield className="w-3.5 h-3.5 text-gold" title="Commissioner" />
              )}
              {isActive && (
                <span className="text-xs bg-gold/20 text-gold px-1.5 py-0.5 rounded font-bold">ACTIVE</span>
              )}
            </div>
            <div className="text-xs text-field-400 flex gap-3 mt-0.5">
              <span className="capitalize">{league.scoring_type}</span>
              <span className="capitalize">{league.draft_type} draft</span>
              <span className="capitalize">{league.player_pool === 'both' ? 'NFL + CFB' : league.player_pool?.toUpperCase()}</span>
              <span className="capitalize">{league.draft_status}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right text-sm mr-1">
            <div className="text-white font-bold">{membership.wins}-{membership.losses}{membership.ties > 0 ? `-${membership.ties}` : ''}</div>
            <div className="text-field-400 text-xs">{membership.points_for?.toFixed(1) ?? '0.0'} pts</div>
          </div>
          {/* Reorder arrows */}
          <div className="flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
            <button
              onClick={onMoveUp}
              disabled={isFirst}
              title="Move up"
              className="p-0.5 text-field-600 hover:text-field-300 disabled:opacity-20 disabled:cursor-default transition-colors"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              onClick={onMoveDown}
              disabled={isLast}
              title="Move down"
              className="p-0.5 text-field-600 hover:text-field-300 disabled:opacity-20 disabled:cursor-default transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
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
              <div className="w-6 h-6 rounded-full bg-field-700 flex items-center justify-center text-xs font-bold text-gold">
                {(m.profile?.display_name || m.profile?.username || '?')[0]?.toUpperCase()}
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
          ['Format', league.scoring_type?.toUpperCase()],
          ['Draft', league.draft_type],
          ['Teams', league.num_teams],
          ['Season', `Week ${league.current_week ?? 1}`],
          ['Status', league.draft_status],
          ['Pool', league.player_pool === 'both' ? 'NFL + CFB' : league.player_pool?.toUpperCase() ?? 'Both'],
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
            <button
              className="btn-ghost text-xs flex items-center gap-1"
              onClick={copyInvite}
            >
              <Copy className="w-3 h-3" /> Copy
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-field-700 pt-3">
        <div className="text-xs text-field-400 mb-1">Your Team</div>
        <div className="text-white font-bold">{membership?.team_name ?? 'My Team'}</div>
        <div className="text-xs text-field-400 mt-0.5">
          Draft #{membership?.draft_position ?? '—'} · {membership?.waiver_priority ?? '—'} waiver priority
        </div>
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
  })

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error('League name required')
    await createLeague.mutateAsync(form)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
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
            />
          </div>

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

          <div>
            <label className="label">Draft Type</label>
            <select className="input" value={form.draft_type} onChange={e => setForm(f => ({ ...f, draft_type: e.target.value }))}>
              <option value="snake">Snake</option>
              <option value="linear">Linear</option>
              <option value="auction">Auction</option>
            </select>
          </div>

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
    </div>
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h2 className="section-title mb-4">Join League</h2>
        <p className="text-field-400 text-sm mb-4">Enter the invite code from your league commissioner.</p>
        <input
          className="input text-center text-xl tracking-widest font-mono uppercase"
          placeholder="ABC123"
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
    </div>
  )
}
