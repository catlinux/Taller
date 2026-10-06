import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { agruparCatalogo } from '../../lib/agenda.js'
import { formatearMinutos, horasAMinutos } from '../../lib/tiempos.js'

// Tiempos (minutos) de una operación del catálogo: los alternativos o el tiempo
// por defecto (en horas) si no tiene.
function tiemposDe(operacion) {
  const tiempos = Array.isArray(operacion.tiempos) ? operacion.tiempos : []
  return tiempos.length > 0 ? tiempos : [horasAMinutos(operacion.tiempoDefecto)]
}

const ANCHO = 340
const ALTO_MAX = 360
const MARGEN = 8

// Selector de trabajo del catálogo: desplegable con filtro opcional anclado a la
// celda. Lista el catálogo agrupado por categoría (sin tildes al filtrar) y se
// maneja con flechas, Enter y Escape. Si la operación tiene varios tiempos, pide
// elegir uno antes de programarla.
export default function SelectorTrabajo({ anclaRef, operaciones, onElegir, onCerrar, programando = false }) {
  const [filtro, setFiltro] = useState('')
  const [activo, setActivo] = useState(0)
  const [pendiente, setPendiente] = useState(null)
  const [pos, setPos] = useState(null)
  const inputRef = useRef(null)
  const panelRef = useRef(null)

  const grupos = useMemo(() => agruparCatalogo(operaciones, filtro), [operaciones, filtro])
  const opciones = useMemo(() => grupos.flatMap((grupo) => grupo.operaciones), [grupos])

  // Índice del primer elemento de cada grupo dentro de la lista plana (para el
  // resaltado con teclado).
  const indicesGrupo = useMemo(() => {
    let contador = 0
    return grupos.map((grupo) => {
      const desde = contador
      contador += grupo.operaciones.length
      return desde
    })
  }, [grupos])

  // Coloca el panel junto a la celda (arriba si no cabe abajo).
  useLayoutEffect(() => {
    const rect = anclaRef?.current?.getBoundingClientRect()
    if (!rect) { setPos({ left: MARGEN, top: MARGEN }); return }
    let left = rect.left
    if (left + ANCHO > window.innerWidth - MARGEN) left = window.innerWidth - ANCHO - MARGEN
    if (left < MARGEN) left = MARGEN
    let top = rect.bottom + 4
    if (top + ALTO_MAX > window.innerHeight - MARGEN) top = Math.max(MARGEN, rect.top - ALTO_MAX - 4)
    setPos({ left, top })
  }, [anclaRef])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setActivo(0) }, [filtro])

  // Cierra al pulsar fuera del panel.
  useEffect(() => {
    function alClicFuera(event) {
      if (panelRef.current?.contains(event.target)) return
      if (anclaRef?.current?.contains(event.target)) return
      onCerrar()
    }
    document.addEventListener('mousedown', alClicFuera)
    return () => document.removeEventListener('mousedown', alClicFuera)
  }, [onCerrar, anclaRef])

  function elegir(operacion, minutos) {
    if (programando) return
    if (minutos !== undefined) { onElegir(operacion, minutos); return }
    const tiempos = tiemposDe(operacion)
    if (tiempos.length > 1) { setPendiente(operacion); return }
    onElegir(operacion, tiempos[0])
  }

  function alTeclear(event) {
    if (pendiente) { if (event.key === 'Escape') { event.preventDefault(); setPendiente(null) } return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActivo((a) => Math.min(a + 1, opciones.length - 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActivo((a) => Math.max(a - 1, 0)) }
    else if (event.key === 'Enter') { event.preventDefault(); const op = opciones[activo]; if (op) elegir(op) }
    else if (event.key === 'Escape') { event.preventDefault(); onCerrar() }
  }

  if (!pos) return null

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Elegir trabajo del catálogo"
      style={{ left: pos.left, top: pos.top, width: ANCHO }}
      className="fixed z-[130] rounded-xl border border-antracita-600 bg-antracita-800 p-3 shadow-2xl"
    >
      {pendiente ? (
        <div>
          <p className="text-sm text-slate-300">
            <span className="font-medium text-white">{pendiente.codigo}</span> · {pendiente.descripcion} — elige el tiempo:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tiemposDe(pendiente).map((min, i) => (
              <button key={i} type="button" disabled={programando} onClick={() => onElegir(pendiente, min)} className="btn-secondary">
                {`Tiempo ${i + 1}: ${formatearMinutos(min)}`}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setPendiente(null)} className="btn-ghost mt-2">Volver a la lista</button>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="text"
            value={filtro}
            placeholder="Filtrar por descripción, código o categoría…"
            onChange={(event) => setFiltro(event.target.value)}
            onKeyDown={alTeclear}
            aria-label="Filtrar trabajos"
            className="input"
          />
          <div className="mt-2 max-h-72 overflow-auto">
            {opciones.length === 0 && <p className="px-2 py-3 text-sm text-slate-400">Sin resultados.</p>}
            {grupos.map((grupo, gi) => (
              <div key={grupo.categoria}>
                <p className="px-2 pt-2 text-xs font-medium uppercase tracking-wide text-slate-500">{grupo.categoria}</p>
                <ul>
                  {grupo.operaciones.map((op, oi) => {
                    const indice = indicesGrupo[gi] + oi
                    return (
                      <li key={op.id ?? `${op.codigo}-${indice}`}>
                        <button
                          type="button"
                          disabled={programando}
                          onMouseDown={(event) => { event.preventDefault(); elegir(op) }}
                          onMouseEnter={() => setActivo(indice)}
                          className={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm ${indice === activo ? 'bg-azul-500/20' : 'hover:bg-antracita-700'}`}
                        >
                          <span className="min-w-0 truncate text-slate-200">
                            <span className="font-medium text-white">{op.codigo}</span> · {op.descripcion}
                          </span>
                          <span className="shrink-0 text-xs text-slate-400">{tiemposDe(op).map((min) => formatearMinutos(min)).join(' · ')}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Escribe para filtrar; flechas para moverte, Enter para elegir, Escape para cerrar.</p>
        </>
      )}
    </div>
  )
}

