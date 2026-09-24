import { supabase } from '@/lib/supabase'

// ══════════════════════════════════════════════════════════════
// Phone / browser push notifications — the device side
//
// The browser gives us a subscription (an address at its push
// service + keys); we store it in push_subscriptions, and the
// send-reminders / push-test edge functions push to it. public/sw.js
// shows the notification and opens the right page on tap.
// ══════════════════════════════════════════════════════════════

/**
 * Our VAPID public key. Public by design — it's what the browser uses
 * to check pushes really come from our server. The matching private
 * key lives only in the Supabase secret VAPID_PRIVATE_KEY.
 */
export const VAPID_PUBLIC_KEY =
  'BApKeaiE2k7HOBmvkoU8JgyUXMbEPYFH5kCbai7DJPydq8vK5yG0dHe-iVgKuND7KcJ2vIM-qSKuYCGEJPpdkek'

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** iPhone/iPad (including iPadOS, which reports itself as a Mac). */
export const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Opened from the home screen rather than a browser tab. */
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true

/** Registers the service worker once (called at startup). */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch(() => { /* push just won't be available */ })
  // A notification can put a count on the home-screen icon (open picks,
  // see sw.js) — opening the app clears it
  const clearBadge = () => {
    if (document.visibilityState !== 'visible') return
    const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> }
    nav.clearAppBadge?.().catch(() => {})
  }
  clearBadge()
  document.addEventListener('visibilitychange', clearBadge)
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js')
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration('/')
  return reg ? reg.pushManager.getSubscription() : null
}

function keyBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4)
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

const sameKey = (a: ArrayBuffer | null, b: Uint8Array) =>
  !!a && a.byteLength === b.length && new Uint8Array(a).every((v, i) => v === b[i])

/** Saves (or re-saves) this device's subscription for the signed-in user. */
export async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_user_agent: navigator.userAgent.slice(0, 300),
  })
  if (error) throw error
}

/**
 * Turns notifications on for this device. Must run from a tap —
 * browsers only show the permission prompt in response to one.
 * Returns the resulting permission.
 */
export async function enablePush(): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission

  const reg = await registration()
  await navigator.serviceWorker.ready
  const key = keyBytes(VAPID_PUBLIC_KEY)
  let sub = await reg.pushManager.getSubscription()
  // A subscription made with an old key can't receive our pushes
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource })
  await saveSubscription(sub)
  return permission
}

/** Turns notifications off for this device (and forgets it server-side). */
export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/** Sends a test notification to every device of the signed-in user. */
export async function sendTestPush(): Promise<{ sent: number; failed: number; devices: number }> {
  const { data, error } = await supabase.functions.invoke('push-test', { method: 'POST' })
  if (error) throw error
  return data
}
