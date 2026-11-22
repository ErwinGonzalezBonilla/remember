import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import Icon from '../components/Icon'
import { Avatar, ErrorBox, formatDate } from '../components/ui'
import { EventIcon, title } from './calendarEvents'
import { useSheetDrag } from './memories/CommentsSheet'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** "Martes 22 de diciembre de 2026" */
export const longDate = (d) => `${WEEKDAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`
/** "2026-12-22" (fecha local, sin pasar por UTC) */
export const isoDay = (d) => d.toLocaleDateString('sv')

/** Lo que se envía al guardar una persona: el PUT la reemplaza entera, así que van todos sus campos. */
const personBody = (p) => ({
  name: p.name, relation: p.relation, relation_label: p.relation_label, nickname: p.nickname, nickname_emoji: p.nickname_emoji,
  birth_date: p.birth_date, special_date: p.special_date, special_label: p.special_label, note: p.note,
})

/** Anotar un cumpleaños o una fecha especial de una persona en el día tocado. */
function AddDateForm({ date, people, onSaved, onCancel }) {
  const [personId, setPersonId] = useState(null)
  const [type, setType] = useState('birthday')
  const [label, setLabel] = useState('')
  // Para un cumpleaños el año del día tocado no sirve (sería el año en que nació): se pide aparte.
  const [year, setYear] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const person = people.find((p) => p.id === personId)
  const heading = useRef(null)
  useEffect(() => { heading.current?.focus() }, [])   // al abrir el formulario, el foco va a él
  const field = type === 'birthday' ? 'birth_date' : 'special_date'
  const current = person?.[field]

  function changeType(t) {
    setType(t)
    setYear(t === 'birthday' ? '' : String(date.getFullYear()))
    setError('')
  }

  async function save(e) {
    e.preventDefault()
    if (!person) return setError('Elige a qué persona se lo anotas.')
    const y = Number(year)
    if (!Number.isInteger(y) || y < 1900 || y > 2100) {
      return setError(type === 'birthday' ? 'Escribe el año en que nació (por ejemplo, 1990).' : 'Escribe el año (por ejemplo, 2015).')
    }
    const day = new Date(y, date.getMonth(), date.getDate())
    if (day.getMonth() !== date.getMonth()) return setError(`${y} no tiene 29 de febrero. Elige otro año.`)
    const body = { ...personBody(person), [field]: isoDay(day) }
    if (type === 'special') body.special_label = label.trim() || null
    setError('')
    setBusy(true)
    try {
      onSaved(await api(`/api/people/${person.id}`, { method: 'PUT', body }), type)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form className="day-form" onSubmit={save} aria-labelledby="day-form-title">
      <h3 id="day-form-title" className="day-form-title" ref={heading} tabIndex={-1}>Anotar una fecha especial</h3>
      <div className="recipient-row" role="radiogroup" aria-label="¿De quién es?">
        {people.map((p) => {
          const on = p.id === personId
          return (
            <button type="button" key={p.id} role="radio" aria-checked={on} className={`recipient ${on ? 'on' : ''}`}
              onClick={() => { setPersonId(p.id); setError('') }} aria-label={p.name}>
              <span className="recipient-face">
                <Avatar name={p.name} src={p.photo_url} size={50} />
                {on && <span className="recipient-check"><Icon name="check" size={13} /></span>}
              </span>
              <span className="recipient-name">{p.name.split(' ')[0]}</span>
            </button>
          )
        })}
      </div>

      <div className="chips" role="radiogroup" aria-label="Tipo de fecha">
        {[['birthday', 'Cumpleaños'], ['special', 'Fecha especial']].map(([t, text]) => (
          <button key={t} type="button" role="radio" aria-checked={type === t} className={`chip ${type === t ? 'active' : ''}`}
            onClick={() => changeType(t)}>{text}</button>
        ))}
      </div>

      <div className={type === 'special' ? 'day-form-row' : ''}>
        {type === 'special' && (
          <div className="field">
            <label htmlFor="day-label">Nombre</label>
            <input id="day-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Aniversario" />
          </div>
        )}
        <div className="field">
          <label htmlFor="day-year">{type === 'birthday' ? 'Año en que nació' : 'Año'}</label>
          <input id="day-year" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={year} required
            onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} placeholder={type === 'birthday' ? '1990' : String(date.getFullYear())}
            aria-describedby="day-year-hint" />
        </div>
      </div>
      <small id="day-year-hint" className="hint">
        Se repetirá cada {date.getDate()} de {MONTHS[date.getMonth()]}{type === 'birthday' ? '; con el año sabremos cuántos cumple' : ''}.
      </small>

      {current && (
        <p className="day-replace" role="status">
          <Icon name="refresh" size={16} />
          <span>
            {person.name.split(' ')[0]} ya tiene {type === 'birthday' ? 'su cumpleaños' : <>una fecha especial{person.special_label ? <> (“{person.special_label}”)</> : ''}</>} el{' '}
            <b>{formatDate(current)}</b>. Si guardas, se reemplazará por esta.
          </span>
        </p>
      )}
      <ErrorBox error={error} />
      <div className="row-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : current ? 'Reemplazar fecha' : 'Guardar fecha'}</button>
      </div>
    </form>
  )
}

/**
 * Panel de un día del calendario: lo que hay anotado y qué se puede hacer ese día.
 * `events`: los del día (cumpleaños y fechas especiales), ya con `date` y `years` de ese año.
 */
export default function DaySheet({ date, events, people, today, onClose, onPersonSaved }) {
  const [adding, setAdding] = useState(false)
  const [saved, setSaved] = useState('')
  const sheet = useRef(null)
  const { dy, handlers } = useSheetDrag(onClose)
  const iso = isoDay(date)
  const canCapsule = date >= today          // hoy o un día futuro
  const canMemory = date <= today           // hoy o un día pasado

  // Al abrir, el foco entra en el panel; al cerrar vuelve a donde estaba (el día tocado).
  useEffect(() => {
    const before = document.activeElement
    sheet.current?.querySelector('h2')?.focus()
    const html = document.documentElement
    const prev = html.style.overflow
    html.style.overflow = 'hidden'   // que no se mueva el calendario por detrás
    return () => { html.style.overflow = prev; before?.focus?.() }
  }, [])

  // Escape cierra; Tab no se sale del panel mientras está abierto.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab' || !sheet.current) return
      const items = [...sheet.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || !sheet.current.contains(document.activeElement))) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Al cerrar el formulario, el foco vuelve al título del panel (si no, se perdería)
  const focusTitle = () => requestAnimationFrame(() => sheet.current?.querySelector('h2')?.focus())

  function onSaved(person, type) {
    onPersonSaved(person)
    setAdding(false)
    focusTitle()
    setSaved(`Anotado: ${type === 'birthday' ? 'cumpleaños' : (person.special_label || 'fecha especial').toLowerCase()} de ${person.name.split(' ')[0]}.`)
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <section ref={sheet} className="sheet day-sheet glass glass-thick" role="dialog" aria-modal="true" aria-labelledby="day-title"
        style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}>
        <div className="sheet-grab" {...handlers}>
          <span className="sheet-handle" aria-hidden="true" />
        </div>
        <div className="sheet-body">
          <header className="day-head">
            <h2 id="day-title" className="sheet-title" tabIndex={-1}>{longDate(date)}</h2>
            <button type="button" className="icon-btn day-close" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={20} /></button>
          </header>

          {events.length ? (
            <ul className="day-events" aria-label="Anotado este día">
              {events.map((e) => (
                <li key={e.key}>
                  {/* Cápsulas: título, quién y su estado (de las recibidas cerradas no se sabe nada más) */}
                  <Link to={e.to} className="day-event">
                    <EventIcon e={e} />
                    <span className="day-event-text">
                      <strong>{title(e)}</strong>
                      {e.detail && <small>{e.detail}</small>}
                    </span>
                    <Icon name="chevron" size={16} className="cal-event-go" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="muted day-none">Nada anotado este día</p>}
          {saved && <p className="alert alert-ok" role="status">{saved}</p>}

          {!adding && (
            <div className="day-actions">
              {canCapsule && (
                <Link to={`/capsulas/nueva?fecha=${iso}`} className="day-action">
                  <span className="day-action-icon is-capsule"><Icon name="lock" size={20} /></span>
                  <span>Crear una cápsula que se abra este día</span>
                </Link>
              )}
              {canMemory && (
                <Link to={`/recuerdos/nuevo?fecha=${iso}`} className="day-action">
                  <span className="day-action-icon is-memory"><Icon name="camera" size={20} /></span>
                  <span>Guardar un recuerdo de este día</span>
                </Link>
              )}
              {people.length > 0 ? (
                <button type="button" className="day-action" onClick={() => { setAdding(true); setSaved('') }}>
                  <span className="day-action-icon is-date"><Icon name="cake" size={20} /></span>
                  <span>Anotar una fecha especial</span>
                </button>
              ) : (
                <Link to="/personas/nueva" className="day-action">
                  <span className="day-action-icon is-date"><Icon name="cake" size={20} /></span>
                  <span>Para anotar una fecha, primero añade a una persona</span>
                </Link>
              )}
            </div>
          )}
          {adding && <AddDateForm date={date} people={people} onSaved={onSaved} onCancel={() => { setAdding(false); focusTitle() }} />}
        </div>
      </section>
    </>
  )
}
