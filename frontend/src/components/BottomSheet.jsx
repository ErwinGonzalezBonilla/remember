import { useEffect, useId, useRef } from 'react'
import Icon from './Icon'
import { useSheetDrag } from '../pages/memories/CommentsSheet'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Panel que sube desde abajo (como el del día del calendario): el foco entra al abrir y vuelve al cerrar,
 * Escape y la ✕ lo cierran, Tab no se sale y se puede cerrar deslizando hacia abajo.
 */
export default function BottomSheet({ title, onClose, children, className = '' }) {
  const sheet = useRef(null)
  const titleId = useId()
  const { dy, handlers } = useSheetDrag(onClose)

  useEffect(() => {
    const before = document.activeElement
    sheet.current?.querySelector('h2')?.focus()
    const html = document.documentElement
    const prev = html.style.overflow
    html.style.overflow = 'hidden'
    return () => { html.style.overflow = prev; before?.focus?.() }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab' || !sheet.current) return
      const items = [...sheet.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || !sheet.current.contains(document.activeElement))) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <section ref={sheet} className={`sheet day-sheet glass glass-thick ${className}`} role="dialog" aria-modal="true"
        aria-labelledby={titleId} style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}>
        <div className="sheet-grab" {...handlers}>
          <span className="sheet-handle" aria-hidden="true" />
        </div>
        <div className="sheet-body">
          <header className="day-head">
            <h2 id={titleId} className="sheet-title" tabIndex={-1}>{title}</h2>
            <button type="button" className="icon-btn day-close" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={20} /></button>
          </header>
          {children}
        </div>
      </section>
    </>
  )
}
