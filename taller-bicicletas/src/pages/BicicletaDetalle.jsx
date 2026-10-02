import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiGet, apiPut } from '../lib/api.js'
import BicicletaModal from '../components/BicicletaModal.jsx'
import HistorialReparaciones from '../components/HistorialReparaciones.jsx'

// Dato de la ficha técnica de la bicicleta.
function Dato({ etiqueta, valor }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <p className="mt-0.5 text-sm text-slate-200">{valor || '—'}</p>
    </div>
  )
}

export default function BicicletaDetalle() {
  const { token } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')

  const { data: bicicleta, isLoading, error } = useQuery(
    ['bicicleta', id],
    () => apiGet(`/api/bicicletas/${id}`, token),
    { enabled: Boolean(token) },
  )
  const { data: clientes = [] } = useQuery(['clientes'], () => apiGet('/api/clientes', token), { enabled: Boolean(token) })

  const actualizar = useMutation((datos) => apiPut(`/api/bicicletas/${id}`, token, datos), {
    onSuccess: () => {
      queryClient.invalidateQueries(['bicicleta', id])
      queryClient.invalidateQueries(['bicicletas'])
      setModalAbierto(false)
      setErrorAccion('')
    },
    onError: (e) => setErrorAccion(e.message),
  })

  if (isLoading) {
    return <div className="mx-auto max-w-6xl"><p className="text-slate-400">Cargando bicicleta…</p></div>
  }
  if (error) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error.message}</p>
        <button type="button" onClick={() => navigate('/bicicletas')} className="rounded-lg border border-antracita-600 px-4 py-2.5 text-sm text-slate-300 hover:bg-antracita-700">Volver al listado</button>
      </div>
    )
  }

  const ordenes = bicicleta.ordenes ?? []
  const cliente = bicicleta.cliente ?? null

  return (
    <div className="mx-auto max-w-6xl">
      <button type="button" onClick={() => navigate('/bicicletas')} className="mb-4 text-sm text-azul-300 hover:text-azul-200">← Volver a bicicletas</button>

      <div className="mb-8">
        <p className="text-sm text-azul-300">{bicicleta.tipo}</p>
        <h1 className="mt-1 text-3xl font-bold">{bicicleta.marca} {bicicleta.modelo || ''}</h1>
      </div>

      {errorAccion && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorAccion}</p>}

      <section className="mb-6 rounded-2xl border border-antracita-700 bg-antracita-800 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Datos de la bicicleta</h2>
          <button type="button" onClick={() => { setErrorAccion(''); setModalAbierto(true) }} className="rounded-lg border border-antracita-600 px-4 py-2 text-sm text-slate-300 hover:bg-antracita-700">Editar</button>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Dato etiqueta="Tipo" valor={bicicleta.tipo} />
          <Dato etiqueta="Marca" valor={bicicleta.marca} />
          <Dato etiqueta="Modelo" valor={bicicleta.modelo} />
          <Dato etiqueta="Color" valor={bicicleta.color} />
          <Dato etiqueta="Talla" valor={bicicleta.tamano} />
          <Dato etiqueta="N.º de serie" valor={bicicleta.numeroSerie} />
          <Dato etiqueta="Año" valor={bicicleta.anio} />
        </div>
        {bicicleta.observaciones && (
          <div className="mt-4 border-t border-antracita-700 pt-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Observaciones</p>
            <p className="mt-0.5 text-sm text-slate-200">{bicicleta.observaciones}</p>
          </div>
        )}
        {cliente && (
          <div className="mt-4 border-t border-antracita-700 pt-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Cliente</p>
            <button type="button" onClick={() => navigate(`/clientes/${cliente.id}`)} className="mt-0.5 text-sm text-azul-300 hover:text-azul-200">
              {cliente.numeroCliente ? `#${cliente.numeroCliente} · ` : ''}{cliente.nombre} {cliente.apellidos || ''}
            </button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-antracita-700 bg-antracita-800 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Historial de reparaciones</h2>
          {cliente && (
            <button type="button" onClick={() => navigate(`/ordenes/nueva?clienteId=${cliente.id}&bicicletaId=${bicicleta.id}`)} className="rounded-lg bg-azul-500 px-4 py-2.5 text-sm font-semibold text-white mantener-blanco hover:bg-azul-600">Nueva orden</button>
          )}
        </div>
        <HistorialReparaciones ordenes={ordenes} mostrarBicicleta={false} />
      </section>

      {modalAbierto && <BicicletaModal bicicleta={bicicleta} clientes={clientes} onSubmit={(datos) => actualizar.mutate(datos)} onClose={() => setModalAbierto(false)} isSaving={actualizar.isLoading} />}
    </div>
  )
}
