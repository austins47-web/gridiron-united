// supabase/functions/backfill-college/index.ts
//
// Backfills the `college` column for NFL players, needed for The
// Bridge feature (connecting an NFL player to a same-school CFB
// player on the user's own roster). Only processes players where
// college IS NULL, so it's safely re-runnable / resumable across
// multiple invocations rather than needing to complete all ~979
// players in one call.
//
// ESPN ID is derived from the DB id via the established convention
// (NFL DB id = espnId + 1_000_000) rather than trusting
// espn_athlete_id, which has been observed null on real rows.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ESPN 403s bare/default-user-agent requests — same proven header
// set as sync-nfl-schedule and the sportsdata proxy.
const ESPN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Gridiron-United/1.0)',
  'Accept': 'application/json',
}

const BATCH_SIZE = 60      // players processed per invocation
const CONCURRENCY = 12     // simultaneous ESPN calls — cautious given past 403 rate-limiting

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: players, error: fetchErr } = await supabase
    .from('players')
    .select('id, name')
    .eq('league', 'NFL')
    .is('college', null)
    .neq('pos', 'DST') // team defenses never attended a college
    .limit(BATCH_SIZE)

  if (fetchErr) {
    return new Response(JSON.stringify({ ok: false, error: fetchErr.message }), { status: 500, headers: CORS })
  }
  if (!players || players.length === 0) {
    return new Response(JSON.stringify({ ok: true, updated: 0, remaining: 0, done: true }), { headers: CORS })
  }

  let updated = 0
  const errors: string[] = []

  // Process in small concurrent chunks rather than all-at-once or
  // fully sequential — balances speed against ESPN's rate limits.
  for (let i = 0; i < players.length; i += CONCURRENCY) {
    const chunk = players.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(chunk.map(async (p) => {
      const espnId = p.id - 1_000_000
      const res = await fetch(
        `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${espnId}`,
        { headers: ESPN_HEADERS },
      )
      if (!res.ok) throw new Error(`${p.name} (${res.status})`)
      const data = await res.json()
      const college = data?.athlete?.college?.name ?? ''
      // '' rather than null when ESPN has no college listed for this
      // player (international players, some longtime vets, etc).
      // Writing null again here would be indistinguishable from
      // "never processed" under the WHERE college IS NULL filter
      // above — that row would match forever and this function
      // would loop on it endlessly. '' is genuinely distinct from
      // NULL, so it correctly falls out of future batches, while a
      // truthy check downstream (`if (college)`) treats '' the same
      // as "no college" either way.
      const { error } = await supabase.from('players').update({ college }).eq('id', p.id)
      if (error) throw error
      if (college) updated++
    }))
    for (const r of results) {
      if (r.status === 'rejected') errors.push(String(r.reason))
    }
  }

  const { count: remaining } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('league', 'NFL')
    .is('college', null)
    .neq('pos', 'DST')

  return new Response(JSON.stringify({
    ok: true,
    processedThisBatch: players.length,
    updated,
    remaining: remaining ?? 0,
    done: (remaining ?? 0) === 0,
    errors: errors.slice(0, 10), // cap so the response doesn't balloon
  }), { headers: CORS })
})
