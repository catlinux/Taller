import { useQuery } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiGet } from '../lib/api.js'
import { estadoInfo, etiquetaTipoCorta, formatearFecha } from '../lib/ordenes.js'
import { coincideTexto } from '../lib/texto.js'
import { IconMas, IconTaller, IconOrdenes, IconAviso, IconReloj, IconCheck } from '../components/Icons.jsx'

// Columnas del tablero, en el orden en que se muestran (las entregadas no ocupan tablero).
const ESTADOS_TABLERO = ['Admision', 'EnReparacion', 'EnPausa', 'EsperandoMaterial', 'Biomecanica', 'Finalizada']

// Punto de color de la cabecera de cada columna.
const PUNTO_ESTADO = {
  Admision: 'bg-yellow-400',
  EnReparacion: 'bg-naranja-500',
  EnPausa: 'bg-red-500',
  EsperandoMaterial: 'bg-pink-400',
  Biomecanica: 'bg-violet-400',
  Finalizada: 'bg-azul-500',
}

// Estilos del cuadro de icono de cada indicador según su tono.
const TONOS = {
  azul: 'from-azul-500/20 to-azul-500/5 text-azul-400',
  naranja: 'from-naranja-500/20 to-naranja-500/5 text-naranja-400',
  verde: 'from-ok/20 to-ok/5 text-ok',
}

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

// Iniciales para el avatar del mecánico.
function iniciales(nombre) {
  return (nombre || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((palabra) => palabra[0] ?? '')
    .join('')
    .toUpperCase()
}

// Tarjeta de indicador de la fila superior.
function Indicador({ etiqueta, valor, icono: Icono, tono = 'azul' }) {
  return (
    <article className="card card-hover p-3 flex items-center gap-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${TONOS[tono]}`}>
        <Icono size={18} />
      </div>
      <div>
        <p className="text-xl font-bold tabular-nums text-white leading-none">{valor}</p>
        <p className="text-[11px] uppercase tracking-wider text-slate-500">{etiqueta}</p>
      </div>
    </article>
  )
}


// Tarjeta de una orden dentro de una columna del tablero.


import { useState, useMemo } from 'react'

export default function Dashboard() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [filtroEstado, setFiltroEstado] = useState('Todos')
  const [busqueda, setBusqueda] = useState('')

  const { data, isLoading, isError } = useQuery(['dashboard', token], () => apiGet('/api/dashboard', token), {
    enabled: Boolean(token),
    refetchInterval: 60000,
  })

  const conteo = data?.conteoPorEstado ?? {}
  const enTaller =
    (conteo.Admision ?? 0) +
    (conteo.EnReparacion ?? 0) +
    (conteo.EnPausa ?? 0) +
    (conteo.EsperandoMaterial ?? 0) +
    (conteo.Biomecanica ?? 0)
  const vencidas = data?.vencidas ?? 0
  const sinAvisar = data?.finalizadasSinAvisar ?? 0

  const todasLasOrdenes = useMemo(() => {
    if (!data?.columnas) return []
    return Object.values(data.columnas).flat()
  }, [data])

  const ordenesFiltradas = useMemo(() => {
    return todasLasOrdenes.filter((o) => {
      const matchEstado = filtroEstado === 'Todos' || o.estado === filtroEstado
      const term = busqueda.trim()
      const matchBusqueda = !term || coincideTexto([
        o.numeroOrden,
        o.cliente?.nombre,
        o.cliente?.apellidos,
        o.bicicleta?.modelo,
      ], term)
      return matchEstado && matchBusqueda
    })
  }, [todasLasOrdenes, filtroEstado, busqueda])

  return (
    <section>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-azul-400">Resumen</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Taller</h1>
          <p className="mt-2 text-slate-400">Gestión centralizada de órdenes de reparación.</p>
        </div>
        <button onClick={() => navigate('/ordenes/nueva')} className="btn-primary">
          <IconMas size={18} />
          Nueva orden
        </button>
      </div>

      {isLoading ? <p className="text-slate-400">Cargando el tablero…</p> : isError ? <p role="alert" className="text-peligro">Error al cargar los datos.</p> : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Indicador etiqueta="En el taller" valor={enTaller} icono={IconTaller} />
            <Indicador etiqueta="En admisión" valor={conteo.Admision ?? 0} icono={IconOrdenes} />
            <Indicador etiqueta="Vencidas" valor={vencidas} icono={IconAviso} tono={vencidas > 0 ? 'naranja' : 'azul'} />
            <Indicador etiqueta="Listas para avisar" valor={sinAvisar} icono={IconReloj} tono={sinAvisar > 0 ? 'naranja' : 'azul'} />
            <Indicador etiqueta="Entregadas hoy" valor={data?.entregadasHoy ?? 0} icono={IconCheck} tono="verde" />
          </div>

          <div className="card overflow-hidden">
            <div className="p-4 border-b border-antracita-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <button 
                  onClick={() => setFiltroEstado('Todos')} 
                  className={`px-3 py-1 rounded-full text-xs font-medium transition ${filtroEstado === 'Todos' ? 'bg-azul-500 text-white' : 'bg-antracita-800 text-slate-400 hover:bg-antracita-700'}`}
                >
                  Todos
                </button>
                {ESTADOS_TABLERO.map(e => (
                  <button 
                    key={e} 
                    onClick={() => setFiltroEstado(e)} 
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${filtroEstado === e ? 'bg-azul-500 text-white' : 'bg-antracita-800 text-slate-400 hover:bg-antracita-700'}`}
                  >
                    {estadoInfo(e).etiqueta}
                  </button>
                ))}
              </div>
              <div className="relative w-full sm:w-64">
                <input 
                  type="text" 
                  placeholder="Buscar cliente, bici..."
                  className="input pl-9 py-2 text-xs"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
                <IconTaller size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-antracita-900/50 text-slate-500 text-[10px] uppercase tracking-widest font-semibold">
                    <th className="px-4 py-3">ID Orden</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Vehículo</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Fecha Límite</th>
                    <th className="px-4 py-3 text-right">Prioridad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-antracita-800">
                  {ordenesFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-4 py-12 text-center text-slate-500 text-sm">
                        No se encontraron órdenes que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    ordenesFiltradas.map((orden) => {
                      const vencida = fechaPrevistaVencida(orden)
                      const esUrgente = orden.tipoReparacion === 'Urgente'
                      const esPreferente = orden.tipoReparacion === 'Preferente'
                      const bici = orden.bicicleta ? `${orden.bicicleta.marca} ${orden.bicicleta.modelo || ''}` : '—'
                      const cliente = `${orden.cliente?.nombre || ''} ${orden.cliente?.apellidos || ''}`.trim() || '—'
                      
                      return (
                        <tr 
                          key={orden.id} 
                          onClick={() => navigate(`/ordenes/${orden.id}`)} 
                          className="group cursor-pointer hover:bg-antracita-800/40 transition"
                        >
                          <td className="px-4 py-3 text-xs font-semibold text-slate-400">{orden.numeroOrden}</td>
                          <td className="px-4 py-3 text-sm font-bold text-white">{cliente}</td>
                          <td className="px-4 py-3 text-xs text-slate-400">{bici}</td>
                          <td className="px-4 py-3">
                            <span className={`badge px-2 py-0.5 text-[10px] font-medium ${ 
                              orden.estado === 'Finalizada' ? 'bg-azul-500/10 text-azul-400' : 
                              orden.estado === 'Entregada' ? 'bg-ok/10 text-ok' : 
                              orden.estado === 'EsperandoMaterial' ? 'bg-pink-500/10 text-pink-400' : 
                              orden.estado === 'Biomecanica' ? 'bg-violet-500/10 text-violet-400' : 
                              orden.estado === 'Admision' ? 'bg-yellow-500/10 text-yellow-400' : 
                              orden.estado === 'EnPausa' ? 'bg-red-500/10 text-red-400' : 
                              orden.estado === 'EnReparacion' ? 'bg-naranja-500/10 text-naranja-400' : 'bg-azul-500/10 text-azul-400'
                            }`}>
                              {estadoInfo(orden.estado).etiqueta}
                            </span>
                          </td>
                          <td className={`px-4 py-3 text-xs ${vencida ? 'text-naranja-400 font-bold' : 'text-slate-500'}`}>
                            <div className="flex items-center gap-1">
                              {vencida && <IconAviso size={12} />}
                              {formatearFecha(orden.fechaPrevista)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {esUrgente && <span className="text-[10px] font-bold uppercase text-rose-500">Urgente</span>}
                            {esPreferente && <span className="text-[10px] font-bold uppercase text-amber-400">Preferente</span>}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
