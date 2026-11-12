import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon'
import { AppShell, Avatar, EmptyState, ErrorBox, Spinner, TopBar } from '../../components/ui'
import { useApi } from '../../hooks'
import { MemoryCard, MemoryRow } from './MemoryCard'

const KINDS = [
  { value: '', label: 'Todos' }, { value: 'photo', label: 'Fotos' }, { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Notas de voz' }, { value: 'text', label: 'Notas' },
]

/** Todos tus recuerdos: "Fotos, Videos y Notas" o "Tus conexiones" (por persona), con filtro por tipo.
 *  Lo elegido vive en la URL (?vista=conexiones&persona=3&tipo=photo&modo=lista) para que al volver
 *  atrás desde un recuerdo siga igual. */
export default function MemoriesGallery() {
  const [params, setParams] = useSearchParams()
  const connections = params.get('vista') === 'conexiones'
  const who = connections ? params.get('persona') || '' : '' // '' todas · 'none' solo para mí · id
  const kind = KINDS.some((k) => k.value === params.get('tipo')) ? params.get('tipo') : ''
  const view = params.get('modo') === 'lista' ? 'list' : 'grid'
  const { data: people } = useApi(connections ? '/api/people' : null)

  function update(changes) {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next, { replace: true })
  }

  const query = new URLSearchParams()
  if (kind) query.set('kind', kind)
  if (who === 'none') query.set('untagged', 'true')
  else if (who) query.set('person_id', who)
  const { data: memories, setData, loading, error } = useApi(`/api/memories?${query}`)
  const replace = (m) => setData((list) => list && list.map((x) => (x.id === m.id ? m : x)))

  return (
    <AppShell>
      <TopBar
        title="Tus recuerdos"
        right={
          <button className="icon-btn" onClick={() => update({ modo: view === 'grid' ? 'lista' : '' })}
            aria-label={view === 'grid' ? 'Ver en lista' : 'Ver en cuadrícula'}>
            <Icon name={view === 'grid' ? 'list' : 'grid'} />
          </button>
        }
      />

      <div className="gallery-tabs" role="tablist" aria-label="Qué recuerdos ver">
        <button type="button" role="tab" aria-selected={connections} className={connections ? 'on' : ''}
          onClick={() => update({ vista: 'conexiones' })}>
          <Icon name="users" size={22} /> Tus conexiones
        </button>
        <button type="button" role="tab" aria-selected={!connections} className={!connections ? 'on' : ''}
          onClick={() => update({ vista: '', persona: '' })}>
          <Icon name="image" size={22} /> Fotos, Videos y Notas
        </button>
      </div>

      {connections && (
        <div className="conn-strip" aria-label="Filtrar por persona">
          {people?.map((p) => {
            const on = who === String(p.id)
            return (
              <button type="button" key={p.id} className={`conn-item ${on ? 'on' : ''}`} aria-pressed={on}
                onClick={() => update({ persona: on ? '' : String(p.id) })}>
                <Avatar name={p.name} src={p.photo_url} size={58} />
                <span>{p.name.split(' ')[0]}</span>
              </button>
            )
          })}
          <button type="button" className={`conn-item ${who === 'none' ? 'on' : ''}`} aria-pressed={who === 'none'}
            onClick={() => update({ persona: who === 'none' ? '' : 'none' })}>
            <span className="conn-me"><Icon name="lock" size={24} /></span>
            <span>Solo para mí</span>
          </button>
        </div>
      )}

      <div className="chips scroll" role="tablist" aria-label="Filtrar por tipo">
        {KINDS.map((k) => (
          <button key={k.value} role="tab" aria-selected={kind === k.value}
            className={`chip ${kind === k.value ? 'active' : ''}`} onClick={() => update({ tipo: k.value })}>{k.label}</button>
        ))}
      </div>

      <ErrorBox error={error} />
      {loading && !memories && <Spinner />}
      {memories && !memories.length && (
        <EmptyState icon="archive" title="Nada por aquí todavía"
          action={<Link to="/recuerdos/nuevo" className="btn btn-primary">Guardar un recuerdo</Link>} />
      )}
      {memories?.length > 0 && (view === 'grid'
        ? <div className="gallery">{memories.map((m) => <MemoryCard key={m.id} memory={m} onChange={replace} />)}</div>
        : <div className="stack-sm">{memories.map((m) => <MemoryRow key={m.id} memory={m} onChange={replace} />)}</div>
      )}
    </AppShell>
  )
}
