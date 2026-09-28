import clsx from 'clsx'
import { ACHIEVEMENTS, type EarnedAchievement } from './standings'
import { ACHIEVEMENT_ICONS } from './achievementIcons'

/**
 * Every badge, earned ones lit up with how many times, the rest dim
 * with what it takes — the collection is half the fun.
 */
export function AchievementGrid({ earned }: { earned: EarnedAchievement[] }) {
  const byKey = new Map(earned.map(e => [e.key, e]))
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
      {ACHIEVEMENTS.map(a => {
        const got = byKey.get(a.key)
        const Icon = ACHIEVEMENT_ICONS[a.key]
        return (
          <div
            key={a.key}
            title={`${a.label}: ${a.blurb}${got ? ` · Week${got.weeks.length > 1 ? 's' : ''} ${got.weeks.join(', ')}` : ''}`}
            className={clsx(
              'relative flex flex-col items-center text-center gap-1 rounded-lg border px-1.5 py-2',
              got ? 'border-gold/40 bg-gold/[0.08]' : 'border-field-700 bg-field-900/40 opacity-45',
            )}
          >
            <Icon className={clsx('w-4 h-4', got ? 'text-gold' : 'text-field-500')} />
            <span className={clsx('text-[10px] font-bold leading-tight', got ? 'text-white' : 'text-field-400')}>{a.label}</span>
            {got && got.weeks.length > 1 && (
              <span className="absolute top-1 right-1 text-[9px] font-black text-gold tabular-nums">×{got.weeks.length}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
