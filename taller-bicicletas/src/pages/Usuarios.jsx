import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useAuth } from '../context/AuthContext.jsx'
import DataTable from '../components/DataTable.jsx'
import { apiGet, apiPost, apiPut } from '../lib/api.js'

// Formatea una fecha ISO en dd/mm/aaaa
function formatearFecha(valor) {
  if (!valor) return '—'
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const inputClass = 'mt-1.5 w-full rounded-lg border border-antracita-600 bg-antracita-900 px-3 py-2.5 text-white outline-none focus:border-azul-400'

// Modal de alta y edición de usuarios. En alta recoge usuario, nombre, contraseña
// (y su repetición) y rol; en edición permite nombre, rol, estado activo y el
// cambio opcional de contraseña.
function UsuarioModal({ usuario, onSubmit, onClose, isSaving }) {
  const esEdicion = Boolean(usuario)
  const [error, setError] = useState('')
  const [cambiarPassword, setCambiarPassword] = useState(false)

  function handleSubmit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const nombre = String(form.get('nombre') ?? '').trim()
    const rol = form.get('rol')
    if (!nombre) return setError('El nombre es obligatorio.')

    if (esEdicion) {
      const datos = { nombre, rol, activo: form.get('activo') === 'on' }
      if (cambiarPassword) {
        const password = String(form.get('password') ?? '')
        const repetir = String(form.get('repetir') ?? '')
        if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
        if (password !== repetir) return setError('Las contraseñas no coinciden.')
        datos.password = password
      }
      setError('')
      return onSubmit(datos)
    }

    const username = String(form.get('usuario') ?? '').trim()
    const password = String(form.get('password') ?? '')
    const repetir = String(form.get('repetir') ?? '')
    if (!username) return setError('El usuario es obligatorio.')
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (password !== repetir) return setError('Las contraseñas no coinciden.')
    setError('')
    onSubmit({ username, password, nombre, rol })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="usuario-modal-title" className="my-auto w-full max-w-xl rounded-2xl border border-antracita-700 bg-antracita-800 p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 id="usuario-modal-title" className="text-xl font-semibold">{esEdicion ? 'Editar usuario' : 'Nuevo usuario'}</h2>
            <p className="mt-1 text-sm text-slate-400">Los campos marcados con * son obligatorios.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg px-3 py-2 text-slate-400 hover:bg-antracita-700 hover:text-white">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {!esEdicion && (
              <label className="block text-sm text-slate-300">Usuario <span className="text-rose-400">*</span><input name="usuario" required autoComplete="off" className={inputClass} /></label>
            )}
            <label className="block text-sm text-slate-300">Nombre <span className="text-rose-400">*</span><input name="nombre" required defaultValue={usuario?.nombre ?? ''} className={inputClass} /></label>
            <label className="block text-sm text-slate-300">Rol <span className="text-rose-400">*</span>
              <select name="rol" defaultValue={usuario?.rol ?? 'mecanico'} className={inputClass}>
                <option value="mecanico">Mecánico</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
            {esEdicion && (
              <label className="flex items-center gap-3 self-end text-sm text-slate-300">
                <input name="activo" type="checkbox" defaultChecked={usuario ? usuario.activo : true} className="h-4 w-4 rounded border-antracita-600 bg-antracita-900 text-azul-500 focus:ring-azul-400" />
                Usuario activo
              </label>
            )}
          </div>
          {esEdicion && (
            <label className="flex items-center gap-3 text-sm text-slate-300">
              <input type="checkbox" checked={cambiarPassword} onChange={(event) => setCambiarPassword(event.target.checked)} className="h-4 w-4 rounded border-antracita-600 bg-antracita-900 text-azul-500 focus:ring-azul-400" />
              Cambiar contraseña
            </label>
          )}
          {(!esEdicion || cambiarPassword) && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-slate-300">Contraseña <span className="text-rose-400">*</span><input name="password" type="password" required autoComplete="new-password" className={inputClass} /></label>
              <label className="block text-sm text-slate-300">Repetir contraseña <span className="text-rose-400">*</span><input name="repetir" type="password" required autoComplete="new-password" className={inputClass} /></label>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-antracita-600 px-4 py-2 text-sm text-slate-300 hover:bg-antracita-700">Cancelar</button>
            <button disabled={isSaving} className="rounded-lg bg-azul-500 px-4 py-2 text-sm font-semibold text-white mantener-blanco hover:bg-azul-600 disabled:opacity-50">{isSaving ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Crear usuario'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default function Usuarios({ embebido = false }) {
  const { token, user } = useAuth()
  const queryClient = useQueryClient()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState(null)
  const [errorAccion, setErrorAccion] = useState('')

  const { data: usuarios = [], isLoading, error } = useQuery(['usuarios'], () => apiGet('/api/usuarios', token), { enabled: Boolean(token) })
  const refrescar = () => queryClient.invalidateQueries(['usuarios'])

  // El alta se hace con POST /api/auth/register (crea rol mecánico); si se pide
  // admin, se actualiza el rol justo después con PUT /api/usuarios/:id.
  const crear = useMutation(async ({ rol, ...resto }) => {
    const creado = await apiPost('/api/auth/register', token, resto)
    if (rol === 'admin' && creado?.user?.id) {
      await apiPut(`/api/usuarios/${creado.user.id}`, token, { rol: 'admin' })
    }
    return creado
  }, { onSuccess: () => { refrescar(); cerrarModal() }, onError: (e) => setErrorAccion(e.message) })

  const actualizar = useMutation(({ id, datos }) => apiPut(`/api/usuarios/${id}`, token, datos), {
    onSuccess: () => { refrescar(); cerrarModal() }, onError: (e) => setErrorAccion(e.message),
  })

  const cambiarActivo = useMutation(({ id, activo }) => apiPut(`/api/usuarios/${id}`, token, { activo }), {
    onSuccess: refrescar, onError: (e) => setErrorAccion(e.message),
  })

  function cerrarModal() { setModalAbierto(false); setUsuarioEditando(null); setErrorAccion('') }
  function abrirCrear() { setUsuarioEditando(null); setErrorAccion(''); setModalAbierto(true) }
  function abrirEditar(usuario) { setUsuarioEditando(usuario); setErrorAccion(''); setModalAbierto(true) }
  function guardar(datos) {
    setErrorAccion('')
    if (usuarioEditando) actualizar.mutate({ id: usuarioEditando.id, datos })
    else crear.mutate(datos)
  }
  function confirmarDesactivar(usuario) {
    if (window.confirm(`¿Seguro que quieres desactivar al usuario ${usuario.nombre}?`)) {
      setErrorAccion('')
      cambiarActivo.mutate({ id: usuario.id, activo: false })
    }
  }
  function reactivar(usuario) {
    setErrorAccion('')
    cambiarActivo.mutate({ id: usuario.id, activo: true })
  }
  const guardando = crear.isLoading || actualizar.isLoading

  const columnas = [
    { clave: 'username', titulo: 'Usuario', ancho: '120px', valor: (usuario) => usuario.username, clase: 'font-medium text-white' },
    { clave: 'nombre', titulo: 'Nombre', ancho: '140px', valor: (usuario) => usuario.nombre, clase: 'text-slate-400' },
    {
      clave: 'rol', titulo: 'Rol', ancho: '120px',
      valor: (usuario) => (usuario.rol === 'admin' ? 'Administrador' : 'Mecánico'),
      render: (usuario) => (usuario.rol === 'admin'
        ? <span className="rounded-full bg-azul-500/10 px-3 py-1 text-xs font-medium text-azul-300">Administrador</span>
        : <span className="rounded-full bg-naranja-500/10 px-3 py-1 text-xs font-medium text-naranja-300">Mecánico</span>),
    },
    {
      clave: 'activo', titulo: 'Estado', ancho: '95px',
      valor: (usuario) => (usuario.activo ? 'Activo' : 'Inactivo'),
      render: (usuario) => (usuario.activo
        ? <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">Activo</span>
        : <span className="rounded-full bg-slate-500/10 px-3 py-1 text-xs font-medium text-slate-400">Inactivo</span>),
    },
    {
      clave: 'createdAt', titulo: 'Fecha de alta', ancho: '125px', tipo: 'fecha',
      valor: (usuario) => usuario.createdAt,
      render: (usuario) => <span className="block truncate text-slate-400">{formatearFecha(usuario.createdAt)}</span>,
    },
  ]

  const acciones = (usuario) => {
    const esPropio = usuario.id === user?.id
    return (
      <>
        <button type="button" onClick={() => abrirEditar(usuario)} className="rounded-md px-3 py-1.5 text-azul-300 hover:bg-azul-500/10">Editar</button>
        {!esPropio && (usuario.activo
          ? <button type="button" disabled={cambiarActivo.isLoading} onClick={() => confirmarDesactivar(usuario)} className="rounded-md px-3 py-1.5 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">Desactivar</button>
          : <button type="button" disabled={cambiarActivo.isLoading} onClick={() => reactivar(usuario)} className="rounded-md px-3 py-1.5 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">Reactivar</button>)}
      </>
    )
  }

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {!embebido && <div><p className="text-sm text-azul-300">Administración</p><h1 className="mt-1 text-3xl font-bold">Usuarios</h1><p className="mt-2 text-slate-400">Gestiona los usuarios del taller, sus roles y su acceso.</p></div>}
        <button onClick={abrirCrear} className="rounded-lg bg-azul-500 px-4 py-2.5 text-sm font-semibold text-white mantener-blanco hover:bg-azul-600">+ Nuevo usuario</button>
      </div>

      {errorAccion && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorAccion}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error.message}</p>}
      <DataTable
        columnas={columnas}
        filas={usuarios}
        claveFila={(usuario) => usuario.id}
        ordenInicial={{ clave: 'username', dir: 'asc' }}
        acciones={acciones}
        cargando={isLoading}
        etiquetaPlural="usuarios"
        anchoAcciones={190}
        vacio="Todavía no hay usuarios registrados."
      />
      {modalAbierto && <UsuarioModal usuario={usuarioEditando} onSubmit={guardar} onClose={cerrarModal} isSaving={guardando} />}
    </div>
  )
}
