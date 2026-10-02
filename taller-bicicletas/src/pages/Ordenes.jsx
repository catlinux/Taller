import { useEffect, useState } from 'react'
import { useQuery } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiGet } from '../lib/api.js'
import DataTable from '../components/DataTable.jsx'
import EstadoBadge from '../components/EstadoBadge.jsx'
import { IconBuscar, IconMas } from '../components/Icons.jsx'
import { ESTADOS, TIPOS_REPARACION, etiquetaTipo, etiquetaTipoCorta, etiquetaEstado, formatearEuros, formatearFecha } from '../lib/ordenes.js'
import { exportarExcel, fechaFichero } from '../lib/exportarExcel.js'

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
  const queryString = params.toString()

  const { data: ordenes = [], isLoading, error } = useQuery(
    ['ordenes', busqueda, estado, tipoReparacion, mecanicoId],
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
      clave: 'cliente', titulo: 'Cliente', ancho: '22%',
      valor: (o) => o.cliente?.nombre,
      render: (o) => (
        <div className="truncate">
          <span className="block truncate text-slate-300">#{o.cliente?.numeroCliente}</span>
          <span className="block truncate text-slate-400">{o.cliente?.nombre}</span>
        </div>
      ),
    },
    {
      clave: 'bicicleta', titulo: 'Bici', ancho: '18%', clase: 'text-slate-400',
      valor: (o) => (o.bicicleta ? `${o.bicicleta.marca}${o.bicicleta.modelo ? ` ${o.bicicleta.modelo}` : ''}` : ''),
    },
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
      clave: 'fechaPrevista', titulo: 'Prevista', ancho: '110px', tipo: 'fecha',
      valor: (o) => o.fechaPrevista,
      render: (o) => <span className={`block truncate ${fechaPrevistaVencida(o) ? 'font-semibold text-naranja-400' : 'text-slate-400'}`}>{formatearFecha(o.fechaPrevista)}</span>,
    },
    {
      clave: 'total', titulo: 'Total', ancho: '110px', tipo: 'numero', alinear: 'der',
      valor: (o) => o.total,
      render: (o) => <span className="block truncate font-medium text-white">{formatearEuros(o.total)}</span>,
    },
  ]

  // Exporta a Excel las órdenes que coinciden con la búsqueda y los filtros
  // actuales. No incluye datos internos (forma/estado de pago, observaciones).
  async function alExportar() {
    setErrorExport('')
    setExportando(true)
    try {
      await exportarExcel(`ordenes-${fechaFichero()}.xlsx`, [
        {
          nombre: 'Órdenes',
          columnas: [
            { titulo: 'Nº orden', valor: (o) => o.numeroOrden ?? '', ancho: 14 },
            { titulo: 'Fecha entrada', valor: (o) => (o.fechaEntrada ? new Date(o.fechaEntrada) : ''), ancho: 14 },
            { titulo: 'Fecha prevista', valor: (o) => (o.fechaPrevista ? new Date(o.fechaPrevista) : ''), ancho: 14 },
            { titulo: 'Estado', valor: (o) => etiquetaEstado(o.estado), ancho: 18 },
            { titulo: 'Tipo', valor: (o) => etiquetaTipo(o.tipoReparacion), ancho: 26 },
            { titulo: 'Garantía', valor: (o) => (o.garantia ? 'Sí' : 'No'), ancho: 10 },
            { titulo: 'Nº cliente', valor: (o) => o.cliente?.numeroCliente ?? '', ancho: 11 },
            { titulo: 'Cliente', valor: (o) => [o.cliente?.nombre, o.cliente?.apellidos].filter(Boolean).join(' '), ancho: 26 },
            { titulo: 'Teléfono', valor: (o) => o.cliente?.telefono ?? '', ancho: 16 },
            { titulo: 'Bici', valor: (o) => (o.bicicleta ? [o.bicicleta.marca, o.bicicleta.modelo].filter(Boolean).join(' ') : ''), ancho: 22 },
            { titulo: 'Nº serie', valor: (o) => o.bicicleta?.numeroSerie ?? '', ancho: 18 },
            { titulo: 'Mecánico', valor: (o) => o.mecanico?.nombre ?? '', ancho: 20 },
            { titulo: 'Total', valor: (o) => (Number.isFinite(Number(o.total)) ? Number(o.total) : 0), ancho: 12 },
          ],
          filas: ordenes,
        },
      ])
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
          <button onClick={alExportar} disabled={exportando || isLoading} className="btn-secondary">{exportando ? 'Exportando…' : 'Exportar Excel'}</button>
          <button onClick={() => navigate('/ordenes/nueva')} className="btn-primary"><IconMas size={18} /> Nueva orden</button>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative block w-full lg:max-w-md">
          <span className="sr-only">Buscar órdenes</span>
          <IconBuscar size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nº de orden, cliente o bici…" className="input pl-10" />
        </label>
        <div className="flex flex-wrap gap-3">
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
        claveReinicio={`${busqueda}|${estado}|${tipoReparacion}|${mecanicoId}`}
        vacio="No hay órdenes que coincidan con la búsqueda o los filtros."
      />
    </div>
  )
}
