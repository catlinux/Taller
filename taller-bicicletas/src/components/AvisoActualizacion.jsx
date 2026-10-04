import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import { useAuth } from '../context/AuthContext.jsx'
import { apiGet } from '../lib/api.js'
import { IconActualizar } from './Icons.jsx'

// Clave de sessionStorage donde se recuerda la versión descartada por el usuario,
// para no volver a mostrar el aviso hasta que aparezca otra actualización.
const CLAVE_DESCARTADO = 'taller_aviso_actualizacion_descartado'

// Cada cuánto se consulta el estado (10 minutos). Además, react-query refresca
// al recuperar el foco de la ventana.
const INTERVALO_MS = 10 * 60 * 1000

function leerDescartado() {
  try {
    return sessionStorage.getItem(CLAVE_DESCARTADO)
  } catch {
    return null
  }
}

function guardarDescartado(valor) {
  try {
    sessionStorage.setItem(CLAVE_DESCARTADO, valor)
  } catch {
    // sessionStorage no disponible: el aviso volverá a mostrarse la próxima vez.
  }
}

// Banda discreta bajo la cabecera que avisa de actualizaciones disponibles.
// Solo se muestra a administradores y solo si la comprobación encontró cambios.
export default function AvisoActualizacion() {
  const { token, user } = useAuth()
  const esAdmin = user?.rol === 'admin'
  // Versión remota que el usuario ya ocultó (estado, para que el aviso desaparezca al instante).
  const [descartado, setDescartado] = useState(leerDescartado)

  const { data } = useQuery(['actualizaciones', 'estado'], () => apiGet('/api/actualizaciones', token), {
    enabled: Boolean(token) && esAdmin,
    refetchInterval: INTERVALO_MS,
    refetchOnWindowFocus: true,
    retry: false,
  })

  if (!esAdmin || !data?.disponible) return null

  // El usuario puede ocultar el aviso; no se vuelve a mostrar hasta que cambie
  // la versión remota (sha distinto al descartado).
  const shaRemoto = data.remoto?.sha ?? null
  if (shaRemoto && descartado === shaRemoto) return null

  const total = data.atrasadas ?? data.cambios?.length ?? 0

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-azul-500/30 bg-azul-500/10 px-4 py-2 text-sm md:px-8"
    >
      <IconActualizar size={18} className="shrink-0 text-azul-400" />
      <span className="font-medium text-white">
        Hay una actualización disponible{total > 0 ? ` (${total} ${total === 1 ? 'cambio' : 'cambios'})` : ''}
      </span>
      <span className="text-slate-400">·</span>
      <Link to="/configuracion/actualizaciones" className="font-semibold text-azul-300 hover:text-azul-400">
        Ver actualizaciones
      </Link>
      <button
        type="button"
        onClick={() => {
          if (!shaRemoto) return
          guardarDescartado(shaRemoto)
          setDescartado(shaRemoto)
        }}
        aria-label="Ocultar aviso de actualización"
        className="ml-auto shrink-0 rounded-lg px-2 text-lg leading-none text-slate-500 transition hover:bg-azul-500/10 hover:text-white"
      >
        ×
      </button>
    </div>
  )
}
