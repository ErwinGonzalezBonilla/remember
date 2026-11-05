import Logo from '../../components/Logo'

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <div className="auth-brand band">
        <Logo size={52} onDark />
        <p className="handwritten">Tu historia, en un solo lugar ♡</p>
      </div>
      <section className="card auth-card">
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </section>
      {footer && <div className="auth-footer">{footer}</div>}
    </div>
  )
}
