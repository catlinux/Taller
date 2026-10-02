import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { apiRequest } from '../lib/api.js'
import { useAuth } from './AuthContext.jsx'
import { useAjustes } from './AjustesContext.jsx'

// Contexto que gestiona la seguridad por inactividad:
//  - tras `pinMinutosInactividad` minutos sin actividad bloquea la pantalla pidiendo el PIN
//  - tras `bloqueoInactividadMinutos` minutos sin actividad cierra la sesión del todo
//
// El temporizador es ligero: un único setInterval que compara la hora actual con
// la marca de la última actividad (guardada en sessionStorage para sobrevivir a
// las recargas). Los eventos de actividad solo actualizan esa marca, sin provocar
// re-renders.

const BloqueoContext = createContext(null)

const CLAVE_ACTIVIDAD = 'taller_actividad'
const CLAVE_BLOQUEO = 'taller_bloqueado'
const INTERVALO_MS = 15000
const THROTTLE_MS = 1000

function leerMarca() {
  try {
    const valor = Number(sessionStorage.getItem(CLAVE_ACTIVIDAD))
    return Number.isFinite(valor) && valor > 0 ? valor : Date.now()
  } catch {
    return Date.now()
  }
}

function guardarMarca(valor) {
  try {
    sessionStorage.setItem(CLAVE_ACTIVIDAD, String(valor))
  } catch {
    // sessionStorage no disponible: la marca vive solo en memoria.
  }
}

function leerBloqueado() {
  try {
    return sessionStorage.getItem(CLAVE_BLOQUEO) === '1'
  } catch {
    return false
  }
}

export function BloqueoProvider({ children }) {
  const { token, user, logout } = useAuth()
  const { ajustes } = useAjustes()

  const ultimaActividad = useRef(leerMarca())
  const tokenPrevio = useRef(token)
  const [bloqueado, setBloqueado] = useState(leerBloqueado)

  // El bloqueo con PIN solo aplica si hay sesión, el ajuste está activo y el
  // usuario tiene un PIN configurado.
  const bloqueoActivo =
    Boolean(token) && Boolean(user) && Boolean(ajustes.pinActivado) && Boolean(user?.tienePin)

  const marcarActividad = useCallback(() => {
    const ahora = Date.now()
    ultimaActividad.current = ahora
    guardarMarca(ahora)
  }, [])

  // Temporizador único de comprobación (cada 15 s).
  useEffect(() => {
    if (!token) return undefined
    const id = window.setInterval(() => {
      const inactivo = Date.now() - ultimaActividad.current

      // Cierre de sesión por inactividad prolongada (independiente del PIN).
      const minutosCierre = Number(ajustes.bloqueoInactividadMinutos) || 0
      if (minutosCierre > 0 && inactivo >= minutosCierre * 60000) {
        logout()
        return
      }

      // Bloqueo de pantalla pidiendo el PIN.
      const minutosPin = Number(ajustes.pinMinutosInactividad) || 0
      if (bloqueoActivo && minutosPin > 0 && inactivo >= minutosPin * 60000) {
        setBloqueado(true)
      }
    }, INTERVALO_MS)
    return () => window.clearInterval(id)
  }, [token, bloqueoActivo, ajustes.bloqueoInactividadMinutos, ajustes.pinMinutosInactividad, logout])

  // Escucha la actividad del usuario con throttle de 1 s para no tocar el estado.
  useEffect(() => {
    if (!token) return undefined
    let ultimoSellado = 0
    function alActividad() {
      const ahora = Date.now()
      if (ahora - ultimoSellado < THROTTLE_MS) return
      ultimoSellado = ahora
      marcarActividad()
    }
    const eventos = ['pointerdown', 'keydown', 'scroll', 'touchstart']
    eventos.forEach((nombre) => window.addEventListener(nombre, alActividad, { capture: true, passive: true }))
    return () => eventos.forEach((nombre) => window.removeEventListener(nombre, alActividad, { capture: true }))
  }, [token, marcarActividad])

  // Persiste el estado de bloqueo para que sobreviva a las recargas.
  useEffect(() => {
    try {
      if (bloqueado) sessionStorage.setItem(CLAVE_BLOQUEO, '1')
      else sessionStorage.removeItem(CLAVE_BLOQUEO)
    } catch {
      // sessionStorage no disponible.
    }
  }, [bloqueado])

  // Al cerrar sesión se limpia todo; al iniciar una nueva se reinicia la marca.
  useEffect(() => {
    if (!token) {
      setBloqueado(false)
      try {
        sessionStorage.removeItem(CLAVE_BLOQUEO)
        sessionStorage.removeItem(CLAVE_ACTIVIDAD)
      } catch {
        // sessionStorage no disponible.
      }
    } else if (!tokenPrevio.current) {
      marcarActividad()
    }
    tokenPrevio.current = token
  }, [token, marcarActividad])

  // Si el usuario deja de cumplir las condiciones del bloqueo, se levanta.
  useEffect(() => {
    if (user && bloqueado && !bloqueoActivo) setBloqueado(false)
  }, [user, bloqueado, bloqueoActivo])

  const bloquearAhora = useCallback(() => {
    if (!bloqueoActivo) return
    marcarActividad()
    setBloqueado(true)
  }, [bloqueoActivo, marcarActividad])

  // Llama a la API para desbloquear. Devuelve { ok } o { error, intentosRestantes, cerrarSesion }.
  const desbloquear = useCallback(
    async (pin) => {
      try {
        await apiRequest('/api/auth/desbloquear', token, {
          method: 'POST',
          body: JSON.stringify({ pin }),
          // Un 401 aquí significa «PIN incorrecto», no «sesión caducada».
          sinEventoExpirado: true,
        })
        marcarActividad()
        setBloqueado(false)
        return { ok: true }
      } catch (error) {
        const datos = error?.data ?? {}
        if (error?.status === 423 || datos.cerrarSesion) {
          logout()
          return { error: datos.error || 'Demasiados intentos.', cerrarSesion: true }
        }
        return { error: datos.error || 'PIN incorrecto.', intentosRestantes: datos.intentosRestantes }
      }
    },
    [token, logout, marcarActividad],
  )

  const value = useMemo(
    () => ({ bloqueado, bloquearAhora, desbloquear }),
    [bloqueado, bloquearAhora, desbloquear],
  )

  return <BloqueoContext.Provider value={value}>{children}</BloqueoContext.Provider>
}

export function useBloqueo() {
  const context = useContext(BloqueoContext)
  if (!context) throw new Error('useBloqueo debe usarse dentro de BloqueoProvider')
  return context
}
