import { useRef, useState } from 'react'
import { formatearMinutos, parsearDuracionLibre } from '../../lib/tiempos.js'

// Tarjeta compacta de un trabajo programado dentro de una celda de la agenda.
// Muestra descripción (truncada), categoría y duración. La duración es siempre
// editable: al pulsarla se convierte en un campo de texto donde se escribe un
// tiempo libre, con los tiempos del catálogo como sugerencias. Se puede arrastrar
// a otra celda válida y ofrece «Mover» y quitar.
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
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const [invalido, setInvalido] = useState(false)
  const ignorarBlur = useRef(false)
  const idLista = `tiempos-${trabajo.id}`

  // El valor actual no está en el catálogo del trabajo: es una duración manual.
  const esManual = !tiempos.includes(trabajo.minutos)

  // Abre el campo de edición con la duración actual seleccionada.
  function abrirEdicion() {
    ignorarBlur.current = false
    setInvalido(false)
    setTexto(formatearMinutos(trabajo.minutos))
    setEditando(true)
  }

  // Guarda el valor escrito (solo si es válido y distinto) y cierra el campo.
  function guardar() {
    const minutos = parsearDuracionLibre(texto)
    if (minutos === null) { setInvalido(true); return }
    if (minutos !== trabajo.minutos) onCambiarMinutos?.(trabajo, minutos)
    setEditando(false)
  }

  function alTeclear(event) {
    if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
    else if (event.key === 'Escape') { event.preventDefault(); ignorarBlur.current = true; setEditando(false) }
  }

  function alPerderFoco() {
    if (ignorarBlur.current) { ignorarBlur.current = false; return }
    guardar()
  }

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
            {editando ? (
              <>
                <input
                  autoFocus
                  type="text"
                  list={idLista}
                  value={texto}
                  aria-label={`Cambiar tiempo de ${trabajo.descripcion}`}
                  title={invalido ? 'Tiempo no válido: usa H:MM (0:45) o minutos (45)' : 'Escribe el tiempo en H:MM o en minutos'}
                  onChange={(event) => { setTexto(event.target.value); if (invalido) setInvalido(false) }}
                  onKeyDown={alTeclear}
                  onBlur={alPerderFoco}
                  onFocus={(event) => event.target.select()}
                  className={`w-16 rounded border bg-antracita-800 px-1 py-0.5 text-xs text-slate-200 outline-none ${invalido ? 'border-rose-500' : 'border-azul-400'}`}
                />
                <datalist id={idLista}>
                  {tiempos.map((min) => <option key={min} value={formatearMinutos(min)} />)}
                </datalist>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={abrirEdicion}
                  aria-label={`Cambiar tiempo de ${trabajo.descripcion}`}
                  title="Cambiar tiempo"
                  className="rounded border border-antracita-600 bg-antracita-800 px-1 py-0.5 text-xs text-slate-200 hover:border-azul-400 hover:text-white"
                >
                  {formatearMinutos(trabajo.minutos)}
                </button>
                {esManual && <span className="text-slate-500" title="Tiempo escrito a mano">(manual)</span>}
              </>
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
