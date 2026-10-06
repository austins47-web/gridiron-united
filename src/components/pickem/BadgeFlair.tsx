import clsx from 'clsx'
import { ACHIEVEMENTS } from './standings'
import { ACHIEVEMENT_ICONS } from './achievementIcons'

/** The badge someone chose to show next to their name (league_members.badge_flair). */
export function BadgeFlair({ badge, className }: { badge?: string | null; className?: string }) {
  const a = ACHIEVEMENTS.find(x => x.key === badge)
  if (!a) return null
  const Icon = ACHIEVEMENT_ICONS[a.key]
  return (
    <span
      title={`${a.label}: ${a.blurb}`}
      className={clsx('inline-flex w-4 h-4 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold', className)}
    >
      <Icon className="w-2.5 h-2.5" aria-label={a.label} />
    </span>
  )
}
