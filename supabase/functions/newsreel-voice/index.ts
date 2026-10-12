// ══════════════════════════════════════════════════════════════
// newsreel-voice — the Conquest newsreel's narrator
//
// POST { token, lines } (the Shop TV) or { league_id, lines } (signed in,
// a member): the lines read by a 1940s newsreel announcer with a
// Transatlantic accent (OpenAI text-to-speech), as links to MP3s. Each line
// is recorded once and kept (the newsreel-voice bucket, named by a hash of
// the line and the voice), so a newsreel played again costs nothing; a
// league records at most DAILY_LINES new lines a day.
// Answers { voices: null } until OPENAI_API_KEY is set: the newsreel then
// uses the device's voice, or its robot one.
// ══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } })

const BUCKET = 'newsreel-voice'
const MODEL = 'gpt-4o-mini-tts'
const VOICE = 'onyx'
const INSTRUCTIONS = [
  'Voice: a 1940s cinema newsreel announcer with a Transatlantic (Mid-Atlantic) accent: crisp and clipped, non-rhotic, a polished blend of British and American.',
  'Tone: urgent, dramatic and grand, as if reporting news from the front to a packed movie theater.',
  'Pacing: brisk and punchy, with a confident lift on names and cities and a short dramatic pause before the big news.',
].join(' ')
const MAX_LINES = 16
const MAX_CHARS = 400
const DAILY_LINES = 120

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({})) as { token?: string; league_id?: string; lines?: unknown }

  try {
    // Who's asking: the league's TV, or one of its members
    let leagueId: string | null = null
    if (typeof body.token === 'string' && body.token) {
      const { data } = await admin.from('league_tv_tokens').select('league_id').eq('token', body.token).maybeSingle()
      leagueId = (data?.league_id as string | undefined) ?? null
    } else if (typeof body.league_id === 'string') {
      const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
      const { data: { user } } = await userClient.auth.getUser()
      if (!user) return json({ error: 'Sign in first' }, 401)
      const { data: member } = await admin.from('league_members').select('user_id').eq('league_id', body.league_id).eq('user_id', user.id).maybeSingle()
      if (member) leagueId = body.league_id
    }
    if (!leagueId) return json({ error: 'Not your league' }, 403)

    const lines = Array.isArray(body.lines) ? body.lines.filter((l): l is string => typeof l === 'string').map(l => l.trim().slice(0, MAX_CHARS)) : []
    if (!lines.length || lines.length > MAX_LINES) return json({ error: `Send 1 to ${MAX_LINES} lines` }, 400)

    const key = Deno.env.get('OPENAI_API_KEY')
    if (!key) return json({ voices: null, reason: 'no-key' })

    // Each line's recording, by what it says and how
    const paths = await Promise.all(lines.map(async l => `v1/${await sha256(`${MODEL}|${VOICE}|${INSTRUCTIONS}|${l}`)}.mp3`))
    const publicUrl = (p: string) => `${url}/storage/v1/object/public/${BUCKET}/${p}`
    const have = await Promise.all(paths.map(p => fetch(publicUrl(p), { method: 'HEAD' }).then(r => r.ok, () => false)))
    const missing = lines.map((_, i) => i).filter(i => !have[i])

    if (missing.length) {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString()
      const { count } = await admin.from('newsreel_voice_log').select('id', { count: 'exact', head: true }).eq('league_id', leagueId).gte('created_at', since)
      if ((count ?? 0) + missing.length > DAILY_LINES) return json({ voices: null, reason: 'daily-limit' })
      const made = await Promise.all(missing.map(async i => {
        const r = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: MODEL, voice: VOICE, input: lines[i], instructions: INSTRUCTIONS, response_format: 'mp3' }),
        })
        if (!r.ok) throw new Error(`The voice service said ${r.status}: ${(await r.text()).slice(0, 200)}`)
        const audio = new Uint8Array(await r.arrayBuffer())
        const { error } = await admin.storage.from(BUCKET).upload(paths[i], audio, { contentType: 'audio/mpeg', cacheControl: '31536000', upsert: true })
        if (error) throw error
        return { league_id: leagueId, chars: lines[i].length }
      }))
      await admin.from('newsreel_voice_log').insert(made)
    }
    return json({ voices: paths.map(publicUrl) })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}
