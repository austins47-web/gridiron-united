import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/store/appStore'
import { supabase } from '@/lib/supabase'
import { useDeleteLeague } from '@/hooks/useLeague'
import { buildSlotDefs } from '@/types/database'
import { CfbPostseasonManager } from './CfbPostseasonManager'
import type { League, Player, RosterSlotConfig } from '@/types/database'
import {
  Shield, Users, Zap, TrendingUp, Trash2, Plus, Search,
  Save, RotateCcw, AlertCircle, ChevronDown, ChevronUp,
  Edit3, Check, X, Crown, ArrowLeftRight
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

type CommTab = 'scoring' | 'rosters' | 'players' | 'members' | 'league' | 'cfb_postseason'

// ─── Scoring row defaults ───────────────────────────────────────────
const SCORING_SECTIONS = [
  {
    title: 'Passing',
    rows: [
      { key: 'score_pass_td', label: 'Passing TD' },
      { key: 'score_pass_yd', label: 'Passing Yards (per yard)' },
      { key: 'score_pass_bonus_300', label: '300+ Yard Bonus' },
      { key: 'score_pass_int', label: 'Interception Thrown' },
    ],
  },
  {
    title: 'Rushing',
    rows: [
      { key: 'score_rush_td', label: 'Rushing TD' },
      { key: 'score_rush_yd', label: 'Rushing Yards (per yard)' },
      { key: 'score_rush_bonus_100', label: '100+ Yard Bonus' },
    ],
  },
  {
    title: 'Receiving',
    rows: [
      { key: 'score_rec_td', label: 'Receiving TD' },
      { key: 'score_rec_yd', label: 'Receiving Yards (per yard)' },
      { key: 'score_rec_bonus_100', label: '100+ Yard Bonus' },
      { key: 'score_reception', label: 'Reception (PPR)' },
    ],
  },
  {
    title: 'Misc',
    rows: [
      { key: 'score_fumble_lost', label: 'Fumble Lost' },
      { key: 'score_2pt_conv', label: '2-Point Conversion' },
    ],
  },
  {
    title: 'Kicking',
    rows: [
      { key: 'score_fg_0_39', label: 'FG 0–39 yards' },
      { key: 'score_fg_40_49', label: 'FG 40–49 yards' },
      { key: 'score_fg_50_plus', label: 'FG 50+ yards' },
      { key: 'score_pat', label: 'PAT Made' },
      { key: 'score_fg_miss', label: 'FG/PAT Missed' },
    ],
  },
  {
    title: 'Defense / Special Teams',
    rows: [
      { key: 'score_dst_sack', label: 'Sack' },
      { key: 'score_dst_int', label: 'Interception' },
      { key: 'score_dst_fumble_rec', label: 'Fumble Recovery' },
      { key: 'score_dst_safety', label: 'Safety' },
      { key: 'score_dst_td', label: 'Touchdown' },
      { key: 'score_dst_blocked', label: 'Blocked Kick' },
      { key: 'score_dst_pts_0', label: 'Pts Allowed: 0' },
      { key: 'score_dst_pts_1_6', label: 'Pts Allowed: 1–6' },
      { key: 'score_dst_pts_7_13', label: 'Pts Allowed: 7–13' },
      { key: 'score_dst_pts_14_20', label: 'Pts Allowed: 14–20' },
      { key: 'score_dst_pts_21_27', label: 'Pts Allowed: 21–27' },
      { key: 'score_dst_pts_28_34', label: 'Pts Allowed: 28–34' },
      { key: 'score_dst_pts_35_plus', label: 'Pts Allowed: 35+' },
    ],
  },
]

// ─── Main Component ─────────────────────────────────────────────────
export function CommissionerPanel() {
  const { activeLeague, activeLeagueId, myMembership, setActiveLeague } = useAppStore()
  const [tab, setTab] = useState<CommTab>('scoring')

  const isCommissioner = myMembership?.is_commissioner

  if (!activeLeagueId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <AlertCircle className="w-12 h-12 text-gold/40 mx-auto mb-4" />
        <h2 className="text-white font-bold text-lg mb-2">No league selected</h2>
        <p className="text-field-400">Select a league first.</p>
      </div>
    )
  }

  if (!isCommissioner) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <Shield className="w-12 h-12 text-gold/40 mx-auto mb-4" />
        <h2 className="text-white font-bold text-lg mb-2">Commissioner Only</h2>
        <p className="text-field-400">Only the league commissioner can access this panel.</p>
      </div>
    )
  }

  const TABS: { id: CommTab; label: string; icon: React.ReactNode }[] = [
    { id: 'scoring', label: 'Scoring', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'rosters', label: 'Rosters', icon: <Users className="w-4 h-4" /> },
    { id: 'players', label: 'Player Scores', icon: <Zap className="w-4 h-4" /> },
    { id: 'members', label: 'Members', icon: <Crown className="w-4 h-4" /> },
    { id: 'league', label: 'League', icon: <Shield className="w-4 h-4" /> },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-gold" />
        <div>
          <h1 className="section-title">Commissioner Panel</h1>
          <p className="text-field-400 text-sm">{activeLeague?.name}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-field-700 pb-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition-colors border-b-2 -mb-px',
              tab === t.id
                ? 'border-gold text-gold'
                : 'border-transparent text-field-400 hover:text-white',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'scoring' && <ScoringEditor league={activeLeague!} onSaved={setActiveLeague} />}
      {tab === 'rosters' && <RosterEditor leagueId={activeLeagueId} league={activeLeague!} />}
      {tab === 'players' && <PlayerScoreEditor />}
      {tab === 'members' && <MembersManager leagueId={activeLeagueId} league={activeLeague!} />}
      {tab === 'league' && <LeagueManager league={activeLeague!} />}
      {tab === 'cfb_postseason' && <CfbPostseasonManager league={activeLeague!} />}
    </div>
  )
}

// ─── League Manager ─────────────────────────────────────────────────
function LeagueManager({ league }: { league: League }) {
  const deleteLeague = useDeleteLeague()
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="space-y-4">
      {/* League info summary */}
      <div className="panel grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        {[
          ['League Name', league.name],
          ['Scoring', league.scoring_type?.toUpperCase()],
          ['Draft Type', league.draft_type],
          ['Player Pool', league.player_pool === 'both' ? 'NFL + CFB' : league.player_pool?.toUpperCase()],
          ['Teams', String(league.num_teams)],
          ['Season', String(league.season ?? 2025)],
        ].map(([label, value]) => (
          <div key={label} className="bg-field-800/60 rounded-lg p-3">
            <div className="text-field-400 text-xs mb-1">{label}</div>
            <div className="text-white font-bold capitalize">{value}</div>
          </div>
        ))}
      </div>

      {/* Invite code */}
      <div className="panel flex items-center justify-between">
        <div>
          <div className="text-xs text-field-400 uppercase tracking-wider mb-1">Invite Code</div>
          <div className="text-gold font-black text-2xl tracking-widest font-mono">{league.invite_code}</div>
          <div className="text-field-500 text-xs mt-1">Share this code so others can join your league</div>
        </div>
        <button
          className="btn-ghost !py-2 !px-3 text-sm"
          onClick={() => {
            navigator.clipboard.writeText(league.invite_code)
            toast.success('Invite code copied!')
          }}
        >
          Copy
        </button>
      </div>

      {/* Danger Zone */}
      <div className="panel border border-red-500/30 bg-red-500/5 space-y-3">
        <div className="text-xs font-bold text-red-400 uppercase tracking-wider">Danger Zone</div>

        {!confirmDelete ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-bold text-white">Delete this league</div>
              <div className="text-xs text-field-400 mt-0.5">
                Permanently removes all rosters, draft picks, and settings. This cannot be undone.
              </div>
            </div>
            <button
              onClick={() => setConfirmDelete(true)}
              className="shrink-0 flex items-center gap-2 text-sm font-bold text-red-400 border border-red-400/40 px-4 py-2 rounded-lg hover:bg-red-400/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete League
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-red-300">
              Are you sure you want to delete{' '}
              <span className="font-bold text-white">"{league.name}"</span>?
              Every roster, draft pick, and matchup will be gone permanently.
            </p>
            <div className="flex gap-2">
              <button
                className="btn-ghost flex-1"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                disabled={deleteLeague.isPending}
                onClick={() => deleteLeague.mutateAsync(league.id)}
                className="flex-1 flex items-center justify-center gap-2 font-bold text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {deleteLeague.isPending ? 'Deleting…' : 'Yes, Delete Forever'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Scoring Editor ──────────────────────────────────────────────────
function ScoringEditor({ league, onSaved }: { league: League; onSaved: (l: League, m: any) => void }) {
  const { myMembership } = useAppStore()
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const s: Record<string, number> = {}
    SCORING_SECTIONS.forEach(sec => sec.rows.forEach(r => {
      s[r.key] = (league as any)[r.key] ?? 0
    }))
    return s
  })
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ Passing: true })

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('leagues')
        .update(scores)
        .eq('id', league.id)
        .select()
        .single()
      if (error) throw error
      onSaved(data, myMembership)
      toast.success('Scoring rules saved!')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-field-400 text-sm">Edit all scoring values for {league.name}. Changes apply immediately.</p>
        <button className="btn-gold" onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save All'}
        </button>
      </div>

      {SCORING_SECTIONS.map(section => (
        <div key={section.title} className="panel !p-0 overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-field-800/50 transition-colors"
            onClick={() => setExpanded(e => ({ ...e, [section.title]: !e[section.title] }))}
          >
            <span className="font-bold text-white">{section.title}</span>
            {expanded[section.title]
              ? <ChevronUp className="w-4 h-4 text-field-400" />
              : <ChevronDown className="w-4 h-4 text-field-400" />
            }
          </button>

          {expanded[section.title] && (
            <div className="border-t border-field-700">
              {section.rows.map(row => (
                <div key={row.key} className="flex items-center justify-between px-4 py-2.5 border-b border-field-800 last:border-0 hover:bg-field-800/30">
                  <label className="text-field-300 text-sm flex-1">{row.label}</label>
                  <div className="flex items-center gap-2">
                    <button
                      className="w-7 h-7 rounded bg-field-700 hover:bg-field-600 text-white font-bold flex items-center justify-center transition-colors"
                      onClick={() => setScores(s => ({ ...s, [row.key]: +(s[row.key] - 0.5).toFixed(1) }))}
                    >−</button>
                    <input
                      type="number"
                      step="0.5"
                      className="w-16 text-center bg-field-800 border border-field-600 rounded py-1 text-white font-bold text-sm focus:outline-none focus:border-gold"
                      value={scores[row.key]}
                      onChange={e => setScores(s => ({ ...s, [row.key]: parseFloat(e.target.value) || 0 }))}
                    />
                    <button
                      className="w-7 h-7 rounded bg-field-700 hover:bg-field-600 text-white font-bold flex items-center justify-center transition-colors"
                      onClick={() => setScores(s => ({ ...s, [row.key]: +(s[row.key] + 0.5).toFixed(1) }))}
                    >+</button>
                    <span className={clsx(
                      'text-xs font-bold w-8 text-right',
                      scores[row.key] > 0 ? 'text-green-400' : scores[row.key] < 0 ? 'text-red-400' : 'text-field-500'
                    )}>
                      {scores[row.key] > 0 ? `+${scores[row.key]}` : scores[row.key]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <button className="btn-gold w-full" onClick={handleSave} disabled={saving}>
        <Save className="w-4 h-4" />
        {saving ? 'Saving…' : 'Save Scoring Rules'}
      </button>
    </div>
  )
}

// ─── Roster Editor ───────────────────────────────────────────────────
function RosterEditor({ leagueId, league }: { leagueId: string; league: League }) {
  const qc = useQueryClient()
  const slots = buildSlotDefs(league)
  const { setActiveLeague, myMembership } = useAppStore()

  // ── Slot config state ─────────────────────────────────────────────
  const [slotConfig, setSlotConfig] = useState<RosterSlotConfig>({
    slots_qb: league.slots_qb, slots_rb: league.slots_rb, slots_wr: league.slots_wr,
    slots_te: league.slots_te, slots_flex: league.slots_flex, slots_dst: league.slots_dst,
    slots_k: league.slots_k, slots_bench: league.slots_bench, slots_ir: league.slots_ir,
  })
  const [slotDirty, setSlotDirty] = useState(false)
  const [slotSaving, setSlotSaving] = useState(false)

  const updateSlot = (key: keyof RosterSlotConfig, delta: number) => {
    setSlotConfig(prev => {
      const bounds: Record<keyof RosterSlotConfig, [number, number]> = {
        slots_qb: [0, 4], slots_rb: [0, 6], slots_wr: [0, 6], slots_te: [0, 4],
        slots_flex: [0, 5], slots_dst: [0, 2], slots_k: [0, 2],
        slots_bench: [0, 16], slots_ir: [0, 5],
      }
      const [min, max] = bounds[key]
      const next = Math.max(min, Math.min(max, (prev[key] ?? 0) + delta))
      return { ...prev, [key]: next }
    })
    setSlotDirty(true)
  }

  const saveSlotConfig = async () => {
    setSlotSaving(true)
    const { error } = await supabase
      .from('leagues')
      .update(slotConfig)
      .eq('id', leagueId)
    setSlotSaving(false)
    if (error) { toast.error(error.message); return }
    // Update local store so UI reflects new slots immediately
    setActiveLeague({ ...league, ...slotConfig }, myMembership)
    setSlotDirty(false)
    toast.success('Roster slots updated')
  }

  const totalStarters = slotConfig.slots_qb + slotConfig.slots_rb + slotConfig.slots_wr +
    slotConfig.slots_te + slotConfig.slots_flex + slotConfig.slots_dst + slotConfig.slots_k

  // All members
  const { data: members = [] } = useQuery({
    queryKey: ['comm-members', leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_members')
        .select('*, profile:profiles(id, username, display_name)')
        .eq('league_id', leagueId)
        .order('draft_position')
      if (error) throw error
      return data
    },
  })

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState<Player[]>([])
  const [addSlot, setAddSlot] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)

  const selectedMember = members.find((m: any) => m.user_id === selectedUserId)

  // Selected user's roster
  const { data: roster = [], refetch: refetchRoster } = useQuery({
    queryKey: ['comm-roster', leagueId, selectedUserId],
    enabled: !!selectedUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rosters')
        .select('*, player:players(*)')
        .eq('league_id', leagueId)
        .eq('user_id', selectedUserId!)
        .eq('week', 0)
        .order('slot')
      if (error) throw error
      return data
    },
  })

  const searchPlayers = async (q: string) => {
    if (q.length < 2) { setAddResults([]); return }
    setSearchLoading(true)
    const { data } = await supabase
      .from('players')
      .select('*')
      .ilike('name', `%${q}%`)
      .eq('league', 'NFL')
      .limit(10)
    setAddResults(data ?? [])
    setSearchLoading(false)
  }

  const dropPlayer = async (rosterId: string, playerName: string) => {
    const { error } = await supabase.from('rosters').delete().eq('id', rosterId)
    if (error) return toast.error(error.message)
    toast.success(`${playerName} dropped`)
    refetchRoster()
    qc.invalidateQueries({ queryKey: ['rostered-ids', leagueId] })
  }

  const addPlayer = async (player: Player) => {
    if (!addSlot) return toast.error('Select a slot first')
    if (!selectedUserId) return
    const { error } = await supabase.from('rosters').insert({
      league_id: leagueId,
      user_id: selectedUserId,
      player_id: player.id,
      slot: addSlot,
      week: 0,
    })
    if (error) return toast.error(error.message)
    toast.success(`${player.name} added to ${selectedMember?.profile?.display_name || selectedMember?.profile?.username}'s roster`)
    setAddSearch('')
    setAddResults([])
    refetchRoster()
    qc.invalidateQueries({ queryKey: ['rostered-ids', leagueId] })
  }

  const moveSlot = async (rosterId: string, newSlot: string) => {
    const { error } = await supabase.from('rosters').update({ slot: newSlot }).eq('id', rosterId)
    if (error) return toast.error(error.message)
    toast.success('Slot updated')
    refetchRoster()
  }

  return (
    <div className="space-y-4">

      {/* ── Roster Slot Configuration ── */}
      <div className="panel">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-bold text-white">Roster Slot Requirements</div>
            <div className="text-xs text-field-400 mt-0.5">{totalStarters} starters · {slotConfig.slots_bench} bench · {slotConfig.slots_ir} IR</div>
          </div>
          {slotDirty && (
            <button className="btn-gold !py-1.5 !px-3 text-sm" onClick={saveSlotConfig} disabled={slotSaving}>
              <Save className="w-3.5 h-3.5" />
              {slotSaving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {([
            { key: 'slots_qb',    label: 'QB',         note: '0–4' },
            { key: 'slots_rb',    label: 'RB',         note: '0–6' },
            { key: 'slots_wr',    label: 'WR',         note: '0–6' },
            { key: 'slots_te',    label: 'TE',         note: '0–4' },
            { key: 'slots_flex',  label: 'FLEX (RB/WR/TE)', note: '0–5' },
            { key: 'slots_dst',   label: 'D/ST',       note: '0–2' },
            { key: 'slots_k',     label: 'Kicker',     note: '0–2' },
            { key: 'slots_bench', label: 'Bench',      note: '0–16' },
            { key: 'slots_ir',    label: 'IR',         note: '0–5' },
            { key: 'slots_cfb_os', label: 'CFB OS',     note: '0–10' },
          ] as { key: keyof RosterSlotConfig; label: string; note: string }[]).map(({ key, label, note }) => (
            <div key={key} className="bg-field-800 rounded-lg p-2.5">
              <div className="text-xs text-field-400 mb-1">{label} <span className="text-field-600">({note})</span></div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateSlot(key, -1)}
                  className="w-7 h-7 rounded-md bg-field-700 hover:bg-field-600 text-white font-bold flex items-center justify-center transition-colors"
                >−</button>
                <span className="text-white font-black text-lg w-6 text-center">{slotConfig[key]}</span>
                <button
                  onClick={() => updateSlot(key, +1)}
                  className="w-7 h-7 rounded-md bg-field-700 hover:bg-field-600 text-white font-bold flex items-center justify-center transition-colors"
                >+</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Member selector */}
      <div className="panel">
        <p className="text-field-400 text-sm mb-3">Select a team to edit their roster:</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {members.map((m: any) => (
            <button
              key={m.id}
              onClick={() => setSelectedUserId(m.user_id)}
              className={clsx(
                'flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors',
                selectedUserId === m.user_id
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-field-700 bg-field-800/50 text-white hover:border-field-600',
              )}
            >
              <div className="w-8 h-8 rounded-full bg-field-700 flex items-center justify-center text-xs font-bold text-gold shrink-0">
                {(m.profile?.display_name || m.profile?.username || '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">{m.profile?.display_name || m.profile?.username}</div>
                <div className="text-xs text-field-400 truncate">{m.team_name}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Roster view + editor */}
      {selectedUserId && (
        <div className="panel space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white">
              {selectedMember?.profile?.display_name || selectedMember?.profile?.username}'s Roster
            </h3>
            <span className="text-field-400 text-sm">{roster.length} players</span>
          </div>

          {/* Current roster */}
          <div className="space-y-1">
            {roster.map((r: any) => (
              <div key={r.id} className="flex items-center gap-2 p-2 bg-field-800/50 rounded group">
                <span className={clsx('pos-badge text-xs', `pos-${r.player?.pos}`)}>{r.slot}</span>
                <span className="text-white text-sm font-bold flex-1 truncate">{r.player?.name}</span>
                <span className="text-field-400 text-xs hidden sm:block">{r.player?.team}</span>

                {/* Move slot */}
                <select
                  className="input !py-0.5 !px-1.5 text-xs w-20 opacity-0 group-hover:opacity-100 transition-opacity"
                  value={r.slot}
                  onChange={e => moveSlot(r.id, e.target.value)}
                >
                  {slots.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
                </select>

                {/* Drop */}
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 p-1"
                  onClick={() => dropPlayer(r.id, r.player?.name)}
                  title="Drop player"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {roster.length === 0 && (
              <p className="text-field-400 text-sm text-center py-4">No players on this roster</p>
            )}
          </div>

          {/* Add player */}
          <div className="border-t border-field-700 pt-4">
            <h4 className="text-sm font-bold text-white mb-2">Add Player</h4>
            <div className="flex gap-2 mb-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-field-400" />
                <input
                  className="input !py-1.5 pl-8 text-sm"
                  placeholder="Search players..."
                  value={addSearch}
                  onChange={e => { setAddSearch(e.target.value); searchPlayers(e.target.value) }}
                />
              </div>
              <select
                className="input !py-1.5 text-sm w-24"
                value={addSlot}
                onChange={e => setAddSlot(e.target.value)}
              >
                <option value="">Slot</option>
                {slots.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
              </select>
            </div>

            {addResults.length > 0 && (
              <div className="bg-field-800 border border-field-700 rounded-lg overflow-hidden">
                {addResults.map(p => (
                  <button
                    key={p.id}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-field-700 transition-colors text-left border-b border-field-700/50 last:border-0"
                    onClick={() => addPlayer(p)}
                  >
                    <span className={clsx('pos-badge text-xs', `pos-${p.pos}`)}>{p.pos}</span>
                    <span className="text-white text-sm font-bold flex-1">{p.name}</span>
                    <span className="text-field-400 text-xs">{p.team}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Player Score Editor ─────────────────────────────────────────────
function PlayerScoreEditor() {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Player[]>([])
  const [editing, setEditing] = useState<Player | null>(null)
  const [avgPts, setAvgPts] = useState('')
  const [projPts, setProjPts] = useState('')
  const [adp, setAdp] = useState('')
  const [status, setStatus] = useState('active')
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()

  const searchPlayers = async (q: string) => {
    if (q.length < 2) { setResults([]); return }
    const { data } = await supabase
      .from('players')
      .select('*')
      .or(`name.ilike.%${q}%,team.ilike.%${q}%`)
      .limit(15)
    setResults(data ?? [])
  }

  const startEdit = (p: Player) => {
    setEditing(p)
    setAvgPts(String(p.avg_pts ?? ''))
    setProjPts(String(p.proj_pts ?? ''))
    setAdp(String(p.adp ?? ''))
    setStatus(p.status ?? 'active')
    setResults([])
    setSearch('')
  }

  const savePlayer = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('players')
        .update({
          avg_pts: parseFloat(avgPts) || 0,
          proj_pts: parseFloat(projPts) || 0,
          adp: parseFloat(adp) || 0,
          status,
        })
        .eq('id', editing.id)
      if (error) throw error
      toast.success(`${editing.name} updated!`)
      qc.invalidateQueries({ queryKey: ['players'] })
      setEditing(null)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-field-400 text-sm">Search for any player to edit their average points, projected points, ADP, or injury status.</p>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-field-400" />
        <input
          className="input pl-9"
          placeholder="Search player name or team..."
          value={search}
          onChange={e => { setSearch(e.target.value); searchPlayers(e.target.value) }}
        />
      </div>

      {results.length > 0 && (
        <div className="panel !p-0 overflow-hidden">
          {results.map(p => (
            <button
              key={p.id}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-field-800 transition-colors text-left border-b border-field-700/50 last:border-0"
              onClick={() => startEdit(p)}
            >
              <span className={clsx('pos-badge', `pos-${p.pos}`)}>{p.pos}</span>
              <div className="flex-1 min-w-0">
                <div className="text-white font-bold text-sm">{p.name}</div>
                <div className="text-field-400 text-xs">{p.team} · {p.league}</div>
              </div>
              <div className="text-right text-xs text-field-400 shrink-0">
                <div>Avg: {p.avg_pts?.toFixed(1)}</div>
                <div>ADP: {p.adp}</div>
              </div>
              <Edit3 className="w-4 h-4 text-gold shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Editor */}
      {editing && (
        <div className="panel space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className={clsx('pos-badge', `pos-${editing.pos}`)}>{editing.pos}</span>
                <h3 className="font-bold text-white">{editing.name}</h3>
              </div>
              <p className="text-field-400 text-sm mt-0.5">{editing.team} · {editing.league}</p>
            </div>
            <button className="btn-ghost !py-1 !px-2" onClick={() => setEditing(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="label">Avg Pts/Week</label>
              <input
                type="number"
                step="0.1"
                className="input"
                value={avgPts}
                onChange={e => setAvgPts(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Projected Pts</label>
              <input
                type="number"
                step="0.1"
                className="input"
                value={projPts}
                onChange={e => setProjPts(e.target.value)}
              />
            </div>
            <div>
              <label className="label">ADP</label>
              <input
                type="number"
                step="0.1"
                className="input"
                value={adp}
                onChange={e => setAdp(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="active">Active</option>
                <option value="questionable">Questionable</option>
                <option value="out">Out</option>
                <option value="ir">IR</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn-gold flex-1" onClick={savePlayer} disabled={saving}>
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Members Manager ─────────────────────────────────────────────────
function MembersManager({ leagueId, league }: { leagueId: string; league: League }) {
  const { user } = useAppStore()
  const qc = useQueryClient()

  const { data: members = [], refetch } = useQuery({
    queryKey: ['comm-members-full', leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_members')
        .select('*, profile:profiles(id, username, display_name, avatar_url)')
        .eq('league_id', leagueId)
        .order('draft_position')
      if (error) throw error
      return data
    },
  })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTeamName, setEditTeamName] = useState('')
  const [editDraftPos, setEditDraftPos] = useState('')
  const [editWaiver, setEditWaiver] = useState('')
  const [editWins, setEditWins] = useState('')
  const [editLosses, setEditLosses] = useState('')
  const [editPF, setEditPF] = useState('')

  const startEdit = (m: any) => {
    setEditingId(m.id)
    setEditTeamName(m.team_name ?? '')
    setEditDraftPos(String(m.draft_position ?? ''))
    setEditWaiver(String(m.waiver_priority ?? ''))
    setEditWins(String(m.wins ?? 0))
    setEditLosses(String(m.losses ?? 0))
    setEditPF(String(m.points_for ?? 0))
  }

  const saveMember = async (memberId: string) => {
    const { error } = await supabase
      .from('league_members')
      .update({
        team_name: editTeamName,
        draft_position: parseInt(editDraftPos) || null,
        waiver_priority: parseInt(editWaiver) || null,
        wins: parseInt(editWins) || 0,
        losses: parseInt(editLosses) || 0,
        points_for: parseFloat(editPF) || 0,
      })
      .eq('id', memberId)
    if (error) return toast.error(error.message)
    toast.success('Member updated!')
    setEditingId(null)
    refetch()
    qc.invalidateQueries({ queryKey: ['league-members', leagueId] })
    qc.invalidateQueries({ queryKey: ['standings', leagueId] })
  }

  const toggleCommissioner = async (m: any) => {
    if (m.user_id === user?.id) return toast.error("Can't change your own commissioner status")
    const { error } = await supabase
      .from('league_members')
      .update({ is_commissioner: !m.is_commissioner })
      .eq('id', m.id)
    if (error) return toast.error(error.message)
    toast.success(`${m.profile?.display_name || m.profile?.username} ${!m.is_commissioner ? 'promoted to' : 'removed from'} commissioner`)
    refetch()
  }

  const kickMember = async (m: any) => {
    if (m.user_id === user?.id) return toast.error("Can't kick yourself")
    if (!confirm(`Remove ${m.profile?.display_name || m.profile?.username} from the league?`)) return
    // Drop all their players first
    await supabase.from('rosters').delete().eq('league_id', leagueId).eq('user_id', m.user_id)
    const { error } = await supabase.from('league_members').delete().eq('id', m.id)
    if (error) return toast.error(error.message)
    toast.success('Member removed')
    refetch()
    qc.invalidateQueries({ queryKey: ['league-members', leagueId] })
  }

  return (
    <div className="space-y-3">
      <p className="text-field-400 text-sm">Manage team names, standings, draft positions, waiver priority, and commissioner status.</p>

      {members.map((m: any) => {
        const isMe = m.user_id === user?.id
        const isEditing = editingId === m.id
        const name = m.profile?.display_name || m.profile?.username || 'Unknown'

        return (
          <div key={m.id} className="panel space-y-3">
            {/* Header row */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-field-700 flex items-center justify-center text-gold font-black shrink-0">
                {name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-bold">{name}</span>
                  {isMe && <span className="text-xs bg-field-700 text-field-300 px-1.5 py-0.5 rounded">You</span>}
                  {m.is_commissioner && (
                    <span className="text-xs bg-gold/20 text-gold px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                      <Shield className="w-3 h-3" /> Commissioner
                    </span>
                  )}
                </div>
                <div className="text-field-400 text-xs">{m.team_name} · Draft #{m.draft_position ?? '—'} · Waiver #{m.waiver_priority ?? '—'}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                {!isEditing ? (
                  <>
                    <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => startEdit(m)}>
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {!isMe && (
                      <>
                        <button
                          className={clsx('btn-ghost !py-1 !px-2 text-xs', m.is_commissioner ? 'text-yellow-400' : 'text-gold')}
                          onClick={() => toggleCommissioner(m)}
                          title={m.is_commissioner ? 'Remove commissioner' : 'Make commissioner'}
                        >
                          <Crown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="btn-ghost !py-1 !px-2 text-xs text-red-400"
                          onClick={() => kickMember(m)}
                          title="Remove from league"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <button className="btn-ghost !py-1 !px-2" onClick={() => setEditingId(null)}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <button className="btn-gold !py-1 !px-2" onClick={() => saveMember(m.id)}>
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Editable fields */}
            {isEditing && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-field-700">
                <div>
                  <label className="label text-xs">Team Name</label>
                  <input className="input text-sm" value={editTeamName} onChange={e => setEditTeamName(e.target.value)} />
                </div>
                <div>
                  <label className="label text-xs">Draft Position</label>
                  <input type="number" className="input text-sm" value={editDraftPos} onChange={e => setEditDraftPos(e.target.value)} />
                </div>
                <div>
                  <label className="label text-xs">Waiver Priority</label>
                  <input type="number" className="input text-sm" value={editWaiver} onChange={e => setEditWaiver(e.target.value)} />
                </div>
                <div>
                  <label className="label text-xs">Wins</label>
                  <input type="number" className="input text-sm" value={editWins} onChange={e => setEditWins(e.target.value)} />
                </div>
                <div>
                  <label className="label text-xs">Losses</label>
                  <input type="number" className="input text-sm" value={editLosses} onChange={e => setEditLosses(e.target.value)} />
                </div>
                <div>
                  <label className="label text-xs">Points For</label>
                  <input type="number" step="0.1" className="input text-sm" value={editPF} onChange={e => setEditPF(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
