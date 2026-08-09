import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Weekly roster sync via ESPN free API ─────────────────────
// No API key needed. Fetches all 32 NFL teams + all CFB FBS teams.
// ESPN blocks PowerShell but allows server-side Deno requests.
// Data is free, real-time, and covers both NFL and CFB.

const SUPABASE_URL         = Deno.env.get('APP_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ESPN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Gridiron-United/1.0)',
  'Accept': 'application/json',
}

async function espn(url: string) {
  const res = await fetch(url, { headers: ESPN_HEADERS })
  if (!res.ok) throw new Error(`ESPN ${res.status}: ${url}`)
  return res.json()
}

// ── Maps ──────────────────────────────────────────────────────

const POS_MAP: Record<string, string> = {
  QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K',
  FB: 'RB', HB: 'RB',
}

const NFL_CONF: Record<string, string> = {
  ARI:'NFC West', ATL:'NFC South', BAL:'AFC North', BUF:'AFC East',
  CAR:'NFC South', CHI:'NFC North', CIN:'AFC North', CLE:'AFC North',
  DAL:'NFC East',  DEN:'AFC West',  DET:'NFC North', GB:'NFC North',
  HOU:'AFC South', IND:'AFC South', JAX:'AFC South', KC:'AFC West',
  LAC:'AFC West',  LAR:'NFC West',  LV:'AFC West',   MIA:'AFC East',
  MIN:'NFC North', NE:'AFC East',   NO:'NFC South',  NYG:'NFC East',
  NYJ:'AFC East',  PHI:'NFC East',  PIT:'AFC North', SEA:'NFC West',
  SF:'NFC West',   TB:'NFC South',  TEN:'AFC South', WAS:'NFC East',
}

function mapStatus(s: string): string {
  if (!s) return 'active'
  const l = s.toLowerCase()
  if (l.includes('question')) return 'questionable'
  if (l.includes('out') || l.includes('doubtful')) return 'out'
  if (l.includes('ir') || l.includes('injured reserve') || l.includes('pup')) return 'ir'
  return 'active'
}

// ── NFL sync ──────────────────────────────────────────────────

async function syncNFL(supabase: any) {
  // Get all 32 NFL teams
  const teamsData = await espn('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=32')
  const teams = teamsData.sports?.[0]?.leagues?.[0]?.teams ?? []

  const rows: any[] = []
  const nflNames = new Set<string>()

  for (const { team } of teams) {
    const abbr     = team.abbreviation
    const teamName = team.displayName
    const teamId   = team.id

    try {
      // Fetch roster for this team
      const rosterData = await espn(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/roster`)
      const groups: any[] = rosterData.athletes ?? []

      for (const group of groups) {
        for (const athlete of (group.items ?? [])) {
          const pos = POS_MAP[athlete.position?.abbreviation]
          if (!pos) continue

          const name = athlete.fullName ?? `${athlete.firstName} ${athlete.lastName}`
          nflNames.add(name.toLowerCase())

          rows.push({
            id:          Number(athlete.id) + 1000000, // ESPN IDs + offset to avoid collision
            name,
            team:        teamName,
            pos,
            league:      'NFL',
            conference:  NFL_CONF[abbr] ?? null,
            status:      mapStatus(athlete.injuries?.[0]?.status ?? athlete.status?.type?.description ?? ''),
            injury_note: athlete.injuries?.[0]?.description ?? null,
            is_rookie:   (athlete.experience?.years ?? 1) === 0,
            updated_at:  new Date().toISOString(),
          })
        }
      }

      // Add DST for this team
      rows.push({
        id:          90000 + rows.length, // unique DST id
        name:        `${teamName} D/ST`,
        team:        teamName,
        pos:         'DST',
        league:      'NFL',
        conference:  NFL_CONF[abbr] ?? null,
        status:      'active',
        injury_note: null,
        is_rookie:   false,
        updated_at:  new Date().toISOString(),
      })
    } catch (e) {
      console.error(`Failed roster for ${teamName}:`, e)
    }
  }

  return { rows, nflNames }
}

// ── CFB sync ──────────────────────────────────────────────────

// ESPN conference group IDs for FBS
const CFB_CONF_GROUPS: Array<{ id: number; name: string }> = [
  { id: 8,   name: 'Southeastern' },
  { id: 23,  name: 'Big Ten' },
  { id: 12,  name: 'Big 12' },
  { id: 1,   name: 'Atlantic Coast' },
  { id: 9,   name: 'Pac-12' },
  { id: 151, name: 'American Athletic' },
  { id: 17,  name: 'Mountain West' },
  { id: 37,  name: 'Conference USA' },
  { id: 15,  name: 'Mid-American' },
  { id: 37,  name: 'Sun Belt' },
  { id: 18,  name: 'FBS Independents' },
]

async function syncCFB(supabase: any, nflNames: Set<string>) {
  const rows: any[] = []
  const seen = new Set<string>()

  for (const conf of CFB_CONF_GROUPS) {
    let teamsData: any
    try {
      teamsData = await espn(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=100&groups=${conf.id}`)
    } catch (e) {
      console.error(`Failed conf ${conf.name}:`, e)
      continue
    }

    const teams = teamsData.sports?.[0]?.leagues?.[0]?.teams ?? []

    // Fetch all team rosters in parallel (per conference, not all at once)
    const rosterPromises = teams.map(async ({ team }: any) => {
      try {
        const data = await espn(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/${team.id}/roster`)
        return { team, data }
      } catch {
        return { team, data: null }
      }
    })

    const results = await Promise.all(rosterPromises)

    for (const { team, data } of results) {
      if (!data) continue
      const teamName = team.displayName ?? team.name

      for (const group of (data.athletes ?? [])) {
        for (const athlete of (group.items ?? [])) {
          const pos = POS_MAP[athlete.position?.abbreviation]
          if (!pos) continue

          const name = athlete.fullName ?? `${athlete.firstName ?? ''} ${athlete.lastName ?? ''}`.trim()
          if (!name || nflNames.has(name.toLowerCase())) continue

          const key = `${athlete.id}-${team.id}`
          if (seen.has(key)) continue
          seen.add(key)

          const classYear = athlete.year ?? null
          const classMap: Record<number, string> = { 1: 'Freshman', 2: 'Sophomore', 3: 'Junior', 4: 'Senior', 5: 'Graduate' }

          rows.push({
            id:          50000000 + Number(athlete.id),
            name,
            team:        teamName,
            pos,
            league:      'CFB',
            conference:  conf.name,
            avg_pts:     0,
            proj_pts:    0,
            adp:         999,
            status:      mapStatus(athlete.injuries?.[0]?.status ?? ''),
            injury_note: athlete.injuries?.[0]?.description ?? null,
            is_rookie:   false,
            depth_pos:   classMap[classYear] ?? null,
            updated_at:  new Date().toISOString(),
          })
        }
      }
    }
  }

  return { rows }
}

// ── Upsert ────────────────────────────────────────────────────

async function upsertBatched(supabase: any, rows: any[]) {
  let count = 0
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase
      .from('players')
      .upsert(rows.slice(i, i + 200), { onConflict: 'id' })
    if (error) throw new Error(`Upsert batch ${Math.floor(i/200)} failed: ${error.message}`)
    count += rows.slice(i, i + 200).length
  }
  return count
}

// ── Main ──────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const league   = new URL(req.url).searchParams.get('league') ?? 'nfl'

    if (league === 'cfb') {
      // CFB-only sync — called by its own cron job
      // Need NFL names to filter out players on NFL rosters
      const { data: nflPlayers } = await supabase
        .from('players')
        .select('name')
        .eq('league', 'NFL')
        .neq('pos', 'DST')
      const nflNames = new Set((nflPlayers ?? []).map((p: any) => p.name.toLowerCase()))
      const { rows } = await syncCFB(supabase, nflNames)
      const total = await upsertBatched(supabase, rows)
      return new Response(JSON.stringify({
        success: true, total, cfb: rows.length, syncedAt: new Date().toISOString(),
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Default: NFL only (fast, always under 60s)
    const { rows: nflRows, nflNames } = await syncNFL(supabase)
    const total = await upsertBatched(supabase, nflRows)

    return new Response(JSON.stringify({
      success: true, total, nfl: nflRows.length, syncedAt: new Date().toISOString(),
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    console.error('sync-players error:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
