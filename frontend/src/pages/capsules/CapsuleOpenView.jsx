import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { api } from '../../api/client'
import Icon from '../../components/Icon'
import { Avatar, ErrorBox, formatDate } from '../../components/ui'
import { REACTIONS } from '../memories/Reactions'
import { downloadSlide, shareSlide } from './capsuleFiles'
import { AudioPlayer, LetterSlide, Lightbox, PhotoSlide, VideoPlayer } from './CapsuleMedia'

const TOAST_MS = 2400
const ORDER = { photo: 0, video: 1, audio: 2 }
const NAME = { photo: 'Foto', video: 'Video', audio: 'Audio' }
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Todo el contenido en orden: carta, fotos (la portada primero), videos y audios. Cada uno con "Foto 2 de 3". */
export function slidesOf(c) {
  const slides = []
  if (c.message?.trim()) slides.push({ key: 'letter', kind: 'letter', label: 'Carta', n: 1 })
  const media = [
    ...(c.cover_url ? [{ id: 'cover', kind: 'photo', media_url: c.cover_url }] : []),
    ...c.items,
  ].map((it, i) => ({ it, i })).sort((a, b) => (ORDER[a.it.kind] ?? 9) - (ORDER[b.it.kind] ?? 9) || a.i - b.i).map((x) => x.it)
  const totals = {}
  media.forEach((it) => { totals[it.kind] = (totals[it.kind] || 0) + 1 })
  const seen = {}
  media.forEach((it) => {
    const n = (seen[it.kind] = (seen[it.kind] || 0) + 1)
    slides.push({ ...it, key: `${it.kind}-${it.id}`, n, label: `${NAME[it.kind] || 'Archivo'} ${n} de ${totals[it.kind]}` })
  })
  return slides
}

// ---------- Carrusel ----------
function Carousel({ capsule, slides, index, setIndex }) {
  const track = useRef(null)
  const [zoom, setZoom] = useState(null)
  const labelId = useId()

  const go = useCallback((i) => {
    const el = track.current
    if (!el) return
    const to = Math.max(0, Math.min(slides.length - 1, i))
    el.scrollTo({ left: to * el.clientWidth, behavior: reducedMotion() ? 'auto' : 'smooth' })
    setIndex(to)
  }, [slides.length, setIndex])

  // Al girar el móvil o cambiar el ancho, el elemento actual sigue centrado
  useEffect(() => {
    const el = track.current
    if (!el || !window.ResizeObserver) return undefined
    const ro = new ResizeObserver(() => { el.scrollLeft = index * el.clientWidth })
    ro.observe(el)
    return () => ro.disconnect()
  }, [index])

  function onScroll() {
    const el = track.current
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== index && i >= 0 && i < slides.length) setIndex(i)
  }

  function onKeyDown(e) {
    if (e.target.closest('input')) return
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1) }
  }

  const multi = slides.length > 1
  const current = slides[index]
  return (
    <section className="cv-carousel" aria-roledescription="carrusel" aria-labelledby={labelId} onKeyDown={onKeyDown}>
      <h2 id={labelId} className="sr-only">Contenido de la cápsula</h2>
      <div className="cv-stage">
        <div className="cv-track" ref={track} onScroll={onScroll}>
          {slides.map((s, i) => {
            const active = i === index
            const near = Math.abs(i - index) <= 1
            return (
              <div key={s.key} className={`cv-slide kind-${s.kind}`} role="group" aria-roledescription="elemento"
                aria-label={s.label} aria-hidden={!active} inert={!active}>
                {s.kind === 'letter' && <LetterSlide capsule={capsule} />}
                {s.kind === 'photo' && <PhotoSlide slide={s} near={near} onOpen={() => setZoom(s)} />}
                {s.kind === 'video' && <VideoPlayer slide={s} active={active} near={near} />}
                {s.kind === 'audio' && <AudioPlayer slide={s} active={active} near={near} />}
              </div>
            )
          })}
        </div>
        {multi && (
          <>
            <button type="button" className="cv-round cv-arrow prev" onClick={() => go(index - 1)} disabled={index === 0}
              aria-label="Anterior"><Icon name="back" size={20} /></button>
            <button type="button" className="cv-round cv-arrow next" onClick={() => go(index + 1)} disabled={index === slides.length - 1}
              aria-label="Siguiente"><Icon name="chevron" size={20} /></button>
          </>
        )}
      </div>
      <div className="cv-nav">
        <span className="cv-count" aria-live="polite">{current?.label}</span>
        {multi && (
          <div className="cv-dots">
            {slides.map((s, i) => (
              <button key={s.key} type="button" className={i === index ? 'on' : ''} onClick={() => go(i)}
                aria-label={`Ir a ${s.label.toLowerCase()}`} aria-current={i === index ? 'true' : undefined} />
            ))}
          </div>
        )}
      </div>
      {zoom && <Lightbox slide={zoom} onClose={() => setZoom(null)} />}
    </section>
  )
}

// ---------- Descargar · Compartir · Reaccionar ----------
function Actions({ capsule: c, slide, canReact, onReact, say }) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const firstOpt = useRef(null)
  const reactBtn = useRef(null)
  const barId = useId()

  useEffect(() => {
    if (!open) return undefined
    firstOpt.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); reactBtn.current?.focus() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function download() {
    if (!slide || busy) return
    setBusy(true)
    try {
      const r = await downloadSlide(slide, c)
      if (r === 'downloaded') say(slide.kind === 'letter' ? 'Carta descargada' : 'Descargado')
    } catch { say('No se pudo descargar') } finally { setBusy(false) }
  }

  async function share() {
    if (!slide || busy) return
    setBusy(true)
    try {
      const r = await shareSlide(slide, c)
      if (r === 'unsupported') say('Este navegador no permite compartir archivos. Usa Descargar.')
      if (r === 'failed') say('No se pudo compartir')
    } finally { setBusy(false) }
  }

  const pick = (e) => { setOpen(false); onReact(e); reactBtn.current?.focus() }
  const counts = Object.entries(c.reactions || {}).filter(([, n]) => n > 0)
  const total = counts.reduce((a, [, n]) => a + n, 0)
  const what = slide?.kind === 'letter' ? 'la carta' : slide ? slide.label.toLowerCase() : ''

  return (
    <section className="cv-actions-wrap" aria-label="Acciones">
      <div className="cv-actions">
        <div className="cv-action">
          <button type="button" className="cv-round big" onClick={download} disabled={busy || !slide} aria-label={`Descargar ${what}`}>
            <Icon name="download" />
          </button>
          <span aria-hidden="true">Descargar</span>
        </div>
        <div className="cv-action">
          <button type="button" className="cv-round big" onClick={share} disabled={busy || !slide} aria-label={`Compartir ${what}`}>
            <Icon name="share" />
          </button>
          <span aria-hidden="true">Compartir</span>
        </div>
        {canReact && (
          <div className="cv-action cv-react">
            <button ref={reactBtn} type="button" className={`cv-round big coral ${c.my_reaction ? 'on' : ''}`}
              onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={barId}
              aria-label={c.my_reaction ? `Reaccionar. Tu reacción: ${c.my_reaction}` : 'Reaccionar'}>
              {c.my_reaction ? <span className="cv-react-emoji">{c.my_reaction}</span> : <Icon name="heart" filled />}
            </button>
            <span aria-hidden="true">Reaccionar</span>
            {open && (
              <>
                <div className="cv-react-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
                <div id={barId} className="cv-react-bar" role="group" aria-label="Elige una reacción">
                  {REACTIONS.map(({ e, label }, i) => {
                    const n = c.reactions?.[e] || 0
                    const on = c.my_reaction === e
                    return (
                      <button key={e} ref={i === 0 ? firstOpt : undefined} type="button" className={on ? 'on' : ''}
                        aria-pressed={on} aria-label={`${label}${n ? `, ${n}` : ''}${on ? '. Toca para quitarla' : ''}`} onClick={() => pick(e)}>
                        <span aria-hidden="true">{e}</span>{n > 0 && <small aria-hidden="true">{n}</small>}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {canReact && total > 0 && (
        <ul className="cv-react-counts" aria-label={`${total} ${total === 1 ? 'reacción' : 'reacciones'}`}>
          {counts.map(([e, n]) => (
            <li key={e} className={c.my_reaction === e ? 'on' : ''}><span aria-hidden="true">{e}</span> {n}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------- Comentarios ----------
function CommentMenu({ m, canDelete, onDelete, say }) {
  const [open, setOpen] = useState(false)
  const btn = useRef(null)
  const menu = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    menu.current?.querySelector('button')?.focus()
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    const onDown = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown) }
  }, [open])

  async function copy() {
    setOpen(false)
    try { await navigator.clipboard.writeText(m.body); say('Comentario copiado') } catch { say('No se pudo copiar') }
  }

  return (
    <div className="cv-cmenu">
      <button ref={btn} type="button" className="icon-btn" onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu" aria-expanded={open} aria-label={`Opciones del comentario de ${m.author_name}`}>
        <Icon name="more" size={18} filled />
      </button>
      {open && (
        <div ref={menu} className="cv-cmenu-list" role="menu">
          <button type="button" role="menuitem" onClick={copy}><Icon name="copy" size={16} /> Copiar texto</button>
          {canDelete && (
            <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); onDelete(m.id) }}>
              <Icon name="trash" size={16} /> Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Comments({ capsule: c, me, from, onSend, onDelete, say }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const listId = useId()
  const titleId = useId()

  async function send(e) {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    try { if (await onSend(text)) setText('') } finally { setSending(false) }
  }

  const n = c.comments.length
  return (
    <section id="comentarios" className={`cv-comments ${collapsed ? 'collapsed' : ''}`} aria-labelledby={titleId}>
      <button type="button" className="cv-grab" onClick={() => setCollapsed((v) => !v)} aria-expanded={!collapsed}
        aria-controls={listId} aria-label={collapsed ? 'Mostrar comentarios' : 'Ocultar comentarios'}>
        <span aria-hidden="true" />
      </button>
      <h2 id={titleId} className="cv-comments-title">Comentarios <small>({n})</small></h2>
      <div id={listId} className="cv-comments-body" hidden={collapsed}>
        {n === 0 && <p className="muted cv-empty">Aún no hay comentarios. {c.is_author ? 'Escribe el primero.' : `Dile algo a ${from}.`}</p>}
        <ul className="cv-clist">
          {c.comments.map((m) => (
            <li key={m.id} className="cv-comment">
              <Avatar name={m.author_name} src={m.author_avatar} size={40} />
              <div className="cv-comment-text">
                <div className="cv-comment-head">
                  <strong>{m.author_id === me.id ? 'Tú' : m.author_name}</strong>
                  <small className="muted"><time dateTime={m.created_at}>{formatDate(m.created_at)}</time></small>
                </div>
                <p>{m.body}</p>
              </div>
              <CommentMenu m={m} canDelete={m.author_id === me.id || c.is_author} onDelete={onDelete} say={say} />
            </li>
          ))}
        </ul>
        <form onSubmit={send} className="cv-cform">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000}
            placeholder={c.is_author ? 'Escribe un comentario…' : `Dile algo a ${from}…`} aria-label="Escribe un comentario" />
          <button type="submit" className="cv-send" aria-label="Enviar comentario" disabled={!text.trim() || sending}>
            <Icon name="send" size={20} />
          </button>
        </form>
      </div>
    </section>
  )
}

// ---------- Cabecera ----------
function Header({ capsule: c, onBack, menuItems }) {
  const [open, setOpen] = useState(false)
  const btn = useRef(null)
  const menu = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    menu.current?.querySelector('button, a')?.focus()
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    const onDown = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown) }
  }, [open])

  const sent = c.is_author
  return (
    <header className="cv-head">
      <div className="cv-head-bar">
        <button type="button" className="cv-round ghost" onClick={onBack} aria-label="Volver"><Icon name="back" /></button>
        <img src="/logo-white.png" alt="Rehomi" className="cv-logo" />
        {menuItems.length > 0 ? (
          <div className="cv-hmenu">
            <button ref={btn} type="button" className="cv-round ghost" onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu" aria-expanded={open} aria-label="Más opciones">
              <Icon name="more" filled />
            </button>
            {open && (
              <div ref={menu} className="cv-cmenu-list cv-hmenu-list" role="menu">
                {menuItems.map((it) => (
                  <button key={it.label} type="button" role="menuitem" className={it.danger ? 'danger' : ''}
                    onClick={() => { setOpen(false); it.run() }}>
                    <Icon name={it.icon} size={16} /> {it.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : <span className="cv-round-spacer" />}
      </div>
      <p className="cv-kicker"><Icon name="lock" size={15} /> Cápsula del tiempo</p>
      <span className={`cv-pill ${sent ? 'sent' : ''}`}>{sent ? 'Enviada' : 'Cápsula recibida'}</span>
      <h1 className="cv-title">{c.title}</h1>
      <p className="cv-from">Con cariño, {c.author_name} <Icon name="heart" size={16} filled /></p>
    </header>
  )
}

/**
 * Vista de una cápsula con su contenido visible: la recibida ya abierta, o la tuya en cualquier estado.
 * Solo se usa cuando el servidor ha mandado el contenido (c.locked === false).
 */
export default function CapsuleOpenView({ capsule: c, setData, me, onBack, menuItems, children }) {
  const slides = slidesOf(c)
  const [index, setIndex] = useState(0)
  const [toast, setToast] = useState('')
  const [err, setErr] = useState('')
  const toastTimer = useRef(null)
  const isOpen = c.status === 'open'
  const from = c.is_author ? 'ti' : c.author_name.split(' ')[0]

  useEffect(() => () => clearTimeout(toastTimer.current), [])
  useEffect(() => { if (index >= slides.length && slides.length) setIndex(slides.length - 1) }, [index, slides.length])

  const say = useCallback((t) => {
    clearTimeout(toastTimer.current)
    setToast(t)
    toastTimer.current = setTimeout(() => setToast(''), TOAST_MS)
  }, [])

  const run = async (fn) => {
    setErr('')
    try { await fn(); return true } catch (e) { setErr(e.message); return false }
  }
  const react = (emoji) => run(async () => {
    setData(emoji === c.my_reaction
      ? await api(`/api/capsules/${c.id}/reaction`, { method: 'DELETE' })
      : await api(`/api/capsules/${c.id}/reaction`, { method: 'PUT', body: { emoji } }))
  })
  const send = (body) => run(async () => {
    setData(await api(`/api/capsules/${c.id}/comments`, { method: 'POST', body: { body } }))
  })
  const removeComment = (cid) => run(async () => {
    await api(`/api/capsules/${c.id}/comments/${cid}`, { method: 'DELETE' })
    setData((prev) => ({ ...prev, comments: prev.comments.filter((x) => x.id !== cid), comment_count: prev.comment_count - 1 }))
  })

  return (
    <div className="cv">
      <Header capsule={c} onBack={onBack} menuItems={menuItems} />
      <div className="cv-content">
        {children}
        <ErrorBox error={err} />
        {slides.length > 0
          ? <Carousel capsule={c} slides={slides} index={index} setIndex={setIndex} />
          : <p className="muted cv-empty">Esta cápsula no tiene contenido.</p>}
        <Actions capsule={c} slide={slides[index]} canReact={isOpen} onReact={react} say={say} />
      </div>
      {isOpen && <Comments capsule={c} me={me} from={from} onSend={send} onDelete={removeComment} say={say} />}
      {toast && <div className="viewer-toast glass-dark glass-thick" role="status">{toast}</div>}
    </div>
  )
}
