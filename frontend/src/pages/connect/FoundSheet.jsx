import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import Icon from '../../components/Icon'
import { relationText, Avatar, ErrorBox, RELATIONS } from '../../components/ui'

const MAX_MESSAGE = 120

/** Hoja "Perfil encontrado": quién es para mí, mensaje opcional y enviar la solicitud.
 *  No muestra si está activa ni su bio: la bio solo la ven las personas ya conectadas. */
export default function FoundSheet({ found, unlinked, requests, onClose, onSent }) {
  const first = found.full_name.split(' ')[0]
  const [relation, setRelation] = useState('')
  const [personId, setPersonId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const outgoing = requests?.outgoing.find((r) => r.to_user.id === found.id)
  const incoming = requests?.incoming.find((r) => r.from_user.id === found.id)

  // Si ya la tienes guardada con un nombre parecido, la proponemos
  useEffect(() => {
    const match = unlinked.find((p) => p.name.toLowerCase().startsWith(first.toLowerCase()))
    setPersonId(match ? String(match.id) : '')
    setRelation(match ? match.relation : '')
  }, [found.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape cierra; la página de detrás no se desplaza mientras está abierta
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  async function send() {
    if (!relation) return setError(`Elige quién es ${first} para ti.`)
    setBusy(true); setError('')
    try {
      const req = await api('/api/connect/requests', {
        method: 'POST',
        body: {
          to_user_id: found.id, relation, person_id: personId ? Number(personId) : null,
          message: message.trim() || null,
        },
      })
      onSent(req)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="found-sheet" role="dialog" aria-modal="true" aria-labelledby="found-name" onClick={(e) => e.stopPropagation()}>
        <span className="sheet-handle" />
        <div className="found-head">
          <span className="found-badge"><Icon name="check" size={14} /> Perfil encontrado</span>
          <button type="button" className="icon-btn found-close" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={20} /></button>
        </div>

        <div className="found-profile">
          <div className="found-photo">
            <Avatar name={found.full_name} src={found.avatar_url} size={104} />
            <span className="found-check"><Icon name="check" size={14} /></span>
          </div>
          <h2 id="found-name">{found.full_name}</h2>
          {found.username && <span className="found-handle">@{found.username}</span>}
        </div>

        {outgoing ? (
          <div className="alert alert-ok">Ya le enviaste una solicitud a {first}. Te avisaremos cuando la acepte.</div>
        ) : incoming ? (
          <>
            <div className="alert alert-ok">{first} ya te envió una solicitud de conexión.</div>
            <Link to={`/conectar/solicitud/${incoming.id}`} className="btn btn-coral btn-big">Ver su solicitud</Link>
          </>
        ) : (
          <>
            <div className="field">
              <label id="rel-label">¿Quién es {first} para ti?</label>
              <div className="chips" role="radiogroup" aria-labelledby="rel-label">
                {Object.entries(RELATIONS).map(([value, label]) => (
                  <button type="button" key={value} role="radio" aria-checked={relation === value}
                    className={`chip chip-coral ${relation === value ? 'active' : ''}`} onClick={() => { setRelation(value); setError('') }}>
                    {relation === value && <Icon name="check" size={14} />}{label}
                  </button>
                ))}
              </div>
            </div>

            {unlinked.length > 0 && (
              <div className="field">
                <label htmlFor="pp">¿Ya la tienes guardada?</label>
                <select id="pp" value={personId} onChange={(e) => setPersonId(e.target.value)}>
                  <option value="">No, añádela como nueva</option>
                  {unlinked.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {relationText(p)} · {p.memory_count} recuerdos</option>
                  ))}
                </select>
                <small className="hint">Si es así, lo que hayas guardado con ella también se compartirá cuando acepte.</small>
              </div>
            )}

            <div className="field">
              <label htmlFor="msg" className="msg-label">
                <span>Mensaje personalizado <small className="muted">(opcional)</small></span>
                <small className="muted">{message.length}/{MAX_MESSAGE}</small>
              </label>
              <textarea id="msg" value={message} maxLength={MAX_MESSAGE} rows={2}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
                placeholder="Escribe una dedicatoria o nota especial…" />
            </div>

            <div className="secure-note">
              <span className="secure-icon"><Icon name="lock" size={18} /></span>
              <span>
                <strong>Conexión privada y segura</strong>
                <small>Se enviará una invitación privada. Ambos deben aceptar para empezar a compartir.</small>
              </span>
            </div>

            <ErrorBox error={error} />

            <button type="button" className="btn btn-coral btn-big" onClick={send} disabled={busy}>
              <Icon name="users" size={20} /> {busy ? 'Enviando…' : 'Enviar solicitud de conexión'}
            </button>
          </>
        )}

        <button type="button" className="btn-text found-again" onClick={onClose}>Buscar a otra persona</button>
      </div>
    </div>
  )
}
