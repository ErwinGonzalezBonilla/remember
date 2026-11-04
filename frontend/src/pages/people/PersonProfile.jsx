import { Link, useParams } from 'react-router-dom'
import { FamilyList, hasFamily } from '../../components/About'
import Icon from '../../components/Icon'
import { AppShell, Avatar, EmptyState, ErrorBox, Spinner, TopBar, formatDate, nextOccurrence, relationText, seenAsText } from '../../components/ui'
import { useApi } from '../../hooks'

/** El perfil de alguien con quien estás conectado: su foto, su @usuario, su frase, su cumpleaños y su familia. */
export default function PersonProfile() {
  const { id } = useParams()
  const { data: person, loading, error } = useApi(`/api/people/${id}`)

  if (loading) return <AppShell><Spinner /></AppShell>
  if (error) return <AppShell><TopBar title="Perfil" /><ErrorBox error={error} /></AppShell>

  const about = person.about
  if (!about) {
    return (
      <AppShell>
        <TopBar title={person.name} />
        <EmptyState icon="lock" title="Aún no estáis conectados"
          text={`Cuando ${person.name.split(' ')[0]} y tú os conectéis, verás aquí su perfil.`}
          action={<Link to="/conectar" className="btn btn-primary">Conectar</Link>} />
      </AppShell>
    )
  }

  const first = about.full_name.split(' ')[0]
  const birthday = about.birth_date && nextOccurrence(about.birth_date)

  return (
    <AppShell>
      <TopBar title={`Perfil de ${first}`} />

      <section className="profile-hero">
        <Avatar name={about.full_name} src={about.avatar_url || person.photo_url} size={104} />
        <h1>{about.full_name}</h1>
        {about.username && <span className="muted">@{about.username}</span>}
        <span className="profile-rel">Para ti: {relationText(person)}
          {person.nickname && <> · «{person.nickname}» {person.nickname_emoji}</>}</span>
        {about.bio && <p className="chest-note">“{about.bio}”</p>}
      </section>

      {seenAsText(person.seen_as) && (
        <div className="seen-as">
          <span className="seen-emoji" aria-hidden="true">{person.seen_as.nickname_emoji || '💛'}</span>
          <span><small>Cómo te tiene guardado</small><strong>{seenAsText(person.seen_as)}</strong></span>
        </div>
      )}

      {birthday && (
        <div className="card profile-link">
          <span className="row-icon"><Icon name="cake" size={20} /></span>
          <span className="row-text">
            <strong>Cumpleaños · {formatDate(about.birth_date, { year: false })}</strong>
            <small>{birthday.days === 0 ? '¡Es hoy! 🎉' : birthday.days === 1 ? 'Mañana' : `Dentro de ${birthday.days} días`}</small>
          </span>
        </div>
      )}

      <section className="card about-card">
        <h2 className="card-title">Su familia</h2>
        {hasFamily(about)
          ? <FamilyList about={about} />
          : <p className="muted">{first} todavía no ha contado nada de su familia.</p>}
      </section>

      <Link to={`/personas/${id}`} className="btn btn-primary"><Icon name="gift" size={18} /> Ver el cofre de {first}</Link>
    </AppShell>
  )
}
