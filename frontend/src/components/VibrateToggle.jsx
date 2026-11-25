import { useId, useState } from 'react'
import { buzz, setVibrateEnabled, vibrateEnabled } from '../vibration'
import Icon from './Icon'

/** Ajustes → "Vibrar con las notificaciones" (en este móvil; activado por defecto). */
export default function VibrateToggle() {
  const [on, setOn] = useState(vibrateEnabled)
  const labelId = useId()
  const helpId = useId()

  async function toggle() {
    const next = !on
    setOn(next)
    await setVibrateEnabled(next)
    if (next) buzz([120])   // una vibración corta para notar que está activado (si el móvil lo admite)
  }

  return (
    <div className="vibrate-card">
      <span className="hl-icon"><Icon name="bell" size={20} /></span>
      <span className="push-text">
        <strong id={labelId}>Vibrar con las notificaciones</strong>
        <small id={helpId}>
          En iPhone, la vibración depende de Ajustes → Notificaciones → Rehomi → Sonidos. Añade Rehomi a la pantalla de inicio para recibir avisos.
        </small>
      </span>
      <button type="button" role="switch" aria-checked={on} aria-labelledby={labelId} aria-describedby={helpId}
        className={`switch ${on ? 'on' : ''}`} onClick={toggle}>
        <span className="switch-knob" aria-hidden="true" />
      </button>
    </div>
  )
}
