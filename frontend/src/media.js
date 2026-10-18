/**
 * Límite de subida. En Vercel cada petición admite como máximo 4,5 MB, así que en producción
 * usamos 4 MB; en local (FastAPI en tu ordenador) se permiten 25 MB.
 */
export const MAX_UPLOAD_MB = import.meta.env.PROD ? 4 : 25

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
export function tooBig(file) {
  if (file.size <= MAX_UPLOAD_MB * 1024 * 1024) return null
  return `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. En esta versión de prueba el máximo es ${MAX_UPLOAD_MB} MB: prueba con un video más corto.`
}
