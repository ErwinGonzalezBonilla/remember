import { mediaUrl } from '../../api/client'

const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
  'image/gif': 'gif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav',
  'audio/webm': 'weba', 'audio/ogg': 'ogg',
}
const FALLBACK_EXT = { photo: 'jpg', video: 'mp4', audio: 'm4a' }

/** iPhone y iPad (también el iPad que se presenta como Mac): ahí no se puede descargar con <a download>. */
export const isIOS = () => typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

/** "Primer viaje a la playa" → "primer-viaje-a-la-playa" */
export function slugify(text) {
  return (text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'recuerdo'
}

export const memoryLink = (memory) => `${window.location.origin}/recuerdo/${memory.id}`

function extension(blob, url, kind) {
  if (EXT[blob.type]) return EXT[blob.type]
  try {
    const m = new URL(url, window.location.href).pathname.match(/\.([a-z0-9]{2,5})$/i)
    if (m) return m[1].toLowerCase()
  } catch { /* URL rara: se usa la extensión por tipo */ }
  return FALLBACK_EXT[kind] || 'bin'
}

/** Descarga el archivo como File con un nombre como "rehomi-primer-viaje-a-la-playa-1.jpg". */
async function fetchFile(item, memory, index) {
  const url = mediaUrl(item.url)
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const name = `rehomi-${slugify(memory.title)}-${index + 1}.${extension(blob, url, item.kind)}`
  return new File([blob], name, { type: blob.type || 'application/octet-stream' })
}

const isAbort = (e) => e?.name === 'AbortError'

/**
 * Descargar lo que se está viendo. En el iPhone abre el menú de compartir con el archivo
 * ("Guardar imagen" lo guarda en Fotos). Si fetch falla (p. ej. por CORS), abre el archivo en otra pestaña.
 */
export async function downloadItem(item, memory, index) {
  let file
  try {
    file = await fetchFile(item, memory, index)
  } catch {
    window.open(mediaUrl(item.url), '_blank', 'noopener')
    return 'opened'
  }
  if (isIOS() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (e) {
      if (isAbort(e)) return 'cancelled'
      /* el menú no se pudo abrir: se intenta la descarga normal */
    }
  }
  const href = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = href
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 30000)
  return 'downloaded'
}

/**
 * Compartir: el archivo con el título si el navegador lo permite; si no, el enlace del recuerdo;
 * y si tampoco, copia el enlace. Devuelve 'copied' cuando hay que avisar con "Enlace copiado".
 */
export async function shareMemory(item, memory, index) {
  if (item?.url && navigator.canShare) {
    try {
      const file = await fetchFile(item, memory, index)
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: memory.title })
        return 'shared'
      }
    } catch (e) {
      if (isAbort(e)) return 'cancelled'
    }
  }
  const url = memoryLink(memory)
  if (navigator.share) {
    try {
      await navigator.share({ title: memory.title, url })
      return 'shared'
    } catch (e) {
      if (isAbort(e)) return 'cancelled'
    }
  }
  return copyLink(memory)
}

export async function copyLink(memory) {
  const url = memoryLink(memory)
  try {
    await navigator.clipboard.writeText(url)
  } catch {
    // Navegadores sin portapapeles asíncrono
    const ta = document.createElement('textarea')
    ta.value = url
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
  return 'copied'
}
