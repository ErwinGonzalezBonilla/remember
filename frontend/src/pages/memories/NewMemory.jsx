import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../api/client'
import Icon from '../../components/Icon'
import PeoplePicker from '../../components/PeoplePicker'
import { AppShell, ErrorBox, Field, TopBar } from '../../components/ui'
import { useApi } from '../../hooks'
import { LIMITS_MB, compressImage, progressText, tooBig, uploadFile } from '../../media'
import { ALBUM_ACCEPT, ALBUM_MAX, AlbumStrip, moveItem, prepareFiles, uploadAlbum, useRevokeOnUnmount } from './Album'
import { KIND_LABEL } from './MemoryCard'
import { MilestonePicker } from './Milestone'
import VoiceRecorder from './VoiceRecorder'

const isAlbum = (kind) => kind === 'photo' || kind === 'video'
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
  const [file, setFile] = useState(null)        // nota de voz
  const [album, setAlbum] = useState([])        // fotos y videos: [{ id, file, kind, preview, key }]
  useRevokeOnUnmount(album)
  const [preview, setPreview] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', location: '', happened_on: new Date().toLocaleDateString('sv'), milestone: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function pick(raw) {
    setError('')
    if (!raw) return setFile(null)
    const f = await compressImage(raw)
    const big = tooBig(f, kind)
    if (big) return setError(big)
    setFile(f)
  }

  async function pickMany(list) {
    setError('')
    const { items, error: problem } = await prepareFiles(list, ALBUM_MAX - album.length)
    if (problem) setError(problem)
    if (items.length) setAlbum((a) => [...a, ...items])
  }

  function removeItem(id) {
    setAlbum((a) => {
      const it = a.find((x) => x.id === id)
      if (it) URL.revokeObjectURL(it.preview)
      return a.filter((x) => x.id !== id)
    })
  }

  function changeKind(k) {
    setKind(k)
    setFile(null)
    setError('')
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.title.trim()) return setError('Dale un título a tu recuerdo.')
    if (kind === 'text' && !form.description.trim()) return setError('Escribe el texto de tu nota.')
    if (kind === 'audio' && !file) return setError('Adjunta el archivo del recuerdo.')
    if (isAlbum(kind) && !album.length) return setError('Elige al menos una foto o un video.')
    setBusy(true); setError('')
    const fd = new FormData()
    fd.append('kind', isAlbum(kind) ? album[0].kind : kind)
    Object.entries(form).forEach(([k, v]) => v.trim() && fd.append(k, v.trim()))
    if (tagged.length) fd.append('person_ids', tagged.join(','))
    try {
      if (isAlbum(kind)) {
        // Uno detrás de otro, directos al almacén; si uno falla, al reintentar no se repiten los ya subidos
        const keys = await uploadAlbum(album, setProgress, () => setAlbum((a) => [...a]))
        fd.append('media_keys', JSON.stringify(keys))
        setProgress('Guardando…')
      } else if (file) {
        // El archivo va directo al almacén; aquí solo se envía su clave
        setProgress(progressText(kind))
        fd.append('media_key', await uploadFile(file, kind, (pct) => setProgress(progressText(kind, pct))))
        setProgress('Guardando…')
      }
      const memory = await api('/api/memories', { method: 'POST', form: fd })
      navigate(`/recuerdo/${memory.id}`, { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
      setProgress('')
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

        {isAlbum(kind) && (
          <div className="card upload">
            <AlbumStrip items={album} disabled={busy} onRemove={removeItem}
              onMove={(i, dir) => setAlbum((a) => moveItem(a, i, dir))} />
            {album.length < ALBUM_MAX && (
              <label className={`btn btn-ghost ${busy ? 'disabled' : ''}`}>
                <Icon name="plus" size={18} />
                {album.length ? 'Añadir más fotos o videos' : 'Elegir fotos o videos'}
                <input type="file" accept={ALBUM_ACCEPT} multiple hidden disabled={busy}
                  onChange={(e) => { pickMany(e.target.files); e.target.value = '' }} />
              </label>
            )}
            <small className="hint">
              Hasta {ALBUM_MAX} a la vez, fotos y videos mezclados. Fotos de hasta {LIMITS_MB.photo} MB (se reducen solas)
              y videos de hasta {LIMITS_MB.video} MB.
            </small>
          </div>
        )}

        {kind === 'audio' && (
          <div className="card upload">
            {preview && <audio src={preview} controls />}
            {!file && <VoiceRecorder onRecorded={pick} />}
            <label className="btn btn-ghost">
              <Icon name={file ? 'refresh' : 'plus'} size={18} />
              {file ? 'Cambiar archivo' : 'O sube un audio'}
              <input type="file" accept="audio/*" hidden onChange={(e) => pick(e.target.files[0])} />
            </label>
            <small className="hint">Máximo {LIMITS_MB.audio} MB.</small>
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
          <MilestonePicker value={form.milestone} onChange={(v) => setForm((f) => ({ ...f, milestone: v }))} />
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

        <button className="btn btn-primary" disabled={busy}>
          {busy ? progress || 'Guardando…' : album.some((it) => it.failed) ? 'Reintentar' : 'Guardar recuerdo'}
        </button>
      </form>
    </AppShell>
  )
}
