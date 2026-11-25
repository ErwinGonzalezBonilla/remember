import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, mediaUrl } from '../../api/client'
import BottomSheet from '../../components/BottomSheet'
import Icon from '../../components/Icon'
import VoiceRecorder, { canRecord } from '../memories/VoiceRecorder'
import { relationText, AppShell, Avatar, ErrorBox, Field, Spinner, TopBar } from '../../components/ui'
import { useApi } from '../../hooks'
import { AUDIO_ACCEPT, LIMITS_MB, compressImage, kindOf, progressText, tooBig, uploadFile, videoPoster, withMime } from '../../media'
import { countsText, openDateText, openPhrase } from './capsuleUtils'

const MAX_ITEMS = 10
const localTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid' } catch { return 'Europe/Madrid' } }

/** Día por defecto: el que llega en ?fecha=AAAA-MM-DD (desde el calendario) si es hoy o futuro; si no, dentro de un año. */
function defaultDate(fecha) {
  const today = new Date().toLocaleDateString('sv')
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') && fecha >= today) return fecha
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toLocaleDateString('sv')
}

function FilePreview({ kind, url, poster }) {
  if (kind === 'photo' || (kind === 'video' && poster)) return <img src={poster || url} alt="" />
  if (kind === 'video') return <video src={url} muted playsInline />
  return <span className="file-audio"><Icon name="mic" size={22} /></span>
}

/** Miniatura de un video (opcional): si falla, el video se guarda sin ella. */
async function uploadPoster(file) {
  try {
    const poster = await videoPoster(file)
    return poster ? await uploadFile(poster, 'photo') : null
  } catch {
    return null
  }
}

/** Ilustración de un regalo con los colores de la marca. */
function GiftArt() {
  return (
    <svg className="gift-art" viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="52" r="40" className="gift-art-bg" />
      <path d="M16 22l3 3M80 20l-3 4M86 46h-5M10 50h5" stroke="var(--coral)" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="24" y="46" width="48" height="34" rx="6" fill="var(--petrol)" />
      <rect x="20" y="35" width="56" height="13" rx="5" fill="#0B6676" />
      <rect x="44" y="35" width="8" height="45" fill="var(--coral)" />
      <path d="M48 35c-4-9-15-12-16-5-1 5 8 6 16 5Zm0 0c4-9 15-12 16-5 1 5-8 6-16 5Z" fill="var(--coral)" />
      <path d="M30 58h8M30 64h5" stroke="var(--sky)" strokeWidth="2" strokeLinecap="round" opacity=".7" />
    </svg>
  )
}

export default function CapsuleForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { data: people } = useApi('/api/people')
  const { data: existing, error: loadError } = useApi(id ? `/api/capsules/${id}` : null)
  const [form, setForm] = useState({
    title: '', message: '', person_id: params.get('persona') ? Number(params.get('persona')) : null,
    date: defaultDate(params.get('fecha')), time: '09:00',
  })
  const [items, setItems] = useState([])        // ya subidos
  const [pending, setPending] = useState([])    // { file, kind, url } por subir
  const [audioSheet, setAudioSheet] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [showWhen, setShowWhen] = useState(false)   // el día y la hora, al tocar la frase
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    if (!existing) return
    if (!existing.is_author || existing.status !== 'draft') { navigate(`/capsula/${existing.id}`, { replace: true }); return }
    const d = new Date(existing.open_at)
    setForm({
      title: existing.title, message: existing.message || '', person_id: existing.person?.id ?? null,
      date: d.toLocaleDateString('sv'), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    })
    setItems(existing.items)
  }, [existing, navigate])

  // Libera las vistas previas al salir de la pantalla.
  // La carta empieza con unos 5 renglones y crece al escribir (también al abrir un borrador largo).
  const letterRef = useRef(null)
  useLayoutEffect(() => {
    const el = letterRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [form.message, existing])

  const pendingRef = useRef(pending)
  pendingRef.current = pending
  useEffect(() => () => pendingRef.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  async function pick(fileList) {
    setError('')
    const room = MAX_ITEMS - items.length - pending.length
    const files = [...fileList].slice(0, Math.max(0, room))
    if (fileList.length > files.length) setError(`Una cápsula puede tener como máximo ${MAX_ITEMS} archivos.`)
    const added = []
    for (const raw of files) {
      const f = await compressImage(withMime(raw))
      const big = tooBig(f)
      if (big) { setError(big); continue }
      added.push({ file: f, kind: kindOf(f), url: URL.createObjectURL(f) })
    }
    setPending((p) => [...p, ...added])
  }

  const openAt = new Date(`${form.date}T${form.time || '00:00'}`)
  const person = people?.find((p) => p.id === form.person_id)

  function validate(sealing) {
    if (!form.title.trim()) return 'Dale un título a tu cápsula.'
    if (!form.person_id) return 'Elige para quién es la cápsula.'
    if (Number.isNaN(openAt.getTime())) return 'Elige el día y la hora en que se abrirá.'
    if (openAt <= new Date()) return 'La fecha de apertura tiene que ser en el futuro.'
    if (sealing && !form.message.trim() && !items.length && !pending.length) {
      return 'Escribe un mensaje o añade al menos una foto, video o audio.'
    }
    return ''
  }

  async function save(sealing) {
    const problem = validate(sealing)
    if (problem) return setError(problem)
    if (sealing && !confirm(`¿Sellar la cápsula? Ya no podrás cambiarla y ${person?.name || 'la persona'} solo podrá abrirla el ${openDateText(openAt.toISOString())}.`)) return
    setError('')
    const body = { title: form.title, message: form.message || null, person_id: form.person_id,
      open_at: openAt.toISOString(), timezone: localTz() }
    let capsuleId = id
    try {
      setBusy('Guardando…')
      const saved = id
        ? await api(`/api/capsules/${id}`, { method: 'PUT', body })
        : await api('/api/capsules', { method: 'POST', body })
      capsuleId = saved.id
      // Uno por uno, directos al almacén; aquí solo se envía la clave de cada archivo
      for (let i = 0; i < pending.length; i += 1) {
        const { kind, file } = pending[i]
        const step = pending.length > 1 ? ` (${i + 1} de ${pending.length})` : ''
        setBusy(progressText(kind) + step)
        const key = await uploadFile(file, kind, (pct) => setBusy(progressText(kind, pct) + step))
        const fd = new FormData()
        fd.append('kind', kind)
        fd.append('media_key', key)
        const poster = kind === 'video' && await uploadPoster(file)
        if (poster) fd.append('poster_key', poster)
        const after = await api(`/api/capsules/${capsuleId}/items`, { method: 'POST', form: fd })
        setItems(after.items)
        setPending((p) => p.slice(1))
      }
      if (sealing) {
        setBusy('Sellando…')
        await api(`/api/capsules/${capsuleId}/seal`, { method: 'POST' })
      }
      navigate(`/capsula/${capsuleId}`, { replace: true, state: { sealed: sealing } })
    } catch (err) {
      setError(err.message)
      setBusy('')
      // Si ya se creó, los siguientes intentos editan esa misma cápsula.
      if (!id && capsuleId) navigate(`/capsulas/${capsuleId}/editar`, { replace: true })
    }
  }

  async function removeItem(itemId) {
    try {
      const after = await api(`/api/capsules/${id}/items/${itemId}`, { method: 'DELETE' })
      setItems(after.items)
    } catch (err) { setError(err.message) }
  }

  if (loadError) return <AppShell nav={false}><TopBar title="Cápsula" /><ErrorBox error={loadError} /></AppShell>
  if (id && !existing) return <AppShell nav={false}><Spinner /></AppShell>
  const total = items.length + pending.length

  const firstName = person ? person.name.split(' ')[0] : ''
  const validDate = !Number.isNaN(openAt.getTime()) && openAt > new Date()
  const whenOpen = showWhen || !validDate
  const full = total >= MAX_ITEMS
  const counts = countsText(Object.fromEntries(['photo', 'video', 'audio']
    .map((k) => [k, [...items, ...pending].filter((x) => x.kind === k).length]).filter(([, n]) => n)))

  return (
    <AppShell nav={false}>
      <TopBar title={id ? 'Editar cápsula' : 'Nueva cápsula'} />
      <form onSubmit={(e) => { e.preventDefault(); save(false) }} className="capsule-compose">
        <header className="compose-hero">
          <GiftArt />
          <div>
            <h2>Un mensaje para <span className="compose-hand">el futuro</span></h2>
            <p>Escríbelo hoy y elige el día en que se abrirá.</p>
          </div>
        </header>

        <section className="compose-section">
          <h3 className="compose-label">¿Para quién es?</h3>
          {!people && <small className="muted">Cargando tus personas…</small>}
          {people && !people.length && (
            <small className="muted">Primero añade a alguien en <Link to="/personas/nueva"><b>Personas</b></Link>.</small>
          )}
          {people?.length > 0 && (
            <div className="recipient-row" role="radiogroup" aria-label="¿Para quién es?">
              {people.map((p) => {
                const on = form.person_id === p.id
                return (
                  <button type="button" key={p.id} role="radio" aria-checked={on} className={`recipient ${on ? 'on' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, person_id: p.id }))} aria-label={`${p.name} · ${relationText(p)}`}>
                    <span className="recipient-face">
                      <Avatar name={p.name} src={p.photo_url} size={58} />
                      {on && <span className="recipient-check"><Icon name="check" size={14} /></span>}
                    </span>
                    <span className="recipient-name">{p.name.split(' ')[0]}</span>
                  </button>
                )
              })}
            </div>
          )}
          {person && !person.is_linked && (
            <small className="hint">{person.name} aún no está conectada contigo. La verá cuando cree su cuenta y conectéis (si ya llegó la fecha, la encontrará abierta).</small>
          )}
        </section>

        <section className="paper" aria-label="Tu carta">
          <input className="paper-title" value={form.title} onChange={set('title')} maxLength={120}
            placeholder="Para cuando cumplas 18" aria-label="Título" required />
          <textarea ref={letterRef} className="paper-letter" rows={5} maxLength={5000} value={form.message} onChange={set('message')}
            aria-label="Tu carta" placeholder={`${firstName ? `${firstName}, cuando` : 'Cuando'} leas esto…`} />
          <small className="paper-count">{form.message.length}/5000</small>
        </section>

        <section className="compose-section">
          <h3 className="compose-label">Añade recuerdos <small className="muted">({total}/{MAX_ITEMS})</small></h3>
          <div className="media-buttons">
            {[['camera', 'Fotos', 'image/*'], ['video', 'Videos', 'video/*']].map(([icon, label, accept]) => (
              <label key={label} className={`media-button ${full ? 'disabled' : ''}`} aria-disabled={full}>
                <span className="media-button-icon"><Icon name={icon} size={24} /></span>
                <span>{label}</span>
                {!full && (
                  // Oculto a la vista pero enfocable: así también se abre con el teclado
                  <input type="file" accept={accept} multiple className="sr-only" onChange={(e) => { pick(e.target.files); e.target.value = '' }} />
                )}
              </label>
            ))}
            {/* Audio: grabar una nota de voz aquí mismo o elegir un archivo */}
            <button type="button" className={`media-button ${full ? 'disabled' : ''}`} disabled={full}
              onClick={() => setAudioSheet(true)} aria-haspopup="dialog">
              <span className="media-button-icon"><Icon name="mic" size={24} /></span>
              <span>Audio</span>
            </button>
          </div>
          {audioSheet && (
            <BottomSheet title="Añadir un audio" onClose={() => { setAudioSheet(false); setRecording(false) }}>
              {recording ? (
                <VoiceRecorder addLabel="Añadir a la cápsula"
                  onRecorded={(f) => { pick([f]); setRecording(false); setAudioSheet(false) }} />
              ) : (
                <div className="day-actions">
                  <button type="button" className="day-action" onClick={() => setRecording(true)} disabled={!canRecord()}>
                    <span className="day-action-icon is-memory"><Icon name="mic" size={20} /></span>
                    <span>{canRecord() ? 'Grabar ahora' : 'Grabar ahora (no disponible en este navegador)'}</span>
                  </button>
                  {/* Con sus extensiones (AUDIO_ACCEPT), en iPhone abre directamente Archivos */}
                  <label className="day-action">
                    <span className="day-action-icon is-date"><Icon name="note" size={20} /></span>
                    <span>Elegir archivo <small className="muted">(m4a, mp3, wav, notas de WhatsApp…)</small></span>
                    <input type="file" accept={AUDIO_ACCEPT} multiple className="sr-only"
                      onChange={(e) => { pick(e.target.files); e.target.value = ''; setAudioSheet(false) }} />
                  </label>
                </div>
              )}
            </BottomSheet>
          )}
          {total > 0 && (
            <div className="capsule-files">
              {items.map((it) => (
                <div key={`i${it.id}`} className="capsule-file">
                  <FilePreview kind={it.kind} url={mediaUrl(it.media_url)} poster={mediaUrl(it.poster_url)} />
                  <button type="button" className="file-x" aria-label="Quitar archivo" onClick={() => removeItem(it.id)}><Icon name="x" size={14} /></button>
                </div>
              ))}
              {pending.map((p, i) => (
                <div key={p.url} className="capsule-file pending">
                  <FilePreview kind={p.kind} url={p.url} />
                  <button type="button" className="file-x" aria-label="Quitar archivo"
                    onClick={() => setPending((all) => all.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <small className="hint">
            {counts && <>{counts}. </>}
            Opcional. Fotos hasta {LIMITS_MB.photo} MB, audios hasta {LIMITS_MB.audio} MB y videos hasta {LIMITS_MB.video} MB; las fotos se reducen solas.
          </small>
        </section>

        <section className="compose-section">
          <button type="button" className="when-phrase" aria-expanded={whenOpen} aria-controls="cuando"
            onClick={() => setShowWhen((v) => !v)}>
            <Icon name="calendar" size={20} />
            <span>{validDate ? <>Se abrirá el <b>{openPhrase(openAt)}</b></> : <b>Elige cuándo se abrirá</b>}</span>
            <Icon name={whenOpen ? 'up' : 'edit'} size={16} className="when-edit" />
          </button>
          {whenOpen && (
            <div className="stack-sm" id="cuando">
              <div className="grid-2">
                <Field label="Día" htmlFor="cd"><input id="cd" type="date" value={form.date} min={new Date().toLocaleDateString('sv')} onChange={set('date')} required /></Field>
                <Field label="Hora" htmlFor="ch"><input id="ch" type="time" value={form.time} onChange={set('time')} required /></Field>
              </div>
              <small className="hint">Hora de {localTz().replace('_', ' ')}.</small>
            </div>
          )}
        </section>

        <p className="compose-privacy">
          <Icon name="lock" size={16} />
          <span>Solo {firstName || 'esa persona'} podrá abrirla, y solo cuando llegue el día. Hasta entonces verá la cuenta atrás y quién se la dejó.</span>
        </p>

        <ErrorBox error={error} />

        <div className="row-actions">
          <button className="btn btn-ghost" disabled={!!busy}>{busy || 'Guardar borrador'}</button>
          <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => save(true)}>
            <Icon name="lock" size={18} /> Sellar cápsula
          </button>
        </div>
        <small className="hint center">Una vez sellada no se puede cambiar: así la sorpresa queda intacta.</small>
      </form>
    </AppShell>
  )
}
