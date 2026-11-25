import { useEffect, useRef, useState } from 'react'
import { mediaUrl } from '../../api/client'
import Icon from '../../components/Icon'

/** 75 → "1:15" */
export const clock = (s) => (Number.isFinite(s) && s >= 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00')

/** Duración fiable: algunos .webm/.ogg dicen Infinity hasta que se leen enteros. */
const known = (d) => Number.isFinite(d) && d > 0

/** Reproductor común (video y audio): estado, tiempo y duración. */
function useMedia(active) {
  const ref = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [failed, setFailed] = useState(false)
  const fixing = useRef(false)

  // Al pasar a otro elemento del carrusel, se pausa
  useEffect(() => { if (!active && ref.current && !ref.current.paused) ref.current.pause() }, [active])

  const toggle = () => {
    const el = ref.current
    if (!el) return
    if (el.paused) el.play().catch(() => {})
    else el.pause()
  }
  const seek = (v) => { if (ref.current) ref.current.currentTime = Number(v) }
  const events = {
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onTimeUpdate: (e) => { if (!fixing.current) setTime(e.currentTarget.currentTime) },
    onLoadedMetadata: (e) => {
      const el = e.currentTarget
      setDuration(el.duration)
      // Las grabaciones webm de Chrome no dicen su duración: saltar al final obliga al navegador a calcularla
      if (el.duration === Infinity) { fixing.current = true; el.currentTime = 1e101 }
    },
    onDurationChange: (e) => {
      const el = e.currentTarget
      setDuration(el.duration)
      if (fixing.current && Number.isFinite(el.duration)) { fixing.current = false; el.currentTime = 0; setTime(0) }
    },
    onError: () => setFailed(true),
  }
  return { ref, playing, time, duration, failed, toggle, seek, events }
}

// ---------- Carta ----------
export function LetterSlide({ capsule }) {
  return (
    <div className="cv-letter">
      <div className="cv-paper" tabIndex={0} role="document" aria-label={`Carta de ${capsule.author_name}`}>
        <p className="cv-paper-text">{capsule.message}</p>
        <p className="cv-paper-sign">Con cariño, {capsule.author_name}</p>
      </div>
      <span className="cv-wax" aria-hidden="true"><Icon name="heart" size={22} filled /></span>
    </div>
  )
}

// ---------- Foto ----------
export function PhotoSlide({ slide, near, onOpen }) {
  return (
    <button type="button" className="cv-photo" onClick={onOpen} aria-label={`${slide.label}. Ver a pantalla completa`}>
      {near && <img className="cv-photo-blur" src={mediaUrl(slide.media_url)} alt="" aria-hidden="true" draggable={false} />}
      <img src={mediaUrl(slide.media_url)} alt="" loading={near ? 'eager' : 'lazy'} draggable={false} />
      <span className="cv-photo-hint" aria-hidden="true"><Icon name="expand" size={16} /></span>
    </button>
  )
}

/** Foto a pantalla completa. Esc o el botón la cierran y el foco vuelve a la foto. */
export function Lightbox({ slide, onClose }) {
  const close = useRef(null)
  useEffect(() => {
    const before = document.activeElement
    close.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prev
      before?.focus?.()
    }
  }, [onClose])
  return (
    <div className="cv-lightbox" role="dialog" aria-modal="true" aria-label={slide.label} onClick={onClose}>
      <img src={mediaUrl(slide.media_url)} alt={slide.label} onClick={(e) => e.stopPropagation()} />
      <button ref={close} type="button" className="cv-round cv-lightbox-x" onClick={onClose} aria-label="Cerrar la foto">
        <Icon name="x" />
      </button>
    </div>
  )
}

// ---------- Video ----------
export function VideoPlayer({ slide, active, near }) {
  const wrap = useRef(null)
  const { ref, playing, time, duration, failed, toggle, seek, events } = useMedia(active)
  const [muted, setMuted] = useState(false)
  const ok = known(duration)

  function fullscreen() {
    const v = ref.current
    const w = wrap.current
    if (document.fullscreenElement) return document.exitFullscreen?.()
    if (w?.requestFullscreen) return w.requestFullscreen().catch(() => v?.webkitEnterFullscreen?.())
    v?.webkitEnterFullscreen?.()   // iPhone: solo el propio <video> puede ir a pantalla completa
  }

  return (
    <div className={`cv-video ${playing ? 'playing' : ''}`} ref={wrap}>
      <video ref={ref} src={mediaUrl(slide.media_url)} poster={mediaUrl(slide.poster_url) || undefined}
        playsInline preload={near ? 'metadata' : 'none'} muted={muted} onClick={toggle} aria-label={slide.label} {...events} />
      {failed && <p className="cv-media-error">Este navegador no puede reproducir el video. Descárgalo para verlo.</p>}
      {!playing && !failed && (
        <button type="button" className="cv-bigplay" onClick={toggle} aria-label="Reproducir el video">
          <Icon name="play" size={34} filled />
        </button>
      )}
      <div className="cv-vbar">
        <button type="button" onClick={toggle} aria-label={playing ? 'Pausar el video' : 'Reproducir el video'}>
          <Icon name={playing ? 'pause' : 'play'} size={18} filled />
        </button>
        <span className="cv-vtime"><span>{clock(time)}</span> / <span>{ok ? clock(duration) : '–:––'}</span></span>
        <input type="range" className="cv-range" min={0} max={ok ? duration : 1} step={0.1} value={ok ? time : 0}
          disabled={!ok} onChange={(e) => seek(e.target.value)} aria-label="Posición del video"
          aria-valuetext={`${clock(time)} de ${ok ? clock(duration) : 'duración desconocida'}`} />
        <button type="button" onClick={() => setMuted((m) => !m)} aria-pressed={muted} aria-label={muted ? 'Activar el sonido' : 'Silenciar'}>
          <Icon name={muted ? 'mute' : 'volume'} size={18} />
        </button>
        <button type="button" onClick={fullscreen} aria-label="Ver el video a pantalla completa">
          <Icon name="expand" size={18} />
        </button>
      </div>
    </div>
  )
}

// ---------- Audio ----------
const BARS = 36
/** Alturas fijas por audio (no cambian entre renders): una "onda" decorativa. */
function bars(seed) {
  let x = seed * 9301 + 49297
  return Array.from({ length: BARS }, (_, i) => {
    x = (x * 9301 + 49297) % 233280
    const env = Math.sin((Math.PI * (i + 0.5)) / BARS)
    return 0.25 + 0.75 * env * (0.45 + 0.55 * (x / 233280))
  })
}

const R = 70
const C = 2 * Math.PI * R

export function AudioPlayer({ slide, active, near }) {
  const { ref, playing, time, duration, failed, toggle, seek, events } = useMedia(active)
  const [wave] = useState(() => bars(Number(slide.id) || slide.n))
  const ok = known(duration)
  const pct = ok ? Math.min(1, time / duration) : 0

  return (
    <div className={`cv-audio ${playing ? 'playing' : ''}`}>
      <audio ref={ref} src={mediaUrl(slide.media_url)} preload={near ? 'metadata' : 'none'} {...events} />
      <div className="cv-disc">
        <span className="cv-ripple" aria-hidden="true" />
        <span className="cv-ripple r2" aria-hidden="true" />
        <svg className="cv-ring" viewBox="0 0 160 160" aria-hidden="true">
          <circle cx="80" cy="80" r={R} className="cv-ring-bg" />
          <circle cx="80" cy="80" r={R} className="cv-ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
        </svg>
        <button type="button" className="cv-audio-play" onClick={toggle} disabled={failed}
          aria-label={playing ? `Pausar ${slide.label.toLowerCase()}` : `Escuchar ${slide.label.toLowerCase()}`}>
          <Icon name={playing ? 'pause' : 'play'} size={40} filled />
        </button>
      </div>
      <div className="cv-wave" aria-hidden="true">
        {wave.map((h, i) => (
          <span key={i} className={i / BARS < pct ? 'on' : ''} style={{ height: `${Math.round(h * 100)}%`, animationDelay: `${(i % 6) * 0.12}s` }} />
        ))}
      </div>
      {failed ? (
        <p className="cv-media-error">Este navegador no puede reproducir el audio. Descárgalo para escucharlo.</p>
      ) : (
        <>
          <input type="range" className="cv-range" min={0} max={ok ? duration : 1} step={0.1} value={ok ? time : 0}
            disabled={!ok} onChange={(e) => seek(e.target.value)} aria-label={`Posición de ${slide.label.toLowerCase()}`}
            aria-valuetext={`${clock(time)} de ${ok ? clock(duration) : 'duración desconocida'}`} />
          <div className="cv-atimes"><span>{clock(time)}</span><span>{ok ? clock(duration) : '–:––'}</span></div>
        </>
      )}
    </div>
  )
}
