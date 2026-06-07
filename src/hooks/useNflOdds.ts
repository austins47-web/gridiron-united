import { useQuery } from '@tanstack/react-query'

export interface GameOdds {
  homeTeam: string
  awayTeam: string
  spread: number | null        // from home team's perspective (negative = home favored)
  homeWinPct: number | null    // 0-100
  awayWinPct: number | null    // 0-100
  homeMoneyline: number | null // American odds
  awayMoneyline: number | null
}

// The Odds API uses full team names — map to our abbreviations
const TEAM_NAME_MAP: Record<string, string> = {
  'Arizona Cardinals': 'ARI',
  'Atlanta Falcons': 'ATL',
  'Baltimore Ravens': 'BAL',
  'Buffalo Bills': 'BUF',
  'Carolina Panthers': 'CAR',
  'Chicago Bears': 'CHI',
  'Cincinnati Bengals': 'CIN',
  'Cleveland Browns': 'CLE',
  'Dallas Cowboys': 'DAL',
  'Denver Broncos': 'DEN',
  'Detroit Lions': 'DET',
  'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU',
  'Indianapolis Colts': 'IND',
  'Jacksonville Jaguars': 'JAX',
  'Kansas City Chiefs': 'KC',
  'Los Angeles Chargers': 'LAC',
  'Los Angeles Rams': 'LAR',
  'Las Vegas Raiders': 'LV',
  'Miami Dolphins': 'MIA',
  'Minnesota Vikings': 'MIN',
  'New England Patriots': 'NE',
  'New Orleans Saints': 'NO',
  'New York Giants': 'NYG',
  'New York Jets': 'NYJ',
  'Philadelphia Eagles': 'PHI',
  'Pittsburgh Steelers': 'PIT',
  'San Francisco 49ers': 'SF',
  'Seattle Seahawks': 'SEA',
  'Tampa Bay Buccaneers': 'TB',
  'Tennessee Titans': 'TEN',
  'Washington Commanders': 'WSH',
}

// Convert American moneyline odds to implied win probability (removes vig)
function moneylineToProb(odds: number): number {
  if (odds > 0) return 100 / (odds + 100)
  return Math.abs(odds) / (Math.abs(odds) + 100)
}

// Remove vig and return fair percentages [home, away]
function fairProbs(homeOdds: number, awayOdds: number): [number, number] {
  const homeRaw = moneylineToProb(homeOdds)
  const awayRaw = moneylineToProb(awayOdds)
  const total = homeRaw + awayRaw
  return [
    Math.round((homeRaw / total) * 100),
    Math.round((awayRaw / total) * 100),
  ]
}

async function fetchOdds(): Promise<Map<string, GameOdds>> {
  const apiKey = import.meta.env.VITE_ODDS_API_KEY
  if (!apiKey) return new Map()

  const url = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads&oddsFormat=american`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Odds API error: ${res.status}`)
  const games = await res.json()

  const map = new Map<string, GameOdds>()

  for (const game of games) {
    const homeAbbr = TEAM_NAME_MAP[game.home_team]
    const awayAbbr = TEAM_NAME_MAP[game.away_team]
    if (!homeAbbr || !awayAbbr) continue

    // Use first bookmaker that has both markets
    let spread: number | null = null
    let homeML: number | null = null
    let awayML: number | null = null

    for (const bm of game.bookmakers ?? []) {
      for (const market of bm.markets ?? []) {
        if (market.key === 'spreads' && spread === null) {
          const homeOutcome = market.outcomes?.find((o: any) => TEAM_NAME_MAP[o.name] === homeAbbr)
          if (homeOutcome) spread = homeOutcome.point
        }
        if (market.key === 'h2h' && homeML === null) {
          const homeOutcome = market.outcomes?.find((o: any) => TEAM_NAME_MAP[o.name] === homeAbbr)
          const awayOutcome = market.outcomes?.find((o: any) => TEAM_NAME_MAP[o.name] === awayAbbr)
          if (homeOutcome && awayOutcome) {
            homeML = homeOutcome.price
            awayML = awayOutcome.price
          }
        }
        if (spread !== null && homeML !== null) break
      }
      if (spread !== null && homeML !== null) break
    }

    let homeWinPct: number | null = null
    let awayWinPct: number | null = null
    if (homeML !== null && awayML !== null) {
      const [h, a] = fairProbs(homeML, awayML)
      homeWinPct = h
      awayWinPct = a
    }

    const key = `${awayAbbr}@${homeAbbr}`
    map.set(key, { homeTeam: homeAbbr, awayTeam: awayAbbr, spread, homeWinPct, awayWinPct, homeMoneyline: homeML, awayMoneyline: awayML })
  }

  return map
}

export function useNflOdds() {
  return useQuery({
    queryKey: ['nfl-odds'],
    queryFn: fetchOdds,
    staleTime: 5 * 60 * 1000,   // 5 min cache
    refetchInterval: 10 * 60 * 1000, // refresh every 10 min
    enabled: !!import.meta.env.VITE_ODDS_API_KEY,
  })
}
