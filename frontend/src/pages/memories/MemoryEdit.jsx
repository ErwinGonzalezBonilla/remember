import { useState } from 'react'
import { api, mediaUrl } from '../../api/client'
import Icon from '../../components/Icon'
import PeoplePicker from '../../components/PeoplePicker'
import { ErrorBox, Field } from '../../components/ui'
import { useApi } from '../../hooks'
import { ALBUM_ACCEPT, ALBUM_MAX, moveItem, prepareFiles, uploadAlbum } from './Album'
import { MilestonePicker } from './Milestone'

/** Fotos y videos de un recuerdo ya guardado: añadir, quitar y reordenar (cada cambio se guarda al momento). */
function AlbumEditor({ memory, onSaved }) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const items = memory.media || []

  const run = async (label, fn) => {
    setErr(''); setBusy(label)
    try { onSaved(await fn()) } catch (e) { setErr(e.message) } finally { setBusy('') }
  }

  const remove = (it) => run('Quitando…', () => api(`/api/memories/${memory.id}/media/${it.id}`, { method: 'DELETE' }))
  const move = (i, dir) => run('Guardando el orden…', () => api(`/api/memories/${memory.id}/media/order`, {
    method: 'PUT', body: { ids: moveItem(items, i, dir).map((it) => it.id) },
  }))

  async function add(list) {
    setErr('')
    const { items: picked, error } = await prepareFiles(list, ALBUM_MAX - items.length)
    if (error) setErr(error)
    if (!picked.length) return
    setBusy('Subiendo…')
    try {
      const keys = await uploadAlbum(picked, setBusy)
      onSaved(await api(`/api/memories/${memory.id}/media`, { method: 'POST', body: { items: keys } }))
    } catch (e) {
      setErr(e.message)
    } finally {
      picked.forEach((it) => URL.revokeObjectURL(it.preview))
      setBusy('')
    }
  }

  // Un recuerdo antiguo (un solo elemento, sin id) aún no se puede ordenar ni quitar: basta con añadir
  const editable = items.length > 1
  return (
    <section className="field">
      <h2 className="field-title">Fotos y videos ({items.length} de {ALBUM_MAX})</h2>
      <ol className="album-strip" aria-label="Fotos y videos del recuerdo">
        {items.map((it, i) => (
          <li key={it.id ?? `old-${i}`} className="album-thumb">
            <img src={mediaUrl(it.kind === 'video' ? it.poster_url || it.url : it.url)} alt="" />
            {it.kind === 'video' && <span className="album-thumb-kind"><Icon name="play" size={14} filled /></span>}
            {i === 0 && <span className="album-cover-tag">Portada</span>}
            {editable && (
              <>
                <button type="button" className="album-thumb-x" onClick={() => remove(it)} disabled={!!busy}
                  aria-label={`Quitar ${it.kind === 'video' ? 'el video' : 'la foto'} ${i + 1}`}>
                  <Icon name="x" size={14} />
                </button>
                <span className="album-thumb-move">
                  <button type="button" onClick={() => move(i, -1)} disabled={!!busy || i === 0} aria-label={`Mover ${i + 1} a la izquierda`}>◀</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={!!busy || i === items.length - 1} aria-label={`Mover ${i + 1} a la derecha`}>▶</button>
                </span>
              </>
            )}
          </li>
        ))}
      </ol>
      {items.length < ALBUM_MAX && (
        <label className={`btn btn-ghost ${busy ? 'disabled' : ''}`}>
          <Icon name="plus" size={18} /> {busy || 'Añadir fotos o videos'}
          <input type="file" accept={ALBUM_ACCEPT} multiple hidden disabled={!!busy}
            onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        </label>
      )}
      {busy && items.length >= ALBUM_MAX && <small className="hint">{busy}</small>}
      <small className="hint">La primera es la portada. Los cambios de fotos se guardan al momento.</small>
      <ErrorBox error={err} />
    </section>
  )
}

/** Editar un recuerdo (hoja a pantalla completa sobre el visor). Solo lo ve quien lo guardó. */
export default function MemoryEdit({ memory, onSaved, onClose }) {
  const [form, setForm] = useState({
    title: memory.title, description: memory.description || '', location: memory.location || '',
    happened_on: memory.happened_on || '', person_ids: memory.people.map((p) => p.id), milestone: memory.milestone || '',
  })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const { data: people, setData: setPeople } = useApi('/api/people')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save(e) {
    e.preventDefault()
    setErr(''); setSaving(true)
    try {
      onSaved(await api(`/api/memories/${memory.id}`, {
        method: 'PUT',
        body: { title: form.title, description: form.description || null, location: form.location || null,
          happened_on: form.happened_on || null, person_ids: form.person_ids, milestone: form.milestone.trim() || null },
      }))
      onClose()
    } catch (e2) {
      setErr(e2.message)
      setSaving(false)
    }
  }

  return (
    <div className="viewer-edit" role="dialog" aria-modal="true" aria-labelledby="edit-title">
      <header className="topbar">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar sin guardar"><Icon name="x" /></button>
        <h1 id="edit-title">Editar recuerdo</h1>
        <span />
      </header>
      <form onSubmit={save} className="card stack">
        <ErrorBox error={err} />
        {(memory.kind === 'photo' || memory.kind === 'video') && (
          <AlbumEditor memory={memory} onSaved={(m) => onSaved(m)} />
        )}
        <Field label="Título" htmlFor="et"><input id="et" value={form.title} onChange={set('title')} maxLength={120} required /></Field>
        <Field label={memory.kind === 'text' ? 'Tu mensaje' : 'Descripción'} htmlFor="ed">
          <textarea id="ed" rows={4} value={form.description} onChange={set('description')} />
        </Field>
        <div className="grid-2">
          <Field label="Fecha" htmlFor="ef"><input id="ef" type="date" value={form.happened_on} onChange={set('happened_on')} /></Field>
          <Field label="Lugar" htmlFor="el"><input id="el" value={form.location} onChange={set('location')} /></Field>
        </div>
        <MilestonePicker value={form.milestone} onChange={(v) => setForm((f) => ({ ...f, milestone: v }))} />
        <Field label="¿Con quién es este recuerdo?" htmlFor="ep">
          {people
            ? <PeoplePicker people={people} setPeople={setPeople} selected={form.person_ids}
                onChange={(ids) => setForm((f) => ({ ...f, person_ids: ids }))} />
            : <small className="muted">Cargando…</small>}
        </Field>
        <div className="row-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  )
}
