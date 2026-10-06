// Shop hours for the Shop TV (leagues.tv_hours): when the shop's open, by
// the TV's own clock. Outside them the TV sleeps (a dim clock) until the
// shop opens again. A close at or before the open runs past midnight
// (open 6 PM to 2 AM).

export interface ShopHours {
  /** 'HH:MM', 24-hour */
  open: string
  close: string
  /** The days the shop opens, Sunday = 0 */
  days: number[]
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

/** The hours as saved, or null for "always on" (missing, malformed, no days, or open = close). */
export function parseShopHours(x: unknown): ShopHours | null {
  const h = x as Partial<ShopHours> | null
  if (!h || typeof h.open !== 'string' || typeof h.close !== 'string' || !Array.isArray(h.days)) return null
  if (!HHMM.test(h.open) || !HHMM.test(h.close) || h.open === h.close) return null
  const days = [...new Set(h.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))]
  return days.length ? { open: h.open, close: h.close, days } : null
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** Whether the shop is open at `at`. */
export function isShopOpen(h: ShopHours, at: Date): boolean {
  const open = minutes(h.open), close = minutes(h.close)
  const t = at.getHours() * 60 + at.getMinutes()
  const today = at.getDay(), yesterday = (today + 6) % 7
  if (close > open) return h.days.includes(today) && t >= open && t < close
  // Past midnight: open from `open` on an open day until `close` the next morning
  return (h.days.includes(today) && t >= open) || (h.days.includes(yesterday) && t < close)
}

/** When the shop next opens after `at` (null if it never does). */
export function nextShopOpen(h: ShopHours, at: Date): Date | null {
  const m = minutes(h.open)
  for (let i = 0; i < 8; i++) {
    const d = new Date(at)
    d.setDate(d.getDate() + i)
    d.setHours(Math.floor(m / 60), m % 60, 0, 0)
    if (h.days.includes(d.getDay()) && d > at) return d
  }
  return null
}

/** "at 7:00 AM", "tomorrow at 7:00 AM", "Monday at 7:00 AM" */
export function backLabel(when: Date, now: Date): string {
  const time = when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(when) - day(now)) / 86_400_000)
  if (days <= 0) return `at ${time}`
  if (days === 1) return `tomorrow at ${time}`
  return `${when.toLocaleDateString('en-US', { weekday: 'long' })} at ${time}`
}

/** "7:00 AM" from "07:00" */
export function hhmmLabel(hhmm: string): string {
  const m = minutes(hhmm)
  return new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
