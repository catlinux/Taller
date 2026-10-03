import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useAjustes } from '../context/AjustesContext.jsx'
import { apiGet, apiPost, apiPut } from '../lib/api.js'
import { ESTADOS, TIPOS_REPARACION } from '../lib/ordenes.js'
import { FORMAS_PAGO } from '../lib/pagos.js'
import ClienteSelector from '../components/orden/ClienteSelector.jsx'
import BicicletaSelector from '../components/orden/BicicletaSelector.jsx'
import TablaMateriales from '../components/orden/TablaMateriales.jsx'
import TablaManoObra from '../components/orden/TablaManoObra.jsx'
import Totales from '../components/orden/Totales.jsx'

const inputClass = 'mt-1.5 w-full rounded-lg border border-antracita-600 bg-antracita-900 px-3 py-2.5 text-white outline-none focus:border-azul-400'

// Añade el mecánico asignado a la lista si no está en ella (por ejemplo, si el
// mecánico seleccionado está inactivo y la lista solo incluye los activos).
function conMecanicoAsignado(mecanicos, mecanico) {
  if (mecanico && !mecanicos.some((m) => m.id === mecanico.id)) return [...mecanicos, mecanico]
  return mecanicos
}

// Convierte una fecha ISO en el valor que espera un <input type="datetime-local">.
function aDatetimeLocal(iso) {
  const fecha = iso ? new Date(iso) : new Date()
  if (Number.isNaN(fecha.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}T${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`
}

// Convierte una fecha ISO en el valor que espera un <input type="date">.
function aFechaInput(iso) {
  const fecha = iso ? new Date(iso) : null
  if (!fecha || Number.isNaN(fecha.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`
}

// Convierte el valor de un input de fecha (y hora) en una fecha ISO, o null.
function aISO(valor, soloFecha = false) {
  if (!valor) return null
  const fecha = new Date(soloFecha ? `${valor}T12:00:00` : valor)
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString()
}

function estadoInicialForm() {
  return {
    numeroOrden: '',
    fechaEntrada: aDatetimeLocal(null),
    fechaPrevista: '',
    estado: 'Presupuesto',
    tipoReparacion: '',
    garantia: false,
    mecanicoId: '',
    problema: '',
    descripcion: '',
    diagnostico: '',
    recomendaciones: '',
    accesorios: '',
    formaPago: 'Pendiente',
    observaciones: '',
    clienteAvisado: false,
    seguimiento: '',
  }
}

// Tarjeta de sección con aspecto de documento. `interno` la marca como interna.
function Tarjeta({ titulo, descripcion, interno = false, className = '', children }) {
  return (
    <section className={`rounded-2xl border bg-antracita-800 p-5 ${className} ${interno ? 'border-naranja-500/60' : 'border-antracita-700'}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{titulo}</h2>
          {descripcion && <p className="mt-0.5 text-sm text-slate-400">{descripcion}</p>}
        </div>
        {interno && <span className="rounded-full bg-naranja-500/10 px-3 py-1 text-xs font-medium text-naranja-300">Interno · no se imprime</span>}
      </div>
      {children}
    </section>
  )
}


export default function OrdenDetalle() {
  const { token } = useAuth()
  const { ajustes } = useAjustes()
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const esNueva = !id
  const [searchParams] = useSearchParams()
  // Al crear una orden desde la ficha de un cliente o una bici, la URL puede
  // traer el cliente y la bicicleta ya elegidos para precargarlos.
  const clienteIdParam = esNueva ? searchParams.get('clienteId') : null
  const bicicletaIdParam = esNueva ? searchParams.get('bicicletaId') : null

  const [form, setForm] = useState(estadoInicialForm)
  const [cliente, setCliente] = useState(null)
  const [bicicleta, setBicicleta] = useState(null)
  const [errorAccion, setErrorAccion] = useState('')
  const sucioRef = useRef(false)

  const { data: clientePrecargado } = useQuery(
    ['cliente', clienteIdParam],
    () => apiGet(`/api/clientes/${clienteIdParam}`, token),
    { enabled: Boolean(token) && Boolean(clienteIdParam) },
  )

  const { data: bicicletaPrecargada } = useQuery(
    ['bicicleta', bicicletaIdParam],
    () => apiGet(`/api/bicicletas/${bicicletaIdParam}`, token),
    { enabled: Boolean(token) && Boolean(bicicletaIdParam) },
  )

  // Precarga el cliente indicado en la URL al crear una orden nueva.
  useEffect(() => {
    if (esNueva && clientePrecargado) setCliente((actual) => actual ?? clientePrecargado)
  }, [esNueva, clientePrecargado])

  // Precarga la bicicleta indicada en la URL al crear una orden nueva.
  useEffect(() => {
    if (esNueva && bicicletaPrecargada) setBicicleta((actual) => actual ?? bicicletaPrecargada)
  }, [esNueva, bicicletaPrecargada])

  const { data: orden, isLoading, error: errorCarga } = useQuery(
    ['orden', id],
    () => apiGet(`/api/ordenes/${id}`, token),
    { enabled: Boolean(token) && !esNueva },
  )

  const { data: mecanicos = [] } = useQuery(
    ['mecanicos'],
    () => apiGet('/api/mecanicos', token),
    { enabled: Boolean(token) },
  )

  const { data: empresas = [] } = useQuery(
    ['empresa'],
    () => apiGet('/api/empresa', token),
    { enabled: Boolean(token) },
  )

  // Carga los campos de la orden existente cuando llega del servidor.
  useEffect(() => {
    if (!orden) return
    setForm({
      numeroOrden: orden.numeroOrden ?? '',
      fechaEntrada: aDatetimeLocal(orden.fechaEntrada),
      fechaPrevista: aFechaInput(orden.fechaPrevista),
      estado: orden.estado ?? 'Presupuesto',
      tipoReparacion: orden.tipoReparacion ?? '',
      garantia: Boolean(orden.garantia),
      mecanicoId: orden.mecanicoId ?? '',
      problema: orden.problema ?? '',
      descripcion: orden.descripcion ?? '',
      diagnostico: orden.diagnostico ?? '',
      recomendaciones: orden.recomendaciones ?? '',
      accesorios: orden.accesorios ?? '',
      formaPago: orden.formaPago ?? '',
      observaciones: orden.observaciones ?? '',
      clienteAvisado: Boolean(orden.clienteAvisado),
      seguimiento: orden.seguimiento ?? '',
    })
    setCliente(orden.cliente ?? null)
    setBicicleta(orden.bicicleta ?? null)
    sucioRef.current = false
  }, [orden])

  // Avisa al recargar o cerrar la pestaña si hay cambios sin guardar.
  useEffect(() => {
    function alSalir(event) {
      if (sucioRef.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', alSalir)
    return () => window.removeEventListener('beforeunload', alSalir)
  }, [])

  const guardar = useMutation(
    () => {
      const payload = construirPayload()
      return esNueva ? apiPost('/api/ordenes', token, payload) : apiPut(`/api/ordenes/${id}`, token, payload)
    },
    {
      onSuccess: (ordenGuardada) => {
        sucioRef.current = false
        queryClient.invalidateQueries(['ordenes'])
        queryClient.invalidateQueries(['orden', String(ordenGuardada.id)])
        if (esNueva) navigate(`/ordenes/${ordenGuardada.id}`)
        else setForm((actual) => ({ ...actual, numeroOrden: ordenGuardada.numeroOrden ?? actual.numeroOrden }))
      },
      onError: (e) => setErrorAccion(e.message),
    },
  )

  const duplicar = useMutation(
    () => apiPost(`/api/ordenes/${id}/duplicar`, token, {}),
    {
      onSuccess: (nueva) => {
        queryClient.invalidateQueries(['ordenes'])
        navigate(`/ordenes/${nueva.id}`)
      },
      onError: (e) => setErrorAccion(e.message),
    },
  )

  function construirPayload() {
    return {
      clienteId: Number(cliente?.id),
      bicicletaId: bicicleta?.id ?? null,
      mecanicoId: form.mecanicoId === '' ? null : Number(form.mecanicoId),
      fechaEntrada: aISO(form.fechaEntrada),
      fechaPrevista: aISO(form.fechaPrevista, true),
      estado: form.estado,
      tipoReparacion: form.tipoReparacion || null,
      garantia: form.garantia,
      problema: form.problema,
      descripcion: form.descripcion,
      diagnostico: form.diagnostico,
      recomendaciones: form.recomendaciones,
      accesorios: form.accesorios,
      formaPago: form.formaPago || null,
      observaciones: form.observaciones,
      clienteAvisado: form.clienteAvisado,
      seguimiento: form.seguimiento,
    }
  }

  function actualizar(campo, valor) {
    sucioRef.current = true
    setForm((actual) => ({ ...actual, [campo]: valor }))
  }

  function cambiarCliente(nuevo) {
    sucioRef.current = true
    setCliente(nuevo)
    setBicicleta(null)
  }

  function cambiarBicicleta(nueva) {
    sucioRef.current = true
    setBicicleta(nueva)
  }

  function alGuardar() {
    setErrorAccion('')
    if (!cliente) {
      setErrorAccion('Selecciona un cliente antes de guardar la orden.')
      return
    }
    guardar.mutate()
  }

  function volver() {
    if (sucioRef.current && !window.confirm('Hay cambios sin guardar. ¿Seguro que quieres salir?')) return
    navigate('/ordenes')
  }

  // Genera el documento PDF con los datos actuales de la orden y la empresa.
  // La librería de PDF (pesada) se carga bajo demanda la primera vez que se usa.
  async function generarDocumento() {
    const { generarPdfOrden } = await import('../lib/pdfOrden.js')
    return generarPdfOrden(orden, empresas[0] ?? null, ajustes)
  }

  // Imprime el PDF abriendo directamente el diálogo de impresión del navegador.
  async function alImprimir() {
    setErrorAccion('')
    if (sucioRef.current) {
      setErrorAccion('Guarda los cambios antes de imprimir la orden.')
      return
    }
    try {
      const { imprimirPdf } = await import('../lib/imprimirPdf.js')
      const doc = await generarDocumento()
      imprimirPdf(doc)
    } catch (e) {
      setErrorAccion(e.message)
    }
  }

  // Descarga el PDF de la orden.
  async function alDescargarPdf() {
    setErrorAccion('')
    if (sucioRef.current) {
      setErrorAccion('Guarda los cambios antes de descargar el PDF.')
      return
    }
    try {
      const { nombrePdfOrden } = await import('../lib/pdfOrden.js')
      const doc = await generarDocumento()
      doc.save(nombrePdfOrden(orden))
    } catch (e) {
      setErrorAccion(e.message)
    }
  }

  // Duplica la orden actual y navega a la ficha de la copia.
  function alDuplicar() {
    setErrorAccion('')
    if (sucioRef.current) {
      setErrorAccion('Guarda los cambios antes de duplicar la orden.')
      return
    }
    if (!window.confirm('¿Duplicar esta orden? Se creará una copia nueva en estado Presupuesto.')) return
    duplicar.mutate()
  }

  if (!esNueva && isLoading) {
    return <div className="mx-auto max-w-6xl"><p className="text-slate-400">Cargando orden…</p></div>
  }
  if (!esNueva && errorCarga) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorCarga.message}</p>
        <button type="button" onClick={() => navigate('/ordenes')} className="rounded-lg border border-antracita-600 px-4 py-2.5 text-sm text-slate-300 hover:bg-antracita-700">Volver al listado</button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl pb-24">
      <div className="mb-6">
        <p className="text-sm text-azul-300">Taller</p>
        <h1 className="mt-1 text-3xl font-bold">{esNueva ? 'Nueva orden' : `Orden ${form.numeroOrden || ''}`}</h1>
        <p className="mt-2 text-slate-400">Ficha de la orden de reparación.</p>
      </div>

      {errorAccion && <p role="alert" className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorAccion}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Tarjeta titulo="Cabecera">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-slate-300">N.º de orden
                <input value={esNueva ? 'Nueva orden' : form.numeroOrden} readOnly className={`${inputClass} opacity-70`} />
              </label>
              <label className="block text-sm text-slate-300">Mecánico
                <select value={form.mecanicoId} onChange={(event) => actualizar('mecanicoId', event.target.value)} className={inputClass}>
                  <option value="">Sin asignar</option>
                  {conMecanicoAsignado(mecanicos, orden?.mecanico).map((mecanico) => <option key={mecanico.id} value={mecanico.id}>{mecanico.nombre}</option>)}
                </select>
              </label>
              <label className="block text-sm text-slate-300">Fecha y hora de entrada
                <input type="datetime-local" value={form.fechaEntrada} onChange={(event) => actualizar('fechaEntrada', event.target.value)} className={inputClass} />
              </label>
              <label className="block text-sm text-slate-300">Fecha prevista de entrega
                <input type="date" value={form.fechaPrevista} onChange={(event) => actualizar('fechaPrevista', event.target.value)} className={inputClass} />
              </label>
              <label className="block text-sm text-slate-300">Estado
                <select value={form.estado} onChange={(event) => actualizar('estado', event.target.value)} className={inputClass}>
                  {ESTADOS.map((estado) => <option key={estado.valor} value={estado.valor}>{estado.etiqueta}</option>)}
                </select>
              </label>
              <label className="block text-sm text-slate-300">Tipo de reparación
                <select value={form.tipoReparacion} onChange={(event) => actualizar('tipoReparacion', event.target.value)} className={inputClass}>
                  <option value="">Sin especificar</option>
                  {TIPOS_REPARACION.map((tipo) => <option key={tipo.valor} value={tipo.valor}>{tipo.etiqueta}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-3 sm:col-span-2">
                <input type="checkbox" checked={form.garantia} onChange={(event) => actualizar('garantia', event.target.checked)} className="h-5 w-5 rounded border-antracita-600 bg-antracita-900 accent-azul-500" />
                <span className="text-sm text-slate-300">Reparación en garantía</span>
              </label>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Cliente" descripcion="Busca por nº, nombre, DNI o teléfono, o da de alta uno nuevo.">
            <ClienteSelector cliente={cliente} onChange={cambiarCliente} token={token} />
          </Tarjeta>

          <div className="grid gap-6 sm:grid-cols-2">
            <Tarjeta titulo="Bicicleta" descripcion="Material entregado por el cliente.">
              <BicicletaSelector cliente={cliente} bicicleta={bicicleta} onChange={cambiarBicicleta} token={token} />
            </Tarjeta>

            <Tarjeta titulo="Accesorios bicicleta" descripcion="Accesorios entregados con la bici; uno por línea.">
              <textarea rows={5} value={form.accesorios} onChange={(event) => actualizar('accesorios', event.target.value)} className={inputClass} />
            </Tarjeta>
          </div>
        </div>


        <div className="space-y-6">
          <Tarjeta titulo="Problema" descripcion="Lo que el cliente dice que le pasa a la bici.">
            <textarea rows={5} value={form.problema} onChange={(event) => actualizar('problema', event.target.value)} className={inputClass} />
          </Tarjeta>

          <Tarjeta titulo="Descripción de los trabajos">
            <div className="space-y-4">
              <label className="block text-sm text-slate-300">Trabajos realizados
                <textarea rows={4} value={form.descripcion} onChange={(event) => actualizar('descripcion', event.target.value)} className={inputClass} />
              </label>
              <label className="block text-sm text-slate-300">Diagnóstico
                <textarea rows={3} value={form.diagnostico} onChange={(event) => actualizar('diagnostico', event.target.value)} className={inputClass} />
              </label>
              <label className="block text-sm text-slate-300">Recomendaciones
                <textarea rows={3} value={form.recomendaciones} onChange={(event) => actualizar('recomendaciones', event.target.value)} className={inputClass} />
              </label>
            </div>
          </Tarjeta>
        </div>

        {esNueva || !orden ? (
          <div className="rounded-2xl border border-dashed border-antracita-600 bg-antracita-800/50 p-5 text-sm text-slate-500 lg:col-span-full">
            <p>Guarda la orden para añadir materiales y mano de obra.</p>
          </div>
        ) : (
          <>
            <Tarjeta titulo="Materiales utilizados" descripcion="Busca en el catálogo por referencia o descripción; todo es editable." className="lg:col-span-full">
              <TablaMateriales orden={orden} token={token} />
            </Tarjeta>

            <Tarjeta titulo="Mano de obra" descripcion="Autocompleta desde el catálogo de operaciones; todo es editable." className="lg:col-span-full">
              <TablaManoObra orden={orden} token={token} />
            </Tarjeta>
          </>
        )}

        <div className="grid gap-6 lg:col-span-full lg:grid-cols-2">
          <Tarjeta titulo="Datos internos" descripcion="No se imprimen ni los ve el cliente." interno>
            <label className="block text-sm text-slate-300">Forma de pago
              <select value={form.formaPago} onChange={(event) => actualizar('formaPago', event.target.value)} className={inputClass}>
                {form.formaPago === '' && <option value="" disabled>Sin indicar</option>}
                {FORMAS_PAGO.map((forma) => <option key={forma.valor} value={forma.valor}>{forma.etiqueta}</option>)}
              </select>
            </label>
            <label className="mt-4 block text-sm text-slate-300">Observaciones internas
              <textarea rows={3} value={form.observaciones} onChange={(event) => actualizar('observaciones', event.target.value)} className={inputClass} />
            </label>
            <div className="mt-5 border-t border-antracita-700 pt-5">
              <p className="mb-3 text-sm font-semibold text-naranja-300">Seguimiento</p>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={form.clienteAvisado} onChange={(event) => actualizar('clienteAvisado', event.target.checked)} className="h-5 w-5 rounded border-antracita-600 bg-antracita-900 accent-naranja-500" />
                <span className="text-sm text-slate-300">Cliente avisado</span>
              </label>
              <label className="mt-4 block text-sm text-slate-300">Notas de seguimiento
                <textarea rows={3} value={form.seguimiento} onChange={(event) => actualizar('seguimiento', event.target.value)} className={inputClass} />
              </label>
            </div>
          </Tarjeta>

          {orden && (
            <Tarjeta titulo="Totales" descripcion="Los calcula el servidor a partir de las líneas.">
              <Totales orden={orden} token={token} />
            </Tarjeta>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-antracita-700 bg-antracita-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button type="button" onClick={volver} className="rounded-lg border border-antracita-600 px-4 py-2.5 text-sm text-slate-300 hover:bg-antracita-700">Volver al listado</button>
          <div className="flex flex-wrap items-center gap-2">
            {!esNueva && orden && (
              <>
                <button type="button" onClick={alImprimir} className="rounded-lg border border-antracita-600 px-4 py-2.5 text-sm text-slate-300 hover:bg-antracita-700">Imprimir</button>
                <button type="button" onClick={alDescargarPdf} className="rounded-lg border border-antracita-600 px-4 py-2.5 text-sm text-slate-300 hover:bg-antracita-700">Descargar PDF</button>
                <button type="button" onClick={alDuplicar} disabled={duplicar.isLoading} className="rounded-lg border border-antracita-600 px-4 py-2.5 text-sm text-slate-300 hover:bg-antracita-700 disabled:opacity-50">
                  {duplicar.isLoading ? 'Duplicando…' : 'Duplicar'}
                </button>
              </>
            )}
            <button type="button" onClick={alGuardar} disabled={guardar.isLoading} className="rounded-lg bg-azul-500 px-5 py-2.5 text-sm font-semibold text-white mantener-blanco hover:bg-azul-600 disabled:opacity-50">
              {guardar.isLoading ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

