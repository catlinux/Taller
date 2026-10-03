import { useEffect, useState } from 'react'
import { useQuery } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiGet } from '../lib/api.js'
import DataTable from '../components/DataTable.jsx'
import EstadoBadge from '../components/EstadoBadge.jsx'
import PagoBadge from '../components/PagoBadge.jsx'
import MenuExportar from '../components/MenuExportar.jsx'
import { IconBuscar, IconMas } from '../components/Icons.jsx'
import { ESTADOS, TIPOS_REPARACION, etiquetaTipoCorta, formatearEuros, formatearFecha } from '../lib/ordenes.js'
import { FORMAS_PAGO } from '../lib/pagos.js'
import { exportarExcel, fechaFichero } from '../lib/exportarExcel.js'
import { exportarCsv } from '../lib/exportarCsv.js'
import { columnasExportacionOrdenes } from '../lib/columnasOrdenes.js'

// Una fecha prevista está vencida si ya ha pasado y la orden sigue abierta.
function fechaPrevistaVencida(orden) {
  if (!orden.fechaPrevista) return false
  if (orden.estado === 'Finalizada' || orden.estado === 'Entregada') return false
  const prevista = new Date(orden.fechaPrevista)
  if (Number.isNaN(prevista.getTime())) return false
  const hoy = new Date()
  prevista.setHours(0, 0, 0, 0)
  hoy.setHours(0, 0, 0, 0)
  return prevista < hoy
}

export default function Ordenes() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('')
  const [tipoReparacion, setTipoReparacion] = useState('')
  const [mecanicoId, setMecanicoId] = useState('')
  const [formaPago, setFormaPago] = useState('')
  const [exportando, setExportando] = useState(false)
  const [errorExport, setErrorExport] = useState('')

  // Debounce de 300 ms: retrasa la consulta al servidor mientras se escribe.
  useEffect(() => {
    const temporizador = setTimeout(() => setBusqueda(search.trim()), 300)
    return () => clearTimeout(temporizador)
  }, [search])

  const params = new URLSearchParams()
  if (busqueda) params.set('q', busqueda)
  if (estado) params.set('estado', estado)
  if (tipoReparacion) params.set('tipoReparacion', tipoReparacion)
  if (mecanicoId) params.set('mecanicoId', mecanicoId)
  if (formaPago) params.set('formaPago', formaPago)
  const queryString = params.toString()

  const { data: ordenes = [], isLoading, error } = useQuery(
    ['ordenes', busqueda, estado, tipoReparacion, mecanicoId, formaPago],
    () => apiGet(`/api/ordenes${queryString ? `?${queryString}` : ''}`, token),
    { enabled: Boolean(token), keepPreviousData: true },
  )

  const { data: mecanicos = [] } = useQuery(
    ['mecanicos'],
    () => apiGet('/api/mecanicos', token),
    { enabled: Boolean(token) },
  )

  const selectClass = 'input sm:w-auto'

  // Orden lógico del flujo de estados para ordenar la columna Estado.
  const ordenEstados = ESTADOS.map((opcion) => opcion.valor)

  const columnas = [
    { clave: 'numeroOrden', titulo: 'Nº orden', ancho: '130px', valor: (o) => o.numeroOrden, clase: 'font-medium text-white' },
    {
      clave: 'fechaEntrada', titulo: 'Entrada', ancho: '110px', tipo: 'fecha',
      valor: (o) => o.fechaEntrada,
      render: (o) => <span className="block truncate text-slate-400">{formatearFecha(o.fechaEntrada)}</span>,
    },
    {
      clave: 'fechaPrevista', titulo: 'Prevista', ancho: '110px', tipo: 'fecha',
      valor: (o) => o.fechaPrevista,
      render: (o) => <span className={`block truncate ${fechaPrevistaVencida(o) ? 'font-semibold text-naranja-400' : 'text-slate-400'}`}>{formatearFecha(o.fechaPrevista)}</span>,
    },
    {
      clave: 'cliente', titulo: 'Cliente', ancho: '22%',
      valor: (o) => o.cliente?.nombre,
      render: (o) => (
        <div className="truncate">
          <span className="block truncate text-slate-300">#{o.cliente?.numeroCliente}</span>
          <span className="block truncate text-slate-400">{o.cliente?.nombre}</span>
        </div>
      ),
    },
    { clave: 'marca', titulo: 'Marca', ancho: '12%', valor: (o) => o.bicicleta?.marca, clase: 'text-slate-400' },
    { clave: 'modelo', titulo: 'Modelo', ancho: '14%', valor: (o) => o.bicicleta?.modelo, clase: 'text-slate-400' },
    {
      clave: 'tipoReparacion', titulo: 'Tipo', ancho: '130px',
      valor: (o) => etiquetaTipoCorta(o.tipoReparacion),
      render: (o) => {
        const destacado = o.tipoReparacion === 'Urgente' || o.tipoReparacion === 'Preferente'
        return <span className={`badge ${destacado ? 'bg-naranja-500/10 text-naranja-300' : 'bg-antracita-700 text-slate-300'}`}>{etiquetaTipoCorta(o.tipoReparacion)}</span>
      },
    },
    { clave: 'mecanico', titulo: 'Mecánico', ancho: '130px', valor: (o) => o.mecanico?.nombre, clase: 'text-slate-400' },
    {
      clave: 'estado', titulo: 'Estado', ancho: '150px', tipo: 'numero',
      valor: (o) => ordenEstados.indexOf(o.estado),
      render: (o) => <EstadoBadge estado={o.estado} />,
    },
    {
      clave: 'formaPago', titulo: 'Pago', ancho: '120px',
      valor: (o) => o.formaPago || '',
      render: (o) => (o.formaPago ? <PagoBadge formaPago={o.formaPago} /> : <span className="text-slate-500">—</span>),
    },
    {
      clave: 'total', titulo: 'Total', ancho: '110px', tipo: 'numero', alinear: 'der',
      valor: (o) => o.total,
      render: (o) => <span className="block truncate font-medium text-white">{formatearEuros(o.total)}</span>,
    },
  ]

  // Exporta a Excel el listado de órdenes que coincide con la búsqueda y los
  // filtros actuales.
  async function alExportarExcel() {
    setErrorExport('')
    setExportando(true)
    try {
      const columnas = columnasExportacionOrdenes.map((columna) => ({
        titulo: columna.titulo,
        ancho: columna.ancho,
        valor: (fila) => {
          const valor = columna.valor(fila)
          return columna.tipo === 'fecha' && valor ? new Date(valor) : valor
        },
      }))
      await exportarExcel(`ordenes-${fechaFichero()}.xlsx`, [
        { nombre: 'Órdenes', columnas, filas: ordenes },
      ])
    } catch (e) {
      setErrorExport(e.message)
    } finally {
      setExportando(false)
    }
  }

  // Exporta a CSV (para abrir en Excel) el listado de órdenes filtrado.
  function alExportarCsv() {
    setErrorExport('')
    setExportando(true)
    try {
      exportarCsv(`ordenes-${fechaFichero()}.csv`, columnasExportacionOrdenes, ordenes)
    } catch (e) {
      setErrorExport(e.message)
    } finally {
      setExportando(false)
    }
  }

  // Exporta a PDF (A4 horizontal) el listado de órdenes filtrado.
  async function alExportarPdf() {
    setErrorExport('')
    setExportando(true)
    try {
      const { generarPdfListadoOrdenes } = await import('../lib/pdfListadoOrdenes.js')
      const doc = await generarPdfListadoOrdenes(ordenes)
      doc.save(`ordenes-${fechaFichero()}.pdf`)
    } catch (e) {
      setErrorExport(e.message)
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm text-azul-300">Taller</p><h1 className="mt-1 text-3xl font-bold">Órdenes de reparación</h1><p className="mt-2 text-slate-400">Consulta y sigue las órdenes del taller.</p></div>
        <div className="flex flex-wrap gap-3">
          <MenuExportar
            exportando={exportando}
            deshabilitado={isLoading}
            opciones={[
              { clave: 'excel', etiqueta: 'Excel', onSeleccionar: alExportarExcel },
              { clave: 'csv', etiqueta: 'CSV', onSeleccionar: alExportarCsv },
              { clave: 'pdf', etiqueta: 'PDF', onSeleccionar: alExportarPdf },
            ]}
          />
          <button onClick={() => navigate('/ordenes/nueva')} className="btn-primary"><IconMas size={18} /> Nueva orden</button>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <label className="relative block w-full xl:max-w-xs xl:flex-none">
          <span className="sr-only">Buscar órdenes</span>
          <IconBuscar size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nº de orden, cliente o bici…" className="input pl-10" />
        </label>
        <div className="flex flex-wrap gap-3 xl:flex-nowrap xl:shrink-0">
          <label className="text-sm text-slate-300">
            <span className="sr-only">Estado</span>
            <select value={estado} onChange={(event) => setEstado(event.target.value)} className={selectClass}>
              <option value="">Todos los estados</option>
              {ESTADOS.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-300">
            <span className="sr-only">Tipo de reparación</span>
            <select value={tipoReparacion} onChange={(event) => setTipoReparacion(event.target.value)} className={selectClass}>
              <option value="">Todos los tipos</option>
              {TIPOS_REPARACION.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-300">
            <span className="sr-only">Mecánico</span>
            <select value={mecanicoId} onChange={(event) => setMecanicoId(event.target.value)} className={selectClass}>
              <option value="">Todos los mecánicos</option>
              {mecanicos.map((mecanico) => <option key={mecanico.id} value={mecanico.id}>{mecanico.nombre}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-300">
            <span className="sr-only">Forma de pago</span>
            <select value={formaPago} onChange={(event) => setFormaPago(event.target.value)} className={selectClass}>
              <option value="">Todas las formas de pago</option>
              {FORMAS_PAGO.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}
            </select>
          </label>
        </div>
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error.message}</p>}
      {errorExport && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorExport}</p>}

      <DataTable
        columnas={columnas}
        filas={ordenes}
        claveFila={(o) => o.id}
        ordenInicial={{ clave: 'numeroOrden', dir: 'desc' }}
        onFila={(o) => navigate(`/ordenes/${o.id}`)}
        cargando={isLoading}
        etiquetaPlural="órdenes"
        claveReinicio={`${busqueda}|${estado}|${tipoReparacion}|${mecanicoId}|${formaPago}`}
        vacio="No hay órdenes que coincidan con la búsqueda o los filtros."
      />
    </div>
  )
}
