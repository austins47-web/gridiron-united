import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import { Trophy, ChevronLeft, ChevronRight, Lock, Check, X, Target } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

// NFL team logos / colors map
const TEAM_INFO: Record<string, { name: string; color: string; emoji: string }> = {
  ARI: { name: 'Arizona Cardinals',      color: '#97233F', emoji: '🔴' },
  ATL: { name: 'Atlanta Falcons',        color: '#A71930', emoji: '🔴' },
  BAL: { name: 'Baltimore Ravens',       color: '#241773', emoji: '🟣' },
  BUF: { name: 'Buffalo Bills',          color: '#00338D', emoji: '🔵' },
  CAR: { name: 'Carolina Panthers',      color: '#0085CA', emoji: '🔵' },
  CHI: { name: 'Chicago Bears',          color: '#0B162A', emoji: '🐻' },
  CIN: { name: 'Cincinnati Bengals',     color: '#FB4F14', emoji: '🟠' },
  CLE: { name: 'Cleveland Browns',       color: '#311D00', emoji: '🟤' },
  DAL: { name: 'Dallas Cowboys',         color: '#003594', emoji: '⭐' },
  DEN: { name: 'Denver Broncos',         color: '#FB4F14', emoji: '🟠' },
  DET: { name: 'Detroit Lions',          color: '#0076B6', emoji: '🔵' },
  GB:  { name: 'Green Bay Packers',      color: '#203731', emoji: '🟢' },
  HOU: { name: 'Houston Texans',         color: '#03202F', emoji: '🔵' },
  IND: { name: 'Indianapolis Colts',     color: '#002C5F', emoji: '🔵' },
  JAX: { name: 'Jacksonville Jaguars',   color: '#006778', emoji: '🟢' },
  KC:  { name: 'Kansas City Chiefs',     color: '#E31837', emoji: '🔴' },
  LAC: { name: 'LA Chargers',            color: '#0080C6', emoji: '🔵' },
  LAR: { name: 'LA Rams',               color: '#003594', emoji: '🔵' },
  LV:  { name: 'Las Vegas Raiders',      color: '#000000', emoji: '⚫' },
  MIA: { name: 'Miami Dolphins',         color: '#008E97', emoji: '🐬' },
  MIN: { name: 'Minnesota Vikings',      color: '#4F2683', emoji: '🟣' },
  NE:  { name: 'New England Patriots',   color: '#002244', emoji: '🔵' },
  NO:  { name: 'New Orleans Saints',     color: '#D3BC8D', emoji: '⚜️' },
  NYG: { name: 'NY Giants',             color: '#0B2265', emoji: '🔵' },
  NYJ: { name: 'NY Jets',               color: '#125740', emoji: '🟢' },
  PHI: { name: 'Philadelphia Eagles',    color: '#004C54', emoji: '🦅' },
  PIT: { name: 'Pittsburgh Steelers',    color: '#FFB612', emoji: '🟡' },
  SF:  { name: 'San Francisco 49ers',    color: '#AA0000', emoji: '🔴' },
  SEA: { name: 'Seattle Seahawks',       color: '#002244', emoji: '🔵' },
  TB:  { name: 'Tampa Bay Buccaneers',   color: '#D50A0A', emoji: '🔴' },
  TEN: { name: 'Tennessee Titans',       color: '#0C2340', emoji: '🔵' },
  WSH: { name: 'Washington Commanders', color: '#5A1414', emoji: '🔴' },
}

const CURRENT_WEEK = getCurrentNFLWeek()

function getCurrentNFLWeek(): number {
  const now = new Date()
  const seasonStart = new Date('2025-09-04')
  if (now < seasonStart) return 1
  const diff = Math.floor((now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
  return Math.min(18, Math.max(1, diff + 1))
}

function isGameLocked(gameDate: string | null): boolean {
  if (!gameDate) return false
  return new Date(gameDate) <= new Date()
}

export function PickEmView() {
  const { activeLeagueId, activeLeague, user } = useAppStore()
  const qc = useQueryClient()
  const [week, setWeek] = useState(CURRENT_WEEK)
  const [tab, setTab] = useState<'picks' | 'standings' | 'results'>('picks')
  const [pendingPicks, setPendingPicks] = useState<Record<string, string>>({}) // gameId → team
  const [tiebreakerScore, setTiebreakerScore] = useState<Record<string, string>>({}) // gameId → score
  const [saving, setSaving] = useState(false)

  // Games for this week
  const { data: games = [] } = useQuery({
    queryKey: ['nfl-games', week],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nfl_games')
        .select('*')
        .eq('season', 2025)
        .eq('week', week)
        .order('game_date', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  // My existing picks for this week
  const { data: myPicks = [] } = useQuery({
    queryKey: ['my-pickem-picks', activeLeagueId, week],
    enabled: !!activeLeagueId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pickem_picks')
        .select('*')
        .eq('league_id', activeLeagueId!)
        .eq('user_id', user!.id)
        .eq('week', week)
        .eq('season', 2025)
      if (error) throw error
      return data ?? []
    },
  })

  // Standings
  const { data: standings = [] } = useQuery({
    queryKey: ['pickem-standings', activeLeagueId],
    enabled: !!activeLeagueId && tab === 'standings',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pickem_standings')
        .select('*, profile:profiles(username, display_name)')
        .eq('league_id', activeLeagueId!)
        .eq('season', 2025)
        .order('total_correct', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  // Sync pending picks from saved picks
  useEffect(() => {
    const existing: Record<string, string> = {}
    const existingTb: Record<string, string> = {}
    myPicks.forEach((p: any) => {
      existing[p.game_id] = p.picked_team
      if (p.tiebreaker_score != null) existingTb[p.game_id] = String(p.tiebreaker_score)
    })
    setPendingPicks(existing)
    setTiebreakerScore(existingTb)
  }, [myPicks])

  const savePicks = async () => {
    if (!activeLeagueId || !user) return
    setSaving(true)
    try {
      const rows = Object.entries(pendingPicks).map(([gameId, team]) => ({
        league_id: activeLeagueId,
        user_id: user.id,
        game_id: gameId,
        week,
        season: 2025,
        picked_team: team,
        tiebreaker_score: tiebreakerScore[gameId] ? parseInt(tiebreakerScore[gameId]) : null,
      }))

      const { error } = await supabase
        .from('pickem_picks')
        .upsert(rows, { onConflict: 'league_id,user_id,game_id' })
      if (error) throw error

      qc.invalidateQueries({ queryKey: ['my-pickem-picks', activeLeagueId, week] })
      toast.success('Picks saved!')
    } catch (e: any) {
      toast.error('Failed to save picks: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const tiebreakerGame = games.find((g: any) => g.is_tiebreaker)
  const regularGames = games.filter((g: any) => !g.is_tiebreaker)
  const lockedCount = games.filter((g: any) => isGameLocked(g.game_date)).length
  const pickedCount = Object.keys(pendingPicks).filter(id => games.some((g: any) => g.id === id)).length
  const totalGames = games.length

  if (!activeLeagueId || activeLeague?.league_type !== 'pickem') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <Trophy className="w-12 h-12 text-gold/40 mx-auto mb-4" />
        <h2 className="text-white font-bold text-lg mb-2">Pick'Em League</h2>
        <p className="text-field-400">Select a Pick'Em league to make your picks.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Pick'Em</h1>
          <p className="text-field-400 text-sm">{activeLeague.name} · 2025 Season</p>
        </div>
        <div className="flex items-center gap-2 bg-field-800 border border-field-700 rounded-xl px-4 py-2">
          <span className="text-field-300 text-sm font-bold">{pickedCount}/{totalGames} picked</span>
          {pickedCount === totalGames && totalGames > 0 && (
            <Check className="w-4 h-4 text-emerald-400" />
          )}
        </div>
      </div>

      {/* Week selector + tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeek(w => Math.max(1, w - 1))}
            disabled={week <= 1}
            className="btn-ghost !py-1.5 !px-2 disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-cond font-black text-white text-lg uppercase tracking-wider min-w-[80px] text-center">
            Week {week}
          </span>
          <button
            onClick={() => setWeek(w => Math.min(18, w + 1))}
            disabled={week >= 18}
            className="btn-ghost !py-1.5 !px-2 disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-1">
          {(['picks', 'standings', 'results'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'font-cond font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-colors',
                tab === t
                  ? 'border-gold/50 text-gold bg-gold/10'
                  : 'border-field-600 text-field-400 bg-field-800 hover:text-white',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── PICKS TAB ── */}
      {tab === 'picks' && (
        <div className="space-y-3">
          {lockedCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-field-400 bg-field-800/50 border border-field-700 rounded-lg px-3 py-2">
              <Lock className="w-3.5 h-3.5" />
              <span>{lockedCount} game{lockedCount !== 1 ? 's' : ''} locked — picks can't be changed after kickoff</span>
            </div>
          )}

          {games.length === 0 && (
            <div className="panel text-center py-8">
              <p className="text-field-400">No games scheduled for Week {week}</p>
            </div>
          )}

          {/* Regular games */}
          {regularGames.map((game: any) => (
            <GamePickCard
              key={game.id}
              game={game}
              pickedTeam={pendingPicks[game.id]}
              onPick={(team) => {
                if (isGameLocked(game.game_date)) return
                setPendingPicks(p => ({ ...p, [game.id]: team }))
              }}
            />
          ))}

          {/* Tiebreaker */}
          {tiebreakerGame && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-gold" />
                <span className="font-cond font-bold text-gold text-sm uppercase tracking-wider">Tiebreaker Game</span>
                <span className="text-field-400 text-xs">— Predict total combined points scored</span>
              </div>
              <GamePickCard
                key={tiebreakerGame.id}
                game={tiebreakerGame}
                pickedTeam={pendingPicks[tiebreakerGame.id]}
                onPick={(team) => {
                  if (isGameLocked(tiebreakerGame.game_date)) return
                  setPendingPicks(p => ({ ...p, [tiebreakerGame.id]: team }))
                }}
                isTiebreaker
                tiebreakerScore={tiebreakerScore[tiebreakerGame.id] ?? ''}
                onTiebreakerScore={(val) => {
                  setTiebreakerScore(s => ({ ...s, [tiebreakerGame.id]: val }))
                }}
              />
            </div>
          )}

          {/* Save button */}
          <div className="pt-2">
            <button
              className="btn-gold w-full py-3 text-base"
              onClick={savePicks}
              disabled={saving || pickedCount === 0}
            >
              {saving ? 'Saving…' : `Save Picks (${pickedCount}/${totalGames})`}
            </button>
          </div>
        </div>
      )}

      {/* ── STANDINGS TAB ── */}
      {tab === 'standings' && (
        <div className="panel !p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-field-700 flex items-center justify-between">
            <span className="font-bold text-white">Season Standings</span>
            <span className="text-field-400 text-xs">2025 NFL Season</span>
          </div>
          {standings.length === 0 ? (
            <div className="text-center py-8 text-field-400 text-sm">No picks submitted yet</div>
          ) : (
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th className="w-8">#</th>
                  <th>Team</th>
                  <th className="text-center">Correct</th>
                  <th className="text-center">Total</th>
                  <th className="text-center">Pct</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s: any, i: number) => (
                  <tr key={s.id} className={s.user_id === user?.id ? 'bg-gold/[0.04]' : ''}>
                    <td className="text-field-400 font-bold">{i + 1}</td>
                    <td>
                      <div className="font-bold text-white">
                        {s.profile?.display_name || s.profile?.username}
                        {s.user_id === user?.id && <span className="ml-1.5 text-[10px] text-gold font-bold">(you)</span>}
                      </div>
                    </td>
                    <td className="text-center text-white font-bold">{s.total_correct}</td>
                    <td className="text-center text-field-400">{s.total_picks}</td>
                    <td className="text-center text-gold font-bold">
                      {s.total_picks > 0 ? `${Math.round((s.total_correct / s.total_picks) * 100)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── RESULTS TAB ── */}
      {tab === 'results' && (
        <div className="space-y-3">
          {games.filter((g: any) => g.status === 'final').length === 0 ? (
            <div className="panel text-center py-8">
              <p className="text-field-400">No final results yet for Week {week}</p>
            </div>
          ) : (
            games.filter((g: any) => g.status === 'final').map((game: any) => {
              const myPick = myPicks.find((p: any) => p.game_id === game.id)
              const winner = game.home_score > game.away_score ? game.home_team
                : game.away_score > game.home_score ? game.away_team : 'TIE'
              const correct = myPick?.picked_team === winner
              return (
                <div key={game.id} className={clsx(
                  'panel flex items-center justify-between gap-4',
                  correct ? 'border-emerald-500/30 bg-emerald-500/5' : myPick ? 'border-red-500/20 bg-red-500/5' : '',
                )}>
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <div className="font-cond font-bold text-white text-sm">{game.away_team}</div>
                      <div className="text-2xl font-black text-white">{game.away_score ?? '—'}</div>
                    </div>
                    <div className="text-field-400 font-bold text-sm">@</div>
                    <div className="text-center">
                      <div className="font-cond font-bold text-white text-sm">{game.home_team}</div>
                      <div className="text-2xl font-black text-white">{game.home_score ?? '—'}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    {myPick ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-field-300">Picked: <span className="font-bold text-white">{myPick.picked_team}</span></span>
                        {correct
                          ? <Check className="w-5 h-5 text-emerald-400" />
                          : <X className="w-5 h-5 text-red-400" />
                        }
                      </div>
                    ) : (
                      <span className="text-xs text-field-500 italic">No pick</span>
                    )}
                    {game.is_tiebreaker && myPick?.tiebreaker_score && (
                      <div className="text-xs text-field-400 mt-1">
                        TB guess: <span className="text-gold font-bold">{myPick.tiebreaker_score}</span>
                        {' '}(actual: <span className="text-white font-bold">{(game.home_score ?? 0) + (game.away_score ?? 0)}</span>)
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

function GamePickCard({
  game, pickedTeam, onPick, isTiebreaker, tiebreakerScore, onTiebreakerScore
}: {
  game: any
  pickedTeam: string | undefined
  onPick: (team: string) => void
  isTiebreaker?: boolean
  tiebreakerScore?: string
  onTiebreakerScore?: (val: string) => void
}) {
  const locked = isGameLocked(game.game_date)
  const gameTime = game.game_date ? new Date(game.game_date).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  }) : 'TBD'

  const homeInfo = TEAM_INFO[game.home_team] ?? { name: game.home_team, color: '#888', emoji: '🏈' }
  const awayInfo = TEAM_INFO[game.away_team] ?? { name: game.away_team, color: '#888', emoji: '🏈' }

  const isFinal = game.status === 'final'
  const winner = isFinal ? (
    game.home_score > game.away_score ? game.home_team :
    game.away_score > game.home_score ? game.away_team : 'TIE'
  ) : null

  return (
    <div className={clsx(
      'panel space-y-3',
      isTiebreaker && 'border-gold/30 bg-gold/[0.03]',
    )}>
      {/* Game time */}
      <div className="flex items-center justify-between">
        <span className="text-field-400 text-xs">{gameTime}</span>
        {locked && !isFinal && (
          <span className="flex items-center gap-1 text-xs text-yellow-400 font-bold">
            <Lock className="w-3 h-3" /> Locked
          </span>
        )}
        {isFinal && (
          <span className="text-xs text-emerald-400 font-bold">Final</span>
        )}
      </div>

      {/* Team buttons */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { team: game.away_team, info: awayInfo, label: 'Away' },
          { team: game.home_team, info: homeInfo, label: 'Home' },
        ].map(({ team, info, label }) => {
          const isPicked = pickedTeam === team
          const isWinner = winner === team
          const isLoser = isFinal && winner !== 'TIE' && winner !== team

          return (
            <button
              key={team}
              onClick={() => onPick(team)}
              disabled={locked}
              className={clsx(
                'relative flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-all font-bold',
                isPicked && !isFinal
                  ? 'border-gold bg-gold/15 text-gold scale-[1.02]'
                  : isPicked && isWinner
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                  : isPicked && isFinal && !isWinner
                  ? 'border-red-500/50 bg-red-500/10 text-red-400'
                  : isLoser
                  ? 'border-field-700 bg-field-800/50 text-field-600 opacity-50'
                  : 'border-field-600 bg-field-800 text-white hover:border-field-400 hover:bg-field-700',
                locked && !isPicked && 'cursor-not-allowed',
              )}
            >
              <span className="text-xs text-field-400 uppercase tracking-wider">{label}</span>
              <span className="text-2xl font-black tracking-wider">{team}</span>
              <span className="text-xs text-field-400 truncate max-w-full">{info.name.split(' ').slice(-1)[0]}</span>
              {isFinal && (
                <span className={clsx('text-lg font-black', isWinner ? 'text-white' : 'text-field-500')}>
                  {team === game.away_team ? game.away_score : game.home_score}
                </span>
              )}
              {isPicked && !isFinal && (
                <div className="absolute top-2 right-2">
                  <Check className="w-4 h-4 text-gold" />
                </div>
              )}
              {isPicked && isFinal && isWinner && (
                <div className="absolute top-2 right-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                </div>
              )}
              {isPicked && isFinal && !isWinner && (
                <div className="absolute top-2 right-2">
                  <X className="w-4 h-4 text-red-400" />
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Tiebreaker input */}
      {isTiebreaker && onTiebreakerScore && (
        <div className="border-t border-field-700 pt-3">
          <label className="label mb-1">
            <Target className="w-3.5 h-3.5 inline mr-1 text-gold" />
            Tiebreaker — predict total combined points scored in this game
          </label>
          <input
            type="number"
            min={0}
            max={200}
            placeholder="e.g. 47"
            value={tiebreakerScore ?? ''}
            onChange={e => onTiebreakerScore(e.target.value)}
            disabled={locked}
            className="input w-32 text-center text-lg font-bold"
          />
          <p className="text-field-500 text-xs mt-1">
            Used only to break ties when two players finish the week with the same number of correct picks.
          </p>
        </div>
      )}
    </div>
  )
}
