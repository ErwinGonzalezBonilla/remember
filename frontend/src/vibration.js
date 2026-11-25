// Vibrar con las novedades. Preferencia por móvil ("Vibrar con las notificaciones" en Ajustes), activada por defecto.
// La app la lee de localStorage; el service worker, de Cache Storage (no tiene acceso a localStorage).

const KEY = 'rehomi_vibrate'
const PREFS_CACHE = 'rehomi-prefs'
const PREFS_URL = '/__rehomi/prefs.json'
export const PATTERN = [200, 100, 200]

export function vibrateEnabled() {
  try { return localStorage.getItem(KEY) !== 'off' } catch { return true }
}

/** Copia la preferencia donde la lee el service worker. Nunca falla. */
export async function syncVibratePref() {
  try {
    if (!('caches' in window)) return
    const cache = await caches.open(PREFS_CACHE)
    await cache.put(PREFS_URL, new Response(JSON.stringify({ vibrate: vibrateEnabled() }), { headers: { 'Content-Type': 'application/json' } }))
  } catch { /* modo privado o sin Cache Storage: el service worker vibra por defecto */ }
}

export function setVibrateEnabled(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* modo privado */ }
  return syncVibratePref()
}

/** Vibra con la app abierta si el navegador lo admite (en iPhone navigator.vibrate no existe) y está activado. */
export function buzz(pattern = PATTERN) {
  if (!vibrateEnabled() || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false
  try { return navigator.vibrate(pattern) } catch { return false }
}
