import { useEffect, useId, useRef, useState } from 'react'
import Icon from './Icon'

/**
 * Menú flotante con el aspecto del menú nativo de iOS (el de "Fototeca / Grabar vídeo / Seleccionar archivos"):
 * cristal translúcido, filas separadas por una línea fina y una animación corta de escala desde el botón.
 *
 * Se ancla al botón que lo abre (encima de él). Accesible: role="menu" con role="menuitem", flechas ↑ ↓,
 * Inicio y Fin, Escape o tocar fuera lo cierran, y el foco vuelve al botón.
 *
 * Uso:
 *   <IOSMenu items={[{ label, icon, onSelect, disabled }]} align="right" label="Añadir un audio">
 *     {(props) => <button {...props}>Audio</button>}
 *   </IOSMenu>
 * El botón recibe ref, onClick y los atributos aria (aria-haspopup, aria-expanded, aria-controls).
 */
export default function IOSMenu({ items, children, align = 'center', label, className = '' }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)
  const button = useRef(null)
  const menu = useRef(null)
  const id = useId()

  const close = (focusButton = true) => {
    setOpen(false)
    if (focusButton) requestAnimationFrame(() => button.current?.focus())
  }

  useEffect(() => {
    if (!open) return undefined
    menu.current?.querySelector('[role="menuitem"]:not([aria-disabled="true"])')?.focus()
    const onDown = (e) => { if (!wrap.current?.contains(e.target)) close(false) }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  function onKeyDown(e) {
    const rows = [...menu.current.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])')]
    const i = rows.indexOf(document.activeElement)
    const go = (n) => { e.preventDefault(); rows[(n + rows.length) % rows.length]?.focus() }
    if (e.key === 'ArrowDown') go(i + 1)
    else if (e.key === 'ArrowUp') go(i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(rows.length - 1)
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if (e.key === 'Tab') close(false)
  }

  function choose(item) {
    if (item.disabled) return
    // Sin devolver el foco al botón: la opción puede abrir otra cosa (el selector de archivos, la grabadora)
    setOpen(false)
    item.onSelect()
  }

  const trigger = children({
    ref: button,
    onClick: () => setOpen((v) => !v),
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? id : undefined,
  })

  return (
    <div ref={wrap} className={`ios-menu-anchor ${className}`}>
      {trigger}
      {open && (
        <div ref={menu} id={id} className={`ios-menu align-${align}`} role="menu" aria-label={label} onKeyDown={onKeyDown}>
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" tabIndex={-1} className="ios-menu-item"
              aria-disabled={item.disabled || undefined} onClick={() => choose(item)}>
              <Icon name={item.icon} size={22} stroke={1.7} />
              <span>{item.label}</span>
              {item.hint && <small>{item.hint}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
