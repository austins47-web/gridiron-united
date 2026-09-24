import { useNavigate } from 'react-router-dom'
import { Trophy, Target, ArrowRight } from 'lucide-react'
import clsx from 'clsx'
import type { WeekStats } from '@/components/pickem/standings'
import { buildStatTiles } from '@/components/pickem/weekStatTiles'

/**
 * What send-reminders posts to league chat when a Pick'Em week goes
 * final, as `PICKEM_WEEK_FINAL:<season>:<week>:<this, as JSON>` in a
 * system message (the season/week prefix is what it checks to avoid
 * posting twice). Same prefixed-system-message convention as
 * TRADE_COMPLETED:.
 */
export interface PickemWeekFinalPayload {
  season: number
  week: number
  winners: string[]
  correct: number
  total: number
  decidedByTiebreak: boolean
  tiebreakerTotal: number | null
  winnerGuess: number | null
  stats: WeekStats
}

export const PICKEM_WEEK_FINAL_PATTERN = /^PICKEM_WEEK_FINAL:\d+:\d+:/

const weekLabel = (w: number) =>
  w === 19 ? 'Wild Card' : w === 20 ? 'Divisional' : w === 21 ? 'Conf. Champ.' : w === 22 ? 'Super Bowl' : `Week ${w}`

export function PickemWeekFinalCard({ data, timeLabel, isNew }: {
  data: PickemWeekFinalPayload
  timeLabel: string
  isNew?: boolean
}) {
  const navigate = useNavigate()
  const tiles = buildStatTiles(data.stats)
  const tie = data.winners.length > 1

  return (
    <div className="flex justify-center my-3 px-2">
      <div className={clsx(
        'w-full max-w-sm rounded-2xl overflow-hidden border border-gold/35 bg-field-900',
        isNew && 'rise-in',
      )}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-field-700 bg-gold/[0.06]">
          <Trophy className="w-4 h-4 text-gold" strokeWidth={2.25} />
          <span className="font-cond font-black text-base uppercase tracking-wider text-white">
            {weekLabel(data.week)} Final
          </span>
          <span className="ml-auto text-xs text-field-500">{timeLabel}</span>
        </div>

        <div className="px-4 pt-3 pb-3">
          <p className="font-cond font-bold text-[11px] uppercase tracking-[0.18em] text-field-400">
            {tie ? `${data.winners.length}-way tie` : 'Winner'}
          </p>
          <p className="font-cond font-black text-2xl uppercase text-white leading-tight truncate">
            {data.winners.join(' & ')}
          </p>
          <p className="text-sm mt-0.5">
            <span className="font-cond font-black text-gold tabular-nums">{data.correct}</span>
            <span className="text-field-500">/{data.total}</span>
            {data.total > 0 && (
              <span className="text-field-400 ml-2">{Math.round((data.correct / data.total) * 100)}% correct</span>
            )}
          </p>
          {data.decidedByTiebreak && data.tiebreakerTotal != null && (
            <p className="flex items-center gap-1 text-xs text-field-400 mt-1.5">
              <Target className="w-3 h-3 text-gold shrink-0" />
              Tiebreaker decided it — total {data.tiebreakerTotal}, guessed {data.winnerGuess ?? '—'}
            </p>
          )}
        </div>

        {tiles.length > 0 && (
          <div className="border-t border-field-700 px-4 py-3 space-y-2">
            {tiles.map(t => (
              <div key={t.label} className="flex items-start gap-2 text-xs">
                <t.icon className="w-3.5 h-3.5 text-gold mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <span className="font-cond font-bold uppercase tracking-wider text-field-400">{t.label}</span>
                  <span className="font-bold text-white"> · {t.headline}</span>
                  <p className="text-field-400 leading-snug">{t.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => navigate(`/app/pickem?week=${data.week}`, { state: { pickemTab: 'standings' } })}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-field-700 text-xs font-bold uppercase tracking-wider text-gold hover:bg-gold/[0.06] transition-colors"
        >
          Full standings <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
