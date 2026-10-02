import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useAuth } from '../context/AuthContext.jsx'
import ArticuloModal from '../components/ArticuloModal.jsx'
import DataTable from '../components/DataTable.jsx'
import { IconAjustarStock, IconBuscar, IconEditar, IconMas, IconPapelera } from '../components/Icons.jsx'
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '../lib/api.js'
import { exportarExcel, fechaFichero } from '../lib/exportarExcel.js'

// Modal para ajustar el stock de un artículo: entrada, salida o valor absoluto.
function AjusteStockModal({ articulo, onSubmit, onClose, isSaving }) {
  const [modo, setModo] = useState('sumar')
  const [cantidad, setCantidad] = useState('1')
  const [error, setError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    const texto = String(cantidad).trim()
    const num = Number(texto)
    if (texto === '' || !Number.isFinite(num) || num < 0) {
      setError('Introduce un número válido mayor o igual que 0.')
      return
    }
    setError('')
    if (modo === 'fijar') onSubmit({ stock: num })
    else onSubmit({ cantidad: modo === 'restar' ? -num : num })
  }

  const inputClass = 'input mt-1.5'
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="articulo-stock-title" className="my-auto w-full max-w-md rounded-2xl border border-antracita-700 bg-antracita-800 p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 id="articulo-stock-title" className="text-xl font-semibold">Ajustar stock</h2>
            <p className="mt-1 text-sm text-slate-400">{articulo.referencia} · stock actual: {articulo.stock}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg px-3 py-2 text-slate-400 hover:bg-antracita-700 hover:text-white">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</p>}
          <label className="block text-sm text-slate-300">Operación
            <select value={modo} onChange={(event) => setModo(event.target.value)} className={inputClass}>
              <option value="sumar">Entrada (sumar)</option>
              <option value="restar">Salida (restar)</option>
              <option value="fijar">Fijar valor</option>
            </select>
          </label>
          <label className="block text-sm text-slate-300">Cantidad
            <input type="number" min="0" step="any" value={cantidad} onChange={(event) => setCantidad(event.target.value)} className={inputClass} />
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button disabled={isSaving} className="btn-primary">{isSaving ? 'Aplicando…' : 'Aplicar'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default function Articulos() {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [articuloEditando, setArticuloEditando] = useState(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [articuloAjustando, setArticuloAjustando] = useState(null)
  const [errorAccion, setErrorAccion] = useState('')
  const [exportando, setExportando] = useState(false)

  const { data: articulos = [], isLoading, error } = useQuery(['articulos'], () => apiGet('/api/articulos', token), { enabled: Boolean(token) })
  const refrescar = () => queryClient.invalidateQueries(['articulos'])
  const crear = useMutation((datos) => apiPost('/api/articulos', token, datos), { onSuccess: () => { refrescar(); cerrarModal() }, onError: (e) => setErrorAccion(e.message) })
  const actualizar = useMutation(({ id, datos }) => apiPut(`/api/articulos/${id}`, token, datos), { onSuccess: () => { refrescar(); cerrarModal() }, onError: (e) => setErrorAccion(e.message) })
  const eliminar = useMutation((articulo) => apiDelete(`/api/articulos/${articulo.id}`, token), { onSuccess: refrescar, onError: (e) => setErrorAccion(e.message) })
  const ajustarStock = useMutation(({ id, datos }) => apiPatch(`/api/articulos/${id}/stock`, token, datos), { onSuccess: () => { refrescar(); cerrarAjuste() }, onError: (e) => setErrorAccion(e.message) })
  function cerrarModal() { setModalAbierto(false); setArticuloEditando(null); setErrorAccion('') }
  function cerrarAjuste() { setArticuloAjustando(null); setErrorAccion('') }

  const filtrados = useMemo(() => {
    const termino = search.trim().toLocaleLowerCase()
    return articulos.filter((a) => !termino || [a.referencia, a.descripcion, a.familia, a.proveedor].some((v) => v?.toLocaleLowerCase().includes(termino)))
  }, [articulos, search])

  const columnas = [
    { clave: 'referencia', titulo: 'Referencia', title: 'Referencia: código interno del artículo', ancho: '170px', valor: (a) => a.referencia, clase: 'font-medium text-white' },
    { clave: 'descripcion', titulo: 'Descripción', title: 'Descripción del artículo', ancho: '420px', valor: (a) => a.descripcion, clase: 'text-slate-400' },
    { clave: 'familia', titulo: 'Familia', title: 'Familia o categoría del artículo', ancho: '200px', valor: (a) => a.familia, clase: 'text-slate-400' },
    { clave: 'proveedor', titulo: 'Proveedor', title: 'Proveedor habitual del artículo', ancho: '130px', valor: (a) => a.proveedor, clase: 'text-slate-400' },
    {
      clave: 'precioCompra', titulo: 'Compra', title: 'Precio de compra (sin IVA)', ancho: '130px', tipo: 'numero', alinear: 'der',
      valor: (a) => a.precioCompra,
      render: (a) => <span className="block truncate text-slate-400">{Number(a.precioCompra).toFixed(2)} €</span>,
    },
    {
      clave: 'precioVentaSinIva', titulo: 'Venta s/IVA', title: 'Precio de venta sin IVA (base imponible)', ancho: '130px', tipo: 'numero', alinear: 'der',
      valor: (a) => a.precioVentaSinIva,
      render: (a) => <span className="block truncate text-slate-400">{Number(a.precioVentaSinIva).toFixed(2)} €</span>,
    },
    {
      clave: 'precioVenta', titulo: 'Venta c/IVA', title: 'Precio de venta (con IVA incluido)', ancho: '130px', tipo: 'numero', alinear: 'der',
      valor: (a) => a.precioVenta,
      render: (a) => <span className="block truncate text-slate-400">{Number(a.precioVenta).toFixed(2)} €</span>,
    },
    {
      clave: 'iva', titulo: 'IVA', title: 'Tipo de IVA aplicado (%)', ancho: '80px', tipo: 'numero', alinear: 'der',
      valor: (a) => a.iva,
      render: (a) => <span className="block truncate text-slate-400">{a.iva} %</span>,
    },
    {
      clave: 'stock', titulo: 'Stock', title: 'Unidades disponibles en almacén', ancho: '100px', tipo: 'numero', alinear: 'der',
      valor: (a) => a.stock,
      render: (a) => <span className={`block truncate ${a.stock <= 5 ? 'font-semibold text-naranja-400' : 'text-slate-400'}`}>{a.stock}</span>,
    },
  ]

  const acciones = (articulo) => (
    <>
      <button type="button" onClick={() => abrirEditar(articulo)} title="Editar" aria-label={`Editar ${articulo.referencia}`} className="btn-ghost px-2 py-1.5 text-azul-300">
        <IconEditar size={16} />
      </button>
      <button type="button" onClick={() => abrirAjuste(articulo)} title="Ajustar stock" aria-label={`Ajustar stock de ${articulo.referencia}`} className="btn-ghost px-2 py-1.5 text-amber-300">
        <IconAjustarStock size={16} />
      </button>
      <button type="button" disabled={eliminar.isLoading} onClick={() => confirmarEliminar(articulo)} title="Eliminar" aria-label={`Eliminar ${articulo.referencia}`} className="btn-ghost px-2 py-1.5 text-rose-300 disabled:opacity-50">
        <IconPapelera size={16} />
      </button>
    </>
  )

  function abrirCrear() { setArticuloEditando(null); setErrorAccion(''); setModalAbierto(true) }
  function abrirEditar(articulo) { setArticuloEditando(articulo); setErrorAccion(''); setModalAbierto(true) }
  function guardar(datos) { setErrorAccion(''); if (articuloEditando) actualizar.mutate({ id: articuloEditando.id, datos }); else crear.mutate(datos) }
  function abrirAjuste(articulo) { setArticuloAjustando(articulo); setErrorAccion('') }
  function aplicarAjuste(datos) { setErrorAccion(''); ajustarStock.mutate({ id: articuloAjustando.id, datos }) }
  function confirmarEliminar(articulo) { if (window.confirm(`¿Seguro que quieres eliminar el artículo ${articulo.referencia}?`)) { setErrorAccion(''); eliminar.mutate(articulo) } }
  const guardando = crear.isLoading || actualizar.isLoading

  // Exporta a Excel los artículos que coinciden con la búsqueda actual.
  async function alExportar() {
    setErrorAccion('')
    setExportando(true)
    try {
      await exportarExcel(`articulos-${fechaFichero()}.xlsx`, [
        {
          nombre: 'Artículos',
          columnas: [
            { titulo: 'Referencia', valor: (a) => a.referencia ?? '', ancho: 16 },
            { titulo: 'Descripción', valor: (a) => a.descripcion ?? '', ancho: 40 },
            { titulo: 'Familia', valor: (a) => a.familia ?? '', ancho: 20 },
            { titulo: 'Proveedor', valor: (a) => a.proveedor ?? '', ancho: 22 },
            { titulo: 'Precio compra', valor: (a) => (Number.isFinite(Number(a.precioCompra)) ? Number(a.precioCompra) : 0), ancho: 14 },
            { titulo: 'Precio venta', valor: (a) => (Number.isFinite(Number(a.precioVenta)) ? Number(a.precioVenta) : 0), ancho: 14 },
            { titulo: 'IVA', valor: (a) => (Number.isFinite(Number(a.iva)) ? Number(a.iva) : 0), ancho: 8 },
            { titulo: 'Stock', valor: (a) => (Number.isFinite(Number(a.stock)) ? Number(a.stock) : 0), ancho: 10 },
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


  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm text-azul-300">Gestión</p><h1 className="mt-1 text-3xl font-bold">Artículos</h1><p className="mt-2 text-slate-400">Consulta y administra el catálogo de materiales del taller.</p></div>
        <div className="flex flex-wrap gap-3">
          <button onClick={alExportar} disabled={exportando || isLoading} className="btn-secondary">{exportando ? 'Exportando…' : 'Exportar Excel'}</button>
          <button onClick={abrirCrear} className="btn-primary"><IconMas size={18} /> Nuevo artículo</button>
        </div>
      </div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-md">
          <span className="sr-only">Buscar artículos</span>
          <IconBuscar size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por referencia, descripción o familia…" className="input pl-10" />
        </label>
        <p className="text-sm text-slate-500">{filtrados.length} {filtrados.length === 1 ? 'artículo' : 'artículos'}</p>
      </div>

      {errorAccion && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorAccion}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error.message}</p>}
      <DataTable
        columnas={columnas}
        filas={filtrados}
        claveFila={(a) => a.id}
        ordenInicial={{ clave: 'referencia', dir: 'asc' }}
        acciones={acciones}
        cargando={isLoading}
        etiquetaPlural="artículos"
        claveReinicio={search}
        primeraColumnaFija
        anchoAcciones={150}
        scrollInterno
        vacio={search ? 'No hay artículos que coincidan con la búsqueda.' : 'Todavía no hay artículos registrados.'}
      />
      {modalAbierto && <ArticuloModal articulo={articuloEditando} onSubmit={guardar} onClose={cerrarModal} isSaving={guardando} />}
      {articuloAjustando && <AjusteStockModal articulo={articuloAjustando} onSubmit={aplicarAjuste} onClose={cerrarAjuste} isSaving={ajustarStock.isLoading} />}
    </div>
  )
}

