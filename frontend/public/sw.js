/* Rehomi · service worker: muestra los avisos en el móvil y abre la app al tocarlos. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

const VIBRATE = [200, 100, 200]
const PREFS_CACHE = 'rehomi-prefs'
const PREFS_URL = '/__rehomi/prefs.json'

/** Preferencias que guarda la app (Ajustes → "Vibrar con las notificaciones"). Por defecto, vibrar. */
async function prefs() {
  try {
    const res = await caches.open(PREFS_CACHE).then((c) => c.match(PREFS_URL))
    return res ? { vibrate: true, ...(await res.json()) } : { vibrate: true }
  } catch {
    return { vibrate: true }
  }
}

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }
  const title = data.title || 'Rehomi'
  event.waitUntil((async () => {
    const { vibrate } = await prefs()
    await self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/favicon.png',
      // Un tag por conversación o tipo, y renotify: cada aviso nuevo vuelve a sonar y vibrar
      // aunque sustituya al anterior (renotify exige tag).
      tag: data.tag || `rehomi-${data.url || 'aviso'}`,
      renotify: true,
      silent: false,
      ...(vibrate ? { vibrate: VIBRATE } : {}),   // Android; en iPhone la vibración la decide iOS
      data: { url: data.url || '/' },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = all.find((c) => c.url.startsWith(self.location.origin))
    if (open) { await open.focus(); return open.navigate(url) }
    return self.clients.openWindow(url)
  })())
})
