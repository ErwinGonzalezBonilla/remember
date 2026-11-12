import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, mediaUrl } from '../../api/client'
import Icon from '../../components/Icon'
import { formatDate } from '../../components/ui'
import { MilestoneBadge } from './Milestone'

export const KIND_LABEL = { photo: 'Foto', video: 'Video', audio: 'Nota de voz', text: 'Nota' }
const KIND_ICON = { photo: 'camera', video: 'video', audio: 'mic', text: 'note' }
const HEART = '❤️'
const DOUBLE_TAP_MS = 280
const BURST_MS = 800

function Cover({ memory }) {
  const url = mediaUrl(memory.media_url)
  if (memory.kind === 'photo') return <img src={url} alt="" loading="lazy" />
  if (memory.kind === 'video') {
    // Con miniatura no hace falta cargar el video: la cuadrícula va mucho más rápida
    if (memory.poster_url) return <img src={mediaUrl(memory.poster_url)} alt="" loading="lazy" />
    return <video src={`${url}#t=0.1`} muted playsInline preload="metadata" />
  }
  return (
    <div className={`cover-placeholder ${memory.kind}`}>
      <Icon name={KIND_ICON[memory.kind]} size={28} />
      {memory.kind === 'text' && memory.description && <p>{memory.description}</p>}
    </div>
  )
}

/** Poner o quitar tu ❤️. Actualiza la tarjeta al momento y después con lo que devuelve el servidor. */
function useHeart(memory, onChange) {
  const loved = memory.my_reaction === HEART
  async function set(on) {
    const before = memory
    onChange?.({ ...memory, my_reaction: on ? HEART : null })
    try {
      onChange?.(await api(`/api/memories/${memory.id}/reaction`,
        on ? { method: 'PUT', body: { emoji: HEART } } : { method: 'DELETE' }))
    } catch {
      onChange?.(before)
    }
  }
  return { loved, toggle: () => set(!loved), like: () => !loved && set(true) }
}

function HeartButton({ loved, onToggle, className = '' }) {
  return (
    <button type="button" className={`heart-btn ${loved ? 'on' : ''} ${className}`} aria-pressed={loved}
      aria-label={loved ? 'Quitar mi ❤️' : 'Darle ❤️'}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle() }}>
      <Icon name="heart" size={18} filled={loved} />
    </button>
  )
}

/** Tarjeta de la cuadrícula. Un toque abre el recuerdo; doble toque le da ❤️ (como en Instagram). */
export function MemoryCard({ memory, onChange }) {
  const navigate = useNavigate()
  const timer = useRef(null)
  const burstTimer = useRef(null)
  const [burst, setBurst] = useState(0) // 0 = oculto; cambia en cada doble toque para reiniciar la animación
  const { loved, toggle, like } = useHeart(memory, onChange)
  const to = `/recuerdo/${memory.id}`

  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(burstTimer.current) }, [])

  // El corazón grande se quita a los 0,8 s aunque no haya animación (movimiento reducido)
  function showBurst() {
    clearTimeout(burstTimer.current)
    setBurst((b) => b + 1)
    burstTimer.current = setTimeout(() => setBurst(0), BURST_MS)
  }

  function onClick(e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return // abrir en otra pestaña
    e.preventDefault()
    if (e.detail === 0) return navigate(to) // con el teclado (Enter): sin esperar al doble toque
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
      showBurst()
      like()
      return
    }
    timer.current = setTimeout(() => { timer.current = null; navigate(to) }, DOUBLE_TAP_MS)
  }

  return (
    <div className={`memory-card kind-${memory.kind}`}>
      <Link to={to} className="memory-card-link" onClick={onClick} aria-label={memory.title}>
        <Cover memory={memory} />
        {memory.kind === 'video' && <span className="kind-badge"><Icon name="play" size={16} filled /></span>}
        {memory.kind === 'audio' && <span className="kind-badge"><Icon name="mic" size={16} /></span>}
        <span className="memory-meta">
          <MilestoneBadge milestone={memory.milestone} />
          <small>{formatDate(memory.happened_on || memory.created_at)}</small>
          <strong>{memory.title}</strong>
        </span>
        {burst > 0 && <span key={burst} className="heart-burst" aria-hidden="true"><Icon name="heart" size={84} filled /></span>}
      </Link>
      <HeartButton loved={loved} onToggle={toggle} />
    </div>
  )
}

/** Fila de la vista en lista (orden cronológico). */
export function MemoryRow({ memory, onChange }) {
  const { loved, toggle } = useHeart(memory, onChange)
  return (
    <div className="memory-row-wrap">
      <Link to={`/recuerdo/${memory.id}`} className="memory-row">
        <div className="memory-row-cover"><Cover memory={memory} /></div>
        <span className="row-text">
          <small className="eyebrow">{formatDate(memory.happened_on || memory.created_at)}</small>
          <MilestoneBadge milestone={memory.milestone} />
          <strong>{memory.title}</strong>
          <small className="muted">
            {KIND_LABEL[memory.kind]}{memory.location ? ` · ${memory.location}` : ''}
            {memory.people.length > 0 ? ` · Con ${memory.people.map((p) => p.name).join(', ')}` : ' · Solo para ti'}
          </small>
          {memory.description && memory.kind !== 'text' && <small className="clamp">“{memory.description}”</small>}
        </span>
      </Link>
      <HeartButton loved={loved} onToggle={toggle} className="row-heart" />
    </div>
  )
}

/** Miniatura cuadrada para Home y el espacio de conexión. */
export function MemoryThumb({ memory, asDiv = false }) {
  if (asDiv) return <div className="thumb"><Cover memory={memory} /></div>
  return (
    <Link to={`/recuerdo/${memory.id}`} className="thumb" title={memory.title}>
      <Cover memory={memory} />
    </Link>
  )
}
