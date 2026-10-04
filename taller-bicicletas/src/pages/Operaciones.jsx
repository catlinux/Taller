import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useAuth } from '../context/AuthContext.jsx'
import OperacionModal from '../components/OperacionModal.jsx'
import DataTable from '../components/DataTable.jsx'
import { IconBuscar, IconEditar, IconMas, IconPapelera } from '../components/Icons.jsx'
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api.js'
import { coincideTexto } from '../lib/texto.js'

export default function Operaciones({ embebido = false }) {
  const { token, user } = useAuth()
  const esAdmin = user?.rol === 'admin'
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [operacionEditando, setOperacionEditando] = useState(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')

  const { data: operaciones = [], isLoading, error } = useQuery(['operaciones'], () => apiGet('/api/operaciones?todas=1', token), { enabled: Boolean(token) })
  const refrescar = () => queryClient.invalidateQueries(['operaciones'])
  const crear = useMutation((datos) => apiPost('/api/operaciones', token, datos), {
    onSuccess: () => { refrescar(); cerrarModal() }, onError: (e) => setErrorAccion(e.message),
  })
  const actualizar = useMutation(({ id, datos }) => apiPut(`/api/operaciones/${id}`, token, datos), {
    onSuccess: () => { refrescar(); cerrarModal() }, onError: (e) => setErrorAccion(e.message),
  })
  const eliminar = useMutation((operacion) => apiDelete(`/api/operaciones/${operacion.id}`, token), {
    onSuccess: refrescar, onError: (e) => setErrorAccion(e.message),
  })
  function cerrarModal() { setModalAbierto(false); setOperacionEditando(null); setErrorAccion('') }

  const filtradas = useMemo(() => {
    const termino = search.trim()
    return operaciones.filter((operacion) => !termino || coincideTexto([operacion.codigo, operacion.descripcion], termino))
  }, [operaciones, search])

  function abrirCrear() { setOperacionEditando(null); setErrorAccion(''); setModalAbierto(true) }
  function abrirEditar(operacion) { setOperacionEditando(operacion); setErrorAccion(''); setModalAbierto(true) }
  function guardar(datos) {
    setErrorAccion('')
    if (operacionEditando) actualizar.mutate({ id: operacionEditando.id, datos })
    else crear.mutate(datos)
  }
  function confirmarEliminar(operacion) {
    if (window.confirm(`¿Seguro que quieres eliminar la operación ${operacion.codigo}?`)) {
      setErrorAccion('')
      eliminar.mutate(operacion)
    }
  }
  const guardando = crear.isLoading || actualizar.isLoading

  const columnas = [
    { clave: 'codigo', titulo: 'Código', ancho: '130px', valor: (o) => o.codigo, clase: 'font-medium text-white' },
    { clave: 'descripcion', titulo: 'Descripción', ancho: '45%', valor: (o) => o.descripcion, clase: 'text-slate-400' },
    {
      clave: 'tiempoDefecto', titulo: 'Tiempo (h)', ancho: '110px', tipo: 'numero', alinear: 'der',
      valor: (o) => o.tiempoDefecto,
      render: (o) => <span className="block truncate text-slate-400">{Number(o.tiempoDefecto).toFixed(2)} h</span>,
    },
    {
      clave: 'precioHoraDefecto', titulo: 'Precio/hora', ancho: '120px', tipo: 'numero', alinear: 'der',
      valor: (o) => o.precioHoraDefecto,
      render: (o) => <span className="block truncate text-slate-400">{Number(o.precioHoraDefecto).toFixed(2)} €</span>,
    },
    {
      clave: 'activo', titulo: 'Activo', ancho: '90px',
      valor: (o) => (o.activo ? 'Sí' : 'No'),
      render: (o) => <span className={`badge ${o.activo ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-500/10 text-slate-400'}`}>{o.activo ? 'Sí' : 'No'}</span>,
    },
  ]

  const acciones = (operacion) => (
    <>
      <button type="button" onClick={() => abrirEditar(operacion)} title="Editar" aria-label={`Editar ${operacion.codigo}`} className="btn-ghost px-2 py-1.5 text-azul-300">
        <IconEditar size={16} />
      </button>
      <button type="button" disabled={eliminar.isLoading} onClick={() => confirmarEliminar(operacion)} title="Eliminar" aria-label={`Eliminar ${operacion.codigo}`} className="btn-ghost px-2 py-1.5 text-rose-300 disabled:opacity-50">
        <IconPapelera size={16} />
      </button>
    </>
  )

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {!embebido && <div><p className="text-sm text-azul-300">Gestión</p><h1 className="mt-1 text-3xl font-bold">Operaciones</h1><p className="mt-2 text-slate-400">Consulta y administra el catálogo de operaciones de mano de obra.</p></div>}
        {esAdmin && <button onClick={abrirCrear} className="btn-primary"><IconMas size={18} /> Nueva operación</button>}
      </div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-md">
          <span className="sr-only">Buscar operaciones</span>
          <IconBuscar size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código o descripción…" className="input pl-10" />
        </label>
        <p className="text-sm text-slate-500">{filtradas.length} {filtradas.length === 1 ? 'operación' : 'operaciones'}</p>
      </div>

      {errorAccion && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorAccion}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error.message}</p>}
      <DataTable
        columnas={columnas}
        filas={filtradas}
        claveFila={(o) => o.id}
        ordenInicial={{ clave: 'codigo', dir: 'asc' }}
        acciones={esAdmin ? acciones : undefined}
        cargando={isLoading}
        etiquetaPlural="operaciones"
        claveReinicio={search}
        vacio={search ? 'No hay operaciones que coincidan con la búsqueda.' : 'Todavía no hay operaciones registradas.'}
      />
      {modalAbierto && <OperacionModal operacion={operacionEditando} onSubmit={guardar} onClose={cerrarModal} isSaving={guardando} />}
    </div>
  )
}
