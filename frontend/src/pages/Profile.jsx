import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, mediaUrl } from '../api/client'
import Icon from '../components/Icon'
import { AppShell, ErrorBox, Field, TopBar } from '../components/ui'
import { useAuth } from '../context/AuthContext'

const MAX_MB = 10

/**
 * Perfil del usuario. Con `onboarding` es la bienvenida tras crear la cuenta:
 * el primer paso es presentarte (foto, nombre, algo sobre ti) antes de guardar recuerdos.
 */
export default function Profile({ onboarding = false }) {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const next = location.state?.next || '/'

  const [form, setForm] = useState({
    full_name: user.full_name, bio: user.bio || '', birth_date: user.birth_date || '',
  })
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setSaved(false) }

  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function pick(f) {
    setError(''); setSaved(false)
    if (!f) return
    if (!f.type.startsWith('image/')) return setError('Elige una imagen (JPG, PNG, WEBP…).')
    if (f.size > MAX_MB * 1024 * 1024) return setError(`La foto supera el límite de ${MAX_MB} MB.`)
    setFile(f)
    setRemovePhoto(false)
  }

  async function submit(e) {
    e.preventDefault()
    if (form.full_name.trim().length < 2) return setError('Escribe tu nombre (mínimo 2 caracteres).')
    setBusy(true); setError('')
    try {
      let updated = await api('/api/me', {
        method: 'PATCH',
        body: { full_name: form.full_name, bio: form.bio || null, birth_date: form.birth_date || null },
      })
      if (file) {
        const fd = new FormData()
        fd.append('file', file)
        updated = await api('/api/me/avatar', { method: 'POST', form: fd })
        setFile(null)
      } else if (removePhoto) {
        updated = await api('/api/me/avatar', { method: 'DELETE' })
        setRemovePhoto(false)
      }
      setUser(updated)
      if (onboarding) navigate(next, { replace: true })
      else setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const current = removePhoto ? null : preview || mediaUrl(user.avatar_url)
  const initial = form.full_name.trim().charAt(0).toUpperCase() || '?'

  return (
    <AppShell nav={!onboarding}>
      {onboarding ? (
        <header className="onboarding-head">
          <span className="step-pill">Paso 1 de 2 · Tu perfil</span>
          <h1 className="display">¡Bienvenido a Remember, {user.full_name.split(' ')[0]}!</h1>
          <p className="muted">Preséntate en un momento. Después podrás guardar tu primer recuerdo.</p>
        </header>
      ) : (
        <TopBar title="Mi perfil" />
      )}

      <form onSubmit={submit} className="stack">
        <div className="profile-photo">
          <label className="avatar-picker" aria-label="Cambiar foto de perfil">
            {current ? <img src={current} alt="Tu foto de perfil" /> : <span className="avatar-initial">{initial}</span>}
            <span className="avatar-cam"><Icon name="camera" size={18} /></span>
            <input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files[0])} />
          </label>
          <div className="photo-actions">
            <label className="btn-text">
              {current ? 'Cambiar foto' : 'Añadir foto'}
              <input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files[0])} />
            </label>
            {current && (
              <button type="button" className="btn-text danger" onClick={() => { setFile(null); setRemovePhoto(true); setSaved(false) }}>
                Quitar
              </button>
            )}
          </div>
        </div>

        <ErrorBox error={error} />
        {saved && <div className="alert alert-ok">Perfil guardado.</div>}

        <div className="card stack">
          <Field label="Nombre" htmlFor="pn">
            <input id="pn" value={form.full_name} onChange={set('full_name')} maxLength={120} autoComplete="name" required />
          </Field>
          <Field label="Algo sobre ti (opcional)" htmlFor="pb" hint={`${form.bio.length}/160`}>
            <textarea id="pb" rows={3} maxLength={160} value={form.bio} onChange={set('bio')}
              placeholder="Amante de los viajes, el café y las fotos de atardeceres." />
          </Field>
          <Field label="Cumpleaños (opcional)" htmlFor="pd" hint="Para recordárselo a tus personas en el calendario.">
            <input id="pd" type="date" value={form.birth_date} onChange={set('birth_date')} />
          </Field>
          {!onboarding && (
            <Field label="Correo electrónico" htmlFor="pe">
              <input id="pe" value={user.email} disabled />
            </Field>
          )}
        </div>

        <div className="private-note">
          <Icon name="shield" size={20} />
          <span><strong>Tu perfil es privado.</strong><small>Solo lo verán las personas con las que te conectes.</small></span>
        </div>

        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : onboarding ? 'Continuar' : 'Guardar cambios'}
        </button>
        {onboarding && (
          <button type="button" className="btn btn-ghost" onClick={() => navigate(next, { replace: true })}>
            Omitir por ahora
          </button>
        )}
      </form>
    </AppShell>
  )
}
