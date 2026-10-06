import { useMemo, type CSSProperties } from 'react'
import clsx from 'clsx'
import { useHolidayTheme, type HolidayTheme } from '@/lib/holiday'
import { usePickemCalendar } from '@/hooks/usePickemCalendar'

const themeVars = (t: HolidayTheme) => ({ '--h1': t.colors[0], '--h2': t.colors[1] }) as CSSProperties

/** The app's holiday banner (Home, Pick'Em) while a theme is on. */
export function HolidayRibbon({ className }: { className?: string }) {
  const calendar = usePickemCalendar()
  const theme = useHolidayTheme(calendar?.currentWeek ?? null)
  if (!theme) return null
  return (
    <div className={clsx('holiday-ribbon rise-in', className)} style={themeVars(theme)}>
      <span className="text-2xl leading-none shrink-0" aria-hidden>{theme.emoji}</span>
      <div className="min-w-0">
        <p className="font-cond font-black uppercase tracking-wider text-sm leading-tight">{theme.label}</p>
        <p className="text-xs opacity-80 leading-snug">{theme.tagline}</p>
      </div>
      <span className="ml-auto text-lg tracking-[0.25em] opacity-70 shrink-0" aria-hidden>{theme.particles.slice(0, 3).join('')}</span>
    </div>
  )
}

/** The Shop TV header's holiday badge. */
export function HolidayPill({ theme }: { theme: HolidayTheme }) {
  return (
    <span className="holiday-pill" style={themeVars(theme)}>
      <span aria-hidden>{theme.emoji}</span> {theme.label}
    </span>
  )
}

/** Leaves, snow or confetti drifting down the Shop TV (none with reduced motion). */
export function HolidayParticles({ theme, count = 14 }: { theme: HolidayTheme; count?: number }) {
  // Fixed per theme, so they don't jump around on every refresh of the board
  const items = useMemo(() => {
    let seed = theme.key.length * 7919
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    return Array.from({ length: count }, (_, i) => ({
      left: ((i + rand()) / count) * 100,
      size: 24 + rand() * 20,
      duration: 16 + rand() * 14,
      delay: -rand() * 30,
      drift: rand() * 180 - 90,
      spin: rand() * 540 - 270,
      char: theme.particles[i % theme.particles.length],
    }))
  }, [theme.key, theme.particles, count])
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-[5]" aria-hidden>
      {items.map((p, i) => (
        <span
          key={i}
          className="holiday-particle"
          style={{
            left: `${p.left}%`,
            fontSize: p.size,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            '--drift': `${p.drift}px`,
            '--spin': `${p.spin}deg`,
          } as CSSProperties}
        >
          {p.char}
        </span>
      ))}
    </div>
  )
}
