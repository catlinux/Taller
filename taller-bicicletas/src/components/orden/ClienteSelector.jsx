import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { apiGet, apiPost } from '../../lib/api.js'
import ClienteModal from '../ClienteModal.jsx'

const inputClass = 'mt-1.5 w-full rounded-lg border border-antracita-600 bg-antracita-900 px-3 py-2.5 text-white outline-none focus:border-azul-400'

// Pequeño campo de la ficha compacta del cliente.
function Dato({ etiqueta, valor }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <p className="break-words text-sm text-slate-200">{valor || '—'}</p>
    </div>
  )
}

// Ficha compacta que se muestra una vez elegido un cliente.
function FichaCliente({ cliente, onCambiar }) {
  return (
    <div className="rounded-xl border border-antracita-600 bg-antracita-900/60 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-azul-300">Cliente #{cliente.numeroCliente}</p>
          <p className="mt-0.5 text-lg font-semibold text-white">{cliente.nombre} {cliente.apellidos || ''}</p>
        </div>
        <button type="button" onClick={onCambiar} className="shrink-0 rounded-lg border border-antracita-600 px-3 py-2 text-sm text-slate-300 hover:bg-antracita-700">Cambiar</button>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Dato etiqueta="DNI" valor={cliente.dni} />
        <Dato etiqueta="Teléfono" valor={cliente.telefono} />
        <Dato etiqueta="Correo" valor={cliente.email} />
        <Dato etiqueta="Dirección" valor={cliente.direccion} />
        <Dato etiqueta="Código postal" valor={cliente.codigoPostal} />
        <Dato etiqueta="Población" valor={cliente.poblacion} />
        <Dato etiqueta="Provincia" valor={cliente.provincia} />
      </div>
    </div>
  )
}

// Buscador de clientes con autocompletado y alta rápida mediante ClienteModal.
export default function ClienteSelector({ cliente, onChange, token }) {
  const queryClient = useQueryClient()
  const [texto, setTexto] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(-1)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')

  // Debounce de 250 ms: retrasa la consulta al servidor mientras se escribe.
  useEffect(() => {
    const temporizador = setTimeout(() => setBusqueda(texto.trim()), 250)
    return () => clearTimeout(temporizador)
  }, [texto])

  const { data: resultados = [] } = useQuery(
    ['clientes', 'buscar', busqueda],
    () => apiGet(`/api/clientes?q=${encodeURIComponent(busqueda)}`, token),
    { enabled: Boolean(token) && busqueda.length > 0 },
  )
  const visibles = resultados.slice(0, 10)

  const crear = useMutation((datos) => apiPost('/api/clientes', token, datos), {
    onSuccess: (nuevo) => {
      queryClient.invalidateQueries(['clientes'])
      setModalAbierto(false)
      setErrorAccion('')
      setTexto('')
      setBusqueda('')
      onChange(nuevo)
    },
    onError: (e) => setErrorAccion(e.message),
  })

  function elegir(c) {
    onChange(c)
    setAbierto(false)
    setTexto('')
    setBusqueda('')
    setActivo(-1)
  }

  function manejarTeclas(event) {
    if (event.key === 'Escape') { setAbierto(false); return }
    if (!abierto || visibles.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActivo((i) => Math.min(i + 1, visibles.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActivo((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter' && activo >= 0) {
      event.preventDefault()
      elegir(visibles[activo])
    }
  }

  if (cliente) {
    return <FichaCliente cliente={cliente} onCambiar={() => onChange(null)} />
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          value={texto}
          onChange={(event) => { setTexto(event.target.value); setAbierto(true); setActivo(-1) }}
          onFocus={() => setAbierto(true)}
          onKeyDown={manejarTeclas}
          placeholder="Buscar por nº, nombre, DNI o teléfono…"
          aria-label="Buscar cliente"
          className={inputClass}
        />
        {abierto && busqueda.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-antracita-600 bg-antracita-800 shadow-xl">
            {visibles.length === 0
              ? <li className="px-4 py-3 text-sm text-slate-400">Sin resultados.</li>
              : visibles.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onMouseDown={(event) => { event.preventDefault(); elegir(c) }}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm ${i === activo ? 'bg-azul-500/20' : 'hover:bg-antracita-700'}`}
                  >
                    <span className="text-slate-200">{c.numeroCliente ? `#${c.numeroCliente} · ` : ''}{c.nombre} {c.apellidos || ''}</span>
                    <span className="text-slate-400">{c.telefono || ''}</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
      <button type="button" onClick={() => { setErrorAccion(''); setModalAbierto(true) }} className="rounded-lg border border-azul-500/50 bg-azul-500/10 px-3 py-2 text-sm font-medium text-azul-300 hover:bg-azul-500/20">+ Nuevo cliente</button>
      {errorAccion && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{errorAccion}</p>}
      {modalAbierto && (
        <ClienteModal cliente={null} onSubmit={(datos) => crear.mutate(datos)} onClose={() => setModalAbierto(false)} isSaving={crear.isLoading} />
      )}
    </div>
  )
}

