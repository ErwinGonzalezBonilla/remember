import { useState } from 'react'
import { api } from '../api/client'
import Icon from './Icon'
import { Avatar, RELATIONS } from './ui'

/**
 * "¿Con quién es este recuerdo?": elige personas de tu lista o crea una nueva sin salir de la pantalla.
 * La persona nueva no necesita cuenta: basta con nombre y relación.
 */
export default function PeoplePicker({ people, setPeople, selected, onChange }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', relation: 'familia' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  async function create() {
    if (!draft.name.trim()) return setError('Escribe su nombre.')
    setBusy(true); setError('')
    try {
      const person = await api('/api/people', { method: 'POST', body: draft })
      setPeople([...people, person])
      onChange([...selected, person.id])
      setDraft({ name: '', relation: 'familia' })
      setAdding(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="people-picker">
      {people.map((p) => {
        const on = selected.includes(p.id)
        return (
          <button type="button" key={p.id} className={`tagchip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(p.id)}>
            <Avatar name={p.name} src={p.photo_url} size={34} />
            <span>{p.name} <small>· {RELATIONS[p.relation] || p.relation}</small></span>
            <span className="tag-check">{on && <Icon name="check" size={18} />}</span>
          </button>
        )
      })}

      {adding ? (
        <div className="new-person card">
          <input autoFocus value={draft.name} maxLength={120} placeholder="Nombre o apodo (p. ej. Allison)"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); create() } }} />
          <div className="chips">
            {Object.entries(RELATIONS).map(([value, label]) => (
              <button type="button" key={value} className={`chip small ${draft.relation === value ? 'active' : ''}`}
                onClick={() => setDraft({ ...draft, relation: value })}>{label}</button>
            ))}
          </div>
          {error && <small className="error-text">{error}</small>}
          <div className="row-actions">
            <button type="button" className="btn btn-ghost" onClick={() => { setAdding(false); setError('') }}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={create} disabled={busy}>
              {busy ? 'Añadiendo…' : 'Añadir y etiquetar'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="tagchip add" onClick={() => setAdding(true)}>
          <span className="add-circle small"><Icon name="plus" size={16} /></span>
          <span>Nueva persona</span>
        </button>
      )}
    </div>
  )
}
