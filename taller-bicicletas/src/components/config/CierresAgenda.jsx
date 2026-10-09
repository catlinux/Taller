import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { apiGet, apiPut } from '../../lib/api.js'
import ModalCierreTrabajos from '../agenda/ModalCierreTrabajos.jsx'

// «AAAA-MM-DD» -> «DD/MM/AAAA».
function fechaLarga(fecha) {
  const [anio, mes, dia] = String(fecha).split('-')
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : fecha
}

// Texto de un periodo cerrado: «15/10/2026 – 19/10/2026» o solo una fecha.
function textoPeriodo(periodo) {
  return periodo.desde === periodo.hasta ? fechaLarga(periodo.desde) : `${fechaLarga(periodo.desde)} – ${fechaLarga(periodo.hasta)}`
}

const ETIQUETAS = { festivo: 'Festivo', vacaciones: 'Vacaciones' }

// Configuración > Agenda > Cerrar un periodo: marca como festivo o vacaciones los
// días de lunes a viernes entre dos fechas y lista los próximos cierres con «Reabrir».
export default function CierresAgenda({ token }) {
  const queryClient = useQueryClient()
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [tipo, setTipo] = useState('vacaciones')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [pendiente, setPendiente] = useState(null)

  const { data: cierres = [], isLoading } = useQuery(['agenda', 'cierres'], () => apiGet('/api/agenda/cierres', token), { enabled: Boolean(token) })

  const enviar = useMutation((cuerpo) => apiPut('/api/agenda/cierres', token, cuerpo), {
    onSuccess: (_, cuerpo) => {
      queryClient.invalidateQueries(['agenda'])
      setPendiente(null)
      setError('')
      if (cuerpo.cierre !== null) { setDesde(''); setHasta(''); setMotivo('') }
    },
    onError: (e, cuerpo) => {
      if (e.status === 409 && e.data?.requiereDecision === 'trabajosEnDiaCerrado') setPendiente({ trabajos: e.data.trabajos, cuerpo })
      else { setPendiente(null); setError(e.message) }
    },
  })

  function cerrar(event) {
    event.preventDefault()
    setError('')
    if (!desde || !hasta) { setError('Indica la fecha de inicio y la de fin.'); return }
    enviar.mutate({ desde, hasta, cierre: tipo, motivo: motivo.trim() || null })
  }

  return (
    <section className="mt-8 border-t border-antracita-700 pt-6" aria-labelledby="cierres-titulo">
      <h3 id="cierres-titulo" className="text-base font-semibold text-white">Festivos y vacaciones</h3>
      <p className="mt-1 text-sm text-slate-400">
        Un día cerrado no tiene capacidad y es común a todos los mecánicos. También se puede cerrar un día suelto desde «Ajustar día» en la Agenda.
      </p>

      <form onSubmit={cerrar} className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Desde</span>
          <input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} aria-label="Cerrar desde" className="input mt-1.5" />
        </label>
        <label className="block">
          <span className="label">Hasta</span>
          <input type="date" value={hasta} min={desde || undefined} onChange={(event) => setHasta(event.target.value)} aria-label="Cerrar hasta" className="input mt-1.5" />
        </label>
        <label className="block">
          <span className="label">Tipo</span>
          <select value={tipo} onChange={(event) => setTipo(event.target.value)} aria-label="Tipo de cierre" className="input mt-1.5">
            <option value="vacaciones">Vacaciones</option>
            <option value="festivo">Festivo</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Motivo (opcional)</span>
          <input type="text" value={motivo} maxLength={100} onChange={(event) => setMotivo(event.target.value)} aria-label="Motivo del cierre" className="input mt-1.5" />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={enviar.isLoading} className="btn-primary">Cerrar periodo</button>
        </div>
      </form>

      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

      <h4 className="mt-6 text-sm font-medium text-slate-200">Próximos cierres</h4>
      {isLoading && <p role="status" className="mt-2 text-sm text-slate-400">Cargando…</p>}
      {!isLoading && cierres.length === 0 && <p className="mt-2 text-sm text-slate-500">No hay cierres programados.</p>}
      <ul className="mt-2 max-w-2xl space-y-2">
        {cierres.map((periodo) => (
          <li key={`${periodo.desde}-${periodo.hasta}`} className="flex items-center justify-between gap-3 rounded-lg border border-antracita-700 px-3 py-2 text-sm">
            <span className="min-w-0 text-slate-200">
              <span className="font-medium text-white">{textoPeriodo(periodo)}</span>
              <span className="ml-2 text-slate-400">{ETIQUETAS[periodo.cierre]}{periodo.motivo ? ` · ${periodo.motivo}` : ''} · {periodo.dias === 1 ? '1 día' : `${periodo.dias} días`}</span>
            </span>
            <button type="button" disabled={enviar.isLoading} onClick={() => enviar.mutate({ desde: periodo.desde, hasta: periodo.hasta, cierre: null })} className="btn-ghost shrink-0 px-2 py-1 text-xs">Reabrir</button>
          </li>
        ))}
      </ul>

      {pendiente && (
        <ModalCierreTrabajos
          trabajos={pendiente.trabajos}
          enviando={enviar.isLoading}
          onMover={() => enviar.mutate({ ...pendiente.cuerpo, trabajos: 'mover' })}
          onMantener={() => enviar.mutate({ ...pendiente.cuerpo, trabajos: 'mantener' })}
          onCancelar={() => setPendiente(null)}
        />
      )}
    </section>
  )
}
