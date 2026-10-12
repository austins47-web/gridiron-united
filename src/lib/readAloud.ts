// Reading something aloud on the TV with a recorded voice (the newsreel-voice
// function): split into short passages, recorded (once, then kept), and
// played one after another, the TV's music dipped meanwhile, with a sound
// between paragraphs if there's one (the roast's gong). A browser only makes
// sound once the page has had a click (on the TV: OK on its remote).
import { fetchVoices, type VoiceFrom } from '@/components/conquest/newsreelVoice'
import { TV_DUCK } from '@/components/conquest/Newsreel'

/**
 * The text in passages the voice service takes: each paragraph its own,
 * split at sentences when it's long; at most 16. `breaks[i]`: passage i
 * ends a paragraph and another follows.
 */
export function passagesOf(text: string, max = 380): { lines: string[]; breaks: boolean[] } {
  const lines: string[] = []
  const breaks: boolean[] = []
  for (const p of text.split(/\n+/).map(x => x.trim()).filter(Boolean)) {
    const start = lines.length
    const sentences = p.length <= max ? [p] : p.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [p]
    for (const s of sentences.map(x => x.trim()).filter(Boolean)) {
      const last = lines.length > start ? lines[lines.length - 1] : null
      if (last && last.length + 1 + s.length <= max) lines[lines.length - 1] = `${last} ${s}`
      else { lines.push(s.slice(0, max)); breaks.push(false) }
    }
    if (lines.length > start) breaks[lines.length - 1] = true
  }
  const n = Math.min(16, lines.length)
  return { lines: lines.slice(0, n), breaks: breaks.slice(0, n).map((b, i) => b && i < n - 1) }
}

/** How a team's abbreviation is said aloud: the city, or the nickname where the city's shared */
const SAY_TEAM: Record<string, string> = {
  ARI: 'Arizona', ATL: 'Atlanta', BAL: 'Baltimore', BUF: 'Buffalo', CAR: 'Carolina', CHI: 'Chicago',
  CIN: 'Cincinnati', CLE: 'Cleveland', DAL: 'Dallas', DEN: 'Denver', DET: 'Detroit', GB: 'Green Bay',
  HOU: 'Houston', IND: 'Indianapolis', JAX: 'Jacksonville', JAC: 'Jacksonville', KC: 'Kansas City',
  LV: 'Las Vegas', LAC: 'the Chargers', LAR: 'the Rams', MIA: 'Miami', MIN: 'Minnesota', NE: 'New England',
  NO: 'New Orleans', NYG: 'the Giants', NYJ: 'the Jets', PHI: 'Philadelphia', PIT: 'Pittsburgh',
  SF: 'San Francisco', SEA: 'Seattle', TB: 'Tampa Bay', TEN: 'Tennessee', WSH: 'Washington', WAS: 'Washington',
}
/** Abbreviations that are also words someone might shout ("NO mercy"): only swapped when they're clearly a team */
const WORDLIKE = new Set(['NO', 'TEN', 'CAR', 'MIN', 'SEA', 'WAS'])
const TEAM_CUE_BEFORE = /\b(?:vs\.?|versus|over|at|beat|beats|beating|picked|picking|pick|took|taking|fading|backing|on|with|and|or)\s+$/i

/** The text as it should be said: team abbreviations as names ("ATL" → "Atlanta"), scores as "40 to 24", picks as "5 of 16" */
export function spoken(text: string): string {
  return text
    .replace(/\b([A-Z]{2,3})\b/g, (m, abbr: string, at: number, all: string) => {
      const say = SAY_TEAM[abbr]
      if (!say) return m
      if (!WORDLIKE.has(abbr)) return say
      const before = all.slice(Math.max(0, at - 14), at)
      const after = all.slice(at + abbr.length, at + abbr.length + 10)
      return TEAM_CUE_BEFORE.test(before) || /^\s*(?:vs\.?|over|at|\d)/i.test(after) ? say : m
    })
    .replace(/\b(\d{1,2})-(\d{1,2})\b/g, '$1 to $2')
    .replace(/\b(\d{1,2})\/(\d{1,2})\b/g, '$1 of $2')
}

export type ReadAloud = 'played' | 'blocked' | 'none' | 'stopped'

/**
 * Reads the text aloud in `voice`, with the `between` sound (a file's URL)
 * between paragraphs. Resolves 'played' once it's done, 'blocked' if the
 * browser won't make sound yet, 'none' if there's no recording to be had,
 * 'stopped' if `stop` was called first.
 */
export function readAloud(text: string, from: VoiceFrom, voice: string, between?: string): { done: Promise<ReadAloud>; stop: () => void } {
  let stopped = false
  let ctx: AudioContext | null = null
  let current: AudioBufferSourceNode | null = null
  const stop = () => {
    stopped = true
    try { current?.stop() } catch { /* already stopped */ }
    void ctx?.close().catch(() => {})
  }
  const done = (async (): Promise<ReadAloud> => {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return 'none'
    ctx = new AC()
    if (ctx.state !== 'running') await Promise.race([ctx.resume().catch(() => {}), new Promise(r => setTimeout(r, 300))])
    if (ctx.state !== 'running') { void ctx.close().catch(() => {}); return 'blocked' }
    const c = ctx
    const load = (u: string | null) => !u ? Promise.resolve(null) : fetch(u)
      .then(r => (r.ok ? r.arrayBuffer() : null))
      .then(b => (b ? new Promise<AudioBuffer>((resolve, reject) => { (c.decodeAudioData(b, resolve, reject) as Promise<AudioBuffer> | undefined)?.then(resolve, reject) }) : null))
      .catch(() => null)
    const { lines, breaks } = passagesOf(text)
    const [urls, sting] = await Promise.all([fetchVoices(lines.map(spoken), from, voice), load(between ?? null)])
    if (stopped) return 'stopped'
    if (!urls) return 'none'
    const buffers = await Promise.all(urls.map(load))
    if (stopped) return 'stopped'
    if (!buffers.some(Boolean)) return 'none'
    const play = (b: AudioBuffer, gain = 1) => {
      const src = c.createBufferSource()
      src.buffer = b
      const g = c.createGain()
      g.gain.value = gain
      src.connect(g).connect(c.destination)
      src.start()
      return src
    }
    const pause = (ms: number) => new Promise(r => setTimeout(r, ms))
    window.dispatchEvent(new CustomEvent(TV_DUCK, { detail: true }))
    try {
      for (let i = 0; i < buffers.length; i++) {
        const b = buffers[i]
        if (!b) continue
        if (stopped) return 'stopped'
        await new Promise<void>(resolve => {
          current = play(b)
          current.onended = () => resolve()
        })
        // Between paragraphs: the gong, ringing on under the start of the next
        if (breaks[i] && sting && !stopped) {
          await pause(300)
          play(sting, 0.6)
          await pause(1500)
        } else {
          await pause(250)
        }
      }
    } finally {
      window.dispatchEvent(new CustomEvent(TV_DUCK, { detail: false }))
      // (after the last gong's had a moment to ring)
      setTimeout(() => void c.close().catch(() => {}), 1500)
    }
    return stopped ? 'stopped' : 'played'
  })()
  return { done, stop }
}
