import { useNavigate } from 'react-router-dom'
import DataTable from './DataTable.jsx'
import EstadoBadge from './EstadoBadge.jsx'
import { formatearEuros, formatearFecha } from '../lib/ordenes.js'

// Tabla con el historial de reparaciones de un cliente o de una bicicleta.
// Cada fila abre la orden correspondiente. `mostrarBicicleta` oculta la
// columna de la bicicleta cuando ya estamos viendo una en concreto.
export default function HistorialReparaciones({ ordenes = [], mostrarBicicleta = true }) {
  const navigate = useNavigate()

  const columnas = [
    { clave: 'numeroOrden', titulo: 'Nº', ancho: '120px', valor: (orden) => orden.numeroOrden, clase: 'font-medium text-white' },
    {
      clave: 'fechaEntrada', titulo: 'Entrada', ancho: '130px', tipo: 'fecha',
      valor: (orden) => orden.fechaEntrada,
      render: (orden) => <span className="block truncate text-slate-400">{formatearFecha(orden.fechaEntrada)}</span>,
    },
    ...(mostrarBicicleta ? [{
      clave: 'bicicleta', titulo: 'Bici', ancho: '220px', clase: 'text-slate-400',
      valor: (orden) => (orden.bicicleta ? `${orden.bicicleta.marca}${orden.bicicleta.modelo ? ` ${orden.bicicleta.modelo}` : ''}` : '—'),
    }] : []),
    {
      clave: 'estado', titulo: 'Estado', ancho: '150px',
      valor: (orden) => orden.estado,
      render: (orden) => <EstadoBadge estado={orden.estado} />,
    },
    {
      clave: 'total', titulo: 'Total', ancho: '120px', tipo: 'numero', alinear: 'der',
      valor: (orden) => orden.total,
      render: (orden) => <span className="block truncate font-medium text-white">{formatearEuros(orden.total)}</span>,
    },
  ]

  return (
    <DataTable
      columnas={columnas}
      filas={ordenes}
      claveFila={(orden) => orden.id}
      onFila={(orden) => navigate(`/ordenes/${orden.id}`)}
      etiquetaPlural="órdenes"
      vacio="Todavía no hay órdenes de reparación."
    />
  )
}
