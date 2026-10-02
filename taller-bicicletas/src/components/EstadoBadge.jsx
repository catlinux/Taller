import { estadoInfo } from '../lib/ordenes.js'

// Pastilla de color con la etiqueta visible del estado de una orden.
export default function EstadoBadge({ estado }) {
  const info = estadoInfo(estado)
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${info.clase}`}>{info.etiqueta}</span>
}
