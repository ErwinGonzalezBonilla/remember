import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, mediaUrl } from '../../api/client'
import Icon from '../../components/Icon'
import { relationText, AppShell, Avatar, ErrorBox, Field, Spinner, TopBar } from '../../components/ui'
import { useApi } from '../../hooks'
import { MAX_UPLOAD_MB, compressImage, tooBig } from '../../media'
import { countsText, openDateText } from './capsuleUtils'

const MAX_ITEMS = 10
const kindOf = (file) => (file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : 'photo')
const localTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid' } catch { return 'Europe/Madrid' } }

function defaultDate() {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toLocaleDateString('sv')
}

function FilePreview({ kind, url }) {
  if (kind === 'photo') return <img src={url} alt="" />
  if (kind === 'video') return <video src={url} muted playsInline />
  return <span className="file-audio"><Icon name="mic" size={22} /></span>
}

export default function CapsuleForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { data: people } = useApi('/api/people')
  const { data: existing, error: loadError } = useApi(id ? `/api/capsules/${id}` : null)
  const [form, setForm] = useState({
    title: '', message: '', person_id: params.get('persona') ? Number(params.get('persona')) : null,
    date: defaultDate(), time: '09:00',
  })
  const [items, setItems] = useState([])        // ya subidos
  const [pending, setPending] = useState([])    // { file, kind, url } por subir
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
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
      const f = await compressImage(raw)
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
      // Uno por uno: en Vercel cada petición admite como máximo 4 MB.
      for (let i = 0; i < pending.length; i += 1) {
        setBusy(`Subiendo ${i + 1} de ${pending.length}…`)
        const fd = new FormData()
        fd.append('kind', pending[i].kind)
        fd.append('file', pending[i].file)
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

  return (
    <AppShell nav={false}>
      <TopBar title={id ? 'Editar cápsula' : 'Nueva cápsula'} />
      <form onSubmit={(e) => { e.preventDefault(); save(false) }} className="stack">
        <section className="card stack">
          <div>
            <h2 className="field-title">¿Para quién es?</h2>
            <small className="hint">Solo esa persona podrá abrirla, y solo cuando llegue el día.</small>
          </div>
          {!people && <small className="muted">Cargando tus personas…</small>}
          {people && !people.length && <small className="muted">Primero añade a alguien en <b>Personas</b>.</small>}
          <div className="people-picker" role="radiogroup" aria-label="Destinatario">
            {people?.map((p) => {
              const on = form.person_id === p.id
              return (
                <button type="button" key={p.id} role="radio" aria-checked={on} className={`tagchip ${on ? 'on' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, person_id: p.id }))}>
                  <Avatar name={p.name} src={p.photo_url} size={34} />
                  <span>{p.name} <small>· {relationText(p)}</small></span>
                  <span className="tag-check">{on && <Icon name="check" size={18} />}</span>
                </button>
              )
            })}
          </div>
          {person && !person.is_linked && (
            <small className="hint">🔒 {person.name} aún no está conectada contigo. La verá cuando cree su cuenta y conectéis (si ya llegó la fecha, la encontrará abierta).</small>
          )}
        </section>

        <ErrorBox error={error} />

        <section className="card stack letter-card">
          <Field label="Título" htmlFor="ct">
            <input id="ct" value={form.title} onChange={set('title')} maxLength={120} placeholder="Para cuando cumplas 18" required />
          </Field>
          <Field label="Tu carta" htmlFor="cm" hint={`${form.message.length}/5000`}>
            <textarea id="cm" rows={8} maxLength={5000} className="letter-input" value={form.message} onChange={set('message')}
              placeholder={`${person ? person.name.split(' ')[0] : 'Hola'}: cuando leas esto…`} />
          </Field>
        </section>

        <section className="card stack">
          <div>
            <h2 className="field-title">Fotos, videos y audios <small className="muted">({total}/{MAX_ITEMS})</small></h2>
            <small className="hint">Opcional. Máximo {MAX_UPLOAD_MB} MB por archivo; las fotos se reducen solas.</small>
          </div>
          {total > 0 && (
            <div className="capsule-files">
              {items.map((it) => (
                <div key={`i${it.id}`} className="capsule-file">
                  <FilePreview kind={it.kind} url={mediaUrl(it.media_url)} />
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
          {total < MAX_ITEMS && (
            <label className="btn btn-ghost">
              <Icon name="plus" size={18} /> Añadir archivos
              <input type="file" accept="image/*,video/*,audio/*" multiple hidden
                onChange={(e) => { pick(e.target.files); e.target.value = '' }} />
            </label>
          )}
          {total > 0 && <small className="hint">{countsText(Object.fromEntries(['photo', 'video', 'audio'].map((k) => [k, [...items, ...pending].filter((x) => x.kind === k).length]).filter(([, n]) => n)))}</small>}
        </section>

        <section className="card stack">
          <div>
            <h2 className="field-title">¿Cuándo se abre?</h2>
            <small className="hint">Hasta ese momento verá solo la cuenta atrás y quién se la dejó.</small>
          </div>
          <div className="grid-2">
            <Field label="Día" htmlFor="cd"><input id="cd" type="date" value={form.date} min={new Date().toLocaleDateString('sv')} onChange={set('date')} required /></Field>
            <Field label="Hora" htmlFor="ch"><input id="ch" type="time" value={form.time} onChange={set('time')} required /></Field>
          </div>
          {!Number.isNaN(openAt.getTime()) && openAt > new Date() && (
            <small className="hint">Se abrirá el <b>{openDateText(openAt.toISOString())}</b> (hora de {localTz().replace('_', ' ')}).</small>
          )}
        </section>

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
