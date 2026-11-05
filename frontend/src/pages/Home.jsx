import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import { relationText, AppShell, Avatar, ErrorBox, PrivateBadge, RELATIONS, Spinner, formatDate, greeting, nextOccurrence } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../hooks'
import { remainingText } from './capsules/capsuleUtils'
import { MemoryThumb } from './memories/MemoryCard'
import { noticeText } from './Notifications'
import PushToggle from '../components/PushToggle'

/** Próxima fecha especial (cumpleaños o aniversario) de tus personas, si cae en ≤ 30 días. */
function upcoming(people) {
  const events = []
  for (const p of people) {
    if (p.birth_date) events.push({ p, label: 'Cumpleaños', next: nextOccurrence(p.birth_date) })
    if (p.special_date) events.push({ p, label: p.special_label || 'Fecha especial', next: nextOccurrence(p.special_date) })
  }
  return events.filter((e) => e.next.days <= 30).sort((a, b) => a.next.days - b.next.days)[0]
}

export default function Home() {
  const { user } = useAuth()
  const { data: people, error } = useApi('/api/people')
  const { data: memories, loading } = useApi('/api/memories?limit=9')
  const { data: requests } = useApi('/api/connect/requests')
  const { data: capsules } = useApi('/api/capsules')
  const { data: notices } = useApi('/api/notifications')
  const newTags = notices?.items.filter((n) => !n.read && n.kind === 'memory_tag').slice(0, 3) || []
  const event = people && upcoming(people)
  const waiting = capsules?.received.filter((c) => c.status === 'sealed') || []
  const openedForMe = capsules?.received.filter((c) => c.status === 'open' && !c.my_reaction && !c.comment_count) || []

  return (
    <AppShell>
      <header className="home-head band band-hero">
        <div>
          <Logo size={30} tagline={false} className="logo-inline" onDark />
          <p className="muted">{greeting()}, {user.full_name.split(' ')[0]}</p>
          <h1 className="display">Guarda lo que importa. <span className="heart-hand" aria-hidden="true">♡</span></h1>
        </div>
        <div className="home-actions">
          <Link to="/avisos" className="icon-btn bell" aria-label={notices?.unread ? `Avisos: ${notices.unread} nuevos` : 'Avisos'}>
            <Icon name="bell" />
            {notices?.unread > 0 && <span className="bell-badge">{notices.unread > 9 ? '9+' : notices.unread}</span>}
          </Link>
          <Link to="/perfil" aria-label="Tu perfil"><Avatar name={user.full_name} src={user.avatar_url} /></Link>
        </div>
      </header>

      {/* Tus personas, como "historias" */}
      <section className="card people-card">
      <div className="section-head">
        <h2>Tus personas</h2>
        <Link to="/personas" className="link-strong">Ver todas <Icon name="chevron" size={16} /></Link>
      </div>
      <div className="stories" aria-label="Tus personas">
        <Link to="/personas/nueva" className="story">
          <span className="add-circle"><Icon name="plus" /></span>
          <span>Añadir</span>
        </Link>
        {people?.map((p) => (
          <Link key={p.id} to={`/personas/${p.id}`} className={`story ${p.is_linked ? '' : 'locked'}`}>
            <Avatar name={p.name} src={p.photo_url} size={58} />
            <span>{p.name.split(' ')[0]}</span>
            <small>{relationText(p)}{!p.is_linked && ' · 🔒'}</small>
          </Link>
        ))}
      </div>
      </section>

      <ErrorBox error={error} />
      <PushToggle compact />

      {newTags.map((n) => (
        <Link key={`n${n.id}`} to={`/recuerdo/${n.memory_id}`} className="highlight opened">
          <Avatar name={n.actor_name} src={n.actor_avatar} size={40} />
          <span><strong>{noticeText(n)}</strong><small>Toca para verlo</small></span>
          <Icon name="chevron" className="muted" />
        </Link>
      ))}

      {requests?.opened.map((r) => (
        <Link key={`o${r.id}`} to={`/cofre-abierto/${r.id}`} className="highlight opened">
          <span className="hl-icon"><Icon name="gift" size={20} /></span>
          <span><strong>¡{r.to_user.full_name.split(' ')[0]} aceptó tu solicitud!</strong><small>Tu cofre se ha abierto. Toca para descubrirlo.</small></span>
          <Icon name="chevron" className="muted" />
        </Link>
      ))}
      {requests?.incoming.map((r) => (
        <Link key={`i${r.id}`} to={`/conectar/solicitud/${r.id}`} className="highlight request">
          <Avatar name={r.from_user.full_name} src={r.from_user.avatar_url} size={40} />
          <span><strong>{r.from_user.full_name} quiere conectar contigo</strong><small>Dice que eres su {(RELATIONS[r.relation] || '').toLowerCase()} · Toca para responder</small></span>
          <Icon name="chevron" className="muted" />
        </Link>
      ))}

      {openedForMe.map((c) => (
        <Link key={`c${c.id}`} to={`/capsula/${c.id}`} className="highlight opened">
          <span className="hl-icon"><Icon name="gift" size={20} /></span>
          <span><strong>¡Tu cápsula de {c.author_name.split(' ')[0]} ya se abrió!</strong><small>“{c.title}” · Toca para abrirla</small></span>
          <Icon name="chevron" className="muted" />
        </Link>
      ))}
      <Link to="/capsulas" className="highlight capsule-link">
        <span className="hl-icon"><Icon name={waiting.length ? 'lock' : 'gift'} size={20} /></span>
        <span>
          {waiting.length
            ? <><strong>{waiting.length === 1 ? 'Tienes 1 cápsula esperándote' : `Tienes ${waiting.length} cápsulas esperándote`}</strong>
                <small>La próxima se abre {remainingText(waiting[0].open_at)}</small></>
            : <><strong>Cápsulas del tiempo</strong>
                <small>Deja una carta o un video que se abra en una fecha especial</small></>}
        </span>
        <Icon name="chevron" className="muted" />
      </Link>

      {(!user.avatar_url || !user.username) && (
        <Link to="/perfil" className="highlight profile-nudge">
          <span className="hl-icon"><Icon name={user.username ? 'camera' : 'user'} size={20} /></span>
          <span>
            <strong>{user.username ? 'Completa tu perfil' : 'Elige tu @usuario'}</strong>
            <small>{user.username ? 'Añade tu foto para que tus personas te reconozcan.' : 'Así tus personas podrán encontrarte y conectar contigo.'}</small>
          </span>
          <Icon name="chevron" className="muted" />
        </Link>
      )}

      {event && (
        <Link to={`/personas/${event.p.id}`} className="highlight">
          <span className="hl-icon"><Icon name={event.label === 'Cumpleaños' ? 'cake' : 'heart'} size={20} /></span>
          <span>
            <small>{event.next.days === 0 ? '¡Es hoy!' : event.next.days === 1 ? 'Mañana' : `En ${event.next.days} días`}</small>
            <strong>{event.label} de {event.p.name}{event.next.years > 0 ? ` · ${event.next.years}` : ''}</strong>
            <small>{formatDate(event.next.date)} · Guarda algo especial para ese día</small>
          </span>
        </Link>
      )}

      <div className="section-head">
        <h2>Tus recuerdos</h2>
        {memories?.length > 0 && <Link to="/recuerdos" className="link-strong">Ver todo</Link>}
      </div>
      {loading && !memories && <Spinner />}
      {memories && !memories.length && (
        <div className="first-memory">
          <span className="hl-icon"><Icon name="sparkle" size={22} /></span>
          <div>
            <strong>Guarda tu primer recuerdo</strong>
            <p className="muted">Una foto de hoy, un audio, una nota… Después podrás etiquetar a la persona con quien lo viviste, aunque aún no tenga cuenta.</p>
          </div>
        </div>
      )}
      {memories?.length > 0 && (
        <div className="thumb-row">{memories.map((m) => <MemoryThumb key={m.id} memory={m} />)}</div>
      )}

      <PrivateBadge text="Solo tú decides quién ve cada recuerdo" />
    </AppShell>
  )
}
