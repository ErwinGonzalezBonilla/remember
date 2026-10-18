import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorBox, Field, PasswordInput } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import AuthLayout from './AuthLayout'
import PasswordChecklist from './PasswordChecklist'
import { passwordOk } from './passwordRules'

export default function ResetPassword() {
  const { token } = useParams()
  const { resetPassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!passwordOk(password)) return setError('La contraseña no cumple los requisitos.')
    if (password !== confirm) return setError('Las contraseñas no coinciden.')
    setBusy(true); setError('')
    try {
      await resetPassword(token, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Crea una nueva contraseña" footer={<Link to="/recuperar">Pedir otro enlace</Link>}>
      <form onSubmit={submit} noValidate className="stack">
        <ErrorBox error={error} />
        <Field label="Nueva contraseña" htmlFor="password">
          <PasswordInput id="password" autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)} />
          <PasswordChecklist password={password} />
        </Field>
        <Field label="Confirmar contraseña" htmlFor="confirm">
          <PasswordInput id="confirm" autoComplete="new-password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar e iniciar sesión'}</button>
      </form>
    </AuthLayout>
  )
}
