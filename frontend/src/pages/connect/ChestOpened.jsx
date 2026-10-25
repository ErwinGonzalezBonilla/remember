import { Link, useParams } from 'react-router-dom'
import Icon from '../../components/Icon'
import { AppShell, Avatar, ErrorBox, RELATIONS, Spinner, formatDate } from '../../components/ui'
import { useApi } from '../../hooks'
import { MemoryThumb } from '../memories/MemoryCard'

/** "¡Tu cofre se ha abierto!": lo ve quien envió la solicitud cuando la otra persona la acepta. */
export default function ChestOpened() {
  const { id } = useParams()
  const { data, loading, error } = useApi(`/api/connect/opened/${id}`)
  const { data: memories } = useApi(data?.person_id ? `/api/memories?person_id=${data.person_id}` : null)

  if (loading) return <AppShell nav={false}><Spinner /></AppShell>
  if (error) return <AppShell nav={false}><ErrorBox error={error} /><Link to="/" className="btn btn-ghost">Ir al inicio</Link></AppShell>

  const other = data.request.to_user
  const first = other.full_name.split(' ')[0]
  const relation = (RELATIONS[data.request.relation] || '').toLowerCase()
  const fromThem = (memories || []).filter((m) => m.author_id === other.id)
  const oldest = fromThem[fromThem.length - 1]

  return (
    <AppShell nav={false}>
      <section className="reveal">
        <Avatar name={other.full_name} src={other.avatar_url} size={72} />
        <span className="reveal-gift"><Icon name="gift" size={34} /></span>
        <h1>{data.shared_count > 0 ? '¡Tu cofre se ha abierto!' : '¡Ya estáis conectados!'}</h1>
        <p>
          {data.shared_count > 0
            ? <>Tu {relation || 'persona'}, {first}, guardó <b>{data.shared_count} {data.shared_count === 1 ? 'recuerdo' : 'recuerdos'}</b> para ti{oldest ? ` desde ${(oldest.happened_on || oldest.created_at).slice(0, 4)}` : ''}.</>
            : <>{first} ha aceptado tu solicitud. A partir de ahora podréis compartir los recuerdos en los que os etiquetéis.</>}
        </p>
      </section>

      {fromThem.length > 0 && (
        <>
          <div className="thumb-row">{fromThem.slice(0, 6).map((m) => <MemoryThumb key={m.id} memory={m} />)}</div>
          <Link to={`/recuerdo/${oldest.id}`} className="card first-open">
            <small className="eyebrow">{formatDate(oldest.happened_on || oldest.created_at)}</small>
            <strong>{oldest.title}</strong>
            {oldest.description && <p className="muted clamp">“{oldest.description}”</p>}
          </Link>
        </>
      )}

      {data.person_id && (
        <Link to={`/personas/${data.person_id}`} className="btn btn-coral">Empezar a descubrir</Link>
      )}
      <Link to="/" className="btn btn-ghost">Ir al inicio</Link>
    </AppShell>
  )
}
