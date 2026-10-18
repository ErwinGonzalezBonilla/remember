import { PASSWORD_RULES } from './passwordRules'

export default function PasswordChecklist({ password }) {
  return (
    <ul className="pw-rules" aria-live="polite">
      {PASSWORD_RULES.map((r) => (
        <li key={r.label} className={r.test(password) ? 'ok' : ''}>{r.test(password) ? '✓' : '○'} {r.label}</li>
      ))}
    </ul>
  )
}
