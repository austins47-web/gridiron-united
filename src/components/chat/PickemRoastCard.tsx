import { Mic } from 'lucide-react'
import clsx from 'clsx'

/**
 * The weekly roast send-reminders posts after a Pick'Em week's final
 * card, in leagues whose commissioner turned it on (leagues.ai_recap):
 * `PICKEM_ROAST:<season>:<week>:<this, as JSON>` in a system message.
 */
export interface PickemRoastPayload {
  week: number
  text: string
}

export const PICKEM_ROAST_PATTERN = /^PICKEM_ROAST:\d+:\d+:/

const weekLabel = (w: number) =>
  w === 19 ? 'Wild Card' : w === 20 ? 'Divisional' : w === 21 ? 'Conf. Champ.' : w === 22 ? 'Super Bowl' : `Week ${w}`

export function PickemRoastCard({ data, timeLabel, isNew }: {
  data: PickemRoastPayload
  timeLabel: string
  isNew?: boolean
}) {
  return (
    <div className="flex justify-center my-3 px-2">
      <div className={clsx(
        'w-full max-w-sm rounded-2xl overflow-hidden border border-field-600 bg-field-900',
        isNew && 'rise-in',
      )}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-field-700">
          <span className="w-6 h-6 rounded-full bg-gold/15 border border-gold/40 flex items-center justify-center">
            <Mic className="w-3.5 h-3.5 text-gold" strokeWidth={2.25} />
          </span>
          <span className="font-cond font-black text-base uppercase tracking-wider text-white">The Commish</span>
          <span className="font-cond font-bold text-[11px] uppercase tracking-[0.14em] text-field-400">· {weekLabel(data.week)} roast</span>
          <span className="ml-auto text-xs text-field-500">{timeLabel}</span>
        </div>
        <p className="px-4 py-3 text-sm text-field-100 leading-relaxed whitespace-pre-line">{data.text}</p>
        <p className="px-4 pb-2.5 text-[10px] text-field-600">Written by Claude from the week&apos;s results</p>
      </div>
    </div>
  )
}
