// ══════════════════════════════════════════════════════════════
// Timezone-aware weekly deadlines
//
// A weekly pick deadline is a WALL-CLOCK time in a specific zone
// ("Wednesdays at 5:00 PM Mountain"). That is not a fixed UTC
// offset — Mountain is UTC-6 in summer and UTC-7 in winter — so we
// resolve local -> UTC at read time using the actual offset in
// effect on that date.
// ══════════════════════════════════════════════════════════════

/** The offset (ms) of `tz` from UTC at a given instant. */
function offsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value
  const asUTC = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  )
  return asUTC - date.getTime()
}

/**
 * Convert a wall-clock time in `tz` to the correct UTC instant.
 *
 * Iterates because the offset depends on the instant we're solving
 * for — a chicken-and-egg the loop settles in one or two passes.
 */
export function zonedTimeToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number, tz: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0)
  let ts = naive
  for (let i = 0; i < 3; i++) {
    const next = naive - offsetMs(new Date(ts), tz)
    if (next === ts) break
    ts = next
  }
  return new Date(ts)
}

/** Calendar parts of `date` as seen in `tz`. */
export function partsInZone(date: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    weekday: DOW.indexOf(p.weekday),
  }
}

/**
 * Next occurrence of `dayOfWeek` at `time` in `tz`, as a UTC Date.
 *
 * @param dayOfWeek 0 = Sunday … 6 = Saturday, in `tz`
 * @param time      'HH:MM' wall-clock in `tz`
 */
export function nextWeeklyDeadline(
  dayOfWeek: number, time: string, tz: string, from: Date = new Date(),
): Date {
  const [h, m] = time.split(':').map(Number)
  const here = partsInZone(from, tz)

  // Walk forward up to 8 days and take the first candidate in the future.
  for (let add = 0; add <= 8; add++) {
    const probe = new Date(from.getTime() + add * 86400_000)
    const pp = partsInZone(probe, tz)
    if (pp.weekday !== dayOfWeek) continue
    const candidate = zonedTimeToUtc(pp.year, pp.month, pp.day, h, m, tz)
    if (candidate.getTime() > from.getTime()) return candidate
  }

  // Shouldn't happen, but never return null
  const fallback = zonedTimeToUtc(here.year, here.month, here.day + 7, h, m, tz)
  return fallback
}

/** The viewer's own IANA zone, e.g. 'America/Denver'. */
export function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Short zone label for an instant, e.g. 'MDT'. */
export function zoneAbbr(date: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, timeZoneName: 'short',
    }).formatToParts(date)
    return parts.find(p => p.type === 'timeZoneName')?.value ?? tz
  } catch {
    return tz
  }
}

/** "Wednesday at 5:00 PM MDT" — rendered in `tz`. */
export function describeDeadline(date: Date, tz: string): string {
  return clean(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'long',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(date))
}

/** Full date + time in `tz`, e.g. 'Wed, Aug 19, 5:00 PM MDT'. */
export function formatInZone(date: Date, tz: string): string {
  return clean(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(date))
}

/**
 * Intl separates the time from AM/PM with U+202F (narrow no-break
 * space), which renders as "?" in some clients. Normalise to a
 * plain space.
 */
function clean(s: string): string {
  return s.replace(/[\u202F\u00A0]/g, ' ')
}

export const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

/** '17:00' -> '5:00 PM' */
export function to12Hour(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}
