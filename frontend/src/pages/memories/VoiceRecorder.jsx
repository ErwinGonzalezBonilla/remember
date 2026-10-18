import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon'

/** Graba una nota de voz con el micrófono y devuelve un File (audio/webm o audio/mp4 en Safari). */
export default function VoiceRecorder({ onRecorded }) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const recorder = useRef(null)
  const timer = useRef(null)

  useEffect(() => () => {
    clearInterval(timer.current)
    recorder.current?.stream.getTracks().forEach((t) => t.stop())
  }, [])

  async function start() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      const chunks = []
      rec.ondataavailable = (e) => chunks.push(e.data)
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const type = (rec.mimeType || 'audio/webm').split(';')[0] // sin ";codecs=…" para el backend
        const ext = type === 'audio/mp4' ? 'm4a' : 'webm'
        onRecorded(new File(chunks, `nota-de-voz.${ext}`, { type }))
      }
      rec.start()
      recorder.current = rec
      setSeconds(0)
      setRecording(true)
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      setError('No se pudo acceder al micrófono. Revisa los permisos del navegador.')
    }
  }

  function stop() {
    clearInterval(timer.current)
    recorder.current?.stop()
    setRecording(false)
  }

  const mm = String(Math.floor(seconds / 60)).padStart(1, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <div className="recorder">
      <button type="button" className={`rec-btn ${recording ? 'on' : ''}`} onClick={recording ? stop : start}
        aria-label={recording ? 'Detener grabación' : 'Grabar nota de voz'}>
        <Icon name={recording ? 'x' : 'mic'} size={26} />
      </button>
      <span>{recording ? `Grabando… ${mm}:${ss}` : 'Toca para grabar'}</span>
      {error && <small className="error-text">{error}</small>}
    </div>
  )
}
