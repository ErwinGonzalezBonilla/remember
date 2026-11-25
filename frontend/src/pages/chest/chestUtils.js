import { nextOccurrence, parseDay } from '../../components/ui'
import { isoDay } from '../DaySheet'

const DAY_MS = 86400000
/** A partir de cuántos días sin guardar nada se sugiere guardar un recuerdo. */
export const QUIET_DAYS = 7
/** Cumpleaños y fechas especiales que se sugieren: los de los próximos dos meses. */
const SOON_DAYS = 60

export const firstName = (name = '') => name.split(' ')[0]
/** Día del recuerdo: cuándo ocurrió o, si no se sabe, cuándo se guardó. */
export const memoryDate = (m) => (m.happened_on ? parseDay(m.happened_on) : new Date(m.created_at))
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const inDays = (n) => (n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`)

/** Momentos destacados: hitos y recuerdos marcados con estrella, del más reciente al más antiguo. */
export const highlights = (memories = []) => memories.filter((m) => m.milestone || m.starred)

/**
 * Sugerencias del cofre, calculadas en el móvil con lo que ya se ve (sin IA):
 * próximas fechas de la persona (→ crear una cápsula), "un día como hoy" y cuánto hace que no guardáis nada.
 */
export function recommendations(person, memories = [], now = new Date()) {
  const today = startOfDay(now)
  const name = firstName(person.name)
  const out = []

  const dates = [
    person.birth_date && { key: 'birthday', iso: person.birth_date, label: `Cumpleaños de ${name}`, icon: 'cake' },
    person.special_date && { key: 'special', iso: person.special_date, label: person.special_label || 'Vuestra fecha especial', icon: 'heart' },
  ].filter(Boolean)
  for (const d of dates) {
    const next = nextOccurrence(d.iso)
    if (next.days > SOON_DAYS) continue
    const years = next.years > 0 ? (d.key === 'birthday' ? ` · cumple ${next.years}` : ` · ${next.years} ${next.years === 1 ? 'año' : 'años'}`) : ''
    out.push({
      key: d.key, icon: d.icon, tone: 'capsule',
      title: `${d.label} ${inDays(next.days)}${years}`,
      text: 'Prepara una cápsula que se abra ese día.',
      to: `/capsulas/nueva?persona=${person.id}&fecha=${isoDay(next.date)}`, cta: 'Crear cápsula',
    })
  }

  for (const m of memories) {
    const d = memoryDate(m)
    if (d.getMonth() !== today.getMonth() || d.getDate() !== today.getDate() || d.getFullYear() >= today.getFullYear()) continue
    const years = today.getFullYear() - d.getFullYear()
    out.push({
      key: `otd-${m.id}`, icon: 'sparkle', tone: 'memory',
      title: `Un día como hoy, hace ${years} ${years === 1 ? 'año' : 'años'}`, text: m.title,
      to: `/recuerdo/${m.id}`, cta: 'Ver recuerdo',
    })
  }

  const last = memories.reduce((max, m) => Math.max(max, new Date(m.created_at).getTime()), 0)
  const quiet = last ? Math.floor((today - startOfDay(last)) / DAY_MS) : null
  if (quiet === null || quiet >= QUIET_DAYS) {
    out.push({
      key: 'quiet', icon: 'camera', tone: 'new',
      title: quiet === null ? `Aún no habéis guardado ningún recuerdo` : `Hace ${quiet} días que no guardáis un recuerdo`,
      text: `Una foto, un audio o unas palabras para ${name}.`,
      to: `/recuerdos/nuevo?persona=${person.id}`, cta: 'Nuevo recuerdo',
    })
  }
  return out
}
