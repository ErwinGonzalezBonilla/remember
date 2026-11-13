import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api/client'
import Icon from '../../components/Icon'
import { Avatar, ErrorBox } from '../../components/ui'
import { timeAgo } from '../Notifications'
import { ReactionRow } from './Reactions'

const CLOSE_DRAG_PX = 80
const SORTS = [{ id: 'new', label: 'Más recientes' }, { id: 'old', label: 'Más antiguos' }]

/** "Hace 2 h", "Ahora", "Ayer"… */
const ago = (iso) => { const t = timeAgo(iso); return t.charAt(0).toUpperCase() + t.slice(1) }
const firstName = (name) => (name || '').split(' ')[0]

/** Hoja que sube desde abajo hasta el 70 % de la pantalla. Se cierra deslizando hacia abajo o tocando la foto. */
export function useSheetDrag(onClose) {
  const start = useRef(null)
  const [dy, setDy] = useState(0)
  return {
    dy,
    handlers: {
      onTouchStart: (e) => { start.current = e.touches[0].clientY },
      onTouchMove: (e) => { if (start.current != null) setDy(Math.max(0, e.touches[0].clientY - start.current)) },
      onTouchEnd: () => {
        if (start.current != null && dy > CLOSE_DRAG_PX) onClose()
        start.current = null
        setDy(0)
      },
    },
  }
}

/** Comentarios principales en el orden elegido; las respuestas debajo de su comentario, de la más antigua a la más nueva. */
function thread(comments, sort) {
  const byTime = (a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id - b.id
  const tops = comments.filter((c) => !c.parent_id).sort(byTime)
  if (sort === 'new') tops.reverse()
  const replies = {}
  comments.filter((c) => c.parent_id).sort(byTime).forEach((c) => { (replies[c.parent_id] ||= []).push(c) })
  return tops.map((c) => ({ ...c, replies: replies[c.id] || [] }))
}

function Comment({ c, me, memory, onReply, onDelete, reply = false }) {
  const canDelete = c.author_id === me.id || memory.author_id === me.id
  return (
    <div className={`sheet-comment ${reply ? 'reply' : ''}`}>
      <Avatar name={c.author_name} src={c.author_avatar} size={reply ? 32 : 42} />
      <div>
        <strong>{c.author_id === me.id ? 'Tú' : c.author_name}</strong>
        <p>{c.body}</p>
        <div className="sheet-comment-meta">
          <small className="muted"><time dateTime={c.created_at}>{ago(c.created_at)}</time></small>
          <button type="button" className="btn-text" onClick={() => onReply(c)}
            aria-label={`Responder a ${c.author_id === me.id ? 'tu comentario' : c.author_name}`}>Responder</button>
          {canDelete && (
            <button type="button" className="btn-text danger" onClick={() => onDelete(c)}
              aria-label={reply ? 'Borrar respuesta' : 'Borrar comentario'}>
              <Icon name="trash" size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CommentsSheet({ memory, me, onChange, onClose }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [sending, setSending] = useState(false)
  const [sort, setSort] = useState('new')
  const [sortOpen, setSortOpen] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const { dy, handlers } = useSheetDrag(onClose)
  const inputRef = useRef(null)
  const list = useMemo(() => thread(memory.comments, sort), [memory.comments, sort])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (sortOpen) setSortOpen(false)
      else if (replyTo) setReplyTo(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, sortOpen, replyTo])

  function startReply(c) {
    setReplyTo(c)
    inputRef.current?.focus()
  }

  async function send(e) {
    e.preventDefault()
    if (!text.trim() || sending) return
    setErr(''); setSending(true)
    try {
      onChange(await api(`/api/memories/${memory.id}/comments`, {
        method: 'POST', body: { body: text, ...(replyTo ? { parent_id: replyTo.id } : {}) },
      }))
      setText('')
      setReplyTo(null)
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setSending(false)
    }
  }

  async function remove(c) {
    const replies = memory.comments.filter((x) => x.parent_id === c.id).length
    if (replies && !confirm(`¿Borrar el comentario y sus ${replies === 1 ? 'respuesta' : `${replies} respuestas`}?`)) return
    setErr('')
    try {
      await api(`/api/comments/${c.id}`, { method: 'DELETE' })
      // Al borrar un comentario se borran también sus respuestas
      onChange({ comments: memory.comments.filter((x) => x.id !== c.id && x.parent_id !== c.id) })
      if (replyTo && (replyTo.id === c.id || replyTo.parent_id === c.id)) setReplyTo(null)
    } catch (e2) {
      setErr(e2.message)
    }
  }

  const n = memory.comments.length
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"
        style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}>
        <div className="sheet-grab" {...handlers}>
          <button type="button" className="sheet-handle" onClick={onClose} aria-label="Cerrar comentarios" />
        </div>
        <div className="sheet-body">
          <ReactionRow memory={memory} onChange={onChange} />
          {memory.description && memory.kind !== 'text' && <p className="sheet-description">{memory.description}</p>}
          <div className="sheet-head">
            <h2 id="sheet-title" className="sheet-title">Comentarios ({n})</h2>
            {n > 1 && (
              <div className="sheet-sort">
                <button type="button" className="btn-text" onClick={() => setSortOpen((v) => !v)}
                  aria-haspopup="listbox" aria-expanded={sortOpen} aria-label={`Ordenar: ${SORTS.find((s) => s.id === sort).label}`}>
                  Ordenar <Icon name="down" size={16} />
                </button>
                {sortOpen && (
                  <ul className="sheet-sort-menu" role="listbox" aria-label="Ordenar comentarios">
                    {SORTS.map((s) => (
                      <li key={s.id} role="option" aria-selected={sort === s.id}>
                        <button type="button" onClick={() => { setSort(s.id); setSortOpen(false) }}>
                          {s.label}{sort === s.id && <Icon name="check" size={16} />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <ErrorBox error={err} />
          <ul className="sheet-comments">
            {list.map((c) => (
              <li key={c.id}>
                <Comment c={c} me={me} memory={memory} onReply={startReply} onDelete={remove} />
                {c.replies.length > 0 && (
                  <ul className="sheet-replies">
                    {c.replies.map((r) => (
                      <li key={r.id}><Comment c={r} me={me} memory={memory} onReply={startReply} onDelete={remove} reply /></li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {!n && <p className="muted sheet-empty">Sé la primera persona en comentar.</p>}
        </div>
        <form onSubmit={send} className="sheet-form">
          {replyTo && (
            <div className="sheet-replying">
              <span>Respondiendo a <b>{replyTo.author_id === me.id ? 'ti' : firstName(replyTo.author_name)}</b></span>
              <button type="button" className="btn-text" onClick={() => setReplyTo(null)} aria-label="Cancelar la respuesta">
                <Icon name="x" size={16} />
              </button>
            </div>
          )}
          <div className="sheet-form-row">
            <span className="sheet-input">
              <Icon name="chat" size={20} />
              <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={replyTo ? 'Escribe una respuesta…' : 'Escribe un comentario…'}
                maxLength={1000} aria-label={replyTo ? 'Escribe una respuesta' : 'Escribe un comentario'} />
            </span>
            <button className="sheet-send" aria-label={replyTo ? 'Enviar respuesta' : 'Enviar comentario'} disabled={!text.trim() || sending}>
              <Icon name="send" size={20} />
            </button>
          </div>
        </form>
      </section>
    </>
  )
}
