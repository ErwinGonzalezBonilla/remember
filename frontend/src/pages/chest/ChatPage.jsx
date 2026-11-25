import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api, mediaUrl } from '../../api/client'
import Icon from '../../components/Icon'
import IOSMenu from '../../components/IOSMenu'
import { AppShell, Avatar, EmptyState, ErrorBox, Spinner, TopBar } from '../../components/ui'
import { AUDIO_ACCEPT, compressImage, progressText, tooBig, uploadFile, withMime } from '../../media'
import VoiceRecorder, { canRecord } from '../memories/VoiceRecorder'
import { useChestPerson } from './ChestPages'
import { firstName } from './chestUtils'

/** Cada cuánto se preguntan los mensajes nuevos mientras el chat está abierto (Vercel no tiene websockets). */
const POLL_MS = 4000
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const hhmm = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
function dayLabel(iso) {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const day = new Date(d); day.setHours(0, 0, 0, 0)
  const diff = Math.round((today - day) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  if (diff < 7) return WEEKDAYS[d.getDay()].replace(/^./, (c) => c.toUpperCase())
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}${d.getFullYear() !== today.getFullYear() ? ` de ${d.getFullYear()}` : ''}`
}

function Bubble({ m, selected, onSelect, onDelete, seen }) {
  const time = hhmm(m.created_at)
  return (
    <li className={`msg ${m.mine ? 'mine' : 'theirs'} kind-${m.kind} ${selected ? 'selected' : ''}`}>
      <div className="msg-bubble" onClick={m.mine ? onSelect : undefined}>
        {m.kind === 'photo' && (
          <a href={mediaUrl(m.media_url)} target="_blank" rel="noopener noreferrer" className="msg-photo" onClick={(e) => e.stopPropagation()}>
            <img src={mediaUrl(m.media_url)} alt={m.mine ? 'Foto que enviaste' : 'Foto recibida'} loading="lazy" />
          </a>
        )}
        {m.kind === 'audio' && <audio src={mediaUrl(m.media_url)} controls preload="metadata" className="msg-audio" aria-label="Nota de voz" />}
        {m.body && <p>{m.body}</p>}
        <span className="msg-meta">
          <time dateTime={m.created_at}>{time}</time>
          {seen && <span className="msg-seen"><Icon name="check" size={12} stroke={2.6} /> Visto</span>}
        </span>
      </div>
      {m.mine && (
        <button type="button" className="msg-del" onClick={onDelete} aria-label={`Borrar tu mensaje de las ${time}`}>
          <Icon name="trash" size={16} />
        </button>
      )}
    </li>
  )
}

/** Conversación 1 a 1 con una persona conectada: texto, fotos y notas de voz. */
export default function ChatPage() {
  const { person, id, name, gate } = useChestPerson()
  const [chat, setChat] = useState(null)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState('')
  const [voice, setVoice] = useState(false)
  const [selected, setSelected] = useState(null)
  const list = useRef(null)
  const atBottom = useRef(true)
  const audioInput = useRef(null)
  const lastId = useRef(null)

  const load = useCallback(async () => {
    try {
      setChat(await api(`/api/people/${id}/chat`))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [id])

  // Sondeo mientras el chat está abierto y visible
  useEffect(() => {
    load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  // Bajar al último mensaje cuando llega uno nuevo (si ya estabas abajo)
  const messages = chat?.messages || []
  const newest = messages.at(-1)?.id ?? null
  useLayoutEffect(() => {
    if (newest !== lastId.current && (atBottom.current || newest && messages.at(-1)?.mine)) {
      window.scrollTo({ top: document.documentElement.scrollHeight })
    }
    lastId.current = newest
  }, [newest]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onScroll = () => { atBottom.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80 }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  async function post(body) {
    const msg = await api(`/api/people/${id}/chat`, { method: 'POST', body })
    setChat((c) => ({ ...c, messages: [...c.messages, msg] }))
    atBottom.current = true
  }

  async function sendText(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body || busy) return
    setBusy('Enviando…')
    try { await post({ kind: 'text', body }); setText('') } catch (e2) { setError(e2.message) } finally { setBusy('') }
  }

  async function sendFile(raw, kind) {
    if (!raw || busy) return
    setError('')
    const file = kind === 'photo' ? await compressImage(withMime(raw)) : withMime(raw)
    const big = tooBig(file, kind)
    if (big) return setError(big)
    setBusy(progressText(kind, null))
    try {
      const key = await uploadFile(file, kind, (pct) => setBusy(progressText(kind, pct)))
      await post({ kind, media_key: key, body: kind === 'photo' ? text.trim() || null : null })
      if (kind === 'photo') setText('')
      setVoice(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  async function remove(m) {
    if (!confirm('¿Borrar este mensaje? Desaparecerá también para la otra persona.')) return
    try {
      await api(`/api/chat/${m.id}`, { method: 'DELETE' })
      setChat((c) => ({ ...c, messages: c.messages.filter((x) => x.id !== m.id) }))
      setSelected(null)
    } catch (e) {
      setError(e.message)
    }
  }

  if (gate) return gate
  const avatar = chat?.avatar_url || person.photo_url || person.about?.avatar_url
  // "Visto" solo en mi último mensaje leído
  const lastSeen = [...messages].reverse().find((m) => m.mine && m.read_at)?.id

  return (
    <AppShell nav={false}>
      <TopBar title={<span className="chat-title"><Avatar name={person.name} src={avatar} size={32} /> {name}</span>} />
      <ErrorBox error={error} />
      {!chat && !error && <Spinner />}
      {chat && !chat.can_chat && (
        <EmptyState icon="chat" title={`Podréis chatear cuando ${firstName(person.name)} se conecte`}
          text={`Cuando ${name} cree su cuenta y os conectéis, aquí tendréis un chat solo para vosotros dos.`} />
      )}
      {chat?.can_chat && (
        <>
          <p className="chat-private"><Icon name="lock" size={13} /> Solo {name} y tú veis esta conversación</p>
          {!messages.length && <p className="muted center chat-empty">Escribe el primer mensaje a {name} 💬</p>}
          <ol className="chat-list" ref={list} aria-label={`Conversación con ${name}`}>
            {messages.map((m, i) => {
              const showDay = i === 0 || dayLabel(m.created_at) !== dayLabel(messages[i - 1].created_at)
              return [
                showDay && <li key={`d${m.id}`} className="chat-day" aria-hidden="false"><span>{dayLabel(m.created_at)}</span></li>,
                <Bubble key={m.id} m={m} seen={m.id === lastSeen} selected={selected === m.id}
                  onSelect={() => setSelected((s) => (s === m.id ? null : m.id))} onDelete={() => remove(m)} />,
              ]
            })}
          </ol>

          <div className="chat-compose">
            {voice && (
              <div className="chat-voice">
                <VoiceRecorder addLabel="Enviar" onRecorded={(f) => sendFile(f, 'audio')} onCancel={() => setVoice(false)} />
              </div>
            )}
            {busy && <p className="chat-busy" role="status">{busy}</p>}
            <form className="chat-form" onSubmit={sendText}>
              <label className="chat-icon-btn" aria-label="Enviar una foto">
                <Icon name="camera" size={22} />
                <input type="file" accept="image/*" className="sr-only" disabled={!!busy}
                  onChange={(e) => { sendFile(e.target.files[0], 'photo'); e.target.value = '' }} />
              </label>
              <input className="chat-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000}
                placeholder={`Mensaje para ${name}…`} aria-label={`Mensaje para ${name}`} />
              {text.trim() ? (
                <button type="submit" className="chat-send" disabled={!!busy} aria-label="Enviar mensaje"><Icon name="send" size={20} /></button>
              ) : voice ? (
                <button type="button" className="chat-send on" onClick={() => setVoice(false)} aria-label="Cerrar la grabadora">
                  <Icon name="x" size={20} />
                </button>
              ) : (
                // Notas de voz: el mismo menú (estilo iOS) que en Nueva cápsula
                <IOSMenu label="Enviar una nota de voz" align="right" items={[
                  { label: 'Grabar nota de voz', icon: 'mic', disabled: !canRecord(), onSelect: () => setVoice(true) },
                  { label: 'Seleccionar archivos', icon: 'folder', onSelect: () => audioInput.current?.click() },
                ]}>
                  {(props) => (
                    <button type="button" {...props} className="chat-send" disabled={!!busy} aria-label="Nota de voz">
                      <Icon name="mic" size={20} />
                    </button>
                  )}
                </IOSMenu>
              )}
              <input ref={audioInput} type="file" accept={AUDIO_ACCEPT} className="sr-only" aria-hidden="true" tabIndex={-1}
                onChange={(e) => { sendFile(e.target.files[0], 'audio'); e.target.value = '' }} />
            </form>
          </div>
        </>
      )}
    </AppShell>
  )
}
