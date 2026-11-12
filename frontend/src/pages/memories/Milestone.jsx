import { useState } from 'react'

export const MILESTONES = [
  'Primeros pasos', 'Primera palabra', 'Primer diente', 'Primer día de cole', 'Cumpleaños',
  'Aniversario', 'Graduación', 'Viaje', 'Mudanza',
]
export const MILESTONE_MAX = 40

/** Insignia "⭐ Primeros pasos". */
export function MilestoneBadge({ milestone, className = '' }) {
  if (!milestone) return null
  return <span className={`milestone-badge ${className}`}><span aria-hidden="true">⭐</span> {milestone}</span>
}

/** "¿Es un momento especial?": chips de hitos y "Otro…" con texto libre. Tocar el elegido lo quita. */
export function MilestonePicker({ value, onChange }) {
  const [other, setOther] = useState(Boolean(value) && !MILESTONES.includes(value))

  function choose(m) {
    setOther(false)
    onChange(value === m ? '' : m)
  }

  function toggleOther() {
    setOther((o) => !o)
    onChange('')
  }

  return (
    <div className="field">
      <label id="ms-label">¿Es un momento especial? <small className="muted">(opcional)</small></label>
      <div className="chips" role="radiogroup" aria-labelledby="ms-label">
        {MILESTONES.map((m) => (
          <button type="button" key={m} role="radio" aria-checked={!other && value === m}
            className={`chip chip-coral ${!other && value === m ? 'active' : ''}`} onClick={() => choose(m)}>{m}</button>
        ))}
        <button type="button" role="radio" aria-checked={other}
          className={`chip chip-coral ${other ? 'active' : ''}`} onClick={toggleOther}>Otro…</button>
      </div>
      {other && (
        <>
          <input id="ms-other" aria-label="Momento especial" value={value} maxLength={MILESTONE_MAX} autoFocus
            onChange={(e) => onChange(e.target.value.slice(0, MILESTONE_MAX))} placeholder="Primera vez en bici" />
          <small className="hint">{value.length}/{MILESTONE_MAX}</small>
        </>
      )}
    </div>
  )
}
