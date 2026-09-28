// ══════════════════════════════════════════════════════════════
// Stadium weather at kickoff, for the pick cards and the Shop TV.
//
// Where a game is played comes from ESPN's scoreboard (the venue, and
// whether it's indoors); the home team's stadium otherwise. Domes and
// retractable roofs get no forecast. Outdoor games get Open-Meteo's
// hourly forecast (free, no key) over the first three hours from
// kickoff: temperature, the strongest wind and gusts, the highest
// chance of rain, and any snow.
// ══════════════════════════════════════════════════════════════

export interface GameWeather {
  /** Played under a roof: no forecast. */
  indoor: boolean
  roof?: 'dome' | 'retractable'
  temp_f?: number
  wind_mph?: number
  gust_mph?: number
  /** Highest chance of rain or snow in the game's first three hours, 0–100. */
  precip_pct?: number
  snow_in?: number
  /** WMO weather code at kickoff. */
  code?: number
  updated_at: string
}

type Stadium = { lat: number; lon: number; roof: 'open' | 'dome' | 'retractable' }

/** Home stadiums (2026), by the team abbreviation ESPN uses. */
const STADIUMS: Record<string, Stadium> = {
  ARI: { lat: 33.5276, lon: -112.2626, roof: 'retractable' },
  ATL: { lat: 33.7554, lon: -84.4008, roof: 'retractable' },
  BAL: { lat: 39.2780, lon: -76.6227, roof: 'open' },
  BUF: { lat: 42.7738, lon: -78.7870, roof: 'open' },
  CAR: { lat: 35.2258, lon: -80.8528, roof: 'open' },
  CHI: { lat: 41.8623, lon: -87.6167, roof: 'open' },
  CIN: { lat: 39.0955, lon: -84.5161, roof: 'open' },
  CLE: { lat: 41.5061, lon: -81.6995, roof: 'open' },
  DAL: { lat: 32.7473, lon: -97.0945, roof: 'retractable' },
  DEN: { lat: 39.7439, lon: -105.0201, roof: 'open' },
  DET: { lat: 42.3400, lon: -83.0456, roof: 'dome' },
  GB: { lat: 44.5013, lon: -88.0622, roof: 'open' },
  HOU: { lat: 29.6847, lon: -95.4107, roof: 'retractable' },
  IND: { lat: 39.7601, lon: -86.1639, roof: 'retractable' },
  JAX: { lat: 30.3239, lon: -81.6373, roof: 'open' },
  KC: { lat: 39.0489, lon: -94.4839, roof: 'open' },
  LV: { lat: 36.0909, lon: -115.1833, roof: 'dome' },
  LAC: { lat: 33.9535, lon: -118.3392, roof: 'dome' },
  LAR: { lat: 33.9535, lon: -118.3392, roof: 'dome' },
  MIA: { lat: 25.9580, lon: -80.2389, roof: 'open' },
  MIN: { lat: 44.9740, lon: -93.2581, roof: 'dome' },
  NE: { lat: 42.0909, lon: -71.2643, roof: 'open' },
  NO: { lat: 29.9511, lon: -90.0812, roof: 'dome' },
  NYG: { lat: 40.8135, lon: -74.0745, roof: 'open' },
  NYJ: { lat: 40.8135, lon: -74.0745, roof: 'open' },
  PHI: { lat: 39.9008, lon: -75.1675, roof: 'open' },
  PIT: { lat: 40.4468, lon: -80.0158, roof: 'open' },
  SF: { lat: 37.4030, lon: -121.9700, roof: 'open' },
  SEA: { lat: 47.5952, lon: -122.3316, roof: 'open' },
  TB: { lat: 27.9759, lon: -82.5033, roof: 'open' },
  TEN: { lat: 36.1665, lon: -86.7713, roof: 'open' },
  WSH: { lat: 38.9078, lon: -76.8645, roof: 'open' },
}

/** Neutral-site venues (international games), matched by name. */
const VENUES: { match: string; stadium: Stadium }[] = [
  { match: 'tottenham', stadium: { lat: 51.6043, lon: -0.0664, roof: 'open' } },
  { match: 'wembley', stadium: { lat: 51.5560, lon: -0.2796, roof: 'open' } },
  { match: 'allianz', stadium: { lat: 48.2188, lon: 11.6247, roof: 'open' } },
  { match: 'olympiastadion', stadium: { lat: 52.5147, lon: 13.2395, roof: 'open' } },
  { match: 'deutsche bank park', stadium: { lat: 50.0686, lon: 8.6455, roof: 'open' } },
  { match: 'bernab', stadium: { lat: 40.4531, lon: -3.6883, roof: 'retractable' } },
  { match: 'azteca', stadium: { lat: 19.3029, lon: -99.1505, roof: 'open' } },
  { match: 'banorte', stadium: { lat: 19.3029, lon: -99.1505, roof: 'open' } },
  { match: 'croke', stadium: { lat: 53.3607, lon: -6.2512, roof: 'open' } },
  { match: 'maracan', stadium: { lat: -22.9122, lon: -43.2302, roof: 'open' } },
  { match: 'corinthians', stadium: { lat: -23.5453, lon: -46.4742, roof: 'open' } },
  { match: 'melbourne cricket', stadium: { lat: -37.8200, lon: 144.9834, roof: 'open' } },
]

/** Where an ESPN scoreboard event is played, or null when we can't tell. */
function stadiumFor(ev: any): Stadium | null {
  const comp = ev?.competitions?.[0]
  const venue = comp?.venue
  const name = String(venue?.fullName ?? '').toLowerCase()
  const neutral = VENUES.find(v => name.includes(v.match))
  if (neutral) return neutral.stadium
  const country = String(venue?.address?.country ?? 'USA')
  // Somewhere abroad we don't have on file: better no forecast than the wrong city's
  if (country && !/^(usa|us|united states)$/i.test(country)) return null
  const home = comp?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.abbreviation
  return home ? STADIUMS[home] ?? null : null
}

interface Forecast {
  time: string[]
  temperature_2m: number[]
  precipitation_probability: (number | null)[]
  wind_speed_10m: number[]
  wind_gusts_10m: number[]
  snowfall: number[]
  weather_code: number[]
}

const forecasts = new Map<string, Promise<Forecast | null>>()

async function forecastAt(lat: number, lon: number): Promise<Forecast | null> {
  const key = `${lat},${lon}`
  if (!forecasts.has(key)) {
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${lat}&longitude=${lon}`
      + '&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m,snowfall,weather_code'
      + '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=UTC&forecast_days=16'
    forecasts.set(key, fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then(j => (j?.hourly as Forecast) ?? null)
      .catch(() => null))
  }
  return forecasts.get(key)!
}

/**
 * The weather for one ESPN scoreboard event, or null when there's
 * nothing to say (already started, too far out, unknown venue).
 */
export async function weatherFor(ev: any, now: Date): Promise<GameWeather | null> {
  const kickoff = new Date(ev?.date ?? '')
  if (Number.isNaN(kickoff.getTime())) return null
  const ahead = kickoff.getTime() - now.getTime()
  if (ahead < 0 || ahead > 15 * 24 * 3600_000) return null
  const stamp = now.toISOString()

  const comp = ev?.competitions?.[0]
  const stadium = stadiumFor(ev)
  if (comp?.venue?.indoor === true) return { indoor: true, roof: stadium?.roof === 'retractable' ? 'retractable' : 'dome', updated_at: stamp }
  if (!stadium) return null
  if (stadium.roof !== 'open') return { indoor: true, roof: stadium.roof, updated_at: stamp }

  const f = await forecastAt(stadium.lat, stadium.lon)
  if (!f?.time?.length) return null
  // Open-Meteo's hours are "YYYY-MM-DDTHH:00" in UTC
  const hourOf = (t: string) => new Date(`${t}:00Z`).getTime()
  const start = Math.floor(kickoff.getTime() / 3600_000) * 3600_000
  const idx: number[] = []
  f.time.forEach((t, i) => { const at = hourOf(t); if (at >= start && at < start + 3 * 3600_000) idx.push(i) })
  if (idx.length === 0) return null
  const max = (xs: (number | null)[]) => Math.max(...xs.map(x => x ?? 0))
  return {
    indoor: false,
    temp_f: Math.round(f.temperature_2m[idx[Math.min(1, idx.length - 1)]]),
    wind_mph: Math.round(max(idx.map(i => f.wind_speed_10m[i]))),
    gust_mph: Math.round(max(idx.map(i => f.wind_gusts_10m[i]))),
    precip_pct: Math.round(max(idx.map(i => f.precipitation_probability[i]))),
    snow_in: Math.round(idx.reduce((s, i) => s + (f.snowfall[i] ?? 0), 0) * 10) / 10,
    code: f.weather_code[idx[0]],
    updated_at: stamp,
  }
}
