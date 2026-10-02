import { formaPagoInfo } from '../lib/pagos.js'

// Insignia de color con el valor unificado de la forma de pago de una orden.
export default function PagoBadge({ formaPago }) {
  const info = formaPagoInfo(formaPago)
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${info.clase}`}>{info.etiqueta}</span>
}
