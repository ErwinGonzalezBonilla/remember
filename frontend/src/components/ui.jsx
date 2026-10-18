import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { mediaUrl } from '../api/client'
import Icon from './Icon'

/* ---------- Helpers ---------- */
export const RELATIONS = {
  pareja: 'Pareja', 'hijo/a': 'Hijo/a', 'padre/madre': 'Padre/Madre', 'hermano/a': 'Hermano/a',
  'abuelo/a': 'Abuelo/a', familia: 'Familia', amistad: 'Amistad', 'compañero/a': 'Compañero/a', otro: 'Otro',
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Las fechas "YYYY-MM-DD" se parsean en local (no en UTC) para que no cambie el día.
export function parseDay(iso) {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDate(iso, { year = true } = {}) {
  const d = iso instanceof Date ? iso : iso?.length > 10 ? new Date(iso) : parseDay(iso)
  if (!d) return ''
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year ? ` ${d.getFullYear()}` : ''}`
}

export function timeTogether(iso) {
  const start = parseDay(iso)
  if (!start) return null
  const now = new Date()
  let years = now.getFullYear() - start.getFullYear()
  let months = now.getMonth() - start.getMonth()
  if (now.getDate() < start.getDate()) months -= 1
  if (months < 0) { years -= 1; months += 12 }
  if (years > 0) return `${years} ${years === 1 ? 'año' : 'años'} juntos`
  if (months > 0) return `${months} ${months === 1 ? 'mes' : 'meses'}`
  return 'Desde este mes'
}

export function nextOccurrence(iso) {
  const d = parseDay(iso)
  if (!d) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const next = new Date(today.getFullYear(), d.getMonth(), d.getDate())
  if (next < today) next.setFullYear(today.getFullYear() + 1)
  return { date: next, days: Math.round((next - today) / 86400000), years: next.getFullYear() - d.getFullYear() }
}

export function greeting() {
  const h = new Date().getHours()
  return h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
}

/* ---------- Componentes ---------- */
export function Avatar({ name = '?', src, size = 44 }) {
  const url = mediaUrl(src)
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {url ? <img src={url} alt="" /> : name.trim().charAt(0).toUpperCase()}
    </div>
  )
}

export function PasswordInput({ id, value, onChange, autoComplete = 'current-password', placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div className="input-wrap">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange}
        autoComplete={autoComplete} placeholder={placeholder} required />
      <button type="button" className="input-icon" onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
        <Icon name={show ? 'eyeOff' : 'eye'} size={20} />
      </button>
    </div>
  )
}

export function Field({ label, hint, htmlFor, children }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </div>
  )
}

export function ErrorBox({ error }) {
  if (!error) return null
  return <div className="alert alert-error" role="alert">{error}</div>
}

export function Spinner({ label = 'Cargando…' }) {
  return <div className="spinner-wrap" role="status"><span className="spinner" /><span>{label}</span></div>
}

export function EmptyState({ icon = 'heart', title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={28} /></div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

export function TopBar({ title, back = true, right }) {
  const navigate = useNavigate()
  return (
    <header className="topbar">
      {back ? (
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Volver">
          <Icon name="back" />
        </button>
      ) : <span />}
      <h1>{title}</h1>
      {right || <span />}
    </header>
  )
}

export function PrivateBadge({ text = 'Solo tú y las personas que invitas' }) {
  return (
    <div className="private-badge">
      <Icon name="shield" size={16} /> <strong>Espacio privado</strong> · {text}
    </div>
  )
}

export function ListRow({ to, icon, title, subtitle, onClick, danger }) {
  const content = (
    <>
      <span className={`row-icon ${danger ? 'danger' : ''}`}><Icon name={icon} size={20} /></span>
      <span className="row-text"><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</span>
      <Icon name="chevron" size={18} className="muted" />
    </>
  )
  return to
    ? <Link to={to} className="list-row">{content}</Link>
    : <button type="button" className="list-row" onClick={onClick}>{content}</button>
}

const NAV = [
  { to: '/', icon: 'heart', label: 'Inicio', end: true },
  { to: '/personas', icon: 'users', label: 'Personas' },
  { to: '/calendario', icon: 'calendar', label: 'Calendario' },
  { to: '/ajustes', icon: 'gear', label: 'Ajustes' },
]

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          <Icon name={n.icon} size={22} />
          <span>{n.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export function AppShell({ children, nav = true }) {
  return (
    <div className="app-shell">
      <main className="screen">{children}</main>
      {nav && <BottomNav />}
    </div>
  )
}
