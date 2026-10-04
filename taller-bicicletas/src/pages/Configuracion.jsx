import { Navigate, NavLink, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import MecanicosPanel from '../components/config/MecanicosPanel.jsx'
import TablasPanel from '../components/config/TablasPanel.jsx'
import AparienciaPanel from '../components/config/AparienciaPanel.jsx'
import TallerPanel from '../components/config/TallerPanel.jsx'
import DatosPanel from '../components/config/DatosPanel.jsx'
import SeguridadPanel from '../components/config/SeguridadPanel.jsx'
import ActualizacionesPanel from '../components/config/ActualizacionesPanel.jsx'
import Empresa from './Empresa.jsx'
import Operaciones from './Operaciones.jsx'
import Usuarios from './Usuarios.jsx'
import Backups from './Backups.jsx'
import {
  IconClientes,
  IconEmpresa,
  IconOrdenes,
  IconUsuario,
  IconCopiar,
  IconTabla,
  IconPaleta,
  IconTaller,
  IconSeguridad,
  IconActualizar,
} from '../components/Icons.jsx'

// Definición de las pestañas de Configuración. `soloAdmin` restringe su
// visibilidad y acceso al rol administrador.
const PESTANAS = [
  { id: 'mecanicos', etiqueta: 'Mecánicos', Icono: IconClientes, soloAdmin: false, contenido: <MecanicosPanel /> },
  { id: 'empresa', etiqueta: 'Empresa', Icono: IconEmpresa, soloAdmin: false, contenido: <Empresa embebido /> },
  { id: 'operaciones', etiqueta: 'Operaciones', Icono: IconOrdenes, soloAdmin: false, contenido: <Operaciones embebido /> },
  {
    id: 'usuarios', etiqueta: 'Usuarios', Icono: IconUsuario, soloAdmin: true, contenido: <Usuarios embebido />,
  },
  {
    id: 'copias', etiqueta: 'Copias de seguridad', Icono: IconCopiar, soloAdmin: true, contenido: <Backups embebido />,
  },
  { id: 'tablas', etiqueta: 'Tablas', Icono: IconTabla, soloAdmin: true, contenido: <TablasPanel /> },
  { id: 'apariencia', etiqueta: 'Apariencia', Icono: IconPaleta, soloAdmin: true, contenido: <AparienciaPanel /> },
  { id: 'taller', etiqueta: 'Taller', Icono: IconTaller, soloAdmin: true, contenido: <TallerPanel /> },
  { id: 'datos', etiqueta: 'Datos', Icono: IconTabla, soloAdmin: true, contenido: <DatosPanel /> },
  { id: 'sesion', etiqueta: 'Sesión y seguridad', Icono: IconSeguridad, soloAdmin: true, contenido: <SeguridadPanel /> },
  {
    id: 'actualizaciones', etiqueta: 'Actualizaciones', Icono: IconActualizar, soloAdmin: true, contenido: <ActualizacionesPanel />,
  },
]

export default function Configuracion() {
  const { user } = useAuth()
  const esAdmin = user?.rol === 'admin'
  const { pestana } = useParams()

  const visibles = PESTANAS.filter((p) => esAdmin || !p.soloAdmin)

  // Redirige a la primera pestaña visible si la de la URL no existe o no es
  // accesible para el usuario actual.
  if (!pestana || !visibles.some((p) => p.id === pestana)) {
    return <Navigate to={`/configuracion/${visibles[0].id}`} replace />
  }

  const activa = visibles.find((p) => p.id === pestana)

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm text-azul-300">Sistema</p>
        <h1 className="mt-1 text-3xl font-bold">Configuración</h1>
        <p className="mt-2 text-slate-400">Ajustes del taller, mecánicos, usuarios y copias de seguridad.</p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <nav className="md:w-60 md:shrink-0" aria-label="Secciones de configuración">
          <ul className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
            {visibles.map((item) => {
              const { Icono } = item
              return (
                <li key={item.id} className="shrink-0">
                  <NavLink
                    to={`/configuracion/${item.id}`}
                    className={({ isActive }) => `flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-azul-500/10 text-azul-300' : 'text-slate-400 hover:bg-antracita-800 hover:text-white'}`}
                  >
                    <Icono size={18} className="shrink-0" />
                    <span>{item.etiqueta}</span>
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="card min-w-0 flex-1 p-5 sm:p-6">
          {activa.contenido}
        </div>
      </div>
    </div>
  )
}
