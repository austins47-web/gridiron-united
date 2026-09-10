import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useMyRoster, useDropPlayer, useMovePlayer, useRosterRealtime } from '@/hooks/useRoster'
import { useActualPoints } from '@/hooks/useActualPoints'
import { useWeekLineup } from '@/hooks/useWeekLineup'
import { useCurrentWeek, useCurrentCFBWeek } from '@/hooks/useLiveStats'
import { REGULAR_SEASON_WEEKS } from '@/lib/scheduling'
import { CURRENT_SEASON } from '@/lib/season'
import { teamAbbr } from '@/lib/sportsdata'
import { byeWeeksForTeam, type WeekGame } from '@/lib/byeWeeks'
import { headshotUrl } from '@/lib/playerIdentity'
import { useAppStore } from '@/store/appStore'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { buildSlotDefs, canFillSlot } from '@/types/database'
import type { RosterEntryWithPlayer } from '@/hooks/useRoster'
import type { SlotDef, League, Player } from '@/types/database'
import { usePlayerWeeklyLog } from '@/hooks/usePlayerWeeklyLog'
import { Zap, Trash2, TrendingUp, AlertCircle, AlertTriangle, ArrowLeftRight, X, ChevronRight, RotateCcw, ChevronDown, User } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

export function RosterView() {
  const { activeLeagueId, activeLeague, myMembership, user } = useAppStore()
  const { data: roster = [], isLoading } = useMyRoster(activeLeagueId)
  const dropPlayer = useDropPlayer(activeLeagueId)
  const movePlayer = useMovePlayer(activeLeagueId)
  const qc = useQueryClient()

  const [confirmDrop, setConfirmDrop] = useState<RosterEntryWithPlayer | null>(null)
  const [moving, setMoving] = useState<RosterEntryWithPlayer | null>(null)
  const [weekMoving, setWeekMoving] = useState<RosterEntryWithPlayer | null>(null)
  const [weekPickerOpen, setWeekPickerOpen] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [loadingAI, setLoadingAI] = useState(false)

  useRosterRealtime(activeLeagueId)

  // The single fantasy-week number this league is currently on — NFL's
  // live week normally, CFB's if the league is CFB-only. Matches the
  // Matchup tab's own default-week logic exactly, since both features
  // need to agree on what "this week" means. CFB's season is shorter
  // than NFL's, so late in the year CFB simply stops advancing/has no
  // games for a given week - that's handled downstream (a CFB player
  // with no game that week just shows "—" for actual points), not by
  // any special-casing here.
  const { data: liveNflWeek = 1 } = useCurrentWeek()
  const { data: liveCfbWeek = 1 } = useCurrentCFBWeek()
  const currentWeek = Math.min(Math.max(activeLeague?.player_pool === 'cfb' ? liveCfbWeek : liveNflWeek, 1), REGULAR_SEASON_WEEKS)

  const [week, setWeek] = useState(currentWeek)
  useEffect(() => { setWeek(currentWeek) }, [currentWeek])
  const isCurrentWeek = week === currentWeek
  const isPastWeek = week < currentWeek

  // Viewing/editing a week other than "now": starters + bench are
  // resolved per-week (see useWeekLineup) instead of the permanent
  // roster's slot arrangement. IR/CFB Offseason and drop/add stay
  // permanent-roster-only regardless of which week is selected (see
  // the section below) - those aren't things you'd ever want "just
  // for one week".
  const weekLineup = useWeekLineup(activeLeagueId, user?.id ?? null, week, activeLeague ?? null, roster)

  const displayStarters = isCurrentWeek
    ? roster.filter(r => !r.slot.startsWith('BN') && !r.slot.startsWith('IR') && !r.slot.startsWith('CFB_OS'))
    : weekLineup.starters

  // Points are computed for the whole roster (starters + bench), not
  // just displayStarters, so bench rows can show actual/proj too —
  // only the team TOTAL is restricted to whoever's actually starting
  // this specific week.
  const pointsRoster = isCurrentWeek ? roster : [...weekLineup.starters, ...weekLineup.bench]
  const { pointsByRosterId } = useActualPoints(pointsRoster, activeLeague, week)
  const totalActual = displayStarters.reduce((sum, r) => sum + (pointsByRosterId.get(r.id)?.points ?? 0), 0)

  // Full NFL season schedule, fetched once and shared by every row —
  // drives each player's "vs/@ OPP · day/time" line and bye week
  // number. Real ESPN-synced data (supabase/functions/sync-nfl-schedule),
  // not fetched per-team. No CFB equivalent here (hundreds of teams,
  // no existing name->abbreviation map for them), so CFB rows just
  // don't show a game line.
  const { data: seasonGames = [] } = useQuery({
    queryKey: ['nfl-games-season', CURRENT_SEASON],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nfl_games')
        .select('week, home_team, away_team, game_date, status')
        .eq('season', CURRENT_SEASON)
      if (error) throw error
      return (data ?? []) as (WeekGame & { game_date: string | null; status: string | null })[]
    },
    staleTime: 15 * 60_000,
  })

  // Real platform-wide ownership: what fraction of THIS app's fantasy
  // teams roster / start each player right now. Not an industry
  // number (no external data source for that) - genuinely computed
  // from this app's own rosters table, so it'll read low/zero until
  // there's real league activity, same as any other real metric would.
  const allPlayerIds = useMemo(() => roster.map(r => r.player_id), [roster])
  const { data: ownership } = useQuery({
    queryKey: ['ownership-stats', allPlayerIds],
    enabled: allPlayerIds.length > 0,
    queryFn: async () => {
      const [{ count: totalTeams }, { data: rows }] = await Promise.all([
        supabase.from('league_members').select('id', { count: 'exact', head: true }),
        supabase.from('rosters').select('player_id, slot').eq('week', 0).in('player_id', allPlayerIds),
      ])
      const rostered = new Map<number, number>()
      const started = new Map<number, number>()
      for (const r of (rows ?? [])) {
        if (r.player_id == null) continue
        rostered.set(r.player_id, (rostered.get(r.player_id) ?? 0) + 1)
        if (!r.slot.startsWith('BN') && !r.slot.startsWith('IR') && !r.slot.startsWith('CFB_OS')) {
          started.set(r.player_id, (started.get(r.player_id) ?? 0) + 1)
        }
      }
      return { totalTeams: totalTeams ?? 0, rostered, started }
    },
    staleTime: 5 * 60_000,
  })

  if (!activeLeagueId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <AlertCircle className="w-12 h-12 text-gold/40 mx-auto mb-4" />
        <h2 className="text-white font-bold text-lg mb-2">No league selected</h2>
        <p className="text-field-400">Select or create a league to manage your roster.</p>
      </div>
    )
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="ai-dot" /></div>
  }

  const slots = activeLeague ? buildSlotDefs(activeLeague) : []
  const rosterBySlot = new Map(roster.map(r => [r.slot, r]))

  const totalProj = displayStarters.reduce((sum, r) => sum + (r.player?.proj_pts ?? 0), 0)
  const totalAvg = displayStarters.reduce((sum, r) => sum + (r.player?.avg_pts ?? 0), 0)

  const handleGetAI = async () => {
    if (!roster.length) return
    setLoadingAI(true)
    setAiAnalysis(null)
    try {
      // Call via Supabase Edge Function — keeps the API key server-side and avoids CORS
      const { data, error } = await supabase.functions.invoke('ai-roster-analysis', {
        body: {
          roster,
          scoringType: activeLeague?.scoring_type ?? 'ppr',
          totalProj,
        },
      })
      if (error) throw error
      setAiAnalysis(data?.analysis ?? 'No analysis available.')
    } catch (err: any) {
      setAiAnalysis('Unable to load AI analysis right now. ' + (err?.message ?? ''))
    } finally {
      setLoadingAI(false)
    }
  }

  // Move handler: swap slots between two players, or move to empty slot
  const handleMoveToSlot = async (targetSlot: SlotDef) => {
    if (!moving) return
    const movingEntry = moving
    setMoving(null)

    const pos = movingEntry.player?.pos
    const league = movingEntry.player?.league
    if (!pos || !canFillSlot(targetSlot, pos as any, league as any)) {
      toast.error(
        targetSlot.type === 'cfb_os'
          ? 'Only CFB players can go in the Offseason slot'
          : `${pos} can't play in ${targetSlot.label} slot`
      )
      return
    }

    const existingInTarget = rosterBySlot.get(targetSlot.key)

    if (existingInTarget && existingInTarget.id !== movingEntry.id) {
      // Swap: use a temp slot so we never have two rows with the same slot simultaneously.
      // A→temp, B→A's old slot, A→B's old slot (now freed).
      const tempSlot = `__SWAP_${Date.now()}`
      const fromSlot = movingEntry.slot
      await movePlayer.mutateAsync({ rosterId: movingEntry.id, newSlot: tempSlot })
      await movePlayer.mutateAsync({ rosterId: existingInTarget.id, newSlot: fromSlot })
      await movePlayer.mutateAsync({ rosterId: movingEntry.id, newSlot: targetSlot.key })
    } else {
      // Simple move to empty slot
      await movePlayer.mutateAsync({ rosterId: movingEntry.id, newSlot: targetSlot.key })
    }
    toast.success('Roster updated')
  }

  // ── Weekly lineup handlers (only used while week !== currentWeek) ──
  const invalidateWeek = () => {
    qc.invalidateQueries({ queryKey: ['roster-week', activeLeagueId, user?.id, week] })
  }

  // Copies the currently-resolved starter arrangement into real week-N
  // rows, the first time a given week is ever edited — everything
  // after that point modifies those rows directly. A no-op if the
  // week already has its own rows.
  const materializeWeek = async () => {
    if (weekLineup.isMaterialized || !activeLeagueId || !user) return
    const rows = weekLineup.starters.map(r => ({
      league_id: activeLeagueId,
      user_id: user.id,
      player_id: r.player_id,
      slot: r.slot,
      week,
      acquired_type: 'draft' as const,
    }))
    if (rows.length) await supabase.from('rosters').insert(rows)
  }

  const handleWeekMoveToSlot = async (targetSlot: SlotDef) => {
    if (!weekMoving || !activeLeagueId || !user) return
    const movingEntry = weekMoving
    setWeekMoving(null)

    const pos = movingEntry.player?.pos
    const lg = movingEntry.player?.league
    if (!pos || !canFillSlot(targetSlot, pos as any, lg as any)) {
      toast.error(`${pos} can't play in ${targetSlot.label} slot`)
      return
    }

    const existingInTarget = weekLineup.starters.find(s => s.slot === targetSlot.key)
    const movingIsCurrentStarter = weekLineup.starters.some(s => s.player_id === movingEntry.player_id)
    if (existingInTarget?.player_id === movingEntry.player_id) return // no-op, already there

    await materializeWeek()

    const deleteSlot = (slot: string) =>
      supabase.from('rosters').delete()
        .eq('league_id', activeLeagueId).eq('user_id', user.id).eq('week', week).eq('slot', slot)
    const insertSlots = (rows: Array<{ player_id: number; slot: string }>) =>
      supabase.from('rosters').insert(rows.map(r => ({
        league_id: activeLeagueId, user_id: user.id, player_id: r.player_id, slot: r.slot, week, acquired_type: 'draft' as const,
      })))
    const updateSlot = (fromSlot: string, toSlot: string) =>
      supabase.from('rosters').update({ slot: toSlot })
        .eq('league_id', activeLeagueId).eq('user_id', user.id).eq('week', week).eq('slot', fromSlot)

    if (movingIsCurrentStarter) {
      if (existingInTarget) {
        // Swap two starter slots this week
        await deleteSlot(movingEntry.slot)
        await deleteSlot(targetSlot.key)
        await insertSlots([
          { player_id: existingInTarget.player_id, slot: movingEntry.slot },
          { player_id: movingEntry.player_id, slot: targetSlot.key },
        ])
      } else {
        await updateSlot(movingEntry.slot, targetSlot.key)
      }
    } else {
      // Bench player starting this week — bench whoever's currently
      // in the target slot first (delete their week-N row), then
      // place the mover there.
      if (existingInTarget) await deleteSlot(targetSlot.key)
      await insertSlots([{ player_id: movingEntry.player_id, slot: targetSlot.key }])
    }

    invalidateWeek()
    toast.success(`Lineup set for Week ${week}`)
  }

  const handleBenchThisWeek = async (entry: RosterEntryWithPlayer) => {
    if (!activeLeagueId || !user) return
    await materializeWeek()
    await supabase.from('rosters').delete()
      .eq('league_id', activeLeagueId).eq('user_id', user.id).eq('week', week).eq('slot', entry.slot)
    invalidateWeek()
    toast.success(`Benched for Week ${week}`)
  }

  const handleResetWeek = async () => {
    if (!activeLeagueId || !user) return
    await supabase.from('rosters').delete()
      .eq('league_id', activeLeagueId).eq('user_id', user.id).eq('week', week)
    invalidateWeek()
    toast.success(`Week ${week} reverted to your default lineup`)
  }

  // Sections
  const starterSlots = slots.filter(s => s.type === 'starter' || s.type === 'flex')
  const benchSlots   = slots.filter(s => s.type === 'bench')
  const irSlots      = slots.filter(s => s.type === 'ir')
  const cfbOsSlots   = slots.filter(s => s.type === 'cfb_os')

  // ── Roster limit logic (Sleeper-style) ───────────────────────────────
  // IR and CFB_OS slots do NOT count against roster limit
  const rosterLimit = starterSlots.length + benchSlots.length
  const activePlayers = roster.filter(r =>
    !r.slot.startsWith('IR') && !r.slot.startsWith('CFB_OS')
  )
  const isOverRosterLimit = activePlayers.length > rosterLimit
  const overBy = activePlayers.length - rosterLimit
  // While over limit: moves are locked (must drop first)
  const rosterLocked = isOverRosterLimit && !moving

  // ── IR / CFB_OS health warning logic ─────────────────────────────────
  // IR warning: player in IR slot who is now healthy (status === 'active')
  const healthyOnIR = roster.filter(r =>
    r.slot.startsWith('IR') && r.player?.status === 'active'
  )
  // CFB_OS warning: player in CFB_OS slot whose team's season has started
  // (proj_pts > 0 means they are in-season — simple heuristic)
  const activeOnCfbOs = roster.filter(r =>
    r.slot.startsWith('CFB_OS') && (r.player?.proj_pts ?? 0) > 0
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="section-title">{myMembership?.team_name ?? 'My Roster'}</h1>
          <p className="text-field-400 text-sm mt-1">{activeLeague?.name}</p>
        </div>
        <div className="flex gap-3">
          <div className="bg-field-800 border border-field-700 rounded-lg px-4 py-2 text-center">
            <div className="text-xs text-field-400">Actual</div>
            <div className="text-nfl font-black text-xl">{totalActual.toFixed(1)}</div>
          </div>
          <div className="bg-field-800 border border-field-700 rounded-lg px-4 py-2 text-center">
            <div className="text-xs text-field-400">Projected</div>
            <div className="text-gold font-black text-xl">{totalProj.toFixed(1)}</div>
          </div>
          <div className="bg-field-800 border border-field-700 rounded-lg px-4 py-2 text-center">
            <div className="text-xs text-field-400">Avg/Wk</div>
            <div className="text-white font-black text-xl">{totalAvg.toFixed(1)}</div>
          </div>
        </div>
      </div>

      {/* Weekly lineup move mode banner */}
      {weekMoving && (
        <div className="bg-gold/10 border border-gold/40 rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-gold" />
            <span className="text-gold font-bold text-sm">
              Moving <span className="text-white">{weekMoving.player?.name}</span>
              {' '}for Week {week} — click a highlighted slot to place, or cancel
            </span>
          </div>
          <button className="btn-ghost !py-1 !px-2 text-field-400" onClick={() => setWeekMoving(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Move mode banner */}
      {moving && (
        <div className="bg-gold/10 border border-gold/40 rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-gold" />
            <span className="text-gold font-bold text-sm">
              Moving <span className="text-white">{moving.player?.name}</span>
              {' '}— click a highlighted slot to place, or cancel
            </span>
          </div>
          <button className="btn-ghost !py-1 !px-2 text-field-400" onClick={() => setMoving(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Over roster limit banner */}
      {isOverRosterLimit && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl px-4 py-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-red-300 font-bold text-sm">
              You are {overBy} player{overBy > 1 ? 's' : ''} over the roster limit ({rosterLimit} active spots)
            </span>
          </div>
          <p className="text-red-400/80 text-xs pl-6">
            Moving players is locked until you drop {overBy} player{overBy > 1 ? 's' : ''}.
            IR and CFB Offseason slots do not count toward the limit — you can move players there without dropping.
          </p>
          <div className="pl-6 flex flex-wrap gap-2 mt-1">
            {activePlayers.slice(0, overBy + 2).map(r => (
              <span key={r.id} className="text-xs bg-red-500/20 border border-red-500/30 text-red-300 px-2 py-0.5 rounded-full font-bold">
                {r.player?.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Healthy player on IR banner */}
      {healthyOnIR.length > 0 && (
        <div className="bg-gold/10 border border-gold/40 rounded-xl px-4 py-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-gold shrink-0" />
            <span className="text-gold font-bold text-sm">
              {healthyOnIR.length} player{healthyOnIR.length > 1 ? 's' : ''} in IR {healthyOnIR.length > 1 ? 'are' : 'is'} healthy
            </span>
          </div>
          <p className="text-gold/80 text-xs pl-6">
            Move {healthyOnIR.length > 1 ? 'these players' : 'this player'} back to your active roster or bench — IR is only for injured players.
          </p>
          <div className="pl-6 flex flex-wrap gap-2">
            {healthyOnIR.map(r => (
              <span key={r.id} className="text-xs bg-gold/20 border border-gold/30 text-gold px-2 py-0.5 rounded-full font-bold">
                {r.player?.name} ({r.player?.team})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Active player stuck in CFB Offseason banner */}
      {activeOnCfbOs.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/40 rounded-xl px-4 py-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-blue-300 font-bold text-sm">
              {activeOnCfbOs.length} player{activeOnCfbOs.length > 1 ? 's' : ''} in CFB Offseason {activeOnCfbOs.length > 1 ? 'have' : 'has'} started their season
            </span>
          </div>
          <p className="text-blue-400/80 text-xs pl-6">
            {activeOnCfbOs.length > 1 ? 'These players are' : 'This player is'} earning points but stuck in your CFB Offseason slot — move {activeOnCfbOs.length > 1 ? 'them' : 'them'} to an active slot to count their score.
          </p>
          <div className="pl-6 flex flex-wrap gap-2">
            {activeOnCfbOs.map(r => (
              <span key={r.id} className="text-xs bg-blue-500/20 border border-blue-500/30 text-blue-300 px-2 py-0.5 rounded-full font-bold">
                {r.player?.name} ({r.player?.team})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AI Analysis */}
      <div className="panel">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-gold" />
            <span className="font-bold text-white">AI Roster Analysis</span>
          </div>
          <button className="btn-gold text-sm" onClick={handleGetAI} disabled={loadingAI || roster.length === 0}>
            {loadingAI ? <span className="flex items-center gap-2"><span className="ai-dot" /> Analyzing…</span> : 'Get Analysis'}
          </button>
        </div>
        {aiAnalysis
          ? <div className="text-field-200 text-sm leading-relaxed whitespace-pre-wrap mt-3 border-t border-field-700 pt-3">{aiAnalysis}</div>
          : <p className="text-field-400 text-sm">{roster.length === 0 ? 'Add players to get AI analysis.' : 'Get personalized advice on your starters, bench, and waiver targets.'}</p>
        }
      </div>

      {isCurrentWeek ? (
        <>
          {/* Starters */}
          {starterSlots.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <div className="text-xs font-bold text-field-400 uppercase tracking-wider">Starters</div>
                  <div className="text-[11px] text-field-500">Tap a player to update your lineup</div>
                </div>
                <WeekPicker
                  week={week} setWeek={setWeek} isOpen={weekPickerOpen} setIsOpen={setWeekPickerOpen}
                  currentWeek={currentWeek} isPastWeek={isPastWeek}
                  isMaterialized={weekLineup.isMaterialized} onReset={handleResetWeek}
                />
              </div>
              <div className="grid gap-1">
                {starterSlots.map(slot => (
                  <RosterSlotRow
                    key={slot.key}
                    slot={slot}
                    entry={rosterBySlot.get(slot.key)}
                    actualPoints={pointsByRosterId}
                league={activeLeague ?? null}
                week={week}
                seasonGames={seasonGames}
                ownership={ownership}
                    moving={moving}
                    locked={rosterLocked}
                    onMove={(e) => { if (!rosterLocked) setMoving(e) }}
                    onDropToSlot={handleMoveToSlot}
                    onDrop={setConfirmDrop}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Bench */}
          {benchSlots.length > 0 && (
            <div>
              <div className="text-xs font-bold text-field-400 uppercase tracking-wider mb-2">Bench</div>
              <div className="grid gap-1">
                {benchSlots.map(slot => (
                  <RosterSlotRow
                    key={slot.key}
                    slot={slot}
                    entry={rosterBySlot.get(slot.key)}
                    actualPoints={pointsByRosterId}
                league={activeLeague ?? null}
                week={week}
                seasonGames={seasonGames}
                ownership={ownership}
                    moving={moving}
                    locked={rosterLocked}
                    onMove={(e) => { if (!rosterLocked) setMoving(e) }}
                    onDropToSlot={handleMoveToSlot}
                    onDrop={setConfirmDrop}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Starters for the selected week — swap-only, no drop; benching
              here just un-starts a player for this week, it doesn't touch
              your permanent roster */}
          {starterSlots.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <div className="text-xs font-bold text-field-400 uppercase tracking-wider">Starters</div>
                  <div className="text-[11px] text-field-500">
                    {isPastWeek ? 'Past week — view only' : 'Tap a player to update this week\'s lineup'}
                  </div>
                </div>
                <WeekPicker
                  week={week} setWeek={setWeek} isOpen={weekPickerOpen} setIsOpen={setWeekPickerOpen}
                  currentWeek={currentWeek} isPastWeek={isPastWeek}
                  isMaterialized={weekLineup.isMaterialized} onReset={handleResetWeek}
                />
              </div>
              <div className="grid gap-1">
                {starterSlots.map(slot => {
                  const entry = weekLineup.starters.find(s => s.slot === slot.key)
                  return (
                    <RosterSlotRow
                      key={slot.key}
                      slot={slot}
                      entry={entry}
                      actualPoints={pointsByRosterId}
                league={activeLeague ?? null}
                week={week}
                seasonGames={seasonGames}
                ownership={ownership}
                      moving={weekMoving}
                      locked={false}
                      readOnly={isPastWeek}
                      onMove={setWeekMoving}
                      onDropToSlot={handleWeekMoveToSlot}
                      onDrop={isPastWeek ? undefined : (e) => handleBenchThisWeek(e)}
                      dropLabel="Bench this week"
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Bench for the selected week — derived, not stored: anyone
              owned and active who isn't starting this week */}
          {benchSlots.length > 0 && (
            <div>
              <div className="text-xs font-bold text-field-400 uppercase tracking-wider mb-2">Bench</div>
              <div className="grid gap-1">
                {benchSlots.map((slot, i) => {
                  const entry = weekLineup.bench[i]
                  return (
                    <RosterSlotRow
                      key={slot.key}
                      slot={slot}
                      entry={entry}
                      actualPoints={pointsByRosterId}
                league={activeLeague ?? null}
                week={week}
                seasonGames={seasonGames}
                ownership={ownership}
                      moving={weekMoving}
                      locked={false}
                      readOnly={isPastWeek}
                      blockTargeting
                      onMove={setWeekMoving}
                      onDropToSlot={handleWeekMoveToSlot}
                    />
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* IR */}
      {irSlots.length > 0 && (
        <div>
          <div className="text-xs font-bold text-field-400 uppercase tracking-wider mb-2">Injured Reserve</div>
          <div className="grid gap-1">
            {irSlots.map(slot => (
              <RosterSlotRow
                key={slot.key}
                slot={slot}
                entry={rosterBySlot.get(slot.key)}
                actualPoints={pointsByRosterId}
                league={activeLeague ?? null}
                week={week}
                seasonGames={seasonGames}
                ownership={ownership}
                moving={moving}
                locked={rosterLocked}
                onMove={(e) => { if (!rosterLocked) setMoving(e) }}
                onDropToSlot={handleMoveToSlot}
                onDrop={setConfirmDrop}
              />
            ))}
          </div>
        </div>
      )}

      {/* CFB Offseason — only show if league has these slots configured */}
      {cfbOsSlots.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-cfb uppercase tracking-wider">🎓 CFB Offseason</span>
            <span className="text-xs text-field-500">— players held here don't score but don't count vs active roster</span>
          </div>
          <div className="grid gap-1">
            {cfbOsSlots.map(slot => (
              <RosterSlotRow
                key={slot.key}
                slot={slot}
                entry={rosterBySlot.get(slot.key)}
                actualPoints={pointsByRosterId}
                league={activeLeague ?? null}
                week={week}
                seasonGames={seasonGames}
                ownership={ownership}
                moving={moving}
                locked={rosterLocked}
                onMove={(e) => { if (!rosterLocked) setMoving(e) }}
                onDropToSlot={handleMoveToSlot}
                onDrop={setConfirmDrop}
              />
            ))}
          </div>
        </div>
      )}

      {roster.length === 0 && (
        <div className="panel text-center py-8">
          <TrendingUp className="w-10 h-10 text-gold/30 mx-auto mb-3" />
          <p className="text-white font-bold mb-1">Roster is empty</p>
          <p className="text-field-400 text-sm">Head to the Players tab to add players, or wait for the draft.</p>
        </div>
      )}

      {/* Drop confirmation */}
      {confirmDrop && (
        <ModalPortal onClose={() => setConfirmDrop(null)}>
          <div className="modal-box max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="section-title mb-2">Drop Player?</h3>
            <p className="text-field-300 mb-1">
              <span className="text-white font-bold">{confirmDrop.player.name}</span> will be released
              to the free agent pool. This cannot be undone.
            </p>
            <div className="flex gap-2 mt-4">
              <button className="btn-ghost flex-1" onClick={() => setConfirmDrop(null)}>Cancel</button>
              <button
                className="btn-danger flex-1"
                onClick={async () => {
                  await dropPlayer.mutateAsync({ rosterId: confirmDrop.id, playerName: confirmDrop.player.name })
                  setConfirmDrop(null)
                }}
              >
                Drop
              </button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}

// Compact "Week 1 ›" control — tap to open a dropdown of every
// regular-season week instead of stepping one at a time.
function WeekPicker({
  week, setWeek, isOpen, setIsOpen, currentWeek, isPastWeek, isMaterialized, onReset,
}: {
  week: number
  setWeek: (updater: (w: number) => number) => void
  isOpen: boolean
  setIsOpen: (v: boolean) => void
  currentWeek: number
  isPastWeek: boolean
  isMaterialized: boolean
  onReset: () => void
}) {
  const weeks = Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) => i + 1)
  return (
    <div className="relative shrink-0">
      <button
        className="flex items-center gap-0.5 text-sm font-bold text-nfl"
        onClick={() => setIsOpen(!isOpen)}
      >
        Week {week}
        <ChevronRight className={clsx('w-3.5 h-3.5 transition-transform', isOpen && 'rotate-90')} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-field-800 border border-field-700 rounded-lg shadow-2xl w-40 max-h-64 overflow-y-auto py-1">
            {!isPastWeek && isMaterialized && (
              <button
                className="w-full text-left px-3 py-1.5 text-xs text-field-400 hover:bg-field-700 hover:text-white flex items-center gap-1.5 border-b border-field-700/60"
                onClick={() => { onReset(); setIsOpen(false) }}
              >
                <RotateCcw className="w-3 h-3" /> Reset to default
              </button>
            )}
            {weeks.map(w => (
              <button
                key={w}
                className={clsx(
                  'w-full text-left px-3 py-1.5 text-sm flex items-center justify-between',
                  w === week ? 'text-nfl font-bold bg-nfl/10' : 'text-white hover:bg-field-700',
                )}
                onClick={() => { setWeek(() => w); setIsOpen(false) }}
              >
                Week {w}
                {w === currentWeek && <span className="text-[10px] text-field-500 font-bold uppercase">Now</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function RosterSlotRow({
  slot, entry, actualPoints, league, week, seasonGames, ownership, moving, locked, readOnly, blockTargeting, onMove, onDropToSlot, onDrop, dropLabel,
}: {
  slot: SlotDef
  entry: RosterEntryWithPlayer | undefined
  actualPoints: Map<string, { points: number | null; stats: any | null }>
  league: League | null
  week: number
  seasonGames: (WeekGame & { game_date: string | null; status: string | null })[]
  ownership?: { totalTeams: number; rostered: Map<number, number>; started: Map<number, number> }
  moving: RosterEntryWithPlayer | null
  locked: boolean
  readOnly?: boolean
  // Week-view bench rows: clickable to START a move, but never a
  // valid drop TARGET — week rows only ever represent starter-slot
  // overrides, so accepting a drop here would write a bench-slot-keyed
  // row into the week table, breaking that invariant. "Benching" a
  // starter for the week goes through the dedicated action button
  // instead (onDrop/dropLabel), not slot-click targeting.
  blockTargeting?: boolean
  onMove: (e: RosterEntryWithPlayer) => void
  onDropToSlot: (slot: SlotDef) => void
  onDrop?: (e: RosterEntryWithPlayer) => void
  dropLabel?: string
}) {
  const player = entry?.player
  const [expanded, setExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)

  // "Wed 8:15 PM vs KC (10)" style line — NFL only (see the
  // seasonGames query comment for why CFB doesn't get one). Bye week
  // number comes from the same season schedule, not a separate table.
  const gameInfo = useMemo(() => {
    // Guard against the schedule query's brief pre-load window - with
    // zero games loaded yet, byeWeeksForTeam would otherwise call
    // every team on bye every week (no games = no weeks playing).
    if (!player || player.league !== 'NFL' || !player.team || seasonGames.length === 0) return null
    const abbr = teamAbbr(player.team)
    const byeWeek = byeWeeksForTeam(seasonGames, abbr)[0] ?? null
    const thisWeekGame = seasonGames.find(g => g.week === week && (g.home_team === abbr || g.away_team === abbr))
    if (!thisWeekGame) return { abbr, byeWeek, isBye: true as const, dateLabel: '', matchup: byeWeek ? `Bye Week ${byeWeek}` : 'Bye' }
    const opp = thisWeekGame.home_team === abbr ? thisWeekGame.away_team : thisWeekGame.home_team
    const prefix = thisWeekGame.home_team === abbr ? 'vs' : '@'
    const dt = thisWeekGame.game_date ? new Date(thisWeekGame.game_date) : null
    const dateLabel = dt ? dt.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : ''
    return { abbr, byeWeek, isBye: false as const, dateLabel, matchup: `${prefix} ${opp}` }
  }, [player, seasonGames, week])

  const rosteredPct = player && ownership?.totalTeams
    ? Math.round(((ownership.rostered.get(player.id) ?? 0) / ownership.totalTeams) * 100)
    : null
  const startPct = player && ownership?.totalTeams
    ? Math.round(((ownership.started.get(player.id) ?? 0) / ownership.totalTeams) * 100)
    : null

  // Is this a valid target for the player being moved?
  const isValidTarget = !blockTargeting && moving && canFillSlot(slot, moving.player?.pos as any, moving.player?.league as any)
  // Is this the slot the moving player is currently in? (source)
  const isSource = moving && entry?.id === moving.id
  // Is this an occupied slot we could swap with?
  const isSwapTarget = isValidTarget && entry && !isSource

  // IR and CFB_OS slots are always moveable even when over roster limit
  const isExemptSlot = slot.type === 'ir' || slot.type === 'cfb_os'
  const effectiveLocked = (locked && !isExemptSlot && !moving) || !!readOnly

  const handleClick = () => {
    if (effectiveLocked) return
    if (moving) {
      if (isSource) { return }
      if (isValidTarget) onDropToSlot(slot)
      return
    }
    if (entry) onMove(entry)
  }

  return (
    <>
    <div
      onClick={handleClick}
      className={clsx(
        'roster-slot group transition-all',
        // Locked state (over roster limit, non-exempt slot)
        effectiveLocked && entry && 'opacity-50 cursor-not-allowed',
        effectiveLocked && !entry && 'opacity-30',
        // Move mode visual states (only when not locked)
        !effectiveLocked && moving && isSource && 'ring-2 ring-gold/60 bg-gold/5 opacity-70',
        !effectiveLocked && moving && isValidTarget && !isSource && 'ring-2 ring-green-400/50 bg-nfl/5 cursor-pointer hover:bg-nfl/10',
        !effectiveLocked && moving && !isValidTarget && !isSource && 'opacity-40 cursor-not-allowed',
        !effectiveLocked && !moving && entry && 'cursor-pointer hover:bg-field-800/60',
        !player && !effectiveLocked && 'opacity-60',
      )}
    >
      {/* Slot label */}
      <div className="w-12 shrink-0">
        <span className={clsx(
          'pos-badge text-xs',
          slot.key.startsWith('BN') ? 'pos-BN' : slot.key.startsWith('IR') ? 'pos-IR' : `pos-${slot.pos[0]}`,
        )}>
          {slot.label}
        </span>
      </div>

      {/* Player info or move hint */}
      <div className="flex-1 min-w-0">
        {player ? (
          <div className="flex items-center gap-2.5">
            {/* Headshot */}
            <div className="w-9 h-9 rounded-full bg-field-700 border border-field-600 overflow-hidden shrink-0 flex items-center justify-center">
              {!imgError ? (
                <img
                  src={headshotUrl(player)}
                  alt=""
                  className="w-full h-full object-cover object-top"
                  onError={() => setImgError(true)}
                />
              ) : (
                <User className="w-4 h-4 text-field-500" />
              )}
            </div>

            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate leading-tight">
                {player.name}
                <span className="font-normal text-field-400">
                  {' '}<span className={player.league === 'NFL' ? 'text-nfl' : 'text-cfb'}>{player.pos}</span>
                  {' - '}{gameInfo?.abbr ?? player.team}
                  {gameInfo?.byeWeek ? ` (${gameInfo.byeWeek})` : ''}
                </span>
                {player.status !== 'active' && (
                  <span className={clsx('ml-1 font-bold uppercase text-[11px]',
                    player.status === 'questionable' ? 'text-gold' : 'text-red-400')}>
                    {player.status === 'questionable' ? 'Q' : player.status.toUpperCase()}
                  </span>
                )}
              </div>

              {rosteredPct !== null && (
                <div className="text-[12px] text-field-400 leading-tight mt-0.5">
                  <span className="font-bold text-white">{rosteredPct}%</span> Rostered · <span className="font-bold text-white">{startPct}%</span> Start
                </div>
              )}

              {gameInfo && (
                <div className={clsx('text-[12px] leading-tight mt-0.5', gameInfo.isBye ? 'text-field-500' : 'text-field-400')}>
                  {gameInfo.isBye ? gameInfo.matchup : (
                    <>
                      {gameInfo.dateLabel}{' '}
                      <span className="text-field-300">{gameInfo.matchup}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <span className={clsx('text-sm italic',
            moving && isValidTarget ? 'text-nfl font-bold' : 'text-field-500')}>
            {moving && isValidTarget ? '↓ Place here' : 'Empty'}
          </span>
        )}
      </div>

      {/* Swap indicator */}
      {isSwapTarget && (
        <div className="shrink-0 text-nfl text-xs font-bold px-1">↕ Swap</div>
      )}

      {/* Locked indicator */}
      {effectiveLocked && entry && !readOnly && (
        <div className="shrink-0 text-red-400/60 text-xs font-bold px-1" title="Drop a player to unlock moves">
          🔒
        </div>
      )}

      {/* Points — actual on top (dash until the game's played), projection below */}
      {player && !moving && (() => {
        const actual = entry ? actualPoints.get(entry.id)?.points ?? null : null
        return (
          <div className="text-right shrink-0 leading-tight">
            <div className={clsx('text-sm', actual !== null ? 'text-white font-bold' : 'text-field-500')}>
              {actual !== null ? actual.toFixed(1) : '—'}
            </div>
            <div className="text-sm font-bold text-field-300">{player.proj_pts?.toFixed(1) ?? '—'}</div>
          </div>
        )
      })()}

      {/* Week-by-week breakdown toggle */}
      {player && !moving && (
        <button
          className="btn-ghost !py-1 !px-1.5 text-field-500 hover:text-white shrink-0"
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
          title={expanded ? 'Hide week-by-week' : 'Show week-by-week'}
        >
          <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      )}

      {/* Actions — only shown when NOT in move mode */}
      {entry && !moving && !readOnly && (
        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!effectiveLocked && (
            <button
              className="btn-ghost !py-1 !px-2 text-field-400 hover:text-white"
              onClick={e => { e.stopPropagation(); onMove(entry) }}
              title="Move player"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>
          )}
          {onDrop && (
            <button
              className="btn-ghost !py-1 !px-2 text-red-400 hover:text-red-300"
              onClick={e => { e.stopPropagation(); onDrop(entry) }}
              title={dropLabel ?? 'Drop player'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>

    {expanded && player && <WeeklyBreakdown player={player} league={league} />}
    </>
  )
}

// Full-season, week-by-week Proj/Actual for one player, shown inline
// when a roster row is expanded — the top-of-page totals are only a
// sum for whichever single week is selected, this is every week at
// once. Proj is the same flat per-game number every week (there's no
// week-varying projection model), Actual is real and pulled from
// live_player_stats via usePlayerWeeklyLog, using the league's own
// scoring rules so it always matches what the row above shows for
// the currently selected week.
function WeeklyBreakdown({ player, league }: { player: Player; league: League | null }) {
  const { data: byWeek, isLoading } = usePlayerWeeklyLog(player, league, true)
  const weeks = Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) => i + 1)

  return (
    <div className="mx-2 mb-2 -mt-1 bg-field-900/70 border border-field-700/60 rounded-lg overflow-x-auto">
      <table className="text-xs w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left text-field-500 font-bold uppercase px-2 py-1.5 sticky left-0 bg-field-900/70">Week</th>
            {weeks.map(w => (
              <th key={w} className="text-center text-field-500 font-bold px-1.5 py-1.5 min-w-[34px]">{w}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-field-700/40">
            <td className="text-field-400 font-bold px-2 py-1.5 sticky left-0 bg-field-900/70">Proj</td>
            {weeks.map(w => (
              <td key={w} className="text-center text-white px-1.5 py-1.5 tabular-nums">
                {player.proj_pts ? player.proj_pts.toFixed(1) : '—'}
              </td>
            ))}
          </tr>
          <tr className="border-t border-field-700/40">
            <td className="text-field-400 font-bold px-2 py-1.5 sticky left-0 bg-field-900/70">Actual</td>
            {weeks.map(w => {
              const pts = byWeek?.get(w) ?? null
              return (
                <td key={w} className={clsx(
                  'text-center px-1.5 py-1.5 tabular-nums font-bold',
                  pts !== null ? 'text-nfl' : 'text-field-600',
                )}>
                  {isLoading ? '…' : pts !== null ? pts.toFixed(1) : '—'}
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
