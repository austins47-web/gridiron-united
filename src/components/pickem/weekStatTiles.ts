import { Zap, Dog, Lock, Scale, Footprints, BarChart3, type LucideIcon } from 'lucide-react'
import { teamLogoUrl } from '@/components/teams/teamIds'
import type { WeekStats } from './standings'

/**
 * The Week Stats tiles as data — label, headline and one-line detail
 * for each fun fact the week produced. Shared by the winner card
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

export function buildStatTiles(stats: WeekStats): StatTileData[] {
  const { upset, underdog, lock, split, loneWolf, league } = stats
  const logo = (abbr: string) => teamLogoUrl({ abbr }, 'NFL')
  const tiles: StatTileData[] = []

  if (upset) {
    tiles.push({
      icon: Zap, label: 'Biggest Upset', logo: logo(upset.winner),
      headline: `${upset.winner} over ${upset.loser}`,
      detail: `${upset.wrong === upset.pickers && upset.pickers > 1 ? `All ${upset.pickers}` : `${upset.wrong} of ${upset.pickers}`} picked ${upset.loser} · ${upset.winnerScore}–${upset.loserScore}`,
    })
  }

  if (underdog) {
    const who = underdog.picks === 0 ? 'Nobody picked them'
      : underdog.picks <= 2 ? `Only ${underdog.backers.join(' & ')} picked them`
      : `Picked by ${underdog.picks} of ${underdog.pickers}`
    tiles.push({
      icon: Dog, label: 'Underdog', logo: logo(underdog.team),
      headline: underdog.team,
      detail: `${who} · won ${underdog.teamScore}–${underdog.oppScore}`,
    })
  }

  if (lock) {
    tiles.push({
      icon: Lock, label: 'Lock of the Week', logo: logo(lock.team),
      headline: lock.team,
      detail: lock.picks === lock.pickers && lock.pickers > 1
        ? `Unanimous — all ${lock.pickers} had them`
        : `${lock.picks} of ${lock.pickers} had them`,
    })
  }

  if (split) {
    tiles.push({
      icon: Scale, label: 'Split Decision',
      headline: `${split.away} vs ${split.home}`,
      detail: `League split ${split.awayPicks}–${split.homePicks} · ${split.winner ? `${split.winner} won` : 'ended in a tie'}`,
    })
  }

  if (loneWolf) {
    tiles.push({
      icon: Footprints, label: 'Lone Wolf',
      headline: loneWolf.name,
      detail: `${loneWolf.against} pick${loneWolf.against === 1 ? '' : 's'} against the crowd · ${loneWolf.hits === 0 ? 'none' : loneWolf.hits} hit`,
    })
  }

  if (league.played > 0) {
    tiles.push({
      icon: BarChart3, label: 'League Record',
      headline: `${league.correct}–${league.played - league.correct}`,
      detail: `${Math.round((league.correct / league.played) * 100)}% of the league's picks were right`,
    })
  }

  return tiles
}
