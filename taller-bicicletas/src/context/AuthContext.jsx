import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from 'react-query'

const AuthContext = createContext(null)
const TOKEN_KEY = 'taller_token'
const EXPIRA_KEY = 'taller_expira'
const ACCESO_AUTOMATICO_KEY = 'taller_acceso_automatico'

async function getCurrentUser(token) {
  const response = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error('La sesión ha caducado')
  return response.json()
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [accesoAutomatico, setAccesoAutomatico] = useState(() => localStorage.getItem(ACCESO_AUTOMATICO_KEY) === '1')
  const queryClient = useQueryClient()
  const login = useCallback((payload, automatico = false) => {
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
    setAccesoAutomatico(automatico)
    if (automatico) localStorage.setItem(ACCESO_AUTOMATICO_KEY, '1')
    else localStorage.removeItem(ACCESO_AUTOMATICO_KEY)
    queryClient.setQueryData(['auth', 'me', payload.token], { user: payload.user })
  }, [queryClient])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(ACCESO_AUTOMATICO_KEY)
    try {
      localStorage.removeItem(EXPIRA_KEY)
    } catch {
      // localStorage no disponible.
    }
    setToken(null)
    setAccesoAutomatico(false)
    queryClient.clear()
  }, [queryClient])

  const { data, isLoading } = useQuery(['auth', 'me', token], () => getCurrentUser(token), {
    enabled: Boolean(token),
    retry: false,
    onError: () => {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(ACCESO_AUTOMATICO_KEY)
      setToken(null)
      setAccesoAutomatico(false)
      queryClient.removeQueries(['auth', 'automatico'])
    },
  })

  const { data: acceso, isLoading: cargandoAcceso, isFetching: consultandoAcceso } = useQuery(
    ['auth', 'acceso'],
    async () => {
      const response = await fetch('/api/auth/acceso')
      if (!response.ok) throw new Error('No se pudo consultar el acceso')
      return response.json()
    },
    { enabled: !token, retry: false },
  )

  const { isLoading: cargandoAutomatico } = useQuery(
    ['auth', 'automatico'],
    async () => {
      const response = await fetch('/api/auth/automatico', { method: 'POST' })
      if (!response.ok) throw new Error('No se pudo acceder automáticamente')
      return response.json()
    },
    {
      enabled: !token && acceso?.inicioSesionDesactivado === true,
      retry: false,
      onSuccess: (payload) => login(payload, true),
    },
  )

  useEffect(() => {
    window.addEventListener('auth:expired', logout)
    return () => window.removeEventListener('auth:expired', logout)
  }, [logout])

  const value = useMemo(() => ({
    token,
    user: data?.user ?? null,
    isLoading: (Boolean(token) && isLoading) || (!token && (cargandoAcceso || consultandoAcceso || cargandoAutomatico)),
    accesoAutomatico,
    login,
    logout,
  }), [token, data, isLoading, cargandoAcceso, consultandoAcceso, cargandoAutomatico, accesoAutomatico, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return context
}
