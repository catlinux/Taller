import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useAuth } from '../../context/AuthContext.jsx'
import DataTable from '../DataTable.jsx'
import { IconPapelera } from '../Icons.jsx'
import { apiDelete, apiGet, apiPost } from '../../lib/api.js'
import { formatearFechaHora } from '../../lib/ordenes.js'

// Etiquetas legibles para cada tipo de entrada de la papelera.
const ETIQUETAS_TIPO = {
  cliente: 'Cliente',
  bicicleta: 'Bicicleta',
  articulo: 'Artículo',
  'articulos-lote': 'Artículos (lote)',
  orden: 'Orden',
  'material-orden': 'Línea de material',
  'mano-obra-orden': 'Línea de mano de obra',
  operacion: 'Operación',
  mecanico: 'Mecánico',
}

// Tipos cuyo borrado original exigía rol de administrador: restaurarlos exige el
// mismo rol (el servidor también lo comprueba; aquí solo se oculta el botón).
const TIPOS_SOLO_ADMIN = ['articulos-lote', 'operacion', 'mecanico']

// Panel de la papelera: lista los elementos eliminados recientemente, permite
// restaurarlos y (solo admin) eliminarlos definitivamente o vaciar la papelera.
export default function PapeleraPanel() {
  const { token, user } = useAuth()
  const esAdmin = user?.rol === 'admin'
  const queryClient = useQueryClient()
  const [errorAccion, setErrorAccion] = useState('')

  const { data, isLoading, error } = useQuery(
    ['papelera'],
    () => apiGet('/api/papelera', token),
    { enabled: Boolean(token) },
  )
  const entradas = data?.entradas ?? []
  const refrescar = () => queryClient.invalidateQueries(['papelera'])

  const restaurar = useMutation((id) => apiPost(`/api/papelera/${id}/restaurar`, token, {}), {
    onSuccess: () => {
      setErrorAccion('')
      refrescar()
    },
    onError: (e) => setErrorAccion(e.message),
  })
  const eliminar = useMutation((id) => apiDelete(`/api/papelera/${id}`, token), {
    onSuccess: () => {
      setErrorAccion('')
      refrescar()
    },
    onError: (e) => setErrorAccion(e.message),
  })
  const vaciar = useMutation(() => apiDelete('/api/papelera', token), {
    onSuccess: () => {
      setErrorAccion('')
      refrescar()
    },
    onError: (e) => setErrorAccion(e.message),
  })

  function confirmarEliminar(entrada) {
    if (window.confirm(`¿Eliminar definitivamente «${entrada.descripcion}»? Esta acción no se puede deshacer.`)) {
      setErrorAccion('')
      eliminar.mutate(entrada.id)
    }
  }

  function confirmarVaciar() {
    if (window.confirm('¿Vaciar la papelera? Todos los elementos se eliminarán definitivamente.')) {
      setErrorAccion('')
      vaciar.mutate()
    }
  }

  const columnas = [
    { clave: 'descripcion', titulo: 'Elemento', ancho: '240px', valor: (e) => e.descripcion, clase: 'font-medium text-white' },
    { clave: 'tipo', titulo: 'Tipo', ancho: '140px', valor: (e) => ETIQUETAS_TIPO[e.tipo] ?? e.tipo, clase: 'text-slate-400' },
    { clave: 'usuario', titulo: 'Eliminado por', ancho: '120px', valor: (e) => e.usuario || '—', clase: 'text-slate-400' },
    {
      clave: 'createdAt', titulo: 'Fecha', ancho: '150px', tipo: 'fecha', valor: (e) => e.createdAt,
      render: (e) => <span className="block truncate text-slate-400">{formatearFechaHora(e.createdAt)}</span>,
    },
  ]

  const acciones = (entrada) => {
    const soloAdmin = TIPOS_SOLO_ADMIN.includes(entrada.tipo)
    const puedeRestaurar = esAdmin || !soloAdmin
    return (
      <>
        {puedeRestaurar && (
          <button
            type="button"
            disabled={restaurar.isLoading}
            onClick={() => { setErrorAccion(''); restaurar.mutate(entrada.id) }}
            className="rounded-md px-3 py-1.5 text-azul-300 hover:bg-azul-500/10 disabled:opacity-50"
          >
            Restaurar
          </button>
        )}
        {esAdmin && (
          <button
            type="button"
            disabled={eliminar.isLoading}
            onClick={() => confirmarEliminar(entrada)}
            className="rounded-md px-3 py-1.5 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
          >
            Eliminar
          </button>
        )}
      </>
    )
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-400">Elementos eliminados recientemente. Puedes restaurarlos para devolverlos a su sitio. La papelera se vacía sola pasado un tiempo.</p>
        {esAdmin && (
          <button
            type="button"
            onClick={confirmarVaciar}
            disabled={vaciar.isLoading || entradas.length === 0}
            className="btn-peligro"
          >
            <IconPapelera size={16} /> {vaciar.isLoading ? 'Vaciando…' : 'Vaciar papelera'}
          </button>
        )}
      </div>

      {errorAccion && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorAccion}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error.message}</p>}

      <DataTable
        columnas={columnas}
        filas={entradas}
        claveFila={(e) => e.id}
        ordenInicial={{ clave: 'createdAt', dir: 'desc' }}
        acciones={acciones}
        anchoAcciones={200}
        cargando={isLoading}
        etiquetaPlural="elementos"
        vacio="La papelera está vacía."
      />
    </div>
  )
}
