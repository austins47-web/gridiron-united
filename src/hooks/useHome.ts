import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'
import { useMyLeagues } from './useLeague'
import type { League, LeagueMember } from '@/types/database'
import { CURRENT_SEASON } from '@/lib/season'

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

  const leagueIds = myLeagues.map(l => l.league.id)

  const q = useQuery({
    queryKey: ['home-data', user?.id, leagueIds.join(',')],
    enabled: !!user && leagueIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const [tradesRes, draftsRes, matchupsRes, membersRes, rostersRes, picksRes] =
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
            .select('league_id, week')
            .in('league_id', leagueIds)
            .eq('user_id', user!.id)
            .eq('season', CURRENT_SEASON),
        ])

      return {
        trades:   tradesRes.data ?? [],
        drafts:   draftsRes.data ?? [],
        matchups: matchupsRes.data ?? [],
        members:  membersRes.data ?? [],
        rosters:  rostersRes.data ?? [],
        picks:    picksRes.data ?? [],
      }
    },
  })

  const d = q.data

  // ── Build team rows ────────────────────────────────────────
  const teams: TeamRow[] = myLeagues.map(({ league, ...m }) => {
    const membership = m as unknown as LeagueMember
    const memberCount = d?.members.filter(x => x.league_id === league.id).length ?? 0

    // Current-week matchup
    let matchup: TeamRow['matchup'] = null
    const mu = d?.matchups.find(
      x => x.league_id === league.id && x.week === (league.current_week ?? 1)
    )
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
      wins: membership.wins ?? 0,
      losses: membership.losses ?? 0,
      ties: membership.ties ?? 0,
      pointsFor: membership.points_for ?? 0,
      isCommissioner: membership.is_commissioner,
      draftStatus: league.draft_status,
      memberCount,
      numTeams: league.num_teams,
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

    // 3. Pick'Em picks not submitted for the current week
    if (isPickem) {
      const wk = league.current_week ?? 1
      const made = d?.picks.filter(p => p.league_id === league.id && p.week === wk).length ?? 0
      if (made === 0) {
        actions.push({
          id: `picks-${league.id}`, kind: 'picks_due', priority: 1,
          leagueId: league.id, leagueName: league.name,
          title: `Week ${wk} picks not submitted`,
          detail: 'Make your picks before kickoff',
          to: '/app/pickem', cta: 'Make picks',
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
