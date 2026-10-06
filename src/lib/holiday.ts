// ══════════════════════════════════════════════════════════════
// Holiday themes: the Shop TV and the app dress up for the season
// kickoff, Halloween, Salute to Service, the Thanksgiving games,
// Christmas, New Year's, the playoffs, Super Bowl week and the Fourth
// of July. Most come from the date; the kickoff, the playoffs and the
// Super Bowl from the Pick'Em week.
//
// A commissioner can also pick one for their league (leagues.tv_theme,
// Commish panel → Shop TV): keep a theme on, or turn them off. Preview
// one with ?theme=<key> on any page (the keys below; ?theme=off hides
// it); the preview sticks for that browser tab until changed.
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
  /** The Shop TV's accent color while the theme is on. */
  accent: string
  /** The Shop TV ticker's first item ({league}: the league's name). */
  greeting: string
  /** The Shop TV's dressing (components/tv/HolidayScene.tsx). */
  scene: HolidaySceneSpec
}

/** How a theme dresses the Shop TV. */
export interface HolidaySceneSpec {
  /** Along the bottom of the TV's header. */
  edge: 'webs' | 'lights' | 'garland' | 'bunting' | 'shimmer'
  /** For a garland: what it's strung with. */
  garland?: string[]
  /** Sitting on the ticker in the bottom corners. */
  footer: string[]
  /** What crosses the screen now and then, in turn. */
  moments: ('bats' | 'ghost' | 'sleigh' | 'turkey' | 'fireworks' | 'flyover' | 'football' | 'spotlight')[]
  /** A low fog drifting along the bottom. */
  fog?: boolean
}

const KEYS: HolidayKey[] = ['kickoff', 'halloween', 'veterans', 'thanksgiving', 'christmas', 'newyear', 'playoffs', 'superbowl', 'july4']
const PREVIEW_KEY = 'gu_holiday_preview'

const PLAYOFF_ROUND: Record<number, string> = { 19: 'Wild Card weekend', 20: 'The Divisional round', 21: 'The Conference Championships' }

export function themeOf(key: HolidayKey, week: number | null): HolidayTheme {
  switch (key) {
    case 'kickoff':
      return { key, accent: '#16A34A', greeting: "🏈 Kickoff week at {league}: everybody's 0–0", scene: { edge: 'garland', garland: ['🏈'], footer: ['🏈', '🏟️'], moments: ['football', 'spotlight'] }, label: 'Season Kickoff', tagline: "Week 1: everybody's undefeated", emoji: '🏈', particles: ['🏈', '✨'], colors: ['#16a34a', '#d4a017'] }
    case 'halloween':
      return { key, accent: '#F97316', greeting: '🎃 Happy Halloween from {league}. Pick carefully… if you dare 👻', scene: { edge: 'webs', footer: ['🎃', '🕯️', '🎃'], moments: ['bats', 'ghost'], fog: true }, label: 'Halloween Football', tagline: "Spooky season: nothing's scarier than your pick sheet", emoji: '🎃', particles: ['🎃', '🦇', '👻'], colors: ['#f97316', '#7c3aed'] }
    case 'veterans':
      return { key, accent: '#2563EB', greeting: '🎖️ Salute to Service: {league} thanks everyone who served', scene: { edge: 'bunting', footer: ['🎖️', '⭐'], moments: ['flyover'] }, label: 'Salute to Service', tagline: 'Thank you to everyone who served', emoji: '🎖️', particles: ['⭐', '✨'], colors: ['#1d4ed8', '#b91c1c'] }
    case 'newyear':
      return { key, accent: '#D4A017', greeting: '🎆 Happy New Year from {league}! Same picks, new year', scene: { edge: 'shimmer', footer: ['🥂', '🎉'], moments: ['fireworks'] }, label: "New Year's Football", tagline: 'New year, same old picks', emoji: '🎆', particles: ['🎆', '✨', '🥂'], colors: ['#d4a017', '#7c3aed'] }
    case 'july4':
      return { key, accent: '#DC2626', greeting: "🎆 Happy Fourth of July from {league}. Football's almost back", scene: { edge: 'bunting', footer: ['🎆', '⭐'], moments: ['fireworks'] }, label: 'Fourth of July', tagline: 'Fireworks now, football soon', emoji: '🎆', particles: ['🎆', '⭐', '✨'], colors: ['#b91c1c', '#1d4ed8'] }
    case 'thanksgiving':
      return { key, accent: '#EA580C', greeting: '🦃 Happy Thanksgiving from {league}: thankful for every right pick', scene: { edge: 'garland', garland: ['🍂', '🍁'], footer: ['🥧', '🌽', '🦃'], moments: ['turkey'] }, label: 'Thanksgiving Football', tagline: 'Turkey Day slate: get your Thursday picks in before the food coma', emoji: '🦃', particles: ['🍂', '🍁', '🍂'], colors: ['#ea580c', '#a16207'] }
    case 'christmas':
      return { key, accent: '#DC2626', greeting: '🎄 Merry Christmas from {league}! Hope Santa brings you a winning week', scene: { edge: 'lights', footer: ['🎁', '🎄', '🎁'], moments: ['sleigh'] }, label: 'Christmas Football', tagline: 'Picks before presents', emoji: '🎄', particles: ['❄️', '❄️', '✨'], colors: ['#dc2626', '#16a34a'] }
    case 'playoffs':
      return { key, accent: '#D4A017', greeting: '🏆 Playoff football at {league}: win or go home', scene: { edge: 'shimmer', footer: ['🏆'], moments: ['spotlight', 'football'] }, label: 'The Playoffs', tagline: `${PLAYOFF_ROUND[week ?? 0] ?? 'Win or go home'}: every pick counts`, emoji: '🏆', particles: ['✨', '⭐'], colors: ['#d4a017', '#94a3b8'] }
    case 'superbowl':
      return { key, accent: '#D4A017', greeting: '🏈 Super Bowl week at {league}: one game, everything on the line', scene: { edge: 'shimmer', footer: ['🏆', '🎉'], moments: ['fireworks', 'spotlight'] }, label: 'Super Bowl Week', tagline: 'One game, one tiebreaker, everything on the line', emoji: '🏈', particles: ['🎉', '🎊', '✨'], colors: ['#d4a017', '#2563eb'] }
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

/** Every theme, for the commissioner's picker. */
export const HOLIDAY_CHOICES: { key: HolidayKey; label: string; emoji: string }[] =
  KEYS.map(key => { const t = themeOf(key, null); return { key, label: t.label, emoji: t.emoji } })

const isChoice = (v: unknown): v is HolidayKey | 'off' => v === 'off' || KEYS.includes(v as HolidayKey)

/**
 * The holiday theme in effect, rechecked every half hour (the TV stays
 * up for days): a ?theme= preview, else the league's setting (`chosen`,
 * leagues.tv_theme), else the calendar.
 */
export function useHolidayTheme(week: number | null | undefined, chosen?: string | null): HolidayTheme | null {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30 * 60_000)
    return () => clearInterval(t)
  }, [])
  return useMemo(() => {
    const pick = previewChoice() ?? (isChoice(chosen) ? chosen : null)
    if (pick === 'off') return null
    const key = pick ?? holidayFor(now, week ?? null)
    return key ? themeOf(key, week ?? null) : null
  }, [now, week, chosen])
}
