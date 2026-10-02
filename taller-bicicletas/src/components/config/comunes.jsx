import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useAjustes } from '../../context/AjustesContext.jsx'

// Hook compartido por los paneles de Configuración. Mantiene un borrador local
// con solo las claves indicadas, calcula qué cambió respecto a los ajustes
// guardados y expone los datos y acciones que usan los formularios. Así todos
// los paneles comparten el mismo comportamiento (detectar cambios sin guardar,
// descartar, guardar y estado) sin duplicar código.
export function usePanelAjustes(claves) {
  const { ajustes, guardarAjustes } = useAjustes()
  const { user } = useAuth()
  const esAdmin = user?.rol === 'admin'
  // Dependencia estable derivada del array de claves (evita bucles en useMemo).
  const dependencias = claves.join(',')

  // Subconjunto de ajustes que gestiona este panel (los valores guardados).
  const base = useMemo(() => {
    const resultado = {}
    for (const clave of claves) resultado[clave] = ajustes?.[clave]
    return resultado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ajustes, dependencias])

  const [borrador, setBorrador] = useState(base)
  const [sucio, setSucio] = useState(false)
  const [estado, setEstado] = useState('idle')
  const [mensaje, setMensaje] = useState('')

  // Cuando no hay cambios sin guardar, el borrador sigue a los ajustes (por
  // ejemplo, al llegar la respuesta del servidor o al guardar con éxito).
  useEffect(() => {
    if (!sucio) setBorrador(base)
  }, [base, sucio])

  // Cambia un valor del borrador y marca el formulario como modificado.
  const actualizar = useCallback((clave, valor) => {
    setBorrador((actual) => (actual[clave] === valor ? actual : { ...actual, [clave]: valor }))
    setSucio(true)
    setEstado('idle')
    setMensaje('')
  }, [])

  // Recupera los valores guardados y descarta los cambios locales.
  const descartar = useCallback(() => {
    setBorrador(base)
    setSucio(false)
    setEstado('idle')
    setMensaje('')
  }, [base])

  // Solo las claves cuyo valor difiere del guardado (lo que se manda al servidor).
  const cambios = useMemo(() => {
    const resultado = {}
    for (const clave of claves) {
      if (borrador[clave] !== base[clave]) resultado[clave] = borrador[clave]
    }
    return resultado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrador, base, dependencias])

  const hayCambios = Object.keys(cambios).length > 0

  const guardar = useCallback(async () => {
    if (!Object.keys(cambios).length) return
    setEstado('guardando')
    setMensaje('')
    try {
      await guardarAjustes(cambios)
      setSucio(false)
      setEstado('ok')
      setMensaje('Guardado')
    } catch (e) {
      setEstado('error')
      setMensaje(e?.message || 'No se pudieron guardar los ajustes.')
    }
  }, [cambios, guardarAjustes])

  return {
    ajustes,
    base,
    borrador,
    actualizar,
    descartar,
    guardar,
    hayCambios,
    estado,
    mensaje,
    esAdmin,
    guardando: estado === 'guardando',
  }
}

// Aviso de solo lectura para los usuarios que no son administradores.
export function AvisoSoloAdmin() {
  return (
    <p role="status" className="rounded-lg border border-naranja-500/30 bg-naranja-500/10 px-4 py-3 text-sm text-naranja-300">
      Solo un administrador puede cambiar estos ajustes.
    </p>
  )
}

// Pie de formulario: aviso de éxito/error a la izquierda y botones a la derecha.
export function PieGuardar({ hayCambios, guardando, estado, mensaje, onGuardar, onDescartar }) {
  const error = estado === 'error'
  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-antracita-700 pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p
        role={error ? 'alert' : 'status'}
        aria-live="polite"
        className={`text-sm ${error ? 'text-rose-300' : 'text-emerald-300'}`}
      >
        {mensaje}
      </p>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onDescartar} disabled={!hayCambios || guardando} className="btn-secondary">
          Descartar
        </button>
        <button type="button" onClick={onGuardar} disabled={!hayCambios || guardando} className="btn-primary">
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}

// Interruptor accesible reutilizable (Apariencia y Sesión y seguridad).
export function Interruptor({ id, checked, onChange, disabled, etiqueta }) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${checked ? 'bg-azul-500' : 'bg-antracita-600'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  )
}

// Tarjeta seleccionable con una previsualización (usada en Apariencia).
export function TarjetaOpcion({ activa, disabled, onClick, etiqueta, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={activa}
      className={`flex flex-1 flex-col gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${activa ? 'border-azul-500 bg-azul-500/10' : 'border-antracita-600 hover:border-antracita-500'}`}
    >
      <div className="flex h-16 items-center justify-center gap-1 rounded-lg bg-antracita-900 px-3">{children}</div>
      <span className={`text-sm font-medium ${activa ? 'text-white' : 'text-slate-300'}`}>{etiqueta}</span>
    </button>
  )
}

// Aplica el tema (acento, densidad y esquinas) a <html> en vivo mientras se
// previsualiza en Apariencia, y lo restaura al desmontar si no se guardó.
export function usePrevisualizacionTema(borrador, base) {
  const baseRef = useRef(base)
  useEffect(() => {
    baseRef.current = base
  }, [base])

  useEffect(() => {
    const raiz = document.documentElement
    raiz.dataset.acento = borrador.colorAcento
    raiz.dataset.densidad = borrador.densidad
    raiz.dataset.radio = borrador.radioEsquinas
  }, [borrador.colorAcento, borrador.densidad, borrador.radioEsquinas])

  useEffect(() => () => {
    const raiz = document.documentElement
    raiz.dataset.acento = baseRef.current.colorAcento
    raiz.dataset.densidad = baseRef.current.densidad
    raiz.dataset.radio = baseRef.current.radioEsquinas
  }, [])
}
