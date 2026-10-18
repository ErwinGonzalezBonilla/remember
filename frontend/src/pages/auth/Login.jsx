import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ErrorBox, Field, PasswordInput } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import AuthLayout from './AuthLayout'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!EMAIL_RE.test(email)) return setError('Ingresa un correo electrónico válido.')
    setBusy(true); setError('')
    try {
      await login(email, password)
      navigate(location.state?.from || '/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Iniciar sesión"
      subtitle="Accede a tu cuenta"
      footer={<>¿Aún no tienes cuenta? <Link to="/registro" state={location.state}>Crear una cuenta</Link></>}
    >
      <form onSubmit={submit} noValidate className="stack">
        <ErrorBox error={error} />
        <Field label="Correo electrónico" htmlFor="email">
          <input id="email" type="email" autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="nombre@email.com" required />
        </Field>
        <Field label="Contraseña" htmlFor="password">
          <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Link to="/recuperar" className="link-small">¿Olvidaste tu contraseña?</Link>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Entrando…' : 'Iniciar sesión'}</button>
      </form>
    </AuthLayout>
  )
}
