import { Zap, Dog, Lock, Scale, Footprints, BarChart3, type LucideIcon } from 'lucide-react'
import { teamLogoUrl } from '@/components/teams/teamIds'
import { describeWeekStats, type WeekStats, type WeekStatLine } from './standings'

/**
 * The Week Stats tiles as data — the shared wording (describeWeekStats)
 * plus an icon and team logo for each fun fact the week produced. Shared by the winner card
 * (WeekRecap) and the week-final card posted to league chat, so both
 * say exactly the same thing. A stat the week didn't produce (nobody
 * missed, too few players …) is simply left out.
 */
export interface StatTileData {
  icon: LucideIcon
  label: string
  logo?: string | null
  headline: string
  detail: string
}

const ICONS: Record<WeekStatLine['key'], LucideIcon> = {
  upset: Zap, underdog: Dog, lock: Lock, split: Scale, loneWolf: Footprints, league: BarChart3,
}

export function buildStatTiles(stats: WeekStats): StatTileData[] {
  return describeWeekStats(stats).map(l => ({
    icon: ICONS[l.key],
    label: l.label,
    logo: l.team ? teamLogoUrl({ abbr: l.team }, 'NFL') : null,
    headline: l.headline,
    detail: l.detail,
  }))
}
