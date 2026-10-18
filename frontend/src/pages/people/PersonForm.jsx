import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, mediaUrl } from '../../api/client'
import Icon from '../../components/Icon'
import { AppShell, ErrorBox, Field, RELATIONS, Spinner, TopBar } from '../../components/ui'

const EMPTY = { name: '', relation: 'familia', birth_date: '', special_date: '', special_label: '', note: '' }

/** Crear o editar una persona (sin cuenta necesaria). */
export default function PersonForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(editing)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    if (!editing) return
    api(`/api/people/${id}`)
      .then((p) => {
        setForm({
          name: p.name, relation: p.relation, birth_date: p.birth_date || '', special_date: p.special_date || '',
          special_label: p.special_label || '', note: p.note || '',
        })
        setPhotoUrl(p.photo_url)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [editing, id])

  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) return setError('Escribe su nombre o apodo.')
    setBusy(true); setError('')
    const body = {
      ...form,
      birth_date: form.birth_date || null, special_date: form.special_date || null,
      special_label: form.special_label || null, note: form.note || null,
    }
    try {
      const person = await api(editing ? `/api/people/${id}` : '/api/people', { method: editing ? 'PUT' : 'POST', body })
      if (file) {
        const fd = new FormData()
        fd.append('file', file)
        await api(`/api/people/${person.id}/photo`, { method: 'POST', form: fd })
      }
      navigate(`/personas/${person.id}`, { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`¿Quitar a ${form.name} de tu lista? Tus recuerdos NO se borran: solo pierden esta etiqueta.`)) return
    try {
      await api(`/api/people/${id}`, { method: 'DELETE' })
      navigate('/personas', { replace: true })
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <AppShell nav={false}><Spinner /></AppShell>
  const current = preview || mediaUrl(photoUrl)

  return (
    <AppShell nav={false}>
      <TopBar title={editing ? 'Editar persona' : 'Añadir persona'} />
      {!editing && <p className="muted center">No necesita tener cuenta. Cuando la cree, podrás conectaros y abrirle su cofre.</p>}
      <form onSubmit={submit} className="stack">
        <div className="profile-photo">
          <label className="avatar-picker" aria-label="Foto de la persona">
            {current ? <img src={current} alt="" /> : <span className="avatar-initial">{form.name.trim().charAt(0).toUpperCase() || '?'}</span>}
            <span className="avatar-cam"><Icon name="camera" size={18} /></span>
            <input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files[0] || null)} />
          </label>
          <small className="muted">Foto (opcional)</small>
        </div>
        <ErrorBox error={error} />
        <div className="card stack">
          <Field label="Nombre o apodo" htmlFor="n">
            <input id="n" value={form.name} onChange={set('name')} maxLength={120} placeholder="Allison" required />
          </Field>
          <Field label="¿Quién es para ti?" htmlFor="r">
            <div className="chips" id="r" role="radiogroup">
              {Object.entries(RELATIONS).map(([value, label]) => (
                <button type="button" key={value} role="radio" aria-checked={form.relation === value}
                  className={`chip ${form.relation === value ? 'active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, relation: value }))}>{label}</button>
              ))}
            </div>
          </Field>
          <Field label="Cumpleaños (opcional)" htmlFor="b">
            <input id="b" type="date" value={form.birth_date} onChange={set('birth_date')} />
          </Field>
          <div className="grid-2">
            <Field label="Otra fecha especial" htmlFor="s">
              <input id="s" type="date" value={form.special_date} onChange={set('special_date')} />
            </Field>
            <Field label="¿Qué celebráis?" htmlFor="sl">
              <input id="sl" value={form.special_label} onChange={set('special_label')} maxLength={60} placeholder="Aniversario" />
            </Field>
          </div>
          <Field label="Una nota (opcional)" htmlFor="no">
            <textarea id="no" rows={2} maxLength={300} value={form.note} onChange={set('note')}
              placeholder="Mi pequeña gran aventura." />
          </Field>
        </div>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Añadir'}</button>
        {editing && <button type="button" className="btn btn-ghost danger" onClick={remove}>Quitar de mi lista</button>}
      </form>
    </AppShell>
  )
}
