import { Link } from 'react-router-dom'
import { mediaUrl } from '../../api/client'
import Icon from '../../components/Icon'
import { formatDate } from '../../components/ui'

export const KIND_LABEL = { photo: 'Foto', video: 'Video', audio: 'Nota de voz', text: 'Nota' }
const KIND_ICON = { photo: 'camera', video: 'video', audio: 'mic', text: 'note' }

function Cover({ memory }) {
  const url = mediaUrl(memory.media_url)
  if (memory.kind === 'photo') return <img src={url} alt="" loading="lazy" />
  if (memory.kind === 'video') return <video src={`${url}#t=0.1`} muted playsInline preload="metadata" />
  return (
    <div className={`cover-placeholder ${memory.kind}`}>
      <Icon name={KIND_ICON[memory.kind]} size={28} />
      {memory.kind === 'text' && memory.description && <p>{memory.description}</p>}
    </div>
  )
}

/** Tarjeta de la galería (vista en cuadrícula). */
export function MemoryCard({ memory }) {
  const loved = Boolean(memory.my_reaction)
  return (
    <Link to={`/recuerdo/${memory.id}`} className={`memory-card kind-${memory.kind}`}>
      <Cover memory={memory} />
      {memory.kind === 'video' && <span className="badge-play"><Icon name="play" size={14} filled /></span>}
      <span className={`badge-heart ${loved ? 'on' : ''}`}><Icon name="heart" size={16} filled={loved} /></span>
      <span className="memory-meta">
        <small>{formatDate(memory.happened_on || memory.created_at)}</small>
        <strong>{memory.title}</strong>
      </span>
    </Link>
  )
}

/** Fila de la vista en lista (orden cronológico). */
export function MemoryRow({ memory }) {
  return (
    <Link to={`/recuerdo/${memory.id}`} className="memory-row">
      <div className="memory-row-cover"><Cover memory={memory} /></div>
      <span className="row-text">
        <small className="eyebrow">{formatDate(memory.happened_on || memory.created_at)}</small>
        <strong>{memory.title}</strong>
        <small className="muted">
          {KIND_LABEL[memory.kind]}{memory.location ? ` · ${memory.location}` : ''}
          {memory.people.length > 0 ? ` · Con ${memory.people.map((p) => p.name).join(', ')}` : ' · Solo para ti'}
        </small>
        {memory.description && memory.kind !== 'text' && <small className="clamp">“{memory.description}”</small>}
      </span>
      {memory.my_reaction && <span className="coral"><Icon name="heart" size={16} filled /></span>}
    </Link>
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
