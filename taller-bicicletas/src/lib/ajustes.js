// Ajustes compartidos del taller. Las filas por página se leen del ajuste del
// servidor (AjustesContext); los administradores las guardan en el servidor y
// el resto de usuarios las recuerdan en localStorage.
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useAjustes } from '../context/AjustesContext.jsx'

// Número de filas por página por defecto en los listados.
export const FILAS_POR_PAGINA_DEFECTO = 50

// Valores permitidos para las filas por página.
export const VALORES_FILAS_POR_PAGINA = [25, 50, 100]

const CLAVE_FILAS_POR_PAGINA = 'taller_filas_pagina'

// Normaliza un valor de filas por página; si no es válido, usa el por defecto.
function normalizar(valor) {
  const numero = Number(valor)
  return VALORES_FILAS_POR_PAGINA.includes(numero) ? numero : FILAS_POR_PAGINA_DEFECTO
}

// Lee el valor guardado en localStorage; si no existe o no es válido, devuelve
// el valor por defecto.
function leerFilasPorPaginaLocal() {
  try {
    const guardado = window.localStorage.getItem(CLAVE_FILAS_POR_PAGINA)
    if (guardado !== null) return normalizar(guardado)
  } catch {
    // localStorage no disponible (modo privado, etc.): usamos el valor por defecto.
  }
  return FILAS_POR_PAGINA_DEFECTO
}

// Devuelve [filasPorPagina, setFilasPorPagina] manteniendo el contrato que
// espera DataTable. El valor procede del ajuste del servidor; si el usuario no
// es administrador, sus cambios solo se recuerdan en localStorage.
export function useFilasPorPagina() {
  const { user } = useAuth()
  const { ajustes, guardarAjustes } = useAjustes()
  const esAdmin = user?.rol === 'admin'

  const valorAjuste = normalizar(ajustes?.filasPorPagina)
  const [filasPorPagina, setFilasPorPagina] = useState(() => (esAdmin ? valorAjuste : leerFilasPorPaginaLocal()))

  // Mantiene sincronizado el valor cuando llega el ajuste del servidor (admin).
  useEffect(() => {
    if (esAdmin) setFilasPorPagina(valorAjuste)
  }, [esAdmin, valorAjuste])

  const cambiarFilasPorPagina = useCallback((valor) => {
    const siguiente = normalizar(valor)
    setFilasPorPagina(siguiente)
    if (esAdmin) {
      guardarAjustes({ filasPorPagina: siguiente }).catch(() => {
        // Si falla el guardado, la caché se refresca desde el servidor.
      })
      return
    }
    try {
      window.localStorage.setItem(CLAVE_FILAS_POR_PAGINA, String(siguiente))
    } catch {
      // localStorage no disponible: mantenemos el valor solo en memoria.
    }
  }, [esAdmin, guardarAjustes])

  return [filasPorPagina, cambiarFilasPorPagina]
}

