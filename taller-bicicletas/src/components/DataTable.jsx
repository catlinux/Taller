import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFilasPorPagina, VALORES_FILAS_POR_PAGINA } from '../lib/ajustes.js'
import {
  IconFlechaArriba,
  IconFlechaAbajo,
  IconChevronIzq,
  IconChevronDer,
  IconBuscar,
} from './Icons.jsx'

// Ancho por defecto de la columna de acciones (configurable con la prop `anchoAcciones`).
const ANCHO_ACCIONES = 170

// Ancho mínimo de la tabla para forzar scroll horizontal en tablet en vez de deformarse.
const ANCHO_MINIMO_TABLA = 900

// Ancho mínimo asignado a las columnas sin ancho fijo en píxeles (porcentaje o
// flexibles), para que la suma de anchos sea realista al calcular el mínimo.
const ANCHO_MINIMO_FLEXIBLE = 140

// Clases de alineación de texto para cabecera y celdas.
const ALINEACION_TEXTO = {
  izq: 'text-left',
  der: 'text-right',
  centro: 'text-center',
}

// Clases de alineación horizontal (flex) para el contenido de la cabecera.
const ALINEACION_FLEX = {
  izq: 'justify-start',
  der: 'justify-end',
  centro: 'justify-center',
}

// Indica si un valor debe considerarse vacío para la ordenación.
function esVacio(valor) {
  return valor === null || valor === undefined || valor === ''
}

// Normaliza el valor de ordenación según el tipo. Los valores vacíos, los números
// no finitos y las fechas inválidas se marcan como vacíos (siempre van al final).
function claveOrden(valor, tipo) {
  if (esVacio(valor)) return { vacio: true, valor: null }
  if (tipo === 'numero') {
    const numero = Number(valor)
    return Number.isFinite(numero) ? { vacio: false, valor: numero } : { vacio: true, valor: null }
  }
  if (tipo === 'fecha') {
    const tiempo = new Date(valor).getTime()
    return Number.isFinite(tiempo) ? { vacio: false, valor: tiempo } : { vacio: true, valor: null }
  }
  return { vacio: false, valor: String(valor) }
}

// Compara dos filas según una columna y una dirección. Los valores vacíos van
// siempre al final, en ambos sentidos.
function compararFilas(filaA, filaB, columna, dir) {
  const a = claveOrden(columna.valor(filaA), columna.tipo)
  const b = claveOrden(columna.valor(filaB), columna.tipo)
  if (a.vacio && b.vacio) return 0
  if (a.vacio) return 1
  if (b.vacio) return -1
  let resultado
  if (columna.tipo === 'numero' || columna.tipo === 'fecha') {
    resultado = a.valor - b.valor
  } else {
    resultado = String(a.valor).localeCompare(String(b.valor), 'es', { numeric: true, sensitivity: 'base' })
  }
  return dir === 'desc' ? -resultado : resultado
}

// Devuelve el ancho en píxeles de una columna si está fijado como 'NNpx', o null.
function anchoEnPx(ancho) {
  const coincide = /^(\d+(?:\.\d+)?)px$/.exec(String(ancho || '').trim())
  return coincide ? Number(coincide[1]) : null
}

// Calcula el ancho mínimo de la tabla sumando los anchos fijos en píxeles. Las
// columnas en porcentaje o flexibles aportan un mínimo razonable. Cuando todas las
// columnas son fijas, la suma es el ancho real de la tabla (sin tope de 900 px).
function calcularAnchoMinimo(columnas, tieneAcciones, anchoAcciones) {
  let suma = 0
  for (const columna of columnas) {
    const px = anchoEnPx(columna.ancho)
    suma += px === null ? ANCHO_MINIMO_FLEXIBLE : px
  }
  if (tieneAcciones) suma += anchoAcciones
  const todasFijas = columnas.every((columna) => anchoEnPx(columna.ancho) !== null)
  return todasFijas ? suma : Math.max(suma, ANCHO_MINIMO_TABLA)
}

// Construye la lista de páginas visibles con ventana y elipsis (p. ej. 1 … 4 5 6 … 49).
function rangoPaginas(actual, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const paginas = [1]
  const inicio = Math.max(2, actual - 1)
  const fin = Math.min(total - 1, actual + 1)
  if (inicio > 2) paginas.push('...')
  for (let i = inicio; i <= fin; i += 1) paginas.push(i)
  if (fin < total - 1) paginas.push('...')
  paginas.push(total)
  return paginas
}

// Muestra el valor por defecto de una celda (texto truncado con título completo).
function ValorCelda({ texto }) {
  const contenido = texto === null || texto === undefined || texto === '' ? '—' : texto
  return <span className="block truncate" title={String(contenido)}>{contenido}</span>
}

// Tabla de datos reutilizable: cabeceras ordenables, anchos de columna fijos y paginación.
export default function DataTable({
  columnas = [],
  filas = [],
  claveFila,
  ordenInicial = null,
  onFila,
  cargando = false,
  vacio = 'No hay datos.',
  acciones,
  etiquetaPlural = 'registros',
  // Al cambiar este valor se vuelve a la página 1 (p. ej. al cambiar la búsqueda o un filtro).
  claveReinicio,
  // Fija la primera columna al hacer scroll horizontal (útil en tablas anchas).
  primeraColumnaFija = false,
  // Ancho de la columna de acciones en píxeles.
  anchoAcciones = ANCHO_ACCIONES,
  // Confina la tabla en un contenedor con scroll vertical y cabecera fija.
  scrollInterno = false,
}) {
  const [filasPorPagina, setFilasPorPagina] = useFilasPorPagina()
  const [orden, setOrden] = useState(ordenInicial)
  const [pagina, setPagina] = useState(1)
  // Burbuja de ayuda de las cabeceras (posición fija mediante portal).
  const [tooltip, setTooltip] = useState(null)

  // Vuelve a la página 1 cuando cambia la clave de reinicio (búsqueda/filtros).
  useEffect(() => {
    setPagina(1)
  }, [claveReinicio])

  // Listado ordenado de todas las filas (no solo la página visible).
  const ordenadas = useMemo(() => {
    if (!orden) return filas
    const columna = columnas.find((col) => col.clave === orden.clave)
    if (!columna) return filas
    return [...filas].sort((a, b) => compararFilas(a, b, columna, orden.dir))
  }, [filas, orden, columnas])

  const totalFilas = ordenadas.length
  const totalPaginas = Math.max(1, Math.ceil(totalFilas / filasPorPagina))
  // Si la página actual queda fuera de rango (cambia el total), usamos la última válida.
  const paginaActual = Math.min(Math.max(1, pagina), totalPaginas)
  const visibles = useMemo(
    () => ordenadas.slice((paginaActual - 1) * filasPorPagina, paginaActual * filasPorPagina),
    [ordenadas, paginaActual, filasPorPagina],
  )

  const tieneAcciones = typeof acciones === 'function'
  const numeroColumnas = columnas.length + (tieneAcciones ? 1 : 0)
  const anchoMinimo = useMemo(
    () => calcularAnchoMinimo(columnas, tieneAcciones, anchoAcciones),
    [columnas, tieneAcciones, anchoAcciones],
  )

  // Muestra la burbuja de ayuda de una cabecera encima de ella.
  function mostrarTooltip(event, texto) {
    if (!texto) return
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltip({ texto, x: rect.left + rect.width / 2, y: rect.top })
  }

  function ocultarTooltip() {
    setTooltip(null)
  }

  function alternarOrden(columna) {
    if (columna.ordenable === false) return
    setOrden((actual) => (actual && actual.clave === columna.clave
      ? { clave: columna.clave, dir: actual.dir === 'asc' ? 'desc' : 'asc' }
      : { clave: columna.clave, dir: 'asc' }))
    setPagina(1)
  }

  function cambiarFilasPorPagina(valor) {
    setFilasPorPagina(valor)
    setPagina(1)
  }

  const desde = totalFilas === 0 ? 0 : (paginaActual - 1) * filasPorPagina + 1
  const hasta = Math.min(paginaActual * filasPorPagina, totalFilas)

  return (
    <div className="card overflow-hidden">
      <div className={scrollInterno ? 'max-h-[calc(100vh-18rem)] overflow-auto' : 'overflow-x-auto'}>
        <table
          className="w-full table-fixed text-left text-sm"
          style={{ minWidth: `${anchoMinimo}px` }}
        >
          <colgroup>
            {columnas.map((columna) => <col key={columna.clave} style={{ width: columna.ancho }} />)}
            {tieneAcciones && <col style={{ width: `${anchoAcciones}px` }} />}
          </colgroup>
          <thead className="border-b border-antracita-700 bg-antracita-900/60">
            <tr>
              {columnas.map((columna, indice) => {
                const alinear = columna.alinear || 'izq'
                const ordenable = columna.ordenable !== false
                const activa = orden && orden.clave === columna.clave
                const ariaSort = activa ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                const fija = primeraColumnaFija && indice === 0
                const stickyTop = scrollInterno ? 'sticky top-0 z-20 border-b border-antracita-700 bg-antracita-900' : ''
                const stickyIzq = fija ? `sticky left-0 ${scrollInterno ? 'z-30' : 'z-10'} bg-antracita-900` : ''
                return (
                  <th
                    key={columna.clave}
                    scope="col"
                    aria-sort={ordenable ? ariaSort : undefined}
                    onMouseEnter={(event) => mostrarTooltip(event, columna.title)}
                    onMouseLeave={ocultarTooltip}
                    className={`th group ${ALINEACION_TEXTO[alinear]} ${stickyTop} ${stickyIzq}`}
                  >
                    {ordenable ? (
                      <button
                        type="button"
                        onClick={() => alternarOrden(columna)}
                        className={`flex w-full items-center gap-1 rounded transition hover:text-white ${ALINEACION_FLEX[alinear]}`}
                      >
                        <span className="truncate">{columna.titulo}</span>
                        {activa
                          ? (orden.dir === 'asc'
                            ? <IconFlechaArriba size={14} className="shrink-0 text-azul-300" />
                            : <IconFlechaAbajo size={14} className="shrink-0 text-azul-300" />)
                          : <IconFlechaAbajo size={14} className="shrink-0 opacity-0 transition group-hover:opacity-40" />}
                      </button>
                    ) : (
                      <span className="block truncate">{columna.titulo}</span>
                    )}
                  </th>
                )
              })}
              {tieneAcciones && <th scope="col" className={`th text-right ${scrollInterno ? 'sticky top-0 z-20 border-b border-antracita-700 bg-antracita-900' : ''}`}>Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-antracita-700/80">
            {cargando ? (
              Array.from({ length: 8 }).map((_, indiceFila) => (
                <tr key={`esqueleto-${indiceFila}`} style={{ height: 'var(--fila-alto)' }}>
                  {columnas.map((columna) => (
                    <td key={columna.clave} className="td">
                      <div className="h-3.5 w-3/4 animate-pulse rounded bg-antracita-700/60" />
                    </td>
                  ))}
                  {tieneAcciones && (
                    <td className="td"><div className="ml-auto h-3.5 w-24 animate-pulse rounded bg-antracita-700/60" /></td>
                  )}
                </tr>
              ))
            ) : visibles.length === 0 ? (
              <tr>
                <td colSpan={numeroColumnas} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-slate-500">
                    <IconBuscar size={28} />
                    <p>{vacio}</p>
                  </div>
                </td>
              </tr>
            ) : visibles.map((fila) => {
              const clave = typeof claveFila === 'function' ? claveFila(fila) : undefined
              return (
                <tr
                  key={clave}
                  onClick={onFila ? () => onFila(fila) : undefined}
                  style={{ height: 'var(--fila-alto)' }}
                  className={`transition hover:bg-antracita-700/30 ${onFila ? 'cursor-pointer' : ''}`}
                >
                  {columnas.map((columna, indice) => {
                    const alinear = columna.alinear || 'izq'
                    const valor = columna.valor ? columna.valor(fila) : undefined
                    const fija = primeraColumnaFija && indice === 0
                    return (
                      <td key={columna.clave} className={`td align-middle ${ALINEACION_TEXTO[alinear]} ${columna.clase || ''} ${fija ? 'sticky left-0 z-10 border-r border-antracita-700 bg-antracita-800 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.55)]' : ''}`}>
                        {columna.render ? columna.render(fila) : <ValorCelda texto={valor} />}
                      </td>
                    )
                  })}
                  {tieneAcciones && (
                    <td className="td align-middle">
                      <div className="flex items-center justify-end gap-1">{acciones(fila)}</div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>


      <div className="flex flex-col gap-3 border-t border-antracita-700 px-4 py-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <span>Mostrando {desde}–{hasta} de {totalFilas} {etiquetaPlural}</span>

        {totalPaginas > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              aria-label="Primera página"
              disabled={paginaActual <= 1}
              onClick={() => setPagina(1)}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-antracita-600 hover:bg-antracita-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconChevronIzq size={16} />
            </button>
            <button
              type="button"
              aria-label="Página anterior"
              disabled={paginaActual <= 1}
              onClick={() => setPagina(paginaActual - 1)}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-antracita-600 hover:bg-antracita-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconChevronIzq size={16} />
            </button>
            {rangoPaginas(paginaActual, totalPaginas).map((elemento, indice) => (elemento === '...' ? (
              <span key={`puntos-${indice}`} className="px-1 text-slate-500">…</span>
            ) : (
              <button
                key={elemento}
                type="button"
                aria-label={`Página ${elemento}`}
                aria-current={elemento === paginaActual ? 'page' : undefined}
                onClick={() => setPagina(elemento)}
                className={`flex h-10 min-w-[40px] items-center justify-center rounded-md border px-2 ${elemento === paginaActual ? 'border-azul-500 bg-azul-500 font-semibold text-white' : 'border-antracita-600 hover:bg-antracita-700'}`}
              >
                {elemento}
              </button>
            )))}
            <button
              type="button"
              aria-label="Página siguiente"
              disabled={paginaActual >= totalPaginas}
              onClick={() => setPagina(paginaActual + 1)}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-antracita-600 hover:bg-antracita-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconChevronDer size={16} />
            </button>
            <button
              type="button"
              aria-label="Última página"
              disabled={paginaActual >= totalPaginas}
              onClick={() => setPagina(totalPaginas)}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-antracita-600 hover:bg-antracita-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconChevronDer size={16} />
            </button>
          </div>
        )}

        <label className="flex items-center gap-2">
          <span>Filas por página</span>
          <select
            value={filasPorPagina}
            onChange={(event) => cambiarFilasPorPagina(event.target.value)}
            className="rounded-md border border-antracita-600 bg-antracita-800 px-2 py-1.5 text-sm text-white outline-none focus:border-azul-500"
          >
            {VALORES_FILAS_POR_PAGINA.map((valor) => <option key={valor} value={valor}>{valor}</option>)}
          </select>
        </label>
      </div>

      {tooltip && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-antracita-600 bg-antracita-950 px-3 py-1.5 text-xs font-normal normal-case tracking-normal text-white shadow-2xl"
          style={{ left: tooltip.x, top: tooltip.y - 8 }}
        >
          {tooltip.texto}
        </div>,
        document.body,
      )}
    </div>
  )
}

