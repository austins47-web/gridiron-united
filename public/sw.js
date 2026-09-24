// Gridiron United service worker — push notifications only.
//
// Deliberately no caching/offline handling: it only shows
// notifications sent by the send-reminders / push-test edge
// functions and opens the right page when one is tapped, so it can
// never serve a stale copy of the app.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Payload: { title, body, url, tag } as JSON (see _shared/webPush.ts)
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }

  const title = data.title || 'Gridiron United'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    // Same tag replaces the earlier notification (e.g. the 2h pick
    // nudge replaces the 24h one) instead of stacking up
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/app/home' },
  }))
})

// Tap: focus an open app window and send it to the page, or open one
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/app/home', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of windows) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus()
        return w.navigate(url)
      }
    }
    return self.clients.openWindow(url)
  })())
})
