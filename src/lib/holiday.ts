// ══════════════════════════════════════════════════════════════
// Holiday themes: the Shop TV and the app dress up for the
// Thanksgiving games, Christmas, the playoffs and Super Bowl week.
// Thanksgiving and Christmas come from the date; the playoffs and the
// Super Bowl from the Pick'Em week.
//
// Preview one with ?theme=thanksgiving|christmas|playoffs|superbowl on
// any page (?theme=off hides it). The choice sticks for that browser
// tab until changed.
// ══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'

export type HolidayKey = 'thanksgiving' | 'christmas' | 'playoffs' | 'superbowl'

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

const KEYS: HolidayKey[] = ['thanksgiving', 'christmas', 'playoffs', 'superbowl']
const PREVIEW_KEY = 'gu_holiday_preview'

const PLAYOFF_ROUND: Record<number, string> = { 19: 'Wild Card weekend', 20: 'The Divisional round', 21: 'The Conference Championships' }

export function themeOf(key: HolidayKey, week: number | null): HolidayTheme {
  switch (key) {
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
  if (now.getMonth() === 11 && now.getDate() >= 20 && now.getDate() <= 26) return 'christmas'
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
