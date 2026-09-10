import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { buildSlotDefs } from '@/types/database'
import type { League } from '@/types/database'
import type { RosterEntryWithPlayer } from './useRoster'

// ── Per-week lineups, built on top of the permanent roster ─────────
//
// rosters.week has existed unused since the schema was written (every
// write anywhere in the app used week: 0 - see the LiveScoringView
// fix earlier this session). This finally uses it as originally
// named: week 0 is the permanent roster (ownership, IR, CFB
// Offseason, and the default starter/bench arrangement that rolls
// forward automatically); week N>0 rows, when present, are an
// explicit STARTER-slot override for that specific week only.
//
// Only starter/flex slots are ever versioned per week - bench, IR,
// and CFB Offseason are ownership-level concepts that don't make
// sense to change "just for one week" (you can't un-injure a player
// for a single week). A week's bench is therefore never stored, only
// derived: every owned, non-reserved player who isn't in a starter
// slot that week.
//
// A week is "materialized" the first time its lineup is edited (see
// RosterView) — copying the then-current starter arrangement into
// week N rows, which is what future edits for that week then modify.
// An untouched week has zero week-N rows and simply mirrors week 0,
// so a league where nobody ever touches their lineup behaves exactly
// like the single persistent roster this app had before.
export async function fetchRosterAtWeek(leagueId: string, userId: string, week: number): Promise<RosterEntryWithPlayer[]> {
  const { data, error } = await supabase
    .from('rosters')
    .select('*, player:players(*)')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('week', week)
    .order('slot')
  if (error) throw error
  return (data ?? []) as RosterEntryWithPlayer[]
}

export function useRosterAtWeek(leagueId: string | null, userId: string | null, week: number) {
  return useQuery({
    queryKey: ['roster-week', leagueId, userId, week],
    enabled: !!leagueId && !!userId,
    queryFn: () => fetchRosterAtWeek(leagueId!, userId!, week),
  })
}

export interface WeekLineup {
  starters: RosterEntryWithPlayer[]
  bench: RosterEntryWithPlayer[]
  ir: RosterEntryWithPlayer[]
  cfbOs: RosterEntryWithPlayer[]
  isMaterialized: boolean
  isLoading: boolean
}

// Combines the permanent roster (week 0) with a specific week's
// override rows (if any) into a resolved lineup for that week.
//
// week0 is passed in rather than fetched here — it's the exact same
// query useMyRoster already runs (same table, same filters), and
// fetching it separately under a different query key would drift out
// of sync with useMyRoster's cache after a drop/add/trade (whichever
// screen is showing this hook's result already has week0 loaded).
export function useWeekLineup(
  leagueId: string | null,
  userId: string | null,
  week: number,
  league: League | null,
  week0: RosterEntryWithPlayer[]
): WeekLineup {
  const isPermanentWeek = week === 0
  const { data: weekN = [], isLoading: loadingN } = useQuery({
    queryKey: ['roster-week', leagueId, userId, week],
    enabled: !!leagueId && !!userId && !isPermanentWeek,
    queryFn: () => fetchRosterAtWeek(leagueId!, userId!, week),
  })

  const starterSlotKeys = useMemo(() => {
    if (!league) return new Set<string>()
    return new Set(buildSlotDefs(league).filter(s => s.type === 'starter' || s.type === 'flex').map(s => s.key))
  }, [league])

  const ir = useMemo(() => week0.filter(r => r.slot.startsWith('IR')), [week0])
  const cfbOs = useMemo(() => week0.filter(r => r.slot.startsWith('CFB_OS')), [week0])
  const reservedPlayerIds = useMemo(
    () => new Set([...ir, ...cfbOs].map(r => r.player_id)),
    [ir, cfbOs]
  )
  const ownedPlayerIds = useMemo(() => new Set(week0.map(r => r.player_id)), [week0])

  const isMaterialized = !isPermanentWeek && weekN.length > 0

  const starters = useMemo(() => {
    const source = isPermanentWeek || !isMaterialized ? week0 : weekN
    // Drop anyone the materialized row still lists who's since been
    // dropped or moved to IR/CFB Offseason at the roster level - a
    // stale override shouldn't be able to start an unowned or
    // reserved player.
    return source.filter(r =>
      starterSlotKeys.has(r.slot) &&
      ownedPlayerIds.has(r.player_id) &&
      !reservedPlayerIds.has(r.player_id)
    )
  }, [isPermanentWeek, isMaterialized, week0, weekN, starterSlotKeys, ownedPlayerIds, reservedPlayerIds])

  const starterPlayerIds = useMemo(() => new Set(starters.map(s => s.player_id)), [starters])
  const bench = useMemo(
    () => week0.filter(r =>
      !r.slot.startsWith('IR') && !r.slot.startsWith('CFB_OS') && !starterPlayerIds.has(r.player_id)
    ),
    [week0, starterPlayerIds]
  )

  return { starters, bench, ir, cfbOs, isMaterialized, isLoading: loadingN }
}
