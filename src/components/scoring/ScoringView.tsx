import { LiveScoringView } from './LiveScoringView'
import { useAppStore } from '@/store/appStore'
import { AlertCircle } from 'lucide-react'

export function ScoringView() {
  const { activeLeague } = useAppStore()

  if (!activeLeague) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <AlertCircle className="w-12 h-12 text-gold/40 mx-auto mb-4" />
        <h2 className="text-white font-bold text-lg mb-2">No league selected</h2>
        <p className="text-field-400">Select a league to view scoring rules.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

      {/* ── Live scoring ── */}
      <LiveScoringView />

      {/* ── Scoring rules ── */}
      <div>
        <h1 className="section-title">Scoring Rules</h1>
        <p className="text-field-400 text-sm mt-1">
          {activeLeague.name} · <span className="capitalize">{activeLeague.scoring_type}</span>
        </p>
      </div>

      <ScoringSection title="Passing" rows={[
        ['Passing TD', activeLeague.score_pass_td ?? 4],
        ['Passing Yards (per 25)', activeLeague.score_pass_yd ?? 1],
        ['300+ Yard Bonus', activeLeague.score_pass_bonus_300 ?? 3],
        ['Interception', activeLeague.score_pass_int ?? -2],
      ]} />

      <ScoringSection title="Rushing" rows={[
        ['Rushing TD', activeLeague.score_rush_td ?? 6],
        ['Rushing Yards (per 10)', activeLeague.score_rush_yd ?? 1],
        ['100+ Yard Bonus', activeLeague.score_rush_bonus_100 ?? 3],
      ]} />

      <ScoringSection title="Receiving" rows={[
        ['Receiving TD', activeLeague.score_rec_td ?? 6],
        ['Receiving Yards (per 10)', activeLeague.score_rec_yd ?? 1],
        ['100+ Yard Bonus', activeLeague.score_rec_bonus_100 ?? 3],
        ['Reception', activeLeague.score_reception ?? 1],
      ]} />

      <ScoringSection title="Misc" rows={[
        ['Fumble Lost', activeLeague.score_fumble_lost ?? -2],
        ['2-Point Conversion', activeLeague.score_2pt_conv ?? 2],
      ]} />

      <ScoringSection title="Kicking" rows={[
        ['FG 0–39 yards', activeLeague.score_fg_0_39 ?? 3],
        ['FG 40–49 yards', activeLeague.score_fg_40_49 ?? 4],
        ['FG 50+ yards', activeLeague.score_fg_50_plus ?? 5],
        ['PAT Made', activeLeague.score_pat ?? 1],
        ['FG/PAT Missed', activeLeague.score_fg_miss ?? -1],
      ]} />

      <ScoringSection title="Defense / Special Teams" rows={[
        ['Sack', activeLeague.score_dst_sack ?? 1],
        ['Interception', activeLeague.score_dst_int ?? 2],
        ['Fumble Recovery', activeLeague.score_dst_fumble_rec ?? 2],
        ['Safety', activeLeague.score_dst_safety ?? 2],
        ['TD (any)', activeLeague.score_dst_td ?? 6],
        ['Blocked Kick', activeLeague.score_dst_blocked ?? 2],
        ['Points Allowed 0', activeLeague.score_dst_pts_0 ?? 10],
        ['Points Allowed 1–6', activeLeague.score_dst_pts_1_6 ?? 7],
        ['Points Allowed 7–13', activeLeague.score_dst_pts_7_13 ?? 4],
        ['Points Allowed 14–20', activeLeague.score_dst_pts_14_20 ?? 1],
        ['Points Allowed 21–27', activeLeague.score_dst_pts_21_27 ?? 0],
        ['Points Allowed 28–34', activeLeague.score_dst_pts_28_34 ?? -1],
        ['Points Allowed 35+', activeLeague.score_dst_pts_35_plus ?? -4],
      ]} />

    </div>
  )
}

function ScoringSection({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div className="panel">
      <h3 className="section-title text-sm mb-3">{title}</h3>
      <div className="space-y-0">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between py-2 border-b border-field-800 last:border-0">
            <span className="text-field-300 text-sm">{label}</span>
            <span className={value > 0 ? 'text-green-400 font-bold' : value < 0 ? 'text-red-400 font-bold' : 'text-field-400 font-bold'}>
              {value > 0 ? `+${value}` : value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
