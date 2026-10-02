import { useQuery } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiGet } from '../lib/api.js'
import { estadoInfo, etiquetaTipoCorta, formatearFecha } from '../lib/ordenes.js'
import { IconMas, IconTaller, IconOrdenes, IconAviso, IconReloj, IconCheck } from '../components/Icons.jsx'

// Columnas del tablero, en el orden en que se muestran (las entregadas no ocupan tablero).
const ESTADOS_TABLERO = ['Presupuesto', 'Pendiente', 'EnReparacion', 'EsperandoMaterial', 'Finalizada']

// Punto de color de la cabecera de cada columna.
const PUNTO_ESTADO = {
  Presupuesto: 'bg-slate-400',
  Pendiente: 'bg-azul-400',
  EnReparacion: 'bg-azul-500',
  EsperandoMaterial: 'bg-naranja-400',
  Finalizada: 'bg-ok',
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
    <article className="card card-hover p-5">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${TONOS[tono]}`}>
        <Icono size={20} />
      </div>
      <p className="text-3xl font-bold tabular-nums text-white">{valor}</p>
      <p className="mt-1 text-sm text-slate-400">{etiqueta}</p>
    </article>
  )
}


// Tarjeta de una orden dentro de una columna del tablero.
function TarjetaOrden({ orden, onAbrir }) {
  const vencida = fechaPrevistaVencida(orden)
  const tipoResaltado = orden.tipoReparacion === 'Urgente' || orden.tipoReparacion === 'Preferente'
  const bici = orden.bicicleta ? `${orden.bicicleta.marca}${orden.bicicleta.modelo ? ` ${orden.bicicleta.modelo}` : ''}` : '—'
  const cliente = `${orden.cliente?.nombre || ''}${orden.cliente?.apellidos ? ` ${orden.cliente.apellidos}` : ''}`.trim() || '—'
  const mecanico = orden.mecanico?.nombre || 'Sin mecánico'
  return (
    <button type="button" onClick={onAbrir} className="card card-hover w-full p-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-white">{orden.numeroOrden}</span>
        {orden.garantia && <span className="badge bg-naranja-500/10 text-naranja-300">Garantía</span>}
      </div>
      <p className="mt-1.5 truncate text-sm font-medium text-slate-200">{cliente}</p>
      <p className="truncate text-xs text-slate-500">{bici}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-azul-400 to-azul-600 text-[10px] font-semibold text-white mantener-blanco">
          {iniciales(orden.mecanico?.nombre) || '—'}
        </span>
        <span className="truncate text-xs text-slate-400">{mecanico}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className={`flex items-center gap-1 ${vencida ? 'font-medium text-naranja-400' : 'text-slate-500'}`}>
          <IconReloj size={14} />
          {formatearFecha(orden.fechaPrevista)}
        </span>
        {tipoResaltado && <span className="font-medium text-naranja-400">{etiquetaTipoCorta(orden.tipoReparacion)}</span>}
      </div>
      {orden.estado === 'Finalizada' && !orden.clienteAvisado && (
        <span className="badge mt-2 bg-naranja-500/10 text-naranja-300">Sin avisar</span>
      )}
    </button>
  )
}

export default function Dashboard() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const { data, isLoading, isError } = useQuery(['dashboard', token], () => apiGet('/api/dashboard', token), {
    enabled: Boolean(token),
    refetchInterval: 60000,
  })

  const conteo = data?.conteoPorEstado ?? {}
  const enTaller = (conteo.Pendiente ?? 0) + (conteo.EnReparacion ?? 0) + (conteo.EsperandoMaterial ?? 0)
  const vencidas = data?.vencidas ?? 0
  const sinAvisar = data?.finalizadasSinAvisar ?? 0

  return (
    <section>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-azul-400">Resumen</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Taller</h1>
          <p className="mt-2 text-slate-400">Órdenes de reparación por estado.</p>
        </div>
        <button onClick={() => navigate('/ordenes/nueva')} className="btn-primary">
          <IconMas size={18} />
          Nueva orden
        </button>
      </div>

      {isLoading ? <p className="text-slate-400">Cargando el tablero…</p> : isError ? <p role="alert" className="text-peligro">No se pudo cargar el tablero. Comprueba la conexión con el servidor.</p> : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Indicador etiqueta="En el taller" valor={enTaller} icono={IconTaller} />
            <Indicador etiqueta="Presupuestos" valor={conteo.Presupuesto ?? 0} icono={IconOrdenes} />
            <Indicador etiqueta="Vencidas" valor={vencidas} icono={IconAviso} tono={vencidas > 0 ? 'naranja' : 'azul'} />
            <Indicador etiqueta="Listas para avisar" valor={sinAvisar} icono={IconReloj} tono={sinAvisar > 0 ? 'naranja' : 'azul'} />
            <Indicador etiqueta="Entregadas hoy" valor={data?.entregadasHoy ?? 0} icono={IconCheck} tono="verde" />
          </div>

          <div className="overflow-x-auto pb-4 xl:overflow-visible xl:pb-0">
            <div className="flex min-w-max gap-4 xl:grid xl:w-full xl:min-w-0 xl:grid-cols-5">
              {ESTADOS_TABLERO.map((estado) => {
                const ordenes = data?.columnas?.[estado] ?? []
                return (
                  <div key={estado} className="w-[260px] shrink-0 rounded-2xl border border-antracita-800 bg-antracita-900/60 p-3 xl:w-auto xl:shrink">
                    <div className="mb-3 flex items-center justify-between px-1">
                      <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                        <span className={`h-2 w-2 rounded-full ${PUNTO_ESTADO[estado]}`} />
                        {estadoInfo(estado).etiqueta}
                      </h2>
                      <span className="badge bg-antracita-800 text-slate-300">{conteo[estado] ?? 0}</span>
                    </div>
                    <div className="space-y-2.5">
                      {ordenes.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-antracita-700 px-3 py-8 text-center">
                          <IconOrdenes size={22} className="text-slate-600" />
                          <p className="text-xs text-slate-500">Sin órdenes</p>
                        </div>
                      ) : (
                        ordenes.map((orden) => (
                          <TarjetaOrden key={orden.id} orden={orden} onAbrir={() => navigate(`/ordenes/${orden.id}`)} />
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
