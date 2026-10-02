import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { apiGet, apiPost } from '../../lib/api.js'
import BicicletaModal from '../BicicletaModal.jsx'

// Lista las bicis del cliente como tarjetas seleccionables y permite dar de
// alta una nueva con el cliente ya fijado.
export default function BicicletaSelector({ cliente, bicicleta, onChange, token }) {
  const queryClient = useQueryClient()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')

  const { data: bicicletas = [], isLoading } = useQuery(
    ['bicicletas', 'cliente', cliente?.id],
    () => apiGet(`/api/bicicletas?clienteId=${cliente.id}`, token),
    { enabled: Boolean(token) && Boolean(cliente?.id) },
  )

  const crear = useMutation((datos) => apiPost('/api/bicicletas', token, datos), {
    onSuccess: (nueva) => {
      queryClient.invalidateQueries(['bicicletas'])
      setModalAbierto(false)
      setErrorAccion('')
      onChange(nueva)
    },
    onError: (e) => setErrorAccion(e.message),
  })

  if (!cliente) {
    return <p className="rounded-xl border border-antracita-600 bg-antracita-900/40 px-4 py-3 text-sm text-slate-400">Selecciona primero un cliente para elegir su bicicleta.</p>
  }

  return (
    <div className="space-y-3">
      {isLoading
        ? <p className="text-sm text-slate-400">Cargando bicicletas…</p>
        : bicicletas.length === 0
          ? <p className="text-sm text-slate-400">Este cliente aún no tiene bicicletas registradas.</p>
          : (
            <div className="grid gap-3 sm:grid-cols-2">
              {bicicletas.map((b) => {
                const activa = bicicleta?.id === b.id
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onChange(activa ? null : b)}
                    className={`rounded-xl border p-4 text-left transition ${activa ? 'border-azul-500 bg-azul-500/10' : 'border-antracita-600 bg-antracita-900/40 hover:border-antracita-500'}`}
                  >
                    <p className="text-xs uppercase tracking-wide text-azul-300">{b.tipo}</p>
                    <p className="mt-1 font-semibold text-white">{b.marca} {b.modelo || ''}</p>
                    <p className="mt-1 text-xs text-slate-400">{b.numeroSerie ? `N.º serie ${b.numeroSerie}` : 'Sin número de serie'}</p>
                  </button>
                )
              })}
            </div>
          )}
      <button type="button" onClick={() => { setErrorAccion(''); setModalAbierto(true) }} className="rounded-lg border border-azul-500/50 bg-azul-500/10 px-3 py-2 text-sm font-medium text-azul-300 hover:bg-azul-500/20">+ Añadir bici</button>
      {errorAccion && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{errorAccion}</p>}
      {modalAbierto && (
        <BicicletaModal
          bicicleta={null}
          clientes={[cliente]}
          clienteFijo={cliente}
          onSubmit={(datos) => crear.mutate(datos)}
          onClose={() => setModalAbierto(false)}
          isSaving={crear.isLoading}
        />
      )}
    </div>
  )
}
