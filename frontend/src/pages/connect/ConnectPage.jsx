import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import Icon from '../../components/Icon'
import { AppShell, Avatar, ErrorBox, Field, RELATIONS, TopBar } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../hooks'

/** Buscar a alguien por su @usuario o correo y enviarle una solicitud de conexión. */
export default function ConnectPage() {
  const { user } = useAuth()
  const { data: people } = useApi('/api/people')
  const { data: requests, setData: setRequests } = useApi('/api/connect/requests')
  const [q, setQ] = useState('')
  const [found, setFound] = useState(null)
  const [relation, setRelation] = useState('')
  const [personId, setPersonId] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const unlinked = (people || []).filter((p) => !p.is_linked)

  async function search(e) {
    e.preventDefault()
    setError(''); setFound(null); setSent(null)
    const term = q.trim()
    if (term.length < 3) return setError('Escribe su @usuario o su correo completo.')
    setBusy(true)
    try {
      const u = await api(`/api/connect/lookup?q=${encodeURIComponent(term)}`)
      setFound(u)
      // Si ya la tienes guardada con un nombre parecido, la proponemos
      const first = u.full_name.split(' ')[0].toLowerCase()
      const match = unlinked.find((p) => p.name.toLowerCase().startsWith(first))
      setPersonId(match ? String(match.id) : '')
      if (match) setRelation(match.relation)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function send() {
    if (!relation) return setError(`Elige quién es ${found.full_name.split(' ')[0]} para ti.`)
    setBusy(true); setError('')
    try {
      const req = await api('/api/connect/requests', {
        method: 'POST',
        body: { to_user_id: found.id, relation, person_id: personId ? Number(personId) : null },
      })
      setSent(req)
      setFound(null); setQ(''); setRelation('')
      setRequests((r) => r && { ...r, outgoing: [req, ...r.outgoing] })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function cancel(id) {
    try {
      await api(`/api/connect/requests/${id}`, { method: 'DELETE' })
      setRequests((r) => ({ ...r, outgoing: r.outgoing.filter((x) => x.id !== id) }))
    } catch (err) {
      setError(err.message)
    }
  }

  async function copyMine() {
    try {
      await navigator.clipboard.writeText(`@${user.username}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* sin portapapeles */ }
  }

  return (
    <AppShell>
      <TopBar title="Conectar" />

      <section className="card my-handle">
        {user.username ? (
          <>
            <span className="row-text">
              <small className="muted">Tu @usuario · compártelo para que te encuentren</small>
              <strong className="handle">@{user.username}</strong>
            </span>
            <button className="btn btn-ghost small" onClick={copyMine}>
              <Icon name={copied ? 'check' : 'link'} size={16} /> {copied ? 'Copiado' : 'Copiar'}
            </button>
          </>
        ) : (
          <Link to="/perfil" className="row-text">
            <strong>Elige tu @usuario</strong>
            <small className="muted">Para que tus personas puedan encontrarte. Toca aquí.</small>
          </Link>
        )}
      </section>

      <form onSubmit={search} className="stack">
        <Field label="Busca a alguien por su @usuario o su correo" htmlFor="q">
          <div className="search-row">
            <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="@felixflores o correo@ejemplo.com"
              autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            <button className="btn btn-primary" disabled={busy}>Buscar</button>
          </div>
        </Field>
        <small className="hint">Solo encontrarás a alguien si escribes su @usuario o su correo exacto: así nadie puede curiosear quién está en Remember.</small>
      </form>

      <ErrorBox error={error} />

      {sent && (
        <div className="alert alert-ok">
          Solicitud enviada a {sent.to_user.full_name}. Cuando la acepte, os conectaréis y verás lo que haya guardado para ti.
        </div>
      )}

      {found && (
        <section className="card stack">
          <div className="result">
            <Avatar name={found.full_name} src={found.avatar_url} size={56} />
            <span className="row-text">
              <strong>{found.full_name}</strong>
              {found.username && <small className="muted">@{found.username}</small>}
            </span>
          </div>

          <Field label={`¿Quién es ${found.full_name.split(' ')[0]} para ti?`} htmlFor="rel">
            <div className="chips" id="rel" role="radiogroup">
              {Object.entries(RELATIONS).map(([value, label]) => (
                <button type="button" key={value} role="radio" aria-checked={relation === value}
                  className={`chip ${relation === value ? 'active' : ''}`} onClick={() => setRelation(value)}>{label}</button>
              ))}
            </div>
          </Field>

          {unlinked.length > 0 && (
            <Field label="¿Ya la tienes en tu lista de personas?" htmlFor="pp"
              hint="Si es así, lo que hayas guardado con ella también se compartirá cuando acepte.">
              <select id="pp" value={personId} onChange={(e) => setPersonId(e.target.value)}>
                <option value="">No, añádela como nueva</option>
                {unlinked.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {RELATIONS[p.relation]} · {p.memory_count} recuerdos</option>
                ))}
              </select>
            </Field>
          )}

          <button type="button" className="btn btn-primary" onClick={send} disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </section>
      )}

      {requests?.outgoing.length > 0 && (
        <>
          <h2 className="small-title">Esperando respuesta</h2>
          <div className="card list">
            {requests.outgoing.map((r) => (
              <div key={r.id} className="member-row">
                <Avatar name={r.to_user.full_name} src={r.to_user.avatar_url} size={40} />
                <span className="row-text">
                  <strong>{r.to_user.full_name}</strong>
                  <small>{RELATIONS[r.relation]} · pendiente</small>
                </span>
                <button className="btn-text danger" onClick={() => cancel(r.id)}>Cancelar</button>
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  )
}
