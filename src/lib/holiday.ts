// ══════════════════════════════════════════════════════════════
// Holiday themes: the Shop TV and the app dress up for the season
// kickoff, Halloween, Salute to Service, the Thanksgiving games,
// Christmas, New Year's, the playoffs, Super Bowl week and the Fourth
// of July. Most come from the date; the kickoff, the playoffs and the
// Super Bowl from the Pick'Em week.
//
// Preview one with ?theme=<key> on any page (the keys below;
// ?theme=off hides it). The choice sticks for that browser tab until
// changed.
// ══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'

export type HolidayKey =
  | 'kickoff' | 'halloween' | 'veterans' | 'thanksgiving' | 'christmas' | 'newyear'
  | 'playoffs' | 'superbowl' | 'july4'

export interface HolidayTheme {
  key: HolidayKey
  label: string
  tagline: string
  emoji: string
  /** What drifts down the Shop TV. */
  particles: string[]
  /** Two colors for the gradient. */
  colors: [string, string]
}

const KEYS: HolidayKey[] = ['kickoff', 'halloween', 'veterans', 'thanksgiving', 'christmas', 'newyear', 'playoffs', 'superbowl', 'july4']
const PREVIEW_KEY = 'gu_holiday_preview'

const PLAYOFF_ROUND: Record<number, string> = { 19: 'Wild Card weekend', 20: 'The Divisional round', 21: 'The Conference Championships' }

export function themeOf(key: HolidayKey, week: number | null): HolidayTheme {
  switch (key) {
    case 'kickoff':
      return { key, label: 'Season Kickoff', tagline: "Week 1: everybody's undefeated", emoji: '🏈', particles: ['🏈', '✨'], colors: ['#16a34a', '#d4a017'] }
    case 'halloween':
      return { key, label: 'Halloween Football', tagline: "Spooky season: nothing's scarier than your pick sheet", emoji: '🎃', particles: ['🎃', '🦇', '👻'], colors: ['#f97316', '#7c3aed'] }
    case 'veterans':
      return { key, label: 'Salute to Service', tagline: 'Thank you to everyone who served', emoji: '🎖️', particles: ['⭐', '✨'], colors: ['#1d4ed8', '#b91c1c'] }
    case 'newyear':
      return { key, label: "New Year's Football", tagline: 'New year, same old picks', emoji: '🎆', particles: ['🎆', '✨', '🥂'], colors: ['#d4a017', '#7c3aed'] }
    case 'july4':
      return { key, label: 'Fourth of July', tagline: 'Fireworks now, football soon', emoji: '🎆', particles: ['🎆', '⭐', '✨'], colors: ['#b91c1c', '#1d4ed8'] }
    case 'thanksgiving':
      return { key, label: 'Thanksgiving Football', tagline: 'Turkey Day slate: get your Thursday picks in before the food coma', emoji: '🦃', particles: ['🍂', '🍁', '🍂'], colors: ['#ea580c', '#a16207'] }
    case 'christmas':
      return { key, label: 'Christmas Football', tagline: 'Picks before presents', emoji: '🎄', particles: ['❄️', '❄️', '✨'], colors: ['#dc2626', '#16a34a'] }
    case 'playoffs':
      return { key, label: 'The Playoffs', tagline: `${PLAYOFF_ROUND[week ?? 0] ?? 'Win or go home'}: every pick counts`, emoji: '🏆', particles: ['✨', '⭐'], colors: ['#d4a017', '#94a3b8'] }
    case 'superbowl':
      return { key, label: 'Super Bowl Week', tagline: 'One game, one tiebreaker, everything on the line', emoji: '🏈', particles: ['🎉', '🎊', '✨'], colors: ['#d4a017', '#2563eb'] }
  }
}

/** Thanksgiving: the fourth Thursday of November. */
function thanksgivingDay(year: number): Date {
  const first = new Date(year, 10, 1).getDay()
  return new Date(year, 10, 1 + ((4 - first + 7) % 7) + 21)
}

/** The theme for a moment, if any (week: the current Pick'Em week). */
export function holidayFor(now: Date, week: number | null): HolidayKey | null {
  if (week === 22) return 'superbowl'
  if (week != null && week >= 19 && week <= 21) return 'playoffs'
  const tg = thanksgivingDay(now.getFullYear())
  // From the day before (Thanksgiving week's picks are open) through the night of
  const from = new Date(tg.getFullYear(), tg.getMonth(), tg.getDate() - 1)
  const to = new Date(tg.getFullYear(), tg.getMonth(), tg.getDate() + 1, 4)
  if (now >= from && now < to) return 'thanksgiving'
  const m = now.getMonth(), d = now.getDate()
  // Each runs through 4 AM the morning after
  const between = (fromMonth: number, fromDay: number, toMonth: number, toDay: number) => {
    const y = now.getFullYear()
    const start = new Date(y, fromMonth, fromDay)
    const end = new Date(y, toMonth, toDay + 1, 4)
    return now >= start && now < end
  }
  // Week 1, once the season's started (the week clock reads 1 all summer too)
  if (week === 1 && m === 8) return 'kickoff'
  if (between(9, 27, 9, 31)) return 'halloween'
  if (between(10, 9, 10, 11)) return 'veterans'
  if (m === 11 && d >= 20 && d <= 26) return 'christmas'
  if (between(11, 31, 11, 31) || (m === 0 && d === 1) || (m === 0 && d === 2 && now.getHours() < 4)) return 'newyear'
  if (between(6, 1, 6, 4)) return 'july4'
  return null
}

/** A preview from ?theme=, remembered for the tab: a theme, 'off', or null for none. */
function previewChoice(): HolidayKey | 'off' | null {
  try {
    const asked = new URLSearchParams(window.location.search).get('theme')
    if (asked && (asked === 'off' || KEYS.includes(asked as HolidayKey))) {
      sessionStorage.setItem(PREVIEW_KEY, asked)
      return asked as HolidayKey | 'off'
    }
    const kept = sessionStorage.getItem(PREVIEW_KEY)
    return kept && (kept === 'off' || KEYS.includes(kept as HolidayKey)) ? kept as HolidayKey | 'off' : null
  } catch {
    return null
  }
}

/** The holiday theme in effect, rechecked every half hour (the TV stays up for days). */
export function useHolidayTheme(week: number | null | undefined): HolidayTheme | null {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30 * 60_000)
    return () => clearInterval(t)
  }, [])
  return useMemo(() => {
    const preview = previewChoice()
    if (preview === 'off') return null
    const key = preview ?? holidayFor(now, week ?? null)
    return key ? themeOf(key, week ?? null) : null
  }, [now, week])
}
