import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { AppShell, Avatar, EmptyState, ErrorBox, RELATIONS, Spinner } from '../../components/ui'
import { useApi } from '../../hooks'

export default function PeopleList() {
  const { data: people, loading, error } = useApi('/api/people')
  const { data: requests } = useApi('/api/connect/requests')

  return (
    <AppShell>
      <header className="page-head">
        <h1 className="display">Tus personas</h1>
        <p className="muted">Cada persona tiene su cofre: todo lo que guardas con ella. No necesitan tener cuenta.</p>
      </header>
      <div className="row-actions">
        <Link to="/personas/nueva" className="btn btn-primary"><Icon name="plus" size={18} /> Añadir persona</Link>
        <Link to="/conectar" className="btn btn-ghost"><Icon name="link" size={18} /> Conectar</Link>
      </div>

      {requests?.incoming.length > 0 && (
        <>
          <h2 className="small-title">Solicitudes para ti</h2>
          <div className="stack-sm">
            {requests.incoming.map((r) => (
              <Link key={r.id} to={`/conectar/solicitud/${r.id}`} className="highlight request">
                <Avatar name={r.from_user.full_name} src={r.from_user.avatar_url} size={40} />
                <span><strong>{r.from_user.full_name}</strong><small>Dice que eres su {(RELATIONS[r.relation] || '').toLowerCase()} · Responder</small></span>
                <Icon name="chevron" className="muted" />
              </Link>
            ))}
          </div>
        </>
      )}

      <ErrorBox error={error} />
      {loading && <Spinner />}
      {people && !people.length && (
        <EmptyState icon="users" title="Aún no has añadido a nadie"
          text="Añade a tu pareja, a tu bebé, a tu madre o a tu mejor amigo. Solo necesitas su nombre." />
      )}
      <div className="stack-sm">
        {people?.map((p) => (
          <Link key={p.id} to={`/personas/${p.id}`} className="person-card">
            <Avatar name={p.name} src={p.photo_url} size={60} />
            <div className="person-info">
              <small className="eyebrow">{RELATIONS[p.relation] || p.relation}</small>
              <strong>{p.name}</strong>
              <small className="muted">
                {p.memory_count} {p.memory_count === 1 ? 'recuerdo' : 'recuerdos'} ·{' '}
                {p.is_linked ? '🔓 Conectada' : '🔒 Su cofre espera'}
              </small>
            </div>
            <Icon name="chevron" className="muted" />
          </Link>
        ))}
      </div>
    </AppShell>
  )
}
