import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from 'react-query'
import { apiGet } from '../lib/api.js'
import { formatearEuros } from '../lib/ordenes.js'
import { IconChevronIzq, IconChevronDer } from './Icons.jsx'

// Comparativa de productos de «Artículos > Consumo»: un ranking de barras
// horizontales con los productos que más se gastan (unidades), más importe
// acumulan o aparecen en más órdenes (demanda) en el periodo. Se dibuja con SVG
// propio (sin dependencias). Comparte los filtros de estados, mecánico, familia
// y proveedor con el resto de la página (no la búsqueda ni el rango de fechas).

// Agrupaciones del periodo mostrado.
const AGRUPACIONES = [
  { valor: 'semana', etiqueta: 'Semana' },
  { valor: 'mes', etiqueta: 'Mes' },
  { valor: 'trimestre', etiqueta: 'Trimestre' },
  { valor: 'anio', etiqueta: 'Año' },
]

// Métricas de ordenación (con una ayuda breve en el title de cada botón).
const METRICAS = [
  { valor: 'unidades', etiqueta: 'Unidades', ayuda: 'Unidades: los productos que más se gastan' },
  { valor: 'importe', etiqueta: 'Importe sin IVA', ayuda: 'Importe sin IVA: el valor del material consumido' },
  { valor: 'ordenes', etiqueta: 'Órdenes', ayuda: 'Órdenes: en cuántas órdenes se usa cada producto (demanda)' },
]

// Tamaños del «Top» disponibles.
const LIMITES = [10, 20, 30]

// Colores de la variación (fijos, para que se lean en tema oscuro y claro).
const COLOR_SUBE = '#34D399'
const COLOR_BAJA = '#FF9A55'
const COLOR_NEUTRO = 'rgb(var(--ant-500))'

const FORMATO_CANTIDAD = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })

// Formatea unidades con un máximo de dos decimales.
function formatearCantidad(valor) {
  const numero = Number(valor)
  return FORMATO_CANTIDAD.format(Number.isFinite(numero) ? numero : 0)
}

// Ancho aproximado de un texto (para colocar y truncar etiquetas en el SVG).
function anchoTexto(texto, fontSize) {
  return String(texto ?? '').length * fontSize * 0.56
}

// Trunca un texto con elipsis para que no supere `maxPx` (aprox.).
function truncarTexto(texto, maxPx, fontSize) {
  const cadena = String(texto ?? '')
  const maxCaracteres = Math.max(1, Math.floor(maxPx / (fontSize * 0.56)))
  if (cadena.length <= maxCaracteres) return cadena
  return `${cadena.slice(0, Math.max(1, maxCaracteres - 1))}…`
}

// Porcentaje entero de un valor sobre el total del periodo.
function porcentajeDe(valor, total) {
  if (!(total > 0)) return '0 %'
  return `${Math.round((valor / total) * 100)} %`
}

// Flecha, signo, color y title de la variación respecto al periodo anterior.
function variacionDe(item, formatear) {
  const { variacion, anterior } = item
  if (variacion === null || variacion === undefined) {
    return { texto: '—', color: COLOR_NEUTRO, titulo: 'Sin datos del periodo anterior' }
  }
  const titulo = `Periodo anterior: ${formatear(anterior)}`
  if (variacion === 0) return { texto: '=', color: COLOR_NEUTRO, titulo }
  if (variacion > 0) return { texto: `▲ ${variacion} %`, color: COLOR_SUBE, titulo }
  return { texto: `▼ ${Math.abs(variacion)} %`, color: COLOR_BAJA, titulo }
}

// Selector segmentado (agrupación o métrica), con aria-pressed.
function Segmentado({ etiqueta, opciones, valor, onChange }) {
  return (
    <div role="group" aria-label={etiqueta} className="inline-flex rounded-lg border border-antracita-600 p-0.5">
      {opciones.map((opcion) => {
        const activa = opcion.valor === valor
        return (
          <button
            key={opcion.valor}
            type="button"
            aria-pressed={activa}
            title={opcion.ayuda ?? opcion.etiqueta}
            onClick={() => onChange(opcion.valor)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${activa ? 'bg-azul-500 text-white mantener-blanco' : 'text-slate-300 hover:bg-antracita-700 hover:text-white'}`}
          >
            {opcion.etiqueta}
          </button>
        )
      })}
    </div>
  )
}

// Ranking comparativo de productos.
export default function RankingConsumo({ estados = '', mecanicoId = '', familia = '', proveedor = '', token, seleccionada = '', onSeleccionar }) {
  const [agrupar, setAgrupar] = useState('mes')
  const [metrica, setMetrica] = useState('unidades')
  const [limite, setLimite] = useState(10)
  // Día dentro del periodo mostrado; vacío = periodo actual (hoy).
  const [fecha, setFecha] = useState('')
  const [activo, setActivo] = useState(null)

  const contenedorRef = useRef(null)
  const [ancho, setAncho] = useState(720)

  // Mide el ancho disponible para dibujar la gráfica sin deformarla.
  useEffect(() => {
    const nodo = contenedorRef.current
    if (!nodo) return undefined
    const medir = () => setAncho(nodo.clientWidth || 720)
    medir()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', medir)
      return () => window.removeEventListener('resize', medir)
    }
    const observador = new ResizeObserver(medir)
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [])

  // Consulta con los MISMOS estados, mecánico, familia y proveedor que la página.
  const consulta = useMemo(() => {
    const parametros = new URLSearchParams({ agrupar, metrica, limite: String(limite) })
    if (fecha) parametros.set('fecha', fecha)
    if (estados) parametros.set('estados', estados)
    if (mecanicoId) parametros.set('mecanicoId', mecanicoId)
    if (familia) parametros.set('familia', familia)
    if (proveedor) parametros.set('proveedor', proveedor)
    return parametros.toString()
  }, [agrupar, metrica, limite, fecha, estados, mecanicoId, familia, proveedor])

  const { data, isLoading, error } = useQuery(
    ['articulos', 'consumo-ranking', agrupar, fecha, metrica, limite, estados, mecanicoId, familia, proveedor],
    () => apiGet(`/api/articulos/consumo-ranking?${consulta}`, token),
    { enabled: Boolean(token), keepPreviousData: true },
  )

  const items = data?.items ?? []
  const etiqueta = data?.etiqueta ?? ''
  const esActual = data?.esActual ?? true
  const valorTotal = data?.valorTotal ?? 0
  const totales = data?.totales ?? { cantidad: 0, importe: 0, ordenes: 0 }
  const totalArticulos = data?.totalArticulos ?? 0

  const formatearValor = metrica === 'importe' ? formatearEuros : formatearCantidad
  const metricaActiva = METRICAS.find((opcion) => opcion.valor === metrica) ?? METRICAS[0]

  function cambiarAgrupar(valor) {
    setAgrupar(valor)
    setFecha('') // al cambiar la agrupación se vuelve al periodo actual
    setActivo(null)
  }

  // Layout responsive: en móvil la etiqueta va encima de la barra.
  const movil = ancho < 620
  const altoFila = movil ? 50 : 34
  const margen = 6
  const altoGrafica = Math.max(items.length * altoFila + margen * 2, 96)
  // Ancho reservado a la derecha para el valor, el porcentaje y la variación.
  const anchoDerecha = movil ? 122 : 176
  const anchoEtiqueta = movil ? 0 : Math.min(260, Math.max(150, Math.round(ancho * 0.32)))
  const xBarra = movil ? 0 : anchoEtiqueta + 10
  const xBarraFin = Math.max(xBarra + 40, ancho - anchoDerecha)
  const anchoBarraUtil = xBarraFin - xBarra
  const maximo = items.reduce((mayor, item) => (item.valor > mayor ? item.valor : mayor), 0)

  const ariaLabel = items.length > 0
    ? `Comparativa de ${items.length} productos en ${etiqueta}, ordenada por ${metricaActiva.etiqueta.toLowerCase()}.`
    : `Comparativa de productos${etiqueta ? ` en ${etiqueta}` : ''}.`

  return (
    <section className="card mb-6 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Comparativa de productos</h2>
        <p className="mt-1 text-sm text-slate-400">Qué productos se gastan más y cuáles tienen más demanda en el periodo.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Segmentado etiqueta="Periodo" opciones={AGRUPACIONES} valor={agrupar} onChange={cambiarAgrupar} />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFecha(data?.fechaAnterior ?? '')}
            disabled={!data}
            title="Periodo anterior"
            aria-label="Periodo anterior"
            className="rounded-lg border border-antracita-600 p-2 text-slate-300 transition hover:bg-antracita-700 hover:text-white disabled:opacity-40"
          >
            <IconChevronIzq size={16} />
          </button>
          <span className="min-w-[8rem] text-center text-sm font-medium text-white">{etiqueta || '—'}</span>
          <button
            type="button"
            onClick={() => setFecha(data?.fechaSiguiente ?? '')}
            disabled={!data || esActual}
            title="Periodo siguiente"
            aria-label="Periodo siguiente"
            className="rounded-lg border border-antracita-600 p-2 text-slate-300 transition hover:bg-antracita-700 hover:text-white disabled:opacity-40"
          >
            <IconChevronDer size={16} />
          </button>
          <button
            type="button"
            onClick={() => setFecha('')}
            disabled={esActual}
            className="rounded-lg border border-antracita-600 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-antracita-700 hover:text-white disabled:opacity-40"
          >
            Actual
          </button>
        </div>

        <Segmentado
          etiqueta="Ordenar por"
          opciones={METRICAS}
          valor={metrica}
          onChange={(valor) => {
            setMetrica(valor)
            setActivo(null)
          }}
        />

        <label className="flex items-center gap-2 text-sm text-slate-400">
          <span>Mostrar</span>
          <select
            value={limite}
            onChange={(event) => {
              setLimite(Number(event.target.value))
              setActivo(null)
            }}
            className="input w-auto py-1.5"
            aria-label="Número de productos"
          >
            {LIMITES.map((valor) => (
              <option key={valor} value={valor}>Top {valor}</option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && items.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-500">Cargando comparativa…</div>
      ) : error ? (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error.message}
        </p>
      ) : items.length === 0 ? (
        <p className="flex h-40 items-center justify-center text-sm text-slate-500">Sin consumo en este periodo.</p>
      ) : (
        <>
          <div ref={contenedorRef} className="relative">
            <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${ancho} ${altoGrafica}`} className="block w-full">
              {items.map((item, indice) => {
                const y = margen + indice * altoFila
                const seleccionadaActual = seleccionada !== '' && seleccionada === item.referencia
                const resaltada = activo === indice || seleccionadaActual
                const proporcion = maximo > 0 ? item.valor / maximo : 0
                const anchoBarra = Math.max(2, proporcion * anchoBarraUtil)
                const colorBarra = resaltada ? 'rgb(var(--acento-400))' : 'rgb(var(--acento-500))'
                const etiquetaProducto = [item.referencia, item.descripcion].filter(Boolean).join(' · ')
                const variacion = variacionDe(item, formatearValor)
                const porcentaje = porcentajeDe(item.valor, valorTotal)
                const textoValor = formatearValor(item.valor)

                // Geometría de la barra y de los textos según el ancho.
                const barAlto = movil ? 14 : 18
                const barY = movil ? y + 26 : y + (altoFila - barAlto) / 2
                const centroY = barY + barAlto / 2
                const barFin = xBarra + anchoBarra
                const fuenteValor = movil ? 10 : 11
                const xValor = barFin + 8
                const xPorcentaje = xValor + anchoTexto(textoValor, fuenteValor) + 6
                const xVariacion = xPorcentaje + anchoTexto(porcentaje, 10) + 6
                const yTextoValor = movil ? barY + barAlto + 12 : centroY + 4
                const alternar = () => onSeleccionar?.(item)

                return (
                  <g
                    key={item.referencia || `${item.descripcion}-${indice}`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={seleccionadaActual}
                    aria-label={`${etiquetaProducto}: ${textoValor}, ${porcentaje}`}
                    className="cursor-pointer focus:outline-none"
                    onMouseEnter={() => setActivo(indice)}
                    onMouseLeave={() => setActivo(null)}
                    onFocus={() => setActivo(indice)}
                    onBlur={() => setActivo(null)}
                    onClick={alternar}
                    onKeyDown={(evento) => {
                      if (evento.key === 'Enter' || evento.key === ' ') {
                        evento.preventDefault()
                        alternar()
                      }
                    }}
                  >
                    {resaltada ? (
                      <rect x={0} y={y} width={ancho} height={altoFila - 4} rx={6} fill="rgb(var(--ant-700) / 0.5)" />
                    ) : null}

                    {movil ? (
                      <text x={2} y={y + 14} fill="currentColor" className="text-slate-400" fontSize={12} dominantBaseline="middle">
                        <title>{etiquetaProducto}</title>
                        {truncarTexto(etiquetaProducto, ancho - 4, 12)}
                      </text>
                    ) : (
                      <text x={2} y={centroY + 4} fill="currentColor" className="text-slate-400" fontSize={12}>
                        <title>{etiquetaProducto}</title>
                        {truncarTexto(etiquetaProducto, anchoEtiqueta - 6, 12)}
                      </text>
                    )}

                    <rect x={xBarra} y={barY} width={anchoBarra} height={barAlto} rx={5} fill={colorBarra} />

                    <text x={xValor} y={yTextoValor} fill="currentColor" className="text-slate-200" fontSize={fuenteValor} fontWeight={600}>
                      {textoValor}
                    </text>
                    <text x={xPorcentaje} y={yTextoValor} fill="currentColor" className="text-slate-500" fontSize={10}>
                      {porcentaje}
                    </text>
                    <text
                      x={xVariacion}
                      y={yTextoValor}
                      fill={variacion.color || 'currentColor'}
                      className={variacion.color ? undefined : 'text-slate-500'}
                      fontSize={10}
                    >
                      <title>{variacion.titulo}</title>
                      {variacion.texto}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-slate-400">
              Top {items.length} de {totalArticulos} {totalArticulos === 1 ? 'artículo' : 'artículos'}
            </span>
            <span className="text-slate-400">
              Unidades: <span className="tabular-nums text-slate-200">{formatearCantidad(totales.cantidad)}</span>
            </span>
            <span className="text-slate-400">
              Importe sin IVA: <span className="tabular-nums text-slate-200">{formatearEuros(totales.importe)}</span>
            </span>
            <span className="text-slate-400">
              Órdenes: <span className="tabular-nums text-slate-200">{totales.ordenes}</span>
            </span>
          </div>
        </>
      )}
    </section>
  )
}

