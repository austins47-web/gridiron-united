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

      // Add DST for this team — stable id keyed by abbr index
      const DST_INDEX: Record<string,number> = {
        ARI:0,ATL:1,BAL:2,BUF:3,CAR:4,CHI:5,CIN:6,CLE:7,DAL:8,DEN:9,
        DET:10,GB:11,HOU:12,IND:13,JAX:14,KC:15,LAC:16,LAR:17,LV:18,MIA:19,
        MIN:20,NE:21,NO:22,NYG:23,NYJ:24,PHI:25,PIT:26,SEA:27,SF:28,TB:29,
        TEN:30,WAS:31,
      }
      rows.push({
        id:          90000 + (DST_INDEX[abbr] ?? 99),
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

// ESPN conference group IDs for FBS — verified from ESPN's hidden API docs
const CFB_CONF_GROUPS: Array<{ id: number; name: string }> = [
  { id: 8,   name: 'Southeastern' },
  { id: 5,   name: 'Big Ten' },
  { id: 4,   name: 'Big 12' },
  { id: 1,   name: 'Atlantic Coast' },
  { id: 9,   name: 'Pac-12' },
  { id: 151, name: 'American Athletic' },
  { id: 17,  name: 'Mountain West' },
  { id: 12,  name: 'Conference USA' },
  { id: 15,  name: 'Mid-American' },
  { id: 37,  name: 'Sun Belt' },
  { id: 18,  name: 'FBS Independents' },
]

// Sun Belt (37) and Independents (18) don't return teams via groups param in Deno —
// we fall back to fetching all teams and filtering by conferenceId
const DIRECT_GROUP_IDS = new Set([37, 18])

const FBS_CONFS = new Set([
  'Southeastern', 'Big Ten', 'Big 12', 'Atlantic Coast', 'Pac-12',
  'American Athletic', 'Mountain West', 'Conference USA', 'Mid-American',
  'Sun Belt', 'FBS Independents',
])

async function syncCFB(supabase: any, nflNames: Set<string>, confsToSync = CFB_CONF_GROUPS) {
  const rows: any[] = []
  const seen = new Set<string>()

  for (const conf of confsToSync) {
    let teams: any[] = []
    try {
      const data = await espn(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=100&groups=${conf.id}`)
      teams = data.sports?.[0]?.leagues?.[0]?.teams ?? []

      // Sun Belt (37) and Independents (18) return 0 teams via the groups param —
      // fall back to fetching by known team slugs from the all-teams endpoint
      if (teams.length === 0 && DIRECT_GROUP_IDS.has(conf.id)) {
        const allData = await espn(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=500`)
        const allTeams = allData.sports?.[0]?.leagues?.[0]?.teams ?? []
        // conferenceId field on team object
        teams = allTeams.filter(({ team }: any) =>
          Number(team.conferenceId) === conf.id
        )
      }
    } catch (e) {
      console.error(`Failed conf ${conf.name}:`, e)
      continue
    }

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
      // Use shortDisplayName (e.g. "Boise State") not displayName ("Boise State Broncos")
      const teamName = team.shortDisplayName ?? team.location ?? team.displayName ?? team.name

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
          // ESPN returns numeric year OR full string — handle both
          // Also normalise redshirt variants to base class
          const rawClass = athlete.displayClass ?? (classYear ? classMap[classYear] : null) ?? null
          const normClass = rawClass
            ? rawClass.replace(/Redshirt\s+/i, '').replace(/Graduate\s+Student/i, 'Graduate').trim()
            : null
          // Only store recognised classes
          const validClass = ['Freshman','Sophomore','Junior','Senior','Graduate'].includes(normClass ?? '')
            ? normClass : null

          // Double-check this is an FBS conference (guards against ESPN group leakage)
          if (!FBS_CONFS.has(conf.name)) continue

          // Strip nickname suffix from team display name (e.g. "Boise State Broncos" → "Boise State")
          const shortName = team.shortDisplayName ?? team.location ?? teamName

          rows.push({
            id:          50000000 + Number(athlete.id),
            name,
            team:        shortName,
            pos,
            league:      'CFB',
            conference:  conf.name,
            avg_pts:     0,
            proj_pts:    0,
            adp:         999,
            status:      mapStatus(athlete.injuries?.[0]?.status ?? ''),
            injury_note: athlete.injuries?.[0]?.description ?? null,
            is_rookie:   false,
            depth_pos:   validClass,
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
    const params   = new URL(req.url).searchParams
    const league   = params.get('league') ?? 'nfl'
    const confId   = params.get('conf')   // optional: sync one CFB conference

    if (league === 'cfb') {
      // Get NFL names from DB to filter crossover players
      const { data: nflPlayers } = await supabase
        .from('players').select('name').eq('league', 'NFL').neq('pos', 'DST')
      const nflNames = new Set((nflPlayers ?? []).map((p: any) => p.name.toLowerCase()))

      // If a specific conference group id is passed, only sync that one
      const confsToSync = confId
        ? CFB_CONF_GROUPS.filter(c => String(c.id) === confId)
        : CFB_CONF_GROUPS

      const { rows } = await syncCFB(supabase, nflNames, confsToSync)
      const total = await upsertBatched(supabase, rows)
      return new Response(JSON.stringify({
        success: true, total, cfb: rows.length,
        conf: confId ?? 'all', syncedAt: new Date().toISOString(),
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Default: NFL
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
