import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ErrorBox, Field, PasswordInput } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import AuthLayout from './AuthLayout'
import PasswordChecklist from './PasswordChecklist'
import { passwordOk } from './passwordRules'

export default function Register() {
  const { register } = useAuth()
  const location = useLocation()
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm: '', accept_terms: false })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (form.full_name.trim().length < 2) return setError('Escribe tu nombre completo.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError('Ingresa un correo electrónico válido.')
    if (!passwordOk(form.password)) return setError('La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.')
    if (form.password !== form.confirm) return setError('Las contraseñas no coinciden.')
    if (!form.accept_terms) return setError('Debes aceptar los términos y condiciones.')
    setBusy(true); setError('')
    try {
      const { confirm: _confirm, ...data } = form
      await register(data) // al iniciar sesión, la ruta pública redirige a /bienvenida
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Crear cuenta"
      subtitle="Regístrate en Remember"
      footer={<>¿Ya tienes cuenta? <Link to="/login" state={location.state}>Inicia sesión</Link></>}
    >
      <form onSubmit={submit} noValidate className="stack">
        <ErrorBox error={error} />
        <Field label="Nombre completo" htmlFor="name">
          <input id="name" autoComplete="name" value={form.full_name} onChange={set('full_name')} required />
        </Field>
        <Field label="Correo electrónico" htmlFor="email">
          <input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')}
            placeholder="nombre@email.com" required />
        </Field>
        <Field label="Contraseña" htmlFor="password">
          <PasswordInput id="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
          <PasswordChecklist password={form.password} />
        </Field>
        <Field label="Confirmar contraseña" htmlFor="confirm">
          <PasswordInput id="confirm" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={form.accept_terms} onChange={set('accept_terms')} />
          <span>Acepto los términos y condiciones y la política de privacidad</span>
        </label>
        <button className="btn btn-coral" disabled={busy}>{busy ? 'Creando cuenta…' : 'Crear cuenta'}</button>
      </form>
    </AuthLayout>
  )
}
