import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, mediaUrl } from '../../api/client'
import Icon from '../../components/Icon'
import { AppShell, ErrorBox, Spinner, TopBar, ageAt, formatDate } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../hooks'
import CommentsSheet from './CommentsSheet'
import { BURST_MS, useHeart } from './MemoryCard'
import MemoryEdit from './MemoryEdit'
import { MilestoneBadge } from './Milestone'
import { copyLink, downloadItem, shareMemory } from './share'

const DOUBLE_TAP_MS = 280
const SWIPE_UP_PX = 50
const TOAST_MS = 2200

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Lo que se pasa deslizando: las fotos y videos del álbum (o el único archivo de un recuerdo antiguo). */
function slidesOf(m) {
  if (m.kind !== 'photo' && m.kind !== 'video') return []
  return m.media?.length ? m.media : [{ id: null, kind: m.kind, url: m.media_url, poster_url: m.poster_url }]
}

function Slide({ item, title, near }) {
  const url = mediaUrl(item.url)
  const bg = mediaUrl(item.kind === 'video' ? item.poster_url : item.url)
  return (
    <div className="viewer-slide">
      {bg && near && <div className="viewer-blur" style={{ backgroundImage: `url("${bg}")` }} aria-hidden="true" />}
      {item.kind === 'video' ? (
        <video className="viewer-media" src={url} poster={mediaUrl(item.poster_url) || undefined}
          controls playsInline preload={near ? 'metadata' : 'none'} />
      ) : (
        <img className="viewer-media" src={url} alt={title} draggable={false} loading={near ? 'eager' : 'lazy'} />
      )}
    </div>
  )
}

const clock = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '')

/** Nota de voz: un reproductor grande sobre fondo petróleo. */
function VoicePlayer({ src }) {
  const ref = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const known = Number.isFinite(duration) && duration > 0
  return (
    <div className="viewer-voice">
      <audio ref={ref} src={src} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)} onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)} />
      <button type="button" className="voice-play" onClick={() => (playing ? ref.current.pause() : ref.current.play())}
        aria-label={playing ? 'Pausar la nota de voz' : 'Escuchar la nota de voz'}>
        <Icon name={playing ? 'pause' : 'play'} size={44} filled />
      </button>
      <input type="range" className="voice-range" min={0} max={known ? duration : 1} step={0.1} value={known ? time : 0}
        disabled={!known} onChange={(e) => { ref.current.currentTime = Number(e.target.value) }}
        aria-label="Posición de la nota de voz" />
      <div className="voice-times"><span>{clock(time)}</span><span>{known ? clock(duration) : ''}</span></div>
    </div>
  )
}

/** Personas etiquetadas, con su edad ese día si se conoce: "Con Allison (8 meses) y Sofía". */
function PeopleLine({ memory }) {
  if (!memory.people.length) return null
  const day = memory.happened_on || memory.created_at
  const names = memory.people.map((p) => {
    const age = ageAt(p.birth_date, day)
    return age ? `${p.name} (${age})` : p.name
  })
  const text = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : names[0]
  return <p className="viewer-people">Con {text}</p>
}

function Viewer({ memory: m, setMemory, me }) {
  const navigate = useNavigate()
  const slides = slidesOf(m)
  const [index, setIndex] = useState(0)
  const [chrome, setChrome] = useState(true)     // textos y botones visibles
  const [sheet, setSheet] = useState(false)
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [burst, setBurst] = useState(0)
  const track = useRef(null)
  const tapTimer = useRef(null)
  const burstTimer = useRef(null)
  const toastTimer = useRef(null)
  const touch = useRef(null)

  const merge = useCallback((u) => setMemory((prev) => ({ ...prev, ...u })), [setMemory])
  const { like } = useHeart(m, merge)
  const current = slides[index] || (m.kind === 'audio' ? { kind: 'audio', url: m.media_url } : null)
  const commentCount = m.comments.length

  const say = useCallback((text) => {
    clearTimeout(toastTimer.current)
    setToast(text)
    toastTimer.current = setTimeout(() => setToast(''), TOAST_MS)
  }, [])

  // Sin la barra de abajo y sin desplazar la página de detrás
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
      clearTimeout(tapTimer.current); clearTimeout(burstTimer.current); clearTimeout(toastTimer.current)
    }
  }, [])

  // Si el álbum cambia (al editar), el índice no puede quedar fuera
  useEffect(() => { if (index > 0 && index >= slides.length) go(slides.length - 1) }) // eslint-disable-line react-hooks/exhaustive-deps

  // Solo suena el video que se está viendo
  useEffect(() => {
    track.current?.querySelectorAll('video').forEach((v, i) => { if (i !== index && !v.paused) v.pause() })
  }, [index])

  const go = useCallback((i) => {
    const el = track.current
    if (!el) return
    const to = Math.max(0, Math.min(slides.length - 1, i))
    el.scrollTo({ left: to * el.clientWidth, behavior: reducedMotion() ? 'auto' : 'smooth' })
    setIndex(to)
  }, [slides.length])

  useEffect(() => {
    const onKey = (e) => {
      if (editing || sheet) return
      if (e.key === 'Escape' && menu) setMenu(false)
      if (e.target.closest?.('input, textarea, video, audio')) return
      if (e.key === 'ArrowRight') go(index + 1)
      if (e.key === 'ArrowLeft') go(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, index, editing, sheet, menu])

  function onScroll() {
    const el = track.current
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== index && i >= 0 && i < slides.length) setIndex(i)
  }

  // Un toque: ocultar o mostrar los textos. Doble toque: ❤️ con el corazón grande.
  function onTap(e) {
    if (e.target.closest('video, audio, button, a, input, .viewer-letter-paper')) return
    if (tapTimer.current) {
      clearTimeout(tapTimer.current)
      tapTimer.current = null
      clearTimeout(burstTimer.current)
      setBurst((b) => b + 1)
      burstTimer.current = setTimeout(() => setBurst(0), BURST_MS)
      like()
      return
    }
    tapTimer.current = setTimeout(() => { tapTimer.current = null; setChrome((c) => !c) }, DOUBLE_TAP_MS)
  }

  // Deslizar hacia arriba abre los comentarios
  function onTouchStart(e) {
    if (e.touches.length !== 1 || e.target.closest('.viewer-letter, video, input')) { touch.current = null; return }
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function onTouchEnd(e) {
    const t = touch.current
    touch.current = null
    if (!t || sheet) return
    const dx = e.changedTouches[0].clientX - t.x
    const dy = e.changedTouches[0].clientY - t.y
    if (dy < -SWIPE_UP_PX && Math.abs(dy) > Math.abs(dx) * 1.5) { setChrome(true); setSheet(true) }
  }

  function back() {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/recuerdos', { replace: true })
  }

  async function doDownload() {
    if (!current || busy) return
    setBusy(true)
    try { await downloadItem(current, m, index) } finally { setBusy(false) }
  }

  async function doShare() {
    if (busy) return
    setBusy(true)
    try {
      if ((await shareMemory(current, m, index)) === 'copied') say('Enlace copiado')
    } catch {
      say('No se pudo compartir')
    } finally { setBusy(false) }
  }

  async function doCopy() {
    setMenu(false)
    await copyLink(m)
    say('Enlace copiado')
  }

  async function doDelete() {
    setMenu(false)
    if (!confirm('¿Borrar este recuerdo? No se puede deshacer.')) return
    try {
      await api(`/api/memories/${m.id}`, { method: 'DELETE' })
      navigate('/recuerdos', { replace: true })
    } catch (e) {
      say(e.message)
    }
  }

  const multi = slides.length > 1
  return (
    <div className={`viewer kind-${m.kind} ${chrome ? '' : 'chrome-off'} ${sheet ? 'sheet-open' : ''}`}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="viewer-stage" onClick={onTap}>
        {slides.length > 0 && (
          <div className="viewer-track" ref={track} onScroll={onScroll}
            aria-roledescription="carrusel" aria-label={`${m.title}: ${slides.length} ${slides.length === 1 ? 'elemento' : 'elementos'}`}>
            {slides.map((it, i) => (
              <Slide key={it.id ?? `s${i}`} item={it} title={multi ? `${m.title} (${i + 1} de ${slides.length})` : m.title}
                near={Math.abs(i - index) <= 1} />
            ))}
          </div>
        )}
        {m.kind === 'audio' && <VoicePlayer src={mediaUrl(m.media_url)} />}
        {m.kind === 'text' && (
          <div className="viewer-letter">
            <div className="viewer-letter-paper">{m.description}</div>
          </div>
        )}
        {burst > 0 && <span key={burst} className="heart-burst" aria-hidden="true"><Icon name="heart" size={110} filled /></span>}
      </div>

      <div className="viewer-top">
        <button type="button" className="viewer-btn" onClick={back} aria-label="Volver"><Icon name="back" /></button>
        <div className="viewer-actions">
          {current?.url && (
            <button type="button" className="viewer-btn" onClick={doDownload} disabled={busy}
              aria-label={current.kind === 'video' ? 'Descargar video' : current.kind === 'audio' ? 'Descargar nota de voz' : 'Descargar foto'}>
              <Icon name="download" />
            </button>
          )}
          <button type="button" className="viewer-btn" onClick={doShare} disabled={busy} aria-label="Compartir"><Icon name="share" /></button>
          <button type="button" className="viewer-btn" onClick={() => setMenu((v) => !v)} aria-label="Más opciones"
            aria-haspopup="menu" aria-expanded={menu}>
            <Icon name="more" filled />
          </button>
        </div>
      </div>

      {multi && (
        <div className="viewer-counter">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Anterior"><Icon name="back" size={16} /></button>
          <span aria-live="polite">{index + 1} / {slides.length}</span>
          <button type="button" onClick={() => go(index + 1)} disabled={index === slides.length - 1} aria-label="Siguiente"><Icon name="chevron" size={16} /></button>
        </div>
      )}

      {menu && (
        <>
          <div className="viewer-menu-backdrop" onClick={() => setMenu(false)} aria-hidden="true" />
          <div className="viewer-menu" role="menu">
            {m.can_edit && (
              <button type="button" role="menuitem" onClick={() => { setMenu(false); setEditing(true) }}>
                <Icon name="edit" size={18} /> Editar recuerdo
              </button>
            )}
            <button type="button" role="menuitem" onClick={doCopy}><Icon name="link" size={18} /> Copiar enlace</button>
            {m.can_edit && (
              <button type="button" role="menuitem" className="danger" onClick={doDelete}><Icon name="trash" size={18} /> Borrar</button>
            )}
          </div>
        </>
      )}

      <div className="viewer-bottom">
        <div className="viewer-info-row">
          <div className="viewer-info">
            <MilestoneBadge milestone={m.milestone} className="viewer-badge" />
            <h1 className="viewer-title">{m.title}</h1>
            <p className="viewer-meta">
              <Icon name="calendar" size={17} /> {formatDate(m.happened_on || m.created_at)}
              {m.location && <><span className="viewer-dot" aria-hidden="true">·</span><Icon name="pin" size={15} /> {m.location}</>}
            </p>
            <PeopleLine memory={m} />
            {m.author_id !== me.id && <p className="viewer-people">Guardado por {m.author_name}</p>}
            {m.description && m.kind !== 'text' && <p className="viewer-desc">{m.description}</p>}
          </div>
        </div>
        <button type="button" className="viewer-hint" onClick={() => { setChrome(true); setSheet(true) }}
          aria-label={`Ver comentarios (${commentCount})`}>
          <Icon name="up" size={22} />
          <span>Desliza para ver comentarios{commentCount ? ` · ${commentCount}` : ''}</span>
        </button>
      </div>

      {toast && <div className="viewer-toast" role="status">{toast}</div>}

      {sheet && <CommentsSheet memory={m} me={me} onChange={merge} onClose={() => setSheet(false)} />}
      {editing && <MemoryEdit memory={m} onSaved={merge} onClose={() => setEditing(false)} />}
    </div>
  )
}

export default function MemoryDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { data, setData, loading, error } = useApi(`/api/memories/${id}`)

  if (loading && !data) return <AppShell nav={false}><Spinner /></AppShell>
  if (error) return <AppShell nav={false}><TopBar title="Recuerdo" /><ErrorBox error={error} /></AppShell>
  return <Viewer key={data.id} memory={data} setMemory={setData} me={user} />
}
