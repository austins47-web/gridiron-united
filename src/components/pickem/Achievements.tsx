import { useState } from 'react'
import { Lock, BadgeCheck } from 'lucide-react'
import clsx from 'clsx'
import { ACHIEVEMENTS, type AchievementKey, type EarnedAchievement } from './standings'
import { ACHIEVEMENT_ICONS } from './achievementIcons'

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

/**
 * Every badge, earned ones lit up with how many times, the rest dim —
 * the collection is half the fun. Tap one for what it takes, and, once
 * earned, each time it was: the date and what happened. On your own
 * card, an earned badge can be shown next to your name (badge flair).
 */
export function AchievementGrid({ earned, flair, onSetFlair }: {
  earned: EarnedAchievement[]
  flair?: string | null
  onSetFlair?: (badge: AchievementKey | null) => void
}) {
  const [open, setOpen] = useState<AchievementKey | null>(null)
  const byKey = new Map(earned.map(e => [e.key, e]))
  const openDef = open ? ACHIEVEMENTS.find(a => a.key === open) : null
  const openGot = open ? byKey.get(open) : undefined

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
        {ACHIEVEMENTS.map(a => {
          const got = byKey.get(a.key)
          const Icon = ACHIEVEMENT_ICONS[a.key]
          const selected = open === a.key
          return (
            <button
              key={a.key}
              onClick={() => setOpen(selected ? null : a.key)}
              aria-expanded={selected}
              aria-label={`${a.label}${got ? `, earned ${got.events.length} time${got.events.length === 1 ? '' : 's'}` : ', not earned yet'}`}
              className={clsx(
                'relative flex flex-col items-center text-center gap-1 rounded-lg border px-1.5 py-2 transition-colors',
                got ? 'border-gold/40 bg-gold/[0.08] hover:bg-gold/15' : 'border-field-700 bg-field-900/40 hover:border-field-500',
                !got && !selected && 'opacity-45',
                selected && 'ring-2 ring-gold/60',
              )}
            >
              <Icon className={clsx('w-4 h-4', got ? 'text-gold' : 'text-field-500')} />
              <span className={clsx('text-[10px] font-bold leading-tight', got ? 'text-white' : 'text-field-400')}>{a.label}</span>
              {got && got.events.length > 1 && (
                <span className="absolute top-1 right-1 text-[9px] font-black text-gold tabular-nums">×{got.events.length}</span>
              )}
              {flair === a.key && (
                <BadgeCheck className="absolute top-1 left-1 w-3 h-3 text-gold" aria-label="Shown next to your name" />
              )}
            </button>
          )
        })}
      </div>

      {openDef && (
        <div className="mt-2 rounded-xl border border-field-700 bg-field-900/60 p-3 rise-in">
          <div className="flex items-center gap-2">
            {(() => { const Icon = ACHIEVEMENT_ICONS[openDef.key]; return <Icon className={clsx('w-4 h-4', openGot ? 'text-gold' : 'text-field-500')} /> })()}
            <p className="font-bold text-white text-sm">{openDef.label}</p>
            <span className={clsx(
              'ml-auto text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5',
              openGot ? 'bg-gold text-field-950' : 'bg-field-800 text-field-400 border border-field-700',
            )}>
              {openGot ? `Earned${openGot.events.length > 1 ? ` ×${openGot.events.length}` : ''}` : 'Not yet'}
            </span>
          </div>
          <p className="text-xs text-field-400 mt-1">
            <span className="font-bold text-field-300">How to earn it:</span> {openDef.blurb}.
          </p>
          {openGot ? (
            <ul className="mt-2 space-y-1.5">
              {openGot.events.map((e, i) => (
                <li key={i} className="text-xs leading-snug">
                  <span className="font-bold text-gold">{when(e.date)}</span>
                  <span className="text-field-500"> · Week {e.week}</span>
                  <p className="text-field-200">{e.detail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-field-500">
              <Lock className="w-3 h-3" /> Still locked. It unlocks when a finished week qualifies.
            </p>
          )}
          {openGot && onSetFlair && (
            flair === openDef.key ? (
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-gold"><BadgeCheck className="w-3.5 h-3.5" /> Showing next to your name</span>
                <button onClick={() => onSetFlair(null)} className="text-xs font-bold text-field-400 hover:text-white">Remove</button>
              </div>
            ) : (
              <button
                onClick={() => onSetFlair(openDef.key)}
                className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-bold text-gold hover:bg-gold/20"
              >
                <BadgeCheck className="w-3.5 h-3.5" /> Show next to my name
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
