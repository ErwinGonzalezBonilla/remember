import { mediaUrl } from '../../api/client'
import { fetchFile, isIOS, slugify } from '../memories/share'

/**
 * Descargar y compartir lo que se está viendo en una cápsula abierta.
 * Compartir siempre manda el ARCHIVO (hoja nativa del móvil): nunca un enlace, porque la cápsula es privada.
 */

const isAbort = (e) => e?.name === 'AbortError'

/** El elemento del carrusel como File: la carta como .txt; foto, video o audio tal cual se subió. */
export async function slideFile(slide, capsule) {
  if (slide.kind === 'letter') {
    const text = `${capsule.title}\n\n${capsule.message}\n\nCon cariño, ${capsule.author_name}\n`
    return new File([text], `rehomi-${slugify(capsule.title)}-carta.txt`, { type: 'text/plain' })
  }
  return fetchFile({ url: slide.media_url, kind: slide.kind }, { title: capsule.title }, slide.n - 1)
}

function saveFile(file) {
  const href = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = href
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 30000)
}

/** Devuelve 'downloaded' | 'shared' | 'opened' | 'cancelled'. */
export async function downloadSlide(slide, capsule) {
  let file
  try {
    file = await slideFile(slide, capsule)
  } catch {
    // Sin CORS no se puede leer el archivo: se abre en otra pestaña para guardarlo desde ahí
    window.open(mediaUrl(slide.media_url), '_blank', 'noopener')
    return 'opened'
  }
  // En el iPhone <a download> no funciona: el menú de compartir tiene "Guardar en Fotos / Archivos"
  if (isIOS() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (e) {
      if (isAbort(e)) return 'cancelled'
    }
  }
  saveFile(file)
  return 'downloaded'
}

/** Devuelve 'shared' | 'cancelled' | 'unsupported' | 'failed'. */
export async function shareSlide(slide, capsule) {
  if (!navigator.canShare) return 'unsupported'
  let file
  try {
    file = await slideFile(slide, capsule)
  } catch {
    return 'failed'
  }
  if (!navigator.canShare({ files: [file] })) return 'unsupported'
  try {
    await navigator.share({ files: [file], title: capsule.title })
    return 'shared'
  } catch (e) {
    return isAbort(e) ? 'cancelled' : 'failed'
  }
}
