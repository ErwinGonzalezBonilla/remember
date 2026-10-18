import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { AppShell, Avatar, EmptyState, ErrorBox, RELATIONS, Spinner } from '../../components/ui'
import { useApi } from '../../hooks'

export default function PeopleList() {
  const { data: people, loading, error } = useApi('/api/people')

  return (
    <AppShell>
      <header className="page-head">
        <h1 className="display">Tus personas</h1>
        <p className="muted">Cada persona tiene su cofre: todo lo que guardas con ella. No necesitan tener cuenta.</p>
      </header>
      <Link to="/personas/nueva" className="btn btn-primary"><Icon name="plus" size={18} /> Añadir persona</Link>

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
                {p.is_linked ? 'Conectada' : '🔒 Su cofre espera'}
              </small>
            </div>
            <Icon name="chevron" className="muted" />
          </Link>
        ))}
      </div>
    </AppShell>
  )
}
