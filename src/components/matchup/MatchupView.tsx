import { useMemo, useState, useEffect } from 'react'
import { useAppStore } from '@/store/appStore'
import { supabase } from '@/lib/supabase'
import { useMyRoster, useRoster } from '@/hooks/useRoster'
import { useActualPoints } from '@/hooks/useActualPoints'
import { useWeekLineup } from '@/hooks/useWeekLineup'
import { useMyMatchups, useLeagueMemberLabels, useMatchupsRealtime } from '@/hooks/useMatchup'
import { useCurrentWeek, useCurrentCFBWeek } from '@/hooks/useLiveStats'
import { REGULAR_SEASON_WEEKS } from '@/lib/scheduling'
import { buildSlotDefs } from '@/types/database'
import { AlertCircle, ChevronLeft, ChevronRight, Swords, Trophy } from 'lucide-react'
import clsx from 'clsx'

export function MatchupView() {
  const { activeLeagueId, activeLeague, user, myMembership } = useAppStore()

  const { data: nflWeek = 1 } = useCurrentWeek()
  const { data: cfbWeek = 1 } = useCurrentCFBWeek()
  // Fantasy week number is NFL's unless this league is CFB-only — the
  // two leagues' week numbering runs compatibly in practice (both
  // reach "week 1" together at the start of the season), so no
  // per-week conversion table is needed, just which clock to read.
  const liveWeek = activeLeague?.player_pool === 'cfb' ? cfbWeek : nflWeek
  const defaultWeek = Math.min(Math.max(liveWeek, 1), REGULAR_SEASON_WEEKS)

  const [week, setWeek] = useState(defaultWeek)
  useEffect(() => { setWeek(defaultWeek) }, [defaultWeek])

  const { data: myMatchups = [], isLoading: matchupsLoading } = useMyMatchups(activeLeagueId, user?.id ?? null)
  const { data: memberLabels } = useLeagueMemberLabels(activeLeagueId)
  useMatchupsRealtime(activeLeagueId, user?.id ?? null)

  const matchup = myMatchups.find(m => m.week === week)
  const isHome = matchup?.home_user_id === user?.id
  const opponentId = matchup ? (isHome ? matchup.away_user_id : matchup.home_user_id) : null
  const opponentLabel = opponentId ? memberLabels?.get(opponentId) : null

  const { data: myRoster = [] } = useMyRoster(activeLeagueId)
  const { data: oppRoster = [] } = useRoster(activeLeagueId, opponentId)

  // Starters resolved for the SPECIFIC week being viewed (see
  // useWeekLineup) - a matchup should score whatever lineup each side
  // actually set for that week, not just their permanent roster's
  // current default.
  const myWeek = useWeekLineup(activeLeagueId, user?.id ?? null, week, activeLeague ?? null, myRoster)
  const oppWeek = useWeekLineup(activeLeagueId, opponentId, week, activeLeague ?? null, oppRoster)

  const { pointsByRosterId: myPoints, startersTotal: myTotal } = useActualPoints(myWeek.starters, activeLeague ?? null, week)
  const { pointsByRosterId: oppPoints, startersTotal: oppTotal } = useActualPoints(oppWeek.starters, activeLeague ?? null, week)

  // Opportunistically write the freshly computed score back onto the
  // matchup row for the current week AND any already-played past week
  // (never a future one - those are legitimately 0-0 and there's no
  // point persisting that repeatedly) - matchups.home_score/away_score
  // has never had a writer anywhere in the app, so the Home
  // dashboard's matchup widget and the League Hall of Fame view (both
  // already read these columns) have only ever shown 0, including for
  // weeks that already finished before this was fixed. Skipped
  // entirely if either side's total is still 0/0 with no roster data,
  // so an empty roster doesn't stomp real numbers written by the
  // opponent's own client.
  useEffect(() => {
    if (!matchup || !opponentId || week > defaultWeek) return
    if (myRoster.length === 0 || oppRoster.length === 0) return
    const homeScore = isHome ? myTotal : oppTotal
    const awayScore = isHome ? oppTotal : myTotal
    if (matchup.home_score === homeScore && matchup.away_score === awayScore) return
    supabase.from('matchups').update({ home_score: homeScore, away_score: awayScore }).eq('id', matchup.id)
      .then(({ error }) => { if (error) console.error('Matchup score write-back failed:', error.message) })
  }, [matchup, opponentId, week, defaultWeek, isHome, myTotal, oppTotal, myRoster.length, oppRoster.length])

  const starterSlots = useMemo(
    () => activeLeague ? buildSlotDefs(activeLeague).filter(s => s.type === 'starter' || s.type === 'flex') : [],
    [activeLeague]
  )
  const myBySlot = useMemo(() => new Map(myWeek.starters.map(r => [r.slot, r])), [myWeek.starters])
  const oppBySlot = useMemo(() => new Map(oppWeek.starters.map(r => [r.slot, r])), [oppWeek.starters])

  const weeksWithGames = useMemo(() => new Set(myMatchups.map(m => m.week)), [myMatchups])

  if (!activeLeagueId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <AlertCircle className="w-12 h-12 text-gold/40 mx-auto mb-4" />
        <h2 className="text-white font-bold text-lg mb-2">No league selected</h2>
        <p className="text-field-400">Select or create a league to see your matchup.</p>
      </div>
    )
  }

  if (matchupsLoading) {
    return <div className="flex items-center justify-center h-64"><div className="ai-dot" /></div>
  }

  if (myMatchups.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <Swords className="w-12 h-12 text-gold/40 mx-auto mb-4" />
        <h2 className="text-white font-bold text-lg mb-2">No schedule yet</h2>
        <p className="text-field-400">
          {activeLeague?.draft_status === 'completed'
            ? 'The season schedule hasn\'t been generated for this league yet.'
            : 'Your matchup schedule is created once the draft is complete.'}
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header / week selector */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="section-title">Matchup</h1>
          <p className="text-field-400 text-sm mt-1">{activeLeague?.name}</p>
        </div>
        <div className="flex items-center gap-2 bg-field-800 border border-field-700 rounded-lg px-2 py-1.5">
          <button className="btn-ghost !py-1 !px-2" disabled={week <= 1} onClick={() => setWeek(w => Math.max(1, w - 1))}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-white w-20 text-center">Week {week}</span>
          <button className="btn-ghost !py-1 !px-2" disabled={week >= REGULAR_SEASON_WEEKS} onClick={() => setWeek(w => Math.min(REGULAR_SEASON_WEEKS, w + 1))}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!matchup ? (
        <div className="panel text-center py-10">
          <Trophy className="w-10 h-10 text-gold/30 mx-auto mb-3" />
          <p className="text-white font-bold mb-1">Bye Week</p>
          <p className="text-field-400 text-sm">
            {weeksWithGames.has(week)
              ? "You're not scheduled this week."
              : `You don't have a matchup in Week ${week}.`}
          </p>
        </div>
      ) : (
        <>
          {/* Score header */}
          <div className="panel">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="text-center min-w-0">
                <div className="text-white font-bold truncate">{myMembership?.team_name ?? 'My Team'}</div>
                <div className={clsx(
                  'font-cond font-black text-4xl mt-1',
                  myTotal > oppTotal ? 'text-nfl' : 'text-white',
                )}>{myTotal.toFixed(1)}</div>
              </div>
              <div className="text-field-500 font-black text-sm px-2">VS</div>
              <div className="text-center min-w-0">
                <div className="text-white font-bold truncate">
                  {opponentLabel?.team_name ?? opponentLabel?.profiles?.display_name ?? opponentLabel?.profiles?.username ?? 'Opponent'}
                </div>
                <div className={clsx(
                  'font-cond font-black text-4xl mt-1',
                  oppTotal > myTotal ? 'text-nfl' : 'text-white',
                )}>{oppTotal.toFixed(1)}</div>
              </div>
            </div>
            {opponentLabel && (
              <div className="text-center text-field-500 text-xs mt-3">
                {opponentLabel.wins ?? 0}-{opponentLabel.losses ?? 0}{opponentLabel.ties ? `-${opponentLabel.ties}` : ''} record
              </div>
            )}
          </div>

          {/* Starter-by-starter comparison */}
          <div className="space-y-1">
            {starterSlots.map(slot => {
              const myEntry = myBySlot.get(slot.key)
              const oppEntry = oppBySlot.get(slot.key)
              const myPts = myEntry ? myPoints.get(myEntry.id)?.points ?? null : null
              const oppPts = oppEntry ? oppPoints.get(oppEntry.id)?.points ?? null : null
              const myWinning = myPts !== null && (oppPts === null || myPts > oppPts)
              const oppWinning = oppPts !== null && (myPts === null || oppPts > myPts)

              return (
                <div key={slot.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-field-800 border border-field-700 rounded-xl px-3 py-2.5">
                  {/* Mine */}
                  <PlayerCell entry={myEntry} points={myPts} winning={myWinning} align="left" />

                  <span className="text-[11px] font-bold text-field-500 uppercase tracking-wider px-1 shrink-0">{slot.label}</span>

                  {/* Opponent */}
                  <PlayerCell entry={oppEntry} points={oppPts} winning={oppWinning} align="right" />
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function PlayerCell({ entry, points, winning, align }: {
  entry: { player?: any } | undefined
  points: number | null
  winning: boolean
  align: 'left' | 'right'
}) {
  const p = entry?.player
  const pointsEl = (
    <div className={clsx('font-cond font-black text-lg shrink-0', winning ? 'text-nfl' : points !== null ? 'text-white' : 'text-field-600')}>
      {points !== null ? points.toFixed(1) : '—'}
    </div>
  )
  const infoEl = p ? (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className={clsx('pos-badge text-xs shrink-0', `pos-${p.pos}`)}>{p.pos}</span>
        <span className="text-sm font-bold text-white truncate">{p.name}</span>
      </div>
      <div className="text-xs text-field-400 truncate">{p.team}</div>
    </div>
  ) : (
    <span className="text-sm italic text-field-500">Empty</span>
  )

  return (
    <div className={clsx('flex items-center gap-2 min-w-0', align === 'right' && 'flex-row-reverse text-right')}>
      {pointsEl}
      {infoEl}
    </div>
  )
}
