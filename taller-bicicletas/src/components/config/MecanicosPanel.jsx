import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useAuth } from '../../context/AuthContext.jsx'
import DataTable from '../DataTable.jsx'
import { IconMas } from '../Icons.jsx'
import { apiDelete, apiGet, apiPost, apiPut } from '../../lib/api.js'

// Modal de alta y edición de mecánicos: solo un campo de nombre.
function ModalMecanico({ mecanico, onSubmit, onClose, guardando }) {
  const [nombre, setNombre] = useState(mecanico?.nombre ?? '')

  function handleSubmit(event) {
    event.preventDefault()
    const limpio = nombre.trim()
    if (!limpio) return
    onSubmit(limpio)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="mecanico-modal-title" className="my-auto w-full max-w-md rounded-2xl border border-antracita-700 bg-antracita-800 p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 id="mecanico-modal-title" className="text-xl font-semibold">{mecanico ? 'Editar mecánico' : 'Nuevo mecánico'}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg px-3 py-2 text-slate-400 hover:bg-antracita-700 hover:text-white">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="label">Nombre</span>
            <input value={nombre} onChange={(event) => setNombre(event.target.value)} className="input mt-1.5" autoFocus />
          </label>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={guardando || !nombre.trim()} className="btn-primary">{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}


// Listado y gestión de mecánicos. Todos los usuarios ven la lista; solo los
// administradores pueden crear, renombrar, activar/desactivar y eliminar.
export default function MecanicosPanel() {
  const { token, user } = useAuth()
  const esAdmin = user?.rol === 'admin'
  const queryClient = useQueryClient()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState(null)
  const [errorAccion, setErrorAccion] = useState('')

  const { data: mecanicos = [], isLoading, error } = useQuery(
    ['mecanicos', 'todos'],
    () => apiGet('/api/mecanicos?todos=1', token),
    { enabled: Boolean(token) },
  )
  const refrescar = () => queryClient.invalidateQueries(['mecanicos'])

  const crear = useMutation((datos) => apiPost('/api/mecanicos', token, datos), {
    onSuccess: () => { refrescar(); cerrarModal() },
    onError: (e) => setErrorAccion(e.message),
  })
  const actualizar = useMutation(({ id, datos }) => apiPut(`/api/mecanicos/${id}`, token, datos), {
    onSuccess: () => { refrescar(); cerrarModal() },
    onError: (e) => setErrorAccion(e.message),
  })
  const cambiarActivo = useMutation(({ id, activo }) => apiPut(`/api/mecanicos/${id}`, token, { activo }), {
    onSuccess: refrescar,
    onError: (e) => setErrorAccion(e.message),
  })
  const eliminar = useMutation((id) => apiDelete(`/api/mecanicos/${id}`, token), {
    onSuccess: refrescar,
    onError: (e) => setErrorAccion(e.message),
  })

  function cerrarModal() { setModalAbierto(false); setEditando(null) }
  function abrirCrear() { setErrorAccion(''); setEditando(null); setModalAbierto(true) }
  function abrirEditar(mecanico) { setErrorAccion(''); setEditando(mecanico); setModalAbierto(true) }

  function guardar(nombre) {
    setErrorAccion('')
    if (editando) actualizar.mutate({ id: editando.id, datos: { nombre } })
    else crear.mutate({ nombre })
  }

  function confirmarDesactivar(mecanico) {
    if (window.confirm(`¿Seguro que quieres desactivar al mecánico ${mecanico.nombre}?`)) {
      setErrorAccion('')
      cambiarActivo.mutate({ id: mecanico.id, activo: false })
    }
  }

  function reactivar(mecanico) {
    setErrorAccion('')
    cambiarActivo.mutate({ id: mecanico.id, activo: true })
  }

  function confirmarEliminar(mecanico) {
    if (window.confirm(`¿Seguro que quieres eliminar al mecánico ${mecanico.nombre}?`)) {
      setErrorAccion('')
      eliminar.mutate(mecanico.id)
    }
  }

  const guardando = crear.isLoading || actualizar.isLoading

  const columnas = [
    { clave: 'nombre', titulo: 'Nombre', ancho: '50%', valor: (m) => m.nombre, clase: 'font-medium text-white' },
    {
      clave: 'activo', titulo: 'Estado', ancho: '160px', valor: (m) => (m.activo ? 'Activo' : 'Inactivo'),
      render: (m) => <span className={`badge ${m.activo ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-500/10 text-slate-400'}`}>{m.activo ? 'Activo' : 'Inactivo'}</span>,
    },
  ]

  const acciones = (mecanico) => (
    <>
      <button type="button" onClick={() => abrirEditar(mecanico)} className="rounded-md px-3 py-1.5 text-azul-300 hover:bg-azul-500/10">Editar</button>
      {mecanico.activo
        ? <button type="button" disabled={cambiarActivo.isLoading} onClick={() => confirmarDesactivar(mecanico)} className="rounded-md px-3 py-1.5 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">Desactivar</button>
        : <button type="button" disabled={cambiarActivo.isLoading} onClick={() => reactivar(mecanico)} className="rounded-md px-3 py-1.5 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">Activar</button>}
      <button type="button" disabled={eliminar.isLoading} onClick={() => confirmarEliminar(mecanico)} className="rounded-md px-3 py-1.5 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">Eliminar</button>
    </>
  )

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-400">Mecánicos asignables a las órdenes. {esAdmin ? 'Puedes crearlos, renombrarlos, desactivarlos y eliminarlos.' : 'Solo un administrador puede modificarlos.'}</p>
        {esAdmin && <button onClick={abrirCrear} className="btn-primary"><IconMas size={18} /> Nuevo mecánico</button>}
      </div>

      {errorAccion && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorAccion}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error.message}</p>}

      <DataTable
        columnas={columnas}
        filas={mecanicos}
        claveFila={(m) => m.id}
        ordenInicial={{ clave: 'nombre', dir: 'asc' }}
        acciones={esAdmin ? acciones : undefined}
        cargando={isLoading}
        etiquetaPlural="mecánicos"
        vacio="Todavía no hay mecánicos registrados."
      />

      {modalAbierto && <ModalMecanico mecanico={editando} onSubmit={guardar} onClose={cerrarModal} guardando={guardando} />}
    </div>
  )
}
