import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { apiPost } from '../lib/api.js'
import { useAuth } from './AuthContext.jsx'
import { IconDeshacer } from '../components/Icons.jsx'

// Contexto de «deshacer»: centraliza el aviso emergente que permite restaurar un
// registro recién borrado. Cualquier punto de la aplicación que borre algo llama
// a mostrarDeshacer() con la descripción, el id de papelera que devuelve el
// servidor y una función para refrescar las listas afectadas tras restaurar.
const DeshacerContext = createContext(null)

// El aviso NO se cierra solo: permanece hasta que se pulsa ×, se refresca la página
// o se cambia de pantalla. Si la propia acción de borrar navega a otra ruta (p. ej.
// borrar una orden desde su ficha vuelve al listado), el aviso se queda: se
// considera que esa navegación forma parte del borrado si ocurre en este margen (ms).
const MARGEN_NAVEGACION_PROPIA = 2500

export function DeshacerProvider({ children }) {
  const { token } = useAuth()
  const [avisos, setAvisos] = useState([])
  const siguienteId = useRef(0)
  const { pathname } = useLocation()
  const rutaAnterior = useRef(pathname)

  const descartar = useCallback((id) => {
    setAvisos((actuales) => actuales.filter((aviso) => aviso.id !== id))
  }, [])

  // Muestra un aviso con opción de deshacer. `papeleraId` es el identificador que
  // devuelve el borrado; `onRestaurar` refresca las listas tras restaurar. Si no
  // hay papeleraId (p. ej. una ruta antigua) no se muestra nada.
  const mostrarDeshacer = useCallback(({ descripcion, papeleraId, onRestaurar }) => {
    if (!papeleraId) return
    const id = (siguienteId.current += 1)
    setAvisos((actuales) => [...actuales, { id, descripcion, papeleraId, onRestaurar, restaurando: false, error: '', nota: '', restaurado: false, creado: Date.now() }])
  }, [])

  // Al cambiar de pantalla se retiran los avisos (salvo los creados justo antes,
  // cuya acción es la que provoca la navegación: esos pasan a la nueva ruta).
  useEffect(() => {
    if (rutaAnterior.current === pathname) return
    rutaAnterior.current = pathname
    setAvisos((actuales) => actuales.filter((aviso) => Date.now() - aviso.creado < MARGEN_NAVEGACION_PROPIA))
  }, [pathname])

  const restaurar = useCallback(async (aviso) => {
    setAvisos((actuales) => actuales.map((a) => (a.id === aviso.id ? { ...a, restaurando: true, error: '' } : a)))
    try {
      const respuesta = await apiPost(`/api/papelera/${aviso.papeleraId}/restaurar`, token, {})
      aviso.onRestaurar?.()
      if (respuesta?.aviso) {
        // Se restauró con otro número/código porque el original estaba ocupado: se
        // deja el aviso para que se vea qué cambió.
        setAvisos((actuales) => actuales.map((a) => (a.id === aviso.id ? { ...a, restaurando: false, restaurado: true, nota: respuesta.aviso } : a)))
      } else {
        setAvisos((actuales) => actuales.filter((a) => a.id !== aviso.id))
      }
    } catch (e) {
      setAvisos((actuales) => actuales.map((a) => (a.id === aviso.id ? { ...a, restaurando: false, error: e.message } : a)))
    }
  }, [token])

  // Mantiene una referencia al último aviso para el atajo de teclado sin tener
  // que re-registrar el listener en cada cambio.
  const avisosRef = useRef(avisos)
  useEffect(() => {
    avisosRef.current = avisos
  }, [avisos])

  // Atajo Ctrl+Z (o Cmd+Z): deshace el último aviso visible cuando el foco no
  // está dentro de un campo de texto (ahí Ctrl+Z deshace la escritura).
  useEffect(() => {
    function alPulsar(event) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return
      const objetivo = event.target
      const etiqueta = objetivo?.tagName
      if (etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || etiqueta === 'SELECT' || objetivo?.isContentEditable) return
      const ultimo = avisosRef.current[avisosRef.current.length - 1]
      if (!ultimo || ultimo.restaurando || ultimo.restaurado) return
      event.preventDefault()
      restaurar(ultimo)
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [restaurar])

  const value = useMemo(() => ({ mostrarDeshacer }), [mostrarDeshacer])

  return (
    <DeshacerContext.Provider value={value}>
      {children}
      {avisos.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[110] flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2">
          {avisos.map((aviso) => (
            <div
              key={aviso.id}
              role="status"
              aria-live="polite"
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-antracita-700 bg-antracita-800 px-4 py-3 shadow-2xl"
            >
              <IconDeshacer size={20} className="mt-0.5 shrink-0 text-azul-300" />
              <div className="min-w-0 flex-1">
                {aviso.restaurado ? (
                  <>
                    <p className="text-sm text-slate-200">Restaurado: <span className="font-medium text-white">{aviso.descripcion}</span>.</p>
                    <p className="mt-0.5 text-xs text-naranja-300">{aviso.nota}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-200">Se ha eliminado <span className="font-medium text-white">{aviso.descripcion}</span>.</p>
                    {aviso.error
                      ? <p className="mt-0.5 text-xs text-rose-300">{aviso.error}</p>
                      : <p className="mt-0.5 text-xs text-slate-500">Puedes restaurarlo desde aquí o desde la papelera.</p>}
                  </>
                )}
              </div>
              {!aviso.restaurado && (
                <button
                  type="button"
                  disabled={aviso.restaurando}
                  onClick={() => restaurar(aviso)}
                  className="shrink-0 rounded-lg border border-azul-500/50 bg-azul-500/10 px-3 py-1.5 text-sm font-medium text-azul-300 hover:bg-azul-500/20 disabled:opacity-50"
                >
                  {aviso.restaurando ? 'Restaurando…' : 'Deshacer'}
                </button>
              )}
              <button
                type="button"
                onClick={() => descartar(aviso.id)}
                aria-label="Descartar aviso"
                className="shrink-0 rounded-lg px-2 text-lg leading-none text-slate-500 hover:bg-antracita-700 hover:text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </DeshacerContext.Provider>
  )
}

export function useDeshacer() {
  const context = useContext(DeshacerContext)
  if (!context) throw new Error('useDeshacer debe usarse dentro de DeshacerProvider')
  return context
}
