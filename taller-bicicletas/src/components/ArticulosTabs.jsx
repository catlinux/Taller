import { NavLink } from 'react-router-dom'

// Pestañas del apartado de Artículos. Es un array fácil de ampliar (por ejemplo,
// más adelante se añadirá una pestaña «Consumo»).
const PESTANAS = [
  { to: '/articulos', etiqueta: 'Catálogo', end: true },
  { to: '/articulos/obsoletos', etiqueta: 'Obsoletos', end: false },
]

// Navegación de pestañas de Artículos, con estilo de subrayado válido en modo
// claro y oscuro.
export default function ArticulosTabs() {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-antracita-800" aria-label="Secciones de artículos">
      {PESTANAS.map((pestana) => (
        <NavLink
          key={pestana.to}
          to={pestana.to}
          end={pestana.end}
          className={({ isActive }) => `whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${
            isActive ? 'border-azul-500 text-azul-300' : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          {pestana.etiqueta}
        </NavLink>
      ))}
    </nav>
  )
}
