import { useCallback, useEffect, useState } from 'react'
import { api } from './api/client'

/** Carga un recurso de la API con estados de carga, error y recarga. */
export function useApi(path) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!path) return
    setLoading(true)
    try {
      setData(await api(path))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => { reload() }, [reload])
  return { data, setData, error, loading, reload }
}
