import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiGet, apiPost, apiPut } from '../lib/api.js'
import ClienteModal from '../components/ClienteModal.jsx'
import BicicletaModal from '../components/BicicletaModal.jsx'
import HistorialReparaciones from '../components/HistorialReparaciones.jsx'

// Dato de la ficha de contacto.
function Dato({ etiqueta, valor }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <p className="mt-0.5 text-sm text-slate-200">{valor || '—'}</p>
    </div>
  )
}

// Tarjeta de bicicleta del cliente; al pulsarla se abre su ficha.
function TarjetaBicicleta({ bicicleta, onAbrir }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="rounded-xl border border-antracita-600 bg-antracita-900/40 p-4 text-left transition hover:border-azul-500"
    >
      <p className="text-xs uppercase tracking-wide text-azul-300">{bicicleta.tipo}</p>
      <p className="mt-1 font-semibold text-white">{bicicleta.marca} {bicicleta.modelo || ''}</p>
      <p className="mt-1 text-xs text-slate-400">{bicicleta.numeroSerie ? `N.º serie ${bicicleta.numeroSerie}` : 'Sin número de serie'}</p>
    </button>
  )
}

export default function ClienteDetalle() {
  const { token } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [modalCliente, setModalCliente] = useState(false)
  const [modalBici, setModalBici] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')

  const { data: cliente, isLoading, error } = useQuery(
    ['cliente', id],
    () => apiGet(`/api/clientes/${id}`, token),
    { enabled: Boolean(token) },
  )

  const refrescar = () => queryClient.invalidateQueries(['cliente', id])

  const actualizarCliente = useMutation((datos) => apiPut(`/api/clientes/${id}`, token, datos), {
    onSuccess: () => { refrescar(); queryClient.invalidateQueries(['clientes']); setModalCliente(false); setErrorAccion('') },
    onError: (e) => setErrorAccion(e.message),
  })

  const crearBicicleta = useMutation((datos) => apiPost('/api/bicicletas', token, datos), {
    onSuccess: () => { refrescar(); queryClient.invalidateQueries(['bicicletas']); setModalBici(false); setErrorAccion('') },
    onError: (e) => setErrorAccion(e.message),
  })

  if (isLoading) {
    return <div className="mx-auto max-w-6xl"><p className="text-slate-400">Cargando cliente…</p></div>
  }
  if (error) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error.message}</p>
        <button type="button" onClick={() => navigate('/clientes')} className="rounded-lg border border-antracita-600 px-4 py-2.5 text-sm text-slate-300 hover:bg-antracita-700">Volver al listado</button>
      </div>
    )
  }

  const bicicletas = cliente.bicicletas ?? []
  const ordenes = cliente.ordenes ?? []

  return (
    <div className="mx-auto max-w-6xl">
      <button type="button" onClick={() => navigate('/clientes')} className="mb-4 text-sm text-azul-300 hover:text-azul-200">← Volver a clientes</button>

      <div className="mb-8">
        <p className="text-sm text-azul-300">Cliente{cliente.numeroCliente ? ` #${cliente.numeroCliente}` : ''}</p>
        <h1 className="mt-1 text-3xl font-bold">{cliente.nombre}{cliente.apellidos ? ` ${cliente.apellidos}` : ''}</h1>
      </div>

      {errorAccion && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorAccion}</p>}

      <section className="mb-6 rounded-2xl border border-antracita-700 bg-antracita-800 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Datos de contacto</h2>
          <button type="button" onClick={() => { setErrorAccion(''); setModalCliente(true) }} className="rounded-lg border border-antracita-600 px-4 py-2 text-sm text-slate-300 hover:bg-antracita-700">Editar</button>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Dato etiqueta="DNI" valor={cliente.dni} />
          <Dato etiqueta="Dirección" valor={cliente.direccion} />
          <Dato etiqueta="Código postal" valor={cliente.codigoPostal} />
          <Dato etiqueta="Población" valor={cliente.poblacion} />
          <Dato etiqueta="Provincia" valor={cliente.provincia} />
          <Dato etiqueta="Teléfono" valor={cliente.telefono} />
          <Dato etiqueta="Correo" valor={cliente.email} />
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-antracita-700 bg-antracita-800 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Bicicletas</h2>
          <button type="button" onClick={() => { setErrorAccion(''); setModalBici(true) }} className="rounded-lg border border-azul-500/50 bg-azul-500/10 px-3 py-2 text-sm font-medium text-azul-300 hover:bg-azul-500/20">+ Añadir bici</button>
        </div>
        {bicicletas.length === 0
          ? <p className="rounded-xl border border-antracita-700 bg-antracita-900/40 px-4 py-6 text-sm text-slate-400">Este cliente todavía no tiene bicicletas registradas.</p>
          : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {bicicletas.map((b) => <TarjetaBicicleta key={b.id} bicicleta={b} onAbrir={() => navigate(`/bicicletas/${b.id}`)} />)}
            </div>
          )}
      </section>

      <section className="rounded-2xl border border-antracita-700 bg-antracita-800 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Historial de reparaciones</h2>
          <button type="button" onClick={() => navigate(`/ordenes/nueva?clienteId=${cliente.id}`)} className="rounded-lg bg-azul-500 px-4 py-2.5 text-sm font-semibold text-white mantener-blanco hover:bg-azul-600">Nueva orden</button>
        </div>
        <HistorialReparaciones ordenes={ordenes} />
      </section>

      {modalCliente && <ClienteModal cliente={cliente} onSubmit={(datos) => actualizarCliente.mutate(datos)} onClose={() => setModalCliente(false)} isSaving={actualizarCliente.isLoading} />}
      {modalBici && <BicicletaModal bicicleta={null} clientes={[cliente]} clienteFijo={cliente} onSubmit={(datos) => crearBicicleta.mutate(datos)} onClose={() => setModalBici(false)} isSaving={crearBicicleta.isLoading} />}
    </div>
  )
}
