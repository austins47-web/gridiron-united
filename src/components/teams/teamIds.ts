// ESPN team ID lookups — used to link player team names to team pages
// NFL: team abbreviation → ESPN team ID
export const NFL_TEAM_IDS: Record<string, string> = {
  'ARI': '22', 'ATL': '1',  'BAL': '33', 'BUF': '2',  'CAR': '29', 'CHI': '3',
  'CIN': '4',  'CLE': '5',  'DAL': '6',  'DEN': '7',  'DET': '8',  'GB':  '9',
  'HOU': '34', 'IND': '11', 'JAX': '30', 'KC':  '12', 'LAC': '24', 'LAR': '14',
  'LV':  '13', 'MIA': '15', 'MIN': '16', 'NE':  '17', 'NO':  '18', 'NYG': '19',
  'NYJ': '20', 'PHI': '21', 'PIT': '23', 'SEA': '26', 'SF':  '25', 'TB':  '27',
  'TEN': '10', 'WSH': '28',
  // Full name fallbacks
  'Arizona Cardinals': '22', 'Atlanta Falcons': '1', 'Baltimore Ravens': '33',
  'Buffalo Bills': '2', 'Carolina Panthers': '29', 'Chicago Bears': '3',
  'Cincinnati Bengals': '4', 'Cleveland Browns': '5', 'Dallas Cowboys': '6',
  'Denver Broncos': '7', 'Detroit Lions': '8', 'Green Bay Packers': '9',
  'Houston Texans': '34', 'Indianapolis Colts': '11', 'Jacksonville Jaguars': '30',
  'Kansas City Chiefs': '12', 'Los Angeles Chargers': '24', 'Los Angeles Rams': '14',
  'Las Vegas Raiders': '13', 'Miami Dolphins': '15', 'Minnesota Vikings': '16',
  'New England Patriots': '17', 'New Orleans Saints': '18', 'New York Giants': '19',
  'New York Jets': '20', 'Philadelphia Eagles': '21', 'Pittsburgh Steelers': '23',
  'Seattle Seahawks': '26', 'San Francisco 49ers': '25', 'Tampa Bay Buccaneers': '27',
  'Tennessee Titans': '10', 'Washington Commanders': '28',
}

// CFB: team name / abbreviation → ESPN team ID
export const CFB_TEAM_IDS: Record<string, string> = {
  // SEC
  'Alabama': '333', 'ALA': '333', 'Auburn': '2', 'Arkansas': '8', 'Florida': '57',
  'Georgia': '61', 'Kentucky': '96', 'LSU': '99', 'Mississippi State': '344',
  'Missouri': '142', 'Ole Miss': '145', 'Oklahoma': '201', 'South Carolina': '2579',
  'Tennessee': '2633', 'Texas A&M': '245', 'Texas': '251', 'Vanderbilt': '238',
  // Big Ten
  'Illinois': '356', 'Indiana': '84', 'Iowa': '2294', 'Maryland': '120',
  'Michigan': '130', 'Michigan State': '127', 'Minnesota': '135', 'Nebraska': '158',
  'Northwestern': '77', 'Ohio State': '194', 'Oregon': '2483', 'Penn State': '213',
  'Purdue': '218', 'Rutgers': '164', 'UCLA': '26', 'USC': '30',
  'Washington': '264', 'Wisconsin': '275',
  // Big 12
  'Arizona': '12', 'Arizona State': '9', 'Baylor': '239', 'BYU': '252',
  'Cincinnati': '2132', 'Colorado': '38', 'Houston': '248', 'Iowa State': '66',
  'Kansas': '2305', 'Kansas State': '2306', 'Oklahoma State': '197', 'TCU': '2628',
  'Texas Tech': '2641', 'UCF': '2116', 'Utah': '254', 'West Virginia': '277',
  // ACC
  'Boston College': '103', 'California': '25', 'Clemson': '228', 'Duke': '150',
  'Florida State': '52', 'Georgia Tech': '59', 'Louisville': '97', 'Miami': '2390',
  'NC State': '152', 'North Carolina': '153', 'Pittsburgh': '221', 'SMU': '2567',
  'Stanford': '24', 'Syracuse': '183', 'Virginia': '258', 'Virginia Tech': '259',
  'Wake Forest': '154',
  // MWC / Independents
  'Air Force': '2005', 'Boise State': '68', 'Colorado State': '36',
  'Fresno State': '278', 'Hawaii': '62', 'Nevada': '2440', 'New Mexico': '167',
  'Oregon State': '204', 'San Diego State': '21', 'San Jose State': '23',
  'UNLV': '2439', 'Utah State': '328', 'Washington State': '265', 'Wyoming': '264',
  // AAC
  'Army': '349', 'Charlotte': '2429', 'East Carolina': '151', 'Florida Atlantic': '2226',
  'Memphis': '235', 'Navy': '2426', 'North Texas': '249', 'Rice': '242',
  'South Florida': '58', 'Temple': '218', 'Tulane': '2655', 'Tulsa': '202',
  'UAB': '2816', 'UTSA': '2949',
  // CUSA
  'FIU': '2229', 'Jacksonville State': '55', 'Louisiana Tech': '2348',
  'Marshall': '276', 'Middle Tennessee': '2393', 'New Mexico State': '2463',
  'Old Dominion': '295', 'Southern Miss': '2572', 'UTEP': '2638', 'Western Kentucky': '98',
  // MAC
  'Akron': '2006', 'Ball State': '2050', 'Bowling Green': '189', 'Buffalo': '2', 
  'Central Michigan': '2117', 'Eastern Michigan': '2199', 'Kent State': '2309',
  'Miami (OH)': '193', 'Northern Illinois': '2459', 'Ohio': '195', 'Toledo': '252',
  'Western Michigan': '2711',
  // Sun Belt
  'App State': '2026', 'Appalachian State': '2026', 'Arkansas State': '2032',
  'Coastal Carolina': '324', 'Georgia Southern': '290', 'Georgia State': '2247',
  'James Madison': '256', 'Louisiana': '309', 'Louisiana Monroe': '2433',
  'South Alabama': '6', 'Troy': '2653',
  // Independents
  'Notre Dame': '87', 'Liberty': '2335', 'Massachusetts': '113',
}

export function getTeamId(teamName: string, league: 'NFL' | 'CFB'): string | null {
  if (league === 'NFL') return NFL_TEAM_IDS[teamName] ?? null
  return CFB_TEAM_IDS[teamName] ?? null
}

/**
 * ESPN's team-logo CDN. NFL logos are keyed by lowercase abbreviation;
 * CFB logos are keyed by ESPN's numeric team id (there's no reliable
 * abbreviation-based path for the 130+ FBS schools). Pass whichever
 * you have — abbr for NFL, and either an id already on hand or a
 * team name we can resolve via CFB_TEAM_IDS for CFB.
 */
export function teamLogoUrl(
  team: { abbr?: string; name?: string; id?: string | null },
  league: 'NFL' | 'CFB',
): string | null {
  if (league === 'NFL') {
    const abbr = team.abbr?.toLowerCase()
    if (!abbr) return null
    return `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr}.png`
  }
  const id = team.id ?? (team.name ? CFB_TEAM_IDS[team.name] : null) ?? (team.abbr ? CFB_TEAM_IDS[team.abbr] : null)
  if (!id) return null
  return `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`
}
