import { Link } from 'react-router-dom'
import { formatearMinutos } from '../../lib/tiempos.js'
import { ESCALA_PX, minutosDeHora, segmentosVisuales } from '../../lib/agenda.js'

// Bajo esta altura (px) el bloque se dibuja en una sola línea.
const ALTURA_COMPACTA = 25

// Estilo según el origen del trabajo: de una orden en azul, manual en gris; los
// forzados (pasados de la capacidad del día) o en un día cerrado, con borde rojo.
function claseBloque(bloque, diaCerrado) {
  const color = bloque.trabajo.orden
    ? 'bg-azul-500/25 text-white hover:bg-azul-500/35'
    : 'bg-antracita-600/80 text-slate-100 hover:bg-antracita-600'
  const borde = bloque.forzado || diaCerrado ? 'border-rose-500' : 'border-white/10'
  return `${color} ${borde}`
}

// Texto completo del bloque para el atributo title.
function textoCompleto(bloque) {
  const t = bloque.trabajo
  const partes = [`${bloque.inicio}–${bloque.fin}`, t.descripcion, `(${formatearMinutos(bloque.minutos)})`]
  if (bloque.partes > 1) partes.push(`parte ${bloque.parte}/${bloque.partes}`)
  if (t.cliente) partes.push(`· ${t.cliente.nombreCorto}`)
  if (t.orden) partes.push(`· orden ${t.orden.numeroOrden}`)
  if (bloque.forzado) partes.push('· pasa de las horas máximas del día')
  return partes.join(' ')
}

// Bloque de trabajo de la línea de tiempo. Se dibuja en tantos trozos como
// pausas cruce (posición absoluta dentro de la columna del día); todos abren el
// detalle al pulsarlos y se pueden arrastrar.
export default function BloqueTrabajo({ bloque, tramos, inicioEje, diaCerrado = false, onAbrir, onArrastrarInicio, onArrastrarFin }) {
  const inicio = minutosDeHora(bloque.inicio)
  const trozos = segmentosVisuales(tramos, inicio, bloque.minutos)
  const t = bloque.trabajo

  return trozos.map((trozo, i) => {
    const altura = (trozo.hasta - trozo.desde) * ESCALA_PX
    const compacto = altura < ALTURA_COMPACTA
    const continuacion = i > 0
    return (
      <div
        key={i}
        role="button"
        tabIndex={0}
        draggable
        title={textoCompleto(bloque)}
        data-bloque={bloque.id}
        onClick={(event) => { event.stopPropagation(); onAbrir(bloque) }}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onAbrir(bloque) } }}
        onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(bloque.id)); onArrastrarInicio(bloque, event) }}
        onDragEnd={onArrastrarFin}
        style={{ top: (trozo.desde - inicioEje) * ESCALA_PX, height: altura }}
        className={`absolute inset-x-0.5 cursor-grab overflow-hidden rounded-md border px-1.5 text-xs shadow-sm ${compacto ? 'flex items-center gap-1.5 py-0' : 'py-1'} ${claseBloque(bloque, diaCerrado)}`}
      >
        {compacto ? (
          <>
            <span className="truncate font-medium">{t.descripcion}</span>
            <span className="shrink-0 text-[10px] opacity-80">{formatearMinutos(bloque.minutos)}</span>
          </>
        ) : (
          <>
            <p className="truncate font-medium leading-tight">
              {continuacion ? '↳ ' : ''}{t.descripcion}
              {bloque.partes > 1 && <span className="ml-1 rounded bg-black/30 px-1 text-[10px]">{bloque.parte}/{bloque.partes}</span>}
            </p>
            {altura >= 38 && t.cliente && <p className="truncate text-[11px] opacity-80">{t.cliente.nombreCorto}</p>}
            {altura >= 52 && (
              <p className="flex items-center gap-1.5 text-[11px] opacity-80">
                {t.orden && (
                  <Link to={`/ordenes/${t.orden.id}`} onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} className="text-azul-300 underline-offset-2 hover:underline">
                    {t.orden.numeroOrden}
                  </Link>
                )}
                <span>{formatearMinutos(bloque.minutos)}</span>
              </p>
            )}
          </>
        )}
      </div>
    )
  })
}
