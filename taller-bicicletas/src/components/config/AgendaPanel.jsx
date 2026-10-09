import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useAuth } from '../../context/AuthContext.jsx'
import { apiGet, apiPut } from '../../lib/api.js'
import EditorTramos from '../agenda/EditorTramos.jsx'
import { AvisoSoloAdmin, PieGuardar } from './comunes.jsx'
import CierresAgenda from './CierresAgenda.jsx'
import { validarTramosCliente, minutosTramos } from '../../lib/agenda.js'

// Interpreta el texto del campo de horas máximas como número (admite coma).
function parsearHorasMaximas(texto) {
  const limpio = String(texto).trim().replace(',', '.')
  if (limpio === '') return null
  const numero = Number(limpio)
  return Number.isFinite(numero) && numero >= 0 ? numero : null
}

// Texto del total de horas laborables del horario («H:MM»).
function textoHoras(tramos) {
  const total = minutosTramos(tramos)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// Pestaña Configuración > Agenda: horario y horas máximas de taller que se
// aplican por defecto a todos los días de lunes a viernes.
export default function AgendaPanel() {
  const { token, user } = useAuth()
  const esAdmin = user?.rol === 'admin'
  const queryClient = useQueryClient()
  const { data, isLoading, error: errorCarga } = useQuery(
    ['agenda', 'config'],
    () => apiGet('/api/agenda/config', token),
    { enabled: Boolean(token) },
  )

  const [tramos, setTramos] = useState([])
  const [horasTexto, setHorasTexto] = useState('')
  const [cargado, setCargado] = useState(false)
  const [estado, setEstado] = useState('idle')
  const [mensaje, setMensaje] = useState('')

  // Vuelca la configuración del servidor en el borrador la primera vez que llega.
  useEffect(() => {
    if (data && !cargado) {
      setTramos(Array.isArray(data.tramos) ? data.tramos : [])
      setHorasTexto(String(data.horasMaximas ?? ''))
      setCargado(true)
    }
  }, [data, cargado])

  const horasNumero = parsearHorasMaximas(horasTexto)
  const hayCambios = Boolean(cargado && data) && (
    JSON.stringify(tramos) !== JSON.stringify(data.tramos) ||
    horasNumero === null || horasNumero !== Number(data.horasMaximas)
  )

  const guardar = useMutation((cuerpo) => apiPut('/api/agenda/config', token, cuerpo), {
    onSuccess: (respuesta) => {
      queryClient.setQueryData(['agenda', 'config'], respuesta)
      queryClient.invalidateQueries(['agenda', 'semana'])
      if (respuesta) {
        setTramos(Array.isArray(respuesta.tramos) ? respuesta.tramos : [])
        setHorasTexto(String(respuesta.horasMaximas ?? ''))
      }
      setEstado('ok')
      setMensaje('Guardado')
    },
    onError: (e) => { setEstado('error'); setMensaje(e.message) },
  })

  function alGuardar() {
    setMensaje('')
    const resultado = validarTramosCliente(tramos)
    if (resultado.error) { setEstado('error'); setMensaje(resultado.error); return }
    if (horasNumero === null) { setEstado('error'); setMensaje('Las horas máximas deben ser un número mayor o igual que 0.'); return }
    setEstado('guardando')
    guardar.mutate({ tramos: resultado.tramos, horasMaximas: horasNumero })
  }

  function descartar() {
    if (!data) return
    setTramos(Array.isArray(data.tramos) ? data.tramos : [])
    setHorasTexto(String(data.horasMaximas ?? ''))
    setEstado('idle')
    setMensaje('')
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-white">Agenda</h2>
      <p className="mt-1 text-sm text-slate-400">
        Horario y horas de taller que se aplican por defecto a todos los días de lunes a viernes. Cada día se puede ajustar por separado desde la Agenda.
      </p>

      {!esAdmin && <div className="mt-5"><AvisoSoloAdmin /></div>}

      {isLoading && <p role="status" className="mt-5 text-sm text-slate-400">Cargando…</p>}
      {errorCarga && <p role="alert" className="mt-5 text-sm text-rose-300">{errorCarga.message}</p>}

      {cargado && (
        <>
          <div className="mt-5">
            <span className="label">Horario de apertura</span>
            <div className="mt-2">
              <EditorTramos
                tramos={tramos}
                onChange={(nuevos) => { setTramos(nuevos); setEstado('idle'); setMensaje('') }}
                disabled={!esAdmin}
                idPrefijo="config-agenda"
              />
            </div>
          </div>

          <label className="mt-5 block max-w-xs">
            <span className="label">Horas máximas de taller al día (predeterminado)</span>
            <input
              type="text"
              inputMode="decimal"
              value={horasTexto}
              disabled={!esAdmin}
              onChange={(event) => { setHorasTexto(event.target.value); setEstado('idle'); setMensaje('') }}
              className="input mt-1.5"
            />
            <span className="mt-1.5 block text-xs text-slate-500">Se contabilizan {textoHoras(tramos)} h laborables con este horario.</span>
          </label>

          <PieGuardar
            hayCambios={hayCambios}
            guardando={guardar.isLoading}
            estado={estado}
            mensaje={mensaje}
            onGuardar={alGuardar}
            onDescartar={descartar}
          />

          {esAdmin && <CierresAgenda token={token} />}
        </>
      )}
    </div>
  )
}
