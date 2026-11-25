import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon from '../../components/Icon'
import { AppShell, EmptyState, ErrorBox, Spinner, TopBar, ageAt, formatDate } from '../../components/ui'
import { mediaUrl } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../hooks'
import CalendarPage from '../CalendarPage'
import CapsulesPage from '../capsules/CapsulesPage'
import { KIND_LABEL, MemoryThumb } from '../memories/MemoryCard'
import { MilestoneBadge } from '../memories/Milestone'
import { firstName } from './chestUtils'

/** La persona del cofre (para el título). Devuelve { person, id, name, gate } — `gate` es la pantalla de carga o error. */
export function useChestPerson() {
  const { id } = useParams()
  const { data: person, loading, error } = useApi(`/api/people/${id}`)
  let gate = null
  if (loading && !person) gate = <AppShell><Spinner /></AppShell>
  else if (error) gate = <AppShell><TopBar title="Cofre" /><ErrorBox error={error} /></AppShell>
  return { person, id, name: person ? firstName(person.name) : '', gate }
}

/** Todos los recuerdos del cofre, por año (la línea de tiempo de siempre). */
export function ChestMemories() {
  const { person, id, name, gate } = useChestPerson()
  const { user } = useAuth()
  const [onlySpecial, setOnlySpecial] = useState(false)
  const { data: memories, error } = useApi(`/api/memories?person_id=${id}`)
  if (gate) return gate

  const shown = onlySpecial ? memories?.filter((m) => m.milestone || m.starred) : memories
  const byYear = {}
  shown?.forEach((m) => { (byYear[(m.happened_on || m.created_at).slice(0, 4)] ||= []).push(m) })
  const years = Object.keys(byYear).sort((a, b) => b - a)

  return (
    <AppShell>
      <TopBar title={`Recuerdos con ${name}`}
        right={<Link to={`/recuerdos/nuevo?persona=${id}`} className="icon-btn" aria-label="Guardar un recuerdo"><Icon name="plus" /></Link>} />
      <ErrorBox error={error} />
      {!memories && !error && <Spinner />}
      {memories?.length > 0 && (
        <div className="chips chest-filter">
          <button type="button" className={`chip chip-coral ${onlySpecial ? 'active' : ''}`} aria-pressed={onlySpecial}
            onClick={() => setOnlySpecial((v) => !v)}>⭐ Solo momentos destacados</button>
        </div>
      )}
      {memories && !memories.length && (
        <EmptyState icon="gift" title="Aún no hay recuerdos" text={`Guarda una foto, un audio o una carta para ${name}.`}
          action={<Link to={`/recuerdos/nuevo?persona=${id}`} className="btn btn-primary">Guardar un recuerdo</Link>} />
      )}
      {onlySpecial && !shown.length && <p className="muted center">Aún no hay momentos destacados con {name}.</p>}
      {years.map((y) => (
        <section key={y} className="timeline">
          <h2 className="year">{y}</h2>
          <div className="tl">
            {byYear[y].map((m) => {
              const age = ageAt(person.birth_date, m.happened_on || m.created_at)
              return (
                <Link key={m.id} to={`/recuerdo/${m.id}`} className="tl-item">
                  <div className="tl-thumb"><MemoryThumb memory={m} asDiv /></div>
                  <span className="row-text">
                    <MilestoneBadge milestone={m.milestone} />
                    <strong>{m.starred && <Icon name="star" size={14} filled className="tl-star" title="Destacado" />} {m.title}</strong>
                    <small>{formatDate(m.happened_on || m.created_at)}{age && <span className="tl-age"> · {age}</span>} · {KIND_LABEL[m.kind]}{m.author_id !== user.id && ` · de ${firstName(m.author_name)}`}</small>
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </AppShell>
  )
}

/** Galería del cofre: cada foto (o video) de los recuerdos compartidos. */
export function ChestGallery({ kind }) {
  const { id, name, gate } = useChestPerson()
  const { data: items, error } = useApi(`/api/memories/media?person_id=${id}&kind=${kind}`)
  if (gate) return gate
  const photo = kind === 'photo'
  return (
    <AppShell>
      <TopBar title={photo ? `Fotos con ${name}` : `Videos con ${name}`}
        right={<Link to={`/recuerdos/nuevo?persona=${id}&tipo=${kind}`} className="icon-btn"
          aria-label={photo ? 'Guardar una foto' : 'Guardar un video'}><Icon name="plus" /></Link>} />
      <ErrorBox error={error} />
      {!items && !error && <Spinner />}
      {items && !items.length && (
        <EmptyState icon={photo ? 'camera' : 'video'} title={photo ? 'Aún no hay fotos' : 'Aún no hay videos'}
          text={`Las ${photo ? 'fotos' : 'videos'} de los recuerdos que compartís con ${name} aparecerán aquí.`}
          action={<Link to={`/recuerdos/nuevo?persona=${id}&tipo=${kind}`} className="btn btn-primary">
            {photo ? 'Guardar una foto' : 'Guardar un video'}</Link>} />
      )}
      {items?.length > 0 && (
        <>
          <p className="muted small">{items.length} {photo ? (items.length === 1 ? 'foto' : 'fotos') : (items.length === 1 ? 'video' : 'videos')}</p>
          <ul className="chest-gallery">
            {items.map((it, i) => (
              <li key={`${it.memory_id}-${it.position}-${i}`}>
                <Link to={`/recuerdo/${it.memory_id}`} className="chest-gallery-item"
                  aria-label={`${it.title}, ${formatDate(it.happened_on)}`}>
                  {photo || it.poster_url
                    ? <img src={mediaUrl(photo ? it.url : it.poster_url)} alt="" loading="lazy" />
                    : <video src={`${mediaUrl(it.url)}#t=0.1`} muted playsInline preload="metadata" aria-hidden="true" />}
                  {!photo && <span className="chest-play small" aria-hidden="true"><Icon name="play" size={16} filled /></span>}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </AppShell>
  )
}

/** Solo las cápsulas entre los dos, con la lista de siempre. */
export function ChestCapsules() {
  const { person, gate } = useChestPerson()
  if (gate) return gate
  return <CapsulesPage person={person} />
}

/** El calendario filtrado a esa persona, con el mismo panel del día. */
export function ChestCalendar() {
  const { person, gate } = useChestPerson()
  if (gate) return gate
  return <CalendarPage person={person} />
}

