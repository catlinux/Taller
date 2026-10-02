import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useBloqueo } from '../context/BloqueoContext.jsx'
import { IconBorrar } from './Icons.jsx'

const MAX_DIGITOS = 6

// Pantalla de bloqueo a pantalla completa que pide el PIN del usuario. Se muestra
// cuando el BloqueoContext detecta inactividad. Admite el teclado numérico táctil
// y el teclado físico (dígitos, Retroceso y Enter).
export default function PantallaBloqueo() {
  const { user, logout } = useAuth()
  const { desbloquear } = useBloqueo()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [sacudir, setSacudir] = useState(false)

  const nombre = (user?.nombre || user?.username || '').trim()
  const primerNombre = nombre.split(/\s+/)[0] || ''

  const intentar = useCallback(
    async (valor) => {
      const codigo = valor ?? pin
      if (!codigo || cargando) return
      setCargando(true)
      setError('')
      const resultado = await desbloquear(codigo)
      if (resultado.ok) return
      setPin('')
      if (resultado.cerrarSesion) {
        setError('Demasiados intentos. Se cerrará la sesión.')
      } else {
        setError(
          resultado.intentosRestantes != null
            ? `PIN incorrecto. Te quedan ${resultado.intentosRestantes} ${
                resultado.intentosRestantes === 1 ? 'intento' : 'intentos'
              }.`
            : resultado.error || 'PIN incorrecto.',
        )
        setSacudir(true)
        window.setTimeout(() => setSacudir(false), 500)
      }
      setCargando(false)
    },
    [pin, cargando, desbloquear],
  )

  // Intento automático al completar los 6 dígitos (no se conoce la longitud real).
  useEffect(() => {
    if (pin.length === MAX_DIGITOS) intentar(pin)
  }, [pin, intentar])

  // Teclado físico.
  useEffect(() => {
    function alPulsar(event) {
      if (event.key >= '0' && event.key <= '9') {
        event.preventDefault()
        setPin((actual) => (actual.length < MAX_DIGITOS ? actual + event.key : actual))
        setError('')
      } else if (event.key === 'Backspace') {
        event.preventDefault()
        setPin((actual) => actual.slice(0, -1))
        setError('')
      } else if (event.key === 'Enter') {
        event.preventDefault()
        intentar()
      }
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [intentar])

  function teclear(digito) {
    if (cargando) return
    setPin((actual) => (actual.length < MAX_DIGITOS ? actual + digito : actual))
    setError('')
  }

  function borrar() {
    if (cargando) return
    setPin((actual) => actual.slice(0, -1))
    setError('')
  }

  const totalPuntos = Math.max(4, pin.length)
  const puedeDesbloquear = pin.length >= 4 && !cargando

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sesión bloqueada"
      className="fixed inset-0 z-[110] flex flex-col items-center justify-center overflow-y-auto bg-antracita-950 px-6 py-10"
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{ backgroundImage: 'radial-gradient(circle at 50% 28%, rgb(var(--acento-500) / 0.18), transparent 60%)' }}
      />

      <div className="relative flex w-full max-w-sm flex-col items-center text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-2 shadow-suave">
          <img src="/icons/logo.png" alt="Logo" className="h-full w-full object-contain" />
        </span>

        <h1 className="mt-6 text-2xl font-bold text-white">Sesión bloqueada</h1>
        <p className="mt-2 text-sm text-slate-400">Hola, {primerNombre}. Introduce tu PIN para continuar.</p>

        <div
          className={`mt-8 flex items-center justify-center gap-4 ${sacudir ? 'pin-sacudida' : ''}`}
          aria-hidden="true"
        >
          {Array.from({ length: totalPuntos }, (_, indice) => (
            <span
              key={indice}
              className={`h-4 w-4 rounded-full border transition ${
                indice < pin.length ? 'border-azul-400 bg-azul-400' : 'border-antracita-600 bg-transparent'
              }`}
            />
          ))}
        </div>

        <p role="alert" aria-live="assertive" className="mt-4 min-h-[20px] text-sm text-peligro">
          {error}
        </p>

        <div className="mt-4 grid w-full grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digito) => (
            <button
              key={digito}
              type="button"
              onClick={() => teclear(String(digito))}
              disabled={cargando}
              className="flex h-[72px] items-center justify-center rounded-2xl border border-antracita-700 bg-antracita-800/80 text-2xl font-medium text-white transition hover:bg-antracita-700 active:scale-95 disabled:opacity-50"
            >
              {digito}
            </button>
          ))}
          <span aria-hidden="true" />
          <button
            type="button"
            onClick={() => teclear('0')}
            disabled={cargando}
            className="flex h-[72px] items-center justify-center rounded-2xl border border-antracita-700 bg-antracita-800/80 text-2xl font-medium text-white transition hover:bg-antracita-700 active:scale-95 disabled:opacity-50"
          >
            0
          </button>
          <button
            type="button"
            onClick={borrar}
            disabled={cargando}
            aria-label="Borrar"
            className="flex h-[72px] items-center justify-center rounded-2xl border border-antracita-700 bg-antracita-800/80 text-slate-300 transition hover:bg-antracita-700 active:scale-95 disabled:opacity-50"
          >
            <IconBorrar size={24} />
          </button>
        </div>

        <button type="button" onClick={() => intentar()} disabled={!puedeDesbloquear} className="btn-primary mt-5 w-full">
          {cargando ? 'Comprobando…' : 'Desbloquear'}
        </button>
        <button type="button" onClick={logout} className="btn-ghost mt-2 w-full">
          Usar contraseña
        </button>
      </div>
    </div>
  )
}
