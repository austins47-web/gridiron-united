import { useQuery } from '@tanstack/react-query'
import { getTeamId } from '@/components/teams/teamIds'

// ══════════════════════════════════════════════════════════════
// A profile's favorite team, for Home's "Your Team" card: record and
// standing, the last result, the next (or live) game, and the latest
// team-specific headlines.
//
// Straight from ESPN's public site API (like the Home score ticker):
// one team-schedule call carries the record, standing and every game,
// and the news call is filtered to the team.
// ══════════════════════════════════════════════════════════════

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football'

export interface TeamGame {
  id: string
  date: string
  state: 'pre' | 'in' | 'post'
  detail: string          // "9/28 - 8:15 PM EDT", "Q3 4:12", "Final"
  home: boolean           // our team is at home
  opp: { abbr: string; name: string; logo: string; rank: number | null }
  us: number | null
  them: number | null
  won: boolean | null
  broadcast: string | null
}

export interface FavoriteTeam {
  league: 'NFL' | 'CFB'
  id: string
  abbr: string
  name: string            // "Eagles" / "Crimson Tide"
  location: string        // "Philadelphia" / "Alabama"
  logo: string
  color: string           // hex without #
  record: string          // "2-0"
  standing: string        // "1st in NFC East"
  rank: number | null     // CFB poll rank
  last: TeamGame | null
  live: TeamGame | null
  next: TeamGame | null
  headlines: { title: string; url: string; published: string }[]
}

function toGame(e: any, teamId: string): TeamGame | null {
  const c = e.competitions?.[0]
  const us = c?.competitors?.find((x: any) => String(x.team?.id) === teamId)
  const them = c?.competitors?.find((x: any) => String(x.team?.id) !== teamId)
  if (!us || !them) return null
  const score = (x: any) => {
    const v = Number(x.score?.value ?? x.score?.displayValue ?? x.score)
    return Number.isFinite(v) ? v : null
  }
  const state = c.status?.type?.state
  const rank = (x: any) => {
    const r = x.curatedRank?.current
    return typeof r === 'number' && r >= 1 && r <= 25 ? r : null
  }
  return {
    id: String(e.id),
    date: e.date,
    state: state === 'in' || state === 'post' ? state : 'pre',
    detail: c.status?.type?.shortDetail ?? '',
    home: us.homeAway === 'home',
    opp: {
      abbr: them.team?.abbreviation ?? '',
      name: them.team?.shortDisplayName ?? them.team?.displayName ?? '',
      logo: them.team?.logos?.[0]?.href ?? '',
      rank: rank(them),
    },
    us: score(us),
    them: score(them),
    won: typeof us.winner === 'boolean' && state === 'post' ? us.winner : null,
    broadcast: c.broadcasts?.[0]?.media?.shortName ?? null,
  }
}

async function loadTeam(league: 'NFL' | 'CFB', key: string): Promise<FavoriteTeam | null> {
  const id = getTeamId(key, league)
  if (!id) return null
  const sport = league === 'NFL' ? 'nfl' : 'college-football'

  const [sched, news] = await Promise.all([
    fetch(`${ESPN}/${sport}/teams/${id}/schedule`).then(r => (r.ok ? r.json() : null)),
    fetch(`${ESPN}/${sport}/news?team=${id}&limit=15`).then(r => (r.ok ? r.json() : null)).catch(() => null),
  ])
  if (!sched?.team) return null
  const t = sched.team

  const games = (sched.events ?? [])
    .map((e: any) => toGame(e, id))
    .filter((g: TeamGame | null): g is TeamGame => !!g)
    .sort((a: TeamGame, b: TeamGame) => +new Date(a.date) - +new Date(b.date))
  const live = games.find((g: TeamGame) => g.state === 'in') ?? null
  const last = [...games].reverse().find((g: TeamGame) => g.state === 'post') ?? null
  const next = games.find((g: TeamGame) => g.state === 'pre') ?? null

  // Team-specific stories first: the feed also carries league-wide
  // pieces ("All 32 teams' odds") tagged with every team
  const teamTags = (a: any) => (a.categories ?? []).filter((c: any) => c.type === 'team')
  const mine = (a: any) => teamTags(a).some((c: any) => String(c.teamId ?? c.team?.id) === id)
  const articles: any[] = (news?.articles ?? []).filter((a: any) => a.headline && a.links?.web?.href)
  const focused = articles.filter(a => mine(a) && teamTags(a).length <= 2)
  const headlines = (focused.length ? focused : articles)
    .slice(0, 2)
    .map(a => ({ title: a.headline, url: a.links.web.href, published: a.published ?? '' }))

  const myRank = live ?? next ?? last
  return {
    league,
    id,
    abbr: t.abbreviation ?? key,
    name: t.name ?? t.displayName ?? key,
    location: t.location ?? '',
    logo: t.logo ?? t.logos?.[0]?.href ?? '',
    color: /^[0-9a-f]{6}$/i.test(t.color ?? '') ? t.color : 'CE7B45',
    record: t.recordSummary ?? '',
    standing: t.standingSummary ?? '',
    rank: league === 'CFB' && myRank
      ? (() => {
          const e = (sched.events ?? []).find((x: any) => String(x.id) === myRank.id)
          const us = e?.competitions?.[0]?.competitors?.find((x: any) => String(x.team?.id) === id)
          const r = us?.curatedRank?.current
          return typeof r === 'number' && r >= 1 && r <= 25 ? r : null
        })()
      : null,
    last, live, next, headlines,
  }
}

export function useFavoriteTeam(league: 'NFL' | 'CFB', key: string | null | undefined) {
  return useQuery({
    queryKey: ['favorite-team', league, key],
    enabled: !!key,
    queryFn: () => loadTeam(league, key!),
    staleTime: 5 * 60_000,
    // A live game keeps its score moving
    refetchInterval: q => (q.state.data?.live ? 60_000 : 15 * 60_000),
    retry: 1,
  })
}
