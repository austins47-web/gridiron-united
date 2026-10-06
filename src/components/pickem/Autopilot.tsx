import { Bot } from 'lucide-react'
import clsx from 'clsx'
import { useAutopilot, AUTOPILOT_LABELS, type AutopilotRule } from '@/hooks/useAutopilot'

const OPTIONS: { rule: AutopilotRule | null; label: string }[] = [
  { rule: null, label: 'Off' },
  ...(Object.keys(AUTOPILOT_LABELS) as AutopilotRule[]).map(rule => ({ rule, label: AUTOPILOT_LABELS[rule] })),
]

const RULE_BLURB: Record<AutopilotRule, string> = {
  favorites: 'the Vegas favorite',
  home: 'the home team',
  majority: 'whichever side most of the league took',
}

/**
 * Picks tab: a backup rule for any game you don't get to. Autopilot
 * (send-reminders) picks it in the last few minutes before it locks,
 * and fills an empty tiebreaker with the Vegas total.
 */
export function AutopilotPanel({ leagueId }: { leagueId: string }) {
  const { rule, setRule, loading } = useAutopilot(leagueId)
  return (
    <div className={clsx(
      'rounded-lg border px-3 py-2.5 space-y-2',
      rule ? 'border-gold/30 bg-gold/[0.04]' : 'border-field-700/50 bg-field-800/40',
    )}>
      <div className="flex items-start gap-2">
        <Bot className={clsx('w-4 h-4 shrink-0 mt-0.5', rule ? 'text-gold' : 'text-field-400')} />
        <p className="text-xs text-field-300 leading-snug">
          <span className="font-bold text-white">Autopilot</span>
          {rule
            ? <> · Any game you haven't picked when it locks gets {RULE_BLURB[rule]}, and an empty tiebreaker gets the Vegas total. It shows a robot on the Board.</>
            : <> · Never miss a game: pick a backup rule, and the app picks anything you forgot just before it locks.</>}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Autopilot rule">
        {OPTIONS.map(o => {
          const on = rule === o.rule
          return (
            <button
              key={o.label}
              role="radio"
              aria-checked={on}
              disabled={loading}
              onClick={() => { if (!on) void setRule(o.rule) }}
              className={clsx(
                'text-xs font-cond font-bold uppercase tracking-wider rounded-lg px-3 py-1.5 border transition-colors disabled:opacity-50',
                on
                  ? o.rule ? 'bg-gold text-field-950 border-gold' : 'bg-field-700 text-white border-field-600'
                  : 'text-field-300 bg-field-800 border-field-700 hover:border-gold/50 hover:text-gold',
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
