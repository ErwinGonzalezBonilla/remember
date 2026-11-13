import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import Icon from '../../components/Icon'

/** Las seis reacciones de la app. (El servidor acepta también las antiguas 😀 y 😢, que se siguen contando.) */
export const REACTIONS = [
  { e: '❤️', label: 'Me encanta' }, { e: '😍', label: 'Qué bonito' }, { e: '😂', label: 'Me hace reír' },
  { e: '🥰', label: 'Qué ternura' }, { e: '😮', label: 'Me sorprende' }, { e: '👏', label: 'Bravo' },
]
const HEART = '❤️'
const LONG_PRESS_MS = 400

export const totalReactions = (m) => Object.values(m.reactions || {}).reduce((a, b) => a + b, 0)

/** Poner, cambiar o quitar tu reacción. Se ve al momento y después se corrige con lo que diga el servidor. */
export function useReaction(memory, onChange) {
  const busy = useRef(false)
  return async function react(emoji) {
    if (busy.current) return
    const before = memory
    const mine = memory.my_reaction
    const next = mine === emoji ? null : emoji
    const reactions = { ...memory.reactions }
    if (mine) reactions[mine] = Math.max(0, (reactions[mine] || 1) - 1) || undefined
    if (next) reactions[next] = (reactions[next] || 0) + 1
    Object.keys(reactions).forEach((k) => reactions[k] === undefined && delete reactions[k])
    onChange({ my_reaction: next, reactions })
    busy.current = true
    try {
      onChange(await api(`/api/memories/${memory.id}/reaction`,
        next ? { method: 'PUT', body: { emoji: next } } : { method: 'DELETE' }))
    } catch {
      onChange({ my_reaction: before.my_reaction, reactions: before.reactions })
    } finally {
      busy.current = false
    }
  }
}

/**
 * Botón de reacción del visor. Un toque pone o quita ❤️; mantenerlo pulsado (~400 ms) abre la barra con las
 * seis reacciones: se elige tocando o deslizando el dedo y soltando, y la elegida se agranda al pasar por encima.
 */
export function ReactionButton({ memory, onChange }) {
  const react = useReaction(memory, onChange)
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(null)
  const timer = useRef(null)
  const press = useRef(null)   // { long: bool } mientras el dedo está abajo
  const total = totalReactions(memory)
  const mine = memory.my_reaction

  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const emojiAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('[data-emoji]')?.dataset.emoji || null

  function onPointerDown(e) {
    if (e.button !== 0) return
    press.current = { long: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (!press.current) return
      press.current.long = true
      setHover(null)
      setOpen(true)
      navigator.vibrate?.(10)
    }, LONG_PRESS_MS)
  }

  function onPointerMove(e) {
    if (press.current?.long) setHover(emojiAt(e.clientX, e.clientY))
  }

  function onPointerUp(e) {
    clearTimeout(timer.current)
    const p = press.current
    press.current = null
    if (!p) return
    if (!p.long) {
      // Un toque: pone ❤️, o quita la reacción que tengas
      setOpen(false)
      react(mine || HEART)
      return
    }
    const picked = emojiAt(e.clientX, e.clientY)
    setHover(null)
    if (picked) { setOpen(false); if (picked !== mine) react(picked) }
    // Si suelta fuera de la barra, la barra se queda abierta para elegir con un toque
  }

  function onPointerCancel() {
    clearTimeout(timer.current)
    press.current = null
    setHover(null)
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); react(mine || HEART) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setOpen(true) }
  }

  // Tocar tu reacción actual en la barra la quita; otra, la cambia
  const choose = (emoji) => { setOpen(false); react(emoji) }

  return (
    <div className="react-wrap">
      {open && (
        <>
          <div className="react-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="react-bar" role="menu" aria-label="Elige una reacción">
            {REACTIONS.map(({ e, label }) => (
              <button key={e} type="button" role="menuitemradio" aria-checked={mine === e} data-emoji={e}
                className={`react-opt ${hover === e ? 'hover' : ''} ${mine === e ? 'on' : ''}`}
                aria-label={label} title={label} onClick={() => choose(e)}>
                {e}
              </button>
            ))}
          </div>
        </>
      )}
      <button type="button" className={`react-btn ${mine ? 'on' : ''}`}
        aria-label={mine ? `Tu reacción: ${mine}. Toca para quitarla; mantén pulsado para cambiarla` : 'Darle ❤️. Mantén pulsado para elegir otra reacción'}
        aria-haspopup="menu" aria-expanded={open}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()} onKeyDown={onKeyDown}>
        {mine ? <span className="react-emoji">{mine}</span> : <Icon name="heart" size={26} />}
      </button>
      {total > 0 && <span className="react-count" aria-label={`${total} ${total === 1 ? 'reacción' : 'reacciones'}`}>{total}</span>}
    </div>
  )
}

/** Fila de la hoja de comentarios: las seis reacciones, cada una con su número, y la tuya marcada. */
export function ReactionRow({ memory, onChange }) {
  const react = useReaction(memory, onChange)
  return (
    <div className="react-row" role="group" aria-label="Reacciones">
      {REACTIONS.map(({ e, label }) => {
        const n = memory.reactions?.[e] || 0
        const on = memory.my_reaction === e
        return (
          <button key={e} type="button" className={`react-chip ${on ? 'on' : ''}`} aria-pressed={on}
            aria-label={`${label}${n ? `: ${n}` : ''}`} title={label} onClick={() => react(e)}>
            <span className="react-chip-emoji">{e}</span>
            {n > 0 && <small>{n}</small>}
          </button>
        )
      })}
    </div>
  )
}
