import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { ErrorBox, Field } from '../../components/ui'
import AuthLayout from './AuthLayout'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Ingresa un correo electrónico válido.')
    setBusy(true); setError('')
    try {
      const res = await api('/api/auth/forgot-password', { method: 'POST', body: { email } })
      setSent(res.message)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Olvidé mi contraseña"
      subtitle="Recupera el acceso a tu cuenta"
      footer={<Link to="/login">Volver a iniciar sesión</Link>}
    >
      {sent ? (
        <div className="alert alert-ok">📬 {sent}</div>
      ) : (
        <form onSubmit={submit} noValidate className="stack">
          <ErrorBox error={error} />
          <Field label="Correo electrónico" htmlFor="email">
            <input id="email" type="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="nombre@email.com" required />
          </Field>
          <button className="btn btn-lavender" disabled={busy}>{busy ? 'Enviando…' : 'Enviar enlace'}</button>
        </form>
      )}
    </AuthLayout>
  )
}
