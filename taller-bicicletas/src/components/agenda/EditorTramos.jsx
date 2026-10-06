import { minutosTramos } from '../../lib/agenda.js'

// Editor de tramos de horario reutilizable (Configuración > Agenda y ajuste de un
// día). Muestra una lista de tramos inicio–fin con horas en cuartos de hora
// (input type=time step=900); permite añadir hasta 4 tramos y quitar los que
// sobren (mínimo uno). Es controlado: recibe el array de tramos y avisa de los
// cambios con onChange. El padre decide cómo validarlos y guardarlos.
const MAX_TRAMOS = 4

// Total de horas y minutos del horario como texto «H:MM».
function textoHoras(tramos) {
  const total = minutosTramos(tramos)
  const horas = Math.floor(total / 60)
  const minutos = total % 60
  return `${horas}:${String(minutos).padStart(2, '0')}`
}

export default function EditorTramos({ tramos, onChange, disabled = false, idPrefijo = 'editor-tramos' }) {
  const lista = Array.isArray(tramos) ? tramos : []

  function cambiar(indice, campo, valor) {
    onChange(lista.map((tramo, i) => (i === indice ? { ...tramo, [campo]: valor } : tramo)))
  }

  function anadir() {
    if (lista.length >= MAX_TRAMOS) return
    onChange([...lista, { inicio: '09:00', fin: '17:00' }])
  }

  function quitar(indice) {
    onChange(lista.filter((_, i) => i !== indice))
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {lista.map((tramo, indice) => (
          <div key={indice} className="flex items-end gap-2">
            <label className="flex-1">
              <span className="label">Inicio</span>
              <input
                id={`${idPrefijo}-inicio-${indice}`}
                type="time"
                step={900}
                value={tramo.inicio}
                disabled={disabled}
                onChange={(event) => cambiar(indice, 'inicio', event.target.value)}
                aria-label={`Hora de inicio del tramo ${indice + 1}`}
                className="input"
              />
            </label>
            <span className="pb-2.5 text-slate-500">–</span>
            <label className="flex-1">
              <span className="label">Fin</span>
              <input
                id={`${idPrefijo}-fin-${indice}`}
                type="time"
                step={900}
                value={tramo.fin}
                disabled={disabled}
                onChange={(event) => cambiar(indice, 'fin', event.target.value)}
                aria-label={`Hora de fin del tramo ${indice + 1}`}
                className="input"
              />
            </label>
            <button
              type="button"
              disabled={disabled || lista.length <= 1}
              onClick={() => quitar(indice)}
              aria-label={`Quitar el tramo ${indice + 1}`}
              title="Quitar tramo"
              className="btn-ghost px-3 text-rose-300 disabled:opacity-40"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={disabled || lista.length >= MAX_TRAMOS} onClick={anadir} className="btn-secondary">
          Añadir tramo
        </button>
        <p className="text-sm text-slate-400">
          {textoHoras(lista)} h laborables en total
        </p>
      </div>
    </div>
  )
}
