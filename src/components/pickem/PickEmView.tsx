import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { resolveWeekDeadline } from '@/lib/deadline'
import { teamLogoUrl } from '@/components/teams/teamIds'
import { byeTeamsForWeek } from '@/lib/byeWeeks'
import { useCountdown, formatCountdown } from '@/hooks/useCountdown'
import {
  computeWeek, computeStandings, isWeekComplete, tiebreakerTotal, isFinal,
} from './standings'
import { WeekRecap, WeekInProgress } from './WeekRecap'
import { AnimatedWeekReveal } from './AnimatedWeekReveal'
import { StandingsTable } from './StandingsTable'
import {
  Trophy, ChevronDown, Lock, Check, X, Target, Settings, Clock, Calendar, Users, Eye, EyeOff, TrendingUp, Shuffle,
  TrendingDown, Home, Plane, Award
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { useNflOdds } from '@/hooks/useNflOdds'
import { useNflStandings } from '@/hooks/useTeamStandings'
import { CURRENT_SEASON } from '@/lib/season'

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
  // ── Postseason ──
  19: '2027-01-19T05:00:00Z',  // Wild Card weekend end
  20: '2027-01-26T05:00:00Z',  // Divisional weekend end
  21: '2027-02-02T05:00:00Z',  // Conference Championships end
  22: '2027-02-09T05:00:00Z',  // Super Bowl end
}

function getActiveWeek(): number {
  const now = new Date()
  // Before season starts → Week 1
  if (now < new Date('2026-09-09T00:00:00Z')) return 1
  for (let w = 1; w <= 22; w++) {
    const end = WEEK_END_DATES[w] ? new Date(WEEK_END_DATES[w]) : null
    if (end && now < end) return w
  }
  return 22
}

function isGameLocked(gameDate: string | null, deadline: string | null, status?: string | null): boolean {
  // Status is checked independently of time, as a backstop. Every
  // existing check here only ever compared clock time to kickoff or
  // deadline — meaning a game that's already final or in progress
  // could still show as pickable if its stored kickoff time somehow
  // sits in the future (a bad sync, clock skew, or in testing, a
  // manually-finalized game). A pick should never be editable once
  // the outcome is actually known, independent of what the clock says.
  if (status === 'final' || status === 'in_progress') return true
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
  const [tab, setTab] = useState<'picks' | 'standings' | 'results' | 'board'>('picks')
  const [pendingPicks, setPendingPicks] = useState<Record<string, string>>({})
  const [tiebreakerScore, setTiebreakerScore] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  // Tracks the last snapshot of picks that's actually been saved (or
  // freshly loaded from the DB) — the auto-save effect below only
  // fires when the current state genuinely differs from this,
  // not just whenever pendingPicks changes reference. Needed
  // because savePicks() invalidates the myPicks query on success,
  // which re-triggers the effect that resets pendingPicks from the
  // server — without this guard, that reset would look like a new
  // change and trigger another save, which invalidates again,
  // looping forever.
  const lastSavedRef = useRef<string | null>(null)
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
        .eq('season', CURRENT_SEASON)
        .maybeSingle()
      return data
    },
  })

  // Games for this week
  const { data: games = [] } = useQuery({
    queryKey: ['nfl-games', week],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nfl_games')
        .select('*')
        .eq('season', CURRENT_SEASON)
        .eq('week', week)
        .order('game_date', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  // Only meaningful once real games are loaded for the week — an
  // empty games array (still loading, or no schedule yet) would
  // otherwise read as "everyone's on bye."
  const byeTeams = useMemo(
    () => (games.length > 0 ? byeTeamsForWeek(games as any) : []),
    [games],
  )

  // ── The deadline actually in force for this week ─────────────
  //
  // This previously read ONLY the per-week override row, so a
  // league-wide rule set in the Commissioner panel was ignored:
  // picks locked at kickoff while reminder emails announced a
  // deadline. Precedence is now per-week override, then the league
  // rule, then kickoff.
  const firstKickoff = (() => {
    const times = games
      .map((g: any) => (g.game_date ? new Date(g.game_date).getTime() : NaN))
      .filter((t: number) => Number.isFinite(t))
    return times.length ? new Date(Math.min(...times)) : null
  })()

  const { deadline: effectiveDeadline, source: deadlineSource } = resolveWeekDeadline({
    weekOverride: leagueSettings?.pick_deadline ?? null,
    lockType:     (activeLeague as any)?.pick_lock_type,
    day:          (activeLeague as any)?.pick_deadline_day,
    time:         (activeLeague as any)?.pick_deadline_time,
    tz:           (activeLeague as any)?.pick_deadline_tz,
    firstKickoff,
  })

  const weekDeadline = effectiveDeadline ? effectiveDeadline.toISOString() : null
  const countdownMs = useCountdown(weekDeadline)

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
        .eq('season', CURRENT_SEASON)
      if (error) throw error
      return data ?? []
    },
  })

  // All league members' picks for this week (revealed only after each game kicks off)
  const { data: allPicks = [] } = useQuery({
    queryKey: ['all-pickem-picks', activeLeagueId, week],
    enabled: !!activeLeagueId && (tab === 'results' || tab === 'standings' || tab === 'board'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pickem_picks')
        .select('*, profile:profiles(username, display_name)')
        .eq('league_id', activeLeagueId!)
        .eq('week', week)
        .eq('season', CURRENT_SEASON)
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
        .select('user_id, team_name, profile:profiles(username, display_name, avatar_url)')
        .eq('league_id', activeLeagueId!)
      if (error) throw error
      return data ?? []
    },
  })

  // ── Season-wide data for derived standings ──────────────────
  // Standings are computed from picks joined to game results rather
  // than read from a maintained table, so they can't drift and new
  // members appear immediately at 0-0.
  const { data: seasonGames = [] } = useQuery({
    queryKey: ['pickem-season-games', CURRENT_SEASON],
    enabled: !!activeLeagueId && tab === 'standings',
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nfl_games')
        .select('id, week, game_date, home_team, away_team, home_score, away_score, status, is_tiebreaker')
        .eq('season', CURRENT_SEASON)
      if (error) throw error
      return data ?? []
    },
  })

  const { data: seasonPicks = [] } = useQuery({
    queryKey: ['pickem-season-picks', activeLeagueId],
    enabled: !!activeLeagueId && tab === 'standings',
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pickem_picks')
        .select('game_id, user_id, week, picked_team, tiebreaker_score')
        .eq('league_id', activeLeagueId!)
        .eq('season', CURRENT_SEASON)
      if (error) throw error
      return data ?? []
    },
  })

  const standings = useMemo(
    () => computeStandings(seasonGames as any, seasonPicks as any, leagueMembers as any),
    [seasonGames, seasonPicks, leagueMembers],
  )

  // ── This week's results, for the recap post ─────────────────
  const weekRows = useMemo(
    () => computeWeek(games as any, allPicks as any, leagueMembers as any),
    [games, allPicks, leagueMembers],
  )
  const weekComplete = useMemo(() => isWeekComplete(games as any), [games])
  const weekTbTotal  = useMemo(() => tiebreakerTotal(games as any), [games])
  const finishedCount = useMemo(
    () => (games as any[]).filter(isFinal).length,
    [games],
  )

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
    // This IS the current saved state (just loaded from — or just
    // confirmed against — the DB), so it's the correct baseline for
    // the auto-save effect to compare future changes against.
    lastSavedRef.current = JSON.stringify({ existing, existingTb })
  }, [myPicks])

  // Auto-saves picks/tiebreaker guesses shortly after the user stops
  // making changes, instead of requiring an explicit Save button.
  // Debounced so a run of quick clicks (or typing a multi-digit
  // tiebreaker guess) doesn't fire a separate write per keystroke.
  useEffect(() => {
    const snapshot = JSON.stringify({ existing: pendingPicks, existingTb: tiebreakerScore })
    if (snapshot === lastSavedRef.current) return  // nothing genuinely changed
    if (Object.keys(pendingPicks).length === 0) return  // nothing to save yet

    const t = setTimeout(() => { savePicks() }, 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPicks, tiebreakerScore])

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
          season: CURRENT_SEASON,
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
          season: CURRENT_SEASON,
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
        season: CURRENT_SEASON,
        picked_team: team,
        tiebreaker_score: tiebreakerScore[gameId] ? parseInt(tiebreakerScore[gameId]) : null,
      }))
      const { error } = await supabase
        .from('pickem_picks')
        .upsert(rows, { onConflict: 'league_id,user_id,game_id' })
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['my-pickem-picks', activeLeagueId, week] })
      // No success toast — this now fires automatically, potentially
      // several times as someone clicks through picks, and a popup
      // every time would get old fast. The passive status indicator
      // communicates "saved" continuously instead.
    } catch (e: any) {
      toast.error('Failed to save picks: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const { data: oddsMap } = useNflOdds()
  const { data: standingsData } = useNflStandings()
  // Flattened once here rather than inside every GamePickCard render
  // — reuses the exact same real standings data the By Record
  // button and Standings tab already show, just keyed by abbr for a
  // simple lookup.
  const recordsByAbbr = useMemo(() => {
    const map = new Map<string, string>()
    for (const group of standingsData?.groups ?? []) {
      for (const team of group.teams) map.set(team.abbr, team.record)
    }
    return map
  }, [standingsData])
  // Kept separate from the record itself rather than baked into the
  // string — the regular season hasn't actually started yet (every
  // team is genuinely 0-0 there right now), so what's shown is a
  // real preseason record, not a stale or wrong one. Labeling it
  // explicitly keeps that clear instead of a bare number that reads
  // the same regardless of which one it actually is.
  const recordsArePreseason = standingsData?.isPreseason ?? false

  // Fills in the favored side of every still-open game, using the
  // same odds cache the pick cards already display. Games with no
  // odds available (spread/moneyline never synced, or a bye-week-
  // adjacent quirk) are left untouched rather than guessed at —
  // silently defaulting one side would be indistinguishable from a
  // real signal, and this only fills pendingPicks, never submits,
  // so the person still reviews everything before saving.
  function handleFillFavorites() {
    let filled = 0, skipped = 0
    const next = { ...pendingPicks }
    for (const g of games) {
      if (isGameLocked(g.game_date, weekDeadline, g.status)) continue
      const odds = oddsMap?.get(`${g.away_team}@${g.home_team}`)
      if (!odds) { skipped++; continue }
      let favorite: string | null = null
      if (odds.homeWinPct != null && odds.awayWinPct != null) {
        favorite = odds.homeWinPct >= odds.awayWinPct ? g.home_team : g.away_team
      } else if (odds.spread != null) {
        // Spread is stored as the home team's number — negative
        // means the home team is favored.
        favorite = odds.spread < 0 ? g.home_team : g.away_team
      }
      if (!favorite) { skipped++; continue }
      next[g.id] = favorite
      filled++
    }
    setPendingPicks(next)
    if (filled === 0) toast.error("No odds available yet for this week's games")
    else if (skipped > 0) toast.success(`Filled ${filled} favorite${filled === 1 ? '' : 's'} — ${skipped} game${skipped === 1 ? '' : 's'} had no odds yet`)
    else toast.success(`Filled ${filled} favorite${filled === 1 ? '' : 's'}`)
  }

  // Same idea, but a genuine 50/50 coin flip per game instead of
  // reading the odds — for anyone who just wants every game filled
  // in without thinking about it.
  function handleRandomPicks() {
    let filled = 0
    const next = { ...pendingPicks }
    for (const g of games) {
      if (isGameLocked(g.game_date, weekDeadline, g.status)) continue
      next[g.id] = Math.random() < 0.5 ? g.home_team : g.away_team
      filled++
    }
    setPendingPicks(next)
    toast.success(`Randomly filled ${filled} pick${filled === 1 ? '' : 's'}`)
  }

  // Exact inverse of handleFillFavorites — same odds lookup, same
  // skip-when-no-odds handling, comparison flipped so it always
  // resolves to the genuinely opposite side of whatever Favorites
  // would pick. Verified in isolation before writing this: favorite
  // and underdog can never land on the same team, including at a
  // dead-even 50/50 split or an exact pick-em spread of 0.
  function handleFillUnderdogs() {
    let filled = 0, skipped = 0
    const next = { ...pendingPicks }
    for (const g of games) {
      if (isGameLocked(g.game_date, weekDeadline, g.status)) continue
      const odds = oddsMap?.get(`${g.away_team}@${g.home_team}`)
      if (!odds) { skipped++; continue }
      let underdog: string | null = null
      if (odds.homeWinPct != null && odds.awayWinPct != null) {
        underdog = odds.homeWinPct >= odds.awayWinPct ? g.away_team : g.home_team
      } else if (odds.spread != null) {
        underdog = odds.spread < 0 ? g.away_team : g.home_team
      }
      if (!underdog) { skipped++; continue }
      next[g.id] = underdog
      filled++
    }
    setPendingPicks(next)
    if (filled === 0) toast.error("No odds available yet for this week's games")
    else if (skipped > 0) toast.success(`Filled ${filled} underdog${filled === 1 ? '' : 's'} - ${skipped} game${skipped === 1 ? '' : 's'} had no odds yet`)
    else toast.success(`Filled ${filled} underdog${filled === 1 ? '' : 's'}`)
  }

  // A genuinely different signal from Favorites/Underdogs — real
  // season record rather than Vegas odds. The two can disagree: a
  // 5-0 team on the road against a 4-1 team can still be an
  // underdog in the spread while having the better record, so this
  // isn't just a redundant restatement of the odds-based buttons.
  // Reuses the same real standings data the Standings tab shows,
  // flattened into an abbr -> win% lookup.
  function handleFillByRecord() {
    const pctByAbbr = new Map<string, number>()
    for (const group of standingsData?.groups ?? []) {
      for (const team of group.teams) pctByAbbr.set(team.abbr, team.pct)
    }

    let filled = 0, skipped = 0
    const next = { ...pendingPicks }
    for (const g of games) {
      if (isGameLocked(g.game_date, weekDeadline, g.status)) continue
      const homePct = pctByAbbr.get(g.home_team)
      const awayPct = pctByAbbr.get(g.away_team)
      if (homePct == null || awayPct == null || homePct === awayPct) { skipped++; continue }
      next[g.id] = homePct > awayPct ? g.home_team : g.away_team
      filled++
    }
    setPendingPicks(next)
    if (filled === 0) toast.error('No standings available yet for this week\'s games')
    else if (skipped > 0) toast.success(`Filled ${filled} pick${filled === 1 ? '' : 's'} by record — ${skipped} game${skipped === 1 ? '' : 's'} skipped (tied or no record yet)`)
    else toast.success(`Filled ${filled} pick${filled === 1 ? '' : 's'} by record`)
  }

  // Home/away have no odds dependency at all — always available,
  // unlike Favorites/Underdog which need the odds cache populated.
  function handleFillHome() {
    let filled = 0
    const next = { ...pendingPicks }
    for (const g of games) {
      if (isGameLocked(g.game_date, weekDeadline, g.status)) continue
      next[g.id] = g.home_team
      filled++
    }
    setPendingPicks(next)
    toast.success(`Filled ${filled} home team${filled === 1 ? '' : 's'}`)
  }

  function handleFillAway() {
    let filled = 0
    const next = { ...pendingPicks }
    for (const g of games) {
      if (isGameLocked(g.game_date, weekDeadline, g.status)) continue
      next[g.id] = g.away_team
      filled++
    }
    setPendingPicks(next)
    toast.success(`Filled ${filled} away team${filled === 1 ? '' : 's'}`)
  }

  const tiebreakerGame = games.find((g: any) => g.is_tiebreaker)
  const regularGames = games.filter((g: any) => !g.is_tiebreaker)
  const lockedCount = games.filter((g: any) => isGameLocked(g.game_date, weekDeadline, g.status)).length
  const pickedCount = Object.keys(pendingPicks).filter(id => games.some((g: any) => g.id === id)).length
  const totalGames = games.length

  // Determine if the whole week is still open for picks
  const anyUnlocked = games.some((g: any) => !isGameLocked(g.game_date, weekDeadline, g.status))

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
          <p className="text-field-400 text-sm">{activeLeague.name} · {CURRENT_SEASON} NFL Season</p>
        </div>
        <div className="flex items-center gap-2">
          {pickedCount > 0 && (
            <div className={clsx(
              'flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold border',
              pickedCount === totalGames
                ? 'bg-gold/10 border-gold/30 text-gold'
                : 'bg-field-800 border-field-700 text-field-300'
            )}>
              {pickedCount === totalGames && <Check className="w-3.5 h-3.5" />}
              {pickedCount}/{totalGames} picked
            </div>
          )}
        </div>
      </div>

      {/* Week selector dropdown + tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">

        {/* Week dropdown */}
        <div className="relative">
          <button
            onClick={() => setWeekDropdownOpen(o => !o)}
            className="flex items-center gap-2 bg-field-800 border border-field-600 rounded-xl px-4 py-2.5 hover:border-field-500 transition-colors"
          >
            <Calendar className="w-4 h-4 text-field-400" />
            <span className="font-cond font-black text-white text-base uppercase tracking-wider">
              {week === 19 ? 'Wild Card'
               : week === 20 ? 'Divisional'
               : week === 21 ? 'Conf. Champ.'
               : week === 22 ? 'Super Bowl'
               : `Week ${week}`}
            </span>
            {week === activeWeek && (
              <span className="text-xs font-bold text-gold bg-gold/10 border border-gold/30 rounded px-1.5 py-0.5 uppercase tracking-wider">
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
              <div className="max-h-72 overflow-y-auto">
                {/* Regular season weeks */}
                <div className="px-3 py-1 border-b border-field-700">
                  <span className="text-field-500 text-[12px] font-bold uppercase tracking-wider">Regular Season</span>
                </div>
                {Array.from({ length: 18 }, (_, i) => i + 1).map(w => {
                  const endDate = WEEK_END_DATES[w]
                  const isOver = endDate ? new Date() >= new Date(endDate) : false
                  const isCurrent = w === activeWeek
                  return (
                    <button
                      key={w}
                      onClick={() => { setWeek(w); setWeekDropdownOpen(false) }}
                      className={clsx(
                        'w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors',
                        week === w ? 'bg-gold/10 text-gold' : 'text-field-200 hover:bg-field-700',
                      )}
                    >
                      <span className="font-cond font-bold text-sm">Week {w}</span>
                      <span className={clsx('text-xs font-bold uppercase tracking-wider',
                        isCurrent ? 'text-gold' : isOver ? 'text-field-500' : 'text-field-300'
                      )}>
                        {isCurrent ? 'Current' : isOver ? 'Complete' : 'Upcoming'}
                      </span>
                    </button>
                  )
                })}
                {/* Postseason weeks */}
                <div className="px-3 py-1 border-t border-b border-field-700 mt-1">
                  <span className="text-gold text-[12px] font-bold uppercase tracking-wider">Postseason</span>
                </div>
                {[
                  { w: 19, label: 'Wild Card' },
                  { w: 20, label: 'Divisional' },
                  { w: 21, label: 'Conference Champ.' },
                  { w: 22, label: 'Super Bowl' },
                ].map(({ w, label }) => {
                  const endDate = WEEK_END_DATES[w]
                  const isOver = endDate ? new Date() >= new Date(endDate) : false
                  const isCurrent = w === activeWeek
                  return (
                    <button
                      key={w}
                      onClick={() => { setWeek(w); setWeekDropdownOpen(false) }}
                      className={clsx(
                        'w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors',
                        week === w ? 'bg-gold/10 text-gold' : 'text-field-200 hover:bg-field-700',
                      )}
                    >
                      <span className="font-cond font-bold text-sm">{label}</span>
                      <span className={clsx('text-xs font-bold uppercase tracking-wider',
                        isCurrent ? 'text-gold' : isOver ? 'text-field-500' : 'text-field-300'
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

        {/* Tabs — full-width and evenly split once wrapped to their
            own line on narrow screens, rather than left-aligned and
            cramped alongside the week dropdown */}
        <div className="flex gap-1 w-full sm:w-auto">
          {(['picks', 'standings', 'results', 'board'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'flex-1 sm:flex-initial font-cond font-bold text-xs uppercase tracking-wider px-3 py-2 rounded-lg border transition-colors',
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

      {/* Deadline banner — switches to a live ticking countdown once
          inside the final hour, with color escalating gold -> red
          as it approaches zero. Outside that window the static
          formatted date/time is more useful than a number that's
          days away from meaning anything. */}
      {weekDeadline && (
        <div className={clsx(
          'flex items-center gap-2 text-xs border rounded-lg px-3 py-2 transition-colors',
          countdownMs != null && countdownMs <= 5 * 60 * 1000
            ? 'bg-red-500/10 border-red-500/40'
            : 'bg-field-800/60 border-field-700',
        )}>
          <Clock className={clsx('w-3.5 h-3.5 shrink-0',
            countdownMs != null && countdownMs <= 5 * 60 * 1000 ? 'text-red-400' : 'text-gold')} />
          <span className="text-field-300">
            {countdownMs != null ? (
              <>
                <span className={clsx('font-bold font-cond tabular-nums',
                  countdownMs <= 5 * 60 * 1000 ? 'text-red-400' : 'text-gold')}>
                  Locks in {formatCountdown(countdownMs)}
                </span>
              </>
            ) : (
              <>
                <span className="text-gold font-bold">Pick deadline:</span> {formatDeadline(weekDeadline)}
                {deadlineSource === 'league-rule' && (
                  <span className="text-field-500 ml-1.5">· league rule</span>
                )}
                {deadlineSource === 'override' && (
                  <span className="text-field-500 ml-1.5">· this week only</span>
                )}
              </>
            )}
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

      {/* Bye teams this week — derived from nfl_games, so it can
          never drift out of sync with the real schedule */}
      {byeTeams.length > 0 && (
        <div className="flex items-start gap-2 text-xs bg-field-800/40 border border-field-700/50 rounded-lg px-3 py-2">
          <Calendar className="w-3.5 h-3.5 text-field-500 shrink-0 mt-0.5" />
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-field-500 font-bold shrink-0">On bye:</span>
            {byeTeams.map((abbr, i) => (
              <span key={abbr} className="text-field-400">
                {TEAM_INFO[abbr]?.name ?? abbr}{i < byeTeams.length - 1 ? ',' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quick-fill — only fills open games into pendingPicks; the
          auto-save effect above picks up the change and persists it
          shortly after. Only makes sense while actively picking, so
          gated to the Picks tab specifically — was previously
          showing on Results and Standings too. */}
      {tab === 'picks' && anyUnlocked && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleFillFavorites}
            className="flex items-center gap-1.5 text-xs font-cond font-bold uppercase tracking-wider text-field-300 bg-field-800 border border-field-700 hover:border-gold/50 hover:text-gold rounded-lg px-3 py-1.5 transition-colors">
            <TrendingUp className="w-3.5 h-3.5" />
            Favorites
          </button>
          <button onClick={handleFillUnderdogs}
            className="flex items-center gap-1.5 text-xs font-cond font-bold uppercase tracking-wider text-field-300 bg-field-800 border border-field-700 hover:border-gold/50 hover:text-gold rounded-lg px-3 py-1.5 transition-colors">
            <TrendingDown className="w-3.5 h-3.5" />
            Underdogs
          </button>
          <button onClick={handleFillHome}
            className="flex items-center gap-1.5 text-xs font-cond font-bold uppercase tracking-wider text-field-300 bg-field-800 border border-field-700 hover:border-gold/50 hover:text-gold rounded-lg px-3 py-1.5 transition-colors">
            <Home className="w-3.5 h-3.5" />
            Home Teams
          </button>
          <button onClick={handleFillAway}
            className="flex items-center gap-1.5 text-xs font-cond font-bold uppercase tracking-wider text-field-300 bg-field-800 border border-field-700 hover:border-gold/50 hover:text-gold rounded-lg px-3 py-1.5 transition-colors">
            <Plane className="w-3.5 h-3.5" />
            Away Teams
          </button>
          <button onClick={handleFillByRecord}
            className="flex items-center gap-1.5 text-xs font-cond font-bold uppercase tracking-wider text-field-300 bg-field-800 border border-field-700 hover:border-gold/50 hover:text-gold rounded-lg px-3 py-1.5 transition-colors">
            <Award className="w-3.5 h-3.5" />
            By Record
          </button>
          <button onClick={handleRandomPicks}
            className="flex items-center gap-1.5 text-xs font-cond font-bold uppercase tracking-wider text-field-300 bg-field-800 border border-field-700 hover:border-gold/50 hover:text-gold rounded-lg px-3 py-1.5 transition-colors">
            <Shuffle className="w-3.5 h-3.5" />
            Random
          </button>
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
        <ModalPortal onClose={() => setShowDeadlineEditor(false)}>
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
        </ModalPortal>
      )}

      {/* Close dropdown when clicking outside */}
      {weekDropdownOpen && (
        <div className="fixed inset-0 z-20" onClick={() => setWeekDropdownOpen(false)} />
      )}

      {/* ── PICKS TAB ── */}
      {tab === 'picks' && (
        <div className="space-y-3">
          {lockedCount > 0 && lockedCount < totalGames && (
            <div className="flex items-center gap-2 text-xs text-gold/80 bg-gold/5 border border-gold/20 rounded-lg px-3 py-2">
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
              odds={oddsMap?.get(`${game.away_team}@${game.home_team}`) ?? null}
              recordsByAbbr={recordsByAbbr}
              recordsArePreseason={recordsArePreseason}
              onPick={(team) => {
                if (isGameLocked(game.game_date, weekDeadline, game.status)) return
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
                odds={oddsMap?.get(`${tiebreakerGame.away_team}@${tiebreakerGame.home_team}`) ?? null}
                recordsByAbbr={recordsByAbbr}
                recordsArePreseason={recordsArePreseason}
                onPick={(team) => {
                  if (isGameLocked(tiebreakerGame.game_date, weekDeadline, tiebreakerGame.status)) return
                  setPendingPicks(p => ({ ...p, [tiebreakerGame.id]: team }))
                }}
                isTiebreaker
                tiebreakerScore={tiebreakerScore[tiebreakerGame.id] ?? ''}
                onTiebreakerScore={(val) => setTiebreakerScore(s => ({ ...s, [tiebreakerGame.id]: val }))}
              />
            </div>
          )}

          {/* Passive status only now — picks auto-save shortly
              after each change (see the debounced effect near the
              top of this component), no explicit button needed. */}
          {pickedCount > 0 && (
            <div className="pt-1 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider">
              {saving ? (
                <span className="text-field-400">Saving…</span>
              ) : (
                <span className="text-field-500 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-nfl" />
                  All picks saved · {pickedCount}/{totalGames}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── STANDINGS TAB ── */}
      {tab === 'standings' && (
        <div className="space-y-4">
          {/* End-of-week winner's post, once every game is final.
              AnimatedWeekReveal plays the reveal sequence exactly
              once per league+week (localStorage-gated), then
              settles into rendering this exact WeekRecap for every
              later view — so a returning visitor sees precisely
              what they always would have. */}
          {weekComplete ? (
            <AnimatedWeekReveal
              leagueId={activeLeagueId!}
              week={week}
              rows={weekRows}
              tiebreakerTotal={weekTbTotal}
              currentUserId={user?.id}
              myStreak={standings.find((s: any) => s.userId === user?.id)?.streak}
            />
          ) : finishedCount > 0 ? (
            <WeekInProgress finished={finishedCount} total={games.length} />
          ) : null}

          <StandingsTable rows={standings} currentUserId={user?.id} thisWeekRows={weekRows} />
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

      {/* ── BOARD TAB ── */}
      {tab === 'board' && (
        <PicksBoard
          games={games}
          allPicks={allPicks}
          leagueMembers={leagueMembers}
          weekRows={weekRows}
          userId={user?.id}
          deadline={weekDeadline}
        />
      )}
    </div>
  )
}

function GamePickCard({
  game, pickedTeam, onPick, deadline, odds, recordsByAbbr, recordsArePreseason, isTiebreaker, tiebreakerScore, onTiebreakerScore
}: {
  game: any
  pickedTeam: string | undefined
  onPick: (team: string) => void
  deadline: string | null
  odds?: { spread: number | null; totalPoints: number | null; homeWinPct: number | null; awayWinPct: number | null; homeMoneyline: number | null; awayMoneyline: number | null } | null
  recordsByAbbr?: Map<string, string>
  recordsArePreseason?: boolean
  isTiebreaker?: boolean
  tiebreakerScore?: string
  onTiebreakerScore?: (val: string) => void
}) {
  const locked = isGameLocked(game.game_date, deadline, game.status)
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

  // Spread display: from away team perspective
  // spread is stored as home team point (e.g. -3 = home favored by 3)
  const homeSpread = odds?.spread ?? null
  const awaySpread = homeSpread !== null ? -homeSpread : null
  const formatSpread = (s: number | null) => {
    if (s === null) return null
    if (s === 0) return 'PK'
    return s > 0 ? `+${s}` : `${s}`
  }
  const formatML = (ml: number | null) => {
    if (ml === null) return null
    return ml > 0 ? `+${ml}` : `${ml}`
  }

  return (
    <div className={clsx('panel space-y-3', isTiebreaker && 'border-gold/30 bg-gold/[0.02]')}>
      <div className="flex items-center justify-between">
        <span className="text-field-400 text-xs">{gameTime}</span>
        {locked && !isFinal && (
          <span className="flex items-center gap-1 text-xs text-gold font-bold">
            <Lock className="w-3 h-3" /> Locked
          </span>
        )}
        {isFinal && <span className="text-xs text-field-300 font-bold">Final</span>}
        {odds && !isFinal && (
          <span className="flex items-center gap-1 text-xs text-field-500">
            <TrendingUp className="w-3 h-3 text-gold/50" />
            {odds.totalPoints != null
              ? <span className="text-gold/70">O/U <span className="font-bold text-gold">{odds.totalPoints}</span></span>
              : <span className="text-gold/60">Live odds</span>
            }
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          {
            team: game.away_team, info: awayInfo, label: 'Away',
            score: game.away_score,
            spread: formatSpread(awaySpread),
            winPct: odds?.awayWinPct ?? null,
            ml: formatML(odds?.awayMoneyline ?? null),
          },
          {
            team: game.home_team, info: homeInfo, label: 'Home',
            score: game.home_score,
            spread: formatSpread(homeSpread),
            winPct: odds?.homeWinPct ?? null,
            ml: formatML(odds?.homeMoneyline ?? null),
          },
        ].map(({ team, info, label, score, spread, winPct, ml }) => {
          const isPicked = pickedTeam === team
          const isWinner = winner === team
          const isLoser = isFinal && winner !== 'TIE' && winner !== team

          return (
            <button
              key={team}
              onClick={() => onPick(team)}
              disabled={locked}
              className={clsx(
                'relative flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all',
                isPicked && !isFinal
                  ? 'border-gold bg-gold/15 text-gold scale-[1.02]'
                  : isPicked && isWinner
                  ? 'border-nfl bg-nfl/15 text-nfl'
                  : isPicked && isFinal && !isWinner
                  ? 'border-red-500/40 bg-red-500/10 text-red-400'
                  : isLoser
                  ? 'border-field-700 bg-field-800/40 text-field-600 opacity-40'
                  : 'border-field-600 bg-field-800 text-white hover:border-field-400 hover:bg-field-700',
                locked && !isPicked && 'cursor-not-allowed',
              )}
            >
              <span className="text-xs text-field-500 uppercase tracking-wider">{label}</span>
              {(() => {
                const logo = teamLogoUrl({ abbr: team }, 'NFL')
                return logo ? (
                  <img
                    src={logo}
                    alt=""
                    loading="lazy"
                    className="w-11 h-11 object-contain"
                    onError={e => { e.currentTarget.style.visibility = 'hidden' }}
                  />
                ) : null
              })()}
              <span className="text-2xl font-black tracking-wide">{team}</span>
              <span className="text-xs text-field-400 truncate max-w-full">
                {info.name.split(' ').slice(-1)[0]}
              </span>
              {!recordsArePreseason && recordsByAbbr?.get(team) && (
                <span className="text-[11px] text-field-500 font-bold tabular-nums">
                  {recordsByAbbr.get(team)}
                </span>
              )}

              {/* Odds info — spread + win % */}
              {odds && !isFinal && (
                <div className="mt-1 flex flex-col items-center gap-0.5 w-full border-t border-white/10 pt-1.5">
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    {spread !== null && (
                      <span className={clsx(
                        'font-cond font-black text-sm',
                        isPicked ? 'text-current' : 'text-white'
                      )}>
                        {spread}
                      </span>
                    )}
                    {ml !== null && (
                      <span className="font-cond text-xs text-field-400">{ml}</span>
                    )}
                  </div>
                  {winPct !== null && (
                    <div className="w-full">
                      <div className="flex justify-between text-[11px] text-field-500 mb-0.5">
                        <span>Win%</span>
                        {/* Fixed per-side, not a percentage threshold
                            — the old version colored each bar based
                            on its own number crossing 60%/40%, so a
                            lopsided 64/36 game showed two different
                            colors while a close 52/48 game showed
                            the same color twice, which read as
                            genuinely inconsistent between games.
                            Matches the same fixed away/home colors
                            Live Scores already uses. */}
                        <span className={clsx('font-black', label === 'Away' ? 'text-field-300' : 'text-gold')}>
                          {winPct}%
                        </span>
                      </div>
                      <div className="w-full h-1 bg-field-700 rounded-full overflow-hidden">
                        <div
                          className={clsx(
                            'h-full rounded-full transition-all',
                            label === 'Away' ? 'bg-field-500' : 'bg-gold'
                          )}
                          style={{ width: `${winPct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

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
                  <Check className="w-4 h-4 text-gold" />
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
          {odds?.totalPoints != null && (
            <p className="text-xs text-field-400">
              Vegas projects <span className="font-bold text-field-200">{odds.totalPoints}</span> combined points
            </p>
          )}
          <input
            type="number"
            min={0}
            max={200}
            placeholder={odds?.totalPoints != null ? String(odds.totalPoints) : 'e.g. 47'}
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

  // Only show members who actually submitted picks this week.
  // Someone who hasn't picked yet shouldn't appear as a row of
  // blanks — they show up once they're in. You always see yourself.
  const submittedIds = new Set(allPicks.map((p: any) => p.user_id))
  const visibleMembers = leagueMembers.filter(
    (m: any) => submittedIds.has(m.user_id) || m.user_id === userId
  )

  // Sort members: current user first, then alphabetical
  const sortedMembers = [...visibleMembers].sort((a, b) => {
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
          {/* Wraps to multiple rows instead of scrolling sideways —
              with a full 15-person league this was a ~1400px-wide
              strip of fixed columns, far past any phone width. */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-px bg-field-700">
            {sortedMembers.map((m) => {
              const score = userScores[m.user_id]
              const isMe = m.user_id === userId
              const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : null
              const name = isMe ? 'You' : (m.profile?.display_name || m.profile?.username || '?')
              return (
                <div key={m.user_id} className={clsx(
                  'flex flex-col items-center px-2 py-2 bg-field-800',
                  isMe && 'bg-gold/[0.05]'
                )}>
                  <span className={clsx(
                    'font-bold text-xs uppercase tracking-wide truncate max-w-full',
                    isMe ? 'text-gold' : 'text-field-400'
                  )}>
                    {name}
                  </span>
                  <span className="text-base font-black text-white leading-tight">
                    {score.correct}<span className="text-field-500 text-xs font-bold">/{score.total}</span>
                  </span>
                  {pct !== null && <span className="text-xs text-field-500">{pct}%</span>}
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
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Away */}
                <div className="flex items-center gap-1.5">
                  {teamLogoUrl({ abbr: game.away_team }, 'NFL') && (
                    <img src={teamLogoUrl({ abbr: game.away_team }, 'NFL')!} alt="" className="w-6 h-6 object-contain shrink-0" />
                  )}
                  <span className="font-cond font-black text-sm text-white">{game.away_team}</span>
                  {isFinal && (
                    <span className={clsx(
                      'font-black text-sm',
                      winner === game.away_team ? 'text-nfl' : 'text-field-500'
                    )}>{game.away_score}</span>
                  )}
                </div>
                <span className="text-field-600 text-xs">@</span>
                {/* Home */}
                <div className="flex items-center gap-1.5">
                  {teamLogoUrl({ abbr: game.home_team }, 'NFL') && (
                    <img src={teamLogoUrl({ abbr: game.home_team }, 'NFL')!} alt="" className="w-6 h-6 object-contain shrink-0" />
                  )}
                  <span className="font-cond font-black text-sm text-white">{game.home_team}</span>
                  {isFinal && (
                    <span className={clsx(
                      'font-black text-sm',
                      winner === game.home_team ? 'text-nfl' : 'text-field-500'
                    )}>{game.home_score}</span>
                  )}
                </div>
                {game.is_tiebreaker && (
                  <span className="text-[11px] font-bold text-gold bg-gold/10 px-1 py-0.5 rounded uppercase tracking-wider">TB</span>
                )}
              </div>
              <div className="text-right shrink-0">
                {isFinal
                  ? <span className="text-xs font-bold text-nfl">Final</span>
                  : revealed
                  ? <span className="text-xs text-gold/80 flex items-center gap-0.5"><Eye className="w-2.5 h-2.5" /> Live</span>
                  : <span className="text-xs text-field-500">{kickoffTime}</span>
                }
              </div>
            </div>

            {/* Pick bar */}
            {total > 0 && (
              <div className="space-y-0.5">
                <div className="flex rounded overflow-hidden h-3.5 text-[11px] font-black">
                  {awayPct > 0 && (
                    <div
                      className={clsx(
                        'flex items-center justify-center',
                        winner === game.away_team ? 'bg-nfl' : isFinal ? 'bg-red-500/50' : 'bg-field-500'
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
                        winner === game.home_team ? 'bg-nfl' : isFinal ? 'bg-red-500/50' : 'bg-gold/60'
                      )}
                      style={{ width: `${homePct}%` }}
                    >
                      {homePct >= 25 && `${game.home_team} ${homePct}%`}
                    </div>
                  )}
                </div>
                <div className="flex justify-between text-[11px] text-field-500">
                  <span>{awayCount}p</span>
                  <span>{homeCount}p</span>
                </div>
              </div>
            )}

            {/* Per-user picks — a grid of rows instead of the old
                cramped, truncated-to-5-characters chip list, so
                full names actually fit. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {sortedMembers.map((m) => {
                const isMe = m.user_id === userId
                const picked = pickMap[game.id]?.[m.user_id]
                const displayName = isMe
                  ? 'You'
                  : (m.profile?.display_name || m.profile?.username || '?')
                const isCorrect = isFinal && picked === winner
                const isWrong = isFinal && !!picked && picked !== winner
                const pickedLogo = picked ? teamLogoUrl({ abbr: picked }, 'NFL') : null

                return (
                  <div
                    key={m.user_id}
                    className={clsx(
                      'flex items-center gap-1.5 rounded-lg px-2 py-1.5 border min-w-0',
                      isMe ? 'border-gold/40 bg-gold/[0.07]' : 'border-field-700 bg-field-800/60',
                    )}
                  >
                    <div className="w-5 h-5 rounded-full bg-field-700 flex items-center justify-center text-[10px] font-bold text-gold overflow-hidden shrink-0">
                      {m.profile?.avatar_url
                        ? <img src={m.profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                        : displayName[0]?.toUpperCase()
                      }
                    </div>
                    <span className={clsx('font-bold text-xs truncate flex-1 min-w-0', isMe ? 'text-gold' : 'text-field-300')}>
                      {displayName}
                    </span>
                    {!isPickVisibleForUser(game, m.user_id) ? (
                      <Lock className="w-3 h-3 text-field-600 shrink-0" />
                    ) : !picked ? (
                      <span className="text-field-600 text-xs italic shrink-0">—</span>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        {pickedLogo && <img src={pickedLogo} alt="" className="w-4 h-4 object-contain" />}
                        <span className={clsx(
                          'font-cond font-black text-xs',
                          isCorrect ? 'text-nfl' : isWrong ? 'text-red-400' : 'text-white'
                        )}>
                          {picked}
                        </span>
                        {isCorrect && <Check className="w-3 h-3 text-nfl" />}
                        {isWrong && <X className="w-3 h-3 text-red-400" />}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Tiebreaker guesses — mirrors the per-user picks grid
                right above it (same avatar+full-name row shape),
                just showing a guessed number instead of a team logo
                on the right. Was still the old 5-char-truncated
                chip style even after the main grid was redesigned. */}
            {game.is_tiebreaker && (revealed || allPicks.some((p: any) => p.game_id === game.id && p.user_id === userId)) && (
              <div className="border-t border-field-700/60 pt-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gold uppercase tracking-wider flex items-center gap-1">
                    <Target className="w-2.5 h-2.5" /> Tiebreaker guesses
                  </span>
                  {isFinal && (
                    <span className="text-[11px] font-bold text-nfl">
                      Actual: {(game.home_score ?? 0) + (game.away_score ?? 0)}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {sortedMembers.map(m => {
                    const pick = allPicks.find((p: any) => p.game_id === game.id && p.user_id === m.user_id)
                    const isMe = m.user_id === userId
                    const actual = isFinal ? (game.home_score ?? 0) + (game.away_score ?? 0) : null
                    const guess = pick?.tiebreaker_score
                    const canSee = isPickVisibleForUser(game, m.user_id)
                    const displayName = isMe ? 'You' : (m.profile?.display_name || m.profile?.username || '?')

                    return (
                      <div
                        key={m.user_id}
                        className={clsx(
                          'flex items-center gap-1.5 rounded-lg px-2 py-1.5 border min-w-0',
                          isMe ? 'border-gold/40 bg-gold/[0.07]' : 'border-field-700 bg-field-800/60',
                        )}
                      >
                        <div className="w-5 h-5 rounded-full bg-field-700 flex items-center justify-center text-[10px] font-bold text-gold overflow-hidden shrink-0">
                          {m.profile?.avatar_url
                            ? <img src={m.profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                            : displayName[0]?.toUpperCase()
                          }
                        </div>
                        <span className={clsx('font-bold text-xs truncate flex-1 min-w-0', isMe ? 'text-gold' : 'text-field-300')}>
                          {displayName}
                        </span>
                        {!canSee ? (
                          <Lock className="w-3 h-3 text-field-600 shrink-0" />
                        ) : guess == null ? (
                          <span className="text-field-600 text-xs italic shrink-0">—</span>
                        ) : (
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="font-cond font-black text-xs text-white">{guess}</span>
                            {isFinal && actual != null && (
                              <span className="text-field-500 text-[11px]">±{Math.abs(guess - actual)}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── PICKS BOARD ─────────────────────────────────────────────
// A spreadsheet: one row per member, one column per game, so you
// can scan who picked what across the whole week at a glance
// instead of paging through one card per game. First column stays
// pinned while the game columns scroll horizontally.

function PicksBoard({
  games, allPicks, leagueMembers, weekRows, userId, deadline,
}: {
  games: any[]
  allPicks: any[]
  leagueMembers: any[]
  weekRows: { userId: string; correct: number; played: number }[]
  userId: string | undefined
  deadline: string | null
}) {
  if (games.length === 0) {
    return (
      <div className="panel text-center py-8">
        <p className="text-field-400">No games scheduled this week</p>
      </div>
    )
  }

  const now = new Date()
  const sortedGames = [...games].sort(
    (a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime()
  )

  // Same reveal rule as the Results tab: your own picks are always
  // visible, everyone else's stay hidden until that specific game
  // kicks off (or the commissioner's deadline passes, if earlier).
  const isGameRevealed = (game: any): boolean => {
    const kickoff = new Date(game.game_date)
    if (deadline) {
      const dl = new Date(deadline)
      return now >= dl || now >= kickoff
    }
    return now >= kickoff
  }
  const isPickVisible = (game: any, memberId: string) =>
    memberId === userId || isGameRevealed(game)

  const sortedMembers = [...leagueMembers].sort((a, b) => {
    if (a.user_id === userId) return -1
    if (b.user_id === userId) return 1
    const nameA = a.team_name || a.profile?.display_name || a.profile?.username || ''
    const nameB = b.team_name || b.profile?.display_name || b.profile?.username || ''
    return nameA.localeCompare(nameB)
  })

  const pickMap: Record<string, Record<string, string>> = {}
  allPicks.forEach((p: any) => {
    if (!pickMap[p.game_id]) pickMap[p.game_id] = {}
    pickMap[p.game_id][p.user_id] = p.picked_team
  })

  const ptsByUser = new Map(weekRows.map(r => [r.userId, r]))

  const winnerOf = (game: any): string | null => {
    if (game.status !== 'final') return null
    if (game.home_score == null || game.away_score == null) return null
    if (game.home_score === game.away_score) return null
    return game.home_score > game.away_score ? game.home_team : game.away_team
  }

  return (
    <div className="panel p-0 overflow-x-auto">
      <table className="border-collapse text-xs w-full">
        <thead>
          <tr className="border-b border-field-700">
            <th className="sticky left-0 z-10 bg-field-800 text-left px-3 py-2 font-cond font-bold text-field-400 uppercase tracking-wider whitespace-nowrap">
              Team
            </th>
            <th className="px-2 py-2 text-center font-cond font-bold text-field-400 uppercase tracking-wider whitespace-nowrap border-l border-field-700/60">
              Pts
            </th>
            {sortedGames.map(game => {
              const isFinalGame = game.status === 'final'
              const isLive = game.status === 'in_progress'
              return (
                <th key={game.id} className="px-2 py-2 text-center min-w-[64px] border-l border-field-700/60">
                  {game.is_tiebreaker && (
                    <div className="text-[9px] font-bold text-gold uppercase tracking-wider mb-0.5">TB</div>
                  )}
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="flex items-center gap-1">
                      <span className="font-cond font-black text-[11px] text-field-300">{game.away_team}</span>
                      <span className={clsx('font-cond font-black text-[11px]', isFinalGame || isLive ? 'text-white' : 'text-field-600')}>
                        {isFinalGame || isLive ? game.away_score ?? 0 : '–'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-cond font-black text-[11px] text-field-300">{game.home_team}</span>
                      <span className={clsx('font-cond font-black text-[11px]', isFinalGame || isLive ? 'text-white' : 'text-field-600')}>
                        {isFinalGame || isLive ? game.home_score ?? 0 : '–'}
                      </span>
                    </div>
                  </div>
                  {isLive && <div className="text-[9px] font-bold text-gold mt-0.5">LIVE</div>}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sortedMembers.map(m => {
            const isMe = m.user_id === userId
            const displayName = isMe ? 'You' : (m.team_name || m.profile?.display_name || m.profile?.username || '?')
            const pts = ptsByUser.get(m.user_id)

            return (
              <tr key={m.user_id} className={clsx('border-b border-field-700/50 last:border-0', isMe && 'bg-gold/[0.04]')}>
                <td className={clsx(
                  'sticky left-0 z-10 px-3 py-2 whitespace-nowrap bg-field-800',
                  isMe && 'border-l-2 border-gold',
                )}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-field-700 flex items-center justify-center text-[10px] font-bold text-gold overflow-hidden shrink-0">
                      {m.profile?.avatar_url
                        ? <img src={m.profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                        : displayName[0]?.toUpperCase()
                      }
                    </div>
                    <span className={clsx('font-bold text-xs truncate max-w-[120px]', isMe ? 'text-gold' : 'text-white')}>
                      {displayName}
                    </span>
                  </div>
                </td>
                <td className="text-center px-2 py-2 border-l border-field-700/60">
                  <span className="font-cond font-black text-white">{pts?.correct ?? 0}</span>
                  <span className="text-field-500">/{pts?.played ?? 0}</span>
                </td>
                {sortedGames.map(game => {
                  const picked = pickMap[game.id]?.[m.user_id]
                  const visible = isPickVisible(game, m.user_id)
                  const winner = winnerOf(game)
                  const isCorrect = winner != null && picked === winner
                  const isWrong = winner != null && !!picked && picked !== winner
                  const logo = picked ? teamLogoUrl({ abbr: picked }, 'NFL') : null

                  return (
                    <td key={game.id} className="text-center px-2 py-2 border-l border-field-700/60">
                      {!visible ? (
                        <Lock className="w-3 h-3 text-field-600 mx-auto" />
                      ) : !picked ? (
                        <span className="text-field-600 text-[10px] uppercase font-bold tracking-wider">No pick</span>
                      ) : (
                        <div className={clsx(
                          'inline-flex items-center gap-1 rounded-md px-1.5 py-1',
                          isCorrect ? 'bg-nfl/15 text-nfl' : isWrong ? 'bg-red-500/10 text-red-400' : 'text-field-200',
                        )}>
                          {logo && <img src={logo} alt="" className="w-4 h-4 object-contain" />}
                          <span className="font-cond font-black text-[11px]">{picked}</span>
                          {isCorrect && <Check className="w-3 h-3" />}
                          {isWrong && <X className="w-3 h-3" />}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {sortedMembers.length === 0 && (
            <tr>
              <td colSpan={sortedGames.length + 2} className="text-center text-field-400 py-8">
                No members yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
