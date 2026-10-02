import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { apiDelete, apiGet, apiPost, apiPut } from '../../lib/api.js'
import { aNumero, formatearEuros } from '../../lib/ordenes.js'
import { useAjustes } from '../../context/AjustesContext.jsx'

const inputClass = 'mt-1.5 w-full rounded-lg border border-antracita-600 bg-antracita-900 px-3 py-2.5 text-white outline-none focus:border-azul-400'
const celdaClass = 'w-full rounded-md border border-transparent bg-antracita-900/60 px-2 py-2 text-white outline-none focus:border-azul-400'

// Campos de la línea que se editan como números.
const CAMPOS_NUMERICOS = ['tiempo', 'precioHora']

// Formatea un precio con dos decimales y coma (es-ES), sin símbolo de moneda.
function formatearPrecio(valor) {
  const numero = aNumero(valor)
  if (numero === null) return ''
  return numero.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Celda editable en línea: guarda el texto mientras se escribe y confirma al
// salir del campo (onBlur) o al pulsar Enter, solo si el valor cambió. Fuera de
// edición puede mostrar el valor con un formato (`formato`) distinto al de edición.
function CeldaEditable({ valor, onCommit, numerico = false, formato, title, className = '' }) {
  const aTexto = (v) => (v === null || v === undefined ? '' : String(v))
  const [enfocado, setEnfocado] = useState(false)
  const [texto, setTexto] = useState(aTexto(valor))

  useEffect(() => {
    setTexto(aTexto(valor))
  }, [valor])

  function confirmar() {
    if (texto === aTexto(valor)) return
    const aceptado = onCommit(texto)
    if (aceptado === false) setTexto(aTexto(valor))
  }

  const mostrado = !enfocado && formato ? formato(valor) : texto

  return (
    <input
      type="text"
      inputMode={numerico ? 'decimal' : undefined}
      value={mostrado}
      title={title}
      onChange={(event) => setTexto(event.target.value)}
      onFocus={() => setEnfocado(true)}
      onBlur={() => { setEnfocado(false); confirmar() }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      className={`${celdaClass} ${className}`}
    />
  )
}

// Tabla editable de mano de obra de la orden, con autocompletado sobre el
// catálogo de operaciones y línea libre. Cada cambio se guarda contra el
// servidor, que devuelve la orden recalculada para refrescar la caché.
export default function TablaManoObra({ orden, token }) {
  const queryClient = useQueryClient()
  const { ajustes } = useAjustes()
  const ordenId = orden.id
  const claveOrden = ['orden', String(ordenId)]
  const manoObra = orden.manoObra ?? []

  const [errorAccion, setErrorAccion] = useState('')
  const [texto, setTexto] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(-1)

  // Debounce de 250 ms: retrasa la consulta al servidor mientras se escribe.
  useEffect(() => {
    const temporizador = setTimeout(() => setBusqueda(texto.trim()), 250)
    return () => clearTimeout(temporizador)
  }, [texto])

  const { data: operaciones = [] } = useQuery(
    ['operaciones', 'buscar', busqueda],
    () => apiGet(`/api/operaciones?q=${encodeURIComponent(busqueda)}`, token),
    { enabled: Boolean(token) && busqueda.length > 0 },
  )
  const resultados = operaciones.slice(0, 10)

  function guardarEnCache(actualizada) {
    queryClient.setQueryData(claveOrden, actualizada)
    queryClient.invalidateQueries(['ordenes'])
  }

  const editarLinea = useMutation(
    ({ manoObraId, cambios }) => apiPut(`/api/ordenes/${ordenId}/mano-obra/${manoObraId}`, token, cambios),
    { onSuccess: guardarEnCache, onError: (e) => setErrorAccion(e.message) },
  )

  const agregarLinea = useMutation(
    (payload) => apiPost(`/api/ordenes/${ordenId}/mano-obra`, token, payload),
    { onSuccess: guardarEnCache, onError: (e) => setErrorAccion(e.message) },
  )

  const eliminarLinea = useMutation(
    (manoObraId) => apiDelete(`/api/ordenes/${ordenId}/mano-obra/${manoObraId}`, token),
    { onSuccess: guardarEnCache, onError: (e) => setErrorAccion(e.message) },
  )

  // Confirma la edición de un campo. Devuelve false si no hay nada que guardar.
  function confirmarEdicion(linea, campo, valorTexto) {
    setErrorAccion('')
    let valor
    if (CAMPOS_NUMERICOS.includes(campo)) {
      valor = aNumero(valorTexto)
      if (valor === null) return false
      if (valor === Number(linea[campo])) return false
    } else {
      valor = valorTexto
      if (valor === (linea[campo] ?? '')) return false
    }
    editarLinea.mutate({ manoObraId: linea.id, cambios: { [campo]: valor } })
    return true
  }

  function restablecerBuscador() {
    setTexto('')
    setBusqueda('')
    setAbierto(false)
    setActivo(-1)
  }

  function elegirOperacion(operacion) {
    setErrorAccion('')
    agregarLinea.mutate({
      codigoOp: operacion.codigo,
      descripcion: operacion.descripcion,
      tiempo: operacion.tiempoDefecto,
      precioHora: operacion.precioHoraDefecto,
    })
    restablecerBuscador()
  }

  function anadirLineaLibre() {
    setErrorAccion('')
    // El precio por hora propuesto sale del ajuste del taller (por defecto 30).
    const precioHora = Number(ajustes?.precioHora)
    agregarLinea.mutate({ codigoOp: 'MO', descripcion: 'Mano de obra', tiempo: 1, precioHora: Number.isFinite(precioHora) ? precioHora : 30 })
    restablecerBuscador()
  }

  function confirmarEliminar(linea) {
    if (window.confirm(`¿Eliminar la línea de mano de obra «${linea.descripcion}»?`)) {
      setErrorAccion('')
      eliminarLinea.mutate(linea.id)
    }
  }

  function manejarTeclas(event) {
    if (event.key === 'Escape') { setAbierto(false); return }
    if (!abierto || resultados.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActivo((i) => Math.min(i + 1, resultados.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActivo((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter' && activo >= 0) {
      event.preventDefault()
      elegirOperacion(resultados[activo])
    }
  }

  return (
    <div className="space-y-3">
      {errorAccion && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{errorAccion}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[130px]" />
            <col />
            <col className="w-[100px]" />
            <col className="w-[110px]" />
            <col className="w-[120px]" />
            <col className="w-[48px]" />
          </colgroup>
          <thead className="border-b border-antracita-700 text-xs uppercase tracking-wide text-slate-500"><tr>
            <th className="px-3 py-3">Código</th>
            <th className="px-3 py-3">Descripción</th>
            <th className="px-3 py-3 text-right">Tiempo (h)</th>
            <th className="px-3 py-3 text-right">Precio/hora</th>
            <th className="px-3 py-3 text-right">Importe</th>
            <th className="px-3 py-3 text-right">Acciones</th>
          </tr></thead>
          <tbody className="divide-y divide-antracita-700/80">
            {manoObra.length === 0
              ? <tr><td colSpan="6" className="px-3 py-8 text-center text-slate-400">Todavía no hay mano de obra en esta orden.</td></tr>
              : manoObra.map((linea) => (
                <tr key={linea.id} className="hover:bg-antracita-700/20">
                  <td className="px-3 py-2"><CeldaEditable valor={linea.codigoOp} onCommit={(v) => confirmarEdicion(linea, 'codigoOp', v)} title={linea.codigoOp} className="min-w-0" /></td>
                  <td className="px-3 py-2"><CeldaEditable valor={linea.descripcion} onCommit={(v) => confirmarEdicion(linea, 'descripcion', v)} title={linea.descripcion} className="min-w-0" /></td>
                  <td className="px-3 py-2"><CeldaEditable valor={linea.tiempo} onCommit={(v) => confirmarEdicion(linea, 'tiempo', v)} numerico className="min-w-0 text-right" /></td>
                  <td className="px-3 py-2"><CeldaEditable valor={linea.precioHora} onCommit={(v) => confirmarEdicion(linea, 'precioHora', v)} numerico formato={formatearPrecio} className="min-w-0 text-right" /></td>
                  <td className="px-3 py-2 text-right font-medium text-white">{formatearEuros(linea.importe)}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" disabled={eliminarLinea.isLoading} onClick={() => confirmarEliminar(linea)} aria-label="Eliminar" title="Eliminar" className="rounded-md px-2 py-1 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">×</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-antracita-700 pt-3 sm:flex-row sm:items-start">
        <div className="relative flex-1">
          <input
            value={texto}
            onChange={(event) => { setTexto(event.target.value); setAbierto(true); setActivo(-1) }}
            onFocus={() => setAbierto(true)}
            onKeyDown={manejarTeclas}
            placeholder="Buscar operación por código o descripción…"
            aria-label="Buscar operación"
            className={inputClass}
          />
          {abierto && busqueda.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-antracita-600 bg-antracita-800 shadow-xl">
              {resultados.length === 0
                ? <li className="px-4 py-3 text-sm text-slate-400">Sin resultados.</li>
                : resultados.map((operacion, i) => (
                  <li key={operacion.id}>
                    <button
                      type="button"
                      onMouseDown={(event) => { event.preventDefault(); elegirOperacion(operacion) }}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm ${i === activo ? 'bg-azul-500/20' : 'hover:bg-antracita-700'}`}
                    >
                      <span className="text-slate-200"><span className="font-medium text-white">{operacion.codigo}</span> · {operacion.descripcion}</span>
                      <span className="shrink-0 text-slate-400">{operacion.tiempoDefecto} h · {formatearEuros(operacion.precioHoraDefecto)}/h</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={agregarLinea.isLoading}
            onClick={() => { if (activo >= 0 && resultados[activo]) elegirOperacion(resultados[activo]); else if (resultados.length > 0) elegirOperacion(resultados[0]) }}
            className="rounded-lg border border-azul-500/50 bg-azul-500/10 px-3 py-2 text-sm font-medium text-azul-300 hover:bg-azul-500/20 disabled:opacity-50"
          >
            + Añadir
          </button>
          <button
            type="button"
            disabled={agregarLinea.isLoading}
            onClick={anadirLineaLibre}
            className="rounded-lg border border-antracita-600 px-3 py-2 text-sm text-slate-300 hover:bg-antracita-700 disabled:opacity-50"
          >
            Línea libre
          </button>
        </div>
      </div>
    </div>
  )
}
