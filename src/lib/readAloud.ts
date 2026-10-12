// Reading something aloud on the TV with a recorded voice (the newsreel-voice
// function): split into short passages, recorded (once, then kept), and
// played one after another, the TV's music dipped meanwhile. A browser only
// makes sound once the page has had a click (on the TV: OK on its remote).
import { fetchVoices, type VoiceFrom } from '@/components/conquest/newsreelVoice'
import { TV_DUCK } from '@/components/conquest/Newsreel'

/** The text in passages the voice service takes (paragraphs, then sentences), at most 16 */
export function splitForVoice(text: string, max = 380): string[] {
  const sentences = text
    .split(/\n+/)
    .map(p => p.trim())
    .filter(Boolean)
    .flatMap(p => (p.length <= max ? [p] : p.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [p]))
  const out: string[] = []
  for (const s of sentences.map(x => x.trim()).filter(Boolean)) {
    const last = out[out.length - 1]
    if (last && last.length + 1 + s.length <= max && !/\n/.test(s)) out[out.length - 1] = `${last} ${s}`
    else out.push(s.slice(0, max))
  }
  return out.slice(0, 16)
}

export type ReadAloud = 'played' | 'blocked' | 'none' | 'stopped'

/**
 * Reads the text aloud in `voice`. Resolves 'played' once it's done,
 * 'blocked' if the browser won't make sound yet, 'none' if there's no
 * recording to be had, 'stopped' if `stop` was called first.
 */
export function readAloud(text: string, from: VoiceFrom, voice: string): { done: Promise<ReadAloud>; stop: () => void } {
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
    const urls = await fetchVoices(splitForVoice(text), from, voice)
    if (stopped) return 'stopped'
    if (!urls) return 'none'
    const c = ctx
    const buffers = await Promise.all(urls.map(u => !u ? null : fetch(u)
      .then(r => (r.ok ? r.arrayBuffer() : null))
      .then(b => (b ? new Promise<AudioBuffer>((resolve, reject) => { (c.decodeAudioData(b, resolve, reject) as Promise<AudioBuffer> | undefined)?.then(resolve, reject) }) : null))
      .catch(() => null)))
    if (stopped) return 'stopped'
    if (!buffers.some(Boolean)) return 'none'
    window.dispatchEvent(new CustomEvent(TV_DUCK, { detail: true }))
    try {
      for (const b of buffers) {
        if (!b) continue
        if (stopped) return 'stopped'
        await new Promise<void>(resolve => {
          const src = c.createBufferSource()
          src.buffer = b
          src.connect(c.destination)
          src.onended = () => resolve()
          current = src
          src.start()
        })
        await new Promise(r => setTimeout(r, 250))
      }
    } finally {
      window.dispatchEvent(new CustomEvent(TV_DUCK, { detail: false }))
      void c.close().catch(() => {})
    }
    return stopped ? 'stopped' : 'played'
  })()
  return { done, stop }
}
