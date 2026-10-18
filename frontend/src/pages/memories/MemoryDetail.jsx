import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, mediaUrl } from '../../api/client'
import Icon from '../../components/Icon'
import PeoplePicker from '../../components/PeoplePicker'
import { AppShell, Avatar, ErrorBox, Field, RELATIONS, Spinner, TopBar, formatDate } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../hooks'

const EMOJIS = [
  { e: '❤️', label: 'Me encanta' }, { e: '😀', label: 'Me alegra' }, { e: '😂', label: 'Me hace reír' },
  { e: '😮', label: 'Me sorprende' }, { e: '😢', label: 'Me emociona' },
]

function Media({ memory }) {
  const url = mediaUrl(memory.media_url)
  if (memory.kind === 'photo') return <img src={url} alt={memory.title} className="detail-media" />
  if (memory.kind === 'video') return <video src={url} controls playsInline className="detail-media" />
  if (memory.kind === 'audio') {
    return (
      <div className="detail-audio card">
        <span className="hl-icon"><Icon name="mic" size={22} /></span>
        <audio src={url} controls />
      </div>
    )
  }
  return null
}

export default function MemoryDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: m, setData, loading, error } = useApi(`/api/memories/${id}`)
  const [comment, setComment] = useState('')
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')
  const { data: people, setData: setPeople } = useApi(editing ? '/api/people' : null)

  if (loading) return <AppShell nav={false}><Spinner /></AppShell>
  if (error) return <AppShell nav={false}><TopBar title="Recuerdo" /><ErrorBox error={error} /></AppShell>

  const run = async (fn) => { setErr(''); try { await fn() } catch (e) { setErr(e.message) } }

  const react = (emoji) => run(async () => {
    const updated = emoji === m.my_reaction
      ? await api(`/api/memories/${id}/reaction`, { method: 'DELETE' })
      : await api(`/api/memories/${id}/reaction`, { method: 'PUT', body: { emoji } })
    setData({ ...m, ...updated })
  })

  const send = (e) => {
    e.preventDefault()
    if (!comment.trim()) return
    run(async () => {
      setData(await api(`/api/memories/${id}/comments`, { method: 'POST', body: { body: comment } }))
      setComment('')
    })
  }

  const removeComment = (cid) => run(async () => {
    await api(`/api/comments/${cid}`, { method: 'DELETE' })
    setData({ ...m, comments: m.comments.filter((c) => c.id !== cid) })
  })

  const remove = () => {
    if (!confirm('¿Eliminar este recuerdo? No se puede deshacer.')) return
    run(async () => {
      await api(`/api/memories/${id}`, { method: 'DELETE' })
      navigate('/recuerdos', { replace: true })
    })
  }

  const saveEdit = (e) => {
    e.preventDefault()
    run(async () => {
      setData(await api(`/api/memories/${id}`, {
        method: 'PUT',
        body: { title: editing.title, description: editing.description || null,
          location: editing.location || null, happened_on: editing.happened_on || null,
          person_ids: editing.person_ids },
      }))
      setEditing(null)
    })
  }

  const isAuthor = m.author_id === user.id

  return (
    <AppShell nav={false}>
      <TopBar
        title={m.kind === 'text' ? 'Nota' : 'Recuerdo'}
        right={m.can_edit && (
          <div className="top-actions">
            <button className="icon-btn" aria-label="Editar recuerdo"
              onClick={() => setEditing({
                title: m.title, description: m.description || '', location: m.location || '',
                happened_on: m.happened_on || '', person_ids: m.people.map((p) => p.id),
              })}>
              <Icon name="edit" />
            </button>
            <button className="icon-btn danger" onClick={remove} aria-label="Eliminar recuerdo"><Icon name="trash" /></button>
          </div>
        )}
      />
      <ErrorBox error={err} />

      {editing ? (
        <form onSubmit={saveEdit} className="card stack">
          <Field label="Título" htmlFor="et"><input id="et" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required /></Field>
          <Field label="Descripción" htmlFor="ed"><textarea id="ed" rows={4} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
          <div className="grid-2">
            <Field label="Fecha" htmlFor="ef"><input id="ef" type="date" value={editing.happened_on} onChange={(e) => setEditing({ ...editing, happened_on: e.target.value })} /></Field>
            <Field label="Lugar" htmlFor="el"><input id="el" value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })} /></Field>
          </div>
          <Field label="¿Con quién es este recuerdo?" htmlFor="ep">
            {people
              ? <PeoplePicker people={people} setPeople={setPeople} selected={editing.person_ids}
                  onChange={(ids) => setEditing({ ...editing, person_ids: ids })} />
              : <small className="muted">Cargando…</small>}
          </Field>
          <div className="row-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancelar</button>
            <button className="btn btn-primary">Guardar</button>
          </div>
        </form>
      ) : (
        <>
          <Media memory={m} />
          <article className={`card detail ${m.kind === 'text' ? 'letter' : ''}`}>
            <small className="eyebrow">
              {formatDate(m.happened_on || m.created_at)}{m.location && <> · <Icon name="pin" size={12} /> {m.location}</>}
            </small>
            <h1>{m.title}</h1>
            {m.description && <p className={m.kind === 'text' ? 'letter-body' : ''}>{m.description}</p>}
            {m.people.length > 0 ? (
              <div className="tagged">
                {m.people.map((p) => (
                  isAuthor
                    ? <Link key={p.id} to={`/personas/${p.id}`} className="tag-pill"><Avatar name={p.name} src={p.photo_url} size={24} />{p.name}<small>{RELATIONS[p.relation]}</small></Link>
                    : <span key={p.id} className="tag-pill"><Avatar name={p.name} src={p.photo_url} size={24} />{p.name}</span>
                ))}
              </div>
            ) : isAuthor && <small className="muted">🔒 Solo para ti · edítalo para etiquetar a alguien</small>}
            <div className="author"><Avatar name={m.author_name} src={isAuthor ? user.avatar_url : null} size={28} /> <small>Guardado por {isAuthor ? 'ti' : m.author_name}</small></div>
          </article>
        </>
      )}

      <section className="card">
        <h2 className="small-title">Reacciones</h2>
        <div className="reactions">
          {EMOJIS.map(({ e, label }) => (
            <button key={e} className={`reaction ${m.my_reaction === e ? 'on' : ''}`} onClick={() => react(e)}
              aria-pressed={m.my_reaction === e} title={label}>
              <span>{e}</span>{m.reactions[e] > 0 && <small>{m.reactions[e]}</small>}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="small-title">Comentarios ({m.comments.length})</h2>
        <div className="comments">
          {m.comments.map((c) => (
            <div key={c.id} className="comment">
              <Avatar name={c.author_name} src={c.author_avatar} size={32} />
              <div>
                <strong>{c.author_id === user.id ? 'Tú' : c.author_name}</strong>
                <p>{c.body}</p>
                <small className="muted">{formatDate(c.created_at)}</small>
              </div>
              {c.author_id === user.id && (
                <button className="btn-text danger" onClick={() => removeComment(c.id)} aria-label="Eliminar comentario">
                  <Icon name="x" size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        <form onSubmit={send} className="comment-form">
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Escribe un comentario…"
            maxLength={1000} aria-label="Escribe un comentario" />
          <button className="icon-btn primary" aria-label="Enviar comentario" disabled={!comment.trim()}>
            <Icon name="send" size={18} />
          </button>
        </form>
      </section>
    </AppShell>
  )
}
