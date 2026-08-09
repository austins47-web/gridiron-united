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

    if (endpoint === 'nfl/news') {
      // ESPN NFL news feed
      data = await espnFetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=100')
      // Normalize to our expected shape
      data = (data.articles ?? []).map((a: any) => ({
        NewsID:      a.dataSourceIdentifier ?? a.id,
        Title:       a.headline,
        Content:     a.description ?? a.story ?? '',
        Url:         a.links?.web?.href ?? '',
        Source:      a.source ?? 'ESPN',
        Updated:     a.published ?? a.lastModified ?? new Date().toISOString(),
        PlayerName:  a.athletes?.[0]?.displayName ?? null,
        Team:        a.categories?.find((c: any) => c.type === 'team')?.shortName ?? null,
      }))

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

    } else if (endpoint.startsWith('cfb/scores/')) {
      const [,, season, week] = endpoint.split('/')
      data = await espnFetch(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=50&week=${week}&season=${season}`)

    } else if (endpoint === 'nfl/injuries') {
      data = await espnFetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries')

    } else if (endpoint.startsWith('athlete/')) {
      const parts = endpoint.split('/')
      if (parts[1] === 'stats') {
        // athlete/stats/{league}/{espnId}
        const league = parts[2] === 'CFB' ? 'college-football' : 'nfl'
        const espnId = parts[3]
        data = await espnFetch(`https://site.web.api.espn.com/apis/common/v3/sports/football/${league}/athletes/${espnId}/stats`)
      } else if (parts[1] === 'news') {
        // athlete/news/{league}/{espnId}
        const espnId = parts[3]
        // Fantasy news endpoint works for both NFL and CFB
        data = await espnFetch(`https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?limit=25&playerId=${espnId}`)
      } else {
        // athlete/{league}/{espnId} — full profile
        const league = parts[1] === 'CFB' ? 'college-football' : 'nfl'
        const espnId = parts[2]
        data = await espnFetch(`https://site.web.api.espn.com/apis/common/v3/sports/football/${league}/athletes/${espnId}`)
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
