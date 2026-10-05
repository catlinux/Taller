import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from 'react-query'
import { apiGet } from '../lib/api.js'
import { formatearEuros } from '../lib/ordenes.js'

// Gráfica de barras del consumo de un artículo por semanas, meses, trimestres o
// años. Se dibuja con SVG propio (sin dependencias) a partir de la serie continua
// que devuelve /api/articulos/consumo-serie. Solo se muestra cuando hay un
// artículo seleccionado; sin referencia devuelve null. Respeta los filtros de
// estados, mecánico, familia y proveedor que se aplican en el resto de la página.

// Agrupaciones de la gráfica: valor interno, etiqueta, periodos disponibles y el
// número de periodos que se usa por defecto en cada una.
const AGRUPACIONES = [
  { valor: 'semana', etiqueta: 'Semanas', periodos: [12, 26, 52], porDefecto: 12 },
  { valor: 'mes', etiqueta: 'Meses', periodos: [6, 12, 24], porDefecto: 12 },
  { valor: 'trimestre', etiqueta: 'Trimestres', periodos: [4, 8, 12], porDefecto: 8 },
  { valor: 'anio', etiqueta: 'Años', periodos: [3, 5, 10], porDefecto: 5 },
]

// Métricas que puede mostrar la gráfica (eje Y y altura de las barras).
const METRICAS = [
  { valor: 'unidades', etiqueta: 'Unidades' },
  { valor: 'importe', etiqueta: 'Importe sin IVA' },
]

const ALTO = 240
const MARGEN = { arriba: 28, derecha: 14, abajo: 34, izquierda: 64 }

const FORMATO_CANTIDAD = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })

// Formatea una cantidad (unidades) en es-ES con un máximo de dos decimales.
function formatearCantidad(valor) {
  const numero = Number(valor)
  return FORMATO_CANTIDAD.format(Number.isFinite(numero) ? numero : 0)
}

// Redondea un valor a un paso «bonito» (1, 2, 2,5 o 5 por una potencia de diez).
function pasoBonito(valor) {
  if (!(valor > 0)) return 1
  const exponente = Math.floor(Math.log10(valor))
  const base = valor / 10 ** exponente
  if (base <= 1) return 1 * 10 ** exponente
  if (base <= 2) return 2 * 10 ** exponente
  if (base <= 2.5) return 2.5 * 10 ** exponente
  if (base <= 5) return 5 * 10 ** exponente
  return 10 * 10 ** exponente
}

// Escala del eje Y: máximo «bonito» y sus marcas desde 0.
function escalaBonita(maximo) {
  if (!(maximo > 0)) return { maximo: 1, marcas: [0, 1] }
  const paso = pasoBonito(maximo / 4)
  const tope = Math.ceil(maximo / paso) * paso
  const marcas = []
  for (let valor = 0; valor <= tope + paso / 2; valor += paso) marcas.push(valor)
  return { maximo: tope, marcas }
}

// Selector segmentado (agrupación o métrica).
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

// Gráfica de consumo (evolución temporal) del artículo seleccionado.
export default function GraficaConsumo({ referencia = '', descripcion = '', estados = '', mecanicoId = '', familia = '', proveedor = '', token, onQuitar }) {
  const [agrupar, setAgrupar] = useState('mes')
  const [periodos, setPeriodos] = useState(12)
  const [metrica, setMetrica] = useState('unidades')
  const [activo, setActivo] = useState(null)
  const contenedorRef = useRef(null)
  const [ancho, setAncho] = useState(680)

  // Mide el ancho disponible para dibujar la gráfica sin deformarla.
  useEffect(() => {
    const nodo = contenedorRef.current
    if (!nodo) return undefined
    const medir = () => setAncho(nodo.clientWidth || 680)
    medir()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', medir)
      return () => window.removeEventListener('resize', medir)
    }
    const observador = new ResizeObserver(medir)
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [referencia])

  // Al cambiar de artículo se vuelve a la vista por defecto (meses, un año y
  // unidades).
  useEffect(() => {
    setAgrupar('mes')
    setPeriodos(12)
    setMetrica('unidades')
    setActivo(null)
  }, [referencia])

  // Consulta con los MISMOS estados, mecánico, familia y proveedor que la página.
  const consulta = useMemo(() => {
    const parametros = new URLSearchParams({ agrupar, periodos: String(periodos) })
    if (referencia) parametros.set('referencia', referencia)
    if (estados) parametros.set('estados', estados)
    if (mecanicoId) parametros.set('mecanicoId', mecanicoId)
    if (familia) parametros.set('familia', familia)
    if (proveedor) parametros.set('proveedor', proveedor)
    return parametros.toString()
  }, [referencia, agrupar, periodos, estados, mecanicoId, familia, proveedor])

  const { data, isLoading, error } = useQuery(
    ['articulos', 'consumo-serie', referencia, agrupar, periodos, estados, mecanicoId, familia, proveedor],
    () => apiGet(`/api/articulos/consumo-serie?${consulta}`, token),
    { enabled: Boolean(token), keepPreviousData: true },
  )

  // Sin artículo seleccionado no hay gráfica de evolución: la comparativa entre
  // productos la cubre el ranking de «Comparativa de productos».
  if (!referencia) return null

  const puntos = data?.puntos ?? []
  const totales = data?.totales ?? { cantidad: 0, importe: 0, ordenes: 0, articulos: 0 }
  const descripcionMostrada = data?.descripcion || descripcion
  const agrupacion = AGRUPACIONES.find((opcion) => opcion.valor === agrupar) ?? AGRUPACIONES[1]

  function cambiarAgrupar(valor) {
    const elegida = AGRUPACIONES.find((opcion) => opcion.valor === valor)
    setAgrupar(valor)
    setPeriodos(elegida ? elegida.porDefecto : 12)
    setActivo(null)
  }

  const valores = puntos.map((punto) => (metrica === 'importe' ? punto.importe : punto.cantidad))
  const maximo = valores.reduce((mayor, valor) => (valor > mayor ? valor : mayor), 0)
  const escala = escalaBonita(maximo)
  const formatear = metrica === 'importe' ? formatearEuros : formatearCantidad
  const anchoUtil = Math.max(80, ancho - MARGEN.izquierda - MARGEN.derecha)
  const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo
  const bandaAncho = puntos.length > 0 ? anchoUtil / puntos.length : anchoUtil
  const barraAncho = Math.max(2, Math.min(bandaAncho * 0.62, 44))
  const mostrarValores = bandaAncho >= 42
  const pasoEtiqueta = Math.max(1, Math.ceil(puntos.length / Math.max(2, Math.floor(anchoUtil / 62))))
  const xBanda = (indice) => MARGEN.izquierda + bandaAncho * indice
  const xCentro = (indice) => xBanda(indice) + bandaAncho / 2
  const yValor = (valor) => MARGEN.arriba + altoUtil - (escala.maximo > 0 ? (valor / escala.maximo) * altoUtil : 0)
  const baseY = MARGEN.arriba + altoUtil
  const sujeto = referencia
  const ariaLabel = puntos.length > 0
    ? `Consumo de ${sujeto} por ${agrupacion.etiqueta.toLowerCase()}: ${formatearCantidad(totales.cantidad)} unidades y ${formatearEuros(totales.importe)} sin IVA en ${totales.ordenes} órdenes.`
    : `Consumo de ${sujeto}.`

  return (
    <section className="card mb-6 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Gráfica de consumo</h2>
          <p className="mt-1 text-sm text-slate-400">
            <span className="font-medium text-white">{referencia}</span>
            {descripcionMostrada && <span> · {descripcionMostrada}</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={onQuitar}
          className="rounded-lg border border-antracita-600 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-antracita-700 hover:text-white"
        >
          Quitar selección
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Segmentado
          etiqueta="Agrupar por"
          opciones={AGRUPACIONES.map((opcion) => ({ valor: opcion.valor, etiqueta: opcion.etiqueta }))}
          valor={agrupar}
          onChange={cambiarAgrupar}
        />
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <span>Ver</span>
          <select
            value={periodos}
            onChange={(event) => { setPeriodos(Number(event.target.value)); setActivo(null) }}
            className="input w-auto py-1.5"
            aria-label="Número de periodos"
          >
            {agrupacion.periodos.map((valor) => (
              <option key={valor} value={valor}>{valor} {valor === 1 ? 'periodo' : 'periodos'}</option>
            ))}
          </select>
        </label>
        <Segmentado
          etiqueta="Métrica"
          opciones={METRICAS}
          valor={metrica}
          onChange={(valor) => { setMetrica(valor); setActivo(null) }}
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span className="text-slate-400">Unidades: <span className="tabular-nums text-slate-200">{formatearCantidad(totales.cantidad)}</span></span>
        <span className="text-slate-400">Importe sin IVA: <span className="tabular-nums text-slate-200">{formatearEuros(totales.importe)}</span></span>
        <span className="text-slate-400">Órdenes: <span className="tabular-nums text-slate-200">{totales.ordenes}</span></span>
      </div>

      <div ref={contenedorRef} className="relative">
        {isLoading && puntos.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-slate-500">Cargando gráfica…</div>
        ) : error ? (
          <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error.message}</p>
        ) : (
          <>
            <svg role="img" aria-label={ariaLabel} width={ancho} height={ALTO} viewBox={`0 0 ${ancho} ${ALTO}`} className="block w-full">
              {escala.marcas.map((marca) => {
                const y = yValor(marca)
                return (
                  <g key={`marca-${marca}`}>
                    <line x1={MARGEN.izquierda} y1={y} x2={ancho - MARGEN.derecha} y2={y} stroke="rgb(var(--ant-700))" strokeWidth="1" />
                    <text x={MARGEN.izquierda - 8} y={y + 3} textAnchor="end" fontSize="10" fill="rgb(var(--ant-500))">{formatear(marca)}</text>
                  </g>
                )
              })}

              {puntos.map((punto, indice) => {
                const valor = valores[indice]
                const y = yValor(valor)
                const altoBarra = Math.max(0, baseY - y)
                const resaltada = activo === indice
                return (
                  <g
                    key={punto.clave}
                    onMouseEnter={() => setActivo(indice)}
                    onMouseLeave={() => setActivo((actual) => (actual === indice ? null : actual))}
                    onClick={() => setActivo((actual) => (actual === indice ? null : indice))}
                    className="cursor-pointer"
                  >
                    <rect x={xBanda(indice)} y={MARGEN.arriba} width={bandaAncho} height={altoUtil} fill="transparent" />
                    {altoBarra > 0 && (
                      <rect
                        x={xCentro(indice) - barraAncho / 2}
                        y={y}
                        width={barraAncho}
                        height={altoBarra}
                        rx={Math.min(4, barraAncho / 2)}
                        fill={resaltada ? 'rgb(var(--acento-400))' : 'rgb(var(--acento-500))'}
                      />
                    )}
                    {mostrarValores && valor > 0 && (
                      <text x={xCentro(indice)} y={y - 6} textAnchor="middle" fontSize="10" fill="rgb(var(--ant-500))">{formatear(valor)}</text>
                    )}
                    {indice % pasoEtiqueta === 0 && (
                      <text x={xCentro(indice)} y={ALTO - 12} textAnchor="middle" fontSize="10" fill="rgb(var(--ant-500))">{punto.etiqueta}</text>
                    )}
                  </g>
                )
              })}

              <line x1={MARGEN.izquierda} y1={baseY} x2={ancho - MARGEN.derecha} y2={baseY} stroke="rgb(var(--ant-600))" strokeWidth="1" />

              {maximo === 0 && (
                <text x={MARGEN.izquierda + anchoUtil / 2} y={MARGEN.arriba + altoUtil / 2} textAnchor="middle" fontSize="13" fill="rgb(var(--ant-500))">Sin consumo en este periodo.</text>
              )}
            </svg>

            {activo !== null && puntos[activo] && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-antracita-600 bg-antracita-950 px-3 py-1.5 text-xs text-white shadow-2xl"
                style={{ left: Math.min(Math.max(xCentro(activo), 90), Math.max(90, ancho - 90)), top: yValor(valores[activo]) - 8 }}
              >
                {`${puntos[activo].etiqueta}: ${formatearCantidad(puntos[activo].cantidad)} unidades · ${puntos[activo].ordenes} ${puntos[activo].ordenes === 1 ? 'orden' : 'órdenes'} · ${formatearEuros(puntos[activo].importe)}`}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
