import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const KEY = Deno.env.get('SPORTSDATAIO_KEY') ?? ''
const NFL = 'https://api.sportsdata.io/v3/nfl'
const CFB = 'https://api.sportsdata.io/v3/cfb'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  const url = new URL(req.url)
  const endpoint = url.searchParams.get('endpoint') // e.g. 'nfl/news', 'nfl/scores/week/1', 'nfl/stats/week/1', 'cfb/scores/week/1'

  if (!endpoint) {
    return new Response(JSON.stringify({ error: 'Missing endpoint param' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  try {
    let apiUrl: string

    // ── Route to correct SportsDataIO endpoint ──────────────
    if (endpoint === 'nfl/news') {
      apiUrl = `${NFL}/scores/json/News`

    } else if (endpoint.startsWith('nfl/news/team/')) {
      // nfl/news/team/{abbr} — news for a specific team e.g. nfl/news/team/KC
      const team = endpoint.split('/')[3]
      apiUrl = `${NFL}/scores/json/NewsByTeam/${team}`

    } else if (endpoint === 'nfl/live-scores') {
      apiUrl = `${NFL}/scores/json/LiveScores`

    } else if (endpoint.startsWith('nfl/scores/')) {
      // nfl/scores/{season}/{week}
      const [, , season, week] = endpoint.split('/')
      apiUrl = `${NFL}/scores/json/ScoresByWeek/${season}REG/${week}`

    } else if (endpoint.startsWith('nfl/stats/')) {
      // nfl/stats/{season}/{week}
      const [, , season, week] = endpoint.split('/')
      apiUrl = `${NFL}/stats/json/PlayerGameStatsByWeek/${season}REG/${week}`

    } else if (endpoint.startsWith('nfl/projections/')) {
      // nfl/projections/{season}/{week}
      const [, , season, week] = endpoint.split('/')
      apiUrl = `${NFL}/projections/json/PlayerGameProjectionStatsByWeek/${season}REG/${week}`

    } else if (endpoint === 'nfl/players') {
      apiUrl = `${NFL}/scores/json/Players`

    } else if (endpoint.startsWith('cfb/scores/')) {
      // cfb/scores/{season}/{week}
      const [, , season, week] = endpoint.split('/')
      apiUrl = `${CFB}/scores/json/GamesByWeek/${season}/${week}`

    } else if (endpoint.startsWith('cfb/stats/')) {
      // cfb/stats/{season}/{week}
      const [, , season, week] = endpoint.split('/')
      apiUrl = `${CFB}/stats/json/PlayerGameStatsByWeek/${season}/${week}`

    } else if (endpoint === 'cfb/players') {
      apiUrl = `${CFB}/scores/json/Players`

    } else if (endpoint === 'cfb/teams') {
      apiUrl = `${CFB}/scores/json/Teams`

    } else if (endpoint === 'nfl/week') {
      apiUrl = `${NFL}/scores/json/CurrentWeek`

    } else {
      return new Response(JSON.stringify({ error: `Unknown endpoint: ${endpoint}` }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const res = await fetch(apiUrl, {
      headers: { 'Ocp-Apim-Subscription-Key': KEY },
    })

    if (!res.ok) {
      const text = await res.text()
      return new Response(JSON.stringify({ error: `SportsDataIO ${res.status}`, detail: text }), {
        status: res.status, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const data = await res.json()
    return new Response(JSON.stringify(data), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
