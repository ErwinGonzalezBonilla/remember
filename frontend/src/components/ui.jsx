import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { mediaUrl } from '../api/client'
import { useApi } from '../hooks'
import Icon from './Icon'

/* ---------- Helpers ---------- */
export const RELATIONS = {
  pareja: 'Pareja', 'hijo/a': 'Hijo/a', 'padre/madre': 'Padre/Madre', 'hermano/a': 'Hermano/a',
  'abuelo/a': 'Abuelo/a', familia: 'Familia', amistad: 'Amistad', 'compañero/a': 'Compañero/a', otro: 'Otro',
}

/** Cómo se muestra quién es una persona: el texto libre si eligió "Otro" (primo, mejor amigo…). */
export function relationText(p) {
  return (p?.relation === 'otro' && p.relation_label) || RELATIONS[p?.relation] || p?.relation || ''
}

/* ---------- Familia (perfil) ---------- */
export const RELATIONSHIP = [
  ['soltero', 'Soltero/a'], ['relacion', 'En una relación'], ['comprometido', 'Comprometido/a'], ['casado', 'Casado/a'],
]
export const FAMILY_GROUPS = [
  ['parents', 'Padres', 'Rosa, José…', 4], ['siblings', 'Hermanos', 'Laura, Diego…', 15], ['children', 'Hijos', 'Allison…', 15],
]

/** "Tiene una relación con Anabel", "Casado/a con Anabel"… */
export function relationshipText(status, partner) {
  if (!status) return ''
  if (status === 'soltero') return 'Soltero/a'
  const base = { relacion: 'Tiene una relación', comprometido: 'Comprometido/a', casado: 'Casado/a' }[status]
  return partner ? `${base} con ${partner}` : base
}
export const relationshipBase = (status) =>
  ({ soltero: 'Soltero/a', relacion: 'Tiene una relación', comprometido: 'Comprometido/a', casado: 'Casado/a' })[status] || ''

// Qué personas de tu lista se sugieren en cada parte de tu familia
export const FAMILY_RELATION = { partner: ['pareja'], parents: ['padre/madre'], siblings: ['hermano/a'], children: ['hijo/a'] }

const norm = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
/** Busca en tu lista una persona con ese nombre (o cuyo nombre empiece igual: "Anabel" → "Anabel Ruiz"). */
export function matchPerson(name, people = []) {
  const n = norm(name)
  if (!n) return null
  return people.find((p) => norm(p.name) === n) || people.find((p) => norm(p.name).split(' ')[0] === n) || null
}

/** Lista de familiares: nombre escrito o elegido de tus personas (entonces enlaza a su cofre). */
export function NameList({ id, value, onChange, placeholder, max, people = [], relations = [] }) {
  const [draft, setDraft] = useState('')
  const taken = (name, pid) => value.some((v) => (pid && v.person_id === pid) || norm(v.name) === norm(name))
  const push = (member) => {
    if (value.length >= max || taken(member.name, member.person_id)) return
    onChange([...value, member])
  }
  const add = () => {
    const name = draft.trim()
    if (name) push({ name, person_id: matchPerson(name, people)?.id ?? null })
    setDraft('')
  }
  const suggestions = people.filter((p) => relations.includes(p.relation) && !taken(p.name, p.id))
  return (
    <div className="name-list">
      {value.length > 0 && (
        <div className="chips">
          {value.map((m) => (
            <span key={m.person_id ?? m.name} className="chip active name-chip">
              {m.person_id && <span aria-label="Enlazado a su cofre" title="Enlazado a su cofre">🔗</span>}
              {m.name}
              <button type="button" aria-label={`Quitar a ${m.name}`} onClick={() => onChange(value.filter((v) => v !== m))}>×</button>
            </span>
          ))}
        </div>
      )}
      {value.length < max && (
        <>
          <div className="name-add">
            <input id={id} value={draft} maxLength={60} placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
              onBlur={add} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={add} disabled={!draft.trim()}>Añadir</button>
          </div>
          {suggestions.length > 0 && <PeopleSuggest people={suggestions} onPick={(p) => push({ name: p.name, person_id: p.id })} />}
        </>
      )}
    </div>
  )
}

/** "De tus personas: + Anabel + Rosa" */
export function PeopleSuggest({ people, onPick }) {
  return (
    <div className="people-suggest">
      <small className="muted">De tus personas:</small>
      {people.map((p) => (
        <button type="button" key={p.id} className="chip suggest-chip" onClick={() => onPick(p)}>
          <Avatar name={p.name} src={p.photo_url} size={22} /> {p.name}
        </button>
      ))}
    </div>
  )
}

/** Nombre de un familiar en "Sobre…": enlace a tu cofre de esa persona, "tú", o solo el nombre. */
export function FamilyName({ member }) {
  if (member.is_you) return <b className="family-you">tú 💛</b>
  if (member.person_id) return <Link to={`/personas/${member.person_id}`} className="family-link">{member.name}</Link>
  return <>{member.name}</>
}

/* ---------- Apodos ---------- */
export const NICK_EMOJIS = ['😂', '🥰', '😎', '🤗', '😜', '👑', '🐻', '❤️']

// Emoji sugerido según el apodo (el usuario siempre puede elegir otro).
const NICK_RULES = [
  [/oso|osit/, '🐻'], [/gat|michi/, '🐱'], [/perr|cachorr/, '🐶'], [/conej/, '🐰'], [/pollit|pollo/, '🐥'],
  [/mono|monit|chango/, '🐵'], [/raton|ratita/, '🐭'], [/pulg|hormig/, '🐜'], [/leon/, '🦁'], [/tigr/, '🐯'],
  [/princes|rein|rey\b|reyna|king|queen/, '👑'],
  [/amor|cari|cielo|vida|beb|corazon|tesoro|precios|mi luz|cuchi|chiqui|nen[ae]/, '🥰'],
  [/dulce|chocol|galle|caramel|azuc|miel|bombon|cupcake|gomit/, '🍬'],
  [/estrell|luna|sol\b|solecit/, '🌟'], [/jef|crack|idol|campe|capo|boss|maestr|genio/, '😎'],
  [/loc[oa]|travies|diabl|pill[oa]|terremot|torment/, '😜'],
  [/orej|cabez|nariz|pelon|gord|flac|enan|pat[oa]|fe[oa]\b|chimuel|calv|chato|cachet|pansh|panz|negr|guer|chin[oa]|tap[oa]n/, '😂'],
]
export function suggestEmoji(nickname = '') {
  const n = nickname.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (!n.trim()) return ''
  return NICK_RULES.find(([re]) => re.test(n))?.[1] || '😄'
}

/** "Erwin dice que eres su primo y te apoda «el Orejón» 😂" */
export function seenAsText(seen) {
  if (!seen) return ''
  const first = seen.name.split(' ')[0]
  const rel = relationText(seen)
  const parts = []
  if (rel && !(seen.relation === 'otro' && !seen.relation_label)) parts.push(`dice que eres su ${rel.toLowerCase()}`)
  if (seen.nickname) parts.push(`te apoda «${seen.nickname}»${seen.nickname_emoji ? ` ${seen.nickname_emoji}` : ''}`)
  return parts.length ? `${first} ${parts.join(' y ')}` : ''
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

const CREATE = [
  { kind: 'photo', icon: 'camera', label: 'Foto', text: 'Del carrete o la cámara' },
  { kind: 'video', icon: 'video', label: 'Video', text: 'Un momento en movimiento' },
  { kind: 'audio', icon: 'mic', label: 'Audio', text: 'Graba tu voz o sube un audio' },
  { kind: 'text', icon: 'note', label: 'Carta', text: 'Escribe lo que quieres que quede' },
]

function NavItem({ to, icon, label, end, dot }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
      <span className="nav-icon">
        <Icon name={icon} size={22} />
        {dot > 0 && <span className="nav-dot" aria-label={`${dot} avisos`} />}
      </span>
      <span>{label}</span>
    </NavLink>
  )
}

export function BottomNav() {
  const { data: requests } = useApi('/api/connect/requests')
  const pending = (requests?.incoming.length || 0) + (requests?.opened.length || 0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const [first, second, ...rest] = NAV
  return (
    <>
      {open && (
        <div className="create-backdrop" onClick={() => setOpen(false)}>
          <div className="create-sheet" role="dialog" aria-modal="true" aria-labelledby="create-title" onClick={(e) => e.stopPropagation()}>
            <span className="sheet-handle" aria-hidden="true" />
            <h2 id="create-title">Guarda un recuerdo</h2>
            <div className="create-grid">
              {CREATE.map((c) => (
                <Link key={c.kind} to={`/recuerdos/nuevo?tipo=${c.kind}`} onClick={() => setOpen(false)}>
                  <span className="create-icon"><Icon name={c.icon} /></span>
                  <strong>{c.label}</strong>
                  <small>{c.text}</small>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
      <nav className="bottom-nav" aria-label="Navegación principal">
        <NavItem {...first} />
        <NavItem {...second} dot={pending} />
        <button type="button" className={`nav-create ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Cerrar' : 'Guardar un recuerdo'} aria-expanded={open}>
          <span><Icon name="plus" size={26} /></span>
        </button>
        {rest.map((n) => <NavItem key={n.to} {...n} />)}
      </nav>
    </>
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
