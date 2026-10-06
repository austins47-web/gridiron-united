// Stadium weather at kickoff (nfl_games.weather, written by sync-odds from
// _shared/weather.ts), as short labels for the pick cards and the Shop TV.

export interface GameWeather {
  indoor: boolean
  roof?: 'dome' | 'retractable'
  temp_f?: number
  wind_mph?: number
  gust_mph?: number
  precip_pct?: number
  snow_in?: number
  /** WMO weather code at kickoff. */
  code?: number
  updated_at?: string
}

/** Wind, gusts and rain chance that start to matter to a game. */
const WINDY = 15
const GUSTY = 25
const WET = 40

function icon(w: GameWeather): string {
  if (w.indoor) return '🏟️'
  const c = w.code ?? 0
  if ((w.snow_in ?? 0) > 0 || (c >= 71 && c <= 77) || c === 85 || c === 86) return '🌨️'
  if (c >= 95) return '⛈️'
  if ((w.precip_pct ?? 0) >= WET || (c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return '🌧️'
  if (c >= 51 && c <= 57) return '🌦️'
  if (c === 45 || c === 48) return '🌫️'
  if (c === 0) return '☀️'
  return c <= 2 ? '🌤️' : '☁️'
}

/** The sky now, from a WMO weather code: an icon and a word or two (the Shop TV's header). */
export function skyNow(code: number): { icon: string; label: string } {
  const label = code === 0 ? 'Clear' : code <= 2 ? 'Partly cloudy' : code === 3 ? 'Cloudy'
    : code === 45 || code === 48 ? 'Fog'
    : code >= 51 && code <= 57 ? 'Drizzle'
    : (code >= 61 && code <= 67) || (code >= 80 && code <= 82) ? 'Rain'
    : (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'Snow'
    : code >= 95 ? 'Storms' : 'Cloudy'
  return { icon: icon({ indoor: false, code }), label }
}

/**
 * The weather as an icon, a base label ("62°", "Dome") and the things
 * worth knowing when picking (wind, gusts, rain, snow, cold, heat).
 */
export function weatherLabel(w: GameWeather | null | undefined): { icon: string; base: string; alerts: string[] } | null {
  if (!w) return null
  if (w.indoor) return { icon: icon(w), base: w.roof === 'retractable' ? 'Retractable roof' : 'Dome', alerts: [] }
  if (w.temp_f == null) return null
  const alerts: string[] = []
  const wind = w.wind_mph ?? 0, gust = w.gust_mph ?? 0
  if (wind >= WINDY || gust >= GUSTY) alerts.push(`💨 ${Math.max(wind, 1)} mph${gust >= GUSTY ? ` (gusts ${gust})` : ''}`)
  if ((w.snow_in ?? 0) > 0) alerts.push(`${w.snow_in}" snow`)
  else if ((w.precip_pct ?? 0) >= WET) alerts.push(`${w.precip_pct}% rain`)
  if (w.temp_f <= 32) alerts.push('Freezing')
  else if (w.temp_f >= 90) alerts.push('Hot')
  return { icon: icon(w), base: `${w.temp_f}°`, alerts }
}
