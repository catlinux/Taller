import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { useAuth } from '../context/AuthContext.jsx'
import ArticulosTabs from '../components/ArticulosTabs.jsx'
import DataTable from '../components/DataTable.jsx'
import MenuExportar from '../components/MenuExportar.jsx'
import { IconBuscar } from '../components/Icons.jsx'
import { apiGet } from '../lib/api.js'
import { exportarExcel, fechaFichero } from '../lib/exportarExcel.js'
import { exportarCsv } from '../lib/exportarCsv.js'
import { formatearEuros, ESTADOS } from '../lib/ordenes.js'
import { columnasExportacionConsumo } from '../lib/columnasConsumo.js'

// ---- Utilidades de fecha (en hora local, para que coincida con el backend) ----

function aIso(fecha) {
  const relleno = (n) => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}-${relleno(fecha.getMonth() + 1)}-${relleno(fecha.getDate())}`
}

// Primer día del mes actual más un desfase de meses.
function inicioMes(fecha, desfase = 0) {
  return new Date(fecha.getFullYear(), fecha.getMonth() + desfase, 1)
}

// Último día del mes actual más un desfase de meses.
function finMes(fecha, desfase = 0) {
  return new Date(fecha.getFullYear(), fecha.getMonth() + desfase + 1, 0)
}

// Número de día de la semana con el lunes como 1 y el domingo como 7.
function diaIso(fecha) {
  const dia = fecha.getDay()
  return dia === 0 ? 7 : dia
}

// Lunes de la semana a la que pertenece la fecha.
function lunesDeSemana(fecha) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() - (diaIso(fecha) - 1))
}

function sumarDias(fecha, dias) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias)
}

// Atajos de periodo. «Todo» deja el rango vacío (sin límite de fechas).
const ATAJOS_PERIODO = (() => {
  const hoy = new Date()
  const lunes = lunesDeSemana(hoy)
  return [
    { etiqueta: 'Hoy', desde: aIso(hoy), hasta: aIso(hoy) },
    { etiqueta: 'Esta semana', desde: aIso(lunes), hasta: aIso(sumarDias(lunes, 6)) },
    { etiqueta: 'Semana pasada', desde: aIso(sumarDias(lunes, -7)), hasta: aIso(sumarDias(lunes, -1)) },
    { etiqueta: 'Este mes', desde: aIso(inicioMes(hoy)), hasta: aIso(finMes(hoy)) },
    { etiqueta: 'Mes pasado', desde: aIso(inicioMes(hoy, -1)), hasta: aIso(finMes(hoy, -1)) },
    { etiqueta: 'Últimos 3 meses', desde: aIso(inicioMes(hoy, -2)), hasta: aIso(hoy) },
    { etiqueta: 'Este año', desde: aIso(new Date(hoy.getFullYear(), 0, 1)), hasta: aIso(new Date(hoy.getFullYear(), 11, 31)) },
    { etiqueta: 'Año pasado', desde: aIso(new Date(hoy.getFullYear() - 1, 0, 1)), hasta: aIso(new Date(hoy.getFullYear() - 1, 11, 31)) },
    { etiqueta: 'Todo', desde: '', hasta: '' },
  ]
})()

const ATAJO_POR_DEFECTO = ATAJOS_PERIODO.find((atajo) => atajo.etiqueta === 'Este mes')

// Opciones de la agrupación del periodo (valor interno y etiqueta visible).
const OPCIONES_AGRUPAR = [
  { valor: 'ninguno', etiqueta: 'Sin desglose' },
  { valor: 'dia', etiqueta: 'Día' },
  { valor: 'semana', etiqueta: 'Semana' },
  { valor: 'mes', etiqueta: 'Mes' },
  { valor: 'anio', etiqueta: 'Año' },
]

// Estados seleccionados por defecto: todos menos «Presupuesto» (mismo criterio que
// el backend: un presupuesto no es consumo real).
const ESTADOS_POR_DEFECTO = ESTADOS.map((estado) => estado.valor).filter((valor) => valor !== 'Presupuesto')

const FORMATO_CANTIDAD = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })

// Formatea una cantidad (unidades) en es-ES con un máximo de dos decimales.
function formatearCantidad(valor) {
  const numero = Number(valor)
  return FORMATO_CANTIDAD.format(Number.isFinite(numero) ? numero : 0)
}

// Construye la cadena de consulta con los filtros activos (omite los vacíos).
function construirQuery(filtros) {
  const parametros = new URLSearchParams()
  if (filtros.desde) parametros.set('desde', filtros.desde)
  if (filtros.hasta) parametros.set('hasta', filtros.hasta)
  if (filtros.agrupar && filtros.agrupar !== 'ninguno') parametros.set('agrupar', filtros.agrupar)
  if (filtros.estados) parametros.set('estados', filtros.estados)
  if (filtros.q) parametros.set('q', filtros.q)
  if (filtros.familia) parametros.set('familia', filtros.familia)
  if (filtros.proveedor) parametros.set('proveedor', filtros.proveedor)
  if (filtros.mecanicoId) parametros.set('mecanicoId', filtros.mecanicoId)
  return parametros.toString()
}

// Tarjeta de indicador con la etiqueta debajo del valor.
function TarjetaResumen({ etiqueta, valor }) {
  return (
    <article className="card p-5">
      <p className="text-2xl font-bold tabular-nums text-white">{valor}</p>
      <p className="mt-1 text-sm text-slate-400">{etiqueta}</p>
    </article>
  )
}

// Página «Artículos – Consumo»: informe por periodo del material consumido.
export default function ArticulosConsumo() {
  const { token } = useAuth()
  const [desde, setDesde] = useState(ATAJO_POR_DEFECTO.desde)
  const [hasta, setHasta] = useState(ATAJO_POR_DEFECTO.hasta)
  const [agrupar, setAgrupar] = useState('ninguno')
  const [estados, setEstados] = useState(() => new Set(ESTADOS_POR_DEFECTO))
  const [search, setSearch] = useState('')
  const [familia, setFamilia] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [mecanicoId, setMecanicoId] = useState('')
  const [exportando, setExportando] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')

  const rangoInvalido = Boolean(desde && hasta && desde > hasta)
  const sinEstados = estados.size === 0

  const filtros = {
    desde,
    hasta,
    agrupar,
    estados: [...estados].join(','),
    q: search.trim(),
    familia: familia.trim(),
    proveedor: proveedor.trim(),
    mecanicoId,
  }

  // Clave para reiniciar la tabla (página 1) cuando cambia cualquier filtro.
  const claveReinicio = [desde, hasta, agrupar, filtros.estados, filtros.q, filtros.familia, filtros.proveedor, filtros.mecanicoId].join('|')

  const { data, isLoading, error } = useQuery(
    ['articulos', 'consumo', filtros],
    () => apiGet(`/api/articulos/consumo?${construirQuery(filtros)}`, token),
    { enabled: Boolean(token) && !rangoInvalido && !sinEstados, keepPreviousData: true },
  )

  // Opciones de familia y proveedor (a partir del catálogo de artículos).
  const { data: articulos = [] } = useQuery(
    ['articulos'],
    () => apiGet('/api/articulos', token),
    { enabled: Boolean(token) },
  )
  const familias = useMemo(
    () => [...new Set(articulos.map((articulo) => articulo.familia).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [articulos],
  )
  const proveedores = useMemo(
    () => [...new Set(articulos.map((articulo) => articulo.proveedor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [articulos],
  )

  // Mecánicos para el filtro.
  const { data: mecanicos = [] } = useQuery(
    ['mecanicos'],
    () => apiGet('/api/mecanicos', token),
    { enabled: Boolean(token) },
  )

  const filas = data?.filas ?? []
  const periodos = data?.periodos ?? []
  const totales = data?.totales ?? null
  const hayFilas = !isLoading && !error && filas.length > 0

  function alternarEstado(valor) {
    setEstados((anterior) => {
      const siguiente = new Set(anterior)
      if (siguiente.has(valor)) siguiente.delete(valor)
      else siguiente.add(valor)
      return siguiente
    })
  }


  // Columnas de la tabla: fijas + una por periodo cuando hay desglose.
  const columnas = useMemo(() => {
    const base = [
      { clave: 'referencia', titulo: 'Referencia', title: 'Referencia del artículo o de la línea', ancho: '150px', valor: (fila) => fila.referencia, clase: 'font-medium text-white' },
      { clave: 'descripcion', titulo: 'Descripción', title: 'Descripción del artículo o de la línea', ancho: '260px', valor: (fila) => fila.descripcion, clase: 'text-slate-400' },
      { clave: 'familia', titulo: 'Familia', title: 'Familia del artículo', ancho: '150px', valor: (fila) => fila.familia, clase: 'text-slate-400' },
      { clave: 'cantidad', titulo: 'Cantidad', title: 'Unidades consumidas en el rango seleccionado', ancho: '110px', tipo: 'numero', alinear: 'der', valor: (fila) => Number(fila.cantidad), render: (fila) => <span className="block truncate font-medium text-white">{formatearCantidad(fila.cantidad)}</span> },
      { clave: 'ordenes', titulo: 'Órdenes', title: 'Número de órdenes distintas en las que aparece', ancho: '105px', tipo: 'numero', alinear: 'der', valor: (fila) => Number(fila.ordenes), render: (fila) => <span className="block truncate text-slate-400">{fila.ordenes}</span> },
      { clave: 'importe', titulo: 'Importe sin IVA', title: 'Suma de los importes netos (sin IVA) de las líneas', ancho: '155px', tipo: 'numero', alinear: 'der', valor: (fila) => Number(fila.importe), render: (fila) => <span className="block truncate text-slate-300">{formatearEuros(fila.importe)}</span> },
      { clave: 'coste', titulo: 'Coste estimado', title: 'Cantidad × precio de compra actual del artículo', ancho: '150px', tipo: 'numero', alinear: 'der', valor: (fila) => Number(fila.coste), render: (fila) => <span className="block truncate text-slate-400">{formatearEuros(fila.coste)}</span> },
    ]
    const porPeriodo = periodos.map((periodo) => ({
      clave: `periodo:${periodo.clave}`,
      titulo: periodo.etiqueta,
      title: `Cantidad consumida en ${periodo.etiqueta}`,
      ancho: '110px',
      tipo: 'numero',
      alinear: 'der',
      valor: (fila) => Number(fila.porPeriodo?.[periodo.clave] ?? 0),
      render: (fila) => {
        const valor = fila.porPeriodo?.[periodo.clave]
        return <span className="block truncate text-slate-400">{valor ? formatearCantidad(valor) : '—'}</span>
      },
    }))
    return [...base, ...porPeriodo]
  }, [periodos])

  async function alExportarExcel() {
    setErrorAccion('')
    setExportando(true)
    try {
      const columnasExport = columnasExportacionConsumo(periodos).map((columna) => ({
        titulo: columna.titulo,
        ancho: columna.ancho,
        valor: (fila) => columna.valor(fila),
      }))
      await exportarExcel(`consumo-articulos-${fechaFichero()}.xlsx`, [
        { nombre: 'Consumo', columnas: columnasExport, filas },
      ])
    } catch (fallo) {
      setErrorAccion(fallo.message)
    } finally {
      setExportando(false)
    }
  }

  function alExportarCsv() {
    setErrorAccion('')
    setExportando(true)
    try {
      exportarCsv(`consumo-articulos-${fechaFichero()}.csv`, columnasExportacionConsumo(periodos), filas)
    } catch (fallo) {
      setErrorAccion(fallo.message)
    } finally {
      setExportando(false)
    }
  }

  function aplicarAtajo(atajo) {
    setDesde(atajo.desde)
    setHasta(atajo.hasta)
  }


  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8">
        <p className="text-sm text-azul-300">Gestión</p>
        <h1 className="mt-1 text-3xl font-bold">Artículos</h1>
        <p className="mt-2 text-slate-400">Consulta qué materiales y productos se han consumido en cada periodo.</p>
      </div>

      <ArticulosTabs />

      <section className="card mb-6 p-5">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="label mb-2">Periodo</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex-1">
                <span className="mb-1 block text-xs text-slate-400">Desde</span>
                <input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} className="input" aria-label="Fecha desde" />
              </label>
              <label className="flex-1">
                <span className="mb-1 block text-xs text-slate-400">Hasta</span>
                <input type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} className="input" aria-label="Fecha hasta" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">Atajos:</span>
              {ATAJOS_PERIODO.map((atajo) => (
                <button
                  key={atajo.etiqueta}
                  type="button"
                  onClick={() => aplicarAtajo(atajo)}
                  className="rounded-full border border-antracita-600 px-3 py-1 text-xs text-slate-300 transition hover:bg-antracita-700 hover:text-white"
                >
                  {atajo.etiqueta}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Deja el periodo vacío para analizar todo el histórico.</p>
          </div>

          <div>
            <label className="block">
              <span className="label mb-2 block">Desglosar por</span>
              <select value={agrupar} onChange={(event) => setAgrupar(event.target.value)} className="input">
                {OPCIONES_AGRUPAR.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
              </select>
            </label>
            <p className="label mb-2 mt-4">Estados de la orden</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {ESTADOS.map((estado) => (
                <label key={estado.valor} className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={estados.has(estado.valor)}
                    onChange={() => alternarEstado(estado.valor)}
                    className="h-4 w-4 rounded border-antracita-600 bg-antracita-900 text-azul-500 focus:ring-2 focus:ring-azul-500/30"
                  />
                  <span>{estado.etiqueta}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Los presupuestos no cuentan como consumo real (desmarcados por defecto).</p>
          </div>
        </div>
      </section>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <label className="relative block w-full sm:max-w-xs">
            <span className="sr-only">Buscar consumo</span>
            <IconBuscar size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por referencia o descripción…" className="input pl-10" />
          </label>
          <select value={familia} onChange={(event) => setFamilia(event.target.value)} className="input sm:w-auto" aria-label="Filtrar por familia">
            <option value="">Todas las familias</option>
            {familias.map((opcion) => <option key={opcion} value={opcion}>{opcion}</option>)}
          </select>
          <select value={proveedor} onChange={(event) => setProveedor(event.target.value)} className="input sm:w-auto" aria-label="Filtrar por proveedor">
            <option value="">Todos los proveedores</option>
            {proveedores.map((opcion) => <option key={opcion} value={opcion}>{opcion}</option>)}
          </select>
          <select value={mecanicoId} onChange={(event) => setMecanicoId(event.target.value)} className="input sm:w-auto" aria-label="Filtrar por mecánico">
            <option value="">Todos los mecánicos</option>
            {mecanicos.map((mecanico) => <option key={mecanico.id} value={mecanico.id}>{mecanico.nombre}</option>)}
          </select>
        </div>
        <MenuExportar
          exportando={exportando}
          deshabilitado={isLoading || !hayFilas}
          opciones={[
            { clave: 'excel', etiqueta: 'Excel', onSeleccionar: alExportarExcel },
            { clave: 'csv', etiqueta: 'CSV', onSeleccionar: alExportarCsv },
          ]}
        />
      </div>

      {rangoInvalido && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">La fecha «Desde» no puede ser posterior a «Hasta».</p>}
      {sinEstados && <p role="status" className="mb-4 rounded-lg border border-naranja-500/30 bg-naranja-500/10 px-4 py-3 text-sm text-naranja-300">Selecciona al menos un estado de la orden.</p>}
      {errorAccion && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorAccion}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error.message}</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <TarjetaResumen etiqueta="Unidades consumidas" valor={formatearCantidad(totales?.cantidad ?? 0)} />
        <TarjetaResumen etiqueta="Artículos distintos" valor={totales?.articulos ?? 0} />
        <TarjetaResumen etiqueta="Órdenes" valor={totales?.ordenes ?? 0} />
        <TarjetaResumen etiqueta="Importe sin IVA" valor={formatearEuros(totales?.importe ?? 0)} />
        <TarjetaResumen etiqueta="Coste estimado" valor={formatearEuros(totales?.coste ?? 0)} />
      </div>

      <DataTable
        columnas={columnas}
        filas={filas}
        claveFila={(fila) => `${fila.articuloId ?? 'linea'}:${fila.referencia}:${fila.descripcion}`}
        ordenInicial={{ clave: 'cantidad', dir: 'desc' }}
        cargando={isLoading}
        etiquetaPlural="artículos"
        claveReinicio={claveReinicio}
        primeraColumnaFija
        scrollInterno
        vacio={rangoInvalido ? 'Corrige el rango de fechas.' : 'No hay consumo con estos filtros.'}
      />

      {hayFilas && (
        <div className="card mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 text-sm">
          <span className="font-medium text-white">Totales</span>
          <span className="text-slate-400">Unidades: <span className="text-slate-200">{formatearCantidad(totales.cantidad)}</span></span>
          <span className="text-slate-400">Artículos: <span className="text-slate-200">{totales.articulos}</span></span>
          <span className="text-slate-400">Órdenes: <span className="text-slate-200">{totales.ordenes}</span></span>
          <span className="text-slate-400">Importe sin IVA: <span className="text-slate-200">{formatearEuros(totales.importe)}</span></span>
          <span className="text-slate-400">Coste estimado: <span className="text-slate-200">{formatearEuros(totales.coste)}</span></span>
        </div>
      )}
    </div>
  )
}

