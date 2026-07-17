import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '@/store/appStore'
import { Star, RefreshCw, WifiOff, TrendingUp, LayoutGrid, List, Columns2, Columns3, Columns4, Newspaper } from 'lucide-react'
import clsx from 'clsx'
import { useNflOdds, type GameOdds } from '@/hooks/useNflOdds'
import { NewsView } from './NewsView'

// ── Types ────────────────────────────────────────────────────

interface GameTeam {
  abbr: string
  name: string
  score: string
  winner?: boolean
  record?: string
  rank?: number
}

interface LiveGame {
  id: string
  league: 'NFL' | 'CFB'
  status: 'pre' | 'in' | 'post'
  statusText: string
  clock?: string
  period?: number
  possession?: string
  home: GameTeam
  away: GameTeam
  venue?: string
  broadcast?: string
  downDistance?: string
  redZone?: boolean
}

type ViewMode = 'grid' | 'list' | 'news'
type ColCount = 2 | 3 | 4 | 5

// ── ESPN parsers ─────────────────────────────────────────────

function parseGame(event: any, league: 'NFL' | 'CFB'): LiveGame {
  try {
    const comp = event.competitions?.[0] ?? {}
    const statusType = comp.status?.type?.name ?? 'STATUS_SCHEDULED'
    const competitors: any[] = comp.competitors ?? []
    const homeComp = competitors.find((c: any) => c.homeAway === 'home') ?? competitors[0] ?? {}
    const awayComp = competitors.find((c: any) => c.homeAway === 'away') ?? competitors[1] ?? {}

    const mapTeam = (c: any): GameTeam => ({
      abbr: c.team?.abbreviation ?? '??',
      name: c.team?.shortDisplayName ?? c.team?.displayName ?? '??',
      score: c.score ?? '0',
      winner: c.winner,
      record: c.records?.[0]?.summary,
      rank: c.curatedRank?.current > 0 && c.curatedRank?.current <= 25
        ? c.curatedRank.current : undefined,
    })

    const gameStatus: 'pre' | 'in' | 'post' =
      statusType === 'STATUS_IN_PROGRESS' || statusType === 'STATUS_HALFTIME' ? 'in' :
      statusType === 'STATUS_FINAL' || statusType === 'STATUS_FINAL_OVERTIME' ? 'post' : 'pre'

    const situation = comp.situation ?? {}

    return {
      id: event.id,
      league,
      status: gameStatus,
      statusText: comp.status?.type?.shortDetail ?? '',
      clock: comp.status?.displayClock,
      period: comp.status?.period,
      possession: situation.possession,
      home: mapTeam(homeComp),
      away: mapTeam(awayComp),
      venue: comp.venue?.fullName,
      broadcast: comp.broadcasts?.[0]?.names?.[0],
      downDistance: situation.shortDownDistanceText,
      redZone: situation.isRedZone ?? false,
    }
  } catch {
    return {
      id: event.id ?? 'unknown',
      league, status: 'pre', statusText: '',
      home: { abbr: '??', name: '??', score: '0' },
      away: { abbr: '??', name: '??', score: '0' },
    }
  }
}

async function fetchLeague(league: 'NFL' | 'CFB'): Promise<LiveGame[]> {
  const url = league === 'NFL'
    ? 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
    : 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=50'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN ${league} fetch failed: ${res.status}`)
  const data = await res.json()
  return (data.events ?? []).map((e: any) => parseGame(e, league))
}

// ── Favorites ────────────────────────────────────────────────

const FAV_KEY = 'gu_fav_teams_v2'
const VIEW_KEY = 'gu_scores_view'
const COLS_KEY = 'gu_scores_cols'

const FULL_NAME_TO_ABBR: Record<string, string> = {
  'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL', 'Baltimore Ravens': 'BAL',
  'Buffalo Bills': 'BUF', 'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI',
  'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE', 'Dallas Cowboys': 'DAL',
  'Denver Broncos': 'DEN', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX',
  'Kansas City Chiefs': 'KC', 'Las Vegas Raiders': 'LV', 'Los Angeles Chargers': 'LAC',
  'Los Angeles Rams': 'LAR', 'Miami Dolphins': 'MIA', 'Minnesota Vikings': 'MIN',
  'New England Patriots': 'NE', 'New Orleans Saints': 'NO', 'New York Giants': 'NYG',
  'New York Jets': 'NYJ', 'Philadelphia Eagles': 'PHI', 'Pittsburgh Steelers': 'PIT',
  'San Francisco 49ers': 'SF', 'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB',
  'Tennessee Titans': 'TEN', 'Washington Commanders': 'WSH',
  'Alabama': 'ALA', 'Auburn': 'AUB', 'Georgia': 'UGA', 'LSU': 'LSU',
  'Tennessee': 'TENN', 'Texas A&M': 'TAMU', 'Florida': 'FLA', 'South Carolina': 'SC',
  'Ohio State': 'OSU', 'Michigan': 'MICH', 'Penn State': 'PSU', 'Michigan State': 'MSU',
  'Iowa': 'IOWA', 'Wisconsin': 'WIS', 'Notre Dame': 'ND', 'Texas': 'TEX',
  'Oklahoma': 'OU', 'Kansas State': 'KSU', 'Baylor': 'BAY', 'TCU': 'TCU',
  'Oregon': 'ORE', 'Washington': 'WASH', 'USC': 'USC', 'Utah': 'UTAH',
  'Clemson': 'CLEM', 'Florida State': 'FSU', 'Miami': 'MIA', 'NC State': 'NCSU',
  'Colorado': 'COLO', 'Boise State': 'BSU',
}

function toAbbr(nameOrAbbr: string): string {
  return FULL_NAME_TO_ABBR[nameOrAbbr] ?? nameOrAbbr
}

function loadFavs(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]')) }
  catch { return new Set() }
}
function saveFavs(s: Set<string>) { localStorage.setItem(FAV_KEY, JSON.stringify([...s])) }

function teamIsFav(favs: Set<string>, team: GameTeam): boolean {
  return favs.has(team.abbr) || favs.has(team.name) || favs.has(FULL_NAME_TO_ABBR[team.name] ?? '')
}
function gameHasFav(favs: Set<string>, game: LiveGame): boolean {
  return teamIsFav(favs, game.home) || teamIsFav(favs, game.away)
}

// ── Status badge ─────────────────────────────────────────────

function StatusBadge({ game, compact = false }: { game: LiveGame, compact?: boolean }) {
  if (game.status === 'post') {
    return <span className={clsx('font-bold text-emerald-400', compact ? 'text-[10px]' : 'text-xs')}>Final</span>
  }
  if (game.status === 'pre') {
    return <span className={clsx('text-field-300', compact ? 'text-[10px]' : 'text-xs')}>{game.statusText}</span>
  }
  const quarters = ['', 'Q1', 'Q2', 'Q3', 'Q4', 'OT', '2OT']
  const halves   = ['', '1st', '2nd', 'OT']
  const p = game.period ?? 1
  const label = game.league === 'NFL' ? (quarters[p] ?? `P${p}`) : (halves[p] ?? `P${p}`)
  return (
    <div className="flex items-center gap-1">
      <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
      <span className={clsx('font-bold text-red-400', compact ? 'text-[10px]' : 'text-xs')}>{label}</span>
      {game.clock && <span className={clsx('text-field-300', compact ? 'text-[10px]' : 'text-xs')}>{game.clock}</span>}
    </div>
  )
}

// ── GRID CARD ────────────────────────────────────────────────

function GridCard({ game, favTeams, onToggleFav, odds }: {
  game: LiveGame
  favTeams: Set<string>
  onToggleFav: (abbr: string) => void
  odds?: GameOdds | null
}) {
  const isLive  = game.status === 'in'
  const isFinal = game.status === 'post'
  const awayScore = parseInt(game.away.score) || 0
  const homeScore = parseInt(game.home.score) || 0
  const homeIsFav = teamIsFav(favTeams, game.home)
  const awayIsFav = teamIsFav(favTeams, game.away)

  return (
    <div className={clsx(
      'bg-field-800 border rounded-xl p-3 flex flex-col gap-2 min-w-0',
      isLive && game.redZone ? 'border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.12)]'
      : isLive ? 'border-gold/30'
      : 'border-field-700',
    )}>
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          <span className={clsx(
            'shrink-0 font-cond font-black text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded',
            game.league === 'NFL' ? 'bg-nfl/20 text-nfl' : 'bg-cfb/20 text-cfb',
          )}>{game.league}</span>
          <StatusBadge game={game} compact />
          {game.redZone && isLive && <span className="text-[9px] font-black text-red-400">RZ</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {game.broadcast && <span className="text-xs text-field-300 font-bold">{game.broadcast}</span>}
          <button onClick={() => onToggleFav(awayIsFav ? game.away.abbr : game.home.abbr)}
            className="text-field-500 hover:text-gold transition-colors">
            <Star className={clsx('w-3.5 h-3.5', (homeIsFav || awayIsFav) && 'fill-gold text-gold')} />
          </button>
        </div>
      </div>

      {[
        { team: game.away, ahead: awayScore > homeScore },
        { team: game.home, ahead: homeScore > awayScore },
      ].map(({ team, ahead }) => {
        const isFav   = teamIsFav(favTeams, team)
        const hasBall = isLive && game.possession === team.abbr
        const winning = (isLive || isFinal) && ahead
        const losing  = (isLive || isFinal) && !ahead && awayScore !== homeScore

        return (
          <div key={team.abbr} className="flex items-center gap-1.5">
            <div className="w-2 shrink-0 flex justify-center">
              {hasBall && <div className="w-1.5 h-1.5 rounded-full bg-gold" />}
            </div>
            {team.rank
              ? <span className="text-[9px] font-black text-cfb w-5 shrink-0 text-right">#{team.rank}</span>
              : <span className="w-5 shrink-0" />}
            <span className={clsx(
              'font-cond font-bold text-sm flex-1 truncate',
              isFav ? 'text-gold' : winning ? 'text-white' : losing ? 'text-field-400' : 'text-field-200',
            )}>
              {team.abbr}
              <span className="text-field-300 font-normal text-xs ml-1 hidden sm:inline">
                {team.name !== team.abbr ? team.name : ''}
              </span>
            </span>
            {game.status === 'pre' && team.record && (
              <span className="text-xs text-field-300 shrink-0">{team.record}</span>
            )}
            {game.status !== 'pre' && (
              <span className={clsx(
                'font-cond font-black text-lg leading-none w-7 text-right shrink-0',
                isFav ? 'text-gold' : winning ? 'text-white' : losing ? 'text-field-400' : 'text-field-200',
              )}>{team.score}</span>
            )}
          </div>
        )
      })}

      {isLive && game.downDistance && (
        <div className="text-xs text-field-300 border-t border-field-700/60 pt-1.5 truncate">
          {game.downDistance}
          {game.venue && <span className="text-field-300 ml-2">· {game.venue.split(',')[0]}</span>}
        </div>
      )}
      {game.status === 'pre' && game.venue && (
        <div className="text-xs text-field-300 border-t border-field-700/60 pt-1.5 truncate">
          {game.venue.split(',')[0]}
        </div>
      )}

      {odds && game.status !== 'post' && (
        <div className="border-t border-field-700/60 pt-2 space-y-2">
          {odds.spread !== null && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <TrendingUp className="w-3 h-3 text-field-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-field-400">Spread</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { team: game.away.abbr, pts: -odds.spread },
                  { team: game.home.abbr, pts:  odds.spread },
                ].map(({ team, pts }) => {
                  const label = pts === 0 ? 'PK' : pts > 0 ? `+${pts}` : `${pts}`
                  const favored = pts < 0
                  return (
                    <div key={team} className={clsx(
                      'flex items-center justify-between px-2 py-1 rounded-lg',
                      favored ? 'bg-field-700 border border-field-600' : 'bg-field-800/60 border border-field-700/50',
                    )}>
                      <span className="font-cond font-bold text-xs text-field-200">{team}</span>
                      <span className={clsx('font-cond font-black text-sm', favored ? 'text-white' : 'text-field-300')}>{label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {odds.awayWinPct !== null && odds.homeWinPct !== null && (
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-field-400 block mb-1">Win %</span>
              <div className="flex rounded-lg overflow-hidden h-5 text-xs font-black">
                <div className="flex items-center justify-center bg-field-500 transition-all" style={{ width: `${odds.awayWinPct}%` }}>
                  {odds.awayWinPct >= 20 && <span className="text-white">{odds.awayWinPct}%</span>}
                </div>
                <div className="flex items-center justify-center bg-gold/80 transition-all" style={{ width: `${odds.homeWinPct}%` }}>
                  {odds.homeWinPct >= 20 && <span className="text-field-950">{odds.homeWinPct}%</span>}
                </div>
              </div>
              <div className="flex justify-between mt-1">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-sm bg-field-500 shrink-0" />
                  <span className="text-xs font-bold text-field-300">{game.away.abbr} {odds.awayWinPct}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-field-300">{odds.homeWinPct}% {game.home.abbr}</span>
                  <div className="w-2 h-2 rounded-sm bg-gold/80 shrink-0" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── LIST ROW ─────────────────────────────────────────────────

function ListRow({ game, favTeams, onToggleFav, odds }: {
  game: LiveGame
  favTeams: Set<string>
  onToggleFav: (abbr: string) => void
  odds?: GameOdds | null
}) {
  const isLive  = game.status === 'in'
  const isFinal = game.status === 'post'
  const awayScore = parseInt(game.away.score) || 0
  const homeScore = parseInt(game.home.score) || 0
  const homeIsFav = teamIsFav(favTeams, game.home)
  const awayIsFav = teamIsFav(favTeams, game.away)
  const anyFav    = homeIsFav || awayIsFav

  const TeamBlock = ({ team, ahead, reverse = false }: { team: GameTeam, ahead: boolean, reverse?: boolean }) => {
    const isFav   = teamIsFav(favTeams, team)
    const hasBall = isLive && game.possession === team.abbr
    const winning = (isLive || isFinal) && ahead
    const losing  = (isLive || isFinal) && !ahead && awayScore !== homeScore

    if (reverse) {
      return (
        <div className="flex items-center gap-2 min-w-0 flex-row-reverse">
          {hasBall ? <div className="w-2 h-2 rounded-full bg-gold shrink-0" /> : <div className="w-2 shrink-0" />}
          {team.rank ? <span className="text-xs font-black text-cfb w-5 shrink-0 text-left">#{team.rank}</span> : <span className="w-5 shrink-0" />}
          <span className={clsx('font-cond font-black text-base shrink-0 w-10 text-right',
            isFav ? 'text-gold' : winning ? 'text-white' : losing ? 'text-field-400' : 'text-field-200',
          )}>{team.abbr}</span>
          <span className="text-field-300 text-sm truncate text-right">{team.name !== team.abbr ? team.name : ''}</span>
          {game.status === 'pre' && team.record && <span className="text-field-400 text-xs shrink-0">({team.record})</span>}
        </div>
      )
    }

    return (
      <div className="flex items-center gap-2 min-w-0">
        {hasBall ? <div className="w-2 h-2 rounded-full bg-gold shrink-0" /> : <div className="w-2 shrink-0" />}
        {team.rank ? <span className="text-xs font-black text-cfb w-5 shrink-0 text-right">#{team.rank}</span> : <span className="w-5 shrink-0" />}
        <span className={clsx('font-cond font-black text-base shrink-0 w-10',
          isFav ? 'text-gold' : winning ? 'text-white' : losing ? 'text-field-400' : 'text-field-200',
        )}>{team.abbr}</span>
        <span className="text-field-300 text-sm truncate">{team.name !== team.abbr ? team.name : ''}</span>
        {game.status === 'pre' && team.record && <span className="text-field-400 text-xs shrink-0">({team.record})</span>}
      </div>
    )
  }

  return (
    <div className={clsx(
      'flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all w-full',
      isLive && game.redZone ? 'border-red-500/30 bg-red-500/[0.03]'
      : isLive ? 'border-gold/25 bg-field-800'
      : anyFav ? 'border-field-600 bg-field-800'
      : 'border-field-700 bg-field-800/60',
    )}>
      <div className="flex items-center gap-1.5 shrink-0 w-[120px]">
        <span className={clsx('font-cond font-black text-xs uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0',
          game.league === 'NFL' ? 'bg-nfl/20 text-nfl' : 'bg-cfb/20 text-cfb',
        )}>{game.league}</span>
        <StatusBadge game={game} compact />
        {game.redZone && isLive && <span className="text-[9px] font-black text-red-400">RZ</span>}
      </div>

      <div className="shrink-0 w-[180px] min-w-0">
        <TeamBlock team={game.away} ahead={awayScore > homeScore} />
      </div>

      <div className="shrink-0 flex items-center gap-1.5 w-20 justify-center">
        {game.status !== 'pre' ? (
          <>
            <span className={clsx('font-cond font-black text-2xl w-7 text-right leading-none',
              awayScore > homeScore ? 'text-white' : 'text-field-400')}>{game.away.score}</span>
            <span className="text-field-500 text-sm font-bold">–</span>
            <span className={clsx('font-cond font-black text-2xl w-7 text-left leading-none',
              homeScore > awayScore ? 'text-white' : 'text-field-400')}>{game.home.score}</span>
          </>
        ) : (
          <span className="text-field-300 text-sm font-bold uppercase tracking-widest">vs</span>
        )}
      </div>

      <div className="shrink-0 w-[180px] min-w-0 flex justify-end">
        <TeamBlock team={game.home} ahead={homeScore > awayScore} reverse />
      </div>

      <div className="shrink-0 hidden lg:flex items-center gap-5 w-[260px] justify-end">
        {odds && game.status !== 'post' && (<>
          {odds.spread !== null && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-field-400 text-right">Spread</span>
              <div className="flex items-center gap-1.5">
                {[
                  { team: game.away.abbr, pts: -odds.spread },
                  { team: game.home.abbr, pts:  odds.spread },
                ].map(({ team, pts }) => {
                  const label = pts === 0 ? 'PK' : pts > 0 ? `+${pts}` : `${pts}`
                  const favored = pts < 0
                  return (
                    <span key={team} className={clsx('font-cond font-bold text-sm px-2 py-1 rounded-lg',
                      favored ? 'bg-field-500 text-white border border-field-400' : 'bg-field-700 text-field-200 border border-field-600')}>
                      {team} <span className={clsx('font-black', favored ? 'text-gold' : 'text-field-300')}>{label}</span>
                    </span>
                  )
                })}
              </div>
            </div>
          )}
          {odds.awayWinPct !== null && odds.homeWinPct !== null && (
            <div className="w-32 shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider text-field-400 block text-right mb-1">Win %</span>
              <div className="flex rounded-lg overflow-hidden h-5 text-xs font-black">
                <div className="flex items-center justify-center bg-field-500 transition-all" style={{ width: `${odds.awayWinPct}%` }}>
                  {odds.awayWinPct >= 25 && <span className="text-white text-xs font-black">{odds.awayWinPct}%</span>}
                </div>
                <div className="flex items-center justify-center bg-gold/80 transition-all" style={{ width: `${odds.homeWinPct}%` }}>
                  {odds.homeWinPct >= 25 && <span className="text-field-950 text-xs font-black">{odds.homeWinPct}%</span>}
                </div>
              </div>
              <div className="flex justify-between mt-1">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-sm bg-field-500 shrink-0" />
                  <span className="text-[10px] text-field-400">{game.away.abbr}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-field-400">{game.home.abbr}</span>
                  <div className="w-2 h-2 rounded-sm bg-gold/80 shrink-0" />
                </div>
              </div>
            </div>
          )}
        </>)}
      </div>

      <div className="shrink-0 hidden sm:flex flex-col items-end gap-0.5 w-[140px]">
        {isLive && game.downDistance && (
          <span className="text-xs text-field-300 font-bold truncate w-full text-right">{game.downDistance}</span>
        )}
        {game.broadcast && (
          <span className="text-xs text-field-200 font-bold truncate w-full text-right">{game.broadcast}</span>
        )}
        {game.venue && (
          <span className="text-[10px] text-field-500 truncate w-full text-right leading-tight" title={game.venue}>
            {game.venue.split(',')[0]}
          </span>
        )}
      </div>

      <button onClick={() => onToggleFav(awayIsFav ? game.away.abbr : game.home.abbr)}
        className="text-field-500 hover:text-gold transition-colors shrink-0">
        <Star className={clsx('w-3.5 h-3.5', anyFav && 'fill-gold text-gold')} />
      </button>
    </div>
  )
}

// ── COLS PICKER ──────────────────────────────────────────────

function ColsPicker({ value, onChange }: { value: ColCount, onChange: (v: ColCount) => void }) {
  const options: { val: ColCount, icon: React.ReactNode, label: string }[] = [
    { val: 2, icon: <Columns2 className="w-3.5 h-3.5" />, label: '2' },
    { val: 3, icon: <Columns3 className="w-3.5 h-3.5" />, label: '3' },
    { val: 4, icon: <Columns4 className="w-3.5 h-3.5" />, label: '4' },
    { val: 5, icon: <LayoutGrid className="w-3.5 h-3.5" />, label: '5' },
  ]
  return (
    <div className="pill-tabs flex gap-0.5 bg-field-800 border border-field-700 rounded-lg p-0.5">
      {options.map(({ val, icon, label }) => (
        <button key={val} onClick={() => onChange(val)} title={`${label} per row`}
          className={clsx('flex items-center gap-1 font-cond font-bold text-xs px-2 py-1.5 rounded-md transition-colors',
            value === val ? 'bg-field-700 text-white' : 'text-field-400 hover:text-white')}>
          {icon}
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}

const GRID_COLS: Record<ColCount, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
}

function GameGroup({ games, viewMode, cols, favTeams, onToggleFav, oddsMap }: {
  games: LiveGame[]
  viewMode: ViewMode
  cols: ColCount
  favTeams: Set<string>
  onToggleFav: (abbr: string) => void
  oddsMap?: Map<string, GameOdds>
}) {
  const getOdds = (g: LiveGame) => {
    if (!oddsMap) return null
    if (g.league === 'NFL') return oddsMap.get(`${g.away.abbr}@${g.home.abbr}`) ?? null
    return oddsMap.get(`${g.away.name}@${g.home.name}`) ?? null
  }

  if (viewMode === 'list') {
    return (
      <div className="space-y-1.5">
        {games.map(g => <ListRow key={g.id} game={g} favTeams={favTeams} onToggleFav={onToggleFav} odds={getOdds(g)} />)}
      </div>
    )
  }

  return (
    <div className={clsx('grid gap-3', GRID_COLS[cols])}>
      {games.map(g => <GridCard key={g.id} game={g} favTeams={favTeams} onToggleFav={onToggleFav} odds={getOdds(g)} />)}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────

type LeagueFilter = 'All' | 'NFL' | 'CFB'
type StatusFilter = 'All' | 'Live' | 'Final' | 'Upcoming'

export function LiveScoresView() {
  const { profile } = useAppStore()

  const [leagueFilter, setLeagueFilter] = useState<LeagueFilter>('All')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    (localStorage.getItem(VIEW_KEY) as ViewMode | null) ?? 'grid')
  const [cols, setCols] = useState<ColCount>(() =>
    (Number(localStorage.getItem(COLS_KEY)) as ColCount | 0) || 4)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [manualFavs, setManualFavs] = useState<Set<string>>(loadFavs)

  const profileAbbrs = new Set<string>(
    [profile?.favorite_nfl_team, profile?.favorite_cfb_team]
      .filter(Boolean)
      .flatMap(t => [t as string, toAbbr(t as string)])
  )
  const favTeams = new Set([...profileAbbrs, ...manualFavs])
  const profileDisplayCount = [profile?.favorite_nfl_team, profile?.favorite_cfb_team].filter(Boolean).length
  const manualExtra = [...manualFavs].filter(t => !profileAbbrs.has(t)).length
  const favCount = profileDisplayCount + manualExtra

  useEffect(() => { localStorage.setItem(VIEW_KEY, viewMode) }, [viewMode])
  useEffect(() => { localStorage.setItem(COLS_KEY, String(cols)) }, [cols])

  const toggleFav = useCallback((abbr: string) => {
    setManualFavs(prev => {
      const next = new Set(prev)
      next.has(abbr) ? next.delete(abbr) : next.add(abbr)
      saveFavs(next)
      return next
    })
  }, [])

  const { data: oddsMap } = useNflOdds()

  const nflQuery = useQuery({
    queryKey: ['scores-nfl', refreshTick],
    queryFn: async () => { const g = await fetchLeague('NFL'); setLastUpdated(new Date()); return g },
    staleTime: 25_000, retry: 2,
  })
  const cfbQuery = useQuery({
    queryKey: ['scores-cfb', refreshTick],
    queryFn: async () => { const g = await fetchLeague('CFB'); setLastUpdated(new Date()); return g },
    staleTime: 25_000, retry: 2,
  })

  useEffect(() => {
    const all = [...(nflQuery.data ?? []), ...(cfbQuery.data ?? [])]
    const ms = all.some(g => g.status === 'in') ? 30_000 : 120_000
    const t = setTimeout(() => setRefreshTick(n => n + 1), ms)
    return () => clearTimeout(t)
  }, [nflQuery.data, cfbQuery.data])

  const allGames   = [...(nflQuery.data ?? []), ...(cfbQuery.data ?? [])]
  const isFetching = nflQuery.isFetching || cfbQuery.isFetching
  const hasError   = nflQuery.isError && cfbQuery.isError
  const liveCount  = allGames.filter(g => g.status === 'in').length
  const statusOrder: Record<string, number> = { in: 0, pre: 1, post: 2 }

  const favGames = allGames
    .filter(g => gameHasFav(favTeams, g))
    .sort((a, b) => (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1))

  const otherGames = allGames
    .filter(g => {
      if (gameHasFav(favTeams, g)) return false
      if (leagueFilter !== 'All' && g.league !== leagueFilter) return false
      if (statusFilter === 'Live'     && g.status !== 'in')   return false
      if (statusFilter === 'Final'    && g.status !== 'post') return false
      if (statusFilter === 'Upcoming' && g.status !== 'pre')  return false
      return true
    })
    .sort((a, b) => (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1))

  const sorted = [...favGames, ...otherGames]
  const sharedProps = { viewMode, cols, favTeams, onToggleFav: toggleFav, oddsMap }

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="section-title !mb-0">Live Scores</h1>
          {liveCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-2 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              {liveCount} Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-field-300">
              {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <button onClick={() => setRefreshTick(n => n + 1)} disabled={isFetching}
            className={clsx(
              'p-1.5 rounded-lg border border-field-700 text-field-400 hover:text-white hover:border-field-500 transition-colors',
              isFetching && 'animate-spin opacity-50 pointer-events-none',
            )}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Controls bar ── */}
      <div className="flex flex-wrap gap-2 items-center">

        {/* League filter — hidden in news mode */}
        {viewMode !== 'news' && (
          <div className="pill-tabs flex gap-0.5 bg-field-800 border border-field-700 rounded-lg p-0.5">
            {(['All', 'NFL', 'CFB'] as LeagueFilter[]).map(f => (
              <button key={f} onClick={() => setLeagueFilter(f)}
                className={clsx('font-cond font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded-md transition-colors',
                  leagueFilter === f
                    ? f === 'NFL' ? 'bg-nfl/20 text-nfl' : f === 'CFB' ? 'bg-cfb/20 text-cfb' : 'bg-field-700 text-white'
                    : 'text-field-400 hover:text-white')}>{f}</button>
            ))}
          </div>
        )}

        {/* Status filter — hidden in news mode */}
        {viewMode !== 'news' && (
          <div className="pill-tabs flex gap-0.5 bg-field-800 border border-field-700 rounded-lg p-0.5">
            {(['All', 'Live', 'Final', 'Upcoming'] as StatusFilter[]).map(f => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={clsx('font-cond font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded-md transition-colors',
                  statusFilter === f
                    ? f === 'Live' ? 'bg-red-500/20 text-red-400' : 'bg-field-700 text-white'
                    : 'text-field-400 hover:text-white')}>{f}</button>
            ))}
          </div>
        )}

        {/* View mode toggle — includes News */}
        <div className="pill-tabs flex gap-0.5 bg-field-800 border border-field-700 rounded-lg p-0.5">
          <button onClick={() => setViewMode('grid')} title="Grid view"
            className={clsx('flex items-center gap-1.5 font-cond font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded-md transition-colors',
              viewMode === 'grid' ? 'bg-field-700 text-white' : 'text-field-400 hover:text-white')}>
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Grid</span>
          </button>
          <button onClick={() => setViewMode('list')} title="List view"
            className={clsx('flex items-center gap-1.5 font-cond font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded-md transition-colors',
              viewMode === 'list' ? 'bg-field-700 text-white' : 'text-field-400 hover:text-white')}>
            <List className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">List</span>
          </button>
          <button onClick={() => setViewMode('news')} title="News feed"
            className={clsx('flex items-center gap-1.5 font-cond font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded-md transition-colors',
              viewMode === 'news' ? 'bg-field-700 text-white' : 'text-field-400 hover:text-white')}>
            <Newspaper className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">News</span>
          </button>
        </div>

        {/* Columns picker — grid mode only */}
        {viewMode === 'grid' && <ColsPicker value={cols} onChange={setCols} />}

        {favCount > 0 && viewMode !== 'news' && (
          <span className="text-xs text-gold flex items-center gap-1 ml-1">
            <Star className="w-3 h-3 fill-gold" />
            {favCount} favorited
          </span>
        )}
      </div>

      {/* ── News view ── */}
      {viewMode === 'news' && <NewsView />}

      {/* ── Scores views ── */}
      {viewMode !== 'news' && (
        <>
          {/* Profile favorites notice */}
          {(profile?.favorite_nfl_team || profile?.favorite_cfb_team) && (
            <div className="flex items-center gap-2 text-xs text-field-300 bg-field-800/40 border border-field-700/50 rounded-lg px-3 py-2">
              <Star className="w-3 h-3 text-gold fill-gold shrink-0" />
              <span>Auto-pinned:
                {profile.favorite_nfl_team && <span className="text-nfl font-bold ml-1">{profile.favorite_nfl_team}</span>}
                {profile.favorite_nfl_team && profile.favorite_cfb_team && <span className="text-field-500 mx-1">·</span>}
                {profile.favorite_cfb_team && <span className="text-cfb font-bold">{profile.favorite_cfb_team}</span>}
              </span>
            </div>
          )}

          {hasError && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <WifiOff className="w-4 h-4 shrink-0" />
              <div>
                <p className="font-bold">Could not load scores</p>
                <p className="text-xs text-red-400/70 mt-0.5">ESPN scores API unavailable. Try refreshing.</p>
              </div>
            </div>
          )}

          {isFetching && allGames.length === 0 && (
            viewMode === 'list'
              ? <div className="space-y-2">{Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="bg-field-800 border border-field-700 rounded-xl h-12 animate-pulse" />
                ))}</div>
              : <div className={clsx('grid gap-3', GRID_COLS[cols])}>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="bg-field-800 border border-field-700 rounded-xl h-28 animate-pulse" />
                  ))}
                </div>
          )}

          {!isFetching && !hasError && allGames.length === 0 && (
            <div className="panel text-center py-14 space-y-2">
              <div className="text-4xl">🏈</div>
              <p className="text-white font-bold text-lg">No games today</p>
              <p className="text-field-300 text-sm">Check back on game days — scores update live</p>
            </div>
          )}

          {!isFetching && !hasError && allGames.length > 0 && sorted.length === 0 && (
            <div className="panel text-center py-8">
              <p className="text-field-300 text-sm">No games match the selected filters</p>
            </div>
          )}

          {sorted.length > 0 && (
            <div className="space-y-5">
              {favGames.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="w-3.5 h-3.5 text-gold fill-gold" />
                    <span className="font-cond font-bold text-xs uppercase tracking-wider text-gold">My Teams</span>
                  </div>
                  <GameGroup games={favGames} {...sharedProps} />
                </div>
              )}
              {otherGames.length > 0 && (
                <div>
                  {favGames.length > 0 && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-cond font-bold text-xs uppercase tracking-wider text-field-300">All Games</span>
                      <span className="text-xs text-field-400">tap ⭐ to favorite a team</span>
                    </div>
                  )}
                  <GameGroup games={otherGames} {...sharedProps} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
