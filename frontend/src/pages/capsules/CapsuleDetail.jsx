import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api, mediaUrl } from '../../api/client'
import Icon from '../../components/Icon'
import { AppShell, Avatar, ErrorBox, Spinner, TopBar, formatDate } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../hooks'
import { countsText, openDateText, useCountdown } from './capsuleUtils'

const EMOJIS = [
  { e: '❤️', label: 'Me encanta' }, { e: '😀', label: 'Me alegra' }, { e: '😂', label: 'Me hace reír' },
  { e: '😮', label: 'Me sorprende' }, { e: '😢', label: 'Me emociona' },
]

function Countdown({ iso, onDone }) {
  const r = useCountdown(iso, onDone)
  const parts = [[r.days, r.days === 1 ? 'día' : 'días'], [r.hours, 'horas'], [r.minutes, 'min'], [r.seconds, 'seg']]
  return (
    <div className="countdown" role="timer" aria-label={`Faltan ${r.days} días y ${r.hours} horas`}>
      {parts.map(([n, label]) => (
        <span key={label}><strong>{String(n).padStart(2, '0')}</strong><small>{label}</small></span>
      ))}
    </div>
  )
}

function Item({ it }) {
  const url = mediaUrl(it.media_url)
  if (it.kind === 'photo') return <img src={url} alt="" className="detail-media" loading="lazy" />
  if (it.kind === 'video') {
    return <video src={url} poster={mediaUrl(it.poster_url) || undefined} controls playsInline preload="metadata" className="detail-media" />
  }
  return (
    <div className="detail-audio card">
      <span className="hl-icon"><Icon name="mic" size={22} /></span>
      <audio src={url} controls />
    </div>
  )
}

export default function CapsuleDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { data: c, setData, loading, error, reload } = useApi(`/api/capsules/${id}`)
  const [comment, setComment] = useState('')
  const [err, setErr] = useState('')

  if (loading && !c) return <AppShell nav={false}><Spinner /></AppShell>
  if (error) return <AppShell nav={false}><TopBar title="Cápsula" /><ErrorBox error={error} /></AppShell>

  const run = async (fn) => { setErr(''); try { await fn() } catch (e) { setErr(e.message) } }
  const react = (emoji) => run(async () => {
    setData(emoji === c.my_reaction
      ? await api(`/api/capsules/${id}/reaction`, { method: 'DELETE' })
      : await api(`/api/capsules/${id}/reaction`, { method: 'PUT', body: { emoji } }))
  })
  const send = (e) => {
    e.preventDefault()
    if (!comment.trim()) return
    run(async () => {
      setData(await api(`/api/capsules/${id}/comments`, { method: 'POST', body: { body: comment } }))
      setComment('')
    })
  }
  const removeComment = (cid) => run(async () => {
    await api(`/api/capsules/${id}/comments/${cid}`, { method: 'DELETE' })
    setData({ ...c, comments: c.comments.filter((x) => x.id !== cid), comment_count: c.comment_count - 1 })
  })
  const remove = () => {
    if (!confirm('¿Eliminar esta cápsula? Se borrará para siempre, también para quien la iba a recibir.')) return
    run(async () => {
      await api(`/api/capsules/${id}`, { method: 'DELETE' })
      navigate('/capsulas', { replace: true })
    })
  }

  const counts = countsText(c.item_counts)
  const from = c.is_author ? 'ti' : c.author_name.split(' ')[0]

  // ----- Destinataria antes de la fecha: solo la cuenta atrás -----
  if (c.locked) {
    return (
      <AppShell nav={false}>
        <TopBar title="Cápsula del tiempo" />
        <section className="capsule-locked">
          <div className="capsule-box" aria-hidden="true"><Icon name="lock" size={40} /></div>
          <small className="eyebrow light">De {c.author_name}</small>
          <h1>{c.title}</h1>
          <p>Se abrirá el <b>{openDateText(c.open_at)}</b></p>
          <Countdown iso={c.open_at} onDone={reload} />
          {counts && <p className="capsule-contents">Dentro hay {counts}… y quién sabe qué más 🤫</p>}
        </section>
        <div className="first-memory">
          <span className="hl-icon"><Icon name="sparkle" size={22} /></span>
          <div>
            <strong>Es una sorpresa</strong>
            <p className="muted">Nadie puede ver lo que hay dentro hasta ese momento, ni siquiera REHOMI. Te avisaremos por correo cuando se abra.</p>
          </div>
        </div>
      </AppShell>
    )
  }

  const isOpen = c.status === 'open'
  return (
    <AppShell nav={false}>
      <TopBar
        title="Cápsula del tiempo"
        right={c.is_author && (
          <div className="top-actions">
            {c.status === 'draft' && <Link to={`/capsulas/${id}/editar`} className="icon-btn" aria-label="Editar cápsula"><Icon name="edit" /></Link>}
            <button className="icon-btn danger" onClick={remove} aria-label="Eliminar cápsula"><Icon name="trash" /></button>
          </div>
        )}
      />
      <ErrorBox error={err} />
      {location.state?.sealed && c.status === 'sealed' && (
        <div className="alert alert-ok">¡Cápsula sellada! 🔒 {c.person?.name} la podrá abrir el {openDateText(c.open_at)}.</div>
      )}

      {c.is_author && c.status !== 'open' && (
        <section className={`capsule-banner ${c.status}`}>
          <span className="capsule-seal"><Icon name={c.status === 'draft' ? 'edit' : 'lock'} size={22} /></span>
          <div>
            <strong>{c.status === 'draft' ? 'Borrador: aún no está sellada' : `Sellada para ${c.person?.name || '—'}`}</strong>
            <small>{c.status === 'draft'
              ? 'Nadie más la ve. Cuando esté lista, séllala para empezar la cuenta atrás.'
              : `Solo tú ves su contenido hasta el ${openDateText(c.open_at)}.`}</small>
          </div>
          {c.status === 'sealed' && <Countdown iso={c.open_at} onDone={reload} />}
          {c.status === 'draft' && <Link to={`/capsulas/${id}/editar`} className="btn btn-primary">Continuar y sellar</Link>}
        </section>
      )}
      {c.is_author && !c.person && (
        <div className="alert alert-error">Esta cápsula ya no tiene destinatario porque borraste a esa persona de tu lista.</div>
      )}

      {isOpen && (
        <section className="capsule-opened">
          <span className="capsule-seal"><Icon name="gift" size={22} /></span>
          <div>
            <strong>{c.is_author ? `Se abrió para ${c.person?.name || 'su destinatario'}` : `¡${from} te dejó esto!`}</strong>
            <small>Guardada el {formatDate(c.sealed_at || c.created_at)} · abierta el {formatDate(c.open_at)}</small>
          </div>
        </section>
      )}

      {c.cover_url && <img src={mediaUrl(c.cover_url)} alt="" className="detail-media" />}
      <article className="card detail letter">
        <small className="eyebrow">{c.is_author ? `Para ${c.person?.name || '—'}` : `De ${c.author_name}`}</small>
        <h1>{c.title}</h1>
        {c.message && <p className="letter-body">{c.message}</p>}
        <div className="author">
          <Avatar name={c.author_name} src={c.is_author ? user.avatar_url : c.author_avatar} size={28} />
          <small>Con cariño, {c.is_author ? 'tú' : c.author_name}</small>
        </div>
      </article>
      {c.items.map((it) => <Item key={it.id} it={it} />)}

      {isOpen && (
        <>
          <section className="card">
            <h2 className="small-title">Reacciones</h2>
            <div className="reactions">
              {EMOJIS.map(({ e, label }) => (
                <button key={e} className={`reaction ${c.my_reaction === e ? 'on' : ''}`} onClick={() => react(e)}
                  aria-pressed={c.my_reaction === e} title={label}>
                  <span>{e}</span>{c.reactions[e] > 0 && <small>{c.reactions[e]}</small>}
                </button>
              ))}
            </div>
          </section>
          <section className="card">
            <h2 className="small-title">Comentarios ({c.comments.length})</h2>
            <div className="comments">
              {c.comments.map((m) => (
                <div key={m.id} className="comment">
                  <Avatar name={m.author_name} src={m.author_avatar} size={32} />
                  <div>
                    <strong>{m.author_id === user.id ? 'Tú' : m.author_name}</strong>
                    <p>{m.body}</p>
                    <small className="muted">{formatDate(m.created_at)}</small>
                  </div>
                  {(m.author_id === user.id || c.is_author) && (
                    <button className="btn-text danger" onClick={() => removeComment(m.id)} aria-label="Eliminar comentario">
                      <Icon name="x" size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <form onSubmit={send} className="comment-form">
              <input value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder={c.is_author ? 'Escribe un comentario…' : `Dile algo a ${from}…`}
                maxLength={1000} aria-label="Escribe un comentario" />
              <button className="icon-btn primary" aria-label="Enviar comentario" disabled={!comment.trim()}>
                <Icon name="send" size={18} />
              </button>
            </form>
          </section>
        </>
      )}
    </AppShell>
  )
}
