import { useEffect, useState } from 'react'
import { disablePush, enablePush, pushStatus } from '../push'
import Icon from './Icon'

const TEXT = {
  on: ['Avisos activados en este móvil', 'Te llegará un aviso cuando guarden un recuerdo contigo, comenten o te escriban.'],
  off: ['Recibe avisos en este móvil', 'Fotos, videos, cartas y comentarios de tus personas, al momento.'],
  denied: ['Los avisos están bloqueados', 'Actívalos en los ajustes del navegador o del móvil para Rehomi, y vuelve aquí.'],
  'ios-install': ['Avisos en el iPhone', 'Primero añade Rehomi a tu pantalla de inicio: en Safari toca Compartir → "Añadir a pantalla de inicio" y ábrela desde el icono.'],
  unsupported: ['Este navegador no admite avisos', 'Prueba con Chrome en Android o con la app añadida a la pantalla de inicio en el iPhone.'],
}

/** Tarjeta para activar o desactivar los avisos en el móvil. `compact` la oculta si ya están activados. */
export default function PushToggle({ compact = false }) {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { pushStatus().then(setStatus).catch(() => setStatus('unsupported')) }, [])
  if (!status || (compact && status !== 'off')) return null

  async function toggle() {
    setBusy(true); setError('')
    try { setStatus(status === 'on' ? await disablePush() : await enablePush()) }
    catch { setError('No se pudieron activar los avisos. Inténtalo de nuevo.') }
    finally { setBusy(false) }
  }

  const [title, text] = TEXT[status]
  return (
    <div className={`push-card ${status}`}>
      <span className="hl-icon"><Icon name="bell" size={20} /></span>
      <span className="push-text"><strong>{title}</strong><small>{text}</small>{error && <small className="danger">{error}</small>}</span>
      {(status === 'off' || status === 'on') && (
        <button type="button" className={`btn btn-sm ${status === 'on' ? 'btn-ghost' : 'btn-primary'}`} onClick={toggle} disabled={busy}>
          {busy ? '…' : status === 'on' ? 'Desactivar' : 'Activar'}
        </button>
      )}
    </div>
  )
}
