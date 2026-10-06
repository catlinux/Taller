import { useState } from 'react'
import EditorTramos from './EditorTramos.jsx'
import { validarTramosCliente, minutosTramos } from '../../lib/agenda.js'

// Interpreta el texto del campo de horas máximas («5», «5,5» o «5.5») como
// número; null si no es un número válido (>= 0).
function parsearHorasMaximas(texto) {
  const limpio = String(texto).trim().replace(',', '.')
  if (limpio === '') return null
  const numero = Number(limpio)
  return Number.isFinite(numero) && numero >= 0 ? numero : null
}

// Texto del total de horas laborables del horario («H:MM»).
function textoHoras(tramos) {
  const total = minutosTramos(tramos)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// Modal (solo admin) para ajustar el horario y las horas máximas de un día
// concreto sin cambiar el valor predeterminado. Cada bloque puede quedarse en el
// predeterminado (se envía null) o pasar a personalizado.
export default function AjusteDiaModal({ dia, config, onGuardar, onVolverPredeterminado, onCerrar, guardando = false, error = '' }) {
  const [horarioPersonalizado, setHorarioPersonalizado] = useState(Boolean(dia.tramosPersonalizados))
  const [horasPersonalizadas, setHorasPersonalizadas] = useState(Boolean(dia.horasPersonalizadas))
  const [tramos, setTramos] = useState(dia.tramosPersonalizados ? dia.tramos : config.tramos)
  const [horasTexto, setHorasTexto] = useState(String(dia.horasPersonalizadas ? dia.horasMaximas : config.horasMaximas))
  const [errorLocal, setErrorLocal] = useState('')

  const tramosEfectivos = horarioPersonalizado ? tramos : config.tramos

  function guardar() {
    setErrorLocal('')
    let tramosEnviar = null
    if (horarioPersonalizado) {
      const resultado = validarTramosCliente(tramos)
      if (resultado.error) { setErrorLocal(resultado.error); return }
      tramosEnviar = resultado.tramos
    }
    let horasEnviar = null
    if (horasPersonalizadas) {
      const numero = parsearHorasMaximas(horasTexto)
      if (numero === null) { setErrorLocal('Las horas máximas deben ser un número mayor o igual que 0.'); return }
      horasEnviar = numero
    }
    onGuardar({ tramos: tramosEnviar, horasMaximas: horasEnviar })
  }

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-black/70 p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCerrar() }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="ajuste-dia-title" className="my-auto w-full max-w-lg rounded-2xl border border-antracita-700 bg-antracita-800 p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="ajuste-dia-title" className="text-xl font-semibold">Ajustar día</h2>
            <p className="mt-1 text-sm text-slate-400">{dia.nombre}</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg px-3 py-2 text-slate-400 hover:bg-antracita-700 hover:text-white">×</button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={horarioPersonalizado} onChange={(event) => setHorarioPersonalizado(event.target.checked)} className="h-4 w-4" />
              <span className="text-sm font-medium text-slate-200">Horario personalizado</span>
            </label>
            <p className="mt-1 text-xs text-slate-500">
              {horarioPersonalizado ? 'Se usará un horario propio solo para este día.' : 'Se usa el horario predeterminado de Configuración.'}
            </p>
            <div className="mt-3">
              <EditorTramos tramos={tramosEfectivos} onChange={setTramos} disabled={!horarioPersonalizado} idPrefijo="ajuste-tramos" />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={horasPersonalizadas} onChange={(event) => setHorasPersonalizadas(event.target.checked)} className="h-4 w-4" />
              <span className="text-sm font-medium text-slate-200">Horas máximas personalizadas</span>
            </label>
            <label className="mt-3 block">
              <span className="label">Horas máximas de taller</span>
              <input type="text" inputMode="decimal" value={horasTexto} disabled={!horasPersonalizadas} onChange={(event) => setHorasTexto(event.target.value)} className="input mt-1.5" />
            </label>
            <p className="mt-1.5 text-xs text-slate-500">Se contabilizan {textoHoras(tramosEfectivos)} h laborables con el horario elegido.</p>
          </div>

          {(errorLocal || error) && (
            <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{errorLocal || error}</p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-antracita-700 pt-5">
          <button type="button" onClick={onVolverPredeterminado} disabled={guardando} className="btn-secondary">Volver a lo predeterminado</button>
          <div className="flex gap-3">
            <button type="button" onClick={onCerrar} disabled={guardando} className="btn-ghost">Cancelar</button>
            <button type="button" onClick={guardar} disabled={guardando} className="btn-primary">{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </section>
    </div>
  )
}
