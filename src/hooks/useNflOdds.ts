import { useQuery } from '@tanstack/react-query'

export interface GameOdds {
  homeTeam: string
  awayTeam: string
  spread: number | null
  homeWinPct: number | null
  awayWinPct: number | null
  homeMoneyline: number | null
  awayMoneyline: number | null
}

// ── NFL: full name → ESPN abbreviation ───────────────────────
const NFL_NAME_TO_ABBR: Record<string, string> = {
  'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL', 'Baltimore Ravens': 'BAL',
  'Buffalo Bills': 'BUF', 'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI',
  'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE', 'Dallas Cowboys': 'DAL',
  'Denver Broncos': 'DEN', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX',
  'Kansas City Chiefs': 'KC', 'Los Angeles Chargers': 'LAC', 'Los Angeles Rams': 'LAR',
  'Las Vegas Raiders': 'LV', 'Miami Dolphins': 'MIA', 'Minnesota Vikings': 'MIN',
  'New England Patriots': 'NE', 'New Orleans Saints': 'NO', 'New York Giants': 'NYG',
  'New York Jets': 'NYJ', 'Philadelphia Eagles': 'PHI', 'Pittsburgh Steelers': 'PIT',
  'San Francisco 49ers': 'SF', 'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB',
  'Tennessee Titans': 'TEN', 'Washington Commanders': 'WSH',
}

// ── CFB: The Odds API full name → ESPN shortDisplayName ───────
// e.g. "Georgia Bulldogs" → "Georgia", "Ohio State Buckeyes" → "Ohio State"
// ESPN's shortDisplayName is always the school name without the mascot.
// We strip the last word(s) that are mascots to get the school name.
const CFB_FULL_TO_SHORT: Record<string, string> = {
  'Alabama Crimson Tide': 'Alabama',
  'Auburn Tigers': 'Auburn',
  'Georgia Bulldogs': 'Georgia',
  'LSU Tigers': 'LSU',
  'Tennessee Volunteers': 'Tennessee',
  'Texas A&M Aggies': 'Texas A&M',
  'Florida Gators': 'Florida',
  'South Carolina Gamecocks': 'South Carolina',
  'Ohio State Buckeyes': 'Ohio State',
  'Michigan Wolverines': 'Michigan',
  'Penn State Nittany Lions': 'Penn State',
  'Michigan State Spartans': 'Michigan State',
  'Iowa Hawkeyes': 'Iowa',
  'Wisconsin Badgers': 'Wisconsin',
  'Notre Dame Fighting Irish': 'Notre Dame',
  'Texas Longhorns': 'Texas',
  'Oklahoma Sooners': 'Oklahoma',
  'Kansas State Wildcats': 'Kansas State',
  'Baylor Bears': 'Baylor',
  'TCU Horned Frogs': 'TCU',
  'Oregon Ducks': 'Oregon',
  'Washington Huskies': 'Washington',
  'USC Trojans': 'USC',
  'Utah Utes': 'Utah',
  'Clemson Tigers': 'Clemson',
  'Florida State Seminoles': 'Florida State',
  'Miami Hurricanes': 'Miami',
  'NC State Wolfpack': 'NC State',
  'Colorado Buffaloes': 'Colorado',
  'Boise State Broncos': 'Boise State',
  'Ole Miss Rebels': 'Ole Miss',
  'Mississippi State Bulldogs': 'Mississippi State',
  'Arkansas Razorbacks': 'Arkansas',
  'Kentucky Wildcats': 'Kentucky',
  'Missouri Tigers': 'Missouri',
  'Vanderbilt Commodores': 'Vanderbilt',
  'Oklahoma State Cowboys': 'Oklahoma State',
  'West Virginia Mountaineers': 'West Virginia',
  'Iowa State Cyclones': 'Iowa State',
  'Cincinnati Bearcats': 'Cincinnati',
  'UCF Knights': 'UCF',
  'Houston Cougars': 'Houston',
  'BYU Cougars': 'BYU',
  'Stanford Cardinal': 'Stanford',
  'California Golden Bears': 'California',
  'Arizona Wildcats': 'Arizona',
  'Arizona State Sun Devils': 'Arizona State',
  'Washington State Cougars': 'Washington State',
  'Oregon State Beavers': 'Oregon State',
  'UCLA Bruins': 'UCLA',
  'Indiana Hoosiers': 'Indiana',
  'Northwestern Wildcats': 'Northwestern',
  'Minnesota Golden Gophers': 'Minnesota',
  'Nebraska Cornhuskers': 'Nebraska',
  'Purdue Boilermakers': 'Purdue',
  'Illinois Fighting Illini': 'Illinois',
  'Maryland Terrapins': 'Maryland',
  'Rutgers Scarlet Knights': 'Rutgers',
  'Duke Blue Devils': 'Duke',
  'North Carolina Tar Heels': 'North Carolina',
  'Virginia Cavaliers': 'Virginia',
  'Virginia Tech Hokies': 'Virginia Tech',
  'Pittsburgh Panthers': 'Pittsburgh',
  'Georgia Tech Yellow Jackets': 'Georgia Tech',
  'Wake Forest Demon Deacons': 'Wake Forest',
  'Syracuse Orange': 'Syracuse',
  'Boston College Eagles': 'Boston College',
  'Louisville Cardinals': 'Louisville',
  'Memphis Tigers': 'Memphis',
  'Tulane Green Wave': 'Tulane',
  'SMU Mustangs': 'SMU',
  'Air Force Falcons': 'Air Force',
  'Army Black Knights': 'Army',
  'Navy Midshipmen': 'Navy',
  'Liberty Flames': 'Liberty',
  'James Madison Dukes': 'James Madison',
  'Coastal Carolina Chanticleers': 'Coastal Carolina',
  'Appalachian State Mountaineers': 'Appalachian State',
  'Marshall Thundering Herd': 'Marshall',
  'Old Dominion Monarchs': 'Old Dominion',
  'Southern Miss Golden Eagles': 'Southern Miss',
  'UTSA Roadrunners': 'UTSA',
  'North Texas Mean Green': 'North Texas',
  'Florida Atlantic Owls': 'FAU',
  'Florida International Panthers': 'FIU',
  'Middle Tennessee Blue Raiders': 'Middle Tennessee',
  'Western Kentucky Hilltoppers': 'Western Kentucky',
  'UAB Blazers': 'UAB',
  'Georgia Southern Eagles': 'Georgia Southern',
  'Troy Trojans': 'Troy',
  'South Alabama Jaguars': 'South Alabama',
  'Louisiana Ragin Cajuns': 'Louisiana',
  'Texas State Bobcats': 'Texas State',
  'New Mexico State Aggies': 'New Mexico State',
  'Sam Houston Bearkats': 'Sam Houston',
  'Jacksonville State Gamecocks': 'Jacksonville State',
  'Kennesaw State Owls': 'Kennesaw State',
  'Utah State Aggies': 'Utah State',
  'Fresno State Bulldogs': 'Fresno State',
  'San Diego State Aztecs': 'San Diego State',
  'UNLV Rebels': 'UNLV',
  'Nevada Wolf Pack': 'Nevada',
  'Hawaii Rainbow Warriors': 'Hawaii',
  'San Jose State Spartans': 'San Jose State',
  'Wyoming Cowboys': 'Wyoming',
  'New Mexico Lobos': 'New Mexico',
  'Colorado State Rams': 'Colorado State',
  'Tulsa Golden Hurricane': 'Tulsa',
  'East Carolina Pirates': 'East Carolina',
  'South Florida Bulls': 'South Florida',
  'Temple Owls': 'Temple',
  'Charlotte 49ers': 'Charlotte',
  'Rice Owls': 'Rice',
  'Louisiana Tech Bulldogs': 'Louisiana Tech',
  'Western Michigan Broncos': 'Western Michigan',
  'Central Michigan Chippewas': 'Central Michigan',
  'Eastern Michigan Eagles': 'Eastern Michigan',
  'Northern Illinois Huskies': 'Northern Illinois',
  'Ball State Cardinals': 'Ball State',
  'Bowling Green Falcons': 'Bowling Green',
  'Buffalo Bulls': 'Buffalo',
  'Kent State Golden Flashes': 'Kent State',
  'Miami Ohio RedHawks': 'Miami (OH)',
  'Ohio Bobcats': 'Ohio',
  'Akron Zips': 'Akron',
  'Toledo Rockets': 'Toledo',
}

// ── Shared odds helpers ──────────────────────────────────────

function moneylineToProb(odds: number): number {
  if (odds > 0) return 100 / (odds + 100)
  return Math.abs(odds) / (Math.abs(odds) + 100)
}

function fairProbs(homeOdds: number, awayOdds: number): [number, number] {
  const homeRaw = moneylineToProb(homeOdds)
  const awayRaw = moneylineToProb(awayOdds)
  const total = homeRaw + awayRaw
  return [Math.round((homeRaw / total) * 100), Math.round((awayRaw / total) * 100)]
}

function parseOddsGames(
  games: any[],
  nameToKey: (name: string) => string | null
): Map<string, GameOdds> {
  const map = new Map<string, GameOdds>()

  for (const game of games) {
    const homeKey = nameToKey(game.home_team)
    const awayKey = nameToKey(game.away_team)
    if (!homeKey || !awayKey) continue

    let spread: number | null = null
    let homeML: number | null = null
    let awayML: number | null = null

    for (const bm of game.bookmakers ?? []) {
      for (const market of bm.markets ?? []) {
        if (market.key === 'spreads' && spread === null) {
          const o = market.outcomes?.find((o: any) => nameToKey(o.name) === homeKey)
          if (o) spread = o.point
        }
        if (market.key === 'h2h' && homeML === null) {
          const ho = market.outcomes?.find((o: any) => nameToKey(o.name) === homeKey)
          const ao = market.outcomes?.find((o: any) => nameToKey(o.name) === awayKey)
          if (ho && ao) { homeML = ho.price; awayML = ao.price }
        }
        if (spread !== null && homeML !== null) break
      }
      if (spread !== null && homeML !== null) break
    }

    let homeWinPct: number | null = null
    let awayWinPct: number | null = null
    if (homeML !== null && awayML !== null) {
      const [h, a] = fairProbs(homeML, awayML)
      homeWinPct = h; awayWinPct = a
    }

    // Key by ESPN short name so LiveScoresView can look up by game.home.name
    const key = `${awayKey}@${homeKey}`
    map.set(key, { homeTeam: homeKey, awayTeam: awayKey, spread, homeWinPct, awayWinPct, homeMoneyline: homeML, awayMoneyline: awayML })
  }

  return map
}

async function fetchAllOdds(): Promise<Map<string, GameOdds>> {
  const apiKey = import.meta.env.VITE_ODDS_API_KEY
  if (!apiKey) return new Map()

  const base = `https://api.the-odds-api.com/v4/sports`
  const params = `?apiKey=${apiKey}&regions=us&markets=h2h,spreads&oddsFormat=american`

  // Fetch NFL and CFB in parallel
  const [nflRes, cfbRes] = await Promise.all([
    fetch(`${base}/americanfootball_nfl/odds/${params}`),
    fetch(`${base}/americanfootball_ncaaf/odds/${params}`),
  ])

  const combined = new Map<string, GameOdds>()

  // NFL — keyed by abbreviation (e.g. "BUF@KC")
  if (nflRes.ok) {
    const nflGames = await nflRes.json()
    const nflMap = parseOddsGames(nflGames, (name) => NFL_NAME_TO_ABBR[name] ?? null)
    nflMap.forEach((v, k) => combined.set(k, v))
  }

  // CFB — keyed by ESPN short name (e.g. "Georgia@Ohio State")
  if (cfbRes.ok) {
    const cfbGames = await cfbRes.json()
    const cfbMap = parseOddsGames(cfbGames, (name) => CFB_FULL_TO_SHORT[name] ?? null)
    cfbMap.forEach((v, k) => combined.set(k, v))
  }

  return combined
}

export function useNflOdds() {
  return useQuery({
    queryKey: ['all-odds'],
    queryFn: fetchAllOdds,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    enabled: !!import.meta.env.VITE_ODDS_API_KEY,
  })
}
