import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import Icon from '../../components/Icon'
import { Avatar, ErrorBox, formatDate } from '../../components/ui'

const CLOSE_DRAG_PX = 80

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

export default function CommentsSheet({ memory, me, onChange, onClose }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [sending, setSending] = useState(false)
  const { dy, handlers } = useSheetDrag(onClose)
  const inputRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function send(e) {
    e.preventDefault()
    if (!text.trim() || sending) return
    setErr(''); setSending(true)
    try {
      onChange(await api(`/api/memories/${memory.id}/comments`, { method: 'POST', body: { body: text } }))
      setText('')
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setSending(false)
    }
  }

  async function remove(cid) {
    setErr('')
    try {
      await api(`/api/comments/${cid}`, { method: 'DELETE' })
      onChange({ ...memory, comments: memory.comments.filter((c) => c.id !== cid) })
    } catch (e2) {
      setErr(e2.message)
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"
        style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}>
        <div className="sheet-grab" {...handlers}>
          <button type="button" className="sheet-handle" onClick={onClose} aria-label="Cerrar comentarios" />
        </div>
        <div className="sheet-body">
          {memory.description && memory.kind !== 'text' && <p className="sheet-description">{memory.description}</p>}
          <h2 id="sheet-title" className="sheet-title">Comentarios ({memory.comments.length})</h2>
          <ErrorBox error={err} />
          <ul className="sheet-comments">
            {memory.comments.map((c) => (
              <li key={c.id} className="sheet-comment">
                <Avatar name={c.author_name} src={c.author_avatar} size={40} />
                <div>
                  <strong>{c.author_id === me.id ? 'Tú' : c.author_name}</strong>
                  <p>{c.body}</p>
                  <small className="muted">{formatDate(c.created_at)}</small>
                </div>
                {(c.author_id === me.id || memory.author_id === me.id) && (
                  <button type="button" className="btn-text danger" onClick={() => remove(c.id)} aria-label="Borrar comentario">
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!memory.comments.length && <p className="muted sheet-empty">Sé la primera persona en comentar.</p>}
        </div>
        <form onSubmit={send} className="sheet-form">
          <span className="sheet-input">
            <Icon name="chat" size={20} />
            <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe un comentario…"
              maxLength={1000} aria-label="Escribe un comentario" />
          </span>
          <button className="sheet-send" aria-label="Enviar comentario" disabled={!text.trim() || sending}>
            <Icon name="send" size={20} />
          </button>
        </form>
      </section>
    </>
  )
}
