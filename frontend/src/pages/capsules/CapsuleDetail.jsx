import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api/client'
import Icon from '../../components/Icon'
import { AppShell, ErrorBox, Spinner, TopBar, formatDate } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../hooks'
import CapsuleOpenView from './CapsuleOpenView'
import { countsText, openDateText, useCountdown } from './capsuleUtils'

function Countdown({ iso, onDone }) {
  const r = useCountdown(iso, onDone)
  const parts = [[r.days, r.days === 1 ? 'día' : 'días'], [r.hours, 'horas'], [r.minutes, 'min'], [r.seconds, 'seg']]
  return (
    <div className="countdown" role="timer" aria-label={`Faltan ${r.days} días y ${r.hours} horas`}>
      {parts.map(([n, label]) => (
        <span key={label}><strong>{String(n).padStart(2, '0')}</strong><small>{label}</small></span>
      ))}
    </div>
  )
}

export default function CapsuleDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { data: c, setData, loading, error, reload } = useApi(`/api/capsules/${id}`)
  const [err, setErr] = useState('')

  if (loading && !c) return <AppShell nav={false}><Spinner /></AppShell>
  if (error) return <AppShell nav={false}><TopBar title="Cápsula" /><ErrorBox error={error} /></AppShell>

  const run = async (fn) => { setErr(''); try { await fn() } catch (e) { setErr(e.message) } }
  const remove = () => {
    if (!confirm('¿Eliminar esta cápsula? Se borrará para siempre, también para quien la iba a recibir.')) return
    run(async () => {
      await api(`/api/capsules/${id}`, { method: 'DELETE' })
      navigate('/capsulas', { replace: true })
    })
  }

  const counts = countsText(c.item_counts)

  // ----- Destinataria antes de la fecha: solo la cuenta atrás -----
  if (c.locked) {
    return (
      <AppShell nav={false}>
        <TopBar title="Cápsula del tiempo" />
        <section className="capsule-locked">
          <div className="capsule-box" aria-hidden="true"><Icon name="lock" size={40} /></div>
          <small className="eyebrow light">De {c.author_name}</small>
          <h1>{c.title}</h1>
          <p>Se abrirá el <b>{openDateText(c.open_at)}</b></p>
          <Countdown iso={c.open_at} onDone={reload} />
          {counts && <p className="capsule-contents">Dentro hay {counts}… y quién sabe qué más 🤫</p>}
        </section>
        <div className="first-memory">
          <span className="hl-icon"><Icon name="sparkle" size={22} /></span>
          <div>
            <strong>Es una sorpresa</strong>
            <p className="muted">Nadie puede ver lo que hay dentro hasta ese momento, ni siquiera REHOMI. Te avisaremos por correo cuando se abra.</p>
          </div>
        </div>
      </AppShell>
    )
  }

  const back = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/capsulas', { replace: true })
  }
  const menuItems = [
    ...(c.status === 'open' ? [{ label: 'Ir a comentarios', icon: 'chat', run: () => document.getElementById('comentarios')?.scrollIntoView({ behavior: 'smooth' }) }] : []),
    ...(c.is_author && c.status === 'draft' ? [{ label: 'Editar cápsula', icon: 'edit', run: () => navigate(`/capsulas/${id}/editar`) }] : []),
    ...(c.is_author ? [{ label: 'Eliminar cápsula', icon: 'trash', danger: true, run: remove }] : []),
  ]

  return (
    <AppShell nav={false}>
      <CapsuleOpenView capsule={c} setData={setData} me={user} onBack={back} menuItems={menuItems}>
        <ErrorBox error={err} />
        {location.state?.sealed && c.status === 'sealed' && (
          <div className="alert alert-ok">¡Cápsula sellada! 🔒 {c.person?.name} la podrá abrir el {openDateText(c.open_at)}.</div>
        )}
        {c.is_author && c.status !== 'open' && (
          <section className={`capsule-banner ${c.status}`}>
            <span className="capsule-seal"><Icon name={c.status === 'draft' ? 'edit' : 'lock'} size={22} /></span>
            <div>
              <strong>{c.status === 'draft' ? 'Borrador: aún no está sellada' : `Sellada para ${c.person?.name || '—'}`}</strong>
              <small>{c.status === 'draft'
                ? 'Nadie más la ve. Cuando esté lista, séllala para empezar la cuenta atrás.'
                : `Solo tú ves su contenido hasta el ${openDateText(c.open_at)}.`}</small>
            </div>
            {c.status === 'sealed' && <Countdown iso={c.open_at} onDone={reload} />}
            {c.status === 'draft' && <Link to={`/capsulas/${id}/editar`} className="btn btn-primary">Continuar y sellar</Link>}
          </section>
        )}
        {c.is_author && !c.person && (
          <div className="alert alert-error">Esta cápsula ya no tiene destinatario porque borraste a esa persona de tu lista.</div>
        )}
        {c.status === 'open' && (
          <p className="cv-meta">
            {c.is_author ? `Para ${c.person?.name || 'su destinatario'} · ` : ''}
            Guardada el {formatDate(c.sealed_at || c.created_at)} · abierta el {formatDate(c.open_at)}
          </p>
        )}
      </CapsuleOpenView>
    </AppShell>
  )
}
