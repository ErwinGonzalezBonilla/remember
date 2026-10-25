import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import Icon from '../../components/Icon'
import { AppShell, Avatar, ErrorBox, RELATIONS, Spinner, TopBar, formatDate, nextOccurrence } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../hooks'
import { KIND_LABEL, MemoryThumb } from '../memories/MemoryCard'

/** El cofre de una persona: su línea de tiempo con todo lo que has guardado con ella. */
export default function PersonChest() {
  const { id } = useParams()
  const { user } = useAuth()
  const location = useLocation()
  const [copied, setCopied] = useState(false)
  const { data: person, loading, error } = useApi(`/api/people/${id}`)
  const { data: memories } = useApi(`/api/memories?person_id=${id}`)

  if (loading) return <AppShell><Spinner /></AppShell>
  if (error) return <AppShell><TopBar title="Persona" /><ErrorBox error={error} /></AppShell>

  const first = person.name.split(' ')[0]
  const since = memories?.length ? memories[memories.length - 1] : null
  const birthday = person.birth_date && nextOccurrence(person.birth_date)

  // Agrupar la línea de tiempo por año
  const byYear = {}
  memories?.forEach((m) => {
    const y = (m.happened_on || m.created_at).slice(0, 4)
    ;(byYear[y] ||= []).push(m)
  })
  const years = Object.keys(byYear).sort((a, b) => b - a)

  return (
    <AppShell>
      <TopBar
        title={person.name}
        right={<Link to={`/personas/${id}/editar`} className="icon-btn" aria-label="Editar persona"><Icon name="edit" /></Link>}
      />

      <section className="chest">
        <Avatar name={person.name} src={person.photo_url} size={84} />
        <h1>El cofre de {first}</h1>
        <span className="muted">
          {RELATIONS[person.relation] || person.relation} · {person.memory_count}{' '}
          {person.memory_count === 1 ? 'recuerdo' : 'recuerdos'}
          {since && ` desde ${(since.happened_on || since.created_at).slice(0, 4)}`}
        </span>
        {person.note && <p className="chest-note">“{person.note}”</p>}
        <span className={`chest-badge ${person.is_linked ? 'open' : ''}`}>
          {person.is_linked ? '🔓 Conectada: compartís estos recuerdos' : '🔒 Se abrirá cuando se conecte'}
        </span>
      </section>

      {location.state?.connected && (
        <div className="alert alert-ok">
          ¡Conectados! {location.state.shared > 0
            ? `${location.state.connected} ya puede ver ${location.state.shared === 1 ? 'el recuerdo' : `los ${location.state.shared} recuerdos`} de su cofre.`
            : `A partir de ahora compartiréis los recuerdos en los que os etiquetéis.`}
        </div>
      )}

      <Link to={`/recuerdos/nuevo?persona=${id}`} className="btn btn-primary">
        <Icon name="plus" size={18} /> Guardar un recuerdo para {first}
      </Link>

      {birthday && (
        <div className="milestone">
          <span className="hl-icon"><Icon name="cake" size={20} /></span>
          <span>
            <small>Cumpleaños</small>
            <strong>{formatDate(birthday.date)}{birthday.years > 0 && ` · cumple ${birthday.years}`}</strong>
            <small>{birthday.days === 0 ? '¡Es hoy!' : `En ${birthday.days} días`}</small>
          </span>
        </div>
      )}

      {memories && !memories.length && (
        <div className="first-memory">
          <span className="hl-icon"><Icon name="gift" size={22} /></span>
          <div>
            <strong>Su cofre está vacío</strong>
            <p className="muted">Guarda una foto, un audio o una carta para {first}. Lo descubrirá cuando se conecte.</p>
          </div>
        </div>
      )}

      {years.map((y) => (
        <section key={y} className="timeline">
          <h2 className="year">{y}</h2>
          <div className="tl">
            {byYear[y].map((m) => (
              <Link key={m.id} to={`/recuerdo/${m.id}`} className="tl-item">
                <div className="tl-thumb"><MemoryThumb memory={m} asDiv /></div>
                <span className="row-text">
                  <strong>{m.title}</strong>
                  <small>{formatDate(m.happened_on || m.created_at)} · {KIND_LABEL[m.kind]}{m.author_id !== user.id && ` · de ${m.author_name.split(' ')[0]}`}</small>
                  {m.people.length > 1 && (
                    <small className="muted">Con {m.people.filter((p) => String(p.id) !== id).map((p) => p.name).join(', ')}</small>
                  )}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {!person.is_linked && (
        <section className="card invite">
          <strong>¿Cómo se abre el cofre de {first}?</strong>
          <p className="muted">Cuando {first} cree su cuenta en Remember, que te busque en <b>Conectar</b> con tu @usuario. Al aceptar su solicitud, verá todo lo que guardaste aquí.</p>
          {user.username ? (
            <button className="btn btn-ghost" onClick={async () => {
              try { await navigator.clipboard.writeText(`Te guardé recuerdos en Remember 💛 Crea tu cuenta en ${window.location.origin} y búscame: @${user.username}`); setCopied(true) } catch { /* sin portapapeles */ }
            }}>
              <Icon name={copied ? 'check' : 'link'} size={18} /> {copied ? 'Invitación copiada' : `Copiar invitación (@${user.username})`}
            </button>
          ) : (
            <Link to="/perfil" className="btn btn-ghost">Elige tu @usuario primero</Link>
          )}
        </section>
      )}
    </AppShell>
  )
}
