import { api, ApiError, BASE } from './api/client'

/** Máximo por archivo. El móvil sube directamente al almacén, sin pasar por el servidor. */
export const LIMITS_MB = { photo: 25, audio: 50, video: 300 }
const LABEL = { photo: 'las fotos', audio: 'las notas de voz', video: 'los videos' }
const VERB = { photo: 'Subiendo foto…', audio: 'Subiendo nota de voz…', video: 'Subiendo video…' }

/** photo | video | audio según el tipo del archivo. */
export function kindOf(file) {
  if (file?.type?.startsWith('video/')) return 'video'
  if (file?.type?.startsWith('audio/')) return 'audio'
  return 'photo'
}

const COMPRESSIBLE = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Reduce las fotos en el navegador antes de subirlas (máx. 1920 px, JPEG 85 %).
 * Una foto de móvil de 6–10 MB queda en ~0,5–1 MB, sin pérdida visible.
 * Si el navegador no puede (p. ej. HEIC en Chrome), devuelve el archivo original.
 */
export async function compressImage(file, maxSide = 1920, quality = 0.85) {
  if (!file || !COMPRESSIBLE.includes(file.type)) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

/** Comprueba el tamaño; devuelve un mensaje de error o null. */
export function tooBig(file, kind = kindOf(file)) {
  const max = LIMITS_MB[kind]
  if (file.size <= max * 1024 * 1024) return null
  return `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. El máximo para ${LABEL[kind]} es ${max} MB.`
}

/** "Subiendo video… 45 %" */
export function progressText(kind, pct) {
  return pct == null ? VERB[kind] : `${VERB[kind]} ${pct} %`
}

/**
 * Sube un archivo directamente al almacén y devuelve su clave (para enviarla como media_key).
 * 1) Pide permiso a /api/uploads  2) PUT del archivo a la URL firmada, con progreso.
 */
export async function uploadFile(file, kind = kindOf(file), onProgress) {
  const up = await api('/api/uploads', { method: 'POST', body: { kind, content_type: file.type, size: file.size } })
  const url = up.upload_url.startsWith('/') ? `${BASE}${up.upload_url}` : up.upload_url
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    Object.entries(up.headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v))
    if (onProgress) {
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100))) }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let key = up.key
        try { key = JSON.parse(xhr.responseText).key || key } catch { /* R2 no devuelve JSON */ }
        onProgress?.(100)
        return key ? resolve(key) : reject(new ApiError('No se pudo guardar el archivo. Inténtalo de nuevo.', xhr.status))
      }
      let detail = ''
      try { detail = JSON.parse(xhr.responseText).detail } catch { /* sin detalle */ }
      reject(new ApiError(typeof detail === 'string' && detail ? detail : 'No se pudo subir el archivo. Inténtalo de nuevo.', xhr.status))
    }
    xhr.onerror = () => reject(new ApiError('Se cortó la conexión al subir el archivo. Inténtalo de nuevo.', 0))
    xhr.send(file)
  })
}

/**
 * Miniatura de un video: el fotograma del segundo 0,5 como JPEG (lado mayor 720 px).
 * Devuelve null si el navegador no puede leer el video (p. ej. algunos .mov en Chrome).
 */
export function videoPoster(file, maxSide = 720, at = 0.5) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    let done = false
    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      video.load()
      resolve(result)
    }
    const timer = setTimeout(() => finish(null), 10000)
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.onerror = () => finish(null)
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(at, Math.max(0, (video.duration || 1) / 2))
    }
    video.onseeked = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight))
        if (!video.videoWidth) return finish(null)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(video.videoWidth * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => finish(blob ? new File([blob], 'miniatura.jpg', { type: 'image/jpeg' }) : null), 'image/jpeg', 0.82)
      } catch {
        finish(null)
      }
    }
    video.src = url
  })
}
