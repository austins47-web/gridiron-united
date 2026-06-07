import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import type { CfpTeam, BowlGame } from '@/types/database'
import { Trophy, Plus, Check, X, Edit2, Trash2, Star, GraduationCap, ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

const CURRENT_SEASON = 2026

const CFP_ROUNDS = ['quarterfinal', 'semifinal', 'championship'] as const
const BOWL_ROUNDS = ['quarterfinal', 'semifinal', 'championship'] as const

// Common CFB teams for quick-add
const CFB_TEAM_LIST = [
  'Alabama','Auburn','Georgia','LSU','Tennessee','Texas A&M','Florida','South Carolina',
  'Ohio State','Michigan','Penn State','Michigan State','Iowa','Wisconsin','Notre Dame',
  'Texas','Oklahoma','Kansas State','Baylor','TCU','Oregon','Washington','USC','Utah',
  'Clemson','Florida State','Miami','NC State','Colorado','Boise State','Ole Miss',
  'Mississippi State','Arkansas','Kentucky','Missouri','Oklahoma State','West Virginia',
  'Iowa State','Cincinnati','UCF','Houston','BYU','Stanford','Arizona State','Arizona',
  'Washington State','Oregon State','UCLA','Indiana','Northwestern','Minnesota','Nebraska',
  'Duke','North Carolina','Virginia','Virginia Tech','Pittsburgh','Georgia Tech',
].sort()

// ── CFP Teams Manager (Option 1) ─────────────────────────────

function CfpManager() {
  const qc = useQueryClient()
  const [newTeam, setNewTeam] = useState('')
  const [newSeed, setNewSeed] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  const { data: cfpTeams = [], isLoading } = useQuery({
    queryKey: ['cfp-teams', CURRENT_SEASON],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cfp_teams')
        .select('*')
        .eq('season', CURRENT_SEASON)
        .order('seed', { ascending: true })
      if (error) throw error
      return data as CfpTeam[]
    },
  })

  const addTeam = useMutation({
    mutationFn: async () => {
      if (!newTeam.trim()) throw new Error('Select a team')
      const { error } = await supabase.from('cfp_teams').upsert({
        season: CURRENT_SEASON,
        team_name: newTeam.trim(),
        seed: newSeed ? parseInt(newSeed) : null,
        is_eliminated: false,
      }, { onConflict: 'season,team_name' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cfp-teams'] })
      setNewTeam('')
      setNewSeed('')
      toast.success('CFP team added')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const toggleEliminated = useMutation({
    mutationFn: async ({ id, is_eliminated, round }: { id: string, is_eliminated: boolean, round?: string }) => {
      const { error } = await supabase.from('cfp_teams')
        .update({ is_eliminated, eliminated_round: round ?? null, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cfp-teams'] }),
  })

  const removeTeam = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cfp_teams').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cfp-teams'] })
      toast.success('Team removed')
    },
  })

  const activeTeams = cfpTeams.filter(t => !t.is_eliminated)
  const eliminatedTeams = cfpTeams.filter(t => t.is_eliminated)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-cond font-black text-white uppercase tracking-wider">
            CFP Bracket — {CURRENT_SEASON}
          </h3>
          <p className="text-field-400 text-xs mt-0.5">
            Players on active CFP teams keep scoring through the national championship.
            Mark teams as eliminated after each round.
          </p>
        </div>
        <span className="font-cond font-bold text-xs px-2 py-1 rounded bg-cfb/20 text-cfb border border-cfb/30">
          {activeTeams.length} Active
        </span>
      </div>

      {/* Add team */}
      <div className="bg-field-800 border border-field-700 rounded-xl p-3 space-y-2">
        <label className="label">Add CFP Team</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <button
              onClick={() => setShowDropdown(d => !d)}
              className="input text-left flex items-center justify-between w-full"
            >
              <span className={newTeam ? 'text-white' : 'text-field-500'}>
                {newTeam || 'Select team…'}
              </span>
              <ChevronDown className="w-4 h-4 text-field-400 shrink-0" />
            </button>
            {showDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
                <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-field-800 border border-field-600 rounded-xl overflow-hidden shadow-2xl max-h-48 overflow-y-auto">
                  {CFB_TEAM_LIST.filter(t => !cfpTeams.some(c => c.team_name === t)).map(t => (
                    <button key={t} onClick={() => { setNewTeam(t); setShowDropdown(false) }}
                      className="w-full text-left px-3 py-2 text-sm text-field-200 hover:bg-field-700 hover:text-gold transition-colors">
                      {t}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <input
            className="input w-20"
            type="number"
            min={1} max={12}
            placeholder="Seed"
            value={newSeed}
            onChange={e => setNewSeed(e.target.value)}
          />
          <button className="btn-gold shrink-0" onClick={() => addTeam.mutate()} disabled={!newTeam}>
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active CFP teams */}
      {isLoading ? (
        <div className="text-field-400 text-sm text-center py-4">Loading…</div>
      ) : activeTeams.length === 0 ? (
        <div className="text-center py-6 text-field-500 text-sm">No CFP teams added yet</div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-1 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Still Active
          </div>
          {activeTeams.map(team => (
            <div key={team.id} className="flex items-center gap-3 bg-field-800 border border-emerald-500/20 rounded-xl px-3 py-2.5">
              <div className="w-6 h-6 rounded-full bg-cfb/20 border border-cfb/30 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-black text-cfb">{team.seed ?? '?'}</span>
              </div>
              <span className="font-cond font-bold text-white flex-1">{team.team_name}</span>
              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-400/10 px-2 py-0.5 rounded-full">
                Scoring Active
              </span>
              {/* Eliminate by round */}
              <div className="flex gap-1">
                {CFP_ROUNDS.map(round => (
                  <button
                    key={round}
                    onClick={() => toggleEliminated.mutate({ id: team.id, is_eliminated: true, round })}
                    title={`Eliminated in ${round}`}
                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-1 rounded border border-field-600 text-field-400 hover:border-red-500/50 hover:text-red-400 transition-colors"
                  >
                    {round === 'quarterfinal' ? 'QF' : round === 'semifinal' ? 'SF' : 'CHAMP'}
                  </button>
                ))}
              </div>
              <button onClick={() => removeTeam.mutate(team.id)} className="text-field-600 hover:text-red-400 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Eliminated teams */}
      {eliminatedTeams.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-field-500 flex items-center gap-1.5">
            <X className="w-3 h-3" /> Eliminated
          </div>
          {eliminatedTeams.map(team => (
            <div key={team.id} className="flex items-center gap-3 bg-field-800/40 border border-field-700/50 rounded-xl px-3 py-2 opacity-60">
              <span className="font-cond font-bold text-field-400 flex-1">{team.team_name}</span>
              <span className="text-[10px] text-field-500 capitalize">
                Out: {team.eliminated_round ?? 'unknown'}
              </span>
              <button
                onClick={() => toggleEliminated.mutate({ id: team.id, is_eliminated: false })}
                className="text-[10px] text-gold hover:text-gold-light font-bold transition-colors"
              >
                Restore
              </button>
              <button onClick={() => removeTeam.mutate(team.id)} className="text-field-600 hover:text-red-400 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Bowl Games Manager (Option 2) ────────────────────────────

function BowlManager() {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    bowl_name: '', home_team: '', away_team: '',
    game_date: '', is_cfp: false, cfp_round: '',
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editScore, setEditScore] = useState({ home: '', away: '' })

  const { data: bowlGames = [] } = useQuery({
    queryKey: ['bowl-games', CURRENT_SEASON],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bowl_games')
        .select('*')
        .eq('season', CURRENT_SEASON)
        .order('game_date', { ascending: true })
      if (error) throw error
      return data as BowlGame[]
    },
  })

  const addGame = useMutation({
    mutationFn: async () => {
      if (!form.bowl_name || !form.home_team || !form.away_team) throw new Error('Fill in all fields')
      const { error } = await supabase.from('bowl_games').insert({
        season: CURRENT_SEASON,
        bowl_name: form.bowl_name,
        home_team: form.home_team,
        away_team: form.away_team,
        game_date: form.game_date ? new Date(form.game_date).toISOString() : null,
        is_cfp: form.is_cfp,
        cfp_round: form.cfp_round || null,
        status: 'scheduled',
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bowl-games'] })
      setForm({ bowl_name: '', home_team: '', away_team: '', game_date: '', is_cfp: false, cfp_round: '' })
      toast.success('Bowl game added')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const saveScore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bowl_games').update({
        home_score: editScore.home ? parseInt(editScore.home) : null,
        away_score: editScore.away ? parseInt(editScore.away) : null,
        status: editScore.home && editScore.away ? 'final' : 'in_progress',
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bowl-games'] })
      setEditingId(null)
      toast.success('Score saved')
    },
  })

  const deleteGame = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bowl_games').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bowl-games'] }),
  })

  const cfpGames  = bowlGames.filter(g => g.is_cfp)
  const bowlOnly  = bowlGames.filter(g => !g.is_cfp)

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-cond font-black text-white uppercase tracking-wider">
          Bowl & CFP Games — {CURRENT_SEASON}
        </h3>
        <p className="text-field-400 text-xs mt-0.5">
          Add bowl games so players on participating teams score during the postseason.
          Mark CFP games to flag them for Option 1 scoring.
        </p>
      </div>

      {/* Add game form */}
      <div className="bg-field-800 border border-field-700 rounded-xl p-4 space-y-3">
        <label className="label">Add Bowl Game</label>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <input className="input" placeholder="Bowl name (e.g. Rose Bowl)" value={form.bowl_name}
              onChange={e => setForm(f => ({ ...f, bowl_name: e.target.value }))} />
          </div>
          <div>
            <select className="input" value={form.away_team}
              onChange={e => setForm(f => ({ ...f, away_team: e.target.value }))}>
              <option value="">Away team…</option>
              {CFB_TEAM_LIST.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <select className="input" value={form.home_team}
              onChange={e => setForm(f => ({ ...f, home_team: e.target.value }))}>
              <option value="">Home team…</option>
              {CFB_TEAM_LIST.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <input className="input" type="datetime-local" value={form.game_date}
              onChange={e => setForm(f => ({ ...f, game_date: e.target.value }))} />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_cfp}
                onChange={e => setForm(f => ({ ...f, is_cfp: e.target.checked }))}
                className="w-4 h-4 rounded accent-gold" />
              <span className="text-sm text-field-300 font-bold">CFP Game</span>
            </label>
            {form.is_cfp && (
              <select className="input flex-1" value={form.cfp_round}
                onChange={e => setForm(f => ({ ...f, cfp_round: e.target.value }))}>
                <option value="">Round…</option>
                <option value="quarterfinal">Quarterfinal</option>
                <option value="semifinal">Semifinal</option>
                <option value="championship">Championship</option>
              </select>
            )}
          </div>
        </div>
        <button className="btn-gold w-full" onClick={() => addGame.mutate()}>
          <Plus className="w-4 h-4" /> Add Game
        </button>
      </div>

      {/* CFP Games */}
      {cfpGames.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-gold flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" /> CFP Games
          </div>
          {cfpGames.map(game => (
            <GameRow key={game.id} game={game}
              editingId={editingId} editScore={editScore}
              onEdit={() => { setEditingId(game.id); setEditScore({ home: game.home_score?.toString() ?? '', away: game.away_score?.toString() ?? '' }) }}
              onSave={() => saveScore.mutate(game.id)}
              onCancel={() => setEditingId(null)}
              onDelete={() => deleteGame.mutate(game.id)}
              onScoreChange={setEditScore}
            />
          ))}
        </div>
      )}

      {/* Bowl Games */}
      {bowlOnly.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-field-300 flex items-center gap-1.5">
            <GraduationCap className="w-3.5 h-3.5" /> Bowl Games ({bowlOnly.length})
          </div>
          {bowlOnly.map(game => (
            <GameRow key={game.id} game={game}
              editingId={editingId} editScore={editScore}
              onEdit={() => { setEditingId(game.id); setEditScore({ home: game.home_score?.toString() ?? '', away: game.away_score?.toString() ?? '' }) }}
              onSave={() => saveScore.mutate(game.id)}
              onCancel={() => setEditingId(null)}
              onDelete={() => deleteGame.mutate(game.id)}
              onScoreChange={setEditScore}
            />
          ))}
        </div>
      )}
      {bowlGames.length === 0 && (
        <div className="text-center py-8 text-field-500 text-sm">No bowl games added yet</div>
      )}
    </div>
  )
}

function GameRow({ game, editingId, editScore, onEdit, onSave, onCancel, onDelete, onScoreChange }: {
  game: BowlGame
  editingId: string | null
  editScore: { home: string, away: string }
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
  onScoreChange: (s: { home: string, away: string }) => void
}) {
  const isEditing = editingId === game.id
  return (
    <div className={clsx(
      'flex items-center gap-3 rounded-xl px-3 py-2.5 border text-sm',
      game.status === 'final' ? 'bg-field-800/40 border-field-700/50' : 'bg-field-800 border-field-700',
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white truncate">{game.bowl_name}</span>
          {game.is_cfp && (
            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold/20 text-gold border border-gold/30 shrink-0">
              CFP {game.cfp_round?.slice(0,4).toUpperCase()}
            </span>
          )}
        </div>
        <div className="text-field-400 text-xs">{game.away_team} @ {game.home_team}</div>
      </div>

      {isEditing ? (
        <div className="flex items-center gap-1.5">
          <input className="input w-14 text-center" placeholder="Away" value={editScore.away}
            onChange={e => onScoreChange({ ...editScore, away: e.target.value })} />
          <span className="text-field-500 text-xs">–</span>
          <input className="input w-14 text-center" placeholder="Home" value={editScore.home}
            onChange={e => onScoreChange({ ...editScore, home: e.target.value })} />
          <button onClick={onSave} className="btn-gold !py-1 !px-2"><Check className="w-3.5 h-3.5" /></button>
          <button onClick={onCancel} className="btn-ghost !py-1 !px-2"><X className="w-3.5 h-3.5" /></button>
        </div>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          {game.status === 'final' ? (
            <span className="text-field-300 font-mono text-xs">
              {game.away_score} – {game.home_score}
              <span className="text-emerald-400 ml-1.5 font-bold">Final</span>
            </span>
          ) : (
            <span className="text-field-500 text-xs capitalize">{game.status}</span>
          )}
          <button onClick={onEdit} className="text-field-500 hover:text-gold transition-colors">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="text-field-600 hover:text-red-400 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── CFB Offseason Settings (Option 3) ────────────────────────

function OffseasonSettings({ league }: { league: any }) {
  const qc = useQueryClient()
  const [slots, setSlots] = useState(league.slots_cfb_os ?? 5)
  const [bowlScoring, setBowlScoring] = useState(league.cfb_bowl_scoring ?? true)
  const [cfpOnly, setCfpOnly] = useState(league.cfb_cfp_only ?? false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('leagues').update({
        slots_cfb_os: slots,
        cfb_postseason_scoring: true,
        cfb_bowl_scoring: bowlScoring,
        cfb_cfp_only: cfpOnly,
      }).eq('id', league.id)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['my-leagues'] })
      toast.success('Postseason settings saved')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-cond font-black text-white uppercase tracking-wider">
          Postseason Settings
        </h3>
        <p className="text-field-400 text-xs mt-0.5">
          Configure how CFB players are handled after the regular season ends.
        </p>
      </div>

      {/* Option 3: CFB Offseason slots */}
      <div className="bg-field-800 border border-field-700 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <GraduationCap className="w-4 h-4 text-cfb" />
          <span className="font-bold text-white text-sm">Option 3 — CFB Offseason Roster Slots</span>
        </div>
        <p className="text-field-400 text-xs leading-relaxed">
          When a CFB team is eliminated or their season ends, their players can be moved to
          CFB Offseason (CFB OS) slots. These players don't score and don't count against
          your active roster — letting you hold dynasty prospects without penalty.
        </p>
        <div className="flex items-center gap-3">
          <label className="label !mb-0 shrink-0">CFB OS Slots</label>
          <input type="number" min={0} max={10} value={slots}
            onChange={e => setSlots(parseInt(e.target.value) || 0)}
            className="input w-20" />
          <span className="text-field-500 text-xs">players held without scoring</span>
        </div>
      </div>

      {/* Option 1 + 2: Scoring toggle */}
      <div className="bg-field-800 border border-field-700 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="w-4 h-4 text-gold" />
          <span className="font-bold text-white text-sm">Options 1 & 2 — Bowl & CFP Scoring</span>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={bowlScoring}
            onChange={e => setBowlScoring(e.target.checked)}
            className="w-4 h-4 rounded accent-gold" />
          <div>
            <div className="text-sm font-bold text-white">Bowl Game Scoring</div>
            <div className="text-xs text-field-400">Players on bowl-eligible teams score during their bowl game (Option 2)</div>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={cfpOnly} disabled={!bowlScoring}
            onChange={e => setCfpOnly(e.target.checked)}
            className="w-4 h-4 rounded accent-gold disabled:opacity-40" />
          <div className={!bowlScoring ? 'opacity-40' : ''}>
            <div className="text-sm font-bold text-white">CFP Teams Only</div>
            <div className="text-xs text-field-400">Only score players on CFP bracket teams — ignore non-CFP bowl games (Option 1)</div>
          </div>
        </label>

        <div className="bg-field-900/50 rounded-lg p-3 text-xs text-field-400 space-y-1">
          <div className="font-bold text-field-300 mb-1">How it works:</div>
          <div>• <span className="text-white">Both off</span> — CFB scoring ends after regular season Week 15</div>
          <div>• <span className="text-white">Bowl on, CFP only off</span> — All ~40 bowl games score (most inclusive)</div>
          <div>• <span className="text-white">Both on</span> — Only CFP bracket teams score through the championship</div>
        </div>
      </div>

      <button className="btn-gold w-full" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save Postseason Settings'}
      </button>
    </div>
  )
}

// ── Main Export ───────────────────────────────────────────────

export function CfbPostseasonManager({ league }: { league: any }) {
  const [section, setSection] = useState<'cfp' | 'bowls' | 'settings'>('settings')

  const sections = [
    { id: 'settings' as const, label: 'Settings',   icon: <Star className="w-3.5 h-3.5" /> },
    { id: 'cfp'      as const, label: 'CFP Bracket', icon: <Trophy className="w-3.5 h-3.5" /> },
    { id: 'bowls'    as const, label: 'Bowl Games',  icon: <GraduationCap className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-field-800 border border-field-700 rounded-lg p-0.5">
        {sections.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={clsx(
              'flex items-center gap-1.5 font-cond font-bold text-xs uppercase tracking-wider px-3 py-2 rounded-md transition-colors flex-1 justify-center',
              section === s.id ? 'bg-field-700 text-white' : 'text-field-400 hover:text-white',
            )}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {section === 'settings' && <OffseasonSettings league={league} />}
      {section === 'cfp'      && <CfpManager />}
      {section === 'bowls'    && <BowlManager />}
    </div>
  )
}
