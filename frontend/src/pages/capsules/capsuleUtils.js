import { useEffect, useState } from 'react'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
  'octubre', 'noviembre', 'diciembre']

export const KIND_NAMES = { photo: ['foto', 'fotos'], video: ['video', 'videos'], audio: ['audio', 'audios'] }

/** "3 fotos · 1 audio" */
export function countsText(counts = {}) {
  return Object.entries(counts).map(([k, n]) => `${n} ${KIND_NAMES[k]?.[n === 1 ? 0 : 1] || k}`).join(' · ')
}

/** "14 de febrero de 2027 a las 09:00" en la hora de quien lo mira. */
export function openDateText(iso) {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()} a las ${hh}:${mm}`
}

/** "17 de noviembre de 2027 a las 9:00": la fecha escrita como en una frase. */
export function openPhrase(date) {
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${date.getDate()} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()} a las ${date.getHours()}:${mm}`
}

/**
 * "Lista para abrir": ya llegó su día y la destinataria aún no la ha visto abierta (seen_by_recipient lo guarda
 * el servidor, así que vale en cualquier móvil). Incluye las que llegan a su hora mientras miras la lista.
 */
export function isReady(c, now = Date.now()) {
  if (c.status === 'draft') return false
  return new Date(c.open_at).getTime() <= now && !c.seen_by_recipient
}

/** "17 de noviembre de 2026" */
export function dayText(iso) {
  const d = new Date(iso)
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`
}

export function remaining(iso, now = Date.now()) {
  const ms = Math.max(0, new Date(iso).getTime() - now)
  const s = Math.floor(ms / 1000)
  return { ms, days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 }
}

/** "en 23 días", "en 5 horas", "en 12 minutos" */
export function remainingText(iso) {
  const r = remaining(iso)
  if (r.days >= 2) return `en ${r.days} días`
  if (r.days === 1) return 'mañana'
  if (r.hours >= 1) return `en ${r.hours} ${r.hours === 1 ? 'hora' : 'horas'}`
  if (r.minutes >= 1) return `en ${r.minutes} ${r.minutes === 1 ? 'minuto' : 'minutos'}`
  return 'en unos segundos'
}

/** Cuenta atrás que se actualiza cada segundo; llama a onDone una vez al llegar a cero. */
export function useCountdown(iso, onDone) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!iso) return undefined
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [iso])
  const r = remaining(iso, now)
  useEffect(() => {
    if (iso && r.ms === 0 && onDone) onDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, r.ms === 0])
  return r
}

export function statusText(c) {
  if (c.status === 'draft') return 'Borrador · aún no está sellada'
  if (c.status === 'sealed') return `Sellada · se abre ${remainingText(c.open_at)}`
  return `Abierta el ${openDateText(c.open_at).split(' a las')[0]}`
}
