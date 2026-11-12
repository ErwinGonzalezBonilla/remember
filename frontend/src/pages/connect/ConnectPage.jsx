import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '../../api/client'
import Icon from '../../components/Icon'
import { relationText, AppShell, Avatar, ErrorBox, Field, RELATIONS, TopBar } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../hooks'
import QrScan from './QrScan'

const PETROL = '#064F5B' // = --petrol (el SVG del QR no admite variables CSS)

/** Vincular por QR: enseñar mi código o escanear el de otra persona. Como alternativa,
 *  buscarla por su @usuario o correo. Después se le envía una solicitud de conexión. */
export default function ConnectPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const { data: people } = useApi('/api/people')
  const { data: requests, setData: setRequests } = useApi('/api/connect/requests')
  const [tab, setTab] = useState('mine') // mine | scan
  const [scanKey, setScanKey] = useState(0)
  const [showSearch, setShowSearch] = useState(false)
  const [q, setQ] = useState('')
  const [found, setFound] = useState(null)
  const [relation, setRelation] = useState('')
  const [personId, setPersonId] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(null)
  const [busy, setBusy] = useState(false)
  const [shared, setShared] = useState('')

  const unlinked = (people || []).filter((p) => !p.is_linked)
  const myLink = user.username ? `${window.location.origin}/c/${user.username}` : ''

  /** Busca a alguien (por @usuario o correo) y abre su perfil para enviarle la solicitud. */
  async function openProfile(term) {
    setError(''); setFound(null); setSent(null)
    setBusy(true)
    try {
      const u = await api(`/api/connect/lookup?q=${encodeURIComponent(term)}`)
      setFound(u)
      // Si ya la tienes guardada con un nombre parecido, la proponemos
      const first = u.full_name.split(' ')[0].toLowerCase()
      const match = unlinked.find((p) => p.name.toLowerCase().startsWith(first))
      setPersonId(match ? String(match.id) : '')
      setRelation(match ? match.relation : '')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Enlace del QR (/c/<usuario> → /conectar?u=<usuario>): abre directamente su perfil
  const linked = params.get('u')
  useEffect(() => {
    if (!linked || !people) return
    setParams({}, { replace: true })
    openProfile(`@${linked}`)
  }, [linked, people]) // eslint-disable-line react-hooks/exhaustive-deps

  function search(e) {
    e.preventDefault()
    const term = q.trim()
    if (term.length < 3) return setError('Escribe su @usuario o su correo completo.')
    openProfile(term)
  }

  function startScan() {
    setError(''); setSent(null)
    setTab('scan')
    setScanKey((k) => k + 1)
  }

  function openSearch() {
    setShowSearch(true)
    setTab('mine') // apaga la cámara
    setTimeout(() => document.getElementById('q')?.focus(), 50)
  }

  async function send() {
    if (!relation) return setError(`Elige quién es ${found.full_name.split(' ')[0]} para ti.`)
    setBusy(true); setError('')
    try {
      const req = await api('/api/connect/requests', {
        method: 'POST',
        body: { to_user_id: found.id, relation, person_id: personId ? Number(personId) : null },
      })
      setSent(req)
      setFound(null); setQ(''); setRelation('')
      setRequests((r) => r && { ...r, outgoing: [req, ...r.outgoing] })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function cancel(id) {
    try {
      await api(`/api/connect/requests/${id}`, { method: 'DELETE' })
      setRequests((r) => ({ ...r, outgoing: r.outgoing.filter((x) => x.id !== id) }))
    } catch (err) {
      setError(err.message)
    }
  }

  async function shareMine() {
    const text = 'Conecta conmigo en REHOMI para compartir nuestros recuerdos'
    if (navigator.share) {
      try {
        await navigator.share({ title: 'REHOMI', text, url: myLink })
        return
      } catch (err) {
        if (err?.name === 'AbortError') return // la persona cerró el menú de compartir
      }
    }
    try {
      await navigator.clipboard.writeText(myLink)
      setShared('Enlace copiado')
    } catch {
      setShared(myLink) // sin portapapeles: al menos que pueda verlo y copiarlo a mano
    }
    setTimeout(() => setShared(''), 2500)
  }

  return (
    <AppShell>
      <TopBar title="Vincular por QR" />

      <div className="qr-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'scan'} className={tab === 'scan' ? 'on' : ''}
          onClick={() => (tab === 'scan' ? null : startScan())}>
          <Icon name="scan" size={20} /> Escanear QR
        </button>
        <button type="button" role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''}
          onClick={() => setTab('mine')}>
          <Icon name="qr" size={20} /> Mi código QR
        </button>
      </div>

      {sent && (
        <div className="alert alert-ok">
          Solicitud enviada a {sent.to_user.full_name}. Cuando la acepte, os conectaréis y verás lo que haya guardado para ti.
        </div>
      )}

      {tab === 'mine' ? (
        user.username ? (
          <section className="my-qr">
            <div className="qr-code">
              <QRCodeSVG value={myLink} size={232} level="H" fgColor={PETROL} bgColor="transparent" marginSize={0}
                title={`Código QR de @${user.username}`}
                imageSettings={{ src: '/icon-192.png', height: 52, width: 52, excavate: true }} />
            </div>
            <p className="muted center">Muestra este código o compártelo con tu persona especial</p>
            <strong className="handle">@{user.username}</strong>
            <button type="button" className="btn btn-ghost" onClick={shareMine}>
              <Icon name={shared ? 'check' : 'share'} size={18} /> {shared || 'Compartir mi código'}
            </button>
          </section>
        ) : (
          <Link to="/perfil" className="card no-handle">
            <span className="create-icon"><Icon name="qr" size={22} /></span>
            <span className="row-text">
              <strong>Elige tu @usuario para tener tu código</strong>
              <small className="muted">Con él, tus personas podrán escanearte o encontrarte. Toca aquí.</small>
            </span>
            <Icon name="chevron" size={18} />
          </Link>
        )
      ) : (
        <QrScan runKey={scanKey} onHandle={(h) => openProfile(`@${h}`)} onSearch={openSearch} />
      )}

      <button type="button" className="btn btn-coral btn-big" onClick={startScan}>
        <Icon name="scan" size={24} /> Escanear QR
      </button>

      {!showSearch && <ErrorBox error={error} />}

      <div className="heart-sep" aria-hidden="true"><Icon name="heart" size={16} /></div>

      <button type="button" className="search-toggle" aria-expanded={showSearch} onClick={() => (showSearch ? setShowSearch(false) : openSearch())}>
        <Icon name="user" size={26} />
        <span>Buscar por @usuario o correo electrónico</span>
        <Icon name="chevron" size={20} className={showSearch ? 'rot' : ''} />
      </button>

      {showSearch && (
        <>
          <form onSubmit={search} className="stack">
            <Field label="Busca a alguien por su @usuario o su correo" htmlFor="q">
              <div className="search-row">
                <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="@felixflores o correo@ejemplo.com"
                  autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                <button className="btn btn-primary" disabled={busy}>Buscar</button>
              </div>
            </Field>
            <small className="hint">Solo encontrarás a alguien si escribes su @usuario o su correo exacto: así nadie puede curiosear quién está en REHOMI.</small>
          </form>
          <ErrorBox error={error} />
        </>
      )}

      {found && (
        <section className="card stack">
          <div className="result">
            <Avatar name={found.full_name} src={found.avatar_url} size={56} />
            <span className="row-text">
              <strong>{found.full_name}</strong>
              {found.username && <small className="muted">@{found.username}</small>}
            </span>
          </div>

          <Field label={`¿Quién es ${found.full_name.split(' ')[0]} para ti?`} htmlFor="rel">
            <div className="chips" id="rel" role="radiogroup">
              {Object.entries(RELATIONS).map(([value, label]) => (
                <button type="button" key={value} role="radio" aria-checked={relation === value}
                  className={`chip ${relation === value ? 'active' : ''}`} onClick={() => setRelation(value)}>{label}</button>
              ))}
            </div>
          </Field>

          {unlinked.length > 0 && (
            <Field label="¿Ya la tienes en tu lista de personas?" htmlFor="pp"
              hint="Si es así, lo que hayas guardado con ella también se compartirá cuando acepte.">
              <select id="pp" value={personId} onChange={(e) => setPersonId(e.target.value)}>
                <option value="">No, añádela como nueva</option>
                {unlinked.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {relationText(p)} · {p.memory_count} recuerdos</option>
                ))}
              </select>
            </Field>
          )}

          <button type="button" className="btn btn-primary" onClick={send} disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </section>
      )}

      {requests?.outgoing.length > 0 && (
        <>
          <h2 className="small-title">Esperando respuesta</h2>
          <div className="card list">
            {requests.outgoing.map((r) => (
              <div key={r.id} className="member-row">
                <Avatar name={r.to_user.full_name} src={r.to_user.avatar_url} size={40} />
                <span className="row-text">
                  <strong>{r.to_user.full_name}</strong>
                  <small>{RELATIONS[r.relation]} · pendiente</small>
                </span>
                <button className="btn-text danger" onClick={() => cancel(r.id)}>Cancelar</button>
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  )
}
