// Lightweight sound design — synthesized via Web Audio, no audio
// files to fetch/host. Kept to a handful of short, distinct tones
// for moments that already feel significant (a pick locking in, a
// week's winner being revealed), not general UI chrome — a chime on
// every click stops feeling premium fast.
//
// Respects a per-device mute preference (localStorage), defaulting
// to on. Fails silently wherever Web Audio isn't available (older
// browsers, some embedded webviews) — sound is a nice-to-have, never
// something a feature should depend on.

const MUTE_KEY = 'gu_sound_muted'

export function isSoundMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false }
}

export function setSoundMuted(muted: boolean) {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0') } catch { /* ignore */ }
}

let sharedCtx: AudioContext | null = null
function getCtx(): AudioContext | null {
  if (isSoundMuted()) return null
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext
    if (!Ctx) return null
    if (!sharedCtx) sharedCtx = new Ctx()
    if (sharedCtx.state === 'suspended') sharedCtx.resume()
    return sharedCtx
  } catch {
    return null
  }
}

/** One tone with a quick attack and exponential decay — the basic building block below. */
function tone(ctx: AudioContext, freq: number, startAt: number, durationSec: number, gain = 0.08, type: OscillatorType = 'sine') {
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  amp.gain.setValueAtTime(0, startAt)
  amp.gain.linearRampToValueAtTime(gain, startAt + 0.015)
  amp.gain.exponentialRampToValueAtTime(0.001, startAt + durationSec)
  osc.connect(amp)
  amp.connect(ctx.destination)
  osc.start(startAt)
  osc.stop(startAt + durationSec + 0.05)
}

/** Short two-note upward chime — a pick locking in, a save confirming. */
export function playPickLock() {
  const ctx = getCtx()
  if (!ctx) return
  const t = ctx.currentTime
  tone(ctx, 660, t, 0.12, 0.07)
  tone(ctx, 880, t + 0.09, 0.16, 0.08)
}

/** Bright three-note rising flourish — a week's winner being revealed, a trade completing. */
export function playWinReveal() {
  const ctx = getCtx()
  if (!ctx) return
  const t = ctx.currentTime
  tone(ctx, 523.25, t, 0.14, 0.06)        // C5
  tone(ctx, 659.25, t + 0.11, 0.14, 0.07) // E5
  tone(ctx, 783.99, t + 0.22, 0.28, 0.09) // G5
}

/** A single soft, low tone — a passive notification arriving. */
export function playNotify() {
  const ctx = getCtx()
  if (!ctx) return
  tone(ctx, 440, ctx.currentTime, 0.18, 0.05, 'triangle')
}
