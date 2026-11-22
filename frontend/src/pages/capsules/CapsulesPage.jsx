import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { AppShell, Avatar, EmptyState, ErrorBox, PrivateBadge, Spinner, TopBar } from '../../components/ui'
import { useApi } from '../../hooks'
import CapsuleCard from './CapsuleCard'
import { isReady, remainingText } from './capsuleUtils'

const STATUS = [['all', 'Todas'], ['sealed', 'Selladas'], ['open', 'Abiertas'], ['draft', 'Borradores']]
const plain = (s = '') => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
const time = (c) => new Date(c.open_at).getTime()

/** Con quién es cada cápsula: quien te la dejó (Recibidas) o para quién es (Enviadas). */
function connectionOf(c) {
  if (!c.is_author) return { key: `de:${c.author_id}`, name: c.author_name, photo: c.author_avatar }
  if (!c.person) return { key: 'nadie', name: 'Sin destinatario', photo: null }
  return { key: `para:${c.person.id}`, name: c.person.name, photo: c.person.photo_url }
}

/** Dentro de un grupo: las listas primero, luego por fecha de apertura, los borradores y al final las ya vistas. */
function rank(c, now) {
  if (isReady(c, now)) return 0
  return { sealed: 1, draft: 2, open: 3 }[c.status]
}

function buildGroups(list, now) {
  const map = new Map()
  for (const c of list) {
    const who = connectionOf(c)
    if (!map.has(who.key)) map.set(who.key, { ...who, capsules: [] })
    map.get(who.key).capsules.push(c)
  }
  const groups = [...map.values()].map((g) => {
    g.capsules.sort((a, b) => rank(a, now) - rank(b, now) || (a.status === 'open' ? time(b) - time(a) : time(a) - time(b)))
    g.ready = g.capsules.filter((c) => isReady(c, now)).length
    g.next = g.capsules.find((c) => c.status === 'sealed' && time(c) > now) || null
    return g
  })
  // Las que se pueden abrir ya, arriba; después, la que antes se abra.
  return groups.sort((a, b) => (b.ready > 0) - (a.ready > 0)
    || (a.next ? time(a.next) : Infinity) - (b.next ? time(b.next) : Infinity)
    || a.name.localeCompare(b.name, 'es'))
}

function summary(g, received) {
  const n = g.capsules.length
  const count = `${n} ${n === 1 ? 'cápsula' : 'cápsulas'}`
  if (g.ready) {
    const what = received ? (g.ready === 1 ? '¡una ya se puede abrir!' : `${g.ready} listas para abrir`)
      : (g.ready === 1 ? 'una ya se abrió' : `${g.ready} ya se abrieron`)
    return `${count} · ${what}`
  }
  if (g.next) return `${count} · ${n === 1 ? 'se abre' : 'la próxima se abre'} ${remainingText(g.next.open_at)}`
  const drafts = g.capsules.filter((c) => c.status === 'draft').length
  if (drafts === n) return `${count} · en borrador`
  return `${count} · ${n === 1 ? 'ya abierta' : 'ya abiertas'}`
}

function FilterMenu({ status, onStatus, query, onQuery, options }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const button = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (ev) => { if (!ref.current?.contains(ev.target)) setOpen(false) }
    // Con Escape, el foco vuelve al botón (si no, se perdería al desaparecer el menú)
    const onKey = (ev) => { if (ev.key === 'Escape') { setOpen(false); button.current?.focus() } }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])
  const active = status !== 'all' || query.trim()
  return (
    <div className="cal-filter" ref={ref}>
      <button type="button" ref={button} className={`icon-btn ${active ? 'on' : ''}`} onClick={() => setOpen((o) => !o)}
        aria-label="Filtrar cápsulas" aria-haspopup="dialog" aria-expanded={open}>
        <Icon name="sliders" />
        {active && <span className="cal-filter-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="cal-filter-menu capsule-filter-menu glass glass-thick" role="dialog" aria-label="Filtrar cápsulas">
          <label className="capsule-search">
            <Icon name="user" size={16} />
            <input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Buscar persona"
              aria-label="Buscar persona por nombre" autoFocus />
          </label>
          <small className="capsule-filter-label">Estado</small>
          <div role="radiogroup" aria-label="Estado">
            {options.map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={status === id} onClick={() => onStatus(id)}>
                <span>{label}</span>{status === id && <Icon name="check" size={16} />}
              </button>
            ))}
          </div>
          {active && (
            <button type="button" className="capsule-filter-clear"
              onClick={() => { onStatus('all'); onQuery(''); setOpen(false); button.current?.focus() }}>
              Quitar filtros
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Group({ g, open, onToggle, received }) {
  const id = `grupo-${g.key.replace(/[^a-z0-9]/gi, '-')}`
  return (
    <section className={`capsule-group ${open ? 'open' : ''} ${g.ready ? 'ready' : ''}`}>
      <button type="button" className="capsule-group-head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <Avatar name={g.name} src={g.photo} size={46} />
        <span className="capsule-group-text">
          <strong>{g.name}</strong>
          <small>{summary(g, received)}</small>
        </span>
        {g.ready > 0 && <span className="capsule-group-badge" aria-hidden="true"><Icon name="gift" size={16} /></span>}
        <Icon name="down" size={20} className="capsule-group-chev" />
      </button>
      <div className="capsule-group-body" id={id} hidden={!open}>
        {g.capsules.map((c) => <CapsuleCard key={c.id} c={c} grouped />)}
      </div>
    </section>
  )
}

export default function CapsulesPage() {
  const { data, loading, error } = useApi('/api/capsules')
  const [tab, setTab] = useState(null)
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  const [toggled, setToggled] = useState({})   // grupos que la persona abrió o cerró a mano
  // Por defecto: "Recibidas" si te han dejado alguna; si no, "Enviadas".
  const current = tab || (data?.received.length ? 'received' : 'sent')
  const received = current === 'received'
  const list = data?.[current] || []
  const options = received ? STATUS.filter(([id]) => id !== 'draft') : STATUS
  const now = Date.now()

  const shown = status === 'all' ? list
    : list.filter((c) => (status === 'sealed' ? c.status === 'sealed' && time(c) > now : c.status === status
      || (status === 'open' && c.status === 'sealed' && time(c) <= now)))
  const q = plain(query)
  const groups = buildGroups(shown, now).filter((g) => !q || plain(g.name).includes(q))
  const filtering = status !== 'all' || q

  function changeTab(k) {
    setTab(k)
    setToggled({})
    if (k === 'received' && status === 'draft') setStatus('all')
  }

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

      <div className="capsule-tabs">
        <div className="chips" role="tablist">
          {[['received', 'Recibidas'], ['sent', 'Enviadas']].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={current === k} className={`chip ${current === k ? 'active' : ''}`}
              onClick={() => changeTab(k)}>
              {label}{data && ` (${data[k].length})`}
            </button>
          ))}
        </div>
        {data && list.length > 0 && (
          <FilterMenu status={status} onStatus={setStatus} query={query} onQuery={setQuery} options={options} />
        )}
      </div>

      <ErrorBox error={error} />
      {loading && !data && <Spinner />}
      {data && !list.length && (
        received
          ? <EmptyState icon="gift" title="Aún no te han dejado ninguna"
              text="Cuando alguien conectado contigo selle una cápsula para ti, aparecerá aquí con su cuenta atrás." />
          : <EmptyState icon="lock" title="Todavía no has creado ninguna"
              text="Una carta para su cumpleaños número 18, un audio para vuestro aniversario… Tú eliges cuándo se abre."
              action={<Link to="/capsulas/nueva" className="btn btn-primary">Crear mi primera cápsula</Link>} />
      )}
      {data && list.length > 0 && !groups.length && (
        <div className="capsule-none">
          <p className="muted">Ninguna cápsula coincide con el filtro.</p>
          <button type="button" className="btn-text" onClick={() => { setStatus('all'); setQuery('') }}>Quitar filtros</button>
        </div>
      )}
      <div className="stack-sm">
        {groups.map((g) => {
          const open = toggled[g.key] ?? (g.ready > 0 || (!!filtering && groups.length === 1))
          return <Group key={g.key} g={g} open={open} received={received}
            onToggle={() => setToggled((t) => ({ ...t, [g.key]: !open }))} />
        })}
      </div>

      <div className="capsule-foot">
        <PrivateBadge text="Solo la persona destinataria podrá abrirla, y solo cuando llegue el día" />
      </div>
    </AppShell>
  )
}
