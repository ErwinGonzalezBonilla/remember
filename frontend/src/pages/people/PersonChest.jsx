import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import BottomSheet from '../../components/BottomSheet'
import Icon from '../../components/Icon'
import { AppShell, Avatar, ErrorBox, Spinner, TopBar, formatDate, relationText } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../hooks'
import { firstName, highlights, recommendations } from '../chest/chestUtils'
import { MemoryThumb } from '../memories/MemoryCard'
import { MilestoneBadge } from '../memories/Milestone'

const THUMBS = 4

/** "Te llama «El orejón» 😂" o, sin apodo, "Dice que eres su primo/a". Vacío si no hay nada que contar. */
function seenAsLine(seen) {
  if (!seen) return ''
  if (seen.nickname) return `Te llama «${seen.nickname}»${seen.nickname_emoji ? ` ${seen.nickname_emoji}` : ''}`
  const rel = relationText(seen)
  return rel && !(seen.relation === 'otro' && !seen.relation_label) ? `Dice que eres su ${rel.toLowerCase()}` : ''
}

/** Los accesos del cofre. `dot`: punto rojo (mensajes sin leer). */
function actions(id) {
  return [
    { to: `/personas/${id}/fotos`, icon: 'camera', label: 'Foto' },
    { to: `/personas/${id}/videos`, icon: 'video', label: 'Video' },
    { to: `/personas/${id}/canciones`, icon: 'music', label: 'Canciones' },
    { to: `/personas/${id}/capsulas`, icon: 'hourglass', label: 'Cápsula' },
    { to: `/personas/${id}/chat`, icon: 'chat', label: 'Chat', key: 'chat' },
    { to: `/personas/${id}/calendario`, icon: 'calendar', label: 'Calendario' },
    { to: `/personas/${id}/mapa`, icon: 'map', label: 'Mapa' },
  ]
}

function ChestHead({ person, id }) {
  const name = firstName(person.name)
  const photo = person.photo_url || person.about?.avatar_url
  const face = (
    <span className="chest-face">
      <Avatar name={person.name} src={photo} size={112} />
      <span className="chest-face-heart" aria-hidden="true"><Icon name="heart" size={18} filled /></span>
    </span>
  )
  return (
    <header className="chest-head">
      <div className="chest-head-bar">
        <BackButton />
        <Link to={`/personas/${id}/editar`} className="chest-round" aria-label={`Editar a ${name}`}><Icon name="edit" size={20} /></Link>
      </div>
      {person.is_linked
        ? <Link to={`/personas/${id}/perfil`} className="chest-face-link" aria-label={`Ver el perfil de ${name}`}>{face}</Link>
        : face}
      <h1 className="chest-title">El cofre de {name}</h1>
      <p className="chest-sub">{relationText(person)}{person.since_year && ` · Desde ${person.since_year}`}</p>
      <p className="chest-private"><Icon name="lock" size={14} /> Espacio privado compartido</p>
    </header>
  )
}

function BackButton() {
  const navigate = useNavigate()
  const back = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/personas', { replace: true }))
  return <button type="button" className="chest-round" onClick={back} aria-label="Volver"><Icon name="back" size={20} /></button>
}

function OurMemories({ memories, id, name }) {
  if (!memories.length) {
    return (
      <section className="chest-section">
        <h2 className="chest-h2">Nuestros recuerdos</h2>
        <div className="first-memory">
          <span className="hl-icon"><Icon name="gift" size={22} /></span>
          <div>
            <strong>Su cofre está vacío</strong>
            <p className="muted">Guarda una foto, un audio o una carta para {name}.</p>
            <Link to={`/recuerdos/nuevo?persona=${id}`} className="btn btn-primary chest-first-btn"><Icon name="plus" size={18} /> Guardar el primero</Link>
          </div>
        </div>
      </section>
    )
  }
  const [last, ...rest] = memories
  return (
    <section className="chest-section" aria-labelledby="chest-ours">
      <div className="chest-section-head">
        <h2 id="chest-ours" className="chest-h2">Nuestros recuerdos</h2>
        <Link to={`/personas/${id}/recuerdos`} className="btn-text chest-see">Ver todo ({memories.length})</Link>
      </div>
      <Link to={`/recuerdo/${last.id}`} className="chest-hero-memory">
        <MemoryThumb memory={last} asDiv />
        {last.kind === 'video' && <span className="chest-play" aria-hidden="true"><Icon name="play" size={28} filled /></span>}
        <span className="chest-hero-text">
          <strong>{last.title}</strong>
          <small>{formatDate(last.happened_on || last.created_at)}{last.kind === 'video' ? ' · Video' : ''}</small>
        </span>
      </Link>
      {rest.length > 0 && (
        <ul className="chest-thumbs">
          {rest.slice(0, THUMBS).map((m) => (
            <li key={m.id}>
              <Link to={`/recuerdo/${m.id}`} className="chest-thumb" aria-label={m.title}>
                <MemoryThumb memory={m} asDiv />
                {m.kind === 'video' && <span className="chest-play small" aria-hidden="true"><Icon name="play" size={16} filled /></span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Highlights({ list, name }) {
  return (
    <section className="chest-section" aria-labelledby="chest-highlights">
      <h2 id="chest-highlights" className="chest-h2">Momentos destacados</h2>
      {list.length ? (
        <ul className="chest-highlights">
          {list.map((m) => (
            <li key={m.id}>
              <Link to={`/recuerdo/${m.id}`} className="chest-highlight">
                <MemoryThumb memory={m} asDiv />
                <span className="chest-highlight-text">
                  {m.milestone ? <MilestoneBadge milestone={m.milestone} /> : <span className="chest-star"><Icon name="star" size={13} filled /> Destacado</span>}
                  <strong>{m.title}</strong>
                  <small>{formatDate(m.happened_on || m.created_at)}</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted chest-empty-line">
          Aquí saldrán los hitos y los recuerdos que marques con <Icon name="star" size={14} /> al verlos. Marca tu primer momento con {name}.
        </p>
      )}
    </section>
  )
}

/** El cofre de una persona: el espacio privado entre tú y ella. */
export default function PersonChest() {
  const { id } = useParams()
  const { user } = useAuth()
  const location = useLocation()
  const [copied, setCopied] = useState(false)
  const [tips, setTips] = useState(false)
  const { data: person, loading, error } = useApi(`/api/people/${id}`)
  const { data: memories, error: memError } = useApi(`/api/memories?person_id=${id}`)

  if (loading) return <AppShell><Spinner /></AppShell>
  if (error) return <AppShell><TopBar title="Persona" /><ErrorBox error={error} /></AppShell>

  const name = firstName(person.name)
  const seenLine = person.is_linked ? seenAsLine(person.seen_as) : ''
  const recs = memories ? recommendations(person, memories) : []

  return (
    <AppShell>
      <div className="chest-page">
        <ChestHead person={person} id={id} />

        {location.state?.connected && (
          <div className="alert alert-ok">
            ¡Conectados! {location.state.shared > 0
              ? `${location.state.connected} ya puede ver ${location.state.shared === 1 ? 'el recuerdo' : `los ${location.state.shared} recuerdos`} de su cofre.`
              : 'A partir de ahora compartiréis los recuerdos en los que os etiquetéis.'}
          </div>
        )}
        {(person.nickname || seenLine) && (
          <p className="chest-nicks">
            {person.nickname && <span>Le dices «{person.nickname}» {person.nickname_emoji}</span>}
            {seenLine && <span>{seenLine}</span>}
          </p>
        )}

        <nav className="chest-actions" aria-label={`El cofre de ${name}`}>
          {actions(id).map((a) => (
            <Link key={a.to} to={a.to} className="chest-action">
              <span className="chest-action-icon"><Icon name={a.icon} size={24} /></span>
              <small>{a.label}</small>
            </Link>
          ))}
        </nav>

        <ErrorBox error={memError} />
        {!memories && !memError && <Spinner />}
        {memories && (
          <>
            <OurMemories memories={memories} id={id} name={name} />
            <Highlights list={highlights(memories)} name={name} />
            <section className="chest-section" aria-label="Recomendaciones">
              <button type="button" className="chest-recs" onClick={() => setTips(true)} aria-haspopup="dialog">
                <span className="chest-recs-icon"><Icon name="sparkle" size={22} /></span>
                <span className="chest-recs-text">
                  <strong>Recomendaciones</strong>
                  <small>{recs.length ? `${recs.length} ${recs.length === 1 ? 'idea' : 'ideas'} para ${name}` : `Ideas para ${name}`}</small>
                </span>
                {recs.length > 0 && <span className="chest-recs-count" aria-hidden="true">{recs.length}</span>}
                <Icon name="chevron" size={18} />
              </button>
            </section>
          </>
        )}

        {person.note && <p className="chest-note">“{person.note}”</p>}

        {!person.is_linked && (
          <section className="card invite">
            <strong>¿Cómo se abre el cofre de {name}?</strong>
            <p className="muted">Cuando {name} cree su cuenta en REHOMI, que te busque en <b>Conectar</b> con tu @usuario. Al aceptar su solicitud, verá todo lo que guardaste aquí.</p>
            {user.username ? (
              <button className="btn btn-ghost" onClick={async () => {
                try { await navigator.clipboard.writeText(`Te guardé recuerdos en REHOMI 💛 Crea tu cuenta en ${window.location.origin} y búscame: @${user.username}`); setCopied(true) } catch { /* sin portapapeles */ }
              }}>
                <Icon name={copied ? 'check' : 'link'} size={18} /> {copied ? 'Invitación copiada' : `Copiar invitación (@${user.username})`}
              </button>
            ) : (
              <Link to="/perfil" className="btn btn-ghost">Elige tu @usuario primero</Link>
            )}
          </section>
        )}
      </div>

      {tips && (
        <BottomSheet title={`Ideas para ${name}`} onClose={() => setTips(false)}>
          {recs.length ? (
            <ul className="recs-list">
              {recs.map((r) => (
                <li key={r.key}>
                  <Link to={r.to} className="rec">
                    <span className={`rec-icon is-${r.tone}`}><Icon name={r.icon} size={20} /></span>
                    <span className="rec-text"><strong>{r.title}</strong><small>{r.text}</small></span>
                    <span className="rec-cta">{r.cta}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted day-none">Ahora mismo no hay nada pendiente. ¡Vais al día!</p>
          )}
        </BottomSheet>
      )}
    </AppShell>
  )
}
