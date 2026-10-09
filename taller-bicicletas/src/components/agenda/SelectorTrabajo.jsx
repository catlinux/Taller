import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { agruparCatalogo } from '../../lib/agenda.js'
import { formatearMinutos, horasAMinutos, parsearDuracionLibre } from '../../lib/tiempos.js'
import ClienteCampo from './ClienteCampo.jsx'

// Tiempos (minutos) de una operación del catálogo: los alternativos o el tiempo
// por defecto (en horas) si no tiene.
function tiemposDe(operacion) {
  const tiempos = Array.isArray(operacion.tiempos) ? operacion.tiempos : []
  return tiempos.length > 0 ? tiempos : [horasAMinutos(operacion.tiempoDefecto)]
}

const ANCHO = 340
const ALTO_MAX = 470
const MARGEN = 8

// Selector de trabajo: panel anclado al punto donde se hizo clic. Lista el
// catálogo agrupado por categoría (sin tildes al filtrar) y se maneja con
// flechas, Enter y Escape; si la operación tiene varios tiempos pide elegir uno.
// También permite un trabajo libre (descripción y duración) y un cliente opcional.
// Llama a onElegir({ operacion, descripcion, minutos, cliente }).
export default function SelectorTrabajo({ anclaRef, titulo, operaciones, token, onElegir, onCerrar, programando = false }) {
  const [modo, setModo] = useState('catalogo')
  const [cliente, setCliente] = useState(null)
  const [descripcionLibre, setDescripcionLibre] = useState('')
  const [duracionLibre, setDuracionLibre] = useState('1:00')
  const [errorLibre, setErrorLibre] = useState('')
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

  // Coloca el panel junto al punto de anclaje (arriba si no cabe abajo).
  useLayoutEffect(() => {
    const rect = anclaRef?.current?.getBoundingClientRect()
    if (!rect) { setPos({ left: MARGEN, top: MARGEN }); return }
    let left = rect.left
    if (left + ANCHO > window.innerWidth - MARGEN) left = window.innerWidth - ANCHO - MARGEN
    if (left < MARGEN) left = MARGEN
    let top = rect.bottom + 4
    if (top + ALTO_MAX > window.innerHeight - MARGEN) top = Math.max(MARGEN, window.innerHeight - ALTO_MAX - MARGEN)
    setPos({ left, top })
  }, [anclaRef])

  useEffect(() => { inputRef.current?.focus() }, [modo])
  useEffect(() => { setActivo(0) }, [filtro])

  // Cierra al pulsar fuera del panel. Se usa composedPath() porque al elegir un
  // trabajo con varios tiempos React ya ha quitado el botón del DOM cuando este
  // listener se ejecuta, y contains() lo tomaría por un clic fuera.
  useEffect(() => {
    function alClicFuera(event) {
      const ruta = event.composedPath()
      if (ruta.includes(panelRef.current)) return
      onCerrar()
    }
    document.addEventListener('mousedown', alClicFuera)
    return () => document.removeEventListener('mousedown', alClicFuera)
  }, [onCerrar])

  function elegir(operacion, minutos) {
    if (programando) return
    if (minutos !== undefined) { onElegir({ operacion, minutos, cliente }); return }
    const tiempos = tiemposDe(operacion)
    if (tiempos.length > 1) { setPendiente(operacion); return }
    onElegir({ operacion, minutos: tiempos[0], cliente })
  }

  function añadirLibre(event) {
    event.preventDefault()
    if (programando) return
    const descripcion = descripcionLibre.trim()
    const minutos = parsearDuracionLibre(duracionLibre)
    if (!descripcion) { setErrorLibre('Escribe qué trabajo es.'); return }
    if (minutos === null) { setErrorLibre('La duración debe ser como 1:30, 45 o 1,5h.'); return }
    setErrorLibre('')
    onElegir({ operacion: null, descripcion, minutos, cliente })
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
      aria-label="Añadir trabajo a la agenda"
      style={{ left: pos.left, top: pos.top, width: ANCHO }}
      className="fixed z-[130] rounded-xl border border-antracita-600 bg-antracita-800 p-3 shadow-2xl"
    >
      {titulo && <p className="mb-2 text-xs font-medium uppercase tracking-wide text-azul-300">{titulo}</p>}
      {pendiente ? (
        <div>
          <p className="text-sm text-slate-300">
            <span className="font-medium text-white">{pendiente.codigo}</span> · {pendiente.descripcion} — elige el tiempo:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tiemposDe(pendiente).map((min, i) => (
              <button key={i} type="button" disabled={programando} onClick={() => onElegir({ operacion: pendiente, minutos: min, cliente })} className="btn-secondary">
                {`Tiempo ${i + 1}: ${formatearMinutos(min)}`}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setPendiente(null)} className="btn-ghost mt-2">Volver a la lista</button>
        </div>
      ) : modo === 'libre' ? (
        <form onSubmit={añadirLibre} className="space-y-2">
          <input
            ref={inputRef}
            type="text"
            value={descripcionLibre}
            maxLength={200}
            placeholder="¿Qué trabajo es?"
            onChange={(event) => setDescripcionLibre(event.target.value)}
            aria-label="Descripción del trabajo libre"
            className="input"
          />
          <input
            type="text"
            value={duracionLibre}
            onChange={(event) => setDuracionLibre(event.target.value)}
            aria-label="Duración"
            placeholder="Duración (1:30, 45 o 1,5h)"
            className="input"
          />
          {errorLibre && <p role="alert" className="text-xs text-rose-300">{errorLibre}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={programando} className="btn-primary">Añadir</button>
            <button type="button" onClick={() => setModo('catalogo')} className="btn-ghost">Volver al catálogo</button>
          </div>
        </form>
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
          <div className="mt-2 max-h-56 overflow-auto">
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
          <button type="button" onClick={() => setModo('libre')} className="btn-ghost mt-1 w-full justify-center">Otro trabajo (libre)…</button>
        </>
      )}
      {!pendiente && (
        <div className="mt-3 border-t border-antracita-700 pt-3">
          <ClienteCampo token={token} cliente={cliente} onChange={setCliente} />
        </div>
      )}
    </div>
  )
}
