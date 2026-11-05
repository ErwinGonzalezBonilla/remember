// Avisos en el móvil (Web Push). En iPhone solo funcionan con la app añadida a la pantalla de inicio (iOS 16.4+).
import { api, tokenStore } from './api/client'

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

export function pushSupport() {
  if (!('serviceWorker' in navigator)) return 'unsupported'
  if (isIOS() && !isStandalone()) return 'ios-install'          // primero hay que añadirla a la pantalla de inicio
  if (!('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  return 'ok'
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
  }
}

function toKey(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) || navigator.serviceWorker.register('/sw.js')
}

/** 'on' | 'off' | 'denied' | 'unsupported' | 'ios-install' */
export async function pushStatus() {
  const support = pushSupport()
  if (support !== 'ok') return support
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = reg && await reg.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

async function subscribeAndSave() {
  const reg = await registration()
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const { public_key } = await api('/api/push/key')
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(public_key) })
  }
  await api('/api/push/subscribe', { method: 'POST', body: sub.toJSON() })
}

/** Pide permiso (tiene que ser al tocar un botón) y guarda este móvil. */
export async function enablePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  await subscribeAndSave()
  return 'on'
}

/** Si ya dio permiso antes, vuelve a enlazar este móvil con la cuenta que ha entrado (sin preguntar). */
export async function syncPush() {
  try {
    if (pushSupport() === 'ok' && Notification.permission === 'granted') await subscribeAndSave()
  } catch { /* sin conexión o navegador sin push: no pasa nada */ }
}

/** Al cerrar sesión: este móvil deja de recibir avisos de esa cuenta. */
export async function forgetDevice() {
  const token = tokenStore.get()
  try {
    const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration()
    const sub = reg && await reg.pushManager.getSubscription()
    if (!sub) return
    if (token) {
      await fetch(`${BASE}/api/push/unsubscribe`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {})
    }
    await sub.unsubscribe()
  } catch { /* nada */ }
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = reg && await reg.pushManager.getSubscription()
  if (sub) {
    await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {})
    await sub.unsubscribe()
  }
  return 'off'
}
