import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import BicicletaModal from '../components/BicicletaModal.jsx'
import DataTable from '../components/DataTable.jsx'
import { IconBuscar, IconEditar, IconMas, IconPapelera } from '../components/Icons.jsx'
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api.js'

export default function Bicicletas() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [bicicletaEditando, setBicicletaEditando] = useState(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')
  const { data: bicicletas = [], isLoading, error } = useQuery(['bicicletas'], () => apiGet('/api/bicicletas', token), { enabled: Boolean(token) })
  const { data: clientes = [], error: errorClientes } = useQuery(['clientes'], () => apiGet('/api/clientes', token), { enabled: Boolean(token) })
  const refrescar = () => queryClient.invalidateQueries(['bicicletas'])
  const crear = useMutation((datos) => apiPost('/api/bicicletas', token, datos), { onSuccess: () => { refrescar(); cerrarModal() }, onError: (e) => setErrorAccion(e.message) })
  const actualizar = useMutation(({ id, datos }) => apiPut(`/api/bicicletas/${id}`, token, datos), { onSuccess: () => { refrescar(); cerrarModal() }, onError: (e) => setErrorAccion(e.message) })
  const eliminar = useMutation((bicicleta) => apiDelete(`/api/bicicletas/${bicicleta.id}`, token), { onSuccess: refrescar, onError: (e) => setErrorAccion(e.message) })
  function cerrarModal() { setModalAbierto(false); setBicicletaEditando(null); setErrorAccion('') }
  const filtrados = useMemo(() => {
    const termino = search.trim().toLocaleLowerCase()
    return bicicletas.filter((b) => (!clienteId || String(b.clienteId) === clienteId) && (!termino || [b.marca, b.modelo, b.numeroSerie].some((v) => v?.toLocaleLowerCase().includes(termino))))
  }, [bicicletas, search, clienteId])
  function guardar(datos) { setErrorAccion(''); if (bicicletaEditando) actualizar.mutate({ id: bicicletaEditando.id, datos }); else crear.mutate(datos) }
  function confirmarEliminar(bicicleta) { if (window.confirm(`¿Seguro que quieres eliminar la bicicleta ${bicicleta.marca} ${bicicleta.modelo}?`)) { setErrorAccion(''); eliminar.mutate(bicicleta) } }
  function abrir(bicicleta = null) { setBicicletaEditando(bicicleta); setErrorAccion(''); setModalAbierto(true) }
  const guardando = crear.isLoading || actualizar.isLoading

  // Nombre completo del cliente al que pertenece una bicicleta.
  function nombreCliente(bicicleta) {
    if (bicicleta.cliente) return `${bicicleta.cliente.nombre} ${bicicleta.cliente.apellidos || ''}`.trim()
    const cliente = clientes.find((c) => c.id === bicicleta.clienteId)
    return cliente ? `${cliente.nombre} ${cliente.apellidos || ''}`.trim() : ''
  }

  const columnas = [
    { clave: 'cliente', titulo: 'Cliente', ancho: '24%', valor: (b) => nombreCliente(b), clase: 'text-slate-400' },
    { clave: 'marca', titulo: 'Marca', ancho: '16%', valor: (b) => b.marca },
    { clave: 'modelo', titulo: 'Modelo', ancho: '18%', valor: (b) => b.modelo },
    { clave: 'tipo', titulo: 'Tipo', ancho: '140px', valor: (b) => b.tipo, render: (b) => <span className="badge bg-azul-500/10 text-azul-300">{b.tipo || '—'}</span> },
    { clave: 'numeroSerie', titulo: 'N.º de serie', ancho: '180px', valor: (b) => b.numeroSerie, clase: 'text-slate-400' },
    { clave: 'anio', titulo: 'Año', ancho: '80px', alinear: 'der', tipo: 'numero', valor: (b) => b.anio, clase: 'text-slate-400' },
  ]

  const acciones = (b) => (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); abrir(b) }} title="Editar" aria-label={`Editar ${b.marca} ${b.modelo}`} className="btn-ghost px-2 py-1.5 text-azul-300">
        <IconEditar size={16} />
      </button>
      <button type="button" disabled={eliminar.isLoading} onClick={(e) => { e.stopPropagation(); confirmarEliminar(b) }} title="Eliminar" aria-label={`Eliminar ${b.marca} ${b.modelo}`} className="btn-ghost px-2 py-1.5 text-rose-300 disabled:opacity-50">
        <IconPapelera size={16} />
      </button>
    </>
  )

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm text-azul-300">Gestión</p><h1 className="mt-1 text-3xl font-bold">Bicicletas</h1><p className="mt-2 text-slate-400">Consulta y administra las bicicletas del taller.</p></div>
        <button onClick={() => abrir()} className="btn-primary"><IconMas size={18} /> Nueva bicicleta</button>
      </div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-md">
          <span className="sr-only">Buscar bicicletas</span>
          <IconBuscar size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por marca, modelo o número de serie…" className="input pl-10" />
        </label>
        <select aria-label="Filtrar por cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="input sm:max-w-xs">
          <option value="">Todos los clientes</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.numeroCliente ? `#${c.numeroCliente} · ` : ''}{c.nombre} {c.apellidos}</option>)}
        </select>
        <p className="text-sm text-slate-500">{filtrados.length} {filtrados.length === 1 ? 'bicicleta' : 'bicicletas'}</p>
      </div>
      {(errorAccion || error || errorClientes) && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorAccion || error?.message || errorClientes?.message}</p>}
      <DataTable
        columnas={columnas}
        filas={filtrados}
        claveFila={(b) => b.id}
        ordenInicial={{ clave: 'marca', dir: 'asc' }}
        onFila={(b) => navigate(`/bicicletas/${b.id}`)}
        acciones={acciones}
        cargando={isLoading}
        etiquetaPlural="bicicletas"
        claveReinicio={`${search}|${clienteId}`}
        vacio={search || clienteId ? 'No hay bicicletas que coincidan con los filtros.' : 'Todavía no hay bicicletas registradas.'}
      />
      {modalAbierto && <BicicletaModal bicicleta={bicicletaEditando} clientes={clientes} onSubmit={guardar} onClose={cerrarModal} isSaving={guardando} />}
    </div>
  )
}

