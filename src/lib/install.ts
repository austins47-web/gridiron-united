import { isIos, isStandalone } from '@/lib/push'

// ══════════════════════════════════════════════════════════════
// "Add to home screen" — the device side
//
// Chrome/Edge/Samsung Internet on Android (and Chrome/Edge on a
// computer) offer a one-tap install through `beforeinstallprompt`,
// which fires once, early, and has to be caught then — so this module
// is imported at startup (main.tsx) and holds on to it. iPhone has no
// install API: InstallGuide walks through Safari's Share menu instead.
// ══════════════════════════════════════════════════════════════

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
let installedThisVisit = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Hold it for our own button instead of the browser's mini-bar
    e.preventDefault()
    deferred = e as InstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installedThisVisit = true
    emit()
  })
}

export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The browser can install it with one tap right now. */
export const canPromptInstall = () => deferred !== null

/** Shows the browser's install dialog; true if they installed. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred
  if (!e) return false
  deferred = null
  emit()
  await e.prompt()
  const { outcome } = await e.userChoice
  return outcome === 'accepted'
}

/**
 * Which set of instructions fits this device:
 *   installed        already running from the home screen (or just installed)
 *   prompt           one-tap install available
 *   ios-safari       iPhone/iPad Safari — Share → Add to Home Screen
 *   ios-other        Chrome/Firefox/Edge on iPhone — their Share menu
 *   in-app           Instagram/Facebook/etc. browser, or any Android app's
 *                    built-in web view — open in Safari/Chrome first
 *   android-manual   Android browser without the one-tap install. Could
 *                    be Chrome's preview window from a link in Messages,
 *                    Gmail or Discord: its UA is Chrome's, but its menu
 *                    has no install option, so the guide covers that too
 *   desktop          a computer
 */
export type InstallPlatform =
  | 'installed' | 'prompt' | 'ios-safari' | 'ios-other' | 'in-app' | 'android-manual' | 'desktop'

export function installPlatform(): InstallPlatform {
  if (typeof window === 'undefined') return 'desktop'
  if (isStandalone() || installedThisVisit) return 'installed'
  const ua = navigator.userAgent
  if (/FBAN|FBAV|Instagram|Line\/|Snapchat|TikTok|musical_ly|Twitter|LinkedInApp/i.test(ua)) return 'in-app'
  // Android WebView (an app showing the page itself) marks its UA "; wv)"
  if (/Android.*; wv\)/.test(ua)) return 'in-app'
  if (deferred) return 'prompt'
  if (isIos()) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari'
  if (isAndroid()) return 'android-manual'
  return 'desktop'
}

export const isAndroid = () =>
  typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

/** A phone or tablet (where the home-screen app matters most). */
export const isMobileDevice = () =>
  typeof navigator !== 'undefined' && (isIos() || isAndroid())

/**
 * A link that opens the app in Chrome itself from an Android app's
 * built-in browser (Facebook, Instagram …), which can't install it.
 */
export const openInChromeUrl = () =>
  `intent://${window.location.host}/app#Intent;scheme=https;package=com.android.chrome;end`
