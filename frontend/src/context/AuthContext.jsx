import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, setUnauthorizedHandler, tokenStore } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(tokenStore.get()))
  // true justo después de registrarse: la app lleva primero a crear el perfil
  const [isNew, setIsNew] = useState(false)

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
    setIsNew(false)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    if (!tokenStore.get()) return
    api('/api/me')
      .then(setUser)
      .catch(logout)
      .finally(() => setLoading(false))
  }, [logout])

  const startSession = useCallback(({ access_token, user }) => {
    tokenStore.set(access_token)
    setUser(user)
  }, [])

  const value = useMemo(() => ({
    user, loading, setUser, logout, isNew,
    login: async (email, password) =>
      startSession(await api('/api/auth/login', { method: 'POST', body: { email, password } })),
    register: async (data) => {
      const session = await api('/api/auth/register', { method: 'POST', body: data })
      setIsNew(true)
      startSession(session)
    },
    resetPassword: async (token, password) =>
      startSession(await api('/api/auth/reset-password', { method: 'POST', body: { token, password } })),
  }), [user, loading, isNew, logout, startSession])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
