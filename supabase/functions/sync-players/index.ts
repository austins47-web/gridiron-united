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
// ESPN team IDs verified from espn.com logos CSV (saiemgilani/c6596f0e1c8b148daabc2b7f1e6f6add)
// All ESPN groups endpoints return unfiltered results from Deno — hardcode everything.

const FBS_TEAMS_BY_CONF: Record<string, Array<{ id: number; name: string }>> = {
  'Southeastern': [
    { id: 333, name: 'Alabama' }, { id: 8, name: 'Arkansas' }, { id: 2, name: 'Auburn' },
    { id: 57, name: 'Florida' }, { id: 61, name: 'Georgia' }, { id: 96, name: 'Kentucky' },
    { id: 99, name: 'LSU' }, { id: 344, name: 'Mississippi State' }, { id: 142, name: 'Missouri' },
    { id: 145, name: 'Ole Miss' }, { id: 2579, name: 'Oklahoma' }, { id: 201, name: 'South Carolina' },
    { id: 2507, name: 'Tennessee' }, { id: 245, name: 'Texas A&M' }, { id: 251, name: 'Texas' },
    { id: 238, name: 'Vanderbilt' },
  ],
  'Big Ten': [
    { id: 356, name: 'Illinois' }, { id: 84, name: 'Indiana' }, { id: 2294, name: 'Iowa' },
    { id: 120, name: 'Maryland' }, { id: 130, name: 'Michigan' }, { id: 127, name: 'Michigan State' },
    { id: 135, name: 'Minnesota' }, { id: 158, name: 'Nebraska' }, { id: 77, name: 'Northwestern' },
    { id: 194, name: 'Ohio State' }, { id: 2483, name: 'Oregon' }, { id: 213, name: 'Penn State' },
    { id: 275, name: 'Purdue' }, { id: 164, name: 'Rutgers' }, { id: 26, name: 'UCLA' },
    { id: 30, name: 'USC' }, { id: 264, name: 'Washington' }, { id: 275, name: 'Wisconsin' },
  ],
  'Big 12': [
    { id: 12, name: 'Arizona' }, { id: 9, name: 'Arizona State' }, { id: 239, name: 'Baylor' },
    { id: 252, name: 'BYU' }, { id: 2132, name: 'Cincinnati' }, { id: 38, name: 'Colorado' },
    { id: 248, name: 'Houston' }, { id: 66, name: 'Iowa State' }, { id: 2305, name: 'Kansas' },
    { id: 2306, name: 'Kansas State' }, { id: 197, name: 'Oklahoma State' }, { id: 2628, name: 'TCU' },
    { id: 2515, name: 'Texas Tech' }, { id: 2116, name: 'UCF' }, { id: 254, name: 'Utah' },
    { id: 277, name: 'West Virginia' },
  ],
  'Atlantic Coast': [
    { id: 103, name: 'Boston College' }, { id: 25, name: 'California' }, { id: 228, name: 'Clemson' },
    { id: 150, name: 'Duke' }, { id: 52, name: 'Florida State' }, { id: 59, name: 'Georgia Tech' },
    { id: 97, name: 'Louisville' }, { id: 2390, name: 'Miami' }, { id: 152, name: 'NC State' },
    { id: 153, name: 'North Carolina' }, { id: 221, name: 'Pittsburgh' }, { id: 2579, name: 'SMU' },
    { id: 258, name: 'Stanford' }, { id: 183, name: 'Syracuse' }, { id: 261, name: 'Virginia' },
    { id: 259, name: 'Virginia Tech' }, { id: 154, name: 'Wake Forest' },
  ],
  'Pac-12': [
    { id: 68, name: 'Boise State' }, { id: 36, name: 'Colorado State' }, { id: 278, name: 'Fresno State' },
    { id: 62, name: "Hawai'i" }, { id: 2440, name: 'Nevada' }, { id: 167, name: 'New Mexico' },
    { id: 204, name: 'Oregon State' }, { id: 21, name: 'San Diego State' }, { id: 23, name: 'San Jose State' },
    { id: 2439, name: 'UNLV' }, { id: 328, name: 'Utah State' }, { id: 265, name: 'Washington State' },
    { id: 2637, name: 'Wyoming' },
  ],
  'American Athletic': [
    { id: 349, name: 'Army' }, { id: 2429, name: 'Charlotte' }, { id: 151, name: 'East Carolina' },
    { id: 2226, name: 'Florida Atlantic' }, { id: 235, name: 'Memphis' }, { id: 2426, name: 'Navy' },
    { id: 249, name: 'North Texas' }, { id: 242, name: 'Rice' }, { id: 58, name: 'South Florida' },
    { id: 218, name: 'Temple' }, { id: 2655, name: 'Tulane' }, { id: 202, name: 'Tulsa' },
    { id: 2630, name: 'UAB' }, { id: 41, name: 'Connecticut' }, { id: 2702, name: 'UTSA' },
    { id: 2567, name: 'Wichita State' },
  ],
  'Mountain West': [
    { id: 2005, name: 'Air Force' }, { id: 68, name: 'Boise State' }, { id: 36, name: 'Colorado State' },
    { id: 278, name: 'Fresno State' }, { id: 62, name: "Hawai'i" }, { id: 2440, name: 'Nevada' },
    { id: 167, name: 'New Mexico' }, { id: 21, name: 'San Diego State' }, { id: 23, name: 'San Jose State' },
    { id: 2439, name: 'UNLV' }, { id: 328, name: 'Utah State' }, { id: 2637, name: 'Wyoming' },
  ],
  'Conference USA': [
    { id: 2429, name: 'Charlotte' }, { id: 2226, name: 'Florida Atlantic' }, { id: 2229, name: 'FIU' },
    { id: 55, name: 'Jacksonville State' }, { id: 2348, name: 'Louisiana Tech' }, { id: 276, name: 'Marshall' },
    { id: 2393, name: 'Middle Tennessee' }, { id: 166, name: 'New Mexico State' }, { id: 249, name: 'North Texas' },
    { id: 295, name: 'Old Dominion' }, { id: 242, name: 'Rice' }, { id: 2229, name: 'Sam Houston' },
    { id: 2572, name: 'Southern Miss' }, { id: 2567, name: 'UTEP' }, { id: 2702, name: 'UTSA' },
    { id: 2657, name: 'Western Kentucky' },
  ],
  'Mid-American': [
    { id: 2006, name: 'Akron' }, { id: 2050, name: 'Ball State' }, { id: 189, name: 'Bowling Green' },
    { id: 2084, name: 'Buffalo' }, { id: 2117, name: 'Central Michigan' }, { id: 2199, name: 'Eastern Michigan' },
    { id: 2309, name: 'Kent State' }, { id: 193, name: 'Miami (OH)' }, { id: 2459, name: 'Northern Illinois' },
    { id: 195, name: 'Ohio' }, { id: 2332, name: 'Toledo' }, { id: 2713, name: 'Western Michigan' },
  ],
  'Sun Belt': [
    { id: 2026, name: 'Appalachian State' }, { id: 2032, name: 'Arkansas State' }, { id: 324, name: 'Coastal Carolina' },
    { id: 290, name: 'Georgia Southern' }, { id: 2247, name: 'Georgia State' }, { id: 256, name: 'James Madison' },
    { id: 309, name: 'Louisiana' }, { id: 2348, name: 'Louisiana Tech' }, { id: 2433, name: 'Louisiana Monroe' },
    { id: 276, name: 'Marshall' }, { id: 295, name: 'Old Dominion' }, { id: 6, name: 'South Alabama' },
    { id: 2572, name: 'Southern Miss' }, { id: 326, name: 'Troy' },
  ],
  'FBS Independents': [
    { id: 87, name: 'Notre Dame' }, { id: 252, name: 'BYU' }, { id: 2335, name: 'Liberty' },
    { id: 349, name: 'Army' }, { id: 41, name: 'Connecticut' }, { id: 113, name: 'Massachusetts' },
    { id: 166, name: 'New Mexico State' }, { id: 55, name: 'Jacksonville State' }, { id: 2229, name: 'Sam Houston' },
  ],
}

const FBS_CONFS = new Set(Object.keys(FBS_TEAMS_BY_CONF))

async function syncCFB(supabase: any, nflNames: Set<string>, targetConf?: string) {
  const rows: any[] = []
  const seen = new Set<string>()

  // Determine which conferences to sync
  const confsToSync = targetConf
    ? (FBS_TEAMS_BY_CONF[targetConf] ? { [targetConf]: FBS_TEAMS_BY_CONF[targetConf] } : {})
    : FBS_TEAMS_BY_CONF

  for (const [confName, teams] of Object.entries(confsToSync)) {
    console.log(`Syncing ${confName}: ${teams.length} teams`)

    const rosterResults = await Promise.all(
      teams.map(async ({ id, name }) => {
        try {
          const data = await espn(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/${id}/roster`)
          return { teamId: id, teamName: name, confName, data }
        } catch {
          return { teamId: id, teamName: name, confName, data: null }
        }
      })
    )

    for (const { teamId, teamName, confName: conf, data } of rosterResults) {
      if (!data) continue

      for (const group of (data.athletes ?? [])) {
        for (const athlete of (group.items ?? [])) {
          const pos = POS_MAP[athlete.position?.abbreviation]
          if (!pos) continue

          const name = athlete.fullName ?? `${athlete.firstName ?? ''} ${athlete.lastName ?? ''}`.trim()
          if (!name || nflNames.has(name.toLowerCase())) continue

          const key = `${athlete.id}-${teamId}`
          if (seen.has(key)) continue
          seen.add(key)

          const classYear = athlete.year ?? null
          const classMap: Record<number, string> = { 1: 'Freshman', 2: 'Sophomore', 3: 'Junior', 4: 'Senior', 5: 'Graduate' }
          // ESPN moved class data to athlete.experience.displayValue
          const rawClass = athlete.experience?.displayValue
            ?? athlete.displayClass
            ?? (classYear ? classMap[classYear] : null)
            ?? null
          const normClass = rawClass
            ? rawClass.replace(/Redshirt\s+/i, '').replace(/Graduate\s+Student/i, 'Graduate').trim()
            : null
          const validClass = ['Freshman','Sophomore','Junior','Senior','Graduate'].includes(normClass ?? '')
            ? normClass : null

          // Use shortDisplayName from roster response if available, else our hardcoded name
          const shortName = data.team?.shortDisplayName ?? data.team?.location ?? teamName

          rows.push({
            id:               50000000 + Number(athlete.id),
            name,
            team:             shortName,
            pos,
            league:           'CFB',
            conference:       conf,
            avg_pts:          0,
            proj_pts:         0,
            adp:              999,
            status:           mapStatus(athlete.injuries?.[0]?.status ?? ''),
            injury_note:      athlete.injuries?.[0]?.description ?? null,
            is_rookie:        false,
            depth_pos:        validClass,
            espn_athlete_id:  Number(athlete.id),
            updated_at:       new Date().toISOString(),
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
  const errors: string[] = []
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200)
    const { error } = await supabase
      .from('players')
      .upsert(batch, { onConflict: 'id' })
    if (error) {
      errors.push(`Batch ${Math.floor(i/200)}: ${error.message} | code: ${error.code} | details: ${error.details}`)
    } else {
      count += batch.length
    }
  }
  if (errors.length > 0) throw new Error(errors.join(' | '))
  return count
}

// ── Main ──────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const params   = new URL(req.url).searchParams
    const league   = params.get('league') ?? 'nfl'
    const confName = params.get('conf')   // optional: target conference name e.g. "Southeastern"

    if (league === 'injuries') {
      // Fast injury-only poll — updates status + injury_note without touching other fields
      const NFL_INJ_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries'
      let updated = 0
      const errors: string[] = []

      try {
        const data = await espn(NFL_INJ_URL)
        const teams = data.injuries ?? []

        for (const team of teams) {
          for (const item of (team.injuries ?? [])) {
            const athleteId = item.athlete?.id
            if (!athleteId) continue

            const rawStatus = item.status?.type?.description ?? item.status?.description ?? ''
            const status = mapStatus(rawStatus)
            const note   = item.longComment ?? item.shortComment ?? null

            const dbId = 1000000 + Number(athleteId)
            const { error } = await supabase
              .from('players')
              .update({ status, injury_note: note, updated_at: new Date().toISOString() })
              .eq('id', dbId)

            if (error) errors.push(`${athleteId}: ${error.message}`)
            else updated++
          }
        }
      } catch (e: any) {
        errors.push(`NFL injury fetch: ${e.message}`)
      }

      return new Response(JSON.stringify({
        success: true, updated, errors, syncedAt: new Date().toISOString(),
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    if (league === 'cfb') {
      const { data: nflPlayers } = await supabase
        .from('players').select('name').eq('league', 'NFL').neq('pos', 'DST')
      const nflNames = new Set((nflPlayers ?? []).map((p: any) => p.name.toLowerCase()))

      const { rows } = await syncCFB(supabase, nflNames, confName ?? undefined)
      const total = await upsertBatched(supabase, rows)
      return new Response(JSON.stringify({
        success: true, total, cfb: rows.length,
        conf: confName ?? 'all', syncedAt: new Date().toISOString(),
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
