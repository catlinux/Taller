// Modo de color de la interfaz (oscuro/claro).
//
// El modo se guarda en el navegador con la clave 'taller_modo' y se aplica con
// el atributo data-modo en <html>, que es lo que leen las reglas CSS del tema
// claro. Por defecto, la interfaz arranca en modo oscuro.

import { useCallback, useEffect, useState } from 'react'

const CLAVE_MODO = 'taller_modo'

// Evento interno para que varias instancias del hook mantengan su estado
// sincronizado (por ejemplo, el botón del encabezado y el panel de apariencia).
export const EVENTO_MODO = 'modo:color'

// Lee el modo guardado en el navegador; si no hay o falla, devuelve 'oscuro'.
export function leerModo() {
  try {
    return localStorage.getItem(CLAVE_MODO) === 'claro' ? 'claro' : 'oscuro'
  } catch {
    return 'oscuro'
  }
}

// Aplica el modo al documento (atributo data-modo en <html>).
export function aplicarModo(modo) {
  document.documentElement.dataset.modo = modo === 'claro' ? 'claro' : 'oscuro'
}

// Guarda el modo en el navegador (ignora errores si localStorage no está disponible).
export function guardarModo(modo) {
  try {
    localStorage.setItem(CLAVE_MODO, modo === 'claro' ? 'claro' : 'oscuro')
  } catch {
    // Sin localStorage: el modo se mantiene solo en memoria durante la sesión.
  }
}

// Hook que devuelve [modo, alternar, cambiar] y aplica y guarda el modo.
export function useModoColor() {
  const [modo, setModo] = useState(leerModo)

  // Mantiene el atributo data-modo en <html> acorde al estado.
  useEffect(() => {
    aplicarModo(modo)
  }, [modo])

  // Sincroniza el estado si otra instancia cambia el modo.
  useEffect(() => {
    const alCambiar = () => setModo(leerModo())
    window.addEventListener(EVENTO_MODO, alCambiar)
    return () => window.removeEventListener(EVENTO_MODO, alCambiar)
  }, [])

  const cambiar = useCallback((nuevo) => {
    const siguiente = nuevo === 'claro' ? 'claro' : 'oscuro'
    guardarModo(siguiente)
    aplicarModo(siguiente)
    setModo(siguiente)
    window.dispatchEvent(new Event(EVENTO_MODO))
  }, [])

  const alternar = useCallback(() => {
    cambiar(leerModo() === 'claro' ? 'oscuro' : 'claro')
  }, [cambiar])

  return [modo, alternar, cambiar]
}
