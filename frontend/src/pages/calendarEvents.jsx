import Icon from '../components/Icon'
import { parseDay } from '../components/ui'
import { statusText } from './capsules/capsuleUtils'

/*
 * Lo que sale en el calendario:
 *  - cada año: cumpleaños y fechas especiales (de tus personas y tu cumpleaños);
 *  - un día concreto: las cápsulas (el día en que se abren) y los recuerdos (el día en que ocurrieron).
 * Solo lo que ya ves en la app: las cápsulas recibidas cerradas llegan sin contenido desde el servidor,
 * y aquí solo se usa su título, quién la envió y su estado.
 */

export const TYPE_ORDER = ['birthday', 'special', 'capsule', 'memory']
const MEMORY_ICON = { photo: 'camera', video: 'video', audio: 'mic', text: 'note' }
const MEMORY_KIND = { photo: 'Foto', video: 'Video', audio: 'Audio', text: 'Nota' }

/** Cumpleaños y fechas especiales (sin año: se repiten cada año). */
export function buildYearly(user, people) {
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

/** Cápsulas (enviadas y recibidas) y recuerdos con fecha: cada uno en su día. */
export function buildDated(capsules, memories, me) {
  const events = []
  for (const c of [...(capsules?.received || []), ...(capsules?.sent || [])]) {
    const d = new Date(c.open_at)
    const who = c.is_author ? (c.person ? `Para ${c.person.name}` : 'Sin destinatario') : `De ${c.author_name}`
    events.push({
      key: `c${c.id}`, type: 'capsule', status: c.status, label: 'Cápsula', name: c.title, to: `/capsula/${c.id}`,
      date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
      detail: `${who} · ${statusText(c)}`,
      who: c.is_author ? c.person?.name || c.title : c.author_name,
      photo: c.is_author ? c.person?.photo_url : c.author_avatar,
    })
  }
  for (const m of memories || []) {
    if (!m.happened_on) continue
    events.push({
      key: `m${m.id}`, type: 'memory', kind: m.kind, label: 'Recuerdo', name: m.title, to: `/recuerdo/${m.id}`,
      date: parseDay(m.happened_on),
      detail: [MEMORY_KIND[m.kind], m.author_id !== me?.id && `guardado por ${m.author_name}`].filter(Boolean).join(' · '),
      who: m.title,
    })
  }
  return events
}

/** El evento en un año concreto: fecha de ese año y años que cumple (o que hace). Null si no cae (29 feb). */
export function inYear(e, year) {
  if (e.date && !e.iso) return e.date.getFullYear() === year ? e : null   // los de un día concreto
  const d = parseDay(e.iso)
  const date = new Date(year, d.getMonth(), d.getDate())
  if (date.getMonth() !== d.getMonth()) return null
  return { ...e, date, years: year - d.getFullYear() }
}

/** "Cumpleaños · Yetha (34)" · "Tu cumpleaños (35)" · "Cápsula · Para tus 18" · "Recuerdo · La playa" */
export const title = (e) => `${e.me ? e.label : `${e.label} · ${e.name}`}${e.years > 0 ? ` (${e.years})` : ''}`

/** Icono redondo de cada tipo, con el estado de la cápsula (candado, regalo abierto o borrador). */
export function EventIcon({ e }) {
  let name = 'heart'
  if (e.type === 'birthday') name = 'gift'
  else if (e.type === 'capsule') name = e.status === 'open' ? 'gift' : e.status === 'sealed' ? 'lock' : 'edit'
  else if (e.type === 'memory') name = MEMORY_ICON[e.kind] || 'image'
  const cls = e.type === 'capsule' ? `is-capsule ${e.status}` : `is-${e.type}`
  return (
    <span className={`cal-event-icon ${cls}`}>
      <Icon name={name} size={18} stroke={2.2} filled={e.type === 'special'} />
    </span>
  )
}
