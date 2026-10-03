import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiGet } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useAjustes } from '../context/AjustesContext.jsx'

// Clave de sesión que marca que hay que mostrar la intro (la pone Login tras entrar).
export const CLAVE_INTRO_SESION = 'taller_intro'
// Ajuste persistente: 'off' desactiva la animación de bienvenida.
const CLAVE_INTRO_AJUSTE = 'taller_intro'

// La pantalla de Configuración usará esta función: por defecto la intro está activada.
export function introActivada() {
  try {
    return localStorage.getItem(CLAVE_INTRO_AJUSTE) !== 'off'
  } catch {
    return true
  }
}

// Nombre del evento que Layout escucha para volver a reproducir la animación
// (por ejemplo, desde el botón «Ver la animación ahora» de Configuración).
export const EVENTO_REPRODUCIR_INTRO = 'intro:reproducir'

// Dispara la reproducción de la animación de bienvenida.
export function reproducirIntro() {
  window.dispatchEvent(new Event(EVENTO_REPRODUCIR_INTRO))
}

// Variante en forma de hook que además respeta el ajuste del servidor: si
// ajustes.introActivada es false, la animación no se muestra.
export function useIntroActivada() {
  const { ajustes } = useAjustes()
  if (ajustes?.introActivada === false) return false
  return introActivada()
}

// Saludo según la hora del día, usando solo el primer nombre.
function saludoSegunHora(primerNombre) {
  const hora = new Date().getHours()
  const base = hora >= 6 && hora < 13 ? 'Buenos días' : hora >= 13 && hora < 20 ? 'Buenas tardes' : 'Buenas noches'
  return primerNombre ? `${base}, ${primerNombre}` : base
}

// Detecta si el usuario pide reducir el movimiento.
function useMovimientoReducido() {
  const [reducido, setReducido] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)')
    const manejar = () => setReducido(consulta.matches)
    consulta.addEventListener?.('change', manejar)
    return () => consulta.removeEventListener?.('change', manejar)
  }, [])
  return reducido
}

// Traza los radios de una rueda como líneas finas.
function radios(cx, cy, r, cantidad) {
  const lineas = []
  for (let i = 0; i < cantidad; i += 1) {
    const angulo = (Math.PI * 2 * i) / cantidad
    lineas.push([cx, cy, cx + r * Math.cos(angulo), cy + r * Math.sin(angulo)])
  }
  return lineas
}

const PARTICULAS = [
  { left: -30, bottom: 60, delay: 0.9 },
  { left: -70, bottom: 40, delay: 1.3 },
  { left: -110, bottom: 66, delay: 1.7 },
  { left: -150, bottom: 46, delay: 2.1 },
  { left: -190, bottom: 62, delay: 2.5 },
  { left: -230, bottom: 44, delay: 2.9 },
]

// Una rueda: neumático + radios, girando sobre su propio centro.
function Rueda({ cx, cy }) {
  return (
    <g className="intro-rueda" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
      <circle cx={cx} cy={cy} r={44} pathLength="1" className="intro-dibujo" />
      {radios(cx, cy, 40, 8).map(([x1, y1, x2, y2], indice) => (
        <line key={indice} x1={x1} y1={y1} x2={x2} y2={y2} className="intro-dibujo" pathLength="1" />
      ))}
    </g>
  )
}

export default function IntroBienvenida({ nombre, onTerminar }) {
  const { token } = useAuth()
  const reducido = useMovimientoReducido()

  const primerNombre = (nombre || '').trim().split(/\s+/)[0] || ''
  const saludo = useMemo(() => saludoSegunHora(primerNombre), [primerNombre])
  const palabras = saludo.split(' ')

  const [faseContadores, setFaseContadores] = useState(false)
  const [saliendo, setSaliendo] = useState(false)
  const [salidaRapida, setSalidaRapida] = useState(false)
  const [metricas, setMetricas] = useState(undefined) // undefined = cargando, null = sin datos
  const [contadores, setContadores] = useState({ taller: 0, vencidas: 0, avisar: 0 })

  const finalizadoRef = useRef(false)
  const timersRef = useRef([])
  const saliendoRef = useRef(false)

  const programar = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms)
    timersRef.current.push(id)
    return id
  }, [])

  const terminar = useCallback(() => {
    if (finalizadoRef.current) return
    finalizadoRef.current = true
    onTerminar?.()
  }, [onTerminar])

  const saltar = useCallback(() => {
    if (finalizadoRef.current || saliendoRef.current) return
    saliendoRef.current = true
    setFaseContadores(true)
    setSalidaRapida(true)
    setSaliendo(true)
    programar(terminar, 260)
  }, [programar, terminar])

  // Métricas del tablero; si tarda más de 1,5 s o falla, se muestran guiones.
  useEffect(() => {
    if (!token) {
      setMetricas(null)
      return undefined
    }
    let resuelto = false
    const temporizador = setTimeout(() => {
      if (resuelto) return
      resuelto = true
      setMetricas(null)
    }, 1500)
    apiGet('/api/dashboard', token)
      .then((data) => {
        if (resuelto) return
        resuelto = true
        clearTimeout(temporizador)
        const conteo = data?.conteoPorEstado ?? {}
        setMetricas({
          taller: (conteo.Pendiente ?? 0) + (conteo.EnReparacion ?? 0) + (conteo.EsperandoMaterial ?? 0),
          vencidas: data?.vencidas ?? 0,
          avisar: data?.finalizadasSinAvisar ?? 0,
        })
      })
      .catch(() => {
        if (resuelto) return
        resuelto = true
        clearTimeout(temporizador)
        setMetricas(null)
      })
    return () => clearTimeout(temporizador)
  }, [token])

  // Coreografía: fases y llamada final (o secuencia reducida).
  useEffect(() => {
    if (reducido) {
      setFaseContadores(true)
      programar(() => {
        saliendoRef.current = true
        setSaliendo(true)
      }, 800)
      programar(terminar, 1600)
    } else {
      programar(() => setFaseContadores(true), 4000)
      programar(() => {
        saliendoRef.current = true
        setSaliendo(true)
      }, 6400)
      programar(terminar, 8000)
    }
    const timers = timersRef.current
    return () => {
      timers.forEach((id) => clearTimeout(id))
    }
  }, [reducido, programar, terminar])

  // Contadores: cuentan de 0 a su valor en ~900 ms con ease-out usando requestAnimationFrame.
  useEffect(() => {
    if (!faseContadores || reducido || !metricas) return undefined
    let frame = 0
    const inicio = performance.now()
    const duracion = 900
    const objetivo = metricas
    const paso = (ahora) => {
      const progreso = Math.min(1, (ahora - inicio) / duracion)
      const suavizado = 1 - (1 - progreso) ** 3
      setContadores({
        taller: Math.round(objetivo.taller * suavizado),
        vencidas: Math.round(objetivo.vencidas * suavizado),
        avisar: Math.round(objetivo.avisar * suavizado),
      })
      if (progreso < 1) frame = requestAnimationFrame(paso)
    }
    frame = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(frame)
  }, [faseContadores, reducido, metricas])

  // En modo reducido los contadores muestran ya su valor final.
  useEffect(() => {
    if (reducido && metricas) setContadores(metricas)
  }, [reducido, metricas])

  // Saltar con teclado (Enter, Espacio o Esc).
  useEffect(() => {
    const alPulsar = (evento) => {
      if (evento.key === 'Enter' || evento.key === ' ' || evento.key === 'Spacebar' || evento.key === 'Escape') {
        evento.preventDefault()
        saltar()
      }
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [saltar])

  const valor = (clave) => (metricas ? contadores[clave] : '—')
  const vencidasNaranja = Boolean(metricas && metricas.vencidas > 0)
  const clasesSalida = saliendo ? (salidaRapida ? 'intro-salida-rapida' : 'intro-salida') : ''
  const retardoSubtitulo = 4000 + palabras.length * 80 + 160

  const tarjetas = [
    { clave: 'taller', etiqueta: 'En el taller', naranja: false },
    { clave: 'vencidas', etiqueta: 'Vencidas', naranja: vencidasNaranja },
    { clave: 'avisar', etiqueta: 'Para avisar', naranja: false },
  ]

  return (
    <div
      onClick={saltar}
      className={`intro-overlay fixed inset-0 z-[100] overflow-hidden bg-antracita-950 ${reducido ? 'intro-reducido' : ''} ${clasesSalida}`}
    >
      <div className="intro-fondo pointer-events-none absolute inset-0" aria-hidden="true" />

      <p role="status" aria-live="polite" className="sr-only">
        {saludo}
      </p>

      <div className="intro-decorativo pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="intro-bici absolute bottom-[14%] left-0 h-[180px] w-[320px]">
          <div className="intro-estela absolute bottom-[54px] left-[-360px] h-[3px] w-[360px]" />
          {PARTICULAS.map((particula, indice) => (
            <span
              key={indice}
              className="intro-particula absolute h-2 w-2 rounded-full"
              style={{ left: `${particula.left}px`, bottom: `${particula.bottom}px`, animationDelay: `${particula.delay}s` }}
            />
          ))}
          <svg viewBox="0 0 320 180" width="320" height="180" fill="none" stroke="#6AA6FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="intro-bici-svg relative">
            <Rueda cx={70} cy={120} />
            <Rueda cx={250} cy={120} />
            <path className="intro-dibujo" pathLength="1" d="M70 120 L160 120 L238 70 M160 120 L146 58 L238 70 M146 58 L70 120 M238 70 L250 120" />
            <path className="intro-dibujo" pathLength="1" d="M146 58 L141 48 M132 46 L154 45" />
            <path className="intro-dibujo" pathLength="1" d="M238 70 L247 57 M236 55 L258 58" />
            <circle className="intro-dibujo" cx={160} cy={120} r={9} pathLength="1" />
            <path className="intro-dibujo" pathLength="1" d="M160 120 L160 132 M154 130 L166 134" />
          </svg>
        </div>
      </div>

      <div className="intro-escena absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 pb-24 text-center">
        <div className="intro-logo relative" aria-hidden="true">
          <span className="intro-destello pointer-events-none absolute inset-0 -z-10 rounded-full" />
          <svg viewBox="0 0 96 96" width="96" height="96" className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <defs>
              <linearGradient id="introAnilloGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6AA6FF" />
                <stop offset="100%" stopColor="#FF7A2F" />
              </linearGradient>
            </defs>
            <circle cx="48" cy="48" r="44" fill="none" stroke="url(#introAnilloGrad)" strokeWidth="2.5" strokeLinecap="round" pathLength="1" className="intro-anillo" />
          </svg>
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-white p-2 shadow-suave">
            <img src="/icons/logo.png" alt="" className="h-full w-full object-contain" />
          </span>
        </div>

        <div>
          <h2 className="intro-saludo text-2xl font-bold tracking-tight text-white sm:text-4xl" aria-hidden="true">
            {palabras.map((palabra, indice) => (
              <span key={indice} className="intro-palabra intro-anim mr-[0.28em] inline-block" style={{ animationDelay: `${4000 + indice * 80}ms` }}>
                {palabra}
              </span>
            ))}
          </h2>
          <p className="intro-subtitulo intro-anim mt-3 text-sm text-slate-400" aria-hidden="true" style={{ animationDelay: `${retardoSubtitulo}ms` }}>
            Vamos a ponernos manos a la obra
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {tarjetas.map((tarjeta, indice) => (
            <div
              key={tarjeta.clave}
              className="intro-tarjeta intro-anim min-w-[120px] rounded-xl border border-antracita-700 bg-antracita-800/60 px-5 py-3"
              aria-hidden="true"
              style={{ animationDelay: `${4300 + indice * 120}ms` }}
            >
              <p className={`text-2xl font-bold tabular-nums ${tarjeta.naranja ? 'text-naranja-400' : 'text-white'}`}>{valor(tarjeta.clave)}</p>
              <p className="mt-0.5 text-xs text-slate-400">{tarjeta.etiqueta}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="intro-pista intro-anim pointer-events-none absolute bottom-6 right-6 text-xs text-slate-500" aria-hidden="true">
        Pulsa cualquier tecla para saltar
      </p>
    </div>
  )
}

