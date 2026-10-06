import { formatearMinutos } from '../../lib/tiempos.js'

// Tarjeta compacta de un trabajo programado dentro de una celda de la agenda.
// Muestra descripción (truncada), categoría y duración; si el trabajo tiene
// varios tiempos, la duración es un desplegable para cambiar entre ellos. Se
// puede arrastrar a otra celda válida y ofrece «Mover» y quitar.
export default function TarjetaTrabajo({
  trabajo,
  arrastrable = false,
  seleccionado = false,
  onArrastrarInicio,
  onArrastrarFin,
  onCambiarMinutos,
  onPedirMover,
  onQuitar,
}) {
  const tiempos = Array.isArray(trabajo.tiempos) ? trabajo.tiempos : []

  // No iniciar el arrastre si el gesto empieza en un control interactivo.
  function alArrastrarInicio(event) {
    if (event.target.closest('select, button, input, details, summary')) { event.preventDefault(); return }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(trabajo.id))
    onArrastrarInicio?.(trabajo)
  }

  return (
    <article
      draggable={arrastrable}
      onDragStart={alArrastrarInicio}
      onDragEnd={() => onArrastrarFin?.()}
      className={`rounded-lg border px-2 py-1.5 transition ${seleccionado ? 'border-azul-400 bg-azul-500/10 opacity-60' : 'border-antracita-600 bg-antracita-900'} ${arrastrable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <p title={trabajo.descripcion} className="truncate text-sm font-medium text-white">{trabajo.descripcion}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
            {trabajo.categoria && <span className="truncate">{trabajo.categoria}</span>}
            {tiempos.length > 1 ? (
              <select
                value={trabajo.minutos}
                aria-label={`Duración de ${trabajo.descripcion}`}
                onChange={(event) => onCambiarMinutos?.(trabajo, Number(event.target.value))}
                className="rounded border border-antracita-600 bg-antracita-800 px-1 py-0.5 text-xs text-slate-200 outline-none focus:border-azul-400"
              >
                {!tiempos.includes(trabajo.minutos) && <option value={trabajo.minutos}>{formatearMinutos(trabajo.minutos)}</option>}
                {tiempos.map((min) => <option key={min} value={min}>{formatearMinutos(min)}</option>)}
              </select>
            ) : (
              <span>{formatearMinutos(trabajo.minutos)}</span>
            )}
          </div>
          {trabajo.nota && <p title={trabajo.nota} className="mt-0.5 truncate text-xs text-slate-500">{trabajo.nota}</p>}
        </div>
        <div className="flex shrink-0 items-center">
          <button type="button" onClick={() => onPedirMover?.(trabajo)} aria-label={`Mover ${trabajo.descripcion}`} title="Mover" className="rounded px-1.5 py-1 text-slate-400 hover:bg-antracita-700 hover:text-white">⇄</button>
          <button type="button" onClick={() => onQuitar?.(trabajo)} aria-label={`Quitar ${trabajo.descripcion}`} title="Quitar" className="rounded px-1.5 py-1 text-rose-300 hover:bg-rose-500/10">×</button>
        </div>
      </div>
    </article>
  )
}
