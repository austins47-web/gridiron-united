import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// ── ESPN proxy + FantasyPros proxy ────────────────────────────
// Replaces SportsDataIO. All sources are free, no API key needed.
// Routes:
//   nfl/news              → ESPN NFL news
//   nfl/news/team/{abbr}  → ESPN team news
//   nfl/live-scores       → ESPN scoreboard
//   cfb/scores/{s}/{w}    → ESPN CFB scoreboard
//   nfl/injuries          → ESPN NFL injuries (all teams)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Gridiron-United/1.0)',
  'Accept': 'application/json',
}

// ESPN team abbreviation → ESPN team ID map (for news lookups)
const TEAM_ID: Record<string, number> = {
  ARI:22, ATL:1,  BAL:33, BUF:2,  CAR:29, CHI:3,  CIN:4,  CLE:5,
  DAL:6,  DEN:7,  DET:8,  GB:9,   HOU:34, IND:11, JAX:30, KC:12,
  LAC:24, LAR:14, LV:13,  MIA:15, MIN:16, NE:17,  NO:18,  NYG:19,
  NYJ:20, PHI:21, PIT:23, SEA:26, SF:25,  TB:27,  TEN:10, WAS:28,
}

async function espnFetch(url: string) {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`ESPN ${res.status}: ${url}`)
  return res.json()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url      = new URL(req.url)
  const endpoint = url.searchParams.get('endpoint') ?? ''

  if (!endpoint) {
    return new Response(JSON.stringify({ error: 'Missing endpoint param' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  try {
    let data: any

    // Helper: fetch multiple pages of ESPN news and deduplicate
    async function fetchNewsPaged(baseUrl: string, pages = 5): Promise<any[]> {
      const seen = new Set<string>()
      const all: any[] = []
      for (let p = 1; p <= pages; p++) {
        try {
          const res = await espnFetch(`${baseUrl}&page=${p}`)
          const articles = res.articles ?? []
          if (articles.length === 0) break
          for (const a of articles) {
            const key = a.dataSourceIdentifier ?? a.id ?? a.contentKey
            if (key && seen.has(key)) continue
            if (key) seen.add(key)
            all.push(a)
          }
          if (articles.length < 50) break // ESPN returns <50 on last page
        } catch { break }
      }
      return all
    }

    // Normalize an ESPN article to our SDIONews shape
    function normalizeNFL(a: any, fallbackTeam?: string) {
      const teamCat = a.categories?.find((c: any) => c.type === 'team')
      const teamAbbr = fallbackTeam ?? teamCat?.team?.abbreviation ?? teamCat?.shortName ?? null
      const athleteCat = a.categories?.find((c: any) => c.type === 'athlete')
      const playerName = athleteCat?.description ?? athleteCat?.athlete?.description ?? null
      const espnAthleteId = athleteCat?.athleteId ?? null
      return {
        NewsID:         a.dataSourceIdentifier ?? a.id,
        Title:          a.headline,
        Content:        a.description ?? a.story ?? '',
        Url:            a.links?.web?.href ?? '',
        Source:         a.source ?? 'ESPN',
        Updated:        a.published ?? a.lastModified ?? new Date().toISOString(),
        PlayerName:     playerName,
        EspnAthleteId:  espnAthleteId,
        Team:           teamAbbr,
      }
    }

    if (endpoint === 'nfl/news') {
      const articles = await fetchNewsPaged(
        'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=50', 6
      )
      data = articles.map((a: any) => normalizeNFL(a))

    } else if (endpoint.startsWith('nfl/news/team/')) {
      const abbr   = endpoint.split('/')[3].toUpperCase()
      const teamId = TEAM_ID[abbr]
      if (!teamId) throw new Error(`Unknown team abbreviation: ${abbr}`)
      data = await espnFetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/news?limit=100`)
      data = (data.articles ?? []).map((a: any) => ({
        NewsID:     a.dataSourceIdentifier ?? a.id,
        Title:      a.headline,
        Content:    a.description ?? a.story ?? '',
        Url:        a.links?.web?.href ?? '',
        Source:     a.source ?? 'ESPN',
        Updated:    a.published ?? new Date().toISOString(),
        PlayerName: a.athletes?.[0]?.displayName ?? null,
        Team:       abbr,
      }))

    } else if (endpoint === 'nfl/live-scores') {
      data = await espnFetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard')

    } else if (endpoint.startsWith('nfl/scores/')) {
      // nfl/scores/{season}/{week} — e.g. nfl/scores/2026/1
      const [,, season, week] = endpoint.split('/')
      // seasontype=1 preseason, 2=regular, 3=postseason
      data = await espnFetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?season=${season}&seasontype=2&week=${week}`)

    } else if (endpoint.startsWith('cfb/scores/')) {
      const [,, season, week] = endpoint.split('/')
      data = await espnFetch(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=50&week=${week}&season=${season}`)

    } else if (endpoint === 'nfl/injuries') {
      data = await espnFetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries')

    } else if (endpoint === 'cfb/news') {
      const articles = await fetchNewsPaged(
        'https://site.api.espn.com/apis/site/v2/sports/football/college-football/news?limit=50', 6
      )
      data = {
        articles: articles.map((a: any) => {
          const athleteCat = a.categories?.find((c: any) => c.type === 'athlete')
          const teamCat = a.categories?.find((c: any) => c.type === 'team' && c.team?.shortDisplayName)
          return {
            ...a,
            _playerName:    athleteCat?.description ?? null,
            _espnAthleteId: athleteCat?.athleteId ?? null,
            _teamName:      teamCat?.team?.shortDisplayName ?? null,
            _teamId:        teamCat?.teamId ?? null,
          }
        })
      }

    } else if (endpoint.startsWith('cfb/news/team/')) {
      const teamId = endpoint.split('/')[3]
      data = await espnFetch(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/news?team=${teamId}&limit=25`)

    } else if (endpoint.startsWith('cfb/teams/') && endpoint.endsWith('/roster')) {
      // cfb/teams/{teamId}/roster — for debugging athlete ID structure
      const teamId = endpoint.split('/')[2]
      data = await espnFetch(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/${teamId}/roster`)

    } else if (endpoint.startsWith('athlete/')) {
      const parts = endpoint.split('/')
      if (parts[1] === 'stats') {
        const league = parts[2] === 'CFB' ? 'college-football' : 'nfl'
        const espnId = parts[3]
        data = await espnFetch(`https://site.web.api.espn.com/apis/common/v3/sports/football/${league}/athletes/${espnId}/stats`)
      } else if (parts[1] === 'news') {
        const league   = parts[2] === 'CFB' ? 'college-football' : 'nfl'
        const espnId   = String(parts[3])

        // Try ESPN's athlete-specific news endpoint first
        let articles: any[] = []
        try {
          const direct = await espnFetch(
            `https://site.api.espn.com/apis/site/v2/sports/football/${league}/athletes/${espnId}/news?limit=10`
          )
          articles = direct.articles ?? direct.feed ?? []
        } catch { /* fall through */ }

        // If that returns nothing, try with ?athlete= query param
        if (articles.length === 0) {
          try {
            const param = await espnFetch(
              `https://site.api.espn.com/apis/site/v2/sports/football/${league}/news?athlete=${espnId}&limit=20`
            )
            articles = param.articles ?? []
          } catch { /* fall through */ }
        }

        // Last resort: filter the general feed by categories.athleteId
        if (articles.length === 0) {
          const general = await fetchNewsPaged(
            `https://site.api.espn.com/apis/site/v2/sports/football/${league}/news?limit=50`, 3
          )
          articles = general.filter((a: any) =>
            a.categories?.some((c: any) =>
              c.type === 'athlete' && String(c.athleteId) === espnId
            )
          )
        }

        data = articles.slice(0, 15).map((a: any) => ({
          headline:    a.headline ?? a.title ?? '',
          description: a.description ?? a.story ?? '',
          published:   a.published ?? a.lastModified ?? '',
          links:       a.links,
        }))
      } else if (parts[1] === 'CFB') {
        // CFB uses sports.core.api with full athlete ID
        const espnId = parts[2]
        data = await espnFetch(`https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/athletes/${espnId}?lang=en&region=us`)
      } else {
        // NFL — site.web.api v3
        const espnId = parts[2]
        data = await espnFetch(`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${espnId}`)
      }

    } else if (endpoint.startsWith('game/summary/')) {
      // game/summary/{league}/{gameId}
      const parts = endpoint.split('/')
      const league = parts[2] === 'CFB' ? 'college-football' : 'nfl'
      const gameId = parts[3]
      data = await espnFetch(`https://site.api.espn.com/apis/site/v2/sports/football/${league}/summary?event=${gameId}`)

    } else {
      return new Response(JSON.stringify({ error: `Unknown endpoint: ${endpoint}` }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(data), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
