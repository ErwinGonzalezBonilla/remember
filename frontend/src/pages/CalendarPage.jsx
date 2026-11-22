import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import { AppShell, Avatar, EmptyState, ErrorBox, PageHead, Spinner, formatDate, nextOccurrence, parseDay } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../hooks'
import DaySheet from './DaySheet'

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const WEEKDAYS = [['D', 'Domingo'], ['L', 'Lunes'], ['M', 'Martes'], ['X', 'Miércoles'], ['J', 'Jueves'], ['V', 'Viernes'], ['S', 'Sábado']]
const FILTERS = [
  { id: 'all', label: 'Todo' },
  { id: 'birthday', label: 'Solo cumpleaños' },
  { id: 'special', label: 'Solo aniversarios y fechas especiales' },
]
const UPCOMING = 3
const SWIPE_PX = 50

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const short = (date) => formatDate(date, { year: false })   // "9 nov"
const dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

/** Cumpleaños y fechas especiales de tus personas (y tu cumpleaños), sin año: se repiten cada año. */
function buildEvents(user, people) {
  const events = []
  if (user.birth_date) {
    events.push({ key: 'me', type: 'birthday', iso: user.birth_date, me: true, label: 'Tu cumpleaños', to: '/perfil', name: user.full_name, photo: user.avatar_url })
  }
  for (const p of people || []) {
    const base = { name: p.name, photo: p.photo_url, to: `/personas/${p.id}` }
    if (p.birth_date) events.push({ ...base, key: `b${p.id}`, type: 'birthday', iso: p.birth_date, label: 'Cumpleaños' })
    if (p.special_date) events.push({ ...base, key: `s${p.id}`, type: 'special', iso: p.special_date, label: p.special_label || 'Fecha especial' })
  }
  return events
}

/** El evento en un año concreto: fecha de ese año y años que cumple (o que hace). Null si no cae (29 feb). */
function inYear(e, year) {
  const d = parseDay(e.iso)
  const date = new Date(year, d.getMonth(), d.getDate())
  if (date.getMonth() !== d.getMonth()) return null
  return { ...e, date, years: year - d.getFullYear() }
}

/** "Cumpleaños · Yetha (34)" · "Tu cumpleaños (35)" */
const title = (e) => `${e.me ? e.label : `${e.label} · ${e.name}`}${e.years > 0 ? ` (${e.years})` : ''}`

function EventLine({ e }) {
  const birthday = e.type === 'birthday'
  return (
    <Link to={e.to} className="cal-event">
      <span className={`cal-event-icon ${birthday ? 'is-birthday' : 'is-special'}`}>
        <Icon name={birthday ? 'gift' : 'heart'} size={18} stroke={2.2} filled={!birthday} />
      </span>
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
      <Avatar name={e.name} src={e.photo} size={36} />
      <span className="row-text">
        <strong>{title(e)}</strong>
        <small className="muted">{e.days === 0 ? '¡Es hoy!' : e.days === 1 ? 'Mañana' : `En ${e.days} días`}</small>
      </span>
      <Icon name={e.type === 'birthday' ? 'gift' : 'heart'} size={18} className="coral" />
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

/** Calendario: el mes con tus fechas marcadas y la lista de las próximas. */
export default function CalendarPage() {
  const { user } = useAuth()
  const { data: people, setData: setPeople, loading, error } = useApi('/api/people')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(null)   // Date del día tocado
  const [sheetDay, setSheetDay] = useState(null)   // día cuyo panel está abierto
  const [filter, setFilter] = useState('all')
  const [showAll, setShowAll] = useState(false)
  const touch = useRef(null)

  const all = buildEvents(user, people)
  const events = filter === 'all' ? all : all.filter((e) => e.type === filter)

  const y = month.getFullYear()
  const m = month.getMonth()
  const isCurrentMonth = y === today.getFullYear() && m === today.getMonth()

  // Eventos del mes que se ve, por día
  const byDay = {}
  for (const e of events) {
    const at = inYear(e, y)
    if (at && at.date.getMonth() === m) (byDay[at.date.getDate()] ||= []).push(at)
  }

  // Todas, de la más cercana a la más lejana
  const upcoming = events.map((e) => {
    const next = nextOccurrence(e.iso)
    return { ...e, date: next.date, days: next.days, years: next.years }
  }).sort((a, b) => a.days - b.days)

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
  // Lo anotado ese día, sin el filtro: el panel enseña todo lo que hay
  const sheetEvents = sheetDay
    ? all.map((e) => inYear(e, sheetDay.getFullYear())).filter((e) => e && sameDay(e.date, sheetDay))
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

  const noDates = people && !all.length
  return (
    <AppShell>
      <PageHead title="Calendario" className={noDates || !people ? '' : 'page-head-hero'}
        action={!noDates && people && <FilterMenu value={filter} onChange={changeFilter} />}>
        <p className="muted">Tus fechas importantes, en un solo lugar.</p>
      </PageHead>
      <ErrorBox error={error} />
      {loading && <Spinner />}
      {noDates && (
        <EmptyState icon="calendar" title="Sin fechas todavía"
          text="Añade el cumpleaños o un aniversario a tus personas y aparecerán aquí."
          action={<Link to="/personas" className="btn btn-primary">Ir a tus personas</Link>} />
      )}

      {people && !noDates && (
        <>
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
                const kind = evs.some((e) => e.type === 'birthday') ? 'birthday' : evs.length ? 'special' : ''
                const isToday = sameDay(date, today)
                const isSel = selected && sameDay(date, selected)
                const cls = `cal-day ${kind ? `has-${kind}` : ''} ${isToday ? 'today' : ''} ${isSel ? 'selected' : ''}`
                // Todos los días se pueden tocar: abren su panel (también los que no tienen nada)
                const name = `${d} de ${MONTHS[m].toLowerCase()}`
                return (
                  <button key={dayKey(date)} type="button" className={cls} onClick={() => pick(date)} aria-pressed={!!isSel}
                    aria-haspopup="dialog" aria-current={isToday ? 'date' : undefined}
                    aria-label={evs.length ? `${name}: ${evs.map(title).join(', ')}` : name}>
                    <span>{d}</span>
                  </button>
                )
              })}
            </div>
          </section>

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
        </>
      )}

      {sheetDay && (
        <DaySheet date={sheetDay} events={sheetEvents} people={people || []} today={today} title={title}
          onClose={() => setSheetDay(null)}
          onPersonSaved={(p) => setPeople((list) => list.map((x) => (x.id === p.id ? p : x)))} />
      )}

      <div className="soon-card">
        <Icon name="sparkle" size={18} /> Pronto: eventos, citas, viajes y recordatorios.
      </div>
    </AppShell>
  )
}
