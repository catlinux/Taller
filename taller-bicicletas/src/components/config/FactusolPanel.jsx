import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useAuth } from '../../context/AuthContext.jsx'
import DataTable from '../DataTable.jsx'
import { IconDescargar } from '../Icons.jsx'
import { apiGet, apiPost, apiPut } from '../../lib/api.js'
import { formatearEuros, formatearFecha } from '../../lib/ordenes.js'
import { AvisoSoloAdmin } from './comunes.jsx'

// Valores por defecto de la configuración de Factusol (los mismos que el servidor).
const CONFIG_DEFECTO = { serie: '', almacen: 'GEN', formaPago: '', articuloManoObra: '', tiposIva: ['21', '10', '4'], clienteGenerico: '' }

// Aviso destacado en naranja (se repite en los dos bloques del panel).
function AvisoNaranja({ children }) {
  return (
    <p role="status" className="rounded-lg border border-naranja-500/30 bg-naranja-500/10 px-4 py-3 text-sm text-naranja-300">
      {children}
    </p>
  )
}

// Fecha «AAAA-MM-DD» de una fecha, en hora local.
function aFechaLocal(fecha) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`
}

// Primer día del mes actual (valor por defecto de la fecha «desde»).
function primerDiaMesActual() {
  const hoy = new Date()
  return aFechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
}

// Descarga un fichero .xlsx a partir de su contenido en base64.
function descargarXlsx(nombre, base64) {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i)
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  // Se libera más tarde para no cortar la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// Panel de Factusol: configuración de la conexión y exportación de albaranes.
export default function FactusolPanel() {
  const { token, user } = useAuth()
  const esAdmin = user?.rol === 'admin'
  const queryClient = useQueryClient()

  // ── Bloque de configuración ──
  const [borrador, setBorrador] = useState(CONFIG_DEFECTO)
  const [mensajeConfig, setMensajeConfig] = useState('')
  const [errorConfig, setErrorConfig] = useState('')

  const { data: configServidor } = useQuery(['factusol-config'], () => apiGet('/api/factusol/config', token), {
    enabled: Boolean(token) && esAdmin,
  })

  // Copia al formulario los valores que llegan del servidor.
  useEffect(() => {
    if (!configServidor) return
    setBorrador({
      serie: configServidor.serie == null ? '' : String(configServidor.serie),
      almacen: configServidor.almacen ?? 'GEN',
      formaPago: configServidor.formaPago ?? '',
      articuloManoObra: configServidor.articuloManoObra ?? '',
      tiposIva: Array.isArray(configServidor.tiposIva) ? configServidor.tiposIva.map(String) : ['21', '10', '4'],
      clienteGenerico: configServidor.clienteGenerico == null ? '' : String(configServidor.clienteGenerico),
    })
  }, [configServidor])

  const configurada = Boolean(configServidor?.configurada)

  function actualizar(campo, valor) {
    setBorrador((actual) => ({ ...actual, [campo]: valor }))
    setMensajeConfig('')
    setErrorConfig('')
  }

  function actualizarIva(indice, valor) {
    setBorrador((actual) => ({ ...actual, tiposIva: actual.tiposIva.map((t, i) => (i === indice ? valor : t)) }))
    setMensajeConfig('')
    setErrorConfig('')
  }

  const guardarConfig = useMutation(
    () => apiPut('/api/factusol/config', token, {
      serie: borrador.serie === '' ? null : Number(borrador.serie),
      almacen: borrador.almacen,
      formaPago: borrador.formaPago,
      articuloManoObra: borrador.articuloManoObra,
      tiposIva: borrador.tiposIva.map((t) => Number(t)),
      clienteGenerico: borrador.clienteGenerico === '' ? null : Number(borrador.clienteGenerico),
    }),
    {
      onSuccess: () => {
        setErrorConfig('')
        setMensajeConfig('Configuración guardada.')
        queryClient.invalidateQueries(['factusol-config'])
      },
      onError: (e) => setErrorConfig(e.message),
    },
  )

  // ── Bloque de exportación ──
  const [desde, setDesde] = useState(() => primerDiaMesActual())
  const [hasta, setHasta] = useState(() => aFechaLocal(new Date()))
  const [incluirExportadas, setIncluirExportadas] = useState(false)
  const [busqueda, setBusqueda] = useState(null)
  const [seleccionadas, setSeleccionadas] = useState(() => new Set())
  // Órdenes de los últimos ficheros descargados: son las únicas que se marcan.
  const [descargadas, setDescargadas] = useState(null)
  const descargado = Boolean(descargadas)
  const setDescargado = (valor) => { if (!valor) setDescargadas(null) }
  const [avisoExport, setAvisoExport] = useState('')
  const [errorExport, setErrorExport] = useState('')

  const { data: previsualizacion, isFetching, error: errorPrevisualizar } = useQuery(
    ['factusol-previsualizar', busqueda],
    () => apiGet(
      `/api/factusol/previsualizar?desde=${busqueda.desde}&hasta=${busqueda.hasta}${busqueda.incluirExportadas ? '&incluirExportadas=1' : ''}`,
      token,
    ),
    { enabled: Boolean(token) && esAdmin && Boolean(busqueda) },
  )

  const incluidas = previsualizacion?.incluidas ?? []
  const bloqueadas = previsualizacion?.bloqueadas ?? []
  const serie = previsualizacion?.config?.serie ?? configServidor?.serie

  // Al llegar los resultados se marcan por defecto todas las órdenes exportables.
  useEffect(() => {
    if (!previsualizacion) return
    setSeleccionadas(new Set((previsualizacion.incluidas ?? []).map((item) => item.ordenId)))
  }, [previsualizacion])

  const seleccion = {
    todas: incluidas.length > 0 && incluidas.every((item) => seleccionadas.has(item.ordenId)),
    algunas: incluidas.some((item) => seleccionadas.has(item.ordenId)),
    estaSeleccionada: (fila) => seleccionadas.has(fila.ordenId),
    alternar: (fila) => { setDescargado(false); setSeleccionadas((actual) => {
      const copia = new Set(actual)
      if (copia.has(fila.ordenId)) copia.delete(fila.ordenId)
      else copia.add(fila.ordenId)
      return copia
    }) },
    alternarTodas: () => { setDescargado(false); setSeleccionadas((actual) => {
      const ids = incluidas.map((item) => item.ordenId)
      const todasMarcadas = ids.length > 0 && ids.every((id) => actual.has(id))
      return todasMarcadas ? new Set() : new Set(ids)
    }) },
    descripcionFila: (fila) => `orden ${fila.numeroOrden}`,
  }

  function buscar() {
    setErrorExport('')
    setAvisoExport('')
    setDescargado(false)
    setBusqueda((actual) => ({ desde, hasta, incluirExportadas, n: (actual?.n ?? 0) + 1 }))
  }

  const descargar = useMutation(
    (ordenIds) => apiPost('/api/factusol/ficheros', token, {
      desde: busqueda.desde,
      hasta: busqueda.hasta,
      incluirExportadas: busqueda.incluirExportadas,
      ordenIds,
    }),
    {
      onSuccess: (datos, ordenIds) => {
        setErrorExport('')
        // Los dos ficheros se descargan uno tras otro, con los nombres exactos.
        descargarXlsx('ALB.xlsx', datos.alb)
        descargarXlsx('LAL.xlsx', datos.lal)
        setDescargadas(ordenIds)
      },
      onError: (e) => setErrorExport(e.message),
    },
  )

  const marcar = useMutation(
    () => apiPost('/api/factusol/marcar', token, { ordenIds: descargadas }),
    {
      onSuccess: (datos) => {
        setErrorExport('')
        setDescargado(false)
        setAvisoExport(`Se ${datos.marcadas === 1 ? 'ha' : 'han'} marcado ${datos.marcadas} ${datos.marcadas === 1 ? 'orden' : 'órdenes'} como exportadas.`)
        queryClient.invalidateQueries(['factusol-previsualizar'])
      },
      onError: (e) => setErrorExport(e.message),
    },
  )

  const desmarcar = useMutation(
    (ordenId) => apiPost('/api/factusol/desmarcar', token, { ordenIds: [ordenId] }),
    {
      onSuccess: () => {
        setErrorExport('')
        setAvisoExport('Se ha quitado la marca de exportación.')
        queryClient.invalidateQueries(['factusol-previsualizar'])
      },
      onError: (e) => setErrorExport(e.message),
    },
  )

  function confirmarMarcar() {
    const total = descargadas.length
    if (!window.confirm(`¿Marcar ${total} ${total === 1 ? 'orden' : 'órdenes'} como exportadas a Factusol? Hazlo solo si ya has importado los ficheros.`)) return
    marcar.mutate()
  }

  function confirmarDesmarcar(item) {
    if (window.confirm(`¿Quitar la marca de exportada a la orden ${item.numeroOrden}? Si vuelves a exportarla, Factusol sobrescribirá el albarán ${serie}-${item.albaran}.`)) {
      desmarcar.mutate(item.ordenId)
    }
  }

  const columnas = [
    { clave: 'numeroOrden', titulo: 'N.º de orden', ancho: '160px', valor: (item) => item.numeroOrden, clase: 'font-medium text-white' },
    { clave: 'albaran', titulo: 'Albarán', ancho: '120px', valor: (item) => `${serie}-${item.albaran}` },
    { clave: 'cliente', titulo: 'Cliente', ancho: '200px', valor: (item) => item.cliente || '—' },
    { clave: 'fecha', titulo: 'Fecha', ancho: '110px', tipo: 'fecha', valor: (item) => item.fecha, render: (item) => formatearFecha(item.fecha) },
    { clave: 'total', titulo: 'Total', ancho: '120px', tipo: 'numero', alinear: 'der', valor: (item) => item.total, render: (item) => formatearEuros(item.total) },
    {
      clave: 'avisos',
      titulo: 'Avisos',
      valor: (item) => (item.avisos ?? []).join(' · '),
      render: (item) => (item.avisos?.length
        ? <span className="text-naranja-300">{item.avisos.join(' · ')}</span>
        : <span className="text-slate-500">—</span>),
    },
    {
      clave: 'exportadaFactusolEn',
      titulo: 'Exportación',
      ancho: '170px',
      valor: (item) => item.exportadaFactusolEn ?? '',
      render: (item) => (item.exportadaFactusolEn
        ? <span className="rounded-full bg-azul-500/10 px-2.5 py-0.5 text-xs font-medium text-azul-300">Ya exportada el {formatearFecha(item.exportadaFactusolEn)}</span>
        : <span className="text-slate-500">—</span>),
    },
  ]

  const accionesOrden = (item) => (item.exportadaFactusolEn ? (
    <button
      type="button"
      disabled={desmarcar.isLoading}
      onClick={() => confirmarDesmarcar(item)}
      className="rounded-md px-3 py-1.5 text-azul-300 hover:bg-azul-500/10 disabled:opacity-50"
    >
      Quitar marca de exportada
    </button>
  ) : null)


  return (
    <div>
      <h2 className="text-lg font-semibold text-white">Factusol</h2>
      <p className="mt-1 text-sm text-slate-400">Configura la conexión y descarga los albaranes de las órdenes para importarlos en Factusol.</p>

      {!esAdmin && <div className="mt-5"><AvisoSoloAdmin /></div>}

      <section className="mt-6">
        <h3 className="text-base font-semibold text-white">Configuración</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Serie</span>
            <select
              value={borrador.serie}
              onChange={(event) => actualizar('serie', event.target.value)}
              disabled={!esAdmin}
              className="input mt-1.5"
            >
              <option value="">Sin configurar</option>
              {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">Almacén</span>
            <input
              value={borrador.almacen}
              maxLength={3}
              onChange={(event) => actualizar('almacen', event.target.value)}
              disabled={!esAdmin}
              className="input mt-1.5"
            />
          </label>
          <label className="block">
            <span className="label">Forma de pago</span>
            <input
              value={borrador.formaPago}
              maxLength={3}
              onChange={(event) => actualizar('formaPago', event.target.value)}
              disabled={!esAdmin}
              className="input mt-1.5"
            />
            <span className="mt-1.5 block text-xs text-slate-500">Código en Factusol. Opcional.</span>
          </label>
          <label className="block">
            <span className="label">Artículo para la mano de obra</span>
            <input
              value={borrador.articuloManoObra}
              maxLength={13}
              onChange={(event) => actualizar('articuloManoObra', event.target.value)}
              disabled={!esAdmin}
              className="input mt-1.5"
            />
            <span className="mt-1.5 block text-xs text-slate-500">Código en Factusol. Opcional.</span>
          </label>
          <label className="block">
            <span className="label">Cliente genérico (contado)</span>
            <input
              type="number"
              min="0"
              max="99999"
              step="1"
              inputMode="numeric"
              value={borrador.clienteGenerico}
              onChange={(event) => actualizar('clienteGenerico', event.target.value)}
              disabled={!esAdmin}
              className="input mt-1.5"
            />
            <span className="mt-1.5 block text-xs text-slate-500">Código del cliente de contado en Factusol. Las órdenes de clientes sin código de Factusol se exportan con él, con el nombre y los datos reales del cliente en el albarán. Déjalo vacío para que esas órdenes se bloqueen.</span>
          </label>
          {borrador.tiposIva.map((tipo, indice) => (
            <label key={indice} className="block">
              <span className="label">Tipo de IVA {indice + 1}</span>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={tipo}
                onChange={(event) => actualizarIva(indice, event.target.value)}
                disabled={!esAdmin}
                className="input mt-1.5"
              />
            </label>
          ))}
        </div>

        <div className="mt-4">
          <AvisoNaranja>Usa una serie de albaranes que NO uséis en Factusol para nada más: si un albarán con la misma serie y número ya existe, Factusol lo sobrescribe.</AvisoNaranja>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-antracita-700 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p role={errorConfig ? 'alert' : 'status'} aria-live="polite" className={`text-sm ${errorConfig ? 'text-rose-300' : 'text-emerald-300'}`}>
            {errorConfig || mensajeConfig}
          </p>
          <button type="button" onClick={() => guardarConfig.mutate()} disabled={!esAdmin || guardarConfig.isLoading} className="btn-primary">
            {guardarConfig.isLoading ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </section>


      <section className="mt-8 border-t border-antracita-700 pt-6">
        <h3 className="text-base font-semibold text-white">Exportación</h3>

        {!configurada && (
          <div className="mt-4">
            <AvisoNaranja>Configura primero la serie de Factusol (arriba) para poder exportar órdenes.</AvisoNaranja>
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
          <label className="block">
            <span className="label">Desde</span>
            <input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} disabled={!esAdmin || !configurada} className="input mt-1.5" />
          </label>
          <label className="block">
            <span className="label">Hasta</span>
            <input type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} disabled={!esAdmin || !configurada} className="input mt-1.5" />
          </label>
          <label className="flex items-center gap-3 pb-1">
            <input type="checkbox" checked={incluirExportadas} onChange={(event) => setIncluirExportadas(event.target.checked)} disabled={!esAdmin || !configurada} className="h-5 w-5 rounded border-antracita-600 bg-antracita-900 accent-azul-500" />
            <span className="text-sm text-slate-300">Incluir órdenes ya exportadas</span>
          </label>
        </div>

        <div className="mt-4">
          <button type="button" onClick={buscar} disabled={!esAdmin || !configurada || isFetching} className="btn-secondary">
            {isFetching ? 'Buscando…' : 'Buscar órdenes'}
          </button>
        </div>

        {errorPrevisualizar && <p role="alert" className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorPrevisualizar.message}</p>}
        {errorExport && <p role="alert" className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorExport}</p>}
        {avisoExport && <p role="status" className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{avisoExport}</p>}

        {busqueda && (
          <>
            <div className="mt-5">
              <DataTable
                columnas={columnas}
                filas={incluidas}
                claveFila={(item) => item.ordenId}
                ordenInicial={{ clave: 'numeroOrden', dir: 'asc' }}
                seleccion={seleccion}
                acciones={accionesOrden}
                anchoAcciones={210}
                cargando={isFetching}
                etiquetaPlural="órdenes"
                vacio="No hay órdenes exportables en este rango."
              />
            </div>


            {bloqueadas.length > 0 && (
              <div className="mt-5">
                <p className="text-sm font-medium text-naranja-300">Órdenes que no se pueden exportar</p>
                <ul className="mt-2 space-y-2">
                  {bloqueadas.map((item) => (
                    <li key={item.ordenId} className="rounded-lg border border-antracita-700 bg-antracita-900/50 px-4 py-3 text-sm">
                      <span className="font-medium text-white">Orden {item.numeroOrden}</span>
                      {item.cliente && <span className="text-slate-400"> · {item.cliente}</span>}
                      <span className="mt-1 block text-naranja-300">{(item.motivos ?? []).join(' · ')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3 border-t border-antracita-700 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-400">{seleccionadas.size} de {incluidas.length} seleccionadas</p>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => descargar.mutate([...seleccionadas])} disabled={seleccionadas.size === 0 || descargar.isLoading} className="btn-primary">
                  <IconDescargar size={16} /> {descargar.isLoading ? 'Generando…' : 'Descargar ALB.xlsx y LAL.xlsx'}
                </button>
                {descargado && (
                  <button type="button" onClick={confirmarMarcar} disabled={marcar.isLoading} className="btn-secondary">
                    {marcar.isLoading ? 'Marcando…' : 'Ya lo he importado en Factusol: marcar como exportadas'}
                  </button>
                )}
              </div>
            </div>

            {descargado && (
              <div className="mt-5 rounded-lg border border-azul-500/30 bg-azul-500/10 px-4 py-4 text-sm text-slate-200">
                <p className="font-medium text-white">Para importar en Factusol:</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>Haz una copia de seguridad de la empresa en Factusol.</li>
                  <li>Pon ALB.xlsx y LAL.xlsx juntos en una carpeta (sustituye los de la vez anterior).</li>
                  <li>En Factusol: Utilidades &gt; Importaciones &gt; Ficheros .XLSX / .XLS.</li>
                  <li>En Ubicación elige esa carpeta, Fila inicial 2, deja marcado «Comprobar la estructura de todos los ficheros seleccionados antes de la importación» y marca ALB y LAL.</li>
                  <li>Revisa los albaranes en Factusol.</li>
                </ol>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

