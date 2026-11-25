import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'

/**
 * Formatos en orden de preferencia. Safari (iPhone) solo graba audio/mp4; Chrome y Firefox, webm/ogg con Opus.
 * El servidor acepta los tres (audio/mp4, audio/webm y audio/ogg).
 */
const TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']
const EXT = { 'audio/mp4': 'm4a', 'audio/webm': 'weba', 'audio/ogg': 'ogg' }

function pickType() {
  if (typeof MediaRecorder === 'undefined') return null
  return TYPES.find((t) => MediaRecorder.isTypeSupported?.(t)) || ''
}

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
export const canRecord = () => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

/**
 * Grabadora de notas de voz en la página: grabar, pausar y seguir, escuchar, repetir y añadir.
 * Al tocar "Añadir" llama a onRecorded(File) con audio/mp4 (Safari), audio/webm u audio/ogg.
 */
export default function VoiceRecorder({ onRecorded, addLabel = 'Añadir', onCancel }) {
  const [state, setState] = useState('idle')   // idle | recording | paused | done
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const [file, setFile] = useState(null)
  const [url, setUrl] = useState(null)
  const recorder = useRef(null)
  const timer = useRef(null)
  const discard = useRef(false)

  // Al salir: parar el micrófono y liberar la grabación
  useEffect(() => () => {
    clearInterval(timer.current)
    discard.current = true
    if (recorder.current?.state !== 'inactive') recorder.current?.stop()
    recorder.current?.stream.getTracks().forEach((t) => t.stop())
  }, [])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  const tick = () => { clearInterval(timer.current); timer.current = setInterval(() => setSeconds((s) => s + 1), 1000) }

  async function start() {
    setError('')
    if (!canRecord()) return setError('Este navegador no puede grabar audio. Elige un archivo.')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const type = pickType()
      const rec = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream)
      const chunks = []
      rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        clearInterval(timer.current)
        if (discard.current) { discard.current = false; return }
        const mime = (rec.mimeType || type || 'audio/webm').split(';')[0]   // sin ";codecs=…" para el servidor
        const f = new File(chunks, `nota-de-voz.${EXT[mime] || 'weba'}`, { type: mime })
        if (!f.size) { setState('idle'); setError('No se grabó nada. Inténtalo de nuevo.'); return }
        setFile(f)
        setUrl(URL.createObjectURL(f))
        setState('done')
      }
      discard.current = false
      rec.start(1000)   // trozos de 1 s: Safari a veces no entrega nada sin timeslice
      recorder.current = rec
      setSeconds(0)
      setState('recording')
      tick()
    } catch {
      setError('No se pudo acceder al micrófono. Revisa los permisos del navegador.')
    }
  }

  function pause() {
    const rec = recorder.current
    if (rec?.state === 'recording' && rec.pause) { rec.pause(); clearInterval(timer.current); setState('paused') }
  }
  function resume() {
    const rec = recorder.current
    if (rec?.state === 'paused') { rec.resume(); tick(); setState('recording') }
  }
  function stop() {
    clearInterval(timer.current)
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
  }
  function again() {
    setFile(null)
    setUrl(null)
    setSeconds(0)
    start()
  }
  function add() {
    if (!file) return
    onRecorded(file)
    setFile(null)
    setUrl(null)
    setSeconds(0)
    setState('idle')
  }

  const canPause = typeof MediaRecorder !== 'undefined' && 'pause' in MediaRecorder.prototype
  const live = state === 'recording' || state === 'paused'
  return (
    <div className={`recorder is-${state}`}>
      {state === 'idle' && (
        <>
          <button type="button" className="rec-btn" onClick={start} aria-label="Empezar a grabar una nota de voz">
            <Icon name="mic" size={28} />
          </button>
          <span>Toca para grabar</span>
        </>
      )}

      {live && (
        <>
          <div className="rec-live" role="timer" aria-label={`${state === 'paused' ? 'En pausa' : 'Grabando'}: ${clock(seconds)}`}>
            <span className={`rec-dot ${state}`} aria-hidden="true" />
            <strong>{clock(seconds)}</strong>
            <span className="muted">{state === 'paused' ? 'En pausa' : 'Grabando…'}</span>
          </div>
          <div className="rec-controls">
            {canPause && (state === 'recording'
              ? <button type="button" className="rec-ctrl" onClick={pause}><Icon name="pause" size={20} filled /> Pausar</button>
              : <button type="button" className="rec-ctrl" onClick={resume}><Icon name="mic" size={20} /> Seguir</button>)}
            <button type="button" className="rec-ctrl primary" onClick={stop}><Icon name="check" size={20} /> Terminar</button>
          </div>
        </>
      )}

      {state === 'done' && url && (
        <>
          <p className="rec-ready">Nota de voz de {clock(seconds)}. Escúchala antes de añadirla.</p>
          <audio src={url} controls className="rec-audio" aria-label="Escuchar la grabación" />
          <div className="rec-controls">
            <button type="button" className="rec-ctrl" onClick={again}><Icon name="refresh" size={18} /> Repetir</button>
            <button type="button" className="rec-ctrl primary" onClick={add}><Icon name="plus" size={18} /> {addLabel}</button>
          </div>
        </>
      )}

      {onCancel && state === 'idle' && <button type="button" className="btn-text" onClick={onCancel}>Cancelar</button>}
      <p className="sr-only" aria-live="polite">
        {state === 'recording' ? 'Grabando' : state === 'paused' ? 'Grabación en pausa' : state === 'done' ? 'Grabación lista para escuchar' : ''}
      </p>
      {error && <small className="error-text" role="alert">{error}</small>}
    </div>
  )
}
