import { useEffect, useState } from 'react'
import { useQuery } from 'react-query'
import { apiGet } from '../../lib/api.js'

// Texto corto de un cliente de la lista: «Nombre Apellidos».
function etiquetaCliente(cliente) {
  return `${cliente.nombre} ${cliente.apellidos || ''}`.trim()
}

// Campo compacto de cliente (opcional) para la agenda: buscador con
// autocompletado, o el cliente elegido con un botón para quitarlo.
export default function ClienteCampo({ token, cliente, onChange, etiqueta = 'Cliente (opcional)' }) {
  const [texto, setTexto] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState(false)

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
  const visibles = resultados.slice(0, 8)

  function elegir(elegido) {
    onChange(elegido)
    setAbierto(false)
    setTexto('')
    setBusqueda('')
  }

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{etiqueta}</p>
      {cliente ? (
        <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-antracita-600 bg-antracita-900/60 px-3 py-2 text-sm">
          <span className="min-w-0 truncate text-slate-100">{cliente.numeroCliente ? `#${cliente.numeroCliente} · ` : ''}{etiquetaCliente(cliente)}</span>
          <button type="button" onClick={() => onChange(null)} className="shrink-0 text-xs text-slate-400 hover:text-white">Quitar</button>
        </div>
      ) : (
        <div className="relative mt-1">
          <input
            value={texto}
            onChange={(event) => { setTexto(event.target.value); setAbierto(true) }}
            onFocus={() => setAbierto(true)}
            placeholder="Buscar por nº, nombre, DNI o teléfono…"
            aria-label="Buscar cliente"
            className="input"
          />
          {abierto && busqueda.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-antracita-600 bg-antracita-800 shadow-xl">
              {visibles.length === 0
                ? <li className="px-3 py-2 text-sm text-slate-400">Sin resultados.</li>
                : visibles.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onMouseDown={(event) => { event.preventDefault(); elegir(c) }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-antracita-700"
                    >
                      <span className="truncate text-slate-200">{c.numeroCliente ? `#${c.numeroCliente} · ` : ''}{etiquetaCliente(c)}</span>
                      <span className="shrink-0 text-xs text-slate-400">{c.telefono || ''}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
