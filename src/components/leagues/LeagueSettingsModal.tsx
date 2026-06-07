import { useState } from 'react'
import { X, Save, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import type { League, ScoringRules, RosterSlotConfig } from '@/types/database'
import toast from 'react-hot-toast'

interface Props {
  league: League
  onClose: () => void
  onSaved: (updated: League) => void
}

const DEFAULT_SCORING: ScoringRules = {
  score_pass_td: 4, score_pass_yd: 0.04, score_pass_bonus_300: 3, score_pass_int: -2,
  score_rush_td: 6, score_rush_yd: 0.1, score_rush_bonus_100: 3,
  score_rec_td: 6, score_rec_yd: 0.1, score_rec_bonus_100: 3,
  score_reception: 0.5, score_fumble_lost: -2, score_2pt_conv: 2,
  score_fg_0_39: 3, score_fg_40_49: 4, score_fg_50_plus: 5, score_pat: 1, score_fg_miss: -1,
  score_dst_sack: 1, score_dst_int: 2, score_dst_fumble_rec: 2, score_dst_td: 6,
  score_dst_safety: 2, score_dst_blocked: 2,
  score_dst_pts_0: 10, score_dst_pts_1_6: 7, score_dst_pts_7_13: 4,
  score_dst_pts_14_20: 1, score_dst_pts_21_27: 0, score_dst_pts_28_34: -1, score_dst_pts_35_plus: -4,
}

const DEFAULT_SLOTS: RosterSlotConfig = {
  slots_qb: 1, slots_rb: 2, slots_wr: 2, slots_te: 1,
  slots_flex: 2, slots_dst: 1, slots_k: 1, slots_bench: 6, slots_ir: 1,
}

type Tab = 'roster' | 'scoring' | 'meta'

export function LeagueSettingsModal({ league, onClose, onSaved }: Props) {
  const { user } = useAppStore()
  const isCommissioner = league.commissioner_id === user?.id
  const [tab, setTab] = useState<Tab>('roster')
  const [saving, setSaving] = useState(false)
  // Roster slots
  const [slots, setSlots] = useState<RosterSlotConfig>({
    slots_qb: league.slots_qb, slots_rb: league.slots_rb, slots_wr: league.slots_wr,
    slots_te: league.slots_te, slots_flex: league.slots_flex, slots_dst: league.slots_dst,
    slots_k: league.slots_k, slots_bench: league.slots_bench, slots_ir: league.slots_ir,
  })

  // Scoring
  const [scoring, setScoring] = useState<ScoringRules>({
    score_pass_td: league.score_pass_td, score_pass_yd: league.score_pass_yd,
    score_pass_bonus_300: league.score_pass_bonus_300, score_pass_int: league.score_pass_int,
    score_rush_td: league.score_rush_td, score_rush_yd: league.score_rush_yd,
    score_rush_bonus_100: league.score_rush_bonus_100,
    score_rec_td: league.score_rec_td, score_rec_yd: league.score_rec_yd,
    score_rec_bonus_100: league.score_rec_bonus_100, score_reception: league.score_reception,
    score_fumble_lost: league.score_fumble_lost, score_2pt_conv: league.score_2pt_conv,
    score_fg_0_39: league.score_fg_0_39, score_fg_40_49: league.score_fg_40_49,
    score_fg_50_plus: league.score_fg_50_plus, score_pat: league.score_pat,
    score_fg_miss: league.score_fg_miss,
    score_dst_sack: league.score_dst_sack, score_dst_int: league.score_dst_int,
    score_dst_fumble_rec: league.score_dst_fumble_rec, score_dst_td: league.score_dst_td,
    score_dst_safety: league.score_dst_safety, score_dst_blocked: league.score_dst_blocked,
    score_dst_pts_0: league.score_dst_pts_0, score_dst_pts_1_6: league.score_dst_pts_1_6,
    score_dst_pts_7_13: league.score_dst_pts_7_13, score_dst_pts_14_20: league.score_dst_pts_14_20,
    score_dst_pts_21_27: league.score_dst_pts_21_27, score_dst_pts_28_34: league.score_dst_pts_28_34,
    score_dst_pts_35_plus: league.score_dst_pts_35_plus,
  })

  // Meta
  const [meta, setMeta] = useState({
    name: league.name,
    num_teams: league.num_teams,
    draft_pick_timer: league.draft_pick_timer,
    scoring_type: league.scoring_type,
    is_public: league.is_public,
  })

  const ss = (key: keyof ScoringRules) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setScoring(s => ({ ...s, [key]: parseFloat(e.target.value) || 0 }))

  const sl = (key: keyof RosterSlotConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSlots(s => ({ ...s, [key]: parseInt(e.target.value) || 0 }))

  async function save() {
    if (!isCommissioner) return
    setSaving(true)
    const update = { ...slots, ...scoring, ...meta, updated_at: new Date().toISOString() }
    const { data, error } = await supabase
      .from('leagues')
      .update(update)
      .eq('id', league.id)
      .select()
      .single()
    if (error) { toast.error('Failed to save: ' + error.message); setSaving(false); return }
    toast.success('League settings saved!')
    onSaved(data as League)
    setSaving(false)
    onClose()
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'roster', label: 'Roster Slots' },
    { id: 'scoring', label: 'Scoring Rules' },
    { id: 'meta', label: 'League Info' },
  ]

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box modal-lg !p-0">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h2 className="font-cond font-black text-xl uppercase tracking-wider text-gold">
              League Settings
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{league.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-white/5 text-gray-400 hover:text-gray-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        {!isCommissioner && (
          <div className="mx-5 mt-4 p-3 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
            Only the commissioner can edit league settings. You can view them here.
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-white/10 px-5">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`py-3 px-4 font-cond font-bold text-sm uppercase tracking-wider border-b-2 transition-colors
                ${tab === t.id ? 'border-gold text-gold' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-6 overflow-y-auto max-h-[60vh]">

          {/* ── ROSTER SLOTS ── */}
          {tab === 'roster' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-cond font-bold text-base text-gray-200 uppercase tracking-wider">
                  Starter Slots
                </h3>
                <button onClick={() => setSlots(DEFAULT_SLOTS)} disabled={!isCommissioner}
                  className="btn-ghost flex items-center gap-1.5 text-xs">
                  <RotateCcw size={12} /> Reset defaults
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {([
                  ['slots_qb', 'QB', '0-3'],
                  ['slots_rb', 'RB', '1-4'],
                  ['slots_wr', 'WR', '1-5'],
                  ['slots_te', 'TE', '0-3'],
                  ['slots_flex', 'FLEX (RB/WR/TE)', '0-4'],
                  ['slots_dst', 'D/ST', '0-2'],
                  ['slots_k', 'Kicker', '0-2'],
                  ['slots_bench', 'Bench', '3-10'],
                  ['slots_ir', 'IR', '0-3'],
                ] as [keyof RosterSlotConfig, string, string][]).map(([key, label, range]) => (
                  <div key={key}>
                    <label className="label">{label} <span className="text-gray-600 normal-case font-normal tracking-normal">(range: {range})</span></label>
                    <input
                      className="input"
                      type="number"
                      value={slots[key]}
                      onChange={sl(key)}
                      disabled={!isCommissioner}
                      min={0} max={10}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4 p-3 rounded bg-gold/5 border border-gold/10 text-sm text-gray-400">
                <strong className="text-gold">Total starters:</strong>{' '}
                {slots.slots_qb + slots.slots_rb + slots.slots_wr + slots.slots_te + slots.slots_flex + slots.slots_dst + slots.slots_k} players
                &nbsp;·&nbsp;
                <strong className="text-gold">Bench:</strong> {slots.slots_bench}
                &nbsp;·&nbsp;
                <strong className="text-gold">Total roster:</strong>{' '}
                {slots.slots_qb + slots.slots_rb + slots.slots_wr + slots.slots_te + slots.slots_flex + slots.slots_dst + slots.slots_k + slots.slots_bench + slots.slots_ir}
              </div>
            </div>
          )}

          {/* ── SCORING RULES ── */}
          {tab === 'scoring' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-cond font-bold text-base text-gray-200 uppercase tracking-wider">Scoring Rules</h3>
                <button onClick={() => setScoring(DEFAULT_SCORING)} disabled={!isCommissioner}
                  className="btn-ghost flex items-center gap-1.5 text-xs">
                  <RotateCcw size={12} /> Reset defaults
                </button>
              </div>

              {/* Passing */}
              <ScoreSection title="Passing">
                <ScoreRow label="Passing TD" value={scoring.score_pass_td} onChange={ss('score_pass_td')} disabled={!isCommissioner} />
                <ScoreRow label="Per passing yard" value={scoring.score_pass_yd} onChange={ss('score_pass_yd')} disabled={!isCommissioner} step={0.01} note="0.04 = 1pt/25yds" />
                <ScoreRow label="300+ yard bonus" value={scoring.score_pass_bonus_300} onChange={ss('score_pass_bonus_300')} disabled={!isCommissioner} />
                <ScoreRow label="Interception" value={scoring.score_pass_int} onChange={ss('score_pass_int')} disabled={!isCommissioner} />
              </ScoreSection>

              {/* Rushing */}
              <ScoreSection title="Rushing">
                <ScoreRow label="Rushing TD" value={scoring.score_rush_td} onChange={ss('score_rush_td')} disabled={!isCommissioner} />
                <ScoreRow label="Per rushing yard" value={scoring.score_rush_yd} onChange={ss('score_rush_yd')} disabled={!isCommissioner} step={0.01} note="0.1 = 1pt/10yds" />
                <ScoreRow label="100+ yard bonus" value={scoring.score_rush_bonus_100} onChange={ss('score_rush_bonus_100')} disabled={!isCommissioner} />
              </ScoreSection>

              {/* Receiving */}
              <ScoreSection title="Receiving">
                <ScoreRow label="Receiving TD" value={scoring.score_rec_td} onChange={ss('score_rec_td')} disabled={!isCommissioner} />
                <ScoreRow label="Per receiving yard" value={scoring.score_rec_yd} onChange={ss('score_rec_yd')} disabled={!isCommissioner} step={0.01} />
                <ScoreRow label="Per reception (PPR)" value={scoring.score_reception} onChange={ss('score_reception')} disabled={!isCommissioner} step={0.5} note="0=Std, 0.5=Half, 1=Full" />
                <ScoreRow label="100+ yard bonus" value={scoring.score_rec_bonus_100} onChange={ss('score_rec_bonus_100')} disabled={!isCommissioner} />
              </ScoreSection>

              {/* Misc offense */}
              <ScoreSection title="Misc Offense">
                <ScoreRow label="Fumble lost" value={scoring.score_fumble_lost} onChange={ss('score_fumble_lost')} disabled={!isCommissioner} />
                <ScoreRow label="2-pt conversion" value={scoring.score_2pt_conv} onChange={ss('score_2pt_conv')} disabled={!isCommissioner} />
              </ScoreSection>

              {/* Kicking */}
              <ScoreSection title="Kicking">
                <ScoreRow label="FG 0-39 yds" value={scoring.score_fg_0_39} onChange={ss('score_fg_0_39')} disabled={!isCommissioner} />
                <ScoreRow label="FG 40-49 yds" value={scoring.score_fg_40_49} onChange={ss('score_fg_40_49')} disabled={!isCommissioner} />
                <ScoreRow label="FG 50+ yds" value={scoring.score_fg_50_plus} onChange={ss('score_fg_50_plus')} disabled={!isCommissioner} />
                <ScoreRow label="PAT made" value={scoring.score_pat} onChange={ss('score_pat')} disabled={!isCommissioner} />
                <ScoreRow label="FG missed" value={scoring.score_fg_miss} onChange={ss('score_fg_miss')} disabled={!isCommissioner} />
              </ScoreSection>

              {/* DST */}
              <ScoreSection title="Defense / Special Teams">
                <ScoreRow label="Sack" value={scoring.score_dst_sack} onChange={ss('score_dst_sack')} disabled={!isCommissioner} />
                <ScoreRow label="Interception" value={scoring.score_dst_int} onChange={ss('score_dst_int')} disabled={!isCommissioner} />
                <ScoreRow label="Fumble recovery" value={scoring.score_dst_fumble_rec} onChange={ss('score_dst_fumble_rec')} disabled={!isCommissioner} />
                <ScoreRow label="Defensive TD" value={scoring.score_dst_td} onChange={ss('score_dst_td')} disabled={!isCommissioner} />
                <ScoreRow label="Safety" value={scoring.score_dst_safety} onChange={ss('score_dst_safety')} disabled={!isCommissioner} />
                <ScoreRow label="Blocked kick/punt" value={scoring.score_dst_blocked} onChange={ss('score_dst_blocked')} disabled={!isCommissioner} />
                <ScoreRow label="0 pts allowed" value={scoring.score_dst_pts_0} onChange={ss('score_dst_pts_0')} disabled={!isCommissioner} />
                <ScoreRow label="1-6 pts allowed" value={scoring.score_dst_pts_1_6} onChange={ss('score_dst_pts_1_6')} disabled={!isCommissioner} />
                <ScoreRow label="7-13 pts allowed" value={scoring.score_dst_pts_7_13} onChange={ss('score_dst_pts_7_13')} disabled={!isCommissioner} />
                <ScoreRow label="14-20 pts allowed" value={scoring.score_dst_pts_14_20} onChange={ss('score_dst_pts_14_20')} disabled={!isCommissioner} />
                <ScoreRow label="21-27 pts allowed" value={scoring.score_dst_pts_21_27} onChange={ss('score_dst_pts_21_27')} disabled={!isCommissioner} />
                <ScoreRow label="28-34 pts allowed" value={scoring.score_dst_pts_28_34} onChange={ss('score_dst_pts_28_34')} disabled={!isCommissioner} />
                <ScoreRow label="35+ pts allowed" value={scoring.score_dst_pts_35_plus} onChange={ss('score_dst_pts_35_plus')} disabled={!isCommissioner} />
              </ScoreSection>
            </div>
          )}

          {/* ── LEAGUE META ── */}
          {tab === 'meta' && (
            <div className="space-y-4">
              <div>
                <label className="label">League Name</label>
                <input className="input" value={meta.name}
                  onChange={e => setMeta(m => ({ ...m, name: e.target.value }))}
                  disabled={!isCommissioner} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Number of Teams</label>
                  <select className="input" value={meta.num_teams}
                    onChange={e => setMeta(m => ({ ...m, num_teams: parseInt(e.target.value) }))}
                    disabled={!isCommissioner || league.draft_status !== 'pre_draft'}
                    style={{ appearance: 'none' }}>
                    {[8,10,12,14,16].map(n => <option key={n} value={n}>{n} teams</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Draft Pick Timer (sec)</label>
                  <input className="input" type="number" value={meta.draft_pick_timer}
                    onChange={e => setMeta(m => ({ ...m, draft_pick_timer: parseInt(e.target.value) || 90 }))}
                    disabled={!isCommissioner} min={30} max={300} step={30} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Scoring Type</label>
                  <select className="input" value={meta.scoring_type}
                    onChange={e => setMeta(m => ({ ...m, scoring_type: e.target.value as typeof meta.scoring_type }))}
                    disabled={!isCommissioner} style={{ appearance: 'none' }}>
                    <option value="standard">Standard (No PPR)</option>
                    <option value="half_ppr">Half PPR (0.5/rec)</option>
                    <option value="ppr">Full PPR (1/rec)</option>
                  </select>
                </div>
                <div>
                  <label className="label">League Visibility</label>
                  <select className="input" value={meta.is_public ? 'public' : 'private'}
                    onChange={e => setMeta(m => ({ ...m, is_public: e.target.value === 'public' }))}
                    disabled={!isCommissioner} style={{ appearance: 'none' }}>
                    <option value="public">Public (anyone can find it)</option>
                    <option value="private">Private (invite only)</option>
                  </select>
                </div>
              </div>
              <div className="p-3 rounded bg-field-700 border border-white/[0.06] text-sm text-gray-500">
                <strong className="text-gray-300">Invite Code:</strong>{' '}
                <span className="font-cond font-bold text-gold tracking-wider">{league.invite_code}</span>
                <span className="ml-2 text-xs">Share this so others can join your league</span>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-white/10">
          <button onClick={onClose} className="btn-outline">Cancel</button>
          {isCommissioner && (
            <button onClick={save} disabled={saving} className="btn-gold flex items-center gap-2">
              <Save size={15} />
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ScoreSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="font-cond font-bold text-xs uppercase tracking-wider text-gray-500 mb-2 pb-1.5 border-b border-white/[0.06]">
        {title}
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
        {children}
      </div>
    </div>
  )
}

function ScoreRow({
  label, value, onChange, disabled, step = 1, note
}: {
  label: string; value: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  disabled?: boolean; step?: number; note?: string
}) {
  return (
    <div>
      <label className="label">{label}
        {note && <span className="text-gray-600 normal-case font-normal tracking-normal ml-1">({note})</span>}
      </label>
      <input className="input" type="number" value={value} onChange={onChange}
        disabled={disabled} step={step} />
    </div>
  )
}
