import { useEffect, useRef } from 'react'
import Icon from '../../components/Icon'
import { compressImage, kindOf, tooBig, uploadFile, videoPoster } from '../../media'

/** Fotos y videos por recuerdo (igual que el servidor). */
export const ALBUM_MAX = 20
export const ALBUM_ACCEPT = 'image/*,video/*'

let nextId = 0

/**
 * Prepara los archivos elegidos para el álbum: reduce las fotos y comprueba el tamaño.
 * `room` es cuántos caben todavía. Devuelve { items, error }.
 */
export async function prepareFiles(fileList, room) {
  const files = [...(fileList || [])].filter((f) => /^(image|video)\//.test(f.type))
  const errors = []
  if (files.length > room) {
    errors.push(room > 0
      ? `Un recuerdo puede tener como mucho ${ALBUM_MAX} fotos y videos: se añadieron solo ${room}.`
      : `Un recuerdo puede tener como mucho ${ALBUM_MAX} fotos y videos.`)
  }
  const items = []
  for (const raw of files.slice(0, Math.max(0, room))) {
    const kind = kindOf(raw)
    const file = kind === 'photo' ? await compressImage(raw) : raw
    const big = tooBig(file, kind)
    if (big) { errors.push(`${raw.name}: ${big}`); continue }
    items.push({ id: `n${++nextId}`, file, kind, preview: URL.createObjectURL(file), key: null, posterKey: undefined })
  }
  return { items, error: errors.join(' ') }
}

/** Libera las vistas previas al salir de la pantalla (al quitar uno, se libera en `onRemove`). */
export function useRevokeOnUnmount(items) {
  const ref = useRef(items)
  ref.current = items
  useEffect(() => () => ref.current.forEach((it) => it.preview && URL.revokeObjectURL(it.preview)), [])
}

/**
 * Sube uno detrás de otro los archivos que aún no tienen clave (así, al reintentar, no se repiten
 * los que ya terminaron). Guarda la clave en cada elemento y devuelve la lista para `media_keys`.
 */
export async function uploadAlbum(items, onProgress, onItemDone) {
  const total = items.length
  for (let i = 0; i < total; i++) {
    const it = items[i]
    if (it.key) continue
    const label = (pct) => `Subiendo ${i + 1} de ${total}…${pct == null ? '' : ` ${pct} %`}`
    onProgress(label())
    try {
      it.key = await uploadFile(it.file, it.kind, (pct) => onProgress(label(pct)))
    } catch (e) {
      it.failed = true
      onItemDone?.()
      throw new Error(`No se pudo subir ${total > 1 ? `el archivo ${i + 1}` : 'el archivo'}: ${e.message}`)
    }
    it.failed = false
    onItemDone?.()
  }
  for (const it of items) {
    if (it.kind !== 'video' || it.posterKey !== undefined) continue
    // Miniatura (fotograma del segundo 0,5): si falla, el video se guarda igual
    try {
      const poster = await videoPoster(it.file)
      it.posterKey = poster ? await uploadFile(poster, 'photo') : null
    } catch { it.posterKey = null }
  }
  return items.map((it) => ({ key: it.key, kind: it.kind, ...(it.posterKey ? { poster_key: it.posterKey } : {}) }))
}

/** Tira de miniaturas: ✕ para quitar y ◀ ▶ para cambiar el orden. La primera es la portada. */
export function AlbumStrip({ items, onRemove, onMove, disabled }) {
  if (!items.length) return null
  return (
    <div className="album-strip-wrap">
      <ol className="album-strip" aria-label="Fotos y videos del recuerdo">
        {items.map((it, i) => (
          <li key={it.id} className={`album-thumb ${it.failed ? 'failed' : ''}`}>
            {it.kind === 'video'
              ? <video src={`${it.preview}#t=0.1`} muted playsInline preload="metadata" />
              : <img src={it.preview} alt="" />}
            {it.kind === 'video' && <span className="album-thumb-kind"><Icon name="play" size={14} filled /></span>}
            {i === 0 && <span className="album-cover-tag">Portada</span>}
            {it.key && <span className="album-thumb-done" aria-label="Subido"><Icon name="check" size={12} /></span>}
            <button type="button" className="album-thumb-x" onClick={() => onRemove(it.id)} disabled={disabled}
              aria-label={`Quitar ${it.kind === 'video' ? 'el video' : 'la foto'} ${i + 1}`}>
              <Icon name="x" size={14} />
            </button>
            <span className="album-thumb-move">
              <button type="button" onClick={() => onMove(i, -1)} disabled={disabled || i === 0} aria-label={`Mover ${i + 1} a la izquierda`}>◀</button>
              <button type="button" onClick={() => onMove(i, 1)} disabled={disabled || i === items.length - 1} aria-label={`Mover ${i + 1} a la derecha`}>▶</button>
            </span>
          </li>
        ))}
      </ol>
      <small className="hint">La primera es la portada · {items.length} de {ALBUM_MAX}</small>
    </div>
  )
}

/** Mueve el elemento `i` una posición (-1 izquierda, 1 derecha). */
export function moveItem(list, i, dir) {
  const j = i + dir
  if (j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}
