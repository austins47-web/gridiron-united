import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')!

async function proxyFetch(endpoint: string) {
  const r = await fetch(
    `${SUPABASE_URL}/functions/v1/sportsdata?endpoint=${encodeURIComponent(endpoint)}`,
    { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
  )
  if (!r.ok) throw new Error(`proxy ${r.status}: ${endpoint}`)
  return r.json()
}

function parseBoxScore(summary: any): Map<number, Record<string, number>> {
  const stats = new Map<number, Record<string, number>>()

  const blank = () => ({
    pass_yards: 0, pass_tds: 0, pass_ints: 0, pass_attempts: 0, pass_completions: 0,
    rush_yards: 0, rush_tds: 0, rush_attempts: 0,
    rec_yards: 0, rec_tds: 0, receptions: 0, targets: 0,
    fumbles_lost: 0, two_pt_convs: 0,
    fg_0_39: 0, fg_40_49: 0, fg_50_plus: 0, pat_made: 0, fg_miss: 0,
    dst_sacks: 0, dst_ints: 0, dst_fumble_rec: 0, dst_tds: 0,
    dst_safeties: 0, dst_blocked: 0, dst_pts_allowed: 0,
  })

  const get = (id: number) => { if (!stats.has(id)) stats.set(id, blank()); return stats.get(id)! }

  for (const teamBlock of (summary.boxScore?.players ?? [])) {
    for (const statBlock of (teamBlock.statistics ?? [])) {
      const cat  = (statBlock.name ?? '').toLowerCase()
      const keys = (statBlock.keys ?? []) as string[]

      for (const ath of (statBlock.athletes ?? [])) {
        const aid = parseInt(ath.athlete?.id ?? '0')
        if (!aid) continue
        const s   = get(aid)
        const v   = (ath.stats ?? []) as string[]
        const n   = (i: number) => parseFloat(v[i] ?? '0') || 0
        const ni  = (i: number) => parseInt(v[i]  ?? '0') || 0

        if (cat === 'passing') {
          const [comp, att] = (v[0] ?? '0/0').split('/')
          s.pass_completions += parseInt(comp) || 0
          s.pass_attempts    += parseInt(att)  || 0
          s.pass_yards       += ni(1)
          s.pass_tds         += ni(3)
          s.pass_ints        += ni(4)
        } else if (cat === 'rushing') {
          s.rush_attempts += ni(0)
          s.rush_yards    += ni(1)
          s.rush_tds      += ni(3)
        } else if (cat === 'receiving') {
          s.receptions += ni(0)
          s.rec_yards  += ni(1)
          s.rec_tds    += ni(3)
          s.targets    += ni(5)
        } else if (cat === 'kicking') {
          // v[0] = FG made/att, v[4] = XP made/att
          // Determine bucket from yardage is hard without play-by-play;
          // for now put all made FGs in 0-39 bucket as fallback
          const [fgM] = (v[0] ?? '0/0').split('/')
          const [xpM] = (v[4] ?? '0/0').split('/')
          s.fg_0_39  += parseInt(fgM) || 0
          s.pat_made += parseInt(xpM) || 0
        } else if (cat === 'defensive' || cat === 'defense') {
          s.dst_sacks += n(2)
          s.dst_tds   += ni(6)
        } else if (cat === 'interceptions') {
          s.dst_ints += ni(0)
        } else if (cat === 'fumbles') {
          s.dst_fumble_rec += ni(2)
        }
      }
    }
  }

  // DST points allowed per team
  const teams = summary.boxScore?.teams ?? []
  for (let ti = 0; ti < teams.length; ti++) {
    const oppTeam = teams[1 - ti] // opponent
    const oppScore = parseInt(oppTeam?.homeAway === 'home'
      ? summary.header?.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home')?.score ?? '0'
      : summary.header?.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'away')?.score ?? '0') || 0
    const dstId = parseInt(teams[ti].team?.id ?? '0') + 900000000
    if (dstId > 900000000) {
      const s = get(dstId)
      s.dst_pts_allowed = oppScore
    }
  }

  return stats
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const now = new Date()

  const { data: activeGames, error: gErr } = await supabase
    .from('live_games').select('*').eq('status', 'in_progress')

  if (gErr) return new Response(JSON.stringify({ error: gErr.message }), { headers: CORS, status: 500 })
  if (!activeGames?.length) return new Response(JSON.stringify({ polled: 0, msg: 'No active games' }), { headers: CORS })

  const results: any[] = []

  await Promise.all(activeGames.map(async (game: any) => {
    try {
      const summary = await proxyFetch(`game/summary/${game.league}/${game.game_id}`)
      const statsMap = parseBoxScore(summary)
      const athleteIds = [...statsMap.keys()]

      const { data: playerRows } = await supabase
        .from('players').select('id, espn_athlete_id').in('espn_athlete_id', athleteIds)

      const idMap = new Map<number, number>()
      for (const p of (playerRows ?? [])) if (p.espn_athlete_id) idMap.set(p.espn_athlete_id, p.id)

      const rows = athleteIds.map(aid => ({
        game_id:         game.game_id,
        espn_athlete_id: aid,
        player_id:       idMap.get(aid) ?? null,
        league:          game.league,
        season:          game.season,
        week:            game.week,
        ...statsMap.get(aid),
        updated_at:      now.toISOString(),
      }))

      if (rows.length > 0) {
        const { error } = await supabase
          .from('live_player_stats')
          .upsert(rows, { onConflict: 'game_id,espn_athlete_id' })
        if (error) throw new Error(error.message)
      }

      await supabase.from('live_games')
        .update({ last_polled_at: now.toISOString() })
        .eq('game_id', game.game_id)

      results.push({ game_id: game.game_id, athletes: rows.length })
    } catch (e: any) {
      results.push({ game_id: game.game_id, error: e.message })
    }
  }))

  return new Response(JSON.stringify({ polled: activeGames.length, results }), { headers: CORS })
})
