import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api/client'
import Icon from '../../components/Icon'
import { AppShell, Avatar, ErrorBox, Field, RELATIONS, Spinner, TopBar } from '../../components/ui'
import { useApi } from '../../hooks'

/** Revisar una solicitud: quién es para mí, con qué persona de mi lista la vinculo, y aceptar. */
export default function RequestReview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: req, loading, error } = useApi(`/api/connect/requests/${id}`)
  const { data: people } = useApi('/api/people')
  const [relation, setRelation] = useState('')
  const [personId, setPersonId] = useState('new')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const unlinked = (people || []).filter((p) => !p.is_linked)

  // Propón la persona de tu lista cuyo nombre coincide (p. ej. "Allison")
  useEffect(() => {
    if (!req || !people) return
    const first = req.from_user.full_name.split(' ')[0].toLowerCase()
    const match = people.find((p) => !p.is_linked && p.name.toLowerCase().startsWith(first))
    if (match) {
      setPersonId(String(match.id))
      setRelation(match.relation)
    }
  }, [req, people])

  if (loading) return <AppShell nav={false}><Spinner /></AppShell>
  if (error) return <AppShell nav={false}><TopBar title="Solicitud" /><ErrorBox error={error} /></AppShell>

  const sender = req.from_user
  const first = sender.full_name.split(' ')[0]
  const chosen = unlinked.find((p) => String(p.id) === personId)
  const answered = req.status !== 'pending'

  async function accept() {
    if (!relation) return setErr(`Elige quién es ${first} para ti.`)
    setBusy(true); setErr('')
    try {
      const res = await api(`/api/connect/requests/${id}/accept`, {
        method: 'POST',
        body: { relation, person_id: personId === 'new' ? null : Number(personId) },
      })
      navigate(`/personas/${res.person_id}`, { replace: true, state: { connected: first, shared: res.shared_count } })
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  async function reject() {
    setBusy(true)
    try {
      await api(`/api/connect/requests/${id}/reject`, { method: 'POST' })
      navigate('/personas', { replace: true })
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <AppShell nav={false}>
      <TopBar title="Solicitud" />
      <div className="notif">
        <Avatar name={sender.full_name} src={sender.avatar_url} size={56} />
        <span className="row-text">
          <strong>{sender.full_name}</strong>
          {sender.username && <small className="muted">@{sender.username}</small>}
          <span>Quiere conectar contigo · dice que eres su <b>{(RELATIONS[req.relation] || req.relation).toLowerCase()}</b></span>
        </span>
      </div>

      {answered ? (
        <div className="alert alert-ok">Esta solicitud ya está {req.status === 'accepted' ? 'aceptada' : 'rechazada'}.</div>
      ) : (
        <>
          <ErrorBox error={err} />
          <section className="card stack">
            <Field label={`¿Quién es ${first} para ti?`} htmlFor="rel">
              <div className="chips" id="rel" role="radiogroup">
                {Object.entries(RELATIONS).map(([value, label]) => (
                  <button type="button" key={value} role="radio" aria-checked={relation === value}
                    className={`chip ${relation === value ? 'active' : ''}`} onClick={() => setRelation(value)}>{label}</button>
                ))}
              </div>
            </Field>

            <div className="field">
              <label>¿Es alguien que ya tienes guardado?</label>
              <div className="people-picker">
                {unlinked.map((p) => (
                  <button type="button" key={p.id} className={`tagchip ${personId === String(p.id) ? 'on' : ''}`}
                    aria-pressed={personId === String(p.id)} onClick={() => { setPersonId(String(p.id)); if (!relation) setRelation(p.relation) }}>
                    <Avatar name={p.name} src={p.photo_url} size={34} />
                    <span>{p.name} <small>· {RELATIONS[p.relation]} · {p.memory_count} recuerdos</small></span>
                    <span className="tag-check">{personId === String(p.id) && <Icon name="check" size={18} />}</span>
                  </button>
                ))}
                <button type="button" className={`tagchip add ${personId === 'new' ? 'on' : ''}`} aria-pressed={personId === 'new'}
                  onClick={() => setPersonId('new')}>
                  <span className="add-circle small"><Icon name="plus" size={16} /></span>
                  <span>No, es alguien nuevo en mi lista</span>
                  <span className="tag-check">{personId === 'new' && <Icon name="check" size={18} />}</span>
                </button>
              </div>
            </div>
          </section>

          <div className="confirm">
            <span className="confirm-icon">🔓</span>
            <span>
              {chosen && chosen.memory_count > 0
                ? <>Al aceptar, {first} podrá ver <b>los {chosen.memory_count} recuerdos</b> que has guardado con {chosen.name}. Lo demás sigue siendo solo tuyo.</>
                : <>Al aceptar, podréis compartir los recuerdos en los que os etiquetéis. Lo demás sigue siendo solo tuyo.</>}
            </span>
          </div>

          <div className="row-actions">
            <button className="btn btn-ghost" onClick={reject} disabled={busy}>Rechazar</button>
            <button className="btn btn-primary" onClick={accept} disabled={busy}>{busy ? 'Conectando…' : 'Aceptar'}</button>
          </div>
        </>
      )}
    </AppShell>
  )
}
