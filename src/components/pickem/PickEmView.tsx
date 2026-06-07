import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import {
  Trophy, ChevronDown, Lock, Check, X, Target, Settings, Clock, Calendar, Users, Eye, EyeOff
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

const TEAM_INFO: Record<string, { name: string }> = {
  ARI: { name: 'Arizona Cardinals' },
  ATL: { name: 'Atlanta Falcons' },
  BAL: { name: 'Baltimore Ravens' },
  BUF: { name: 'Buffalo Bills' },
  CAR: { name: 'Carolina Panthers' },
  CHI: { name: 'Chicago Bears' },
  CIN: { name: 'Cincinnati Bengals' },
  CLE: { name: 'Cleveland Browns' },
  DAL: { name: 'Dallas Cowboys' },
  DEN: { name: 'Denver Broncos' },
  DET: { name: 'Detroit Lions' },
  GB:  { name: 'Green Bay Packers' },
  HOU: { name: 'Houston Texans' },
  IND: { name: 'Indianapolis Colts' },
  JAX: { name: 'Jacksonville Jaguars' },
  KC:  { name: 'Kansas City Chiefs' },
  LAC: { name: 'LA Chargers' },
  LAR: { name: 'LA Rams' },
  LV:  { name: 'Las Vegas Raiders' },
  MIA: { name: 'Miami Dolphins' },
  MIN: { name: 'Minnesota Vikings' },
  NE:  { name: 'New England Patriots' },
  NO:  { name: 'New Orleans Saints' },
  NYG: { name: 'NY Giants' },
  NYJ: { name: 'NY Jets' },
  PHI: { name: 'Philadelphia Eagles' },
  PIT: { name: 'Pittsburgh Steelers' },
  SF:  { name: 'San Francisco 49ers' },
  SEA: { name: 'Seattle Seahawks' },
  TB:  { name: 'Tampa Bay Buccaneers' },
  TEN: { name: 'Tennessee Titans' },
  WSH: { name: 'Washington Commanders' },
}

// Week 1 starts Sep 4 2025. Each week runs Thu–Mon.
// Week is "over" when the final MNF game (Mon ~10:15pm ET) has passed.
// Week boundaries (approximate Mon night end):
const WEEK_END_DATES: Record<number, string> = {
  1:  '2026-09-15T03:00:00Z', // Tue 3am UTC after Mon Sep 14 MNF
  2:  '2026-09-22T03:00:00Z',
  3:  '2026-09-29T03:00:00Z',
  4:  '2026-10-06T03:00:00Z',
  5:  '2026-10-13T03:00:00Z',
  6:  '2026-10-20T03:00:00Z',
  7:  '2026-10-27T03:00:00Z',
  8:  '2026-11-03T03:00:00Z',
  9:  '2026-11-10T03:00:00Z',
  10: '2026-11-17T03:00:00Z',
  11: '2026-11-24T03:00:00Z',
  12: '2026-12-01T03:00:00Z',
  13: '2026-12-08T03:00:00Z',
  14: '2026-12-15T03:00:00Z',
  15: '2026-12-22T03:00:00Z',
  16: '2026-12-29T03:00:00Z',
  17: '2027-01-06T03:00:00Z',
  18: '2027-01-11T03:00:00Z',
}

function getActiveWeek(): number {
  const now = new Date()
  // Before season starts → Week 1
  if (now < new Date('2026-09-09T00:00:00Z')) return 1
  for (let w = 1; w <= 18; w++) {
    const end = new Date(WEEK_END_DATES[w])
    if (now < end) return w
  }
  return 18
}

function isGameLocked(gameDate: string | null, deadline: string | null): boolean {
  if (!gameDate) return false
  const now = new Date()
  // If commissioner set a custom deadline, use whichever is earlier
  const kickoff = new Date(gameDate)
  if (deadline) {
    const dl = new Date(deadline)
    return now >= dl || now >= kickoff
  }
  return now >= kickoff
}

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })
}

export function PickEmView() {
  const { activeLeagueId, activeLeague, user, myMembership } = useAppStore()
  const qc = useQueryClient()
  const isCommissioner = myMembership?.is_commissioner

  const activeWeek = getActiveWeek()
  const [week, setWeek] = useState(activeWeek)
  const [weekDropdownOpen, setWeekDropdownOpen] = useState(false)
  const [tab, setTab] = useState<'picks' | 'standings' | 'results'>('picks')
  const [pendingPicks, setPendingPicks] = useState<Record<string, string>>({})
  const [tiebreakerScore, setTiebreakerScore] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [showDeadlineEditor, setShowDeadlineEditor] = useState(false)
  const [deadlineInput, setDeadlineInput] = useState('')
  const [savingDeadline, setSavingDeadline] = useState(false)

  // League-level pick deadline (stored in league settings via a separate table or reusing existing)
  const { data: leagueSettings, refetch: refetchSettings } = useQuery({
    queryKey: ['pickem-settings', activeLeagueId, week],
    enabled: !!activeLeagueId,
    queryFn: async () => {
      const { data } = await supabase
        .from('pickem_week_settings')
        .select('*')
        .eq('league_id', activeLeagueId!)
        .eq('week', week)
        .eq('season', 2026)
        .maybeSingle()
      return data
    },
  })

  const weekDeadline = leagueSettings?.pick_deadline ?? null

  // Games for this week
  const { data: games = [] } = useQuery({
    queryKey: ['nfl-games', week],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nfl_games')
        .select('*')
        .eq('season', 2026)
        .eq('week', week)
        .order('game_date', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  // My picks for this week
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
        .eq('season', 2026)
      if (error) throw error
      return data ?? []
    },
  })

  // All league members' picks for this week (revealed only after each game kicks off)
  const { data: allPicks = [] } = useQuery({
    queryKey: ['all-pickem-picks', activeLeagueId, week],
    enabled: !!activeLeagueId && tab === 'results',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pickem_picks')
        .select('*, profile:profiles(username, display_name)')
        .eq('league_id', activeLeagueId!)
        .eq('week', week)
        .eq('season', 2026)
      if (error) throw error
      return data ?? []
    },
    refetchInterval: 30_000, // refresh every 30s during live games
  })

  // League members for display
  const { data: leagueMembers = [] } = useQuery({
    queryKey: ['league-members-list', activeLeagueId],
    enabled: !!activeLeagueId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('league_members')
        .select('user_id, profile:profiles(username, display_name)')
        .eq('league_id', activeLeagueId!)
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
        .eq('season', 2026)
        .order('total_correct', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  // Sync picks into state
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

  // Sync deadline input when editor opens
  useEffect(() => {
    if (showDeadlineEditor && weekDeadline) {
      // Convert UTC to local datetime-local format
      const d = new Date(weekDeadline)
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString().slice(0, 16)
      setDeadlineInput(local)
    } else if (showDeadlineEditor) {
      // Default to first game of the week
      const firstGame = games[0]
      if (firstGame?.game_date) {
        const d = new Date(firstGame.game_date)
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString().slice(0, 16)
        setDeadlineInput(local)
      }
    }
  }, [showDeadlineEditor, weekDeadline, games])

  const saveDeadline = async () => {
    if (!activeLeagueId || !deadlineInput) return
    setSavingDeadline(true)
    try {
      const isoDeadline = new Date(deadlineInput).toISOString()
      const { error } = await supabase
        .from('pickem_week_settings')
        .upsert({
          league_id: activeLeagueId,
          week,
          season: 2026,
          pick_deadline: isoDeadline,
        }, { onConflict: 'league_id,week,season' })
      if (error) throw error
      await refetchSettings()
      toast.success(`Deadline set for Week ${week}`)
      setShowDeadlineEditor(false)
    } catch (e: any) {
      toast.error('Failed to save deadline: ' + e.message)
    } finally {
      setSavingDeadline(false)
    }
  }

  const clearDeadline = async () => {
    if (!activeLeagueId) return
    try {
      await supabase
        .from('pickem_week_settings')
        .upsert({
          league_id: activeLeagueId,
          week,
          season: 2026,
          pick_deadline: null,
        }, { onConflict: 'league_id,week,season' })
      await refetchSettings()
      toast.success('Deadline cleared — picks lock at kickoff')
      setShowDeadlineEditor(false)
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const savePicks = async () => {
    if (!activeLeagueId || !user) return
    setSaving(true)
    try {
      const rows = Object.entries(pendingPicks).map(([gameId, team]) => ({
        league_id: activeLeagueId,
        user_id: user.id,
        game_id: gameId,
        week,
        season: 2026,
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
  const lockedCount = games.filter((g: any) => isGameLocked(g.game_date, weekDeadline)).length
  const pickedCount = Object.keys(pendingPicks).filter(id => games.some((g: any) => g.id === id)).length
  const totalGames = games.length

  // Determine if the whole week is still open for picks
  const anyUnlocked = games.some((g: any) => !isGameLocked(g.game_date, weekDeadline))

  if (!activeLeagueId || activeLeague?.league_type !== 'pickem') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <Trophy className="w-12 h-12 text-gold/40 mx-auto mb-4" />
        <h2 className="text-white font-bold text-lg mb-2">Pick'Em</h2>
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
          <p className="text-field-400 text-sm">{activeLeague.name} · 2026 NFL Season</p>
        </div>
        <div className="flex items-center gap-2">
          {pickedCount > 0 && (
            <div className={clsx(
              'flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold border',
              pickedCount === totalGames
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-field-800 border-field-700 text-field-300'
            )}>
              {pickedCount === totalGames && <Check className="w-3.5 h-3.5" />}
              {pickedCount}/{totalGames} picked
            </div>
          )}
        </div>
      </div>

      {/* Week selector dropdown + tabs */}
      <div className="flex items-center justify-between gap-3">

        {/* Week dropdown */}
        <div className="relative">
          <button
            onClick={() => setWeekDropdownOpen(o => !o)}
            className="flex items-center gap-2 bg-field-800 border border-field-600 rounded-xl px-4 py-2.5 hover:border-field-500 transition-colors"
          >
            <Calendar className="w-4 h-4 text-field-400" />
            <span className="font-cond font-black text-white text-base uppercase tracking-wider">
              Week {week}
            </span>
            {week === activeWeek && (
              <span className="text-[10px] font-bold text-gold bg-gold/10 border border-gold/30 rounded px-1.5 py-0.5 uppercase tracking-wider">
                Current
              </span>
            )}
            <ChevronDown className="w-4 h-4 text-field-400" />
          </button>

          {weekDropdownOpen && (
            <div className="absolute left-0 top-full mt-1 z-30 bg-field-800 border border-field-600 rounded-xl overflow-hidden shadow-2xl w-48">
              <div className="px-3 py-2 border-b border-field-700">
                <span className="text-field-400 text-xs font-bold uppercase tracking-wider">Select Week</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {Array.from({ length: 18 }, (_, i) => i + 1).map(w => {
                  const isOver = new Date() >= new Date(WEEK_END_DATES[w])
                  const isCurrent = w === activeWeek
                  return (
                    <button
                      key={w}
                      onClick={() => { setWeek(w); setWeekDropdownOpen(false) }}
                      className={clsx(
                        'w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors',
                        week === w
                          ? 'bg-gold/10 text-gold'
                          : 'text-field-200 hover:bg-field-700',
                      )}
                    >
                      <span className="font-cond font-bold text-sm">Week {w}</span>
                      <span className={clsx('text-[10px] font-bold uppercase tracking-wider', 
                        isCurrent ? 'text-gold' : isOver ? 'text-field-500' : 'text-emerald-400'
                      )}>
                        {isCurrent ? 'Current' : isOver ? 'Complete' : 'Upcoming'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {(['picks', 'standings', 'results'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'font-cond font-bold text-xs uppercase tracking-wider px-3 py-2 rounded-lg border transition-colors',
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

      {/* Deadline banner */}
      {weekDeadline && (
        <div className="flex items-center gap-2 text-xs bg-field-800/60 border border-field-700 rounded-lg px-3 py-2">
          <Clock className="w-3.5 h-3.5 text-gold shrink-0" />
          <span className="text-field-300">
            <span className="text-gold font-bold">Pick deadline:</span> {formatDeadline(weekDeadline)}
          </span>
          {isCommissioner && (
            <button
              onClick={() => setShowDeadlineEditor(true)}
              className="ml-auto text-field-500 hover:text-gold transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Commissioner tools */}
      {isCommissioner && !weekDeadline && (
        <div className="flex items-center justify-between bg-field-800/40 border border-field-700/50 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-field-400">
            <Settings className="w-3.5 h-3.5" />
            <span>Commissioner — picks currently lock at each game's kickoff</span>
          </div>
          <button
            onClick={() => setShowDeadlineEditor(true)}
            className="text-xs font-bold text-gold hover:text-gold-light transition-colors ml-3 whitespace-nowrap"
          >
            Set deadline
          </button>
        </div>
      )}

      {/* Deadline editor modal */}
      {showDeadlineEditor && (
        <div className="modal-overlay" onClick={() => setShowDeadlineEditor(false)}>
          <div className="modal-box modal-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-gold" />
              <h2 className="font-cond font-black text-lg text-white uppercase tracking-wider">
                Week {week} Pick Deadline
              </h2>
            </div>
            <p className="text-field-400 text-sm mb-4">
              Set a single deadline for all Week {week} picks. After this time, no picks can be submitted or changed — even for games that haven't started yet.
            </p>
            <label className="label">Deadline (your local time)</label>
            <input
              type="datetime-local"
              value={deadlineInput}
              onChange={e => setDeadlineInput(e.target.value)}
              className="input mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={saveDeadline}
                disabled={savingDeadline || !deadlineInput}
                className="btn-gold flex-1"
              >
                {savingDeadline ? 'Saving…' : 'Set Deadline'}
              </button>
              {weekDeadline && (
                <button onClick={clearDeadline} className="btn-ghost">
                  Clear
                </button>
              )}
              <button onClick={() => setShowDeadlineEditor(false)} className="btn-ghost">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close dropdown when clicking outside */}
      {weekDropdownOpen && (
        <div className="fixed inset-0 z-20" onClick={() => setWeekDropdownOpen(false)} />
      )}

      {/* ── PICKS TAB ── */}
      {tab === 'picks' && (
        <div className="space-y-3">
          {lockedCount > 0 && lockedCount < totalGames && (
            <div className="flex items-center gap-2 text-xs text-yellow-400/80 bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>{lockedCount} of {totalGames} games locked</span>
            </div>
          )}
          {lockedCount === totalGames && totalGames > 0 && (
            <div className="flex items-center gap-2 text-xs text-field-400 bg-field-800/50 border border-field-700 rounded-lg px-3 py-2">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>All picks are locked for Week {week}</span>
            </div>
          )}

          {games.length === 0 && (
            <div className="panel text-center py-8">
              <p className="text-field-400">No games scheduled for Week {week}</p>
            </div>
          )}

          {regularGames.map((game: any) => (
            <GamePickCard
              key={game.id}
              game={game}
              pickedTeam={pendingPicks[game.id]}
              deadline={weekDeadline}
              onPick={(team) => {
                if (isGameLocked(game.game_date, weekDeadline)) return
                setPendingPicks(p => ({ ...p, [game.id]: team }))
              }}
            />
          ))}

          {tiebreakerGame && (
            <div className="mt-2">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-gold" />
                <span className="font-cond font-bold text-gold text-sm uppercase tracking-wider">Tiebreaker</span>
                <span className="text-field-500 text-xs">— predict total combined score</span>
              </div>
              <GamePickCard
                key={tiebreakerGame.id}
                game={tiebreakerGame}
                pickedTeam={pendingPicks[tiebreakerGame.id]}
                deadline={weekDeadline}
                onPick={(team) => {
                  if (isGameLocked(tiebreakerGame.game_date, weekDeadline)) return
                  setPendingPicks(p => ({ ...p, [tiebreakerGame.id]: team }))
                }}
                isTiebreaker
                tiebreakerScore={tiebreakerScore[tiebreakerGame.id] ?? ''}
                onTiebreakerScore={(val) => setTiebreakerScore(s => ({ ...s, [tiebreakerGame.id]: val }))}
              />
            </div>
          )}

          {anyUnlocked && (
            <div className="pt-1">
              <button
                className="btn-gold w-full py-3 text-base"
                onClick={savePicks}
                disabled={saving || pickedCount === 0}
              >
                {saving ? 'Saving…' : `Save Picks (${pickedCount}/${totalGames})`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── STANDINGS TAB ── */}
      {tab === 'standings' && (
        <div className="panel !p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-field-700 flex items-center justify-between">
            <span className="font-bold text-white">Season Standings</span>
            <span className="text-field-400 text-xs">2026 NFL Season</span>
          </div>
          {standings.length === 0 ? (
            <div className="text-center py-8 text-field-400 text-sm">No picks submitted yet</div>
          ) : (
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th className="w-8">#</th>
                  <th>Player</th>
                  <th className="text-center">Correct</th>
                  <th className="text-center">Total</th>
                  <th className="text-center">%</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s: any, i: number) => (
                  <tr key={s.id} className={s.user_id === user?.id ? 'bg-gold/[0.04]' : ''}>
                    <td className="text-field-400 font-bold">{i + 1}</td>
                    <td>
                      <span className="font-bold text-white">
                        {s.profile?.display_name || s.profile?.username}
                      </span>
                      {s.user_id === user?.id && (
                        <span className="ml-1.5 text-[10px] text-gold font-bold">(you)</span>
                      )}
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
        <PicksChart
          games={games}
          allPicks={allPicks}
          myPicks={myPicks}
          leagueMembers={leagueMembers}
          userId={user?.id}
          deadline={weekDeadline}
          week={week}
        />
      )}
    </div>
  )
}

function GamePickCard({
  game, pickedTeam, onPick, deadline, isTiebreaker, tiebreakerScore, onTiebreakerScore
}: {
  game: any
  pickedTeam: string | undefined
  onPick: (team: string) => void
  deadline: string | null
  isTiebreaker?: boolean
  tiebreakerScore?: string
  onTiebreakerScore?: (val: string) => void
}) {
  const locked = isGameLocked(game.game_date, deadline)
  const gameTime = game.game_date
    ? new Date(game.game_date).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      })
    : 'TBD'

  const homeInfo = TEAM_INFO[game.home_team] ?? { name: game.home_team }
  const awayInfo = TEAM_INFO[game.away_team] ?? { name: game.away_team }
  const isFinal = game.status === 'final'
  const winner = isFinal
    ? game.home_score > game.away_score ? game.home_team
      : game.away_score > game.home_score ? game.away_team
      : 'TIE'
    : null

  return (
    <div className={clsx('panel space-y-3', isTiebreaker && 'border-gold/30 bg-gold/[0.02]')}>
      <div className="flex items-center justify-between">
        <span className="text-field-400 text-xs">{gameTime}</span>
        {locked && !isFinal && (
          <span className="flex items-center gap-1 text-xs text-yellow-400 font-bold">
            <Lock className="w-3 h-3" /> Locked
          </span>
        )}
        {isFinal && <span className="text-xs text-emerald-400 font-bold">Final</span>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { team: game.away_team, info: awayInfo, label: 'Away', score: game.away_score },
          { team: game.home_team, info: homeInfo, label: 'Home', score: game.home_score },
        ].map(({ team, info, label, score }) => {
          const isPicked = pickedTeam === team
          const isWinner = winner === team
          const isLoser = isFinal && winner !== 'TIE' && winner !== team

          return (
            <button
              key={team}
              onClick={() => onPick(team)}
              disabled={locked}
              className={clsx(
                'relative flex flex-col items-center gap-1 p-4 rounded-xl border-2 transition-all',
                isPicked && !isFinal
                  ? 'border-gold bg-gold/15 text-gold scale-[1.02]'
                  : isPicked && isWinner
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                  : isPicked && isFinal && !isWinner
                  ? 'border-red-500/40 bg-red-500/10 text-red-400'
                  : isLoser
                  ? 'border-field-700 bg-field-800/40 text-field-600 opacity-40'
                  : 'border-field-600 bg-field-800 text-white hover:border-field-400 hover:bg-field-700',
                locked && !isPicked && 'cursor-not-allowed',
              )}
            >
              <span className="text-[10px] text-field-500 uppercase tracking-wider">{label}</span>
              <span className="text-2xl font-black tracking-wide">{team}</span>
              <span className="text-[11px] text-field-400 truncate max-w-full">
                {info.name.split(' ').slice(-1)[0]}
              </span>
              {isFinal && (
                <span className={clsx('text-xl font-black mt-0.5', isWinner ? 'text-white' : 'text-field-600')}>
                  {score ?? '—'}
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

      {isTiebreaker && onTiebreakerScore && (
        <div className="border-t border-field-700 pt-3 space-y-1">
          <label className="label">
            <Target className="w-3.5 h-3.5 inline mr-1 text-gold" />
            Tiebreaker — combined total points scored
          </label>
          <input
            type="number"
            min={0}
            max={200}
            placeholder="e.g. 47"
            value={tiebreakerScore ?? ''}
            onChange={e => onTiebreakerScore(e.target.value)}
            disabled={locked}
            className="input w-28 text-center text-lg font-bold"
          />
          <p className="text-field-500 text-xs">
            Closest guess wins when two players tie on correct picks.
          </p>
        </div>
      )}
    </div>
  )
}

// ── PICKS CHART ─────────────────────────────────────────────
// Shows every game for the week with a per-user pick grid.
// Other users' picks are hidden (🔒) until that game's kickoff.

function PicksChart({
  games, allPicks, myPicks, leagueMembers, userId, deadline, week
}: {
  games: any[]
  allPicks: any[]
  myPicks: any[]
  leagueMembers: any[]
  userId: string | undefined
  deadline: string | null
  week: number
}) {
  const now = new Date()

  if (games.length === 0) {
    return (
      <div className="panel text-center py-8">
        <p className="text-field-400">No games scheduled for Week {week}</p>
      </div>
    )
  }

  // Sort members: current user first, then alphabetical
  const sortedMembers = [...leagueMembers].sort((a, b) => {
    if (a.user_id === userId) return -1
    if (b.user_id === userId) return 1
    const nameA = a.profile?.display_name || a.profile?.username || ''
    const nameB = b.profile?.display_name || b.profile?.username || ''
    return nameA.localeCompare(nameB)
  })

  // Build pick lookup: { gameId: { userId: pickedTeam } }
  const pickMap: Record<string, Record<string, string>> = {}
  allPicks.forEach((p: any) => {
    if (!pickMap[p.game_id]) pickMap[p.game_id] = {}
    pickMap[p.game_id][p.user_id] = p.picked_team
  })

  // Sort games by date
  const sortedGames = [...games].sort(
    (a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime()
  )

  // Others' picks revealed after kickoff (or commissioner deadline)
  const isGameRevealed = (game: any): boolean => {
    const kickoff = new Date(game.game_date)
    if (deadline) {
      const dl = new Date(deadline)
      return now >= dl || now >= kickoff
    }
    return now >= kickoff
  }

  // Current user's own pick is always visible regardless of kickoff
  const isPickVisibleForUser = (_game: any, memberId: string): boolean => {
    return memberId === userId || isGameRevealed(_game)
  }

  // Count correct picks per user across all final games
  const userScores: Record<string, { correct: number; total: number }> = {}
  sortedMembers.forEach(m => {
    userScores[m.user_id] = { correct: 0, total: 0 }
  })
  sortedGames.forEach(game => {
    if (game.status !== 'final') return
    const winner = game.home_score > game.away_score ? game.home_team
      : game.away_score > game.home_score ? game.away_team : 'TIE'
    sortedMembers.forEach(m => {
      const picked = pickMap[game.id]?.[m.user_id]
      if (picked) {
        userScores[m.user_id].total++
        if (picked === winner) userScores[m.user_id].correct++
      }
    })
  })

  const hasAnyFinal = sortedGames.some(g => g.status === 'final')
  const hasAnyRevealed = sortedGames.some(g => isGameRevealed(g))

  return (
    <div className="space-y-2">
      {/* Info banner */}
      {!hasAnyRevealed && (
        <div className="flex items-center gap-2 text-xs text-field-400 bg-field-800/50 border border-field-700 rounded-lg px-3 py-1.5">
          <EyeOff className="w-3 h-3 shrink-0" />
          <span>Your picks are always visible — others' picks reveal at kickoff</span>
        </div>
      )}

      {/* Weekly scoreboard */}
      {hasAnyFinal && sortedMembers.length > 1 && (
        <div className="bg-field-800 border border-field-700 rounded-xl overflow-hidden">
          <div className="px-3 py-1.5 border-b border-field-700 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-gold" />
            <span className="font-cond font-bold text-xs text-white uppercase tracking-wider">Week {week}</span>
          </div>
          <div className="flex divide-x divide-field-700 overflow-x-auto">
            {sortedMembers.map((m) => {
              const score = userScores[m.user_id]
              const isMe = m.user_id === userId
              const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : null
              const name = isMe ? 'You' : (m.profile?.display_name || m.profile?.username || '?')
              return (
                <div key={m.user_id} className={clsx(
                  'flex flex-col items-center px-3 py-2 min-w-[70px]',
                  isMe && 'bg-gold/[0.05]'
                )}>
                  <span className={clsx(
                    'font-bold text-[10px] uppercase tracking-wide truncate max-w-[64px]',
                    isMe ? 'text-gold' : 'text-field-400'
                  )}>
                    {name.length > 7 ? name.slice(0, 7) + '…' : name}
                  </span>
                  <span className="text-base font-black text-white leading-tight">
                    {score.correct}<span className="text-field-500 text-[11px] font-bold">/{score.total}</span>
                  </span>
                  {pct !== null && <span className="text-[10px] text-field-500">{pct}%</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Per-game rows */}
      {sortedGames.map((game: any) => {
        const revealed = isGameRevealed(game)
        const isFinal = game.status === 'final'
        const winner = isFinal
          ? (game.home_score > game.away_score ? game.home_team
            : game.away_score > game.home_score ? game.away_team : 'TIE')
          : null

        const kickoffTime = game.game_date
          ? new Date(game.game_date).toLocaleString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
              hour: 'numeric', minute: '2-digit',
            })
          : 'TBD'

        const awayCount = sortedMembers.filter(
          m => isPickVisibleForUser(game, m.user_id) && pickMap[game.id]?.[m.user_id] === game.away_team
        ).length
        const homeCount = sortedMembers.filter(
          m => isPickVisibleForUser(game, m.user_id) && pickMap[game.id]?.[m.user_id] === game.home_team
        ).length
        const total = awayCount + homeCount
        const awayPct = total > 0 ? Math.round((awayCount / total) * 100) : 50
        const homePct = total > 0 ? 100 - awayPct : 50

        return (
          <div key={game.id} className={clsx(
            'bg-field-800 border rounded-xl px-3 py-2.5 space-y-2',
            game.is_tiebreaker ? 'border-gold/25' : 'border-field-700',
          )}>

            {/* Game header row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {/* Away */}
                <div className="flex items-center gap-1">
                  <span className="font-cond font-black text-sm text-white">{game.away_team}</span>
                  {isFinal && (
                    <span className={clsx(
                      'font-black text-sm',
                      winner === game.away_team ? 'text-emerald-400' : 'text-field-500'
                    )}>{game.away_score}</span>
                  )}
                </div>
                <span className="text-field-600 text-[10px]">@</span>
                {/* Home */}
                <div className="flex items-center gap-1">
                  <span className="font-cond font-black text-sm text-white">{game.home_team}</span>
                  {isFinal && (
                    <span className={clsx(
                      'font-black text-sm',
                      winner === game.home_team ? 'text-emerald-400' : 'text-field-500'
                    )}>{game.home_score}</span>
                  )}
                </div>
                {game.is_tiebreaker && (
                  <span className="text-[9px] font-bold text-gold bg-gold/10 px-1 py-0.5 rounded uppercase tracking-wider">TB</span>
                )}
              </div>
              <div className="text-right shrink-0">
                {isFinal
                  ? <span className="text-[10px] font-bold text-emerald-400">Final</span>
                  : revealed
                  ? <span className="text-[10px] text-yellow-400/80 flex items-center gap-0.5"><Eye className="w-2.5 h-2.5" /> Live</span>
                  : <span className="text-[10px] text-field-500">{kickoffTime}</span>
                }
              </div>
            </div>

            {/* Pick bar */}
            {total > 0 && (
              <div className="space-y-0.5">
                <div className="flex rounded overflow-hidden h-3.5 text-[9px] font-black">
                  {awayPct > 0 && (
                    <div
                      className={clsx(
                        'flex items-center justify-center',
                        winner === game.away_team ? 'bg-emerald-500' : isFinal ? 'bg-red-500/50' : 'bg-field-500'
                      )}
                      style={{ width: `${awayPct}%` }}
                    >
                      {awayPct >= 25 && `${game.away_team} ${awayPct}%`}
                    </div>
                  )}
                  {homePct > 0 && (
                    <div
                      className={clsx(
                        'flex items-center justify-center',
                        winner === game.home_team ? 'bg-emerald-500' : isFinal ? 'bg-red-500/50' : 'bg-gold/60'
                      )}
                      style={{ width: `${homePct}%` }}
                    >
                      {homePct >= 25 && `${game.home_team} ${homePct}%`}
                    </div>
                  )}
                </div>
                <div className="flex justify-between text-[9px] text-field-500">
                  <span>{awayCount}p</span>
                  <span>{homeCount}p</span>
                </div>
              </div>
            )}

            {/* Per-user pick chips */}
            <div className="flex flex-wrap gap-1">
              {sortedMembers.map((m) => {
                const isMe = m.user_id === userId
                const picked = pickMap[game.id]?.[m.user_id]
                const displayName = isMe
                  ? 'You'
                  : (m.profile?.display_name || m.profile?.username || '?')
                const short = displayName.length > 5 ? displayName.slice(0, 5) + '…' : displayName
                const isCorrect = isFinal && picked === winner
                const isWrong = isFinal && !!picked && picked !== winner

                return (
                  <div
                    key={m.user_id}
                    title={displayName}
                    className={clsx(
                      'flex items-center gap-0.5 rounded px-1.5 py-0.5 border text-[10px]',
                      isMe
                        ? 'border-gold/40 bg-gold/[0.07]'
                        : 'border-field-700 bg-field-800/60',
                    )}
                  >
                    <span className={clsx('font-bold', isMe ? 'text-gold' : 'text-field-400')}>
                      {short}
                    </span>
                    <span className="text-field-700 mx-0.5">·</span>
                    {!isPickVisibleForUser(game, m.user_id) ? (
                      <span className="text-field-600 text-[9px]">🔒</span>
                    ) : !picked ? (
                      <span className="text-field-600 italic">—</span>
                    ) : (
                      <span className={clsx(
                        'font-cond font-black',
                        isCorrect ? 'text-emerald-400' : isWrong ? 'text-red-400' : 'text-white'
                      )}>
                        {picked}
                        {isCorrect && ' ✓'}
                        {isWrong && ' ✗'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Tiebreaker guesses */}
            {game.is_tiebreaker && (revealed || allPicks.some((p: any) => p.game_id === game.id && p.user_id === userId)) && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-field-700/60 pt-1.5">
                <span className="text-[9px] font-bold text-gold uppercase tracking-wider flex items-center gap-1">
                  <Target className="w-2.5 h-2.5" /> TB:
                </span>
                {sortedMembers.map(m => {
                  const pick = allPicks.find((p: any) => p.game_id === game.id && p.user_id === m.user_id)
                  const isMe = m.user_id === userId
                  const actual = isFinal ? (game.home_score ?? 0) + (game.away_score ?? 0) : null
                  const guess = pick?.tiebreaker_score
                  const canSee = isPickVisibleForUser(game, m.user_id)
                  const name = isMe ? 'You' : (m.profile?.display_name || m.profile?.username || '?').slice(0, 5)
                  return (
                    <span key={m.user_id} className={clsx(
                      'text-[10px] rounded px-1.5 py-0.5',
                      isMe ? 'bg-gold/10 text-gold' : 'bg-field-800 text-field-400'
                    )}>
                      <span className="font-bold">{name}</span>
                      {' '}<span className="font-black">{canSee ? (guess ?? '—') : '🔒'}</span>
                      {isFinal && canSee && guess != null && actual != null && (
                        <span className="text-field-600"> ±{Math.abs(guess - actual)}</span>
                      )}
                    </span>
                  )
                })}
                {isFinal && (
                  <span className="text-[10px] rounded px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 font-bold">
                    Actual: {(game.home_score ?? 0) + (game.away_score ?? 0)}
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
