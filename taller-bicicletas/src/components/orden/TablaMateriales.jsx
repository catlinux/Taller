import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { apiDelete, apiGet, apiPost, apiPut } from '../../lib/api.js'
import { aNumero, formatearEuros } from '../../lib/ordenes.js'
import { coincideTexto } from '../../lib/texto.js'
import { useAjustes } from '../../context/AjustesContext.jsx'

const inputClass = 'mt-1.5 w-full rounded-lg border border-antracita-600 bg-antracita-900 px-3 py-2.5 text-white outline-none focus:border-azul-400'
const celdaClass = 'w-full rounded-md border border-transparent bg-antracita-900/60 px-2 py-2 text-white outline-none focus:border-azul-400'

// Campos de la línea que se editan como números.
const CAMPOS_NUMERICOS = ['cantidad', 'precioUnitario', 'descuento', 'iva']

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

// Tabla editable de materiales de la orden, con buscador de artículos y
// línea libre. Todos los cambios se guardan contra el servidor, que devuelve
// la orden recalculada y con la que se refresca la caché.
export default function TablaMateriales({ orden, token }) {
  const queryClient = useQueryClient()
  const { ajustes } = useAjustes()
  const ordenId = orden.id
  const claveOrden = ['orden', String(ordenId)]
  const materiales = orden.materiales ?? []

  const [errorAccion, setErrorAccion] = useState('')
  const [texto, setTexto] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(-1)

  // Debounce de 250 ms: retrasa el filtrado mientras se escribe.
  useEffect(() => {
    const temporizador = setTimeout(() => setBusqueda(texto.trim()), 250)
    return () => clearTimeout(temporizador)
  }, [texto])

  // El endpoint de artículos no tiene búsqueda por texto: se carga el catálogo
  // y se filtra en el cliente por referencia o descripción.
  const { data: articulos = [] } = useQuery(
    ['articulos', 'catalogo'],
    () => apiGet('/api/articulos', token),
    { enabled: Boolean(token) },
  )

  const resultados = useMemo(() => {
    const q = busqueda.trim()
    if (!q) return []
    return articulos
      .filter((articulo) => coincideTexto([articulo.referencia, articulo.descripcion], q))
      .slice(0, 10)
  }, [articulos, busqueda])

  function guardarEnCache(actualizada) {
    queryClient.setQueryData(claveOrden, actualizada)
    queryClient.invalidateQueries(['ordenes'])
  }

  const editarLinea = useMutation(
    ({ materialId, cambios }) => apiPut(`/api/ordenes/${ordenId}/materiales/${materialId}`, token, cambios),
    { onSuccess: guardarEnCache, onError: (e) => setErrorAccion(e.message) },
  )

  const agregarLinea = useMutation(
    (payload) => apiPost(`/api/ordenes/${ordenId}/materiales`, token, payload),
    { onSuccess: guardarEnCache, onError: (e) => setErrorAccion(e.message) },
  )

  const eliminarLinea = useMutation(
    (materialId) => apiDelete(`/api/ordenes/${ordenId}/materiales/${materialId}`, token),
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
    editarLinea.mutate({ materialId: linea.id, cambios: { [campo]: valor } })
    return true
  }

  function restablecerBuscador() {
    setTexto('')
    setBusqueda('')
    setAbierto(false)
    setActivo(-1)
  }

  function elegirArticulo(articulo) {
    setErrorAccion('')
    agregarLinea.mutate({ articuloId: articulo.id, cantidad: 1 })
    restablecerBuscador()
  }

  function anadirLineaLibre() {
    setErrorAccion('')
    // La línea libre usa el IVA por defecto del taller (por defecto 21 %).
    const iva = Number(ajustes?.ivaDefecto)
    agregarLinea.mutate({ referencia: texto.trim() || '-', descripcion: 'Material', cantidad: 1, precioUnitario: 0, iva: Number.isFinite(iva) ? iva : 21 })
    restablecerBuscador()
  }

  function confirmarEliminar(linea) {
    if (window.confirm(`¿Eliminar el material «${linea.descripcion}»?`)) {
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
      elegirArticulo(resultados[activo])
    }
  }

  return (
    <div className="space-y-3">
      {errorAccion && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{errorAccion}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[150px]" />
            <col />
            <col className="w-[84px]" />
            <col className="w-[104px]" />
            <col className="w-[80px]" />
            <col className="w-[104px]" />
            <col className="w-[80px]" />
            <col className="w-[112px]" />
            <col className="w-[48px]" />
          </colgroup>
          <thead className="border-b border-antracita-700 text-xs uppercase tracking-wide text-slate-500"><tr>
            <th className="px-3 py-3">Referencia</th>
            <th className="px-3 py-3">Descripción</th>
            <th className="px-3 py-3 text-right">Cantidad</th>
            <th className="px-3 py-3 text-right">Precio unit.</th>
            <th className="px-3 py-3 text-right">Dto %</th>
            <th className="px-3 py-3 text-right">Precio neto</th>
            <th className="px-3 py-3 text-right">IVA %</th>
            <th className="px-3 py-3 text-right">Importe</th>
            <th className="px-3 py-3 text-right">Acciones</th>
          </tr></thead>
          <tbody className="divide-y divide-antracita-700/80">
            {materiales.length === 0
              ? <tr><td colSpan="9" className="px-3 py-8 text-center text-slate-400">Todavía no hay materiales en esta orden.</td></tr>
              : materiales.map((linea) => (
                <tr key={linea.id} className="hover:bg-antracita-700/20">
                  <td className="px-3 py-2"><CeldaEditable valor={linea.referencia} onCommit={(v) => confirmarEdicion(linea, 'referencia', v)} title={linea.referencia} className="min-w-0" /></td>
                  <td className="px-3 py-2"><CeldaEditable valor={linea.descripcion} onCommit={(v) => confirmarEdicion(linea, 'descripcion', v)} title={linea.descripcion} className="min-w-0" /></td>
                  <td className="px-3 py-2"><CeldaEditable valor={linea.cantidad} onCommit={(v) => confirmarEdicion(linea, 'cantidad', v)} numerico className="min-w-0 text-right" /></td>
                  <td className="px-3 py-2"><CeldaEditable valor={linea.precioUnitario} onCommit={(v) => confirmarEdicion(linea, 'precioUnitario', v)} numerico formato={formatearPrecio} className="min-w-0 text-right" /></td>
                  <td className="px-3 py-2"><CeldaEditable valor={linea.descuento} onCommit={(v) => confirmarEdicion(linea, 'descuento', v)} numerico className="min-w-0 text-right" /></td>
                  <td className="px-3 py-2 text-right text-slate-300">{formatearEuros(linea.precioNeto)}</td>
                  <td className="px-3 py-2"><CeldaEditable valor={linea.iva} onCommit={(v) => confirmarEdicion(linea, 'iva', v)} numerico className="min-w-0 text-right" /></td>
                  <td className="px-3 py-2 text-right font-medium text-white">{formatearEuros(linea.importeTotal)}</td>
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
            placeholder="Buscar artículo por referencia o descripción…"
            aria-label="Buscar artículo"
            className={`${inputClass} min-w-[280px]`}
          />
          {abierto && busqueda.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-antracita-600 bg-antracita-800 shadow-xl">
              {resultados.length === 0
                ? <li className="px-4 py-3 text-sm text-slate-400">Sin resultados.</li>
                : resultados.map((articulo, i) => (
                  <li key={articulo.id}>
                    <button
                      type="button"
                      onMouseDown={(event) => { event.preventDefault(); elegirArticulo(articulo) }}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm ${i === activo ? 'bg-azul-500/20' : 'hover:bg-antracita-700'}`}
                    >
                      <span className="text-slate-200"><span className="font-medium text-white">{articulo.referencia}</span> · {articulo.descripcion}</span>
                      <span className="shrink-0 text-slate-400">{formatearEuros(articulo.precioVenta)} · stock {articulo.stock}</span>
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
            onClick={() => { if (activo >= 0 && resultados[activo]) elegirArticulo(resultados[activo]); else if (resultados.length > 0) elegirArticulo(resultados[0]) }}
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
