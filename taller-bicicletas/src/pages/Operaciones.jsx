import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useAuth } from '../context/AuthContext.jsx'
import { useDeshacer } from '../context/DeshacerContext.jsx'
import OperacionModal from '../components/OperacionModal.jsx'
import DataTable from '../components/DataTable.jsx'
import { IconBuscar, IconEditar, IconMas, IconPapelera } from '../components/Icons.jsx'
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api.js'
import { coincideTexto } from '../lib/texto.js'
import { formatearMinutos, horasAMinutos } from '../lib/tiempos.js'

// Valor del desplegable de categorías para las operaciones sin categoría.
const SIN_CATEGORIA = '__sin__'

// Lista de tiempos (en minutos) que se muestran para una operación: sus tiempos
// alternativos o, si no tiene ninguno, el tiempo por defecto (en horas).
function tiemposOperacion(operacion) {
  const tiempos = Array.isArray(operacion.tiempos) ? operacion.tiempos : []
  return tiempos.length > 0 ? tiempos : [horasAMinutos(operacion.tiempoDefecto)]
}

export default function Operaciones({ embebido = false }) {
  const { token, user } = useAuth()
  const esAdmin = user?.rol === 'admin'
  const { mostrarDeshacer } = useDeshacer()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [categoria, setCategoria] = useState('')
  const [mostrarInactivas, setMostrarInactivas] = useState(false)
  const [operacionEditando, setOperacionEditando] = useState(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')

  // ?todas=1 incluye las inactivas (para poder verlas y reactivarlas).
  const { data: operaciones = [], isLoading, error } = useQuery(
    ['operaciones', mostrarInactivas],
    () => apiGet(`/api/operaciones${mostrarInactivas ? '?todas=1' : ''}`, token),
    { enabled: Boolean(token) },
  )
  const refrescar = () => queryClient.invalidateQueries(['operaciones'])
  const crear = useMutation((datos) => apiPost('/api/operaciones', token, datos), {
    onSuccess: () => { refrescar(); cerrarModal() }, onError: (e) => setErrorAccion(e.message),
  })
  const actualizar = useMutation(({ id, datos }) => apiPut(`/api/operaciones/${id}`, token, datos), {
    onSuccess: () => { refrescar(); cerrarModal() }, onError: (e) => setErrorAccion(e.message),
  })
  const cambiarActivo = useMutation(({ id, activo }) => apiPut(`/api/operaciones/${id}`, token, { activo }), {
    onSuccess: refrescar, onError: (e) => setErrorAccion(e.message),
  })
  const eliminar = useMutation((operacion) => apiDelete(`/api/operaciones/${operacion.id}`, token), {
    onSuccess: (resultado, operacion) => {
      refrescar()
      mostrarDeshacer({
        descripcion: `la operación ${operacion.codigo}`,
        papeleraId: resultado?.papeleraId,
        onRestaurar: refrescar,
      })
    },
    onError: (e) => setErrorAccion(e.message),
  })
  function cerrarModal() { setModalAbierto(false); setOperacionEditando(null); setErrorAccion('') }

  // Categorías existentes (sin repetir) para el filtro y el desplegable del formulario.
  const categorias = useMemo(() => {
    const conjunto = new Set()
    for (const operacion of operaciones) if (operacion.categoria) conjunto.add(operacion.categoria)
    return [...conjunto].sort((a, b) => a.localeCompare(b, 'es'))
  }, [operaciones])

  const filtradas = useMemo(() => {
    const termino = search.trim()
    return operaciones.filter((operacion) => {
      if (categoria === SIN_CATEGORIA) { if (operacion.categoria) return false }
      else if (categoria && operacion.categoria !== categoria) return false
      return !termino || coincideTexto([operacion.codigo, operacion.descripcion, operacion.categoria], termino)
    })
  }, [operaciones, search, categoria])

  function abrirCrear() { setOperacionEditando(null); setErrorAccion(''); setModalAbierto(true) }
  function abrirEditar(operacion) { setOperacionEditando(operacion); setErrorAccion(''); setModalAbierto(true) }
  function guardar(datos) {
    setErrorAccion('')
    if (operacionEditando) actualizar.mutate({ id: operacionEditando.id, datos })
    else crear.mutate(datos)
  }
  function confirmarEliminar(operacion) {
    if (window.confirm(`¿Seguro que quieres eliminar la operación ${operacion.codigo}? Podrás deshacerlo desde la papelera.`)) {
      setErrorAccion('')
      eliminar.mutate(operacion)
    }
  }
  function alternarActivo(operacion) {
    setErrorAccion('')
    cambiarActivo.mutate({ id: operacion.id, activo: !operacion.activo })
  }
  const guardando = crear.isLoading || actualizar.isLoading

  const columnas = [
    { clave: 'codigo', titulo: 'Código', ancho: '100px', valor: (o) => o.codigo, clase: 'font-medium text-white' },
    { clave: 'descripcion', titulo: 'Descripción', ancho: '300px', valor: (o) => o.descripcion, clase: 'text-slate-400' },
    {
      clave: 'categoria', titulo: 'Categoría', ancho: '140px',
      valor: (o) => o.categoria || '',
      render: (o) => <span className="block truncate text-slate-400">{o.categoria || '—'}</span>,
    },
    {
      clave: 'tiempos', titulo: 'Tiempos (H:MM)', ancho: '170px',
      valor: (o) => tiemposOperacion(o)[0],
      render: (o) => (
        <span className="block whitespace-nowrap text-slate-400">
          {tiemposOperacion(o).map((min, i) => (
            <span key={i}>{i > 0 && ' · '}<span className={i === 0 ? 'font-semibold text-white' : ''}>{formatearMinutos(min)}</span></span>
          ))}
        </span>
      ),
    },
    {
      clave: 'precioHoraDefecto', titulo: 'Precio/hora', ancho: '110px', tipo: 'numero', alinear: 'der',
      valor: (o) => o.precioHoraDefecto,
      render: (o) => <span className="block truncate text-slate-400">{Number(o.precioHoraDefecto).toFixed(2)} €</span>,
    },
    {
      clave: 'activo', titulo: 'Activo', ancho: '80px',
      valor: (o) => (o.activo ? 'Sí' : 'No'),
      render: (o) => <span className={`badge ${o.activo ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-500/10 text-slate-400'}`}>{o.activo ? 'Sí' : 'No'}</span>,
    },
  ]

  const acciones = (operacion) => (
    <>
      <button type="button" onClick={() => abrirEditar(operacion)} title="Editar" aria-label={`Editar ${operacion.codigo}`} className="btn-ghost px-2 py-1.5 text-azul-300">
        <IconEditar size={16} />
      </button>
      <button type="button" disabled={cambiarActivo.isLoading} onClick={() => alternarActivo(operacion)} title={operacion.activo ? 'Desactivar' : 'Activar'} aria-label={`${operacion.activo ? 'Desactivar' : 'Activar'} ${operacion.codigo}`} className={`btn-ghost px-2 py-1.5 text-xs disabled:opacity-50 ${operacion.activo ? 'text-naranja-300' : 'text-emerald-300'}`}>
        {operacion.activo ? 'Desactivar' : 'Activar'}
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
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="relative block w-full sm:max-w-xs">
            <span className="sr-only">Buscar operaciones</span>
            <IconBuscar size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código o descripción…" className="input pl-10" />
          </label>
          <label className="block">
            <span className="sr-only">Filtrar por categoría</span>
            <select value={categoria} onChange={(event) => setCategoria(event.target.value)} className="rounded-lg border border-antracita-600 bg-antracita-900 px-3 py-2.5 text-white outline-none focus:border-azul-400">
              <option value="">Todas las categorías</option>
              {categorias.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}
              <option value={SIN_CATEGORIA}>Sin categoría</option>
            </select>
          </label>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-300">
            <input type="checkbox" checked={mostrarInactivas} onChange={(event) => setMostrarInactivas(event.target.checked)} className="h-4 w-4 rounded border-antracita-600 bg-antracita-900 text-azul-500 focus:ring-azul-400" />
            Mostrar inactivas
          </label>
        </div>
        <p className="text-sm text-slate-500">{filtradas.length} {filtradas.length === 1 ? 'operación' : 'operaciones'}</p>
      </div>

      {errorAccion && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorAccion}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error.message}</p>}
      <DataTable
        columnas={columnas}
        filas={filtradas}
        claveFila={(o) => o.id}
        ordenInicial={{ clave: 'categoria', dir: 'asc' }}
        acciones={esAdmin ? acciones : undefined}
        accionesFijas
        anchoAcciones={200}
        cargando={isLoading}
        etiquetaPlural="operaciones"
        claveReinicio={`${search}|${categoria}|${mostrarInactivas}`}
        vacio={search || categoria ? 'No hay operaciones que coincidan con el filtro.' : 'Todavía no hay operaciones registradas.'}
      />
      {modalAbierto && <OperacionModal operacion={operacionEditando} categorias={categorias} onSubmit={guardar} onClose={cerrarModal} isSaving={guardando} />}
    </div>
  )
}
