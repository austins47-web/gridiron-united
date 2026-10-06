// ESPN's public scoreboards, current week and game summaries — the
// routes the sportsdata proxy serves the app. detect-games and
// poll-live-stats call these directly: going through the proxy cost
// an extra edge function invocation for every ESPN request, which on
// a full Saturday was thousands an hour.

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football'

// ESPN 403s bare/default-user-agent requests
export const ESPN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Gridiron-United/1.0)',
  'Accept': 'application/json',
}

export async function espnFetch(url: string) {
  const res = await fetch(url, { headers: ESPN_HEADERS })
  if (!res.ok) throw new Error(`ESPN ${res.status}: ${url}`)
  return res.json()
}

/**
 * The data for a sportsdata endpoint, or undefined when it isn't one of these:
 *   nfl/live-scores           → this week's NFL scoreboard
 *   nfl/scores/{season}/{wk}  → an NFL week's scoreboard
 *   cfb/scores/{season}/{wk}  → an FBS week's scoreboard
 *   nfl|cfb/current-week      → { week, season, seasonType }
 *   game/summary/{NFL|CFB}/{id}
 */
export async function espnScores(endpoint: string, seasontypeParam?: string | null): Promise<any> {
  if (endpoint === 'nfl/live-scores') {
    return espnFetch(`${SITE}/nfl/scoreboard`)
  }

  if (endpoint.startsWith('nfl/scores/')) {
    const [,, season, week] = endpoint.split('/')
    const seasontype = seasontypeParam ?? '2'
    // ESPN requires 'dates' for year, not 'season'. Also needs limit to get all games.
    return espnFetch(`${SITE}/nfl/scoreboard?dates=${season}&seasontype=${seasontype}&week=${week}&limit=20`)
  }

  if (endpoint.startsWith('cfb/scores/')) {
    const [,, season, week] = endpoint.split('/')
    const seasontype = seasontypeParam ?? '2'
    // CFB Week 0 is a single late-August Saturday slate that ESPN lumps
    // into week 1. Split them by date: week 0 = before Aug 26, week 1 = after.
    const yr = parseInt(season)
    const WEEK0_CUTOFF = new Date(`${yr}-08-26T00:00:00Z`).getTime()

    if (week === '0') {
      // Tight range covering only the week 0 slate
      return espnFetch(`${SITE}/college-football/scoreboard?groups=80&limit=100&dates=${yr}0818-${yr}0825`)
    }
    const data = await espnFetch(`${SITE}/college-football/scoreboard?groups=80&limit=100&dates=${season}&week=${week}&seasontype=${seasontype}`)
    // Strip any week 0 stragglers out of week 1
    if (week === '1' && Array.isArray(data?.events)) {
      data.events = data.events.filter((e: any) => new Date(e.date).getTime() >= WEEK0_CUTOFF)
    }
    return data
  }

  if (endpoint === 'nfl/current-week' || endpoint === 'cfb/current-week') {
    // The real current week from ESPN, instead of computing it from a
    // hardcoded season-start date — that drifted wrong (Week 2 while
    // the season was still in Week 1), so detect-games fetched the
    // wrong week's scoreboard and never seeded live_games.
    const league = endpoint.startsWith('nfl') ? 'nfl' : 'college-football'
    const groupParam = league === 'college-football' ? '&groups=80' : ''
    const raw = await espnFetch(`${SITE}/${league}/scoreboard?limit=1${groupParam}`)
    return {
      week: raw?.week?.number ?? null,
      season: raw?.season?.year ?? null,
      seasonType: raw?.season?.type ?? null,
    }
  }

  if (endpoint.startsWith('game/summary/')) {
    // game/summary/{league}/{gameId}
    const parts = endpoint.split('/')
    const league = parts[2] === 'CFB' ? 'college-football' : 'nfl'
    return espnFetch(`${SITE}/${league}/summary?event=${parts[3]}`)
  }

  return undefined
}
