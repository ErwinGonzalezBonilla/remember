import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import { AppShell, Avatar, EmptyState, ErrorBox, PageHead, Spinner, TopBar, formatDate, nextOccurrence } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../hooks'
import { EventIcon, TYPE_ORDER, buildDated, buildYearly, inYear, title } from './calendarEvents'
import DaySheet from './DaySheet'

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const WEEKDAYS = [['D', 'Domingo'], ['L', 'Lunes'], ['M', 'Martes'], ['X', 'Miércoles'], ['J', 'Jueves'], ['V', 'Viernes'], ['S', 'Sábado']]
const FILTERS = [
  { id: 'all', label: 'Todo' },
  { id: 'birthday', label: 'Solo cumpleaños' },
  { id: 'special', label: 'Solo aniversarios y fechas especiales' },
  { id: 'capsule', label: 'Solo cápsulas' },
  { id: 'memory', label: 'Solo recuerdos' },
]
const UPCOMING = 3
const SWIPE_PX = 50
const DAY_MS = 86400000

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const short = (date) => formatDate(date, { year: false })   // "9 nov"
const dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

function EventLine({ e }) {
  return (
    <Link to={e.to} className="cal-event">
      <EventIcon e={e} />
      <span className="cal-event-date">{short(e.date)}</span>
      <span className="cal-event-title">{title(e)}</span>
      <Icon name="chevron" size={16} className="cal-event-go" />
    </Link>
  )
}

/** Fila completa (la lista de siempre): fecha, foto, nombre y cuánto falta. */
function EventRow({ e }) {
  return (
    <Link to={e.to} className="event-row">
      <span className="event-date">
        <strong>{e.date.getDate()}</strong>
        <small>{short(e.date).split(' ')[1]}</small>
      </span>
      <Avatar name={e.who || e.name} src={e.photo} size={36} />
      <span className="row-text">
        <strong>{title(e)}</strong>
        <small className="muted">{e.days === 0 ? '¡Es hoy!' : e.days === 1 ? 'Mañana' : `En ${e.days} días`}</small>
      </span>
      <EventIcon e={e} />
    </Link>
  )
}

function FilterMenu({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (ev) => { if (!ref.current?.contains(ev.target)) setOpen(false) }
    const onKey = (ev) => ev.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div className="cal-filter" ref={ref}>
      <button type="button" className={`icon-btn ${value !== 'all' ? 'on' : ''}`} onClick={() => setOpen((o) => !o)}
        aria-label="Filtrar fechas" aria-haspopup="menu" aria-expanded={open}>
        <Icon name="sliders" />
        {value !== 'all' && <span className="cal-filter-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="cal-filter-menu glass glass-thick" role="menu" aria-label="Qué fechas ver">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="menuitemradio" aria-checked={value === f.id}
              onClick={() => { onChange(f.id); setOpen(false) }}>
              <span>{f.label}</span>{value === f.id && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Calendario: el mes con tus fechas, cápsulas y recuerdos marcados, y la lista de lo próximo.
 * `person`: dentro de un cofre, solo lo de esa persona (sus fechas, las cápsulas entre los dos y lo que compartís).
 */
export default function CalendarPage({ person = null }) {
  const { user } = useAuth()
  const q = person ? `person_id=${person.id}` : ''
  const peopleApi = useApi(person ? null : '/api/people')
  const [personState, setPersonState] = useState(person)
  const people = person ? [personState] : peopleApi.data
  const setPeople = person ? (fn) => setPersonState((p) => fn([p])[0]) : peopleApi.setData
  const { loading, error } = person ? { loading: false, error: '' } : peopleApi
  const { data: capsules, error: capsulesError } = useApi(`/api/capsules${q ? `?${q}` : ''}`)
  // 500 es lo máximo que devuelve la API (los más recientes por fecha del recuerdo)
  const { data: memories, error: memoriesError } = useApi(`/api/memories?limit=500${q ? `&${q}` : ''}`)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(null)   // Date del día tocado
  const [sheetDay, setSheetDay] = useState(null)   // día cuyo panel está abierto
  const [filter, setFilter] = useState('all')
  const [showAll, setShowAll] = useState(false)
  const touch = useRef(null)

  const yearly = buildYearly(person ? {} : user, people)
  const dated = buildDated(capsules, memories, user)
  const keep = (e) => filter === 'all' || e.type === filter
  const events = yearly.filter(keep)
  const datedShown = dated.filter(keep)

  const y = month.getFullYear()
  const m = month.getMonth()
  const isCurrentMonth = y === today.getFullYear() && m === today.getMonth()

  // Lo del mes que se ve, por día (en el orden: cumpleaños, fechas especiales, cápsulas, recuerdos)
  const byDay = {}
  for (const e of events) {
    const at = inYear(e, y)
    if (at && at.date.getMonth() === m) (byDay[at.date.getDate()] ||= []).push(at)
  }
  for (const e of datedShown) {
    if (e.date.getFullYear() === y && e.date.getMonth() === m) (byDay[e.date.getDate()] ||= []).push(e)
  }
  for (const d of Object.keys(byDay)) byDay[d].sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))

  // Lo próximo, de lo más cercano a lo más lejano: las fechas de cada año y las cápsulas selladas que aún no se han abierto
  const upcoming = [
    ...events.map((e) => {
      const next = nextOccurrence(e.iso)
      return { ...e, date: next.date, days: next.days, years: next.years }
    }),
    ...datedShown.filter((e) => e.type === 'capsule' && e.status === 'sealed' && e.date >= today)
      .map((e) => ({ ...e, days: Math.round((e.date - today) / DAY_MS) })),
  ].sort((a, b) => a.days - b.days)

  function goMonth(delta) {
    setMonth(new Date(y, m + delta, 1))
    setSelected(null)
  }
  function goToday() {
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelected(null)
  }
  // Tocar un día lo resalta, filtra la lista de abajo y abre su panel
  function pick(date) {
    setSelected(date)
    setShowAll(false)
    setSheetDay(date)
  }
  // Lo de ese día, sin el filtro: el panel enseña todo lo que hay
  const sheetEvents = sheetDay
    ? [...yearly.map((e) => inYear(e, sheetDay.getFullYear())), ...dated]
      .filter((e) => e && sameDay(e.date, sheetDay))
      .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))
    : []
  function changeFilter(f) {
    setFilter(f)
    setSelected(null)
  }

  function onTouchStart(ev) {
    touch.current = ev.touches.length === 1 ? { x: ev.touches[0].clientX, y: ev.touches[0].clientY } : null
  }
  function onTouchEnd(ev) {
    const t = touch.current
    touch.current = null
    if (!t) return
    const dx = ev.changedTouches[0].clientX - t.x
    const dy = ev.changedTouches[0].clientY - t.y
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) goMonth(dx < 0 ? 1 : -1)
  }

  // Cuadrícula: huecos hasta el primer día (semana desde el domingo) y los días del mes
  const lead = new Date(y, m, 1).getDay()
  const count = new Date(y, m + 1, 0).getDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)]

  // Lo que muestra la lista
  let listTitle, list
  if (selected) {
    listTitle = short(selected)
    list = byDay[selected.getDate()] || []
  } else if (isCurrentMonth) {
    listTitle = 'Próximos eventos'
    list = upcoming.slice(0, UPCOMING)
  } else {
    listTitle = `Eventos de ${MONTHS[m].toLowerCase()}`
    list = Object.keys(byDay).map(Number).sort((a, b) => a - b).flatMap((d) => byDay[d])
  }

  // Sin nada que mostrar: el calendario sale igual (para poder tocar un día y anotar la primera fecha)
  const noDates = people && capsules && memories && !yearly.length && !dated.length
  return (
    <AppShell>
      {person ? (
        <TopBar title={`Calendario con ${person.name.split(' ')[0]}`}
          right={!noDates && <FilterMenu value={filter} onChange={changeFilter} />} />
      ) : (
        <PageHead title="Calendario" className={people ? 'page-head-hero' : ''}
          action={!noDates && people && <FilterMenu value={filter} onChange={changeFilter} />}>
          <p className="muted">Tus fechas importantes, en un solo lugar.</p>
        </PageHead>
      )}
      <ErrorBox error={error || capsulesError || memoriesError} />
      {loading && <Spinner />}

      {people && (
        <section className="card cal-card" aria-label="Calendario del mes">
          <div className="cal-head">
            <button type="button" className="icon-btn" onClick={() => goMonth(-1)} aria-label="Mes anterior"><Icon name="back" size={20} /></button>
            <button type="button" className="cal-month" onClick={goToday}
              aria-label={isCurrentMonth ? `${MONTHS[m]} ${y}` : `${MONTHS[m]} ${y}. Volver al mes actual`}>
              <span aria-live="polite">{MONTHS[m]} {y}</span>
            </button>
            <button type="button" className="icon-btn" onClick={() => goMonth(1)} aria-label="Mes siguiente"><Icon name="chevron" size={20} /></button>
          </div>
          <div className="cal-grid" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {WEEKDAYS.map(([d, full]) => <abbr key={full} title={full} className="cal-wd">{d}</abbr>)}
            {cells.map((d, i) => {
              if (!d) return <span key={`x${i}`} aria-hidden="true" />
              const date = new Date(y, m, d)
              const evs = byDay[d] || []
              const types = TYPE_ORDER.filter((t) => evs.some((e) => e.type === t))
              // El fondo del día, como siempre: coral si hay cumpleaños, azul si hay una fecha especial
              const kind = types.includes('birthday') ? 'birthday' : types.includes('special') ? 'special' : ''
              const isToday = sameDay(date, today)
              const isSel = selected && sameDay(date, selected)
              const cls = `cal-day ${kind ? `has-${kind}` : ''} ${types.length ? 'with-dots' : ''} ${isToday ? 'today' : ''} ${isSel ? 'selected' : ''}`
              // Todos los días se pueden tocar: abren su panel (también los que no tienen nada)
              const name = `${d} de ${MONTHS[m].toLowerCase()}`
              return (
                <button key={dayKey(date)} type="button" className={cls} onClick={() => pick(date)} aria-pressed={!!isSel}
                  aria-haspopup="dialog" aria-current={isToday ? 'date' : undefined}
                  aria-label={evs.length ? `${name}: ${evs.map(title).join(', ')}` : name}>
                  <span>{d}</span>
                  {types.length > 0 && (
                    // <i>, no <span>: ".cal-day > span" es el círculo del número
                    <i className="cal-dots" aria-hidden="true">{types.map((t) => <b key={t} className={`dot-${t}`} />)}</i>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {noDates && (
        <EmptyState icon="calendar" title="Sin fechas todavía"
          text={person ? 'Toca un día para anotar su cumpleaños o una fecha especial.' : 'Añade el cumpleaños o un aniversario a tus personas y aparecerán aquí.'}
          action={!person && <Link to="/personas" className="btn btn-primary">Ir a tus personas</Link>} />
      )}

      {people && !noDates && (
        <section className="cal-list" aria-live="polite">
          <div className="section-head">
            <h2 className="cal-list-title">{listTitle}</h2>
            {selected ? (
              <button type="button" className="btn-text cal-see" onClick={() => setSelected(null)}>
                <Icon name="x" size={14} /> Ver todos
              </button>
            ) : (
              <button type="button" className="btn-text cal-see" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                {showAll ? 'Ver menos' : 'Ver todos'} <Icon name={showAll ? 'up' : 'chevron'} size={14} />
              </button>
            )}
          </div>
          {!showAll && (list.length
            ? <div className="card cal-events">{list.map((e) => <EventLine key={`${e.key}-${e.date.getFullYear()}`} e={e} />)}</div>
            : <p className="muted small cal-none">
              {filter !== 'all' ? 'No hay fechas con este filtro.' : selected ? 'Nada anotado este día.' : 'No hay fechas este mes.'}
            </p>)}
          {showAll && !selected && (upcoming.length
            ? <div className="stack-sm">{upcoming.map((e) => <EventRow key={e.key} e={e} />)}</div>
            : <p className="muted small cal-none">No hay fechas con este filtro.</p>)}
        </section>
      )}

      {sheetDay && (
        <DaySheet date={sheetDay} events={sheetEvents} people={people || []} today={today} personId={person?.id}
          onClose={() => setSheetDay(null)}
          onPersonSaved={(p) => setPeople((list) => list.map((x) => (x.id === p.id ? p : x)))} />
      )}

      {!person && (
        <div className="soon-card">
          <Icon name="sparkle" size={18} /> Pronto: eventos, citas, viajes y recordatorios.
        </div>
      )}
    </AppShell>
  )
}
