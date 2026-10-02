import { useNavigate } from 'react-router-dom'
import EstadoBadge from './EstadoBadge.jsx'
import { formatearEuros, formatearFecha } from '../lib/ordenes.js'

// Tabla con el historial de reparaciones de un cliente o de una bicicleta.
// Cada fila abre la orden correspondiente. `mostrarBicicleta` oculta la
// columna de la bicicleta cuando ya estamos viendo una en concreto.
export default function HistorialReparaciones({ ordenes = [], mostrarBicicleta = true }) {
  const navigate = useNavigate()

  if (ordenes.length === 0) {
    return <p className="rounded-xl border border-antracita-700 bg-antracita-900/40 px-4 py-6 text-sm text-slate-400">Todavía no hay órdenes de reparación.</p>
  }

  return (
    <div className="overflow-hidden rounded-xl border border-antracita-700">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-antracita-700 bg-antracita-900/40 text-xs uppercase tracking-wide text-slate-500"><tr>
            <th className="px-5 py-4">Nº</th><th className="px-5 py-4">Entrada</th>
            {mostrarBicicleta && <th className="px-5 py-4">Bici</th>}
            <th className="px-5 py-4">Estado</th><th className="px-5 py-4 text-right">Total</th>
          </tr></thead>
          <tbody className="divide-y divide-antracita-700/80">
            {ordenes.map((orden) => (
              <tr key={orden.id} onClick={() => navigate(`/ordenes/${orden.id}`)} className="cursor-pointer hover:bg-antracita-700/30">
                <td className="px-5 py-4 font-medium text-white">{orden.numeroOrden}</td>
                <td className="px-5 py-4 text-slate-400">{formatearFecha(orden.fechaEntrada)}</td>
                {mostrarBicicleta && <td className="px-5 py-4 text-slate-400">{orden.bicicleta ? `${orden.bicicleta.marca}${orden.bicicleta.modelo ? ` ${orden.bicicleta.modelo}` : ''}` : '—'}</td>}
                <td className="px-5 py-4"><EstadoBadge estado={orden.estado} /></td>
                <td className="px-5 py-4 text-right font-medium text-white">{formatearEuros(orden.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
