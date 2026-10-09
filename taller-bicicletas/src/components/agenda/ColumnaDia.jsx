import BloqueTrabajo from './BloqueTrabajo.jsx'
import { ESCALA_PX, horaDeClic, zonasFueraDeHorario } from '../../lib/agenda.js'

// Minuto de reloj (sin redondear) bajo el puntero dentro de la columna.
export function minutoDeEvento(event, columna, inicioEje) {
  const rect = columna.getBoundingClientRect()
  return inicioEje + (event.clientY - rect.top) / ESCALA_PX
}

// Fondo rayado de las zonas sin horario o de un día cerrado.
const RAYADO = 'repeating-linear-gradient(135deg, rgb(255 255 255 / 0.04) 0 6px, transparent 6px 12px)'

// Columna de un día de la línea de tiempo: zonas fuera de horario rayadas, los
// bloques en posición absoluta, la línea de «ahora» y el hueco donde se soltaría
// un bloque arrastrado. Un clic en una zona libre pide añadir un trabajo.
export default function ColumnaDia({
  dia,
  inicioEje,
  finEje,
  ahora = null,
  destino = null,
  onClicLibre,
  onSobrevolar,
  onSoltar,
  onAbrir,
  onArrastrarInicio,
  onArrastrarFin,
}) {
  const alto = (finEje - inicioEje) * ESCALA_PX
  const cerrado = Boolean(dia.cierre)
  const zonas = cerrado ? [{ desde: inicioEje, hasta: finEje }] : zonasFueraDeHorario(dia.tramos, inicioEje, finEje)

  function alPulsar(event) {
    if (cerrado) return
    const rect = event.currentTarget.getBoundingClientRect()
    const hora = horaDeClic(dia.tramos, inicioEje, event.clientY - rect.top)
    if (hora !== null) onClicLibre(dia, hora, event)
  }

  return (
    <div
      data-columna={dia.fecha}
      onClick={alPulsar}
      onDragOver={(event) => onSobrevolar(dia, event)}
      onDrop={(event) => { event.preventDefault(); onSoltar(dia, event) }}
      style={{ height: alto }}
      className={`relative overflow-hidden rounded-lg border ${dia.esHoy ? 'border-azul-500/60' : 'border-antracita-700'} ${cerrado ? 'cursor-not-allowed' : 'cursor-cell'}`}
    >
      {zonas.map((zona, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{ top: (zona.desde - inicioEje) * ESCALA_PX, height: (zona.hasta - zona.desde) * ESCALA_PX, backgroundImage: RAYADO }}
          className="pointer-events-none absolute inset-x-0 bg-antracita-900/60"
        />
      ))}

      {dia.bloques.map((bloque) => (
        <BloqueTrabajo
          key={bloque.id}
          bloque={bloque}
          tramos={dia.tramos}
          inicioEje={inicioEje}
          diaCerrado={cerrado}
          onAbrir={onAbrir}
          onArrastrarInicio={onArrastrarInicio}
          onArrastrarFin={onArrastrarFin}
        />
      ))}

      {destino !== null && (
        <div aria-hidden="true" style={{ top: (destino - inicioEje) * ESCALA_PX }} className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-azul-400" />
      )}

      {ahora !== null && ahora >= inicioEje && ahora <= finEje && (
        <div aria-hidden="true" title="Ahora" style={{ top: (ahora - inicioEje) * ESCALA_PX }} className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-naranja-500">
          <span className="absolute -left-0.5 -top-[5px] h-2 w-2 rounded-full bg-naranja-500" />
        </div>
      )}
    </div>
  )
}
