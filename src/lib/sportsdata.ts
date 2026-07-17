// ── SportsDataIO via Supabase Edge Function proxy ────────────
// Direct browser calls to SportsDataIO are blocked by CORS.
// All requests go through /functions/v1/sportsdata?endpoint=...

const PROXY = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sportsdata`
const ANON  = import.meta.env.VITE_SUPABASE_ANON_KEY

async function sdio<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${PROXY}?endpoint=${encodeURIComponent(endpoint)}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`sportsdata proxy error ${res.status}: ${err.error ?? ''}`)
  }
  return res.json()
}

// ── Types ─────────────────────────────────────────────────────

export interface SDIOScore {
  GameKey: string
  SeasonType: number
  Season: number
  Week: number
  Date: string | null
  AwayTeam: string
  HomeTeam: string
  AwayScore: number | null
  HomeScore: number | null
  Channel: string | null
  StadiumDetails: { Name: string } | null
  Status: string
  Quarter: string | null
  TimeRemaining: string | null
  Possession: string | null
  Down: number | null
  Distance: string | null
  YardLine: number | null
  PointSpread: number | null
  OverUnder: number | null
  HomeTeamMoneyLine: number | null
  AwayTeamMoneyLine: number | null
}

export interface SDIOPlayerGame {
  PlayerID: number
  Name: string
  Team: string
  Position: string
  FantasyPoints: number
  FantasyPointsPPR: number
  PassingYards: number | null
  PassingTouchdowns: number | null
  PassingInterceptions: number | null
  RushingYards: number | null
  RushingTouchdowns: number | null
  Receptions: number | null
  ReceivingYards: number | null
  ReceivingTouchdowns: number | null
  FumblesLost: number | null
  TwoPointConversions: number | null
  FieldGoalsMade: number | null
  ExtraPointsMade: number | null
}

export interface SDIOProjection extends SDIOPlayerGame {
  // Projections have the same shape as game stats
  FantasyPointsProjection?: number
}

export interface SDIONews {
  NewsID: number
  Source: string
  Updated: string
  TimeAgo: string
  Title: string
  Content: string
  Url: string
  PlayerID: number | null
  PlayerName: string | null
  TeamID: number | null
  Team: string | null
  OriginalSource: string | null
}

export interface SDIOPlayer {
  PlayerID: number
  Name: string
  Team: string
  Position: string
  Status: string
  Height: string
  Weight: number
  Age: number
  BirthDate: string | null
  College: string | null
  Experience: number
  FantasyPosition: string
  AverageDraftPosition: number | null
  AverageDraftPositionPPR: number | null
}

// ── API calls ─────────────────────────────────────────────────

export const getNFLNews          = ()                     => sdio<SDIONews[]>('nfl/news')
export const getNFLLiveScores    = ()                     => sdio<SDIOScore[]>('nfl/live-scores')
export const getNFLScores        = (season: number, week: number) => sdio<SDIOScore[]>(`nfl/scores/${season}/${week}`)
export const getNFLPlayerStats   = (season: number, week: number) => sdio<SDIOPlayerGame[]>(`nfl/stats/${season}/${week}`)
export const getNFLProjections   = (season: number, week: number) => sdio<SDIOProjection[]>(`nfl/projections/${season}/${week}`)
export const getNFLPlayers       = ()                     => sdio<SDIOPlayer[]>('nfl/players')
export const getCurrentNFLWeek   = ()                     => sdio<number>('nfl/week')
export const getCFBScores        = (season: number, week: number) => sdio<any[]>(`cfb/scores/${season}/${week}`)
export const getCFBPlayerStats   = (season: number, week: number) => sdio<any[]>(`cfb/stats/${season}/${week}`)
export const getCFBPlayers       = ()                     => sdio<any[]>('cfb/players')

// ── Scoring calculator ────────────────────────────────────────

export interface ScoringRules {
  ppr: number
  passingYards: number
  passingTD: number
  interception: number
  rushingYards: number
  rushingTD: number
  receivingYards: number
  receivingTD: number
  fumbleLost: number
  twoPointConversion: number
  fieldGoal: number
  extraPoint: number
}

export const DEFAULT_SCORING: ScoringRules = {
  ppr: 1,
  passingYards: 0.04,
  passingTD: 4,
  interception: -2,
  rushingYards: 0.1,
  rushingTD: 6,
  receivingYards: 0.1,
  receivingTD: 6,
  fumbleLost: -2,
  twoPointConversion: 2,
  fieldGoal: 3,
  extraPoint: 1,
}

export function calculateFantasyPoints(
  stats: SDIOPlayerGame,
  rules: ScoringRules = DEFAULT_SCORING
): number {
  let pts = 0
  pts += (stats.PassingYards ?? 0)        * rules.passingYards
  pts += (stats.PassingTouchdowns ?? 0)   * rules.passingTD
  pts += (stats.PassingInterceptions ?? 0) * rules.interception
  pts += (stats.RushingYards ?? 0)        * rules.rushingYards
  pts += (stats.RushingTouchdowns ?? 0)   * rules.rushingTD
  pts += (stats.Receptions ?? 0)          * rules.ppr
  pts += (stats.ReceivingYards ?? 0)      * rules.receivingYards
  pts += (stats.ReceivingTouchdowns ?? 0) * rules.receivingTD
  pts += (stats.FumblesLost ?? 0)         * rules.fumbleLost
  pts += (stats.TwoPointConversions ?? 0) * rules.twoPointConversion
  pts += (stats.FieldGoalsMade ?? 0)      * rules.fieldGoal
  pts += (stats.ExtraPointsMade ?? 0)     * rules.extraPoint
  return Math.round(pts * 10) / 10
}

// ── Team name helpers ─────────────────────────────────────────
// SportsDataIO uses abbreviations like 'KC', 'SF', 'NE'

export function normalizeTeam(abbr: string): string {
  const map: Record<string, string> = {
    ARI: 'Arizona Cardinals',   ATL: 'Atlanta Falcons',
    BAL: 'Baltimore Ravens',    BUF: 'Buffalo Bills',
    CAR: 'Carolina Panthers',   CHI: 'Chicago Bears',
    CIN: 'Cincinnati Bengals',  CLE: 'Cleveland Browns',
    DAL: 'Dallas Cowboys',      DEN: 'Denver Broncos',
    DET: 'Detroit Lions',       GB:  'Green Bay Packers',
    HOU: 'Houston Texans',      IND: 'Indianapolis Colts',
    JAX: 'Jacksonville Jaguars',KC:  'Kansas City Chiefs',
    LAC: 'Los Angeles Chargers',LAR: 'Los Angeles Rams',
    LV:  'Las Vegas Raiders',   MIA: 'Miami Dolphins',
    MIN: 'Minnesota Vikings',   NE:  'New England Patriots',
    NO:  'New Orleans Saints',  NYG: 'New York Giants',
    NYJ: 'New York Jets',       PHI: 'Philadelphia Eagles',
    PIT: 'Pittsburgh Steelers', SEA: 'Seattle Seahawks',
    SF:  'San Francisco 49ers', TB:  'Tampa Bay Buccaneers',
    TEN: 'Tennessee Titans',    WAS: 'Washington Commanders',
  }
  return map[abbr.toUpperCase()] ?? abbr
}

export function teamAbbr(fullName: string): string {
  const map: Record<string, string> = {
    'Arizona Cardinals': 'ARI',   'Atlanta Falcons': 'ATL',
    'Baltimore Ravens': 'BAL',    'Buffalo Bills': 'BUF',
    'Carolina Panthers': 'CAR',   'Chicago Bears': 'CHI',
    'Cincinnati Bengals': 'CIN',  'Cleveland Browns': 'CLE',
    'Dallas Cowboys': 'DAL',      'Denver Broncos': 'DEN',
    'Detroit Lions': 'DET',       'Green Bay Packers': 'GB',
    'Houston Texans': 'HOU',      'Indianapolis Colts': 'IND',
    'Jacksonville Jaguars': 'JAX','Kansas City Chiefs': 'KC',
    'Los Angeles Chargers': 'LAC','Los Angeles Rams': 'LAR',
    'Las Vegas Raiders': 'LV',    'Miami Dolphins': 'MIA',
    'Minnesota Vikings': 'MIN',   'New England Patriots': 'NE',
    'New Orleans Saints': 'NO',   'New York Giants': 'NYG',
    'New York Jets': 'NYJ',       'Philadelphia Eagles': 'PHI',
    'Pittsburgh Steelers': 'PIT', 'Seattle Seahawks': 'SEA',
    'San Francisco 49ers': 'SF',  'Tampa Bay Buccaneers': 'TB',
    'Tennessee Titans': 'TEN',    'Washington Commanders': 'WAS',
  }
  return map[fullName] ?? fullName.substring(0, 3).toUpperCase()
}
