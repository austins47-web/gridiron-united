import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import { usePlayers, DEFAULT_FILTERS } from '@/hooks/usePlayers'
import {
  Play, Pause, Plus, Users, Clock, Settings, Copy, Search,
  Zap, ChevronDown, ChevronUp, ArrowLeft, CheckCircle,
  Bot, User, X, Trophy, RefreshCw, Share2
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import type { Player } from '@/types/database'

// ─── Types ─────────────────────────────────────────────────────────────
interface MockDraft {
  id: string
  created_by: string
  invite_code: string
  name: string
  num_teams: number
  scoring_type: string
  draft_type: string
  pick_timer: number
  num_rounds: number
  player_pool: string
  status: 'lobby' | 'in_progress' | 'paused' | 'completed'
  current_pick: number
  current_round: number
  current_user_id: string | null
  pick_started_at: string | null
  created_at: string
}

interface MockSlot {
  id: string
  mock_draft_id: string
  slot_number: number
  user_id: string | null
  team_name: string
  is_host: boolean
  profile?: { username: string; display_name: string | null }
}

interface MockPick {
  id: string
  mock_draft_id: string
  slot_number: number
  user_id: string | null
  player_id: number
  pick_number: number
  round_number: number
  pick_in_round: number
  is_ai_pick: boolean
  player?: Player
}

// ── AI Draft Engine ────────────────────────────────────────────────────
// Standard fantasy roster targets (what a full team looks like)
const ROSTER_TARGETS: Record<string, number> = {
  QB: 2, RB: 5, WR: 5, TE: 2, K: 1, DST: 1,
}

// Positional scarcity: how fast does value drop off at this position?
// Higher = more scarce = draft earlier
const SCARCITY: Record<string, number> = {
  QB: 0.6,   // QBs are deep — wait
  RB: 1.4,   // RBs are scarce — prioritize
  WR: 1.2,   // WRs are deep but need volume
  TE: 1.1,   // Top TEs scarce, rest are thin
  K: 0.1,    // Always wait on kickers
  DST: 0.2,  // Always wait on DST
}

// AI personality archetypes — each AI gets one, locked for the draft
// This makes teams feel different and realistic
type AiPersonality = 'zero_rb' | 'robust_rb' | 'te_premium' | 'qb_early' | 'balanced' | 'bpa'

const PERSONALITIES: AiPersonality[] = ['zero_rb', 'robust_rb', 'te_premium', 'qb_early', 'balanced', 'bpa']

// Per-personality position value multipliers (on top of base scoring)
const PERSONALITY_MODS: Record<AiPersonality, Record<string, number>> = {
  zero_rb:    { QB: 1.0, RB: 0.55, WR: 1.5, TE: 1.1, K: 1.0, DST: 1.0 },
  robust_rb:  { QB: 0.9, RB: 1.6,  WR: 0.9, TE: 0.9, K: 1.0, DST: 1.0 },
  te_premium: { QB: 0.9, RB: 1.1,  WR: 1.0, TE: 1.8, K: 1.0, DST: 1.0 },
  qb_early:   { QB: 1.8, RB: 1.0,  WR: 1.0, TE: 0.9, K: 1.0, DST: 1.0 },
  balanced:   { QB: 1.0, RB: 1.2,  WR: 1.1, TE: 1.0, K: 1.0, DST: 1.0 },
  bpa:        { QB: 1.0, RB: 1.0,  WR: 1.0, TE: 1.0, K: 1.0, DST: 1.0 }, // pure ADP
}

// Assign a stable personality per slot (deterministic from slot number)
function getPersonality(slotNum: number): AiPersonality {
  return PERSONALITIES[slotNum % PERSONALITIES.length]
}

// How urgently does this team need this position?
// Returns a multiplier: >1 = need it, <1 = already stacked
function needScore(
  pos: string,
  myTeam: Player[],
  round: number,
  totalRounds: number,
  scoringType: string,
): number {
  const have = myTeam.filter(p => p.pos === pos).length
  const target = ROSTER_TARGETS[pos] ?? 1
  const remaining = totalRounds - round  // picks left after this one

  // Hard caps — don't draft more than this ever
  const hardCap: Record<string, number> = { QB: 2, RB: 7, WR: 7, TE: 2, K: 1, DST: 1 }
  if (have >= (hardCap[pos] ?? 2)) return 0.0

  // Still need starters badly
  const need = Math.max(0, target - have)
  if (need === 0) {
    // Already at target — only pick for depth if rounds remain
    return remaining > 5 ? 0.4 : 0.2
  }

  // Urgency: need a starter and rounds are running out
  const urgency = Math.min(2.5, 1.0 + (need / Math.max(1, remaining)) * 3.0)

  // In PPR, WRs and TEs get a small boost; in standard, RBs get a boost
  let formatMod = 1.0
  if (pos === 'WR' || pos === 'TE') formatMod = scoringType === 'ppr' ? 1.15 : scoringType === 'half_ppr' ? 1.07 : 0.95
  if (pos === 'RB') formatMod = scoringType === 'standard' ? 1.15 : scoringType === 'half_ppr' ? 1.07 : 0.95

  return urgency * SCARCITY[pos] * formatMod
}

// How much value has this player fallen relative to their ADP?
// A player available 20 picks after their ADP is a steal
function valueScore(player: Player, currentPick: number): number {
  const fallback = Math.max(0, currentPick - (player.adp ?? currentPick))
  // Each pick they've "fallen" adds bonus value, diminishing returns
  return 1.0 + Math.min(1.5, fallback * 0.04)
}

/**
 * Main AI pick function.
 * Combines:
 *   1. ADP (baseline value)
 *   2. Team needs (what positions are thin?)
 *   3. Value over ADP (steals)
 *   4. Personality (draft archetype)
 *   5. Scarcity (positional depth falloff)
 *   6. Small noise (so AI teams aren't perfectly identical)
 */
function aiPickPlayer(
  available: Player[],
  round: number,
  totalRounds: number,
  currentPick: number,
  takenBySlot: Map<number, Player[]>,
  slotNum: number,
  scoringType: string,
): Player | null {
  if (!available.length) return null

  const myTeam = takenBySlot.get(slotNum) ?? []
  const personality = getPersonality(slotNum)
  const personalityMods = PERSONALITY_MODS[personality]

  // Consider top available players by ADP (not just top 40 — expand window in later rounds)
  const windowSize = round <= 3 ? 30 : round <= 8 ? 50 : 80
  const pool = available.slice(0, windowSize)

  const scored = pool.map(p => {
    // 1. Base ADP value — inverse of ADP rank so lower ADP = higher score
    const adp = p.adp ?? 999
    const adpBase = 1000 / (adp + 1)

    // 2. Team need at this position
    const need = needScore(p.pos, myTeam, round, totalRounds, scoringType)
    if (need === 0) return { player: p, score: 0 } // hard skip

    // 3. Value vs ADP (steal factor)
    const steal = valueScore(p, currentPick)

    // 4. Personality modifier
    const personality_mod = personalityMods[p.pos] ?? 1.0

    // 5. Tiny noise to differentiate picks (±8%)
    const noise = 0.96 + Math.random() * 0.08

    const score = adpBase * need * steal * personality_mod * noise
    return { player: p, score }
  })

  scored.sort((a, b) => b.score - a.score)

  // Safety: if top pick scored 0 (all capped), fall back to pure best ADP
  const best = scored[0]
  if (!best || best.score === 0) return pool[0] ?? null

  return best.player
}

// ─── Main Hub ────────────────────────────────────────────────────────────
type View = 'home' | 'create' | 'lobby' | 'draft' | 'results'

export function MockDraftHub() {
  const { user, profile } = useAppStore()
  const [view, setView] = useState<View>('home')
  const [activeMock, setActiveMock] = useState<MockDraft | null>(null)
  const [mySlot, setMySlot] = useState<MockSlot | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const qc = useQueryClient()

  // My recent mocks
  const { data: myMocks = [] } = useQuery({
    queryKey: ['my-mocks', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('mock_drafts')
        .select('*')
        .eq('created_by', user!.id)
        .order('created_at', { ascending: false })
        .limit(10)
      return (data ?? []) as MockDraft[]
    },
  })

  const joinMock = useMutation({
    mutationFn: async (code: string) => {
      const { data: mock, error } = await supabase
        .from('mock_drafts')
        .select('*')
        .eq('invite_code', code.toUpperCase().trim())
        .single()
      if (error || !mock) throw new Error('Invalid invite code')

      // Find open slot
      const { data: slots } = await supabase
        .from('mock_draft_slots')
        .select('*')
        .eq('mock_draft_id', mock.id)
        .order('slot_number')

      const alreadyJoined = slots?.find(s => s.user_id === user!.id)
      if (alreadyJoined) {
        return { mock: mock as MockDraft, slot: alreadyJoined as MockSlot }
      }

      const taken = new Set(slots?.map(s => s.slot_number) ?? [])
      let openSlot = null
      for (let i = 1; i <= mock.num_teams; i++) {
        if (!taken.has(i)) { openSlot = i; break }
      }
      if (!openSlot) throw new Error('This mock draft is full')

      const { data: newSlot, error: se } = await supabase
        .from('mock_draft_slots')
        .insert({
          mock_draft_id: mock.id,
          slot_number: openSlot,
          user_id: user!.id,
          team_name: profile?.display_name || profile?.username || 'My Team',
          is_host: false,
        })
        .select()
        .single()
      if (se) throw se
      return { mock: mock as MockDraft, slot: newSlot as MockSlot }
    },
    onSuccess: ({ mock, slot }) => {
      setActiveMock(mock)
      setMySlot(slot)
      setView(mock.status === 'in_progress' ? 'draft' : 'lobby')
      qc.invalidateQueries({ queryKey: ['mock-slots', mock.id] })
    },
    onError: (e: any) => toast.error(e.message),
  })

  if (view === 'create') {
    return <CreateMockDraft
      onCreated={(mock, slot) => { setActiveMock(mock); setMySlot(slot); setView('lobby') }}
      onBack={() => setView('home')}
    />
  }
  if ((view === 'lobby' || view === 'draft' || view === 'results') && activeMock && mySlot) {
    return <MockDraftRoom
      mock={activeMock}
      mySlot={mySlot}
      onMockUpdated={setActiveMock}
      onBack={() => { setActiveMock(null); setMySlot(null); setView('home') }}
    />
  }

  // Home
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Trophy className="w-6 h-6 text-gold" />
        <div>
          <h1 className="section-title">Mock Draft</h1>
          <p className="text-field-400 text-sm">Practice your strategy. Invite friends. Draft against AI.</p>
        </div>
      </div>

      {/* Actions */}
      <div className="grid sm:grid-cols-2 gap-4">
        <button
          className="panel hover:border-gold/40 border-2 border-transparent transition-colors text-left group"
          onClick={() => setView('create')}
        >
          <Plus className="w-8 h-8 text-gold mb-3" />
          <div className="font-bold text-white text-lg mb-1">Create Mock Draft</div>
          <p className="text-field-400 text-sm">Set up your own room with custom settings, invite friends, or fill with AI.</p>
        </button>

        <div className="panel space-y-3">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-gold" />
            <span className="font-bold text-white">Join with Code</span>
          </div>
          <p className="text-field-400 text-sm">Have an invite code from a friend? Enter it below.</p>
          <input
            className="input text-center text-xl tracking-widest font-mono uppercase"
            placeholder="ABC123"
            maxLength={6}
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && joinCode.length >= 4 && joinMock.mutate(joinCode)}
          />
          <button
            className="btn-gold w-full"
            disabled={joinCode.length < 4 || joinMock.isPending}
            onClick={() => joinMock.mutate(joinCode)}
          >
            {joinMock.isPending ? 'Joining…' : 'Join Draft'}
          </button>
        </div>
      </div>

      {/* Recent mocks */}
      {myMocks.length > 0 && (
        <div>
          <h2 className="section-title text-sm mb-3">Recent Mock Drafts</h2>
          <div className="space-y-2">
            {myMocks.map(mock => (
              <div key={mock.id} className="panel flex items-center gap-2 hover:border-gold/20 border border-transparent transition-colors group">
                <button
                  className="flex-1 text-left min-w-0"
                  onClick={async () => {
                    const { data: slot } = await supabase
                      .from('mock_draft_slots')
                      .select('*')
                      .eq('mock_draft_id', mock.id)
                      .eq('user_id', user!.id)
                      .single()
                    if (slot) { setActiveMock(mock); setMySlot(slot as MockSlot); setView(mock.status === 'in_progress' || mock.status === 'paused' ? 'draft' : mock.status === 'completed' ? 'results' : 'lobby') }
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-white font-bold truncate">{mock.name}</div>
                      <div className="text-field-400 text-xs flex gap-3 mt-0.5">
                        <span>{mock.num_teams} teams</span>
                        <span className="uppercase">{mock.scoring_type.replace('_','-')}</span>
                        <span>{mock.num_rounds} rounds</span>
                        {mock.pick_timer > 0 && <span>{mock.pick_timer}s/pick</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={clsx(
                        'text-xs font-bold px-2 py-1 rounded uppercase',
                        mock.status === 'completed' ? 'bg-green-400/10 text-green-400' :
                        mock.status === 'in_progress' ? 'bg-gold/20 text-gold animate-pulse' :
                        mock.status === 'paused' ? 'bg-yellow-400/10 text-yellow-400' :
                        'bg-field-700 text-field-400'
                      )}>
                        {mock.status === 'in_progress' ? 'Live' : mock.status}
                      </span>
                      <span className="text-field-500 text-xs font-mono">{mock.invite_code}</span>
                    </div>
                  </div>
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1.5 text-field-500 hover:text-red-400 rounded"
                  title="Delete mock draft"
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (!confirm(`Delete "${mock.name}"? This cannot be undone.`)) return
                    // Delete child rows first (picks, slots), then the parent (cascade would work
                    // too but explicit ordering avoids RLS edge cases)
                    const { error: picksErr } = await supabase
                      .from('mock_draft_picks').delete().eq('mock_draft_id', mock.id)
                    if (picksErr) { toast.error('Could not delete picks: ' + picksErr.message); return }

                    const { error: slotsErr } = await supabase
                      .from('mock_draft_slots').delete().eq('mock_draft_id', mock.id)
                    if (slotsErr) { toast.error('Could not delete slots: ' + slotsErr.message); return }

                    const { error: draftErr } = await supabase
                      .from('mock_drafts').delete().eq('id', mock.id)
                    if (draftErr) { toast.error('Could not delete draft: ' + draftErr.message); return }

                    try { localStorage.removeItem(`mock-queue-${mock.id}`) } catch {}
                    qc.invalidateQueries({ queryKey: ['my-mocks', user?.id] })
                    toast.success('Mock draft deleted')
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Create Mock Draft ─────────────────────────────────────────────────
function CreateMockDraft({ onCreated, onBack }: {
  onCreated: (mock: MockDraft, slot: MockSlot) => void
  onBack: () => void
}) {
  const { user, profile } = useAppStore()
  const [name, setName] = useState('Mock Draft')
  const [numTeams, setNumTeams] = useState(10)
  const [myPosition, setMyPosition] = useState<number | 'random'>(1)
  const [scoringType, setScoringType] = useState('ppr')
  const [draftType, setDraftType] = useState('snake')
  const [pickTimer, setPickTimer] = useState(60)
  const [numRounds, setNumRounds] = useState(15)
  const [playerPool, setPlayerPool] = useState('nfl')
  const [humanSlots, setHumanSlots] = useState<Set<number>>(new Set([1]))
  const [creating, setCreating] = useState(false)

  const toggleHumanSlot = (n: number) => {
    setHumanSlots(prev => {
      const next = new Set(prev)
      if (next.has(n)) { if (next.size > 1) next.delete(n) }
      else next.add(n)
      return next
    })
  }

  // When myPosition changes, make sure that slot is human
  useEffect(() => {
    if (myPosition !== 'random') {
      setHumanSlots(prev => new Set([...prev, myPosition as number]))
    }
  }, [myPosition])

  const handleCreate = async () => {
    if (!user) return
    setCreating(true)
    try {
      // Determine my actual slot number
      const actualPosition = myPosition === 'random'
        ? Math.floor(Math.random() * numTeams) + 1
        : myPosition as number

      // Create mock draft
      const { data: mock, error: me } = await supabase
        .from('mock_drafts')
        .insert({
          created_by: user.id,
          name,
          num_teams: numTeams,
          scoring_type: scoringType,
          draft_type: draftType,
          pick_timer: pickTimer,
          num_rounds: numRounds,
          player_pool: playerPool,
          status: 'lobby',
        })
        .select()
        .single()
      if (me) throw me

      // Create all slots — human slots get user_id placeholder, AI slots get null
      const allSlots = Array.from({ length: numTeams }, (_, i) => ({
        mock_draft_id: mock.id,
        slot_number: i + 1,
        user_id: i + 1 === actualPosition ? user.id : null,
        team_name: i + 1 === actualPosition
          ? (profile?.display_name || profile?.username || 'My Team')
          : humanSlots.has(i + 1) && i + 1 !== actualPosition
          ? `Open Slot ${i + 1}`
          : `AI Team ${i + 1}`,
        is_host: i + 1 === actualPosition,
      }))

      const { error: se } = await supabase.from('mock_draft_slots').insert(allSlots)
      if (se) throw se

      // Get my slot back
      const { data: mySlotData } = await supabase
        .from('mock_draft_slots')
        .select('*')
        .eq('mock_draft_id', mock.id)
        .eq('slot_number', actualPosition)
        .single()

      onCreated(mock as MockDraft, mySlotData as MockSlot)
      toast.success('Mock draft created!')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <button className="btn-ghost !py-1 !px-2" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="section-title">Create Mock Draft</h1>
      </div>

      {/* Name */}
      <div className="panel space-y-3">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Settings className="w-4 h-4 text-gold" /> Basic Settings
        </h3>
        <div>
          <label className="label">Draft Name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="My Mock Draft" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Teams</label>
            <select className="input" value={numTeams} onChange={e => { setNumTeams(+e.target.value); setMyPosition(1) }}>
              {[8, 10, 12, 14].map(n => <option key={n} value={n}>{n} teams</option>)}
            </select>
          </div>
          <div>
            <label className="label">My Draft Position</label>
            <select className="input" value={myPosition} onChange={e => setMyPosition(e.target.value === 'random' ? 'random' : +e.target.value)}>
              <option value="random">🎲 Random</option>
              {Array.from({ length: numTeams }, (_, i) => (
                <option key={i + 1} value={i + 1}>Pick #{i + 1}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Scoring</label>
            <select className="input" value={scoringType} onChange={e => setScoringType(e.target.value)}>
              <option value="ppr">PPR</option>
              <option value="half_ppr">Half PPR</option>
              <option value="standard">Standard</option>
            </select>
          </div>
          <div>
            <label className="label">Draft Type</label>
            <select className="input" value={draftType} onChange={e => setDraftType(e.target.value)}>
              <option value="snake">Snake</option>
              <option value="linear">Linear</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Rounds</label>
            <select className="input" value={numRounds} onChange={e => setNumRounds(+e.target.value)}>
              {[10, 12, 15, 18, 20].map(n => <option key={n} value={n}>{n} rounds</option>)}
            </select>
          </div>
          <div>
            <label className="label">Player Pool</label>
            <select className="input" value={playerPool} onChange={e => setPlayerPool(e.target.value)}>
              <option value="nfl">NFL Only</option>
              <option value="cfb">CFB Only</option>
              <option value="both">NFL + CFB</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">Pick Timer</label>
          <div className="flex gap-2 items-center">
            <select className="input flex-1" value={pickTimer} onChange={e => setPickTimer(+e.target.value)}>
              <option value={0}>No timer</option>
              <option value={10}>10 seconds</option>
              <option value={15}>15 seconds</option>
              <option value={20}>20 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={45}>45 seconds</option>
              <option value={60}>1 minute</option>
              <option value={90}>90 seconds</option>
              <option value={120}>2 minutes</option>
              <option value={180}>3 minutes</option>
              <option value={300}>5 minutes</option>
              <option value={600}>10 minutes</option>
              <option value={900}>15 minutes</option>
            </select>
            <div className="flex items-center gap-1 text-field-400 text-sm shrink-0">
              <Clock className="w-4 h-4" />
              {pickTimer === 0 ? 'No limit' : `${pickTimer}s`}
            </div>
          </div>
        </div>
      </div>

      {/* Slot configuration */}
      <div className="panel space-y-3">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-gold" /> Draft Slots
        </h3>
        <p className="text-field-400 text-sm">
          Click a slot to mark it as open for a human to join. AI fills the rest automatically.
          Share the invite code after creating so friends can join their slots.
        </p>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: numTeams }, (_, i) => {
            const slot = i + 1
            const isMe = myPosition !== 'random' && slot === myPosition
            const isHuman = humanSlots.has(slot)
            return (
              <button
                key={slot}
                onClick={() => !isMe && toggleHumanSlot(slot)}
                className={clsx(
                  'flex flex-col items-center p-2.5 rounded-lg border-2 transition-all text-xs font-bold',
                  isMe
                    ? 'border-gold bg-gold/10 text-gold cursor-default'
                    : isHuman
                    ? 'border-blue-400/50 bg-blue-400/10 text-blue-400 hover:border-blue-400'
                    : 'border-field-700 bg-field-800 text-field-500 hover:border-field-600',
                )}
              >
                <span className="text-base mb-1">{isMe ? '👤' : isHuman ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}</span>
                <span>#{slot}</span>
                <span className="font-normal text-xs mt-0.5">
                  {isMe ? 'You' : isHuman ? 'Open' : 'AI'}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex gap-4 text-xs text-field-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-gold bg-gold/10 inline-block" /> You</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-blue-400/50 bg-blue-400/10 inline-block" /> Open (human)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-field-700 bg-field-800 inline-block" /> AI</span>
        </div>
      </div>

      <button className="btn-gold w-full text-base py-3" onClick={handleCreate} disabled={creating}>
        <Play className="w-5 h-5" />
        {creating ? 'Creating…' : 'Create Mock Draft'}
      </button>
    </div>
  )
}

// ─── Mock Draft Room (Lobby + Live Draft + Results) ───────────────────
function MockDraftRoom({ mock: initialMock, mySlot, onMockUpdated, onBack }: {
  mock: MockDraft
  mySlot: MockSlot
  onMockUpdated: (m: MockDraft) => void
  onBack: () => void
}) {
  const { user } = useAppStore()
  const qc = useQueryClient()

  // Core state
  const [mock, setMock] = useState(initialMock)
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('ALL')
  const [timer, setTimer] = useState(0)
  const [aiThinking, setAiThinking] = useState(false)
  const [autoDraft, setAutoDraft] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'queue' | 'roster' | 'board' | 'order'>('queue')

  // Queue: persisted in localStorage so it survives navigation
  const queueStorageKey = `mock-queue-${mock.id}`
  const [queue, setQueueRaw] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem(`mock-queue-${mock.id}`)
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })
  const setQueue = (updater: number[] | ((prev: number[]) => number[])) => {
    setQueueRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try { localStorage.setItem(`mock-queue-${mock.id}`, JSON.stringify(next)) } catch {}
      return next
    })
  }

  // Refs to avoid stale-closure issues in effects
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const submittingRef = useRef(false)
  const availableRef = useRef<Player[]>([])
  const queueRef = useRef<number[]>([])
  const autoDraftRef = useRef(false)
  const mockRef = useRef(mock)
  const slotsRef = useRef<MockSlot[]>([])
  const picksRef = useRef<MockPick[]>([])
  const mySlotRef = useRef(mySlot)
  // Tracks player IDs picked THIS session instantly — prevents duplicate picks
  // when the realtime subscription hasn't refreshed yet between fast picks
  const locallyPickedIds = useRef<Set<number>>(new Set())

  // Keep refs in sync with state/props
  useEffect(() => { mockRef.current = mock }, [mock])
  useEffect(() => { mySlotRef.current = mySlot }, [mySlot])
  useEffect(() => { autoDraftRef.current = autoDraft }, [autoDraft])

  const isHost = mySlot.is_host

  // Slots
  const { data: slots = [] } = useQuery({
    queryKey: ['mock-slots', mock.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('mock_draft_slots')
        .select('*, profile:profiles(username, display_name)')
        .eq('mock_draft_id', mock.id)
        .order('slot_number')
      return (data ?? []) as MockSlot[]
    },
  })

  // Picks
  const { data: picks = [] } = useQuery({
    queryKey: ['mock-picks', mock.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('mock_draft_picks')
        .select('*, player:players(*)')
        .eq('mock_draft_id', mock.id)
        .order('pick_number')
      return (data ?? []) as MockPick[]
    },
  })

  // Full unfiltered player pool for AI + auto-pick (not subject to search/pos filters)
  const { data: allPlayerData } = usePlayers({
    ...DEFAULT_FILTERS,
    league: mock.player_pool === 'nfl' ? 'NFL' : mock.player_pool === 'cfb' ? 'CFB' : 'ALL',
    pageSize: 300,
    sortBy: 'adp',
    sortDir: 'asc',
    rookiesOnly: false,
  })

  // Filtered pool shown in the UI table (subject to human search/pos filters)
  const { data: filteredPlayerData } = usePlayers({
    ...DEFAULT_FILTERS,
    search,
    pos: posFilter as any,
    league: mock.player_pool === 'nfl' ? 'NFL' : mock.player_pool === 'cfb' ? 'CFB' : 'ALL',
    pageSize: 120,
    sortBy: 'adp',
    sortDir: 'asc',
    rookiesOnly: false,
  })

  const takenIds = new Set(picks.map(p => p.player_id))
  const allAvailable = (allPlayerData?.players ?? []).filter(p => !takenIds.has(p.id))
  const displayAvailable = (filteredPlayerData?.players ?? []).filter(p => !takenIds.has(p.id))

  // Keep refs current for use in effects/callbacks
  useEffect(() => { availableRef.current = allAvailable }, [allAvailable])
  useEffect(() => { slotsRef.current = slots }, [slots])
  useEffect(() => { picksRef.current = picks }, [picks])
  useEffect(() => { queueRef.current = queue }, [queue])

  // Who's on the clock
  const amOnClock = mock.current_user_id === user?.id

  // Real-time subscriptions
  useEffect(() => {
    const channel = supabase
      .channel(`mock:${mock.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mock_drafts', filter: `id=eq.${mock.id}` }, payload => {
        const updated = payload.new as MockDraft
        setMock(updated)
        mockRef.current = updated
        onMockUpdated(updated)
        qc.invalidateQueries({ queryKey: ['mock-picks', mock.id] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mock_draft_slots', filter: `mock_draft_id=eq.${mock.id}` }, () => {
        qc.invalidateQueries({ queryKey: ['mock-slots', mock.id] })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mock_draft_picks', filter: `mock_draft_id=eq.${mock.id}` }, () => {
        qc.invalidateQueries({ queryKey: ['mock-picks', mock.id] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [mock.id])

  // ── Core helpers ──────────────────────────────────────────────────────
  function getPickerIndex(pick: number, teams: number, type: string): number {
    const pickInRound = (pick - 1) % teams
    const round = Math.ceil(pick / teams)
    if (type === 'snake' && round % 2 === 0) return teams - 1 - pickInRound
    return pickInRound
  }

  function getOnClockSlot(m: MockDraft, slotList: MockSlot[]): MockSlot | null {
    const idx = getPickerIndex(m.current_pick, m.num_teams, m.draft_type)
    return slotList[idx] ?? null
  }

  function isAiSlot(slot: MockSlot): boolean {
    return !slot.user_id
  }

  // ── Submit a pick (shared by human, AI, auto-pick) ────────────────────
  const submitPick = useCallback(async (playerId: number, isAi: boolean, pickingSlot: MockSlot) => {
    if (submittingRef.current) return
    // Duplicate guard: check both DB picks and locally-tracked picks
    // (realtime may not have propagated the previous pick yet)
    if (locallyPickedIds.current.has(playerId)) return
    submittingRef.current = true
    locallyPickedIds.current.add(playerId)  // mark immediately before any await

    try {
      const m = mockRef.current
      const currentSlots = slotsRef.current

      const nextPick = m.current_pick + 1
      const nextRound = Math.ceil(nextPick / m.num_teams)
      const nextPickerIdx = getPickerIndex(nextPick, m.num_teams, m.draft_type)
      const nextSlot = currentSlots[nextPickerIdx]
      const nextUserId = nextSlot?.user_id ?? null
      const isComplete = nextPick > m.num_teams * m.num_rounds

      await supabase.from('mock_draft_picks').insert({
        mock_draft_id: m.id,
        slot_number: pickingSlot.slot_number,
        user_id: isAi ? null : user!.id,
        player_id: playerId,
        pick_number: m.current_pick,
        round_number: m.current_round,
        pick_in_round: ((m.current_pick - 1) % m.num_teams) + 1,
        is_ai_pick: isAi,
      })

      await supabase.from('mock_drafts').update({
        current_pick: isComplete ? m.current_pick : nextPick,
        current_round: isComplete ? m.current_round : nextRound,
        current_user_id: isComplete ? null : nextUserId,
        status: isComplete ? 'completed' : 'in_progress',
        pick_started_at: new Date().toISOString(),
      }).eq('id', m.id)
    } finally {
      submittingRef.current = false
    }
  }, [user])

  // ── Helper: run the AI engine and submit a pick ─────────────────────
  const runAiPick = useCallback(async (pickingSlot: MockSlot) => {
    // Combine DB picks + locally-tracked picks (guards against race conditions)
    const currentTakenIds = new Set([
      ...picksRef.current.map(p => p.player_id),
      ...locallyPickedIds.current,
    ])
    const currentAvailable = availableRef.current.filter(p => !currentTakenIds.has(p.id))
    if (!currentAvailable.length) return

    const takenBySlotMap = new Map<number, Player[]>()
    picksRef.current.forEach(pk => {
      if (!takenBySlotMap.has(pk.slot_number)) takenBySlotMap.set(pk.slot_number, [])
      if (pk.player) takenBySlotMap.get(pk.slot_number)!.push(pk.player as Player)
    })

    const m = mockRef.current
    const pick = aiPickPlayer(
      currentAvailable,
      m.current_round,
      m.num_rounds,
      m.current_pick,
      takenBySlotMap,
      pickingSlot.slot_number,
      m.scoring_type,
    )
    if (pick) await submitPick(pick.id, !pickingSlot.user_id, pickingSlot)
  }, [submitPick])

  // ── AI pick trigger ────────────────────────────────────────────────────
  // Fires whenever the current pick changes or status changes.
  // autoDraft is intentionally NOT in the dependency array — we read it via
  // autoDraftRef so toggling autodraft mid-pick never kills an in-flight pick
  // or leaves the draft stuck waiting for the timer.
  useEffect(() => {
    if (mock.status !== 'in_progress') return
    if (aiThinking || submittingRef.current) return

    const onClockSlot = getOnClockSlot(mock, slots)
    if (!onClockSlot) return

    const slotIsAi = isAiSlot(onClockSlot)
    const slotIsMe = onClockSlot.user_id === user?.id

    // AI slots always auto-pick. Human slots only auto-pick when autodraft is on.
    // We read the ref, NOT the state, so this check doesn't re-trigger the effect.
    const shouldAutoAct = slotIsAi || (slotIsMe && autoDraftRef.current)
    if (!shouldAutoAct) return

    setAiThinking(true)
    const delay = 50  // near-instant for both AI and autodraft

    aiTimeoutRef.current = setTimeout(async () => {
      try {
        await runAiPick(onClockSlot)
      } finally {
        setAiThinking(false)
      }
    }, delay)

    return () => {
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current)
        aiTimeoutRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mock.current_pick, mock.current_user_id, mock.status, slots.length])
  // ^ autoDraft deliberately excluded — use autoDraftRef instead

  // ── Autodraft ON-switch: if you enable autodraft mid-turn, pick immediately ──
  useEffect(() => {
    if (!autoDraft) return
    if (mock.status !== 'in_progress') return
    if (aiThinking || submittingRef.current) return

    const onClockSlot = getOnClockSlot(mock, slots)
    if (!onClockSlot) return
    if (onClockSlot.user_id !== user?.id) return  // not my turn

    // It's my turn and I just turned autodraft on — pick right away
    setAiThinking(true)
    aiTimeoutRef.current = setTimeout(async () => {
      try {
        await runAiPick(onClockSlot)
      } finally {
        setAiThinking(false)
      }
    }, 50)

    return () => {
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current)
        aiTimeoutRef.current = null
      }
    }
  }, [autoDraft])  // only fires when autoDraft state changes

  // ── Timer + auto-pick on expiry ───────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    // Pause or non-timer: just show 0 and stop
    if (mock.status !== 'in_progress' || !mock.pick_timer) {
      setTimer(0)
      return
    }

    const pickLimit = mock.pick_timer
    const startedAt = mock.pick_started_at
      ? new Date(mock.pick_started_at).getTime()
      : Date.now()

    let expired = false

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      const remaining = Math.max(0, pickLimit - elapsed)
      setTimer(remaining)

      if (remaining === 0 && !expired && !submittingRef.current) {
        expired = true
        if (timerRef.current) clearInterval(timerRef.current)

        const m = mockRef.current
        const onClockSlot = getOnClockSlot(m, slotsRef.current)
        if (!onClockSlot) return

        const slotIsAi = isAiSlot(onClockSlot)
        const slotIsMe = onClockSlot.user_id === user?.id

        if (!slotIsAi && !slotIsMe) return  // another human handles their own expiry

        if (slotIsMe) {
          // Check queue first
          const currentTakenIds = new Set(picksRef.current.map(p => p.player_id))
          const myQueue = queueRef.current
          const queuedId = myQueue.find(id => !currentTakenIds.has(id))
          if (queuedId) {
            submitPick(queuedId, false, onClockSlot)
            setQueue(prev => prev.filter(id => id !== queuedId))
            return
          }
        }
        // AI slot, or human with no queue: run the smart AI engine
        runAiPick(onClockSlot)
      }
    }

    tick()
    timerRef.current = setInterval(tick, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [mock.pick_started_at, mock.status, mock.pick_timer, mock.current_pick, user?.id, runAiPick])

  // ── Queue helpers ─────────────────────────────────────────────────────
  const addToQueue = (playerId: number) => {
    setQueue(prev => prev.includes(playerId) ? prev : [...prev, playerId])
    toast.success('Added to queue')
  }

  const removeFromQueue = (playerId: number) => {
    setQueue(prev => prev.filter(id => id !== playerId))
  }

  const moveQueueItem = (idx: number, dir: -1 | 1) => {
    setQueue(prev => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  // ── Human pick ────────────────────────────────────────────────────────
  const handleHumanPick = async (playerId: number) => {
    if (!amOnClock || submittingRef.current) return
    const onClockSlot = getOnClockSlot(mock, slots)
    if (!onClockSlot) return
    // Remove from queue if queued
    setQueue(prev => prev.filter(id => id !== playerId))
    await submitPick(playerId, false, onClockSlot)
  }

  // Start draft (host only)
  const startDraft = async () => {
    if (!isHost) return
    const firstPickerIdx = getPickerIndex(1, mock.num_teams, mock.draft_type)
    const firstSlot = slots[firstPickerIdx]
    await supabase.from('mock_drafts').update({
      status: 'in_progress',
      current_pick: 1,
      current_round: 1,
      current_user_id: firstSlot?.user_id ?? null,
      pick_started_at: new Date().toISOString(),
    }).eq('id', mock.id)
  }

  const copyInvite = () => {
    navigator.clipboard.writeText(mock.invite_code)
    toast.success('Invite code copied!')
  }

  const togglePause = async () => {
    if (!isHost) return
    const newStatus = mock.status === 'paused' ? 'in_progress' : 'paused'
    await supabase.from('mock_drafts').update({
      status: newStatus,
      ...(newStatus === 'in_progress' ? { pick_started_at: new Date().toISOString() } : {}),
    }).eq('id', mock.id)
    toast(newStatus === 'paused' ? '⏸ Draft paused' : '▶ Draft resumed')
  }

  // Back: pause an active draft first so picks don't advance while away
  const handleBack = async () => {
    if (mock.status === 'in_progress') {
      // Cancel any pending AI timeout immediately
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current)
        aiTimeoutRef.current = null
      }
      await supabase.from('mock_drafts').update({ status: 'paused' }).eq('id', mock.id)
      toast('⏸ Draft paused')
    }
    onBack()
  }

  const currentOnClockSlot = getOnClockSlot(mock, slots)
  const currentPickerName = currentOnClockSlot?.profile?.display_name ||
    currentOnClockSlot?.profile?.username ||
    (currentOnClockSlot?.user_id ? 'Unknown' : `AI ${currentOnClockSlot?.slot_number ?? ''}`)

  // ── Lobby ────────────────────────────────────────────────────────────
  if (mock.status === 'lobby') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-3">
          <button className="btn-ghost !py-1 !px-2" onClick={onBack}><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <h1 className="section-title">{mock.name}</h1>
            <p className="text-field-400 text-sm">Draft Lobby</p>
          </div>
        </div>

        <div className="panel">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-white flex items-center gap-2">
              <Share2 className="w-4 h-4 text-gold" /> Invite Friends
            </span>
          </div>
          <p className="text-field-400 text-sm mb-3">Share this code with friends. They can join from the Mock Draft hub.</p>
          <div className="flex items-center gap-3 bg-field-800 rounded-lg p-3 border border-gold/20">
            <span className="text-gold font-mono font-black text-3xl tracking-widest flex-1">{mock.invite_code}</span>
            <button className="btn-gold !py-2" onClick={copyInvite}>
              <Copy className="w-4 h-4" /> Copy
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-gold" /> Draft Order
            </span>
            <span className="text-field-400 text-sm">{slots.filter(s => s.user_id).length} of {mock.num_teams} humans joined</span>
          </div>
          <div className="space-y-2">
            {slots.map((slot) => {
              const isMe = slot.user_id === user?.id
              const isAi = !slot.user_id
              return (
                <div key={slot.id} className={clsx(
                  'flex items-center gap-3 p-2.5 rounded-lg',
                  isMe ? 'bg-gold/10 border border-gold/30' : 'bg-field-800/50',
                )}>
                  <span className="text-field-500 text-sm w-6 text-center font-bold">#{slot.slot_number}</span>
                  <div className={clsx(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0',
                    isAi ? 'bg-field-700 text-field-400' : isMe ? 'bg-gold text-field-950' : 'bg-field-700 text-gold',
                  )}>
                    {isAi ? <Bot className="w-4 h-4" /> : (slot.profile?.display_name || slot.profile?.username || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-bold truncate">
                      {isAi ? `AI Team ${slot.slot_number}` : slot.profile?.display_name || slot.profile?.username || slot.team_name}
                    </div>
                    <div className="text-field-400 text-xs">{isAi ? 'Computer' : isMe ? 'You' : 'Human player'}</div>
                  </div>
                  {slot.is_host && <span className="text-xs bg-gold/20 text-gold px-1.5 py-0.5 rounded font-bold">Host</span>}
                </div>
              )
            })}
          </div>
        </div>

        <div className="panel grid grid-cols-3 gap-3 text-center text-sm">
          {([
            ['Format', mock.scoring_type.toUpperCase().replace('_','-')],
            ['Draft', mock.draft_type],
            ['Timer', mock.pick_timer === 0 ? 'None' : mock.pick_timer < 60 ? `${mock.pick_timer}s` : mock.pick_timer < 3600 ? `${mock.pick_timer / 60}m` : 'None'],
            ['Rounds', mock.num_rounds],
            ['Players', mock.player_pool.toUpperCase()],
            ['Teams', mock.num_teams],
          ] as [string, string | number][]).map(([label, val]) => (
            <div key={label} className="bg-field-800/50 rounded-lg p-2">
              <div className="text-field-400 text-xs">{label}</div>
              <div className="text-white font-bold">{val}</div>
            </div>
          ))}
        </div>

        {isHost ? (
          <button className="btn-gold w-full text-base py-3" onClick={startDraft}>
            <Play className="w-5 h-5" /> Start Mock Draft
          </button>
        ) : (
          <div className="panel text-center text-field-400">
            <Clock className="w-6 h-6 mx-auto mb-2 text-gold/40" />
            Waiting for the host to start the draft…
          </div>
        )}
      </div>
    )
  }

  // ── Results ──────────────────────────────────────────────────────────
  if (mock.status === 'completed') {
    const picksBySlot = new Map<number, MockPick[]>()
    picks.forEach(p => {
      if (!picksBySlot.has(p.slot_number)) picksBySlot.set(p.slot_number, [])
      picksBySlot.get(p.slot_number)!.push(p)
    })

    return (
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-3">
          <button className="btn-ghost !py-1 !px-2" onClick={onBack}><ArrowLeft className="w-4 h-4" /></button>
          <div className="flex-1">
            <h1 className="section-title">{mock.name} — Complete!</h1>
            <p className="text-field-400 text-sm">{mock.num_rounds} rounds · {mock.num_teams} teams</p>
          </div>
          <button className="btn-outline text-sm" onClick={async () => {
            await supabase.from('mock_draft_picks').delete().eq('mock_draft_id', mock.id)
            await supabase.from('mock_drafts').update({ status: 'lobby', current_pick: 1, current_round: 1, current_user_id: null, pick_started_at: null }).eq('id', mock.id)
            setQueue([])
            try { localStorage.removeItem(queueStorageKey) } catch {}
            qc.invalidateQueries({ queryKey: ['mock-picks', mock.id] })
          }}>
            <RefreshCw className="w-4 h-4" /> Mock Again
          </button>
        </div>

        <div className="panel">
          <h3 className="font-bold text-gold mb-3">Your Picks</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(picksBySlot.get(mySlot.slot_number) ?? []).map(pk => (
              <div key={pk.id} className="flex items-center gap-2 bg-field-800/50 rounded p-2">
                <span className={clsx('pos-badge text-xs', `pos-${(pk.player as any)?.pos}`)}>{(pk.player as any)?.pos}</span>
                <div className="min-w-0">
                  <div className="text-white text-xs font-bold truncate">{(pk.player as any)?.name}</div>
                  <div className="text-field-400 text-xs">Rd {pk.round_number}, Pk {pk.pick_number}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Big draft board — Sleeper style */}
        <div className="panel !p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-field-700 flex items-center justify-between">
            <span className="font-bold text-white text-sm">Draft Board</span>
            <span className="text-field-400 text-xs">{picks.length} picks · {mock.num_teams} teams · {mock.num_rounds} rounds</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{minWidth: `${Math.max(600, mock.num_teams * 90)}px`}}>
              <thead className="sticky top-0 z-10 bg-field-900">
                <tr>
                  <th className="text-field-400 font-bold text-center py-2 px-2 border-b border-field-700 w-10 text-xs">Rd</th>
                  {slots.map(s => {
                    const isMe = s.slot_number === mySlot.slot_number
                    return (
                      <th key={s.id} className={clsx(
                        'py-2 px-1 border-b border-field-700 text-xs font-bold text-center',
                        isMe ? 'text-gold bg-gold/[0.04]' : 'text-field-300',
                      )}>
                        <div className="truncate" style={{maxWidth: '80px'}}>
                          {s.user_id ? (s.profile?.display_name || s.profile?.username || s.team_name) : `AI ${s.slot_number}`}
                        </div>
                        {isMe && <div className="text-[9px] text-gold/60 font-normal">YOU</div>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: mock.num_rounds }, (_, r) => {
                  const roundNum = r + 1
                  const isEvenRound = mock.draft_type === 'snake' && roundNum % 2 === 0
                  const displaySlots = isEvenRound ? [...slots].reverse() : slots
                  return (
                    <tr key={r} className="border-b border-field-800/60 hover:bg-field-800/20 transition-colors">
                      <td className="text-center py-1.5 px-1">
                        <span className={clsx(
                          'text-xs font-black w-6 h-6 rounded flex items-center justify-center mx-auto',
                          isEvenRound ? 'bg-field-700 text-field-300' : 'bg-field-800 text-field-400',
                        )}>
                          {roundNum}
                        </span>
                      </td>
                      {displaySlots.map(s => {
                        const slotPicks = picksBySlot.get(s.slot_number) ?? []
                        const pick = slotPicks.find(p => p.round_number === roundNum)
                        const isMe = s.slot_number === mySlot.slot_number
                        const player = pick?.player as any
                        return (
                          <td key={s.id} className={clsx(
                            'px-1 py-1 text-center align-middle',
                            isMe && 'bg-gold/[0.04]',
                          )}>
                            {player ? (
                              <div className={clsx(
                                'rounded-lg p-1.5 border transition-colors',
                                isMe
                                  ? 'bg-gold/10 border-gold/20'
                                  : pick?.is_ai_pick
                                  ? 'bg-field-800/40 border-field-700/50'
                                  : 'bg-field-800/70 border-field-700/70',
                              )}>
                                <div className="flex items-center justify-center gap-1 mb-0.5">
                                  <span className={clsx('pos-badge', `pos-${player.pos}`)} style={{fontSize: '9px', padding: '1px 4px'}}>
                                    {player.pos}
                                  </span>
                                  {pick?.is_ai_pick && <Bot className="w-2.5 h-2.5 text-field-500" />}
                                </div>
                                <div
                                  className={clsx('font-bold leading-tight', isMe ? 'text-gold' : 'text-white')}
                                  style={{fontSize: '10px', maxWidth: '76px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '0 auto'}}
                                  title={player.name}
                                >
                                  {player.name}
                                </div>
                                <div className="text-field-500 mt-0.5" style={{fontSize: '9px'}}>{player.team}</div>
                              </div>
                            ) : (
                              <div className="text-field-800 text-xs py-3">·</div>
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
      </div>
    )
  }

  // ── Live Draft ───────────────────────────────────────────────────────
  const isPaused = mock.status === 'paused'
  const queuedPlayers = queue
    .map(id => allAvailable.find(p => p.id === id))
    .filter(Boolean) as Player[]

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4">

      {/* Paused banner */}
      {isPaused && (
        <div className="bg-yellow-400/10 border border-yellow-400/40 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-yellow-400 font-bold">
            <Pause className="w-4 h-4" />
            Draft is paused
          </div>
          {isHost && (
            <button className="btn-gold !py-1.5 !px-4 text-sm" onClick={togglePause}>
              <Play className="w-4 h-4" /> Resume Draft
            </button>
          )}
        </div>
      )}

      {/* Status bar */}
      <div className={clsx(
        'flex items-center justify-between p-3 rounded-lg mb-4 border',
        amOnClock && !isPaused ? 'bg-gold/10 border-gold/40' : 'bg-field-800 border-field-700',
      )}>
        <div className="flex items-center gap-3">
          <button
            className="btn-ghost !py-1.5 !px-2 shrink-0"
            onClick={handleBack}
            title="Back to mock drafts (auto-pauses)"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="text-xs text-field-400 uppercase tracking-wider">
              Round {mock.current_round} · Pick {mock.current_pick} of {mock.num_teams * mock.num_rounds}
            </div>
            <div className={clsx('font-bold', amOnClock && !isPaused ? 'text-gold text-lg' : 'text-white')}>
              {isPaused
                ? <span className="text-yellow-400">Paused — resume to continue</span>
                : aiThinking
                ? <span className="flex items-center gap-2"><Bot className="w-4 h-4 animate-pulse" /> {autoDraft ? 'Autodrafting…' : 'AI is picking…'}</span>
                : amOnClock ? '🏈 YOUR PICK!' : `On the clock: ${currentPickerName}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {mock.pick_timer > 0 && !isPaused && (
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
            title={autoDraft ? 'Autodraft ON — click to turn off' : 'Autodraft OFF — click to let AI draft for you'}
          >
            <Bot className="w-3.5 h-3.5" />
            Auto {autoDraft ? 'ON' : 'OFF'}
          </button>

          {/* Pause button (host only) */}
          {isHost && (
            <button
              onClick={togglePause}
              className={clsx('btn-ghost !py-1.5 !px-2', isPaused && 'text-gold')}
              title={isPaused ? 'Resume draft' : 'Pause draft'}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          )}

          <span className="text-field-500 text-xs font-mono border border-field-700 px-2 py-1 rounded">{mock.invite_code}</span>
          <button className="btn-ghost !py-1 !px-2" onClick={copyInvite} title="Copy invite code">
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Player pool */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-field-400" />
              <input className="input pl-9" placeholder="Search players…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-1 flex-wrap">
              {['ALL','QB','RB','WR','TE','K','DST'].map(pos => (
                <button key={pos} onClick={() => setPosFilter(pos)}
                  className={clsx('filter-chip !py-1 !px-2 text-xs', posFilter === pos && 'active')}>
                  {pos}
                </button>
              ))}
            </div>
          </div>

          <div className="panel !p-0 overflow-hidden">
            <div className="max-h-[460px] overflow-y-auto">
              <table className="data-table w-full">
                <thead className="sticky top-0 z-10 bg-field-900">
                  <tr>
                    <th className="text-left">Player</th>
                    <th className="text-center">Pos</th>
                    <th className="text-center hidden sm:table-cell">ADP</th>
                    <th className="text-center">Avg</th>
                    <th className="text-center w-20">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayAvailable.slice(0, 100).map(p => {
                    const isQueued = queue.includes(p.id)
                    const queuePos = queue.indexOf(p.id) + 1
                    return (
                      <tr key={p.id} className={clsx(
                        amOnClock && !isPaused && !autoDraft && 'hover:bg-gold/5 cursor-pointer',
                        isQueued && 'bg-gold/[0.04]',
                      )}>
                        <td onClick={amOnClock && !isPaused && !autoDraft ? () => handleHumanPick(p.id) : undefined}>
                          <div className="font-bold text-white text-sm flex items-center gap-1.5">
                            {p.name}
                            {p.is_rookie && <span className="text-[10px] font-black bg-gold text-field-950 px-1 py-0.5 rounded leading-none">R</span>}
                          </div>
                          <div className="text-field-400 text-xs">{p.team} · <span className={p.league === 'NFL' ? 'text-nfl' : 'text-cfb'}>{p.league}</span></div>
                        </td>
                        <td className="text-center"><span className={`pos-badge pos-${p.pos}`}>{p.pos}</span></td>
                        <td className="text-center text-field-300 text-sm hidden sm:table-cell">{p.adp?.toFixed(1) ?? '—'}</td>
                        <td className="text-center text-white font-bold text-sm">{p.avg_pts?.toFixed(1) ?? '—'}</td>
                        <td className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {amOnClock && !isPaused && !autoDraft ? (
                              <button className="btn-gold !py-1 !px-2 text-xs" onClick={e => { e.stopPropagation(); handleHumanPick(p.id) }}>Draft</button>
                            ) : (
                              isQueued ? (
                                <button
                                  className="text-xs bg-gold/20 text-gold border border-gold/30 px-2 py-1 rounded font-bold hover:bg-red-500/20 hover:text-red-400 hover:border-red-400/30 transition-colors"
                                  onClick={() => removeFromQueue(p.id)}
                                  title="Remove from queue"
                                >#{queuePos} ✕</button>
                              ) : (
                                <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => addToQueue(p.id)} title="Add to queue">
                                  + Queue
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {displayAvailable.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-6 text-field-400">No available players match your filter</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-3">
          {/* Sidebar tab bar */}
          <div className="flex gap-0.5 bg-field-800 rounded-lg p-0.5">
            {([
              { id: 'queue', label: 'Queue', badge: queue.length },
              { id: 'roster', label: 'Roster', badge: picks.filter(p => p.slot_number === mySlot.slot_number).length },
              { id: 'board', label: 'Board', badge: 0 },
              { id: 'order', label: 'Order', badge: 0 },
            ] as { id: 'queue'|'roster'|'board'|'order'; label: string; badge: number }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setSidebarTab(tab.id)}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-bold rounded-md transition-colors',
                  sidebarTab === tab.id ? 'bg-field-700 text-white' : 'text-field-500 hover:text-field-300',
                )}
              >
                {tab.label}
                {tab.badge > 0 && (
                  <span className={clsx(
                    'text-[10px] font-black px-1 py-0.5 rounded-full min-w-[16px] text-center leading-none',
                    sidebarTab === tab.id ? 'bg-gold text-field-950' : 'bg-field-700 text-field-400',
                  )}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Queue tab */}
          {sidebarTab === 'queue' && (
            <div className="panel">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gold uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" /> Draft Queue
                  {queue.length > 0 && <span className="bg-gold text-field-950 text-[10px] font-black px-1.5 py-0.5 rounded-full">{queue.length}</span>}
                </span>
                {queue.length > 0 && (
                  <button className="text-xs text-field-400 hover:text-red-400 transition-colors" onClick={() => setQueue([])}>Clear</button>
                )}
              </div>
              {queue.length === 0 ? (
                <p className="text-field-500 text-xs text-center py-3">
                  {autoDraft
                    ? 'Autodraft ON — AI is managing your picks.'
                    : 'Hit "+ Queue" on any player. First available auto-drafts when your turn comes.'}
                </p>
              ) : (
                <div className="space-y-1">
                  {queuedPlayers.map((p, idx) => (
                    <div key={p.id} className={clsx(
                      'flex items-center gap-2 rounded-lg p-2 border',
                      idx === 0 ? 'bg-gold/10 border-gold/30' : 'bg-field-800/60 border-field-700/50',
                    )}>
                      <span className={clsx('text-xs font-black w-4 shrink-0 text-center', idx === 0 ? 'text-gold' : 'text-field-500')}>{idx + 1}</span>
                      <span className={clsx('pos-badge text-xs', `pos-${p.pos}`)}>{p.pos}</span>
                      <span className="text-white text-xs font-bold flex-1 truncate">{p.name}</span>
                      <div className="flex gap-0.5 shrink-0">
                        <button className="w-5 h-5 flex items-center justify-center btn-ghost !p-0 text-xs disabled:opacity-20" disabled={idx === 0} onClick={() => moveQueueItem(idx, -1)}>↑</button>
                        <button className="w-5 h-5 flex items-center justify-center btn-ghost !p-0 text-xs disabled:opacity-20" disabled={idx === queuedPlayers.length - 1} onClick={() => moveQueueItem(idx, 1)}>↓</button>
                        <button className="w-5 h-5 flex items-center justify-center btn-ghost !p-0 text-xs text-red-400" onClick={() => removeFromQueue(p.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                  <p className="text-field-600 text-xs mt-1 text-center">First queued player auto-drafts on your turn or timer expiry.</p>
                </div>
              )}
            </div>
          )}

          {/* Roster tab — your picks grouped by position */}
          {sidebarTab === 'roster' && (
            <div className="panel">
              <div className="text-xs font-bold text-field-400 uppercase tracking-wider mb-3">
                Your Roster ({picks.filter(p => p.slot_number === mySlot.slot_number).length} / {mock.num_rounds})
              </div>
              {(() => {
                const myPicks = picks.filter(p => p.slot_number === mySlot.slot_number)
                const byPos: Record<string, typeof myPicks> = {}
                myPicks.forEach(pk => {
                  const pos = (pk.player as any)?.pos ?? '?'
                  if (!byPos[pos]) byPos[pos] = []
                  byPos[pos].push(pk)
                })
                const posOrder = ['QB', 'RB', 'WR', 'TE', 'K', 'DST']
                const allPos = [...posOrder.filter(p => byPos[p]), ...Object.keys(byPos).filter(p => !posOrder.includes(p))]
                if (allPos.length === 0) return (
                  <p className="text-field-500 text-xs text-center py-4 italic">No picks yet</p>
                )
                return (
                  <div className="space-y-3">
                    {allPos.map(pos => (
                      <div key={pos}>
                        <div className="text-xs font-bold text-field-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                          <span className={clsx('pos-badge text-[9px]', `pos-${pos}`)}>{pos}</span>
                          <span>{byPos[pos].length}</span>
                        </div>
                        <div className="space-y-0.5">
                          {byPos[pos].map(pk => (
                            <div key={pk.id} className="flex items-center gap-2 text-xs py-1 border-b border-field-800 last:border-0">
                              <span className="text-white font-bold flex-1 truncate">{(pk.player as any)?.name}</span>
                              <span className="text-field-500 shrink-0">{(pk.player as any)?.team}</span>
                              <span className="text-field-500 shrink-0 text-xs">R{pk.round_number}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}

          {/* Board tab — scroll down to the full-width board below */}
          {sidebarTab === 'board' && (
            <div className="panel text-center py-6 space-y-3">
              <div className="text-gold text-2xl">📋</div>
              <p className="text-white font-bold text-sm">Draft Board</p>
              <p className="text-field-400 text-xs">The full draft board is shown below the player list — scroll down to see every pick with full names, positions, and teams.</p>
              <button
                className="btn-ghost text-xs"
                onClick={() => {
                  document.getElementById('mock-draft-board')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
              >
                Jump to Board ↓
              </button>
            </div>
          )}

          {/* Order tab — draft order + recent picks combined */}
          {sidebarTab === 'order' && (
            <div className="space-y-2">
              <div className="panel">
                <div className="text-xs font-bold text-field-400 uppercase tracking-wider mb-2">On The Clock</div>
                <div className="space-y-1">
                  {slots.map(s => {
                    const isOnClock = !isPaused && getOnClockSlot(mock, slots)?.slot_number === s.slot_number
                    const slotPicks = picks.filter(p => p.slot_number === s.slot_number).length
                    const isMe = s.slot_number === mySlot.slot_number
                    const isAi = !s.user_id
                    return (
                      <div key={s.id} className={clsx(
                        'flex items-center justify-between text-xs p-1.5 rounded',
                        isOnClock && 'bg-gold/10 border border-gold/30',
                      )}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-field-500 w-3">{s.slot_number}</span>
                          {isAi ? <Bot className="w-3 h-3 text-field-500" /> : <User className="w-3 h-3 text-field-400" />}
                          <span className={clsx('font-bold truncate max-w-[90px]', isOnClock ? 'text-gold' : isMe ? 'text-white' : 'text-field-300')}>
                            {isAi ? `AI ${s.slot_number}` : (s.profile?.display_name || s.profile?.username || s.team_name)}
                            {isMe && ' ★'}
                          </span>
                          {isOnClock && <Clock className="w-3 h-3 text-gold animate-pulse" />}
                        </div>
                        <span className="text-field-500">{slotPicks}/{mock.num_rounds}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="panel">
                <div className="text-xs font-bold text-field-400 uppercase tracking-wider mb-2">Recent Picks</div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {picks.slice(-20).reverse().map(pk => (
                    <div key={pk.id} className="flex items-center gap-2 text-xs">
                      <span className="text-field-500 w-6 shrink-0 text-right">#{pk.pick_number}</span>
                      <span className={clsx('pos-badge', `pos-${(pk.player as any)?.pos}`)}>{(pk.player as any)?.pos}</span>
                      <span className={clsx('font-bold truncate', pk.slot_number === mySlot.slot_number ? 'text-gold' : 'text-white')}>
                        {(pk.player as any)?.name}
                      </span>
                      {pk.is_ai_pick && <Bot className="w-3 h-3 text-field-500 shrink-0" />}
                    </div>
                  ))}
                  {picks.length === 0 && <p className="text-field-400 text-xs">No picks yet</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full-width Draft Board — shown below the main grid */}
      <div id="mock-draft-board" className="mt-4">
        <div className="panel !p-0 overflow-hidden">
          {/* Board header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-field-700 bg-field-900">
            <span className="font-bold text-white text-sm flex items-center gap-2">
              📋 Draft Board
              <span className="text-field-400 font-normal text-xs">· {mock.num_teams} teams · {mock.num_rounds} rounds</span>
            </span>
            <span className="text-field-400 text-xs">{picks.length} / {mock.num_teams * mock.num_rounds} picks</span>
          </div>

          <div className="overflow-x-auto">
            <table className="border-collapse" style={{width: '100%', minWidth: `${mock.num_teams * 112 + 48}px`}}>
              <thead className="sticky top-0 z-10 bg-field-900">
                <tr>
                  {/* Round column */}
                  <th className="w-10 py-2 px-1 border-b border-r border-field-700 text-field-400 text-xs font-bold text-center sticky left-0 bg-field-900 z-20">Rd</th>
                  {/* Team columns — always in slot order so you can track snake direction */}
                  {slots.map(s => {
                    const isMe = s.slot_number === mySlot.slot_number
                    const name = s.user_id
                      ? (s.profile?.display_name || s.profile?.username || s.team_name)
                      : `AI ${s.slot_number}`
                    return (
                      <th
                        key={s.id}
                        className={clsx(
                          'py-2 px-1 border-b border-field-700 text-xs font-bold text-center',
                          isMe ? 'text-gold bg-gold/[0.05]' : 'text-field-300',
                        )}
                        style={{width: '108px', minWidth: '108px'}}
                      >
                        <div className="truncate px-1" title={name}>{name}</div>
                        {isMe && <div className="text-[9px] text-gold/50 font-normal leading-none mt-0.5">YOU</div>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {Array.from({length: mock.num_rounds}, (_, r) => {
                  const roundNum = r + 1
                  const isEvenRound = mock.draft_type === 'snake' && roundNum % 2 === 0
                  // In snake, even rounds run right-to-left — we show an arrow indicator
                  // but keep columns in fixed slot order so the header stays aligned.
                  // Instead we shade the background to show direction.
                  return (
                    <tr key={r} className={clsx(
                      'border-b border-field-800/50 group hover:bg-white/[0.015] transition-colors',
                      isEvenRound && 'bg-field-800/20',
                    )}>
                      {/* Round number cell */}
                      <td className="text-center py-1 px-1 border-r border-field-800 sticky left-0 bg-field-900 z-10">
                        <div className={clsx(
                          'text-xs font-black w-7 h-7 rounded-lg flex items-center justify-center mx-auto',
                          isEvenRound ? 'bg-field-700 text-field-300' : 'bg-field-800 text-field-500',
                        )}>
                          {roundNum}
                        </div>
                        {mock.draft_type === 'snake' && (
                          <div className="text-[8px] text-field-600 text-center mt-0.5 leading-none">
                            {isEvenRound ? '←' : '→'}
                          </div>
                        )}
                      </td>

                      {/* Pick cells — always in slot 1..N order */}
                      {slots.map(s => {
                        const slotRoundPicks = picks.filter(p => p.slot_number === s.slot_number)
                        const pick = slotRoundPicks.find(p => p.round_number === roundNum)
                        const isMe = s.slot_number === mySlot.slot_number
                        const isOnClock = !isPaused &&
                          mock.current_round === roundNum &&
                          getOnClockSlot(mock, slots)?.slot_number === s.slot_number
                        const player = pick?.player as any

                        return (
                          <td
                            key={s.id}
                            className={clsx(
                              'py-1 px-1 align-top border-r border-field-800/30 last:border-r-0',
                              isMe && 'bg-gold/[0.04]',
                              isOnClock && !pick && 'bg-gold/[0.12]',
                            )}
                            style={{width: '108px', minWidth: '108px'}}
                          >
                            {player ? (
                              <div className={clsx(
                                'rounded-lg px-2 py-1.5 border h-full',
                                isMe
                                  ? 'bg-gold/10 border-gold/25'
                                  : pick?.is_ai_pick
                                  ? 'bg-field-800/50 border-field-700/40'
                                  : 'bg-field-800/80 border-field-700/60',
                              )}>
                                {/* Position badge + pick number */}
                                <div className="flex items-center justify-between mb-1">
                                  <span className={clsx('pos-badge', `pos-${player.pos}`)} style={{fontSize: '10px', padding: '1px 5px'}}>
                                    {player.pos}
                                  </span>
                                  <span className="text-field-600 text-[9px]">#{pick?.pick_number}</span>
                                </div>
                                {/* Full player name */}
                                <div
                                  className={clsx('font-bold leading-tight', isMe ? 'text-gold' : 'text-white')}
                                  style={{fontSize: '11px'}}
                                  title={player.name}
                                >
                                  {player.name}
                                </div>
                                {/* Team */}
                                <div className="text-field-400 mt-0.5 flex items-center gap-1" style={{fontSize: '10px'}}>
                                  <span className="truncate">{player.team}</span>
                                  {pick?.is_ai_pick && <Bot className="w-2.5 h-2.5 text-field-600 shrink-0" />}
                                </div>
                              </div>
                            ) : isOnClock ? (
                              <div className="rounded-lg border border-gold/40 bg-gold/10 h-full flex items-center justify-center py-3">
                                <div className="w-2 h-2 rounded-full bg-gold animate-pulse" />
                              </div>
                            ) : (
                              <div className="h-full flex items-center justify-center py-3 opacity-20">
                                <div className="w-1 h-1 rounded-full bg-field-600" />
                              </div>
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
      </div>
    </div>
  )
}
