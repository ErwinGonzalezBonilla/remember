import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { AppShell, Avatar, EmptyState, ErrorBox, Spinner, TopBar } from '../../components/ui'
import { useApi } from '../../hooks'
import { MemoryCard, MemoryRow } from './MemoryCard'

const KINDS = [
  { value: '', label: 'Todos' }, { value: 'photo', label: 'Fotos' }, { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Notas de voz' }, { value: 'text', label: 'Notas' },
]

/** Todos tus recuerdos, con filtros por tipo y por persona. */
export default function MemoriesGallery() {
  const [kind, setKind] = useState('')
  const [who, setWho] = useState('') // '' todos · 'none' sin etiquetar · id de persona
  const [view, setView] = useState('grid')
  const { data: people } = useApi('/api/people')

  const params = new URLSearchParams()
  if (kind) params.set('kind', kind)
  if (who === 'none') params.set('untagged', 'true')
  else if (who) params.set('person_id', who)
  const { data: memories, loading, error } = useApi(`/api/memories?${params}`)

  return (
    <AppShell>
      <TopBar
        title="Tus recuerdos"
        right={
          <button className="icon-btn" onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
            aria-label={view === 'grid' ? 'Ver en lista' : 'Ver en cuadrícula'}>
            <Icon name={view === 'grid' ? 'list' : 'grid'} />
          </button>
        }
      />

      <div className="chips scroll people-filter" aria-label="Filtrar por persona">
        <button className={`chip ${who === '' ? 'active' : ''}`} onClick={() => setWho('')}>Todas las personas</button>
        {people?.map((p) => (
          <button key={p.id} className={`chip with-avatar ${who === String(p.id) ? 'active' : ''}`} onClick={() => setWho(String(p.id))}>
            <Avatar name={p.name} src={p.photo_url} size={22} /> {p.name.split(' ')[0]}
          </button>
        ))}
        <button className={`chip ${who === 'none' ? 'active' : ''}`} onClick={() => setWho('none')}>Solo para mí</button>
      </div>
      <div className="chips scroll" role="tablist" aria-label="Filtrar por tipo">
        {KINDS.map((k) => (
          <button key={k.value} role="tab" aria-selected={kind === k.value}
            className={`chip small ${kind === k.value ? 'active' : ''}`} onClick={() => setKind(k.value)}>{k.label}</button>
        ))}
      </div>

      <ErrorBox error={error} />
      {loading && !memories && <Spinner />}
      {memories && !memories.length && (
        <EmptyState icon="archive" title="Nada por aquí todavía"
          action={<Link to="/recuerdos/nuevo" className="btn btn-primary">Guardar un recuerdo</Link>} />
      )}
      {memories?.length > 0 && (view === 'grid'
        ? <div className="gallery">{memories.map((m) => <MemoryCard key={m.id} memory={m} />)}</div>
        : <div className="stack-sm">{memories.map((m) => <MemoryRow key={m.id} memory={m} />)}</div>
      )}
    </AppShell>
  )
}
