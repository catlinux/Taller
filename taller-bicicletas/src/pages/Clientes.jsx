import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import ClienteModal from '../components/ClienteModal.jsx'
import DataTable from '../components/DataTable.jsx'
import { IconBuscar, IconEditar, IconMas, IconPapelera } from '../components/Icons.jsx'
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api.js'
import { exportarExcel, fechaFichero } from '../lib/exportarExcel.js'
import { coincideTexto } from '../lib/texto.js'

export default function Clientes() {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [clienteEditando, setClienteEditando] = useState(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')
  const [exportando, setExportando] = useState(false)

  const { data: clientes = [], isLoading, error } = useQuery(['clientes'], () => apiGet('/api/clientes', token), { enabled: Boolean(token) })
  const refrescar = () => queryClient.invalidateQueries(['clientes'])
  const crear = useMutation((datos) => apiPost('/api/clientes', token, datos), {
    onSuccess: () => { refrescar(); cerrarModal() }, onError: (e) => setErrorAccion(e.message),
  })
  const actualizar = useMutation(({ id, datos }) => apiPut(`/api/clientes/${id}`, token, datos), {
    onSuccess: () => { refrescar(); cerrarModal() }, onError: (e) => setErrorAccion(e.message),
  })
  const eliminar = useMutation((cliente) => apiDelete(`/api/clientes/${cliente.id}`, token), {
    onSuccess: refrescar, onError: (e) => setErrorAccion(e.message),
  })
  function cerrarModal() { setModalAbierto(false); setClienteEditando(null); setErrorAccion('') }

  const filtrados = useMemo(() => {
    const termino = search.trim()
    if (!termino) return clientes
    return clientes.filter((cliente) => coincideTexto([cliente.nombre, cliente.apellidos, cliente.email, cliente.telefono], termino))
  }, [clientes, search])

  function abrirCrear() { setClienteEditando(null); setErrorAccion(''); setModalAbierto(true) }
  function abrirEditar(cliente) { setClienteEditando(cliente); setErrorAccion(''); setModalAbierto(true) }
  function guardar(datos) {
    setErrorAccion('')
    if (clienteEditando) actualizar.mutate({ id: clienteEditando.id, datos })
    else crear.mutate(datos)
  }
  function confirmarEliminar(cliente) {
    if (window.confirm(`¿Seguro que quieres eliminar a ${cliente.nombre}${cliente.apellidos ? ` ${cliente.apellidos}` : ''}?`)) {
      setErrorAccion('')
      eliminar.mutate(cliente)
    }
  }
  const guardando = crear.isLoading || actualizar.isLoading

  // Exporta a Excel los clientes que coinciden con la búsqueda actual.
  async function alExportar() {
    setErrorAccion('')
    setExportando(true)
    try {
      await exportarExcel(`clientes-${fechaFichero()}.xlsx`, [
        {
          nombre: 'Clientes',
          columnas: [
            { titulo: 'N.º', valor: (c) => c.numeroCliente ?? '', ancho: 8 },
            { titulo: 'Nombre', valor: (c) => c.nombre ?? '', ancho: 20 },
            { titulo: 'Apellidos', valor: (c) => c.apellidos ?? '', ancho: 24 },
            { titulo: 'DNI', valor: (c) => c.dni ?? '', ancho: 12 },
            { titulo: 'Dirección', valor: (c) => c.direccion ?? '', ancho: 32 },
            { titulo: 'CP', valor: (c) => c.codigoPostal ?? '', ancho: 8 },
            { titulo: 'Población', valor: (c) => c.poblacion ?? '', ancho: 20 },
            { titulo: 'Provincia', valor: (c) => c.provincia ?? '', ancho: 16 },
            { titulo: 'Teléfono', valor: (c) => c.telefono ?? '', ancho: 16 },
            { titulo: 'Correo', valor: (c) => c.email ?? '', ancho: 28 },
          ],
          filas: filtrados,
        },
      ])
    } catch (e) {
      setErrorAccion(e.message)
    } finally {
      setExportando(false)
    }
  }

  const columnas = [
    { clave: 'numero', titulo: 'Nº cliente', title: 'Número de cliente', ancho: '110px', alinear: 'izq', tipo: 'numero', valor: (c) => c.numeroCliente, clase: 'text-slate-400' },
    {
      clave: 'cliente',
      titulo: 'Nombre cliente',
      ancho: '30%',
      valor: (c) => `${c.nombre ?? ''} ${c.apellidos ?? ''}`.trim(),
      render: (c) => (
        <Link to={`/clientes/${c.id}`} title={`${c.nombre ?? ''} ${c.apellidos ?? ''}`.trim()} className="block truncate font-medium text-white hover:text-azul-300">
          {c.nombre}{c.apellidos ? ` ${c.apellidos}` : ''}
        </Link>
      ),
    },
    { clave: 'telefono', titulo: 'Teléfono', ancho: '140px', valor: (c) => c.telefono, clase: 'text-slate-400' },
    { clave: 'direccion', titulo: 'Dirección', ancho: '24%', valor: (c) => c.direccion, clase: 'text-slate-400' },
    { clave: 'codigoPostal', titulo: 'CP', title: 'Código postal', ancho: '90px', valor: (c) => c.codigoPostal, clase: 'text-slate-400' },
    { clave: 'poblacion', titulo: 'Población', ancho: '16%', valor: (c) => c.poblacion, clase: 'text-slate-400' },
    { clave: 'email', titulo: 'Email', ancho: '22%', valor: (c) => c.email, clase: 'text-slate-400' },
  ]

  const acciones = (cliente) => (
    <>
      <button type="button" onClick={() => abrirEditar(cliente)} title="Editar" aria-label={`Editar ${cliente.nombre}`} className="btn-ghost px-2 py-1.5 text-azul-300">
        <IconEditar size={16} />
      </button>
      <button type="button" disabled={eliminar.isLoading} onClick={() => confirmarEliminar(cliente)} title="Eliminar" aria-label={`Eliminar ${cliente.nombre}`} className="btn-ghost px-2 py-1.5 text-rose-300 disabled:opacity-50">
        <IconPapelera size={16} />
      </button>
    </>
  )

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm text-azul-300">Gestión</p><h1 className="mt-1 text-3xl font-bold">Clientes</h1><p className="mt-2 text-slate-400">Consulta y administra los clientes del taller.</p></div>
        <div className="flex flex-wrap gap-3">
          <button onClick={alExportar} disabled={exportando || isLoading} className="btn-secondary">{exportando ? 'Exportando…' : 'Exportar Excel'}</button>
          <button onClick={abrirCrear} className="btn-primary"><IconMas size={18} /> Nuevo cliente</button>
        </div>
      </div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-md">
          <span className="sr-only">Buscar clientes</span>
          <IconBuscar size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, email o teléfono…" className="input pl-10" />
        </label>
        <p className="text-sm text-slate-500">{filtrados.length} {filtrados.length === 1 ? 'cliente' : 'clientes'}</p>
      </div>

      {errorAccion && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorAccion}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error.message}</p>}
      <DataTable
        columnas={columnas}
        filas={filtrados}
        claveFila={(c) => c.id}
        ordenInicial={{ clave: 'cliente', dir: 'asc' }}
        acciones={acciones}
        cargando={isLoading}
        etiquetaPlural="clientes"
        claveReinicio={search}
        vacio={search ? 'No hay clientes que coincidan con la búsqueda.' : 'Todavía no hay clientes registrados.'}
      />
      {modalAbierto && <ClienteModal cliente={clienteEditando} onSubmit={guardar} onClose={cerrarModal} isSaving={guardando} />}
    </div>
  )
}

