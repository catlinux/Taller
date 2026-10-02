import { useState } from 'react'
import { useQueryClient } from 'react-query'
import { useAuth } from '../context/AuthContext.jsx'
import { useAjustes } from '../context/AjustesContext.jsx'
import { apiRequest } from '../lib/api.js'

const PIN_VALIDO = /^\d{4,6}$/

// Modal para gestionar el PIN del usuario: crearlo, cambiarlo o quitarlo.
// Siempre exige la contraseña actual (el servidor la verifica).
export default function PinModal({ onClose }) {
  const { token, user } = useAuth()
  const { ajustes } = useAjustes()
  const queryClient = useQueryClient()

  const tienePin = Boolean(user?.tienePin)
  const [modo, setModo] = useState(tienePin ? 'cambiar' : 'crear')
  const [pin, setPin] = useState('')
  const [repetir, setRepetir] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Solo se ofrece crear un PIN si el ajuste está activado.
  const pinDesactivado = !tienePin && !ajustes.pinActivado

  // Refresca el usuario en la caché de react-query para que `tienePin` cambie.
  function actualizarUsuario(valor) {
    queryClient.setQueryData(['auth', 'me', token], (actual) => ({
      ...(actual ?? {}),
      user: { ...(actual?.user ?? {}), tienePin: valor },
    }))
  }

  async function enviar(event) {
    event.preventDefault()
    setError('')

    if (modo !== 'quitar') {
      if (!PIN_VALIDO.test(pin)) {
        setError('El PIN debe tener entre 4 y 6 dígitos.')
        return
      }
      if (pin !== repetir) {
        setError('Los dos PIN no coinciden.')
        return
      }
    }
    if (!password) {
      setError('Escribe tu contraseña actual.')
      return
    }

    setGuardando(true)
    try {
      if (modo === 'quitar') {
        await apiRequest('/api/auth/pin', token, {
          method: 'DELETE',
          body: JSON.stringify({ password }),
          sinEventoExpirado: true,
        })
        actualizarUsuario(false)
      } else {
        await apiRequest('/api/auth/pin', token, {
          method: 'PUT',
          body: JSON.stringify({ pin, password }),
          sinEventoExpirado: true,
        })
        actualizarUsuario(true)
      }
      onClose()
    } catch (e) {
      setError(e?.message || 'No se pudo completar la operación.')
      setGuardando(false)
    }
  }

  const titulo = modo === 'quitar' ? 'Quitar PIN' : tienePin ? 'Cambiar PIN' : 'Crear PIN'
  const textoBoton = modo === 'quitar' ? 'Quitar PIN' : tienePin ? 'Guardar PIN' : 'Crear PIN'

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !guardando) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-modal-title"
        className="my-auto w-full max-w-md rounded-2xl border border-antracita-700 bg-antracita-800 p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="pin-modal-title" className="text-xl font-semibold text-white">
            {titulo}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg px-3 py-2 text-slate-400 hover:bg-antracita-700 hover:text-white"
          >
            ×
          </button>
        </div>

        {pinDesactivado ? (
          <p role="status" className="rounded-lg border border-antracita-700 bg-antracita-900/60 px-4 py-3 text-sm text-slate-400">
            El PIN está desactivado en Configuración.
          </p>
        ) : (
          <>
            {tienePin && (
              <div className="mb-5 flex gap-1 rounded-lg border border-antracita-700 bg-antracita-900/60 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setModo('cambiar')
                    setError('')
                  }}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                    modo === 'cambiar' ? 'bg-azul-500/15 text-azul-300' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Cambiar PIN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModo('quitar')
                    setError('')
                  }}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                    modo === 'quitar' ? 'bg-azul-500/15 text-azul-300' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Quitar PIN
                </button>
              </div>
            )}

            <form onSubmit={enviar} className="space-y-4">
              {modo !== 'quitar' && (
                <>
                  <label className="block">
                    <span className="label">PIN nuevo</span>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={6}
                      value={pin}
                      onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
                      className="input mt-2 tracking-[0.5em]"
                    />
                    <span className="mt-1 block text-xs text-slate-500">Entre 4 y 6 dígitos.</span>
                  </label>
                  <label className="block">
                    <span className="label">Repetir PIN</span>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={6}
                      value={repetir}
                      onChange={(event) => setRepetir(event.target.value.replace(/\D/g, ''))}
                      className="input mt-2 tracking-[0.5em]"
                    />
                  </label>
                </>
              )}
              <label className="block">
                <span className="label">Contraseña actual</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="input mt-2"
                />
              </label>

              {error && (
                <p role="alert" className="rounded-lg border border-peligro/40 bg-peligro/10 px-4 py-3 text-sm text-peligro">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={onClose} className="btn-secondary" disabled={guardando}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={guardando}>
                  {guardando ? 'Guardando…' : textoBoton}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  )
}
