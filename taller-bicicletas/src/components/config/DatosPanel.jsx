import { useState } from 'react'
import { useMutation, useQuery } from 'react-query'
import { useAuth } from '../../context/AuthContext.jsx'
import { apiGet, apiPut } from '../../lib/api.js'
import { AvisoSoloAdmin } from './comunes.jsx'

const OPCIONES = [
  { modo: 'real', titulo: 'Datos reales', texto: 'La base de datos del taller: clientes, bicicletas y órdenes de verdad.' },
  { modo: 'demo', titulo: 'Datos de prueba', texto: 'Una base independiente con datos inventados, para probar o enseñar la aplicación sin tocar nada real.' },
]

export default function DatosPanel() {
  const { token, user, logout } = useAuth()
  const esAdmin = user?.rol === 'admin'
  const [error, setError] = useState('')

  const { data } = useQuery(['modo-datos', 'admin'], () => apiGet('/api/modo', token), { enabled: esAdmin })
  const modoActivo = data?.modo

  const cambiar = useMutation((modo) => apiPut('/api/modo', token, { modo }), {
    // Cada base tiene sus propios usuarios: se cierra la sesión y se recarga.
    onSuccess: () => {
      logout()
      window.location.assign('/login')
    },
    onError: (e) => setError(e.message),
  })

  const elegir = (opcion) => {
    if (opcion.modo === modoActivo || cambiar.isLoading) return
    setError('')
    const aviso = opcion.modo === 'demo' && !data?.demoExiste ? ' Se creará la base de prueba (tarda unos segundos).' : ''
    if (window.confirm(`¿Cambiar a «${opcion.titulo}»? Se cerrará la sesión y tendrás que volver a entrar.${aviso}`)) {
      cambiar.mutate(opcion.modo)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-white">Datos</h2>
      <p className="mt-1 text-sm text-slate-400">Elige con qué base de datos trabaja la aplicación. Son independientes: lo que hagas en una no afecta a la otra.</p>

      {!esAdmin && <div className="mt-5"><AvisoSoloAdmin /></div>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {OPCIONES.map((opcion) => {
          const activa = opcion.modo === modoActivo
          return (
            <button
              key={opcion.modo}
              type="button"
              disabled={!esAdmin || cambiar.isLoading}
              onClick={() => elegir(opcion)}
              className={`card p-5 text-left transition ${activa ? 'border-azul-500/60 ring-1 ring-azul-500/40' : 'card-hover'} disabled:opacity-60`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="font-semibold text-white">{opcion.titulo}</span>
                {activa && <span className="rounded-full bg-azul-500/10 px-2 py-0.5 text-xs font-medium text-azul-300">En uso</span>}
              </span>
              <span className="mt-2 block text-sm text-slate-400">{opcion.texto}</span>
            </button>
          )
        })}
      </div>

      {cambiar.isLoading && <p className="mt-4 text-sm text-slate-400">Cambiando de base de datos…</p>}
      {error && <p role="alert" className="mt-4 rounded-lg border border-peligro/40 bg-peligro/10 px-4 py-3 text-sm text-peligro">{error}</p>}
      <p className="mt-6 text-xs text-slate-500">Las copias de seguridad también se guardan por separado para cada base.</p>
    </div>
  )
}
