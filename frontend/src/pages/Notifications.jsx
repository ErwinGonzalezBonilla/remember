import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { AppShell, Avatar, EmptyState, ErrorBox, Spinner, TopBar } from '../components/ui'
import { useApi } from '../hooks'
import PushToggle from '../components/PushToggle'

const KIND = { photo: 'una foto', video: 'un video', audio: 'un audio', text: 'una nota' }

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000)
  if (s < 60) return 'ahora'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  const d = Math.floor(s / 86400)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

export function noticeText(n) {
  const first = n.actor_name.split(' ')[0]
  if (n.kind === 'comment') return <><b>{first}</b> comentó en «{n.memory_title}»</>
  if (n.kind === 'reply') return <><b>{first}</b> respondió a tu comentario en «{n.memory_title}»</>
  return <><b>{first}</b> guardó {KIND[n.memory_kind] || 'un recuerdo'} contigo: «{n.memory_title}»</>
}

/** Avisos: quién te etiquetó en un recuerdo o comentó. Al abrir la pantalla quedan como leídos. */
export default function Notifications() {
  const { data, loading, error } = useApi('/api/notifications')

  useEffect(() => {
    if (data?.unread) api('/api/notifications/read', { method: 'POST' }).catch(() => {})
  }, [data])

  return (
    <AppShell>
      <TopBar title="Avisos" />
      <PushToggle />
      <ErrorBox error={error} />
      {loading && !data && <Spinner />}
      {data && !data.items.length && (
        <EmptyState icon="bell" title="Todavía no tienes avisos"
          text="Cuando alguien guarde un recuerdo contigo o comente en uno vuestro, te avisaremos aquí y por correo." />
      )}
      {data?.items.length > 0 && (
        <div className="card list">
          {data.items.map((n) => (
            <Link key={n.id} to={`/recuerdo/${n.memory_id}`} className={`list-row notice ${n.read ? '' : 'unread'}`}>
              <Avatar name={n.actor_name} src={n.actor_avatar} size={42} />
              <span className="row-text">
                <span>{noticeText(n)}</span>
                <small>{timeAgo(n.created_at)}</small>
              </span>
              {!n.read && <span className="notice-dot" aria-label="Nuevo" />}
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  )
}
