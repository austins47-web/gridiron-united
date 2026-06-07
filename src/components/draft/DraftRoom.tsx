import { useState, useEffect, useRef, useCallback } from 'react'
import {
  useDraftState, useDraftPicks, useStartDraft, useScheduleDraft,
  useCancelSchedule, useMakePick, useDraftRealtime, type DraftPickWithPlayer
} from '@/hooks/useDraft'
import { usePlayers, DEFAULT_FILTERS } from '@/hooks/usePlayers'
import { useLeagueMembers } from '@/hooks/useLeague'
import { useRosteredPlayerIds } from '@/hooks/useRoster'
import { useAppStore } from '@/store/appStore'
import { supabase } from '@/lib/supabase'
import type { Player } from '@/types/database'
import {
  Clock, Search, Play, Pause, AlertCircle, Calendar,
  X, CheckCircle, Users, Settings, Zap, ChevronUp, ChevronDown, Timer, Bot
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

// ── Timer options ──────────────────────────────────────────────────────
const TIMER_OPTIONS = [
  { label: 'No timer', value: 0 },
  { label: '10s', value: 10 },
  { label: '15s', value: 15 },
  { label: '20s', value: 20 },
  { label: '30s', value: 30 },
  { label: '45s', value: 45 },
  { label: '1m', value: 60 },
  { label: '1m 30s', value: 90 },
  { label: '2m', value: 120 },
  { label: '3m', value: 180 },
  { label: '5m', value: 300 },
  { label: '10m', value: 600 },
  { label: '15m', value: 900 },
]

// ── Autodraft AI engine ────────────────────────────────────────────────
const ROSTER_TARGETS: Record<string, number> = { QB: 2, RB: 5, WR: 5, TE: 2, K: 1, DST: 1 }
const SCARCITY: Record<string, number> = { QB: 0.6, RB: 1.4, WR: 1.2, TE: 1.1, K: 0.1, DST: 0.2 }

function needScore(pos: string, myTeam: Player[], round: number, totalRounds: number, scoringType: string): number {
  const have = myTeam.filter(p => p.pos === pos).length
  const target = ROSTER_TARGETS[pos] ?? 1
  const remaining = totalRounds - round
  const hardCap: Record<string, number> = { QB: 2, RB: 7, WR: 7, TE: 2, K: 1, DST: 1 }
  if (have >= (hardCap[pos] ?? 2)) return 0
  const need = Math.max(0, target - have)
  if (need === 0) return remaining > 5 ? 0.4 : 0.2
  const urgency = Math.min(2.5, 1.0 + (need / Math.max(1, remaining)) * 3.0)
  let fmt = 1.0
  if (pos === 'WR' || pos === 'TE') fmt = scoringType === 'ppr' ? 1.15 : scoringType === 'half_ppr' ? 1.07 : 0.95
  if (pos === 'RB') fmt = scoringType === 'standard' ? 1.15 : scoringType === 'half_ppr' ? 1.07 : 0.95
  return urgency * SCARCITY[pos] * fmt
}

function valueScore(player: Player, currentPick: number): number {
  return 1.0 + Math.min(1.5, Math.max(0, currentPick - (player.adp ?? currentPick)) * 0.04)
}

function autoDraftPickPlayer(
  available: Player[], round: number, totalRounds: number,
  currentPick: number, myTeam: Player[], scoringType: string
): Player | null {
  if (!available.length) return null
  const windowSize = round <= 3 ? 30 : round <= 8 ? 50 : 80
  const pool = available.slice(0, windowSize)
  const scored = pool.map(p => {
    const need = needScore(p.pos, myTeam, round, totalRounds, scoringType)
    if (need === 0) return { player: p, score: 0 }
    const score = (1000 / ((p.adp ?? 999) + 1)) * need * valueScore(p, currentPick) * (0.96 + Math.random() * 0.08)
    return { player: p, score }
  })
  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  return (!best || best.score === 0) ? pool[0] ?? null : best.player
}

// ── Main component ─────────────────────────────────────────────────────
export function DraftRoom() {
  const { activeLeagueId, activeLeague, myMembership, user } = useAppStore()
  const { data: draftState, isLoading: stateLoading } = useDraftState(activeLeagueId)
  const { data: picks = [] } = useDraftPicks(activeLeagueId)
  const { data: members = [] } = useLeagueMembers(activeLeagueId)
  const { data: rosteredIds } = useRosteredPlayerIds(activeLeagueId)
  const makePick = useMakePick()

  // ── UI state ───────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('ALL')
  const [leagueFilter, setLeagueFilter] = useState<'ALL' | 'NFL' | 'CFB'>('ALL')
  const [sidebarTab, setSidebarTab] = useState<'queue' | 'roster' | 'board' | 'order'>('queue')
  const [timer, setTimer] = useState(0)
  const [autoDraft, setAutoDraft] = useState(false)

  // ── Refs (never cause re-renders) ──────────────────────────────────
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoDraftRef = useRef(false)
  const autoPickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const locallyPickedIds = useRef<Set<string>>(new Set())
  const submittingRef = useRef(false)
  const availableRef = useRef<Player[]>([])
  const picksRef = useRef<DraftPickWithPlayer[]>([])
  const queueRef = useRef<string[]>([])

  // Keep refs in sync
  useEffect(() => { autoDraftRef.current = autoDraft }, [autoDraft])
  useEffect(() => { picksRef.current = picks }, [picks])

  // ── Draft queue (localStorage-persisted) ───────────────────────────
  const queueKey = `draft-queue-${activeLeagueId}`
  const [queue, setQueueRaw] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(queueKey) ?? '[]') } catch { return [] }
  })
  const setQueue = (up: string[] | ((p: string[]) => string[])) => {
    setQueueRaw(prev => {
      const next = typeof up === 'function' ? up(prev) : up
      try { localStorage.setItem(queueKey, JSON.stringify(next)) } catch {}
      return next
    })
  }
  useEffect(() => { queueRef.current = queue }, [queue])

  useDraftRealtime(activeLeagueId)

  // ── Derived values (computed before callbacks) ─────────────────────
  const poolLeague = activeLeague?.player_pool === 'nfl' ? 'NFL'
    : activeLeague?.player_pool === 'cfb' ? 'CFB' : 'ALL'

  const storedTeams = (draftState as any)?.num_teams
  const totalTeams = (storedTeams != null && storedTeams > 0)
    ? storedTeams
    : members.length > 0 ? members.length : (activeLeague?.num_teams ?? 10)

  const storedRounds = draftState?.num_rounds
  const numRounds = (storedRounds != null && storedRounds > 0)
    ? storedRounds : (activeLeague?.num_rounds ?? 15)

  // Read from draftState so realtime propagates mid-draft timer changes to everyone.
  // Falls back to league setting if pick_timer hasn't been written to draft_state yet.
  const storedTimer = (draftState as any)?.pick_timer
  const pickLimit = (storedTimer != null && storedTimer >= 0)
    ? storedTimer
    : (activeLeague?.draft_pick_timer ?? 0)
  const isMyTurn = draftState?.current_user_id === user?.id
  const isCommissioner = myMembership?.is_commissioner
  const isPaused = draftState?.status === 'paused'

  const currentPickerMember = members.find((m: any) => m.user_id === draftState?.current_user_id)
  const currentPickerName =
    (currentPickerMember as any)?.profile?.display_name ||
    (currentPickerMember as any)?.profile?.username || 'Unknown'

  // ── Player data ────────────────────────────────────────────────────
  const { data: playerData } = usePlayers({
    ...DEFAULT_FILTERS,
    search,
    pos: posFilter as any,
    league: leagueFilter === 'ALL' ? poolLeague as any : leagueFilter,
    pageSize: 150,
    sortBy: 'adp',
    sortDir: 'asc',
  })
  const { data: allPlayerData } = usePlayers({
    ...DEFAULT_FILTERS,
    league: poolLeague as any,
    pageSize: 300,
    sortBy: 'adp',
    sortDir: 'asc',
  })

  const takenIds = new Set(picks.map(p => p.player_id))
  const availablePlayers = (playerData?.players ?? []).filter(p => !takenIds.has(p.id) && !rosteredIds?.has(p.id))
  const allAvailable = (allPlayerData?.players ?? []).filter(p => !takenIds.has(p.id) && !rosteredIds?.has(p.id))
  useEffect(() => { availableRef.current = allAvailable }, [allAvailable])

  const queuedPlayers = queue.map(id => allAvailable.find(p => p.id === id)).filter(Boolean) as Player[]
  const myPicks = picks.filter(p => p.user_id === user?.id)

  // ── Pick submission ────────────────────────────────────────────────
  const handlePick = useCallback(async (playerId: string) => {
    if (!draftState || !user || !activeLeagueId) return
    if (draftState.current_user_id !== user.id) return
    if (locallyPickedIds.current.has(playerId)) return
    if (submittingRef.current) return
    submittingRef.current = true
    locallyPickedIds.current.add(playerId)
    setQueue(prev => prev.filter(id => id !== playerId))
    try {
      await makePick.mutateAsync({ playerId, draftState, totalTeams })
    } catch {
      locallyPickedIds.current.delete(playerId)
    } finally {
      submittingRef.current = false
    }
  }, [draftState, user, activeLeagueId, totalTeams, makePick])

  // ── Autodraft: smart AI pick using ADP + team needs ────────────────
  const runAutoDraft = useCallback(async () => {
    if (!draftState || !user || !activeLeagueId) return
    if (draftState.current_user_id !== user.id) return
    if (submittingRef.current) return

    const currentTakenIds = new Set([
      ...picksRef.current.map(p => p.player_id),
      ...Array.from(locallyPickedIds.current),
    ])
    const currentAvailable = availableRef.current.filter(p => !currentTakenIds.has(p.id))
    if (!currentAvailable.length) return

    const myTeam = picksRef.current
      .filter(p => p.user_id === user.id && p.player)
      .map(p => p.player as Player)

    const pick = autoDraftPickPlayer(
      currentAvailable,
      draftState.current_round,
      numRounds,
      draftState.current_pick,
      myTeam,
      activeLeague?.scoring_type ?? 'ppr',
    )
    if (pick) await handlePick(pick.id)
  }, [draftState, user, activeLeagueId, numRounds, activeLeague, handlePick])

  // ── Timer + smart expiry pick ──────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!draftState || draftState.status !== 'in_progress') { setTimer(0); return }
    if (!pickLimit) { setTimer(0); return }

    const startedAt = draftState.pick_started_at
      ? new Date(draftState.pick_started_at).getTime() : Date.now()
    let expired = false

    const tick = () => {
      const remaining = Math.max(0, pickLimit - Math.floor((Date.now() - startedAt) / 1000))
      setTimer(remaining)
      if (remaining === 0 && !expired && !submittingRef.current) {
        expired = true
        if (timerRef.current) clearInterval(timerRef.current)
        if (draftState.current_user_id !== user?.id) return
        // Queue first, then AI
        const taken = new Set([...picksRef.current.map(p => p.player_id), ...Array.from(locallyPickedIds.current)])
        const queuedId = queueRef.current.find(id => !taken.has(id))
        if (queuedId) {
          setQueue(prev => prev.filter(id => id !== queuedId))
          handlePick(queuedId)
        } else {
          runAutoDraft()
        }
      }
    }
    tick()
    timerRef.current = setInterval(tick, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftState?.pick_started_at, draftState?.status, draftState?.current_pick, pickLimit, user?.id])

  // ── Autodraft ON-switch: fire immediately when toggled on ──────────
  useEffect(() => {
    if (!autoDraft) return
    if (!draftState || draftState.status !== 'in_progress') return
    if (draftState.current_user_id !== user?.id) return
    if (submittingRef.current) return
    autoPickTimeoutRef.current = setTimeout(runAutoDraft, 50)
    return () => { if (autoPickTimeoutRef.current) clearTimeout(autoPickTimeoutRef.current) }
  }, [autoDraft]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Autodraft: fire when pick advances to my turn ──────────────────
  useEffect(() => {
    if (!autoDraftRef.current) return
    if (!draftState || draftState.status !== 'in_progress') return
    if (draftState.current_user_id !== user?.id) return
    if (submittingRef.current) return
    autoPickTimeoutRef.current = setTimeout(runAutoDraft, 50)
    return () => { if (autoPickTimeoutRef.current) clearTimeout(autoPickTimeoutRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftState?.current_pick, draftState?.current_user_id])

  // ── Commissioner actions ───────────────────────────────────────────
  const togglePause = async () => {
    if (!isCommissioner || !activeLeagueId || !draftState) return
    const newStatus = isPaused ? 'in_progress' : 'paused'
    await supabase.from('draft_state').update({
      status: newStatus,
      ...(newStatus === 'in_progress' ? { pick_started_at: new Date().toISOString() } : {}),
    }).eq('league_id', activeLeagueId)
    toast(newStatus === 'paused' ? '⏸ Draft paused' : '▶ Draft resumed')
  }

  const changeTimer = async (seconds: number) => {
    if (!isCommissioner || !activeLeagueId) return
    // Write to leagues table (persistent)
    await supabase.from('leagues').update({ draft_pick_timer: seconds }).eq('id', activeLeagueId)
    // Write pick_timer + reset clock to draft_state — realtime propagates this to all users instantly
    await supabase.from('draft_state').update({
      pick_timer: seconds,
      pick_started_at: new Date().toISOString(),
    }).eq('league_id', activeLeagueId)
    // Also update local Zustand store so the commissioner's own UI reacts immediately
    if (activeLeague) {
      const { setActiveLeague } = useAppStore.getState()
      setActiveLeague({ ...activeLeague, draft_pick_timer: seconds }, myMembership)
    }
    toast.success(seconds === 0 ? 'Timer removed' : `Timer set to ${TIMER_OPTIONS.find(o => o.value === seconds)?.label}`)
  }

  // ── Queue helpers ──────────────────────────────────────────────────
  const addToQueue = (id: string) => { setQueue(prev => prev.includes(id) ? prev : [...prev, id]); toast.success('Added to queue') }
  const removeFromQueue = (id: string) => setQueue(prev => prev.filter(x => x !== id))
  const moveQueueItem = (idx: number, dir: -1 | 1) => {
    setQueue(prev => {
      const next = [...prev]; const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  // ── Early returns ──────────────────────────────────────────────────
  if (!activeLeagueId) return (
    <div className="max-w-4xl mx-auto px-4 py-12 text-center">
      <AlertCircle className="w-12 h-12 text-gold/40 mx-auto mb-4" />
      <h2 className="text-white font-bold text-lg mb-2">No league selected</h2>
      <p className="text-field-400">Select a league to access the draft room.</p>
    </div>
  )

  if (stateLoading) return (
    <div className="flex items-center justify-center h-64"><div className="ai-dot" /></div>
  )

  if (!draftState || draftState.status === 'pre_draft' || draftState.status === 'scheduled') return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <PreDraftLobby league={activeLeague} members={members} isCommissioner={!!isCommissioner} draftState={draftState} />
    </div>
  )

  if (draftState.status === 'completed') return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <CompletedDraft picks={picks} members={members} totalTeams={totalTeams} numRounds={numRounds} />
    </div>
  )

  // ── Live draft ─────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4">

      {/* Paused banner */}
      {isPaused && (
        <div className="bg-yellow-400/10 border border-yellow-400/40 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-yellow-400 font-bold">
            <Pause className="w-4 h-4" /> Draft is paused
          </div>
          {isCommissioner && (
            <button className="btn-gold !py-1.5 !px-4 text-sm" onClick={togglePause}>
              <Play className="w-4 h-4" /> Resume Draft
            </button>
          )}
        </div>
      )}

      {/* Status bar */}
      <div className={clsx(
        'flex items-center justify-between p-3 rounded-lg mb-4 border flex-wrap gap-3',
        isMyTurn && !isPaused ? 'bg-gold/10 border-gold/40' : 'bg-field-800 border-field-700',
      )}>
        <div>
          <div className="text-xs text-field-400 uppercase tracking-wider">
            Round {draftState.current_round} · Pick {draftState.current_pick} of {totalTeams * numRounds}
          </div>
          <div className={clsx('font-bold', isMyTurn && !isPaused ? 'text-gold text-lg' : 'text-white')}>
            {isPaused
              ? <span className="text-yellow-400">Paused — waiting for commissioner</span>
              : autoDraft && isMyTurn
              ? <span className="flex items-center gap-2"><Bot className="w-4 h-4 animate-pulse text-gold" /> Autodrafting…</span>
              : isMyTurn ? '🏈 YOUR PICK!' : `On the clock: ${currentPickerName}`}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {pickLimit > 0 && !isPaused && (
            <div className={clsx(
              'flex items-center gap-1.5 text-lg font-black tabular-nums',
              timer <= 10 ? 'text-red-400 animate-pulse' : timer <= 20 ? 'text-yellow-400' : 'text-white',
            )}>
              <Clock className="w-4 h-4" />
              {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, '0')}
            </div>
          )}

          {/* Autodraft toggle */}
          <button
            onClick={() => setAutoDraft(v => !v)}
            className={clsx(
              'flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors',
              autoDraft
                ? 'bg-gold/20 border-gold/50 text-gold hover:bg-gold/30'
                : 'bg-field-800 border-field-700 text-field-400 hover:border-field-500 hover:text-white',
            )}
            title={autoDraft ? 'Autodraft ON — click to disable' : 'Autodraft OFF — click to let AI pick for you'}
          >
            <Bot className="w-3.5 h-3.5" />
            Auto {autoDraft ? 'ON' : 'OFF'}
          </button>

          {/* Commissioner controls */}
          {isCommissioner && (
            <>
              <CommissionerTimerPicker current={pickLimit} onChange={changeTimer} />
              <button
                onClick={togglePause}
                className={clsx('btn-ghost !py-1.5 !px-2', isPaused && 'text-gold')}
                title={isPaused ? 'Resume draft' : 'Pause draft'}
              >
                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Player pool */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-field-400" />
              <input className="input pl-9" placeholder="Search available players…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-1 flex-wrap">
              {['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'].map(pos => (
                <button key={pos} onClick={() => setPosFilter(pos)} className={clsx('filter-chip !py-1 !px-2 text-xs', posFilter === pos && 'active')}>{pos}</button>
              ))}
            </div>
            {poolLeague === 'ALL' && (
              <div className="flex gap-1">
                {(['ALL', 'NFL', 'CFB'] as const).map(lg => (
                  <button key={lg} onClick={() => setLeagueFilter(lg)} className={clsx(
                    'filter-chip !py-1 !px-2 text-xs', leagueFilter === lg && 'active',
                    lg === 'NFL' && leagueFilter === lg && '!border-nfl !text-nfl',
                    lg === 'CFB' && leagueFilter === lg && '!border-cfb !text-cfb',
                  )}>{lg}</button>
                ))}
              </div>
            )}
          </div>

          <div className="panel !p-0 overflow-hidden">
            <div className="max-h-[520px] overflow-y-auto">
              <table className="data-table w-full">
                <thead className="sticky top-0 z-10 bg-field-900">
                  <tr>
                    <th className="text-left">Player</th>
                    <th className="text-center">Pos</th>
                    <th className="text-center hidden sm:table-cell">ADP</th>
                    <th className="text-center">Avg</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {availablePlayers.slice(0, 150).map(p => {
                    const isQueued = queue.includes(p.id)
                    const queuePos = queue.indexOf(p.id) + 1
                    const canPick = isMyTurn && !isPaused && !autoDraft
                    return (
                      <tr
                        key={p.id}
                        className={clsx(canPick && 'hover:bg-gold/5 cursor-pointer', isQueued && 'bg-gold/[0.03]')}
                        onClick={canPick ? () => handlePick(p.id) : undefined}
                      >
                        <td>
                          <div className="font-bold text-white text-sm">{p.name}</div>
                          <div className="text-field-400 text-xs">
                            {p.team} · <span className={p.league === 'NFL' ? 'text-nfl' : 'text-cfb'}>{p.league}</span>
                          </div>
                        </td>
                        <td className="text-center"><span className={`pos-badge pos-${p.pos}`}>{p.pos}</span></td>
                        <td className="text-center text-field-300 text-sm hidden sm:table-cell">{p.adp?.toFixed(1) ?? '—'}</td>
                        <td className="text-center text-white font-bold text-sm">{p.avg_pts?.toFixed(1) ?? '—'}</td>
                        <td className="text-center" onClick={e => e.stopPropagation()}>
                          {canPick ? (
                            <button className="btn-gold !py-1 !px-2 text-xs" onClick={() => handlePick(p.id)} disabled={makePick.isPending}>
                              {makePick.isPending ? '…' : 'Draft'}
                            </button>
                          ) : isQueued ? (
                            <button
                              className="text-xs border border-gold/40 text-gold px-2 py-1 rounded hover:bg-red-400/10 hover:border-red-400/40 hover:text-red-400 transition-colors"
                              onClick={() => removeFromQueue(p.id)}
                            >#{queuePos} ✕</button>
                          ) : (
                            <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => addToQueue(p.id)}>+ Queue</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {availablePlayers.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-6 text-field-400">No available players match your filters</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          <div className="panel !p-0 overflow-hidden">
            <div className="flex border-b border-field-700">
              {([
                { id: 'queue', label: 'Queue', badge: queue.length },
                { id: 'roster', label: 'My Picks', badge: myPicks.length },
                { id: 'board', label: 'Board', badge: 0 },
                { id: 'order', label: 'Order', badge: 0 },
              ] as { id: typeof sidebarTab; label: string; badge: number }[]).map(tab => (
                <button key={tab.id} onClick={() => setSidebarTab(tab.id)} className={clsx(
                  'flex-1 flex items-center justify-center gap-1 py-2 text-xs font-bold transition-colors',
                  sidebarTab === tab.id ? 'bg-field-700 text-white' : 'text-field-500 hover:text-field-300',
                )}>
                  {tab.label}
                  {tab.badge > 0 && (
                    <span className={clsx('text-[10px] font-black px-1 py-0.5 rounded-full min-w-[16px] text-center',
                      sidebarTab === tab.id ? 'bg-gold text-field-950' : 'bg-field-700 text-field-400')}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="p-3">
              {sidebarTab === 'queue' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                      <Zap className="w-3.5 h-3.5 text-gold" /> Draft Queue
                      {queue.length > 0 && <span className="bg-gold text-field-950 text-[10px] font-black px-1.5 py-0.5 rounded-full">{queue.length}</span>}
                    </div>
                    {queue.length > 0 && <button className="text-xs text-field-400 hover:text-red-400 transition-colors" onClick={() => setQueue([])}>Clear</button>}
                  </div>
                  {queue.length === 0 ? (
                    <p className="text-field-500 text-xs text-center py-3">
                      {autoDraft ? 'Autodraft is ON — AI is picking for you.'
                        : isMyTurn && !isPaused ? "It's your pick! Select a player."
                        : 'Hit "+ Queue" on any player. First available auto-picks when timer expires.'}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {queuedPlayers.map((p, idx) => (
                        <div key={p.id} className="flex items-center gap-1.5 bg-field-800 rounded-lg p-2">
                          <span className="text-field-500 text-xs font-bold w-4 shrink-0">{idx + 1}</span>
                          <span className={`pos-badge pos-${p.pos} text-[10px]`}>{p.pos}</span>
                          <span className="text-white text-xs font-bold truncate flex-1">{p.name}</span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button className="w-5 h-5 flex items-center justify-center btn-ghost !p-0 disabled:opacity-20" disabled={idx === 0} onClick={() => moveQueueItem(idx, -1)}><ChevronUp className="w-3 h-3" /></button>
                            <button className="w-5 h-5 flex items-center justify-center btn-ghost !p-0 disabled:opacity-20" disabled={idx === queuedPlayers.length - 1} onClick={() => moveQueueItem(idx, 1)}><ChevronDown className="w-3 h-3" /></button>
                            <button className="w-5 h-5 flex items-center justify-center btn-ghost !p-0 text-red-400" onClick={() => removeFromQueue(p.id)}>✕</button>
                          </div>
                        </div>
                      ))}
                      <p className="text-field-600 text-xs text-center mt-1">First queued player auto-picks when timer expires.</p>
                    </div>
                  )}
                </div>
              )}

              {sidebarTab === 'roster' && (
                <div>
                  <div className="text-xs font-bold text-field-400 uppercase tracking-wider mb-2">My Picks ({myPicks.length})</div>
                  {myPicks.length === 0
                    ? <p className="text-field-500 text-xs text-center py-3">No picks yet</p>
                    : <div className="space-y-1 max-h-[360px] overflow-y-auto">
                        {myPicks.map(pick => (
                          <div key={pick.id} className="flex items-center gap-2 bg-field-800 rounded p-1.5">
                            <span className="text-field-500 text-xs w-5 shrink-0">R{pick.round_number}</span>
                            <span className={`pos-badge pos-${pick.player?.pos} text-[10px]`}>{pick.player?.pos}</span>
                            <div className="min-w-0 flex-1">
                              <div className="text-white text-xs font-bold truncate">{pick.player?.name}</div>
                              <div className="text-field-500 text-xs">{pick.player?.team}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                  }
                </div>
              )}

              {sidebarTab === 'board' && (
                <div>
                  <div className="text-xs font-bold text-field-400 uppercase tracking-wider mb-2">Recent Picks</div>
                  <div className="space-y-1 max-h-72 overflow-y-auto">
                    {picks.slice(-12).reverse().map(pick => {
                      const picker = members.find((m: any) => m.user_id === pick.user_id)
                      return (
                        <div key={pick.id} className="flex items-center gap-2 text-xs">
                          <span className="text-field-500 shrink-0 w-6">#{pick.pick_number}</span>
                          <span className={`pos-badge pos-${pick.player?.pos} text-[10px]`}>{pick.player?.pos}</span>
                          <span className="text-white font-bold truncate">{pick.player?.name}</span>
                          <span className="text-field-400 shrink-0 truncate max-w-[55px] text-xs">
                            {(picker as any)?.profile?.display_name || (picker as any)?.profile?.username}
                          </span>
                        </div>
                      )
                    })}
                    {picks.length === 0 && <p className="text-field-400 text-xs">No picks yet</p>}
                  </div>
                </div>
              )}

              {sidebarTab === 'order' && (
                <div>
                  <div className="text-xs font-bold text-field-400 uppercase tracking-wider mb-2">Draft Order</div>
                  <div className="space-y-1">
                    {members.map((m: any, i: number) => {
                      const isOnClock = m.user_id === draftState.current_user_id
                      return (
                        <div key={m.id} className={clsx('flex items-center justify-between text-xs p-1.5 rounded', isOnClock && 'bg-gold/10 border border-gold/30')}>
                          <div className="flex items-center gap-1.5">
                            <span className="text-field-500 w-3">{i + 1}</span>
                            <span className={clsx('font-bold', isOnClock ? 'text-gold' : 'text-white')}>
                              {m.profile?.display_name || m.profile?.username || 'Unknown'}
                            </span>
                            {isOnClock && !isPaused && <Clock className="w-3 h-3 text-gold animate-pulse" />}
                          </div>
                          <span className="text-field-400">{picks.filter(p => p.user_id === m.user_id).length} picks</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full draft board */}
      <div id="draft-board-section" className="mt-6">
        <DraftBoard picks={picks} members={members} totalTeams={totalTeams} numRounds={numRounds} currentPick={draftState.current_pick} />
      </div>
    </div>
  )
}

// ── Commissioner Timer Picker ──────────────────────────────────────────
function CommissionerTimerPicker({ current, onChange }: { current: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const currentLabel = TIMER_OPTIONS.find(o => o.value === current)?.label ?? `${current}s`
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors bg-field-800 border-field-700 text-field-400 hover:border-field-500 hover:text-white" title="Change pick timer">
        <Timer className="w-3.5 h-3.5" />{currentLabel}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-field-800 border border-field-700 rounded-lg shadow-xl p-1 min-w-[110px]">
          {TIMER_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false) }}
              className={clsx('w-full text-left text-xs px-3 py-1.5 rounded hover:bg-field-700 transition-colors', opt.value === current ? 'text-gold font-bold' : 'text-field-300')}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Full Draft Board ───────────────────────────────────────────────────
function DraftBoard({ picks, members, totalTeams, numRounds, currentPick }: {
  picks: DraftPickWithPlayer[]; members: any[]; totalTeams: number; numRounds: number; currentPick: number
}) {
  const rounds = Array.from({ length: numRounds }, (_, i) => i + 1)
  function getPickerIndex(pick: number): number {
    const pickInRound = (pick - 1) % totalTeams
    const round = Math.ceil(pick / totalTeams)
    return (round % 2 === 0) ? totalTeams - 1 - pickInRound : pickInRound
  }
  return (
    <div className="panel !p-0 overflow-hidden">
      <div className="px-3 py-2 border-b border-field-700 flex items-center justify-between">
        <span className="text-xs font-bold text-field-400 uppercase tracking-wider">Draft Board</span>
        <span className="text-xs text-field-500">{picks.length} of {totalTeams * numRounds} picks made</span>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse" style={{ width: '100%', minWidth: `${totalTeams * 112 + 48}px` }}>
          <thead>
            <tr className="bg-field-900 border-b border-field-700">
              <th className="text-field-500 text-xs font-bold uppercase tracking-wider p-2 w-10 text-center">Rd</th>
              {members.map((m: any, i: number) => (
                <th key={m.id} className="text-center px-1 py-2" style={{ width: 112 }}>
                  <div className="text-xs font-bold text-field-300 truncate" style={{ maxWidth: 100, margin: '0 auto' }}>
                    {m.profile?.display_name || m.profile?.username || `Team ${i + 1}`}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rounds.map(r => {
              const isEvenRound = r % 2 === 0
              const displayMembers = isEvenRound ? [...members].reverse() : members
              return (
                <tr key={r} className="border-b border-field-800">
                  <td className="text-field-500 text-xs font-bold text-center p-2 bg-field-900">
                    {r}{isEvenRound && <div className="text-[8px] text-field-600">↩</div>}
                  </td>
                  {displayMembers.map((m: any, colIdx: number) => {
                    const pickNumber = (r - 1) * totalTeams + (isEvenRound ? totalTeams - colIdx : colIdx + 1)
                    const pick = picks.find(p => p.pick_number === pickNumber)
                    const isCurrentPick = pickNumber === currentPick
                    const isMine = m.user_id === pick?.user_id
                    return (
                      <td key={m.id} className={clsx('px-1 py-1.5 text-center align-top',
                        isCurrentPick && 'bg-gold/10 ring-1 ring-inset ring-gold/30',
                        isMine && !isCurrentPick && 'bg-field-800/50')} style={{ width: 112 }}>
                        {pick ? (
                          <div>
                            <div className="flex items-center justify-center gap-1 mb-0.5">
                              <span className={`pos-badge pos-${pick.player?.pos}`} style={{ fontSize: 9 }}>{pick.player?.pos}</span>
                              <span className={clsx('text-[9px]', pick.player?.league === 'NFL' ? 'text-nfl' : 'text-cfb')}>{pick.player?.league}</span>
                            </div>
                            <div className="text-white font-bold" style={{ fontSize: 10, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '0 auto' }} title={pick.player?.name}>{pick.player?.name}</div>
                            <div className="text-field-500 mt-0.5" style={{ fontSize: 9 }}>{pick.player?.team}</div>
                          </div>
                        ) : isCurrentPick ? (
                          <div className="text-gold text-[10px] font-bold animate-pulse py-2">On clock</div>
                        ) : pickNumber < currentPick ? (
                          <div className="text-field-700 text-xs py-3">·</div>
                        ) : (
                          <div className="text-field-800 text-[10px] py-3">#{pickNumber}</div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Pre-Draft Lobby ────────────────────────────────────────────────────
function PreDraftLobby({ league, members, isCommissioner, draftState }: any) {
  const startDraft = useStartDraft()
  const scheduleDraft = useScheduleDraft()
  const cancelSchedule = useCancelSchedule()
  const [showScheduler, setShowScheduler] = useState(false)
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const isScheduled = draftState?.status === 'scheduled'
  const scheduledAt = isScheduled && draftState?.pick_started_at ? new Date(draftState.pick_started_at) : null
  const [countdown, setCountdown] = useState('')
  useEffect(() => {
    if (!scheduledAt) return
    const tick = () => {
      const diff = scheduledAt.getTime() - Date.now()
      if (diff <= 0) { setCountdown('Ready to start!'); return }
      const h = Math.floor(diff / 3_600_000), m = Math.floor((diff % 3_600_000) / 60_000), s = Math.floor((diff % 60_000) / 1_000)
      setCountdown(h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`)
    }
    tick(); const id = setInterval(tick, 1_000); return () => clearInterval(id)
  }, [scheduledAt])
  const minDateTime = new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)
  const handleSchedule = () => {
    if (!scheduledDate || !scheduledTime) return
    const dt = new Date(`${scheduledDate}T${scheduledTime}`)
    if (isNaN(dt.getTime()) || dt.getTime() < Date.now()) return
    scheduleDraft.mutate(dt.toISOString()); setShowScheduler(false)
  }
  return (
    <div className="space-y-5">
      <div className="panel text-center">
        <div className="text-gold font-black text-2xl mb-1">{league?.name}</div>
        <div className="text-field-400">Draft Lobby</div>
        {isScheduled && scheduledAt && (
          <div className="mt-3 inline-flex items-center gap-2 bg-gold/10 border border-gold/30 rounded-lg px-4 py-2">
            <Calendar className="w-4 h-4 text-gold" />
            <div className="text-left">
              <div className="text-gold font-bold text-sm">Draft scheduled for {scheduledAt.toLocaleDateString()} at {scheduledAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              <div className="text-field-300 text-xs">Starting in {countdown}</div>
            </div>
          </div>
        )}
      </div>
      <div className="panel">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-gold" />
          <span className="text-xs font-bold text-field-400 uppercase tracking-wider">Teams Joined ({members.length}/{league?.num_teams})</span>
          {members.length >= (league?.num_teams ?? 2) && <span className="ml-auto flex items-center gap-1 text-xs text-green-400 font-bold"><CheckCircle className="w-3.5 h-3.5" /> League Full</span>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {members.map((m: any, i: number) => (
            <div key={m.id} className="flex items-center gap-2 bg-field-800 rounded-lg p-2.5 border border-field-700">
              <span className="text-field-500 text-xs w-4 shrink-0">{i + 1}</span>
              <div className="w-7 h-7 rounded-full bg-field-700 flex items-center justify-center text-xs font-bold text-gold shrink-0">
                {(m.profile?.display_name || m.profile?.username || '?')[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">{m.profile?.display_name || m.profile?.username}</div>
                <div className="text-xs text-field-400 truncate">{m.team_name}</div>
              </div>
            </div>
          ))}
          {Array.from({ length: Math.max(0, (league?.num_teams ?? 10) - members.length) }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 bg-field-800/30 border border-dashed border-field-700 rounded-lg p-2.5">
              <span className="text-field-500 text-xs italic">Open slot</span>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="flex items-center gap-2 mb-3">
          <Settings className="w-4 h-4 text-gold" />
          <span className="text-xs font-bold text-field-400 uppercase tracking-wider">Draft Settings</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center text-sm mb-5">
          <div className="bg-field-800 rounded-lg p-2.5"><div className="text-field-400 text-xs mb-1">Format</div><div className="text-white font-bold capitalize">{league?.scoring_type?.replace('_', '-')}</div></div>
          <div className="bg-field-800 rounded-lg p-2.5"><div className="text-field-400 text-xs mb-1">Draft Type</div><div className="text-white font-bold capitalize">{league?.draft_type}</div></div>
          <div className="bg-field-800 rounded-lg p-2.5"><div className="text-field-400 text-xs mb-1">Pick Timer</div><div className="text-white font-bold">{league?.draft_pick_timer ? `${league.draft_pick_timer}s` : 'None'}</div></div>
        </div>
        {isCommissioner ? (
          <div className="space-y-3">
            <button className="btn-gold w-full text-base py-3" onClick={() => startDraft.mutate()} disabled={startDraft.isPending}>
              <Play className="w-5 h-5" />{startDraft.isPending ? 'Starting Draft…' : 'Start Draft Now'}
            </button>
            {!isScheduled ? (
              <button className="btn-outline w-full" onClick={() => setShowScheduler(v => !v)}><Calendar className="w-4 h-4" />Schedule Draft for Later</button>
            ) : (
              <div className="space-y-2">
                <div className="text-xs text-field-400 text-center">Draft is scheduled. You can still start early above, or cancel.</div>
                <button className="btn-ghost w-full text-red-400 border border-red-400/30 hover:bg-red-400/10" onClick={() => cancelSchedule.mutate()} disabled={cancelSchedule.isPending}>
                  <X className="w-4 h-4" />Cancel Schedule
                </button>
              </div>
            )}
            {showScheduler && !isScheduled && (
              <div className="bg-field-800 border border-field-700 rounded-lg p-4 space-y-3">
                <div className="text-sm font-bold text-white mb-1">Set Draft Date & Time</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Date</label><input type="date" className="input" min={minDateTime.slice(0, 10)} value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} /></div>
                  <div><label className="label">Time</label><input type="time" className="input" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} /></div>
                </div>
                <p className="text-field-500 text-xs">The draft will not start automatically — you still need to press "Start Draft Now".</p>
                <div className="flex gap-2">
                  <button className="btn-ghost flex-1" onClick={() => setShowScheduler(false)}>Cancel</button>
                  <button className="btn-gold flex-1" onClick={handleSchedule} disabled={!scheduledDate || !scheduledTime || scheduleDraft.isPending}>
                    <Calendar className="w-4 h-4" />{scheduleDraft.isPending ? 'Saving…' : 'Save Schedule'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            {isScheduled && scheduledAt ? (
              <div className="bg-field-800 rounded-lg p-4">
                <Calendar className="w-8 h-8 text-gold/60 mx-auto mb-2" />
                <div className="text-white font-bold">Draft Scheduled</div>
                <div className="text-field-400 text-sm mt-1">{scheduledAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {scheduledAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                <div className="text-gold font-bold mt-2">{countdown}</div>
              </div>
            ) : (
              <div className="bg-field-800 rounded-lg p-4">
                <Clock className="w-8 h-8 text-gold/40 mx-auto mb-2" />
                <div className="text-field-400">Waiting for the commissioner to start the draft</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Completed Draft ────────────────────────────────────────────────────
function CompletedDraft({ picks, members, totalTeams, numRounds }: {
  picks: DraftPickWithPlayer[]; members: any[]; totalTeams: number; numRounds: number
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <CheckCircle className="w-6 h-6 text-gold" />
        <h1 className="section-title">Draft Complete 🏆</h1>
      </div>
      <div className="panel !p-0 overflow-x-auto">
        <table className="data-table w-full min-w-[600px]">
          <thead>
            <tr>
              <th className="w-12">Rd</th>
              {members.map((m: any) => (
                <th key={m.id} className="text-center text-xs px-1"><div className="truncate max-w-[80px]">{m.profile?.display_name || m.profile?.username}</div></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: numRounds }).map((_, r) => {
              const roundPicks = picks.filter(p => p.round_number === r + 1)
              const displayMembers = (r + 1) % 2 === 0 ? [...members].reverse() : members
              return (
                <tr key={r}>
                  <td className="text-field-400 font-bold text-sm text-center">{r + 1}</td>
                  {displayMembers.map((m: any) => {
                    const pick = roundPicks.find(p => p.user_id === m.user_id)
                    return (
                      <td key={m.id} className="text-center text-xs px-1 py-2">
                        {pick ? (
                          <div>
                            <span className={clsx('pos-badge text-[10px]', `pos-${pick.player?.pos}`)}>{pick.player?.pos}</span>
                            <div className="text-white font-bold truncate max-w-[80px] mx-auto text-xs mt-0.5">{pick.player?.name}</div>
                          </div>
                        ) : <span className="text-field-700">—</span>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
