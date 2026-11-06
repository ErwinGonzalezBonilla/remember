import { useEffect, useState } from 'react'

/* global __APP_VERSION__ */
const CURRENT = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
const EVERY = 10 * 60 * 1000 // cada 10 minutos, además de al volver a la app

async function latestVersion() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()).version || null
  } catch {
    return null
  }
}

export async function updateNow() {
  try {
    const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration()
    if (reg) await reg.update()
  } catch { /* sigue igualmente */ }
  window.location.reload()
}

/** Aviso "Hay una versión nueva de Rehomi": la app comprueba si se ha publicado otra versión. */
export default function UpdateBanner() {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    if (import.meta.env.DEV) return
    let stop = false
    const check = async () => {
      const v = await latestVersion()
      if (!stop && v && v !== CURRENT) setAvailable(true)
    }
    check()
    const id = setInterval(check, EVERY)
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => { stop = true; clearInterval(id); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible) }
  }, [])

  if (!available) return null
  return (
    <div className="update-banner" role="status">
      <span><strong>Hay una versión nueva de Rehomi</strong><small>Toca para ver los últimos cambios</small></span>
      <button type="button" className="btn btn-sm" onClick={updateNow}>Actualizar</button>
    </div>
  )
}
