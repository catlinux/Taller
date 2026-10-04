import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useAuth } from '../context/AuthContext.jsx'
import { useDeshacer } from '../context/DeshacerContext.jsx'
import ArticulosTabs from '../components/ArticulosTabs.jsx'
import DataTable from '../components/DataTable.jsx'
import { IconBuscar, IconDescargar, IconPapelera } from '../components/Icons.jsx'
import { apiGet, apiRequest } from '../lib/api.js'
import { exportarExcel, fechaFichero } from '../lib/exportarExcel.js'
import { formatearFecha } from '../lib/ordenes.js'

// Unidades de tiempo disponibles y su equivalencia en días.
const UNIDADES = [
  { id: 'dias', etiqueta: 'Días', dias: 1 },
  { id: 'semanas', etiqueta: 'Semanas', dias: 7 },
  { id: 'meses', etiqueta: 'Meses', dias: 30 },
  { id: 'anios', etiqueta: 'Años', dias: 365 },
]
const FACTOR_UNIDAD = { dias: 1, semanas: 7, meses: 30, anios: 365 }

// Atajos rápidos: aplican el mismo intervalo a los dos filtros.
const ATAJOS = [
  { etiqueta: '3 meses', valor: 3, unidad: 'meses' },
  { etiqueta: '6 meses', valor: 6, unidad: 'meses' },
  { etiqueta: '1 año', valor: 1, unidad: 'anios' },
  { etiqueta: '2 años', valor: 2, unidad: 'anios' },
]

// Convierte el valor de un campo (con su unidad) en un número entero de días.
// Devuelve null si el campo está vacío o no es un número válido (no filtrar).
function diasDesde(valor, unidad) {
  const texto = String(valor).trim()
  if (texto === '') return null
  const num = Number(texto)
  if (!Number.isFinite(num) || num < 0) return null
  return Math.round(num * (FACTOR_UNIDAD[unidad] ?? 1))
}

// Construye la cadena de consulta a partir de los filtros activos.
function construirQuery(params) {
  const busqueda = new URLSearchParams()
  if (params.sinStockDias !== null) busqueda.set('sinStockDias', String(params.sinStockDias))
  if (params.sinMovimientosDias !== null) busqueda.set('sinMovimientosDias', String(params.sinMovimientosDias))
  busqueda.set('incluirNuncaUsados', params.incluirNuncaUsados ? 'true' : 'false')
  if (params.q) busqueda.set('q', params.q)
  if (params.familia) busqueda.set('familia', params.familia)
  return busqueda.toString()
}

// Página de artículos obsoletos: lista los que llevan tiempo sin stock y/o sin
// movimientos, permite filtrarlos, exportarlos y (solo admin) eliminarlos en lote.
export default function ArticulosObsoletos() {
  const { token, user } = useAuth()
  const { mostrarDeshacer } = useDeshacer()
  const queryClient = useQueryClient()
  const esAdmin = user?.rol === 'admin'

  // Filtros de tiempo.
  const [filtrarStock, setFiltrarStock] = useState(true)
  const [stockValor, setStockValor] = useState('12')
  const [stockUnidad, setStockUnidad] = useState('meses')
  const [movValor, setMovValor] = useState('12')
  const [movUnidad, setMovUnidad] = useState('meses')
  const [incluirNuncaUsados, setIncluirNuncaUsados] = useState(true)

  // Filtros de texto.
  const [search, setSearch] = useState('')
  const [familia, setFamilia] = useState('')

  // Selección de filas y estado de la acción de borrado.
  const [seleccionadas, setSeleccionadas] = useState(() => new Set())
  const [confirmar, setConfirmar] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')
  const [aviso, setAviso] = useState('')

  const sinStockDias = filtrarStock ? diasDesde(stockValor, stockUnidad) : null
  const sinMovimientosDias = diasDesde(movValor, movUnidad)
  const params = { sinStockDias, sinMovimientosDias, incluirNuncaUsados, q: search.trim(), familia: familia.trim() }
  const claveReinicio = `${sinStockDias}|${sinMovimientosDias}|${incluirNuncaUsados}|${params.q}|${params.familia}`

  const { data: filas = [], isLoading, error } = useQuery(
    ['articulos', 'obsoletos', params],
    () => apiGet(`/api/articulos/obsoletos?${construirQuery(params)}`, token),
    { enabled: Boolean(token) },
  )

  // Todas las familias (para el desplegable de filtro).
  const { data: todos = [] } = useQuery(['articulos'], () => apiGet('/api/articulos', token), { enabled: Boolean(token) })
  const familias = useMemo(
    () => [...new Set(todos.map((a) => a.familia).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [todos],
  )

  // --- Selección de filas ---
  const idsFiltrados = useMemo(() => filas.map((fila) => fila.id), [filas])
  const todasSeleccionadas = idsFiltrados.length > 0 && idsFiltrados.every((id) => seleccionadas.has(id))
  const algunasSeleccionadas = idsFiltrados.some((id) => seleccionadas.has(id))

  function alternarTodas() {
    setSeleccionadas((anterior) => {
      const siguiente = new Set(anterior)
      if (todasSeleccionadas) {
        idsFiltrados.forEach((id) => siguiente.delete(id))
      } else {
        idsFiltrados.forEach((id) => siguiente.add(id))
      }
      return siguiente
    })
  }

  function alternar(fila) {
    setSeleccionadas((anterior) => {
      const siguiente = new Set(anterior)
      if (siguiente.has(fila.id)) siguiente.delete(fila.id)
      else siguiente.add(fila.id)
      return siguiente
    })
  }

  const objetoSeleccion = {
    todas: todasSeleccionadas,
    algunas: algunasSeleccionadas,
    estaSeleccionada: (fila) => seleccionadas.has(fila.id),
    alternar,
    alternarTodas,
    descripcionFila: (fila) => `artículo ${fila.referencia}`,
  }

  // --- Eliminación en lote (solo admin) ---
  const eliminar = useMutation(
    (ids) => apiRequest('/api/articulos/lote', token, { method: 'DELETE', body: JSON.stringify({ ids }) }),
    {
      onSuccess: (resultado) => {
        setSeleccionadas(new Set())
        setConfirmar(false)
        setErrorAccion('')
        setAviso(`Se ${resultado.eliminados === 1 ? 'ha eliminado 1 artículo' : `han eliminado ${resultado.eliminados} artículos`}.`)
        mostrarDeshacer({
          descripcion: resultado.eliminados === 1 ? '1 artículo' : `${resultado.eliminados} artículos`,
          papeleraId: resultado?.papeleraId,
          onRestaurar: () => queryClient.invalidateQueries(['articulos']),
        })
        queryClient.invalidateQueries(['articulos'])
      },
      onError: (fallo) => {
        setErrorAccion(fallo.message)
        setConfirmar(false)
      },
    },
  )

  function aplicarAtajo(atajo) {
    setFiltrarStock(true)
    setStockValor(String(atajo.valor))
    setStockUnidad(atajo.unidad)
    setMovValor(String(atajo.valor))
    setMovUnidad(atajo.unidad)
  }

  // --- Exportación a Excel ---
  async function alExportar() {
    setErrorAccion('')
    setExportando(true)
    try {
      await exportarExcel(`articulos-obsoletos-${fechaFichero()}.xlsx`, [
        {
          nombre: 'Obsoletos',
          columnas: [
            { titulo: 'Referencia', valor: (fila) => fila.referencia ?? '', ancho: 18 },
            { titulo: 'Descripción', valor: (fila) => fila.descripcion ?? '', ancho: 44 },
            { titulo: 'Familia', valor: (fila) => fila.familia ?? '', ancho: 22 },
            { titulo: 'Proveedor', valor: (fila) => fila.proveedor ?? '', ancho: 22 },
            { titulo: 'Stock', valor: (fila) => (Number.isFinite(Number(fila.stock)) ? Number(fila.stock) : 0), ancho: 10 },
            { titulo: 'Sin stock desde', valor: (fila) => (fila.sinStockDesde ? formatearFecha(fila.sinStockDesde) : ''), ancho: 16 },
            { titulo: 'Último movimiento', valor: (fila) => (fila.ultimoMovimiento ? formatearFecha(fila.ultimoMovimiento) : 'Nunca usado'), ancho: 18 },
            { titulo: 'Usos', valor: (fila) => fila.usos ?? 0, ancho: 8 },
          ],
          filas,
        },
      ])
    } catch (fallo) {
      setErrorAccion(fallo.message)
    } finally {
      setExportando(false)
    }
  }

  const columnas = [
    { clave: 'referencia', titulo: 'Referencia', title: 'Referencia del artículo', ancho: '160px', valor: (fila) => fila.referencia, clase: 'font-medium text-white' },
    { clave: 'descripcion', titulo: 'Descripción', title: 'Descripción del artículo', ancho: '320px', valor: (fila) => fila.descripcion, clase: 'text-slate-400' },
    { clave: 'familia', titulo: 'Familia', title: 'Familia del artículo', ancho: '170px', valor: (fila) => fila.familia, clase: 'text-slate-400' },
    {
      clave: 'stock',
      titulo: 'Stock',
      title: 'Stock actual (informativo; puede ser negativo en datos importados)',
      ancho: '90px',
      tipo: 'numero',
      alinear: 'der',
      valor: (fila) => fila.stock,
      render: (fila) => <span className={`block truncate ${Number(fila.stock) <= 0 ? 'font-semibold text-naranja-400' : 'text-slate-400'}`}>{fila.stock}</span>,
    },
    { clave: 'sinStockDesde', titulo: 'Sin stock desde', title: 'Fecha desde la que el artículo está sin stock', ancho: '150px', tipo: 'fecha', valor: (fila) => fila.sinStockDesde, render: (fila) => <span className="block truncate text-slate-400">{fila.sinStockDesde ? formatearFecha(fila.sinStockDesde) : '—'}</span> },
    {
      clave: 'ultimoMovimiento',
      titulo: 'Último movimiento',
      title: 'Fecha del último movimiento: entrada de la orden en la que se usó',
      ancho: '170px',
      tipo: 'fecha',
      valor: (fila) => fila.ultimoMovimiento,
      render: (fila) => <span className={`block truncate ${fila.ultimoMovimiento ? 'text-slate-400' : 'text-amber-300'}`}>{fila.ultimoMovimiento ? formatearFecha(fila.ultimoMovimiento) : 'Nunca usado'}</span>,
    },
    { clave: 'usos', titulo: 'Usos', title: 'Número de líneas de órdenes en las que aparece el artículo', ancho: '80px', tipo: 'numero', alinear: 'der', valor: (fila) => fila.usos, render: (fila) => <span className="block truncate text-slate-400">{fila.usos}</span> },
  ]

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm text-azul-300">Gestión</p>
        <h1 className="mt-1 text-3xl font-bold">Artículos</h1>
        <p className="mt-2 text-slate-400">Localiza el material que lleva tiempo parado para sacarlo del catálogo.</p>
      </div>

      <ArticulosTabs />

      <section className="card mb-6 p-5">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="label mb-2">Sin stock desde hace al menos</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={stockValor}
                onChange={(event) => setStockValor(event.target.value)}
                disabled={!filtrarStock}
                className="input w-24 disabled:opacity-40"
                aria-label="Cantidad de tiempo sin stock"
              />
              <select
                value={stockUnidad}
                onChange={(event) => setStockUnidad(event.target.value)}
                disabled={!filtrarStock}
                className="input w-32 disabled:opacity-40"
                aria-label="Unidad de tiempo sin stock"
              >
                {UNIDADES.map((unidad) => <option key={unidad.id} value={unidad.id}>{unidad.etiqueta}</option>)}
              </select>
            </div>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={!filtrarStock}
                onChange={(event) => setFiltrarStock(!event.target.checked)}
                className="h-4 w-4 rounded border-antracita-600 bg-antracita-900 text-azul-500 focus:ring-2 focus:ring-azul-500/30"
              />
              <span>Sin filtrar por stock</span>
            </label>
          </div>

          <div>
            <p className="label mb-2">Sin movimientos desde hace al menos</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={movValor}
                onChange={(event) => setMovValor(event.target.value)}
                className="input w-24"
                aria-label="Cantidad de tiempo sin movimientos"
                placeholder="No filtrar"
              />
              <select
                value={movUnidad}
                onChange={(event) => setMovUnidad(event.target.value)}
                className="input w-32"
                aria-label="Unidad de tiempo sin movimientos"
              >
                {UNIDADES.map((unidad) => <option key={unidad.id} value={unidad.id}>{unidad.etiqueta}</option>)}
              </select>
            </div>
            <p className="mt-2 text-xs text-slate-500">Un movimiento es usar el artículo en una orden de reparación. Deja el valor vacío para no filtrar.</p>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={incluirNuncaUsados}
                onChange={(event) => setIncluirNuncaUsados(event.target.checked)}
                className="h-4 w-4 rounded border-antracita-600 bg-antracita-900 text-azul-500 focus:ring-2 focus:ring-azul-500/30"
              />
              <span>Incluir artículos que nunca se han usado</span>
            </label>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-antracita-700 pt-4">
          <span className="text-xs text-slate-500">Atajos:</span>
          {ATAJOS.map((atajo) => (
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
      </section>


      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <label className="relative block w-full sm:max-w-md">
            <span className="sr-only">Buscar artículos obsoletos</span>
            <IconBuscar size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por referencia o descripción…" className="input pl-10" />
          </label>
          <select value={familia} onChange={(event) => setFamilia(event.target.value)} className="input sm:max-w-xs" aria-label="Filtrar por familia">
            <option value="">Todas las familias</option>
            {familias.map((opcion) => <option key={opcion} value={opcion}>{opcion}</option>)}
          </select>
        </div>
        <p className="text-sm text-slate-400">{filas.length} {filas.length === 1 ? 'artículo obsoleto' : 'artículos obsoletos'}</p>
      </div>

      {aviso && <p role="status" className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{aviso}</p>}
      {errorAccion && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorAccion}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error.message}</p>}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-400">{seleccionadas.size} {seleccionadas.size === 1 ? 'seleccionado' : 'seleccionados'}</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={alExportar} disabled={exportando || isLoading} className="btn-secondary">
            <IconDescargar size={16} /> {exportando ? 'Exportando…' : 'Exportar Excel'}
          </button>
          {esAdmin && (
            <button type="button" onClick={() => { setErrorAccion(''); setConfirmar(true) }} disabled={seleccionadas.size === 0} className="btn-peligro">
              <IconPapelera size={16} /> Eliminar seleccionados
            </button>
          )}
        </div>
      </div>

      <DataTable
        columnas={columnas}
        filas={filas}
        claveFila={(fila) => fila.id}
        seleccion={objetoSeleccion}
        cargando={isLoading}
        etiquetaPlural="artículos"
        claveReinicio={claveReinicio}
        vacio="No hay artículos obsoletos con estos filtros."
      />

      {confirmar && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmar(false) }}>
          <section role="dialog" aria-modal="true" aria-labelledby="obsoletos-eliminar-title" className="my-auto w-full max-w-md rounded-2xl border border-antracita-700 bg-antracita-800 p-6 shadow-2xl">
            <h2 id="obsoletos-eliminar-title" className="text-xl font-semibold text-white">Eliminar artículos</h2>
            <p className="mt-3 text-sm text-slate-300">Se van a eliminar {seleccionadas.size} {seleccionadas.size === 1 ? 'artículo' : 'artículos'}. Podrás deshacerlo desde la papelera.</p>
            <p className="mt-2 text-sm text-slate-400">Las órdenes antiguas conservarán sus líneas (se quedarán sin enlazar, pero mantendrán la referencia y la descripción). Te recomendamos exportar la lista a Excel antes de continuar.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="btn-secondary" onClick={() => setConfirmar(false)}>Cancelar</button>
              <button type="button" className="btn-peligro" disabled={eliminar.isLoading} onClick={() => eliminar.mutate([...seleccionadas])}>
                {eliminar.isLoading ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </section>
        </div>
      )}

    </div>
  )
}


