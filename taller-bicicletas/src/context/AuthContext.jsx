import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from 'react-query'

const AuthContext = createContext(null)
const TOKEN_KEY = 'taller_token'
const EXPIRA_KEY = 'taller_expira'

async function getCurrentUser(token) {
  const response = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error('La sesión ha caducado')
  return response.json()
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery(['auth', 'me', token], () => getCurrentUser(token), {
    enabled: Boolean(token),
    retry: false,
    onError: () => {
      localStorage.removeItem(TOKEN_KEY)
      setToken(null)
    },
  })

  const login = useCallback((payload) => {
    localStorage.setItem(TOKEN_KEY, payload.token)
    // Guarda la caducidad del token para poder avisar antes de que expire.
    if (payload.expiraEn) {
      try {
        localStorage.setItem(EXPIRA_KEY, payload.expiraEn)
      } catch {
        // localStorage no disponible: se omite el aviso de caducidad.
      }
    }
    setToken(payload.token)
    queryClient.setQueryData(['auth', 'me', payload.token], { user: payload.user })
  }, [queryClient])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    try {
      localStorage.removeItem(EXPIRA_KEY)
    } catch {
      // localStorage no disponible.
    }
    setToken(null)
    queryClient.clear()
  }, [queryClient])

  useEffect(() => {
    window.addEventListener('auth:expired', logout)
    return () => window.removeEventListener('auth:expired', logout)
  }, [logout])

  const value = useMemo(() => ({
    token,
    user: data?.user ?? null,
    isLoading: Boolean(token) && isLoading,
    login,
    logout,
  }), [token, data, isLoading, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return context
}
