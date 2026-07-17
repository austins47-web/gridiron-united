// ── SportsDataIO API client ───────────────────────────────────
// Docs: https://sportsdata.io/developers/api-documentation/nfl

const NFL_BASE = 'https://api.sportsdata.io/v3/nfl'
const CFB_BASE = 'https://api.sportsdata.io/v3/cfb'
const KEY = import.meta.env.VITE_SPORTSDATAIO_KEY

const headers = { 'Ocp-Apim-Subscription-Key': KEY }

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
  Status: string           // 'Scheduled' | 'InProgress' | 'Final' | 'F/OT'
  Quarter: string | null
  TimeRemaining: string | null
  Possession: string | null
  Down: number | null
  Distance: string | null
  YardLine: number | null
  AwayScoreQuarter1: number | null
  AwayScoreQuarter2: number | null
  AwayScoreQuarter3: number | null
  AwayScoreQuarter4: number | null
  HomeScoreQuarter1: number | null
  HomeScoreQuarter2: number | null
  HomeScoreQuarter3: number | null
  HomeScoreQuarter4: number | null
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
  FantasyPointsHalfPpr: number | null
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

// ── API calls ─────────────────────────────────────────────────

export async function getNFLScores(week: number, season = 2026): Promise<SDIOScore[]> {
  const res = await fetch(
    `${NFL_BASE}/scores/json/ScoresByWeek/${season}REG/${week}`,
    { headers }
  )
  if (!res.ok) throw new Error(`SportsDataIO scores error: ${res.status}`)
  return res.json()
}

export async function getNFLLiveScores(): Promise<SDIOScore[]> {
  const res = await fetch(
    `${NFL_BASE}/scores/json/LiveScores`,
    { headers }
  )
  if (!res.ok) throw new Error(`SportsDataIO live scores error: ${res.status}`)
  return res.json()
}

export async function getNFLPlayerStatsByWeek(
  week: number,
  season = 2026
): Promise<SDIOPlayerGame[]> {
  const res = await fetch(
    `${NFL_BASE}/stats/json/PlayerGameStatsByWeek/${season}REG/${week}`,
    { headers }
  )
  if (!res.ok) throw new Error(`SportsDataIO player stats error: ${res.status}`)
  return res.json()
}

export async function getNFLNews(count = 20): Promise<SDIONews[]> {
  const res = await fetch(
    `${NFL_BASE}/scores/json/News`,
    { headers }
  )
  if (!res.ok) throw new Error(`SportsDataIO news error: ${res.status}`)
  const all: SDIONews[] = await res.json()
  return all.slice(0, count)
}

export async function getNFLPlayerNews(playerId: number): Promise<SDIONews[]> {
  const res = await fetch(
    `${NFL_BASE}/scores/json/NewsByPlayerID/${playerId}`,
    { headers }
  )
  if (!res.ok) return []
  return res.json()
}

export async function getCurrentNFLWeek(): Promise<number> {
  const res = await fetch(
    `${NFL_BASE}/scores/json/CurrentWeek`,
    { headers }
  )
  if (!res.ok) return 1
  return res.json()
}

// ── CFB ───────────────────────────────────────────────────────

export async function getCFBScores(week: number, season = 2026): Promise<any[]> {
  const res = await fetch(
    `${CFB_BASE}/scores/json/GamesByWeek/${season}/${week}`,
    { headers }
  )
  if (!res.ok) throw new Error(`SportsDataIO CFB scores error: ${res.status}`)
  return res.json()
}

export async function getCFBPlayerStatsByWeek(
  week: number,
  season = 2026
): Promise<any[]> {
  const res = await fetch(
    `${CFB_BASE}/stats/json/PlayerGameStatsByWeek/${season}/${week}`,
    { headers }
  )
  if (!res.ok) throw new Error(`SportsDataIO CFB player stats error: ${res.status}`)
  return res.json()
}

// ── Scoring helpers ───────────────────────────────────────────
// Apply fantasy scoring rules to raw player stats

export interface ScoringRules {
  ppr: number          // points per reception (0, 0.5, or 1)
  passingYards: number // per yard (typically 0.04)
  passingTD: number    // per TD (typically 4)
  interception: number // per INT (typically -2)
  rushingYards: number // per yard (typically 0.1)
  rushingTD: number    // per TD (typically 6)
  receivingYards: number
  receivingTD: number
  fumbleLost: number   // typically -2
  twoPointConversion: number // typically 2
  fieldGoal: number    // per FG (typically 3)
  extraPoint: number   // per XP (typically 1)
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
  pts += (stats.PassingYards ?? 0) * rules.passingYards
  pts += (stats.PassingTouchdowns ?? 0) * rules.passingTD
  pts += (stats.PassingInterceptions ?? 0) * rules.interception
  pts += (stats.RushingYards ?? 0) * rules.rushingYards
  pts += (stats.RushingTouchdowns ?? 0) * rules.rushingTD
  pts += (stats.Receptions ?? 0) * rules.ppr
  pts += (stats.ReceivingYards ?? 0) * rules.receivingYards
  pts += (stats.ReceivingTouchdowns ?? 0) * rules.receivingTD
  pts += (stats.FumblesLost ?? 0) * rules.fumbleLost
  pts += (stats.TwoPointConversions ?? 0) * rules.twoPointConversion
  pts += (stats.FieldGoalsMade ?? 0) * rules.fieldGoal
  pts += (stats.ExtraPointsMade ?? 0) * rules.extraPoint
  return Math.round(pts * 10) / 10
}
