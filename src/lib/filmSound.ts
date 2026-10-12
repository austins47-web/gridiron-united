// The newsreel's sound, made in the browser: a projector's rattle under film
// hiss and crackle, the leader's countdown beeps and a bugle call, all run
// through an old-radio filter; and the narrator: recordings of a
// Transatlantic newsreel announcer (the newsreel-voice function) through the
// same filter when there are some, or the device's own voice
// (speechSynthesis) where it has one that talks, or else (the Fire TV's
// browser has none) a robot announcer made right here (eSpeak, in
// public/vendor/mespeak) through the filter. A browser only makes sound
// once the page has been clicked or tapped (on the TV: OK on its remote),
// so every piece says whether it could.

const SR = 22050

type Filter = (x: number) => number
function biquad(type: 'lp' | 'hp', f0: number, q = 0.707, sr = SR): Filter {
  const w = (2 * Math.PI * f0) / sr, a = Math.sin(w) / (2 * q), c = Math.cos(w)
  const [b0, b1, b2] = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2]
  const a0 = 1 + a, a1 = -2 * c, a2 = 1 - a
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  return x => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1; x1 = x; y2 = y1; y1 = y
    return y
  }
}

/** Telephone-thin and a little overdriven, like a 1940s loudspeaker */
function radio(sig: Float32Array, drive = 1.6, sr = SR): Float32Array {
  const h1 = biquad('hp', 320, 0.707, sr), h2 = biquad('hp', 320, 0.707, sr), l1 = biquad('lp', 3000, 0.707, sr), l2 = biquad('lp', 3000, 0.707, sr)
  const out = new Float32Array(sig.length)
  for (let i = 0; i < sig.length; i++) out[i] = (Math.tanh(l2(l1(h2(h1(sig[i])))) * drive) / Math.tanh(drive)) * 0.9
  return out
}

/** A bugle call: sawtooth notes with a little vibrato and a third below for harmony */
function bugle(notes: [number, number][]): Float32Array {
  const total = notes.reduce((t, n) => t + n[1], 0)
  const out = new Float32Array(Math.ceil((total + 0.3) * SR))
  let t0 = 0
  for (const [f, d] of notes) {
    const n = Math.floor(d * SR)
    for (const [ff, g] of [[f, 0.55], [f * 0.8, 0.3]] as const) {
      let ph = 0
      for (let i = 0; i < n + SR * 0.12; i++) {
        const t = i / SR
        const env = Math.min(1, t / 0.025) * (i < n ? 1 : Math.max(0, 1 - (i - n) / (SR * 0.12))) * (0.85 + 0.15 * Math.exp(-t * 6))
        ph += (ff * (1 + 0.006 * Math.sin(2 * Math.PI * 5.5 * t))) / SR
        const k = Math.floor((t0 + t) * SR)
        if (k < out.length) out[k] += (2 * (ph % 1) - 1) * env * g * 0.5
      }
    }
    t0 += d
  }
  return radio(out)
}

const G4 = 392, C5 = 523.25, E5 = 659.25, G5 = 783.99
let cache: { fanfare: Float32Array; sting: Float32Array; beep: Float32Array; bed: Float32Array } | null = null
function sounds() {
  if (cache) return cache
  const beep = new Float32Array(Math.floor(0.09 * SR))
  for (let i = 0; i < beep.length; i++) beep[i] = Math.sin((2 * Math.PI * 1000 * i) / SR) * 0.35
  // Four seconds of film that loops: hiss, the projector's 24-frame rattle, the odd crackle
  const bed = new Float32Array(4 * SR)
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const hissLp = biquad('lp', 5000), hissHp = biquad('hp', 400), rattleLp = biquad('lp', 900)
  for (let i = 0; i < bed.length; i++) {
    const t = i / SR, n = rnd() * 2 - 1
    bed[i] += hissHp(hissLp(n)) * 0.05
    bed[i] += rattleLp(n) * 0.09 * Math.pow(Math.max(0, Math.sin(2 * Math.PI * 24 * t)), 12)
    if (rnd() < 0.0009) {
      const amp = 0.15 + rnd() * 0.4, len = 10 + Math.floor(rnd() * 40)
      for (let k = 0; k < len && i + k < bed.length; k++) bed[i + k] += (rnd() * 2 - 1) * amp * Math.exp(-k / 8)
    }
  }
  cache = {
    fanfare: bugle([[G4, 0.16], [C5, 0.16], [E5, 0.16], [G5, 0.6], [E5, 0.18], [G5, 1.1]]),
    sting: bugle([[C5, 0.14], [E5, 0.14], [G5, 0.14], [C5 * 2, 1.0]]),
    beep,
    bed,
  }
  return cache
}

export interface FilmSound {
  /** whether the browser lets it make sound now */
  readonly on: boolean
  /** try to turn the sound on (works inside a click or tap, or once the page has had one) */
  unlock(): Promise<boolean>
  beep(): void
  fanfare(): void
  sting(): void
  /** the projector running under everything */
  bed(on: boolean): void
  /** a narrator's line (a WAV file's bytes) through the radio; resolves once it's played, false if it couldn't be */
  voice(wav: ArrayLike<number>): Promise<boolean>
  /** a recording (an MP3's bytes) made ready to play through the radio, or null if it won't decode */
  prepare(audio: ArrayBuffer): Promise<AudioBuffer | null>
  /** plays what prepare made; resolves once it's played, false if it couldn't be */
  play(ready: AudioBuffer): Promise<boolean>
  close(): void
}

/** A WAV file's samples (16-bit PCM, its first channel). */
function readWav(bytes: ArrayLike<number>): { samples: Float32Array; rate: number } | null {
  const b = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes)
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const tag = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])
  if (b.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null
  let rate = SR, channels = 1, o = 12
  while (o + 8 <= b.length) {
    const id = tag(o), n = v.getUint32(o + 4, true)
    if (id === 'fmt ') { channels = v.getUint16(o + 10, true) || 1; rate = v.getUint32(o + 12, true) || SR }
    if (id === 'data') {
      const end = Math.min(b.length, o + 8 + n), count = Math.floor((end - o - 8) / (2 * channels))
      const samples = new Float32Array(count)
      for (let i = 0; i < count; i++) samples[i] = v.getInt16(o + 8 + i * 2 * channels, true) / 32768
      return { samples, rate }
    }
    o += 8 + n + (n % 2)
  }
  return null
}

export function createFilmSound(): FilmSound {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  let ctx: AudioContext | null = null
  try { ctx = AC ? new AC() : null } catch { ctx = null }
  const buffers = new Map<Float32Array, AudioBuffer>()
  const bufferOf = (sig: Float32Array) => {
    let b = buffers.get(sig)
    if (!b && ctx) {
      b = ctx.createBuffer(1, sig.length, SR)
      b.getChannelData(0).set(sig)
      buffers.set(sig, b)
    }
    return b
  }
  const play = (sig: Float32Array, gain: number, loop = false) => {
    if (!ctx || ctx.state !== 'running') return null
    const src = ctx.createBufferSource()
    src.buffer = bufferOf(sig) ?? null
    src.loop = loop
    const g = ctx.createGain()
    g.gain.value = gain
    src.connect(g).connect(ctx.destination)
    src.start()
    return src
  }
  let bedSrc: AudioBufferSourceNode | null = null
  let bedOn = false
  const self: FilmSound = {
    get on() { return ctx?.state === 'running' },
    async unlock() {
      if (!ctx) return false
      if (ctx.state !== 'running') {
        // resume() can hang while the browser's holding sound back: don't wait on it forever
        await Promise.race([ctx.resume().catch(() => {}), new Promise(r => setTimeout(r, 300))])
      }
      if (ctx.state === 'running' && bedOn && !bedSrc) bedSrc = play(sounds().bed, 0.55, true)
      return ctx.state === 'running'
    },
    beep() { play(sounds().beep, 0.8) },
    fanfare() { play(sounds().fanfare, 0.7) },
    sting() { play(sounds().sting, 0.7) },
    bed(on) {
      bedOn = on
      if (on && !bedSrc) bedSrc = play(sounds().bed, 0.55, true)
      if (!on && bedSrc) { try { bedSrc.stop() } catch { /* already stopped */ } bedSrc = null }
    },
    voice(wav) {
      const pcm = readWav(wav)
      if (!pcm || !pcm.samples.length || !ctx || ctx.state !== 'running') return Promise.resolve(false)
      const buf = ctx.createBuffer(1, pcm.samples.length, pcm.rate)
      buf.getChannelData(0).set(radio(pcm.samples, 2.2, pcm.rate))
      return self.play(buf)
    },
    async prepare(audio) {
      if (!ctx) return null
      try {
        // (the callback form too: older browsers don't return a promise)
        const c = ctx
        const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
          const p = c.decodeAudioData(audio, resolve, reject) as Promise<AudioBuffer> | undefined
          p?.then(resolve, reject)
        })
        const out = c.createBuffer(1, decoded.length, decoded.sampleRate)
        out.getChannelData(0).set(radio(decoded.getChannelData(0), 1.8, decoded.sampleRate))
        return out
      } catch {
        return null
      }
    },
    play(ready) {
      if (!ctx || ctx.state !== 'running') return Promise.resolve(false)
      const src = ctx.createBufferSource()
      src.buffer = ready
      const g = ctx.createGain()
      g.gain.value = 1.1
      src.connect(g).connect(ctx.destination)
      return new Promise(resolve => {
        src.onended = () => resolve(true)
        src.start()
      })
    },
    close() {
      self.bed(false)
      void ctx?.close().catch(() => {})
      ctx = null
    },
  }
  return self
}

/** The robot announcer (eSpeak, British), loaded the first time it's needed. */
interface MeSpeak {
  loadConfig(config: unknown): void
  loadVoice(voice: unknown): void
  speak(text: string, options: Record<string, unknown>): ArrayLike<number> | null
}
let robot: Promise<MeSpeak> | null = null
function loadRobot(): Promise<MeSpeak> {
  robot ??= (async () => {
    const base = '/vendor/mespeak/'
    const [config, voice] = await Promise.all([
      fetch(base + 'mespeak_config.json').then(r => r.json()),
      fetch(base + 'en-rp.json').then(r => r.json()),
      new Promise<void>((resolve, reject) => {
        if ((window as unknown as { meSpeak?: MeSpeak }).meSpeak) { resolve(); return }
        const el = document.createElement('script')
        el.src = base + 'mespeak.min.js'
        el.onload = () => resolve()
        el.onerror = () => reject(new Error("The newsreel's voice didn't load"))
        document.head.appendChild(el)
      }),
    ])
    const m = (window as unknown as { meSpeak: MeSpeak }).meSpeak
    m.loadConfig(config)
    m.loadVoice(voice)
    return m
  })()
  robot.catch(() => { robot = null })
  return robot
}

/** The Fire TV's browser (Silk): no voice of its own */
const FIRE_TV = typeof navigator !== 'undefined' && /\bSilk\b|\bAFT[A-Z]/.test(navigator.userAgent)

/**
 * The narrator: the device's own voice, deep and a touch quick, the way
 * newsreels sounded; or, where the device's voice won't talk (there's none,
 * or it never starts), the robot announcer through the film's sound.
 */
export interface Narrator {
  /** says it, resolving when it's said, or false if it couldn't be heard */
  say(text: string): Promise<boolean>
  /** inside a tap: lets phones that need one speak later on their own */
  prime(): void
  stop(): void
}

export function createNarrator(sound: FilmSound): Narrator {
  const synth = typeof window !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined' ? window.speechSynthesis : undefined
  // The device's voice until it shows it won't talk; the robot from then on
  let device = !!synth && !FIRE_TV
  if (!device) void loadRobot().catch(() => {})
  const pick = () => {
    const voices = synth?.getVoices().filter(v => /^en/i.test(v.lang)) ?? []
    return voices.find(v => /daniel|david|alex|fred|george|guy|aaron|arthur|james|male/i.test(v.name) && !/female/i.test(v.name))
      ?? voices.find(v => /en-(US|GB)/i.test(v.lang))
      ?? voices[0]
      ?? null
  }
  // 'said'; 'blocked' (no tap yet, so nothing can talk); or 'mute' (it never started: no voice here)
  const sayDevice = (text: string) => new Promise<'said' | 'blocked' | 'mute'>(resolve => {
    let done = false, started = false
    const finish = (r: 'said' | 'blocked' | 'mute') => {
      if (done) return
      done = true
      clearTimeout(watch)
      clearTimeout(guard)
      resolve(r)
    }
    const u = new SpeechSynthesisUtterance(text)
    const v = pick()
    if (v) u.voice = v
    u.rate = 1.05
    u.pitch = 0.8
    u.onstart = () => { started = true }
    u.onend = () => finish(started ? 'said' : 'mute')
    u.onerror = e => finish(e.error === 'not-allowed' ? 'blocked' : started ? 'said' : 'mute')
    // A voice that hasn't started in a couple of seconds isn't going to
    const watch = setTimeout(() => {
      if (started) return
      try { synth?.cancel() } catch { /* fine */ }
      finish('mute')
    }, 3000)
    // Some devices never say they've finished: move on after a generous wait
    const guard = setTimeout(() => finish('said'), 2500 + text.length * 110)
    try { synth?.speak(u) } catch { finish('mute') }
  })
  const sayRobot = async (text: string) => {
    try {
      const m = await loadRobot()
      const wav = m.speak(text, { rawdata: 'array', pitch: 38, speed: 158, wordgap: 1, amplitude: 120 })
      return wav ? await sound.voice(wav) : false
    } catch {
      return false
    }
  }
  return {
    async say(text) {
      if (device) {
        const r = await sayDevice(text)
        if (r === 'said') return true
        if (r === 'blocked') return false
        device = false
      }
      return sayRobot(text)
    },
    prime() {
      if (!synth || !device) return
      try {
        const u = new SpeechSynthesisUtterance(' ')
        u.volume = 0
        synth.speak(u)
      } catch { /* fine */ }
    },
    stop() { try { synth?.cancel() } catch { /* fine */ } },
  }
}
