import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useAjustes } from '../context/AjustesContext.jsx'
import { useBloqueo } from '../context/BloqueoContext.jsx'
import IntroBienvenida, { EVENTO_REPRODUCIR_INTRO, introActivada, useIntroActivada } from './IntroBienvenida.jsx'
import PantallaBloqueo from './PantallaBloqueo.jsx'
import ModoBadge from './ModoBadge.jsx'
import ModoColorBoton from './ModoColorBoton.jsx'
import PinModal from './PinModal.jsx'
import AvisoActualizacion from './AvisoActualizacion.jsx'
import {
  IconTaller,
  IconOrdenes,
  IconClientes,
  IconBicis,
  IconArticulos,
  IconAjustes,
  IconSalir,
  IconMenu,
  IconSeguridad,
  IconCandado,
  IconAviso,
} from './Icons.jsx'

// Avisa cuando queden 5 minutos o menos para que caduque el token de sesión.
const AVISO_SESION_MS = 5 * 60 * 1000

// Navegación principal del taller.
const navPrincipal = [
  { to: '/', end: true, label: 'Taller', icon: IconTaller },
  { to: '/ordenes', label: 'Órdenes', icon: IconOrdenes },
  { to: '/clientes', label: 'Clientes', icon: IconClientes },
  { to: '/bicicletas', label: 'Bicicletas', icon: IconBicis },
  { to: '/articulos', label: 'Artículos', icon: IconArticulos },
]

// Grupo Sistema.
const navSistema = [
  { to: '/configuracion', label: 'Configuración', icon: IconAjustes },
]

const todasLasRutas = [...navPrincipal, ...navSistema]

// Devuelve el título de la sección según la ruta actual.
function tituloDeRuta(pathname) {
  const coincidencia = todasLasRutas.find((enlace) => enlace.to !== '/' && pathname.startsWith(enlace.to))
  return coincidencia?.label ?? 'Taller'
}

// Iniciales del usuario para el avatar.
function iniciales(nombre) {
  return (nombre || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((palabra) => palabra[0] ?? '')
    .join('')
    .toUpperCase() || '?'
}

function claseEnlace({ isActive }) {
  return `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
    isActive ? 'bg-azul-500/10 text-azul-300' : 'text-slate-400 hover:bg-antracita-800 hover:text-white'
  }`
}

function EnlaceNav({ enlace }) {
  const Icono = enlace.icon
  return (
    <NavLink to={enlace.to} end={enlace.end} className={claseEnlace}>
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-naranja-500" />}
          <Icono size={20} className={isActive ? 'text-azul-400' : 'text-slate-500 group-hover:text-slate-300'} />
          <span>{enlace.label}</span>
        </>
      )}
    </NavLink>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { ajustes } = useAjustes()
  const { bloqueado, bloquearAhora } = useBloqueo()
  const introPermitida = useIntroActivada()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false)
  const [pinModalAbierto, setPinModalAbierto] = useState(false)
  const [avisoSesion, setAvisoSesion] = useState(null)
  const { pathname } = useLocation()
  // Animación de bienvenida: solo si se acaba de iniciar sesión y no está desactivada.
  const [mostrarIntro, setMostrarIntro] = useState(() => {
    try {
      return sessionStorage.getItem('taller_intro') === '1' && introActivada()
    } catch {
      return false
    }
  })

  // Si el ajuste del servidor desactiva la intro, se oculta en cuanto llega.
  useEffect(() => {
    if (!introPermitida) setMostrarIntro(false)
  }, [introPermitida])

  // Vuelve a reproducir la animación cuando Configuración > Apariencia lo pide
  // (botón «Ver la animación ahora»).
  useEffect(() => {
    function reproducir() {
      setMostrarIntro(true)
    }
    window.addEventListener(EVENTO_REPRODUCIR_INTRO, reproducir)
    return () => window.removeEventListener(EVENTO_REPRODUCIR_INTRO, reproducir)
  }, [])

  // Avisa antes de que caduque el token: comprueba la expiración guardada en
  // localStorage (taller_expira) una vez por minuto. El aviso descartado no se
  // vuelve a mostrar hasta que cambie la fecha de caducidad.
  const avisoDescartado = useRef(null)
  useEffect(() => {
    function comprobar() {
      try {
        const expira = localStorage.getItem('taller_expira')
        if (!expira) {
          setAvisoSesion(null)
          return
        }
        if (avisoDescartado.current && avisoDescartado.current !== expira) avisoDescartado.current = null
        const restante = new Date(expira).getTime() - Date.now()
        const enAviso = restante > 0 && restante <= AVISO_SESION_MS
        if (enAviso && avisoDescartado.current === expira) return
        if (enAviso) avisoDescartado.current = null
        setAvisoSesion(enAviso ? restante : null)
      } catch {
        setAvisoSesion(null)
      }
    }
    comprobar()
    const id = window.setInterval(comprobar, 60000)
    return () => window.clearInterval(id)
  }, [user])

  function descartarAviso() {
    try {
      avisoDescartado.current = localStorage.getItem('taller_expira')
    } catch {
      avisoDescartado.current = null
    }
    setAvisoSesion(null)
  }

  function terminarIntro() {
    try {
      sessionStorage.removeItem('taller_intro')
    } catch {
      /* nada que limpiar */
    }
    setMostrarIntro(false)
  }

  const nombre = user?.nombre || user?.username || ''
  const rol = user?.rol === 'admin' ? 'Administrador' : 'Mecánico'
  const fechaHoy = (() => {
    const texto = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    return texto.charAt(0).toUpperCase() + texto.slice(1)
  })()

  return (
    <div className="min-h-screen text-slate-100 md:flex">
      {mostrarIntro && <IntroBienvenida nombre={nombre} onTerminar={terminarIntro} />}

      {menuAbierto && (
        <div onClick={() => setMenuAbierto(false)} className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden" aria-hidden="true" />
      )}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-antracita-800 bg-antracita-900 p-4 transition-transform duration-200 md:sticky md:top-0 md:z-auto md:h-screen md:shrink-0 md:self-start md:overflow-hidden md:translate-x-0 ${menuAbierto ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-6 flex items-center gap-3 px-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-1.5 shadow-suave">
            <img src="/icons/logo.png" alt="Logo" className="h-full w-full object-contain" />
          </span>
          <span>
            <span className="block text-sm font-semibold leading-tight text-white">Taller</span>
            <span className="block text-xs text-slate-500">Taller</span>
          </span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto" onClick={() => setMenuAbierto(false)}>
          {navPrincipal.map((enlace) => (
            <EnlaceNav key={enlace.to} enlace={enlace} />
          ))}
          <div className="my-3 border-t border-antracita-800" />
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Sistema</p>
          {navSistema.map((enlace) => (
            <EnlaceNav key={enlace.to} enlace={enlace} />
          ))}
        </nav>

        <div className="relative mt-4">
          {menuUsuarioAbierto && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuUsuarioAbierto(false)} aria-hidden="true" />
              <div role="menu" className="absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-xl border border-antracita-700 bg-antracita-800 p-1 shadow-suave">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuUsuarioAbierto(false); setPinModalAbierto(true) }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-antracita-700"
                >
                  <IconSeguridad size={16} className="text-slate-400" />
                  {user?.tienePin ? 'Gestionar PIN' : 'Crear PIN'}
                </button>
                {user?.tienePin && ajustes.pinActivado && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuUsuarioAbierto(false); bloquearAhora() }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-antracita-700"
                  >
                    <IconCandado size={16} className="text-slate-400" />
                    Bloquear ahora
                  </button>
                )}
                <div className="my-1 border-t border-antracita-700" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuUsuarioAbierto(false); logout() }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-peligro transition hover:bg-antracita-700"
                >
                  <IconSalir size={16} />
                  Cerrar sesión
                </button>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setMenuUsuarioAbierto((abierto) => !abierto)}
            aria-haspopup="menu"
            aria-expanded={menuUsuarioAbierto}
            className="flex w-full items-center gap-3 rounded-xl border border-antracita-800 bg-antracita-800/60 p-3 text-left transition hover:border-antracita-700"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-azul-400 to-azul-600 text-xs font-semibold text-white mantener-blanco">
              {iniciales(nombre)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">{nombre}</span>
              <span className="block truncate text-xs text-slate-500">{rol}</span>
            </span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-antracita-800 bg-antracita-950/80 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setMenuAbierto(true)} className="rounded-lg border border-antracita-700 p-2 text-slate-300 transition hover:bg-antracita-800 md:hidden" aria-label="Abrir menú">
              <IconMenu size={20} />
            </button>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Taller</p>
              <h1 className="text-base font-semibold text-white">{tituloDeRuta(pathname)}</h1>
            </div>
            <ModoBadge />
          </div>
          <div className="flex items-center gap-3">
            <ModoColorBoton />
            <div className="text-right">
            <p className="text-sm font-medium text-slate-200">{nombre}</p>
            <p className="text-xs text-slate-500">{fechaHoy}</p>
            </div>
          </div>
        </header>
        {user?.rol === 'admin' && <AvisoActualizacion />}
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>

      {avisoSesion != null && (
        <div role="alert" className="fixed bottom-4 right-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] items-start gap-3 rounded-xl border border-naranja-500/40 bg-antracita-800 px-4 py-3 shadow-suave">
          <IconAviso size={20} className="mt-0.5 shrink-0 text-naranja-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white">Tu sesión está a punto de caducar</p>
            <p className="mt-0.5 text-xs text-slate-400">
              Quedan menos de {Math.max(1, Math.ceil(avisoSesion / 60000))} minutos. Guarda tu trabajo y vuelve a iniciar sesión.
            </p>
          </div>
          <button
            type="button"
            onClick={descartarAviso}
            aria-label="Descartar aviso"
            className="shrink-0 rounded-lg px-2 text-lg leading-none text-slate-500 transition hover:bg-antracita-700 hover:text-white"
          >
            ×
          </button>
        </div>
      )}

      {pinModalAbierto && <PinModal onClose={() => setPinModalAbierto(false)} />}
      {bloqueado && <PantallaBloqueo />}
    </div>
  )
}


