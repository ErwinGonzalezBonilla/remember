import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { AppShell, EmptyState, ErrorBox, PrivateBadge, Spinner, TopBar } from '../../components/ui'
import { useApi } from '../../hooks'
import CapsuleCard from './CapsuleCard'

export default function CapsulesPage() {
  const { data, loading, error } = useApi('/api/capsules')
  const [tab, setTab] = useState(null)
  // Por defecto: "Recibidas" si te han dejado alguna; si no, "Enviadas".
  const current = tab || (data?.received.length ? 'received' : 'sent')
  const list = data?.[current] || []

  return (
    <AppShell>
      <TopBar title="Cápsulas del tiempo" />
      <section className="capsule-hero">
        <span className="capsule-hero-icon"><Icon name="gift" size={26} /></span>
        <div>
          <h2>Un regalo para el futuro</h2>
          <p>Escribe una carta, añade fotos, videos o audios, y elige el día en que se abrirá. Hasta entonces, nadie podrá verla.</p>
        </div>
        <Link to="/capsulas/nueva" className="btn btn-coral"><Icon name="plus" size={18} /> Crear una cápsula</Link>
      </section>

      <div className="chips" role="tablist">
        {[['received', 'Recibidas'], ['sent', 'Enviadas']].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={current === k} className={`chip ${current === k ? 'active' : ''}`}
            onClick={() => setTab(k)}>
            {label}{data && ` (${data[k].length})`}
          </button>
        ))}
      </div>

      <ErrorBox error={error} />
      {loading && !data && <Spinner />}
      {data && !list.length && (
        current === 'received'
          ? <EmptyState icon="gift" title="Aún no te han dejado ninguna"
              text="Cuando alguien conectado contigo selle una cápsula para ti, aparecerá aquí con su cuenta atrás." />
          : <EmptyState icon="lock" title="Todavía no has creado ninguna"
              text="Una carta para su cumpleaños número 18, un audio para vuestro aniversario… Tú eliges cuándo se abre."
              action={<Link to="/capsulas/nueva" className="btn btn-primary">Crear mi primera cápsula</Link>} />
      )}
      <div className="stack">{list.map((c) => <CapsuleCard key={c.id} c={c} />)}</div>

      <PrivateBadge text="Solo la persona destinataria podrá abrirla, y solo cuando llegue el día" />
    </AppShell>
  )
}
