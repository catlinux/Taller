import { createContext, useCallback, useContext, useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { apiGet, apiPut } from '../lib/api.js'
import { useAuth } from './AuthContext.jsx'

// Valores por defecto de los ajustes. Deben coincidir con AJUSTES_DEFECTO del
// backend (server/routes/ajustes.js) para que la interfaz sea coherente mientras
// se carga la respuesta del servidor.
export const AJUSTES_DEFECTO = {
  filasPorPagina: 50,
  colorAcento: 'azul',
  densidad: 'comoda',
  radioEsquinas: 'normal',
  introActivada: true,
  precioHora: 30,
  ivaDefecto: 21,
  diasValidezPresupuesto: 15,
  clausulaRgpd: '',
  sesionHoras: 8,
  pinActivado: false,
  pinMinutosInactividad: 5,
  bloqueoInactividadMinutos: 0,
}

const AjustesContext = createContext(null)

// Provee los ajustes del servidor a toda la aplicación. Carga GET /api/ajustes
// cuando hay sesión iniciada y expone useAjustes() para leerlos y guardarlos.
export function AjustesProvider({ children }) {
  const { token } = useAuth()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery(
    ['ajustes'],
    () => apiGet('/api/ajustes', token),
    { enabled: Boolean(token), staleTime: 5 * 60 * 1000 },
  )

  const guardar = useMutation((parcial) => apiPut('/api/ajustes', token, parcial), {
    onSuccess: (completo) => queryClient.setQueryData(['ajustes'], completo),
    onError: () => queryClient.invalidateQueries(['ajustes']),
  })

  // Guarda un objeto parcial de ajustes (solo admin en el servidor) y refresca
  // la caché de react-query con el objeto completo devuelto. Aplica una
  // actualización optimista para que la interfaz responda al instante.
  const guardarAjustes = useCallback((parcial) => {
    queryClient.setQueryData(['ajustes'], (actual) => ({ ...(actual ?? AJUSTES_DEFECTO), ...parcial }))
    return guardar.mutateAsync(parcial)
  }, [guardar, queryClient])

  const ajustes = useMemo(() => ({ ...AJUSTES_DEFECTO, ...(data ?? {}) }), [data])

  // Refleja el tema (acento, densidad y esquinas) como atributos en <html> y lo
  // recuerda en localStorage para poder aplicarlo antes de montar React.
  useEffect(() => {
    const raiz = document.documentElement
    raiz.dataset.acento = ajustes.colorAcento
    raiz.dataset.densidad = ajustes.densidad
    raiz.dataset.radio = ajustes.radioEsquinas
    try {
      localStorage.setItem('taller_tema', JSON.stringify({
        colorAcento: ajustes.colorAcento,
        densidad: ajustes.densidad,
        radioEsquinas: ajustes.radioEsquinas,
      }))
    } catch {
      // localStorage no disponible: el tema se aplica solo en esta sesión.
    }
  }, [ajustes.colorAcento, ajustes.densidad, ajustes.radioEsquinas])

  const value = useMemo(() => ({
    ajustes,
    guardarAjustes,
    cargando: Boolean(token) && isLoading,
  }), [ajustes, guardarAjustes, token, isLoading])

  return <AjustesContext.Provider value={value}>{children}</AjustesContext.Provider>
}

export function useAjustes() {
  const context = useContext(AjustesContext)
  if (!context) throw new Error('useAjustes debe usarse dentro de AjustesProvider')
  return context
}
