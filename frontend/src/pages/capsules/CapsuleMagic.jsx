import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import { buzz } from '../../vibration'

/*
 * Animaciones "mágicas" de la cápsula, con CSS y SVG (sin librerías):
 *  - OpeningAnimation: el sello se agrieta y se parte, la solapa se abre, sube la carta y caen pétalos (~3 s).
 *  - SealingAnimation: la carta se dobla, entra en el sobre, la solapa se cierra y cae el sello (~2,6 s).
 * Las fases las marca JavaScript (clase "phase-N" en el escenario); el movimiento lo hace el CSS.
 * Con prefers-reduced-motion: un fundido simple, sin movimiento. "Saltar" y Escape las terminan al momento.
 * Los textos se anuncian al lector de pantalla (aria-live).
 */

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Marca la fase según el tiempo: [[ms, fase], …]. Llama a onDone al final. Devuelve la fase actual. */
function useTimeline(steps, total, onDone, effects = {}) {
  const [phase, setPhase] = useState(0)
  const done = useRef(false)
  const finish = useRef(onDone)
  finish.current = onDone
  useEffect(() => {
    const timers = steps.map(([ms, p]) => setTimeout(() => { setPhase(p); effects[p]?.() }, ms))
    timers.push(setTimeout(() => { if (!done.current) { done.current = true; finish.current() } }, total))
    return () => timers.forEach(clearTimeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const skip = () => { if (!done.current) { done.current = true; finish.current() } }
  return [phase, skip]
}

/** El escenario: fondo petróleo a pantalla completa, botón Saltar, Escape y foco dentro mientras dura. */
function Stage({ label, phase, mode, onSkip, children, live }) {
  const skipRef = useRef(null)
  useEffect(() => {
    const before = document.activeElement
    skipRef.current?.focus({ preventScroll: true })
    const html = document.documentElement
    const prev = html.style.overflow
    html.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onSkip() }
      if (e.key === 'Tab') { e.preventDefault(); skipRef.current?.focus() }   // el único control
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); html.style.overflow = prev; before?.focus?.() }
  }, [onSkip])
  return (
    <div className={`magic magic-${mode} phase-${phase} ${reduced() ? 'is-reduced' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
      <button ref={skipRef} type="button" className="magic-skip" onClick={onSkip}>Saltar <Icon name="chevron" size={16} /></button>
      {children}
      <p className="sr-only" aria-live="assertive" aria-atomic="true">{live}</p>
    </div>
  )
}

/** Sobre de papel crema: fondo, carta, bolsillo delantero, solapa y sello de lacre (dos mitades para partirse). */
function Envelope() {
  return (
    <div className="env" aria-hidden="true">
      <svg className="env-back" viewBox="0 0 280 180"><rect width="280" height="180" rx="10" /></svg>
      <div className="env-letter">
        <span className="env-letter-lines" />
        <span className="env-letter-heart"><Icon name="heart" size={18} filled /></span>
      </div>
      <svg className="env-front" viewBox="0 0 280 180">
        <path d="M0 10 Q0 0 10 0 L140 104 L270 0 Q280 0 280 10 V170 Q280 180 270 180 H10 Q0 180 0 170 Z" />
        <path className="env-fold" d="M0 178 L118 86 M280 178 L162 86" />
      </svg>
      <div className="env-flap">
        <svg viewBox="0 0 280 120"><path d="M8 0 H272 Q280 0 274 6 L148 112 Q140 118 132 112 L6 6 Q0 0 8 0 Z" /></svg>
      </div>
      <div className="env-seal">
        <span className="seal-half left"><span className="seal-disc"><Icon name="heart" size={22} filled /></span></span>
        <span className="seal-half right"><span className="seal-disc"><Icon name="heart" size={22} filled /></span></span>
        <svg className="seal-crack" viewBox="0 0 60 60"><path d="M31 2 L27 18 L34 30 L26 44 L30 58" /></svg>
      </div>
    </div>
  )
}

/** Pétalos y confeti en coral y crema, en posiciones fijas por render (nada aleatorio entre renders). */
function Petals({ n = 26 }) {
  const petals = useMemo(() => {
    let x = 7
    const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280 }
    const colors = ['#E98F7D', '#F3B7A8', '#FBEDE9', '#F3ECE0', '#E9DCC6', '#D9705C']
    return Array.from({ length: n }, (_, i) => ({
      left: `${Math.round(rnd() * 100)}%`, delay: `${(rnd() * 0.9).toFixed(2)}s`, dur: `${(1.6 + rnd() * 1.2).toFixed(2)}s`,
      size: `${Math.round(8 + rnd() * 9)}px`, rot: `${Math.round(rnd() * 360)}deg`, drift: `${Math.round(rnd() * 80 - 40)}px`,
      color: colors[i % colors.length], round: i % 3 === 0,
    }))
  }, [n])
  return (
    <div className="petals" aria-hidden="true">
      {petals.map((p, i) => (
        <span key={i} className={p.round ? 'round' : ''} style={{ left: p.left, width: p.size, height: p.size, background: p.color,
          animationDelay: p.delay, animationDuration: p.dur, '--rot': p.rot, '--drift': p.drift }} />
      ))}
    </div>
  )
}

/**
 * Abrir una cápsula (solo la primera vez que la destinataria la ve abierta).
 * a) sobre cerrado + título y "De {nombre}" · b) el sello tiembla, se agrieta y se parte; se abre la solapa y sube la carta
 * c) pétalos y "Esta cápsula te esperaba desde el {fecha}" · d) fundido a la vista abierta.
 */
export function OpeningAnimation({ title, from, since, onDone }) {
  const calm = reduced()
  const steps = calm ? [[0, 1], [800, 4], [2100, 5]] : [[50, 1], [700, 2], [1150, 3], [1700, 4], [2650, 5]]
  const [phase, skip] = useTimeline(steps, calm ? 2550 : 3150, onDone, { 3: () => { if (!calm) buzz([35]) } })
  const waiting = `Esta cápsula te esperaba desde el ${since}`
  return (
    <Stage label={`Abriendo la cápsula «${title}»`} mode="open" phase={phase} onSkip={skip}
      live={phase >= 3 ? `Se rompe el sello. ${waiting}.` : `Abriendo la cápsula «${title}», de ${from}.`}>
      {phase >= 4 && !calm && <Petals />}
      <div className="magic-center">
        <Envelope />
        <div className="magic-text">
          <h2 className="magic-title">{title}</h2>
          <p className="magic-from">De {from}</p>
          <p className="magic-wait">{waiting}</p>
        </div>
      </div>
    </Stage>
  )
}

/**
 * Sellar una cápsula: la carta se dobla y entra en el sobre, la solapa se cierra, cae el sello con un rebote
 * (vibración) y aparece "Sellada hasta el {fecha} a las {hora}" con un candado que se cierra.
 */
export function SealingAnimation({ until, onDone }) {
  const calm = reduced()
  const steps = calm ? [[0, 1], [700, 4]] : [[50, 1], [650, 2], [1200, 3], [1650, 4]]
  const [phase, skip] = useTimeline(steps, calm ? 2300 : 3000, onDone, { 3: () => { if (!calm) setTimeout(() => buzz([25, 40, 25]), 260) } })
  const text = `Sellada hasta el ${until}`
  return (
    <Stage label="Sellando la cápsula" mode="seal" phase={phase} onSkip={skip}
      live={phase >= 4 ? `${text}.` : 'Sellando la cápsula…'}>
      <div className="magic-center">
        <Envelope />
        <div className="magic-text">
          <p className="magic-sealed">
            <span className="magic-lock" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path className="lock-shackle" d="M8 11V7a4 4 0 0 1 8 0v4" /><rect x="5" y="11" width="14" height="10" rx="2" /></svg>
            </span>
            {text}
          </p>
        </div>
      </div>
    </Stage>
  )
}
