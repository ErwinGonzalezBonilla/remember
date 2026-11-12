export const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const TOKEN_KEY = 'rehomi_token'
// Nombre anterior de la app: se migra la sesión guardada para que nadie tenga que volver a entrar.
const OLD_TOKEN_KEY = 'remember_token'

export const tokenStore = {
  get: () => {
    try {
      const old = localStorage.getItem(OLD_TOKEN_KEY)
      if (old) { localStorage.setItem(TOKEN_KEY, old); localStorage.removeItem(OLD_TOKEN_KEY) }
      return localStorage.getItem(TOKEN_KEY)
    } catch { return null }
  },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t) } catch { /* modo privado */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY) } catch { /* modo privado */ } },
}

export class ApiError extends Error {
  constructor(message, status, field) {
    super(message)
    this.status = status
    this.field = field
  }
}

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (form) payload = form // FormData: el navegador pone el Content-Type con boundary
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: payload })
  } catch {
    throw new ApiError('No hay conexión con el servidor. Inténtalo de nuevo.', 0)
  }

  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (res.status === 413 && typeof data.detail !== 'string') {
    throw new ApiError('El archivo es demasiado grande para subirlo. Prueba con uno más pequeño.', 413)
  }
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized()
    const detail = typeof data.detail === 'string' ? data.detail : 'Algo salió mal. Inténtalo de nuevo.'
    throw new ApiError(detail, res.status, data.field)
  }
  return data
}

export const mediaUrl = (url) => (!url ? null : url.startsWith('http') ? url : `${BASE}${url}`)
