import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import { useMyLeagues } from './useLeague'
import type { LeagueMember } from '@/types/database'
import { CURRENT_SEASON } from '@/lib/season'
import { computeStandings, isVoid, isWeekComplete } from '@/components/pickem/standings'
import { resolveWeekDeadline } from '@/lib/deadline'
import { currentPickemWeek, isGameLocked } from '@/lib/pickemWeek'
import { fantasyWeekFor } from '@/lib/scheduling'
import { useCurrentWeek, useCurrentCFBWeek } from './useLiveStats'

export type ActionKind =
  | 'on_the_clock' | 'draft_live' | 'draft_soon'
  | 'trade_offer' | 'picks_due' | 'lineup_empty'
  | 'league_not_full' | 'no_team_name'

export interface ActionItem {
  id: string
  kind: ActionKind
  priority: number          // lower = more urgent
  leagueId: string
  leagueName: string
  title: string
  detail: string
  to: string                // route to deep-link into
  cta: string
}

export interface TeamRow {
  leagueId: string
  leagueName: string
  leagueType: string
  teamName: string
  wins: number
  losses: number
  ties: number
  pointsFor: number
  isCommissioner: boolean
  draftStatus: string
  memberCount: number
  numTeams: number
  /** Pick'Em only: where this week stands for you, e.g. "Week 3 · 9/16 picked". */
  pickemStatus?: string
  // current week matchup (fantasy only)
  matchup?: {
    opponentName: string
    myScore: number
    oppScore: number
    isComplete: boolean
  } | null
}

export function useHomeData() {
  const { user } = useAppStore()
  const { data: myLeagues = [], isLoading: leaguesLoading } = useMyLeagues()
  const { data: liveNflWeek = 1 } = useCurrentWeek()
  const { data: liveCfbWeek = 1 } = useCurrentCFBWeek()

  const leagueIds = myLeagues.map(l => l.league.id)

  const q = useQuery({
    queryKey: ['home-data', user?.id, leagueIds.join(',')],
    enabled: !!user && leagueIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const [tradesRes, draftsRes, matchupsRes, membersRes, rostersRes, picksRes, gamesRes, weekSettingsRes] =
        await Promise.all([
          // Pending trade offers addressed to me
          supabase
            .from('trades')
            .select('id, league_id, created_at, proposer:profiles!trades_proposer_id_fkey(username, display_name)')
            .in('league_id', leagueIds)
            .eq('receiver_id', user!.id)
            .eq('status', 'pending'),

          // Draft state per league
          supabase
            .from('draft_state')
            .select('league_id, status, current_user_id, current_round, current_pick')
            .in('league_id', leagueIds),

          // Matchups involving me
          supabase
            .from('matchups')
            .select('league_id, week, home_user_id, away_user_id, home_score, away_score, is_complete')
            .in('league_id', leagueIds)
            .or(`home_user_id.eq.${user!.id},away_user_id.eq.${user!.id}`),

          // Every member row (for counts + opponent names)
          supabase
            .from('league_members')
            .select('league_id, user_id, team_name')
            .in('league_id', leagueIds),

          // My roster entries (to detect an empty lineup)
          supabase
            .from('rosters')
            .select('league_id, id')
            .in('league_id', leagueIds)
            .eq('user_id', user!.id)
            .eq('week', 0),

          // My pickem picks this season
          supabase
            .from('pickem_picks')
            .select('league_id, week, game_id, user_id, picked_team, tiebreaker_score')
            .in('league_id', leagueIds)
            .eq('user_id', user!.id)
            .eq('season', CURRENT_SEASON),

          // Games, to score those picks — same source of truth the
          // pick'em standings tab and league hub standings panel use.
          // league_members.wins/losses is never written for pick'em
          // leagues, so it can't be read here either.
          supabase
            .from('nfl_games')
            .select('id, week, game_date, home_team, away_team, home_score, away_score, status, is_tiebreaker')
            .eq('season', CURRENT_SEASON),

          // Per-week Pick'Em deadline overrides, so the picks-due
          // nudge locks at the same moment the Pick'Em page does.
          supabase
            .from('pickem_week_settings')
            .select('league_id, week, pick_deadline')
            .in('league_id', leagueIds)
            .eq('season', CURRENT_SEASON),
        ])

      return {
        trades:   tradesRes.data ?? [],
        drafts:   draftsRes.data ?? [],
        matchups: matchupsRes.data ?? [],
        members:  membersRes.data ?? [],
        rosters:  rostersRes.data ?? [],
        picks:    picksRes.data ?? [],
        games:    gamesRes.data ?? [],
        weekSettings: weekSettingsRes.data ?? [],
      }
    },
  })

  const d = q.data

  // ── Your Pick'Em week, per league ───────────────────────────
  // The week comes from the same Tuesday-night clock the Pick'Em page
  // opens on — league.current_week is never written, so it read Week
  // 1 all season. "Open" uses the page's own lock rule (per-week
  // override, league deadline rule, else kickoff).
  const pickemWeek = (league: (typeof myLeagues)[number]['league']) => {
    const wk = currentPickemWeek()
    const wkGames = (d?.games ?? []).filter(g => g.week === wk && !isVoid(g as any))
    const kickoffs = wkGames
      .map(g => (g.game_date ? new Date(g.game_date).getTime() : NaN))
      .filter(t => Number.isFinite(t))
    const { deadline } = resolveWeekDeadline({
      weekOverride: d?.weekSettings.find(s => s.league_id === league.id && s.week === wk)?.pick_deadline ?? null,
      lockType:     (league as any).pick_lock_type,
      day:          (league as any).pick_deadline_day,
      time:         (league as any).pick_deadline_time,
      tz:           (league as any).pick_deadline_tz,
      firstKickoff: kickoffs.length ? new Date(Math.min(...kickoffs)) : null,
    })
    const deadlineIso = deadline ? deadline.toISOString() : null
    const mine = (d?.picks ?? []).filter(p => p.league_id === league.id && p.week === wk)
    const pickedIds = new Set(mine.map(p => p.game_id))
    const open = wkGames.filter(g => !isGameLocked(g.game_date, deadlineIso, g.status))
    const unpicked = open.filter(g => !pickedIds.has(g.id))
    const tb = wkGames.find(g => g.is_tiebreaker)
    return {
      wk,
      total: wkGames.length,
      picked: wkGames.filter(g => pickedIds.has(g.id)).length,
      open: open.length,
      unpicked,
      // Only while it can still be fixed; a guess saves with the TB pick
      tbMissing: !!tb && open.includes(tb) && !mine.some(p => p.game_id === tb.id && p.tiebreaker_score != null),
      complete: isWeekComplete(wkGames as any),
    }
  }

  // ── Build team rows ────────────────────────────────────────
  const teams: TeamRow[] = myLeagues.map(({ league, ...m }) => {
    const membership = m as unknown as LeagueMember
    const memberCount = d?.members.filter(x => x.league_id === league.id).length ?? 0
    const isPickem = league.league_type === 'pickem'

    // Pick'Em's real correct-pick count lives in picks joined to game
    // results, not in the stored league_members.wins column — nothing
    // ever writes that column for a pick'em league.
    let pickemCorrect = 0
    if (isPickem && user) {
      const leaguePicks = (d?.picks ?? []).filter(p => p.league_id === league.id)
      const rows = computeStandings((d?.games ?? []) as any, leaguePicks as any, [{ user_id: user.id }])
      pickemCorrect = rows.find(r => r.userId === user.id)?.correct ?? 0
    }

    let pickemStatus: string | undefined
    if (isPickem && d) {
      const pw = pickemWeek(league)
      pickemStatus = pw.total === 0 ? `Week ${pw.wk}`
        : pw.complete ? `Week ${pw.wk} final`
        : pw.open === 0 ? `Week ${pw.wk} · games underway`
        : pw.unpicked.length === 0 ? `Week ${pw.wk} · all picks in`
        : `Week ${pw.wk} · ${pw.picked}/${pw.total} picked`
    }

    // This week's matchup — same live week the Matchup tab opens on
    // (league.current_week is never written, so this always showed the
    // Week 1 matchup). Only for a league in the current season; an old
    // season's league has no "this week".
    let matchup: TeamRow['matchup'] = null
    const fantasyWeek = fantasyWeekFor(league.player_pool, liveNflWeek, liveCfbWeek)
    const mu = league.season === CURRENT_SEASON
      ? d?.matchups.find(x => x.league_id === league.id && x.week === fantasyWeek)
      : undefined
    if (mu) {
      const iAmHome = mu.home_user_id === user?.id
      const oppId = iAmHome ? mu.away_user_id : mu.home_user_id
      const opp = d?.members.find(x => x.league_id === league.id && x.user_id === oppId)
      matchup = {
        opponentName: opp?.team_name ?? 'TBD',
        myScore:  iAmHome ? mu.home_score : mu.away_score,
        oppScore: iAmHome ? mu.away_score : mu.home_score,
        isComplete: mu.is_complete,
      }
    }

    return {
      leagueId: league.id,
      leagueName: league.name,
      leagueType: league.league_type,
      teamName: membership.team_name,
      wins: isPickem ? pickemCorrect : (membership.wins ?? 0),
      losses: membership.losses ?? 0,
      ties: membership.ties ?? 0,
      pointsFor: membership.points_for ?? 0,
      isCommissioner: membership.is_commissioner,
      draftStatus: league.draft_status,
      memberCount,
      numTeams: league.num_teams,
      pickemStatus,
      matchup,
    }
  })

  // ── Build action items ─────────────────────────────────────
  const actions: ActionItem[] = []

  for (const { league, ...m } of myLeagues) {
    const membership = m as unknown as LeagueMember
    const isPickem = league.league_type === 'pickem'
    const draft = d?.drafts.find(x => x.league_id === league.id)
    const memberCount = d?.members.filter(x => x.league_id === league.id).length ?? 0

    // 1. On the clock — most urgent thing in the app
    if (draft?.status === 'active' && draft.current_user_id === user?.id) {
      actions.push({
        id: `clock-${league.id}`, kind: 'on_the_clock', priority: 0,
        leagueId: league.id, leagueName: league.name,
        title: "You're on the clock",
        detail: `Round ${draft.current_round}, pick ${draft.current_pick}`,
        to: '/app/draft', cta: 'Make pick',
      })
    }
    // 2. Draft running but not my turn
    else if (draft?.status === 'active' || draft?.status === 'in_progress') {
      actions.push({
        id: `draftlive-${league.id}`, kind: 'draft_live', priority: 2,
        leagueId: league.id, leagueName: league.name,
        title: 'Draft in progress',
        detail: `Round ${draft.current_round ?? 1} underway`,
        to: '/app/draft', cta: 'Watch',
      })
    }

    // 3. Pick'Em: games still open that you haven't picked
    //
    // Counts unpicked games that can still be picked, not "made any
    // pick at all" — someone who picked Thursday night but forgot the
    // Sunday slate used to get no nudge. The finished week that stays
    // current through Tuesday has nothing open, so it stays quiet.
    if (isPickem && d) {
      const pw = pickemWeek(league)
      const n = pw.unpicked.length
      if (n > 0) {
        const nextLock = Math.min(...pw.unpicked.map(g => (g.game_date ? new Date(g.game_date).getTime() : Infinity)))
        actions.push({
          id: `picks-${league.id}`, kind: 'picks_due', priority: 1,
          leagueId: league.id, leagueName: league.name,
          title: pw.picked === 0
            ? `Week ${pw.wk} picks not submitted`
            : `${n} Week ${pw.wk} game${n === 1 ? '' : 's'} still unpicked`,
          detail: Number.isFinite(nextLock)
            ? `Next one locks ${new Date(nextLock).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`
            : 'Make your picks before kickoff',
          to: '/app/pickem', cta: 'Make picks',
        })
      } else if (pw.tbMissing) {
        actions.push({
          id: `picks-${league.id}`, kind: 'picks_due', priority: 1,
          leagueId: league.id, leagueName: league.name,
          title: `Week ${pw.wk} tiebreaker guess missing`,
          detail: 'Without one you lose every tie',
          to: '/app/pickem', cta: 'Add guess',
        })
      }
    }

    // 4. Empty roster after the draft is done
    if (!isPickem && league.draft_status !== 'pre_draft') {
      const rosterCount = d?.rosters.filter(r => r.league_id === league.id).length ?? 0
      if (rosterCount === 0) {
        actions.push({
          id: `lineup-${league.id}`, kind: 'lineup_empty', priority: 1,
          leagueId: league.id, leagueName: league.name,
          title: 'Your roster is empty',
          detail: 'Add players to field a lineup',
          to: '/app/players', cta: 'Add players',
        })
      }
    }

    // 5. Commissioner: league not full pre-draft
    // Pick'Em has no roster size to fill and no draft to prepare for.
    if (!isPickem && membership.is_commissioner && league.draft_status === 'pre_draft' && memberCount < league.num_teams) {
      actions.push({
        id: `full-${league.id}`, kind: 'league_not_full', priority: 4,
        leagueId: league.id, leagueName: league.name,
        title: `${memberCount}/${league.num_teams} spots filled`,
        detail: 'Invite more members before the draft',
        to: '/app/leagues', cta: 'Invite',
      })
    }

    // 6. Still using a default-looking team name
    if (/^my team$/i.test(membership.team_name ?? '')) {
      actions.push({
        id: `name-${league.id}`, kind: 'no_team_name', priority: 5,
        leagueId: league.id, leagueName: league.name,
        title: 'Name your team',
        detail: 'Your team is still called "My Team"',
        to: '/app/settings', cta: 'Rename',
      })
    }
  }

  // 7. Pending trade offers
  for (const t of d?.trades ?? []) {
    const lg = myLeagues.find(l => l.league.id === t.league_id)
    if (!lg) continue
    const p: any = t.proposer
    const who = p?.display_name || p?.username || 'Someone'
    actions.push({
      id: `trade-${t.id}`, kind: 'trade_offer', priority: 1,
      leagueId: t.league_id, leagueName: lg.league.name,
      title: `Trade offer from ${who}`,
      detail: 'Review and respond',
      to: '/app/trades', cta: 'Review',
    })
  }

  actions.sort((a, b) => a.priority - b.priority)

  return {
    teams,
    actions,
    isLoading: leaguesLoading || q.isLoading,
    hasLeagues: myLeagues.length > 0,
  }
}

// ── Live ticker: a few games straight from ESPN, no proxy needed ──
export interface TickerGame {
  id: string
  away: string
  home: string
  awayScore: string
  homeScore: string
  status: 'pre' | 'in' | 'post'
  detail: string
  league: 'NFL' | 'CFB'
}

export function useTickerGames() {
  return useQuery({
    queryKey: ['home-ticker'],
    staleTime: 60_000,
    refetchInterval: 90_000,
    retry: 1,
    queryFn: async (): Promise<TickerGame[]> => {
      const urls: [string, 'NFL' | 'CFB'][] = [
        ['https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard', 'NFL'],
        ['https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=25', 'CFB'],
      ]

      const results = await Promise.allSettled(
        urls.map(([u]) => fetch(u).then(r => (r.ok ? r.json() : null)))
      )

      const out: TickerGame[] = []
      results.forEach((res, idx) => {
        if (res.status !== 'fulfilled' || !res.value) return
        const league = urls[idx][1]
        for (const ev of res.value.events ?? []) {
          const comp = ev.competitions?.[0]
          if (!comp) continue
          const cs = comp.competitors ?? []
          const home = cs.find((c: any) => c.homeAway === 'home')
          const away = cs.find((c: any) => c.homeAway === 'away')
          if (!home || !away) continue
          const name = comp.status?.type?.name ?? ''
          out.push({
            id: ev.id,
            away: away.team?.abbreviation ?? '??',
            home: home.team?.abbreviation ?? '??',
            awayScore: away.score ?? '0',
            homeScore: home.score ?? '0',
            status:
              name === 'STATUS_IN_PROGRESS' || name === 'STATUS_HALFTIME' ? 'in'
              : name === 'STATUS_FINAL' || name === 'STATUS_FINAL_OVERTIME' ? 'post'
              : 'pre',
            detail: comp.status?.type?.shortDetail ?? '',
            league,
          })
        }
      })

      // Live games first, then upcoming, then finals
      const rank = { in: 0, pre: 1, post: 2 } as const
      return out.sort((a, b) => rank[a.status] - rank[b.status]).slice(0, 12)
    },
  })
}
