// ══════════════════════════════════════════════════════════════
// newsreel-voice — the Conquest newsreel's narrator
//
// POST { token, lines, voice? } (the Shop TV) or { league_id, lines, voice? }
// (signed in, a member): the lines read aloud, as links to MP3s.
//   voice 'newsreel' (the default): Clyde, a vintage radio announcer from
//     ElevenLabs' library, for the Conquest newsreel.
//   voice 'roast': Grampa Werthers, an old and cranky American timer from
//     ElevenLabs' library, for the weekly roast on the TV.
// If ElevenLabs can't (no characters left this month, say), an OpenAI
// voice directed to sound like it.
// Each line is recorded once per voice and kept (the newsreel-voice bucket,
// named by a hash of the line and the voice), so a newsreel played again
// costs nothing; a league records at most DAILY_LINES new lines a day.
// Answers { voices: null } with neither key set: the newsreel then uses the
// device's voice, or its robot one.
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
const MAX_LINES = 16
const MAX_CHARS = 400
const DAILY_LINES = 120

interface Profile {
  eleven: { voice: string; model: string; settings: Record<string, unknown> }
  /** the stand-in: OpenAI, directed to sound like it */
  openai: { model: string; voice: string; instructions: string }
}
const PROFILES: Record<string, Profile> = {
  // Clyde - Vintage and Warm Radio Announcer, a little quick and very expressive
  newsreel: {
    eleven: {
      voice: 'QMJTqaMXmGnG8TCm8WQG',
      model: 'eleven_multilingual_v2',
      settings: { stability: 0.3, similarity_boost: 0.8, style: 0.65, use_speaker_boost: true, speed: 1.1 },
    },
    openai: {
      model: 'gpt-4o-mini-tts',
      voice: 'ash',
      instructions: [
        'Affect: the most extravagant newsreel narrator of the 1940s, a flamboyant showman of the silver screen, wildly over the top: bombastic, florid and melodramatic.',
        'Accent: a strong Transatlantic (Mid-Atlantic) accent, half upper-class British and half American; drop the R after vowels, broad A, crisp T sounds.',
        'Pacing: fast and driving, with a dramatic swell on each headline and a thunderous landing at the end of every sentence.',
      ].join(' '),
    },
  },
  // Grampa Werthers - Old & Cranky, taking his time
  roast: {
    eleven: {
      voice: 'MKlLqCItoCkvdhrxgtLv',
      model: 'eleven_multilingual_v2',
      settings: { stability: 0.45, similarity_boost: 0.85, style: 0.5, use_speaker_boost: true, speed: 0.9 },
    },
    openai: {
      model: 'gpt-4o-mini-tts',
      voice: 'sage',
      instructions: 'Voice: a cranky old American grandpa, gravelly and grumbling. Tone: fed up with everybody, delivering a savage roast with deadpan comic timing and a little relish on every insult.',
    },
  },
}

interface Voice {
  /** what makes its recordings its own (hashed into their names) */
  id: string
  /** how many it'll make at once */
  together: number
  make(text: string): Promise<Uint8Array>
}

class VoiceError extends Error {
  constructor(message: string, readonly status: number, readonly giveUp: boolean) { super(message) }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({})) as { token?: string; league_id?: string; lines?: unknown; voice?: string }

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

    const profile = PROFILES[typeof body.voice === 'string' ? body.voice : 'newsreel']
    if (!profile) return json({ error: 'Unknown voice' }, 400)
    const voices = voicesAvailable(profile)
    if (!voices.length) return json({ voices: null, reason: 'no-key' })

    const publicUrl = (p: string) => `${url}/storage/v1/object/public/${BUCKET}/${p}`
    const pathOf = async (v: Voice, line: string) => `v1/${await sha256(`${v.id}|${line}`)}.mp3`
    const kept = async (p: string) => fetch(publicUrl(p), { method: 'HEAD' }).then(r => r.ok, () => false)

    // Lines the first voice has already recorded need nothing more
    const out: (string | null)[] = lines.map(() => null)
    let todo: number[] = []
    await Promise.all(lines.map(async (l, i) => {
      const p = await pathOf(voices[0], l)
      if (await kept(p)) out[i] = publicUrl(p)
      else todo.push(i)
    }))

    if (todo.length) {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString()
      const { count } = await admin.from('newsreel_voice_log').select('id', { count: 'exact', head: true }).eq('league_id', leagueId).gte('created_at', since)
      if ((count ?? 0) + todo.length > DAILY_LINES) return json({ voices: null, reason: 'daily-limit' })
      const made: { league_id: string; chars: number }[] = []
      // Each voice in turn takes whatever the one before couldn't
      for (const v of voices) {
        if (!todo.length) break
        const failed: number[] = []
        let gaveUp = false
        await pool(todo, v.together, async i => {
          const p = await pathOf(v, lines[i])
          if (await kept(p)) { out[i] = publicUrl(p); return }
          if (gaveUp) { failed.push(i); return }
          try {
            const audio = await v.make(lines[i])
            const { error } = await admin.storage.from(BUCKET).upload(p, audio, { contentType: 'audio/mpeg', cacheControl: '31536000', upsert: true })
            if (error) throw error
            out[i] = publicUrl(p)
            made.push({ league_id: leagueId!, chars: lines[i].length })
          } catch (e) {
            // No plan for this voice, or no characters left: the next voice takes the rest
            if (e instanceof VoiceError && e.giveUp) gaveUp = true
            console.error('newsreel-voice:', v.id.split('|')[0], e instanceof Error ? e.message : e)
            failed.push(i)
          }
        })
        todo = failed
      }
      if (made.length) await admin.from('newsreel_voice_log').insert(made)
    }
    return json({ voices: out.some(Boolean) ? out : null })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

/** The voices there are keys for, the one we want first */
function voicesAvailable({ eleven: ELEVEN, openai: OPENAI }: Profile): Voice[] {
  const out: Voice[] = []
  const xi = Deno.env.get('ELEVENLABS_API_KEY')
  if (xi) {
    out.push({
      id: `elevenlabs|${ELEVEN.voice}|${ELEVEN.model}|${JSON.stringify(ELEVEN.settings)}`,
      together: 2,
      async make(text) {
        for (let attempt = 0; ; attempt++) {
          const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN.voice}?output_format=mp3_44100_128`, {
            method: 'POST',
            headers: { 'xi-api-key': xi, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, model_id: ELEVEN.model, voice_settings: ELEVEN.settings }),
          })
          if (r.ok) return new Uint8Array(await r.arrayBuffer())
          const said = (await r.text()).slice(0, 300)
          // Too many at once: wait a moment and try again
          if (r.status === 429 && attempt < 2 && !/quota/i.test(said)) { await new Promise(res => setTimeout(res, 1500 * (attempt + 1))); continue }
          const giveUp = r.status === 401 || r.status === 402 || /quota|paid_plan|free_users|tier/i.test(said)
          throw new VoiceError(`ElevenLabs said ${r.status}: ${said}`, r.status, giveUp)
        }
      },
    })
  }
  const openai = Deno.env.get('OPENAI_API_KEY')
  if (openai) {
    out.push({
      id: `${OPENAI.model}|${OPENAI.voice}|${OPENAI.instructions}`,
      together: 8,
      async make(text) {
        const r = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: { Authorization: `Bearer ${openai}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: OPENAI.model, voice: OPENAI.voice, input: text, instructions: OPENAI.instructions, response_format: 'mp3' }),
        })
        if (!r.ok) throw new VoiceError(`OpenAI said ${r.status}: ${(await r.text()).slice(0, 200)}`, r.status, r.status === 401 || r.status === 429)
        return new Uint8Array(await r.arrayBuffer())
      },
    })
  }
  return out
}

/** Runs `job` on each item, at most `n` at a time */
async function pool<T>(items: T[], n: number, job: (item: T) => Promise<void>) {
  const queue = [...items]
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await job(item)
  }))
}

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}
