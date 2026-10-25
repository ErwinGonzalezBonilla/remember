import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import Icon from '../components/Icon'
import { AppShell, Avatar, ErrorBox, Field, ListRow, PasswordInput } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import PasswordChecklist from './auth/PasswordChecklist'
import { passwordOk } from './auth/passwordRules'

export default function Settings() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [panel, setPanel] = useState(null) // 'password' | 'privacy'
  const [pw, setPw] = useState({ current_password: '', new_password: '' })
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  const open = (p) => { setPanel(panel === p ? null : p); setErr(''); setMsg('') }

  async function run(fn, ok) {
    setErr(''); setMsg('')
    try { await fn(); setMsg(ok) } catch (e) { setErr(e.message) }
  }

  const savePassword = (e) => {
    e.preventDefault()
    if (!passwordOk(pw.new_password)) return setErr('La nueva contraseña no cumple los requisitos.')
    run(async () => {
      await api('/api/me/password', { method: 'POST', body: pw })
      setPw({ current_password: '', new_password: '' })
    }, 'Contraseña actualizada.')
  }

  const deleteAccount = () => {
    if (!confirm('Se eliminará tu cuenta y todo lo que has publicado. Esta acción no se puede deshacer. ¿Continuar?')) return
    run(async () => {
      await api('/api/me', { method: 'DELETE' })
      logout()
      navigate('/login', { replace: true })
    })
  }

  return (
    <AppShell>
      <header className="page-head"><h1 className="display">Ajustes</h1></header>

      <Link to="/perfil" className="card profile-card">
        <Avatar name={user.full_name} src={user.avatar_url} size={56} />
        <span className="row-text">
          <strong>{user.full_name}</strong>
          <small className="muted">{user.username ? `@${user.username}` : user.email}</small>
        </span>
        <span className="link-small">Editar</span>
      </Link>

      <div className="private-note">
        <Icon name="shield" size={20} />
        <span><strong>Tus memorias son solo tuyas.</strong><small>Privado por defecto. Una persona solo ve lo que etiquetas con ella, y solo cuando os conectéis.</small></span>
      </div>

      <ErrorBox error={err} />
      {msg && <div className="alert alert-ok">{msg}</div>}

      <h2 className="small-title">Cuenta</h2>
      <div className="card list">
        <ListRow to="/perfil" icon="user" title="Mi perfil" subtitle="Foto, nombre, algo sobre ti y cumpleaños" />
        <ListRow icon="lock" title="Cambiar contraseña" subtitle="Más seguridad para tu cuenta" onClick={() => open('password')} />
        {panel === 'password' && (
          <form onSubmit={savePassword} className="inline-panel stack">
            <Field label="Contraseña actual" htmlFor="cp">
              <PasswordInput id="cp" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
            </Field>
            <Field label="Nueva contraseña" htmlFor="np">
              <PasswordInput id="np" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
              <PasswordChecklist password={pw.new_password} />
            </Field>
            <button className="btn btn-primary">Actualizar contraseña</button>
          </form>
        )}
      </div>

      <h2 className="small-title">Privacidad</h2>
      <div className="card list">
        <ListRow icon="shield" title="Quién puede ver tu contenido" subtitle="Solo las personas etiquetadas" onClick={() => open('privacy')} />
        {panel === 'privacy' && (
          <div className="inline-panel">
            <p className="muted">
              Cada recuerdo es tuyo. Solo lo verá una persona cuando la etiquetes y, además, esté conectada contigo.
              Lo que guardas con Sofía no lo ve Allison, y al revés.
            </p>
          </div>
        )}
        <ListRow to="/personas" icon="users" title="Tus personas" subtitle="Sus cofres, fechas y fotos" />
      </div>

      <h2 className="small-title">Próximamente</h2>
      <div className="card list soon-list">
        <div className="list-row" aria-disabled="true"><span className="row-icon"><Icon name="bell" size={20} /></span><span className="row-text"><strong>Notificaciones</strong><small>Push y correo</small></span></div>
        <div className="list-row" aria-disabled="true"><span className="row-icon"><Icon name="lock" size={20} /></span><span className="row-text"><strong>Verificación en dos pasos</strong><small>Una capa extra de seguridad</small></span></div>
        <div className="list-row" aria-disabled="true"><span className="row-icon"><Icon name="archive" size={20} /></span><span className="row-text"><strong>Exportar mis datos</strong><small>Descarga todos tus recuerdos</small></span></div>
      </div>

      <div className="card list">
        <ListRow icon="logout" title="Cerrar sesión" onClick={() => { logout(); navigate('/login', { replace: true }) }} />
        <ListRow icon="trash" title="Eliminar cuenta" subtitle="Borra tu cuenta de forma permanente" danger onClick={deleteAccount} />
      </div>
      <p className="handwritten center">Simple. Seguro. Tuyo. ♡</p>
    </AppShell>
  )
}
