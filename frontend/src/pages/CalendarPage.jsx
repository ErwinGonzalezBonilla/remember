import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import { AppShell, Avatar, EmptyState, ErrorBox, Spinner, formatDate, nextOccurrence } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../hooks'

/** Primera versión del Calendario: cumpleaños y fechas especiales de tus personas (y el tuyo).
 *  La fase de Calendario añadirá eventos propios, vista mensual y recordatorios. */
export default function CalendarPage() {
  const { user } = useAuth()
  const { data: people, loading, error } = useApi('/api/people')

  const events = []
  if (user.birth_date) events.push({ key: 'me', who: 'Tu', label: 'cumpleaños', icon: 'cake', next: nextOccurrence(user.birth_date), to: '/perfil', name: user.full_name, photo: user.avatar_url })
  for (const p of people || []) {
    if (p.birth_date) events.push({ key: `b${p.id}`, who: p.name, label: 'Cumpleaños', icon: 'cake', next: nextOccurrence(p.birth_date), to: `/personas/${p.id}`, name: p.name, photo: p.photo_url })
    if (p.special_date) events.push({ key: `s${p.id}`, who: p.name, label: p.special_label || 'Fecha especial', icon: 'heart', next: nextOccurrence(p.special_date), to: `/personas/${p.id}`, name: p.name, photo: p.photo_url })
  }
  events.sort((a, b) => a.next.days - b.next.days)

  return (
    <AppShell>
      <header className="page-head">
        <h1 className="display">Calendario</h1>
        <p className="muted">Las fechas importantes también son parte de la historia.</p>
      </header>
      <ErrorBox error={error} />
      {loading && <Spinner />}
      {people && !events.length && (
        <EmptyState icon="calendar" title="Sin fechas todavía"
          text="Añade el cumpleaños o un aniversario a tus personas y aparecerán aquí."
          action={<Link to="/personas" className="btn btn-primary">Ir a tus personas</Link>} />
      )}
      {events.length > 0 && <h2 className="small-title">Próximas fechas</h2>}
      <div className="stack-sm">
        {events.map((e) => (
          <Link key={e.key} to={e.to} className="event-row">
            <span className="event-date">
              <strong>{e.next.date.getDate()}</strong>
              <small>{formatDate(e.next.date, { year: false }).split(' ')[1]}</small>
            </span>
            <Avatar name={e.name} src={e.photo} size={36} />
            <span className="row-text">
              <strong>{e.key === 'me' ? 'Tu cumpleaños' : `${e.label} · ${e.who}`}{e.next.years > 0 && ` (${e.next.years})`}</strong>
              <small className="muted">{e.next.days === 0 ? '¡Es hoy!' : e.next.days === 1 ? 'Mañana' : `En ${e.next.days} días`}</small>
            </span>
            <Icon name={e.icon} size={18} className="coral" />
          </Link>
        ))}
      </div>
      <div className="soon-card">
        <Icon name="sparkle" size={18} /> Pronto: eventos, citas, viajes y recordatorios.
      </div>
    </AppShell>
  )
}
