import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../api/client'
import Icon from '../../components/Icon'
import PeoplePicker from '../../components/PeoplePicker'
import { AppShell, ErrorBox, Field, TopBar } from '../../components/ui'
import { useApi } from '../../hooks'
import { KIND_LABEL } from './MemoryCard'
import VoiceRecorder from './VoiceRecorder'

const MAX_MB = 25
const ACCEPT = { photo: 'image/*', video: 'video/*', audio: 'audio/*' }
const KINDS = [
  { kind: 'photo', icon: 'camera' }, { kind: 'video', icon: 'video' },
  { kind: 'audio', icon: 'mic' }, { kind: 'text', icon: 'note' },
]

export default function NewMemory() {
  const [params] = useSearchParams()
  const preselected = params.get('persona') ? [Number(params.get('persona'))] : []
  const { data: people, setData: setPeople } = useApi('/api/people')
  const [tagged, setTagged] = useState(preselected)
  const navigate = useNavigate()
  const [kind, setKind] = useState(KINDS.some((k) => k.kind === params.get('tipo')) ? params.get('tipo') : 'photo')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', location: '', happened_on: new Date().toLocaleDateString('sv') })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function pick(f) {
    setError('')
    if (!f) return setFile(null)
    if (f.size > MAX_MB * 1024 * 1024) return setError(`El archivo supera el límite de ${MAX_MB} MB.`)
    setFile(f)
  }

  function changeKind(k) {
    setKind(k)
    setFile(null)
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.title.trim()) return setError('Dale un título a tu recuerdo.')
    if (kind === 'text' && !form.description.trim()) return setError('Escribe el texto de tu nota.')
    if (kind !== 'text' && !file) return setError('Adjunta el archivo del recuerdo.')
    setBusy(true); setError('')
    const fd = new FormData()
    fd.append('kind', kind)
    Object.entries(form).forEach(([k, v]) => v && fd.append(k, v))
    if (tagged.length) fd.append('person_ids', tagged.join(','))
    if (file) fd.append('file', file)
    try {
      const memory = await api('/api/memories', { method: 'POST', form: fd })
      navigate(`/recuerdo/${memory.id}`, { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <AppShell nav={false}>
      <TopBar title="Nuevo recuerdo" />
      <form onSubmit={submit} className="stack">
        <div className="kind-picker" role="radiogroup" aria-label="Tipo de recuerdo">
          {KINDS.map((k) => (
            <button type="button" key={k.kind} role="radio" aria-checked={kind === k.kind}
              className={`quick-btn ${k.kind} ${kind === k.kind ? 'selected' : ''}`} onClick={() => changeKind(k.kind)}>
              <span><Icon name={k.icon} size={22} /></span>{KIND_LABEL[k.kind]}
            </button>
          ))}
        </div>

        <ErrorBox error={error} />

        {kind !== 'text' && (
          <div className="card upload">
            {preview && kind === 'photo' && <img src={preview} alt="Vista previa" className="preview" />}
            {preview && kind === 'video' && <video src={preview} controls className="preview" />}
            {preview && kind === 'audio' && <audio src={preview} controls />}
            {kind === 'audio' && !file && <VoiceRecorder onRecorded={pick} />}
            <label className="btn btn-ghost">
              <Icon name={file ? 'refresh' : 'plus'} size={18} />
              {file ? 'Cambiar archivo' : kind === 'audio' ? 'O sube un audio' : `Elegir ${KIND_LABEL[kind].toLowerCase()}`}
              <input type="file" accept={ACCEPT[kind]} hidden onChange={(e) => pick(e.target.files[0])} />
            </label>
            <small className="hint">Máximo {MAX_MB} MB.</small>
          </div>
        )}

        <div className="card stack">
          <Field label="Título" htmlFor="t">
            <input id="t" value={form.title} onChange={set('title')} maxLength={120} placeholder="Sus primeros pasos" required />
          </Field>
          <Field label={kind === 'text' ? 'Tu mensaje' : 'Descripción (opcional)'} htmlFor="d">
            <textarea id="d" rows={kind === 'text' ? 6 : 3} value={form.description} onChange={set('description')}
              placeholder={kind === 'text' ? 'Escribe lo que sientes en este momento…' : 'Contigo todo es más bonito.'} />
          </Field>
          <div className="grid-2">
            <Field label="Fecha" htmlFor="f"><input id="f" type="date" value={form.happened_on} onChange={set('happened_on')} /></Field>
            <Field label="Lugar (opcional)" htmlFor="l"><input id="l" value={form.location} onChange={set('location')} placeholder="Madrid" /></Field>
          </div>
        </div>

        <section className="card stack">
          <div>
            <h2 className="field-title">¿Con quién es este recuerdo?</h2>
            <small className="hint">Se guardará en su cofre. No hace falta que tenga cuenta.</small>
          </div>
          {people
            ? <PeoplePicker people={people} setPeople={setPeople} selected={tagged} onChange={setTagged} />
            : <small className="muted">Cargando tus personas…</small>}
          {people && !tagged.length && <small className="hint">Sin etiquetar: será solo para ti (puedes etiquetar después).</small>}
        </section>

        <button className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar recuerdo'}</button>
      </form>
    </AppShell>
  )
}
