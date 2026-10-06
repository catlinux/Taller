import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api.js'
import { formatearMinutos } from '../lib/tiempos.js'
import { etiquetaSemana, horasUnion, estadoOcupacion } from '../lib/agenda.js'
import SelectorTrabajo from '../components/agenda/SelectorTrabajo.jsx'
import TarjetaTrabajo from '../components/agenda/TarjetaTrabajo.jsx'
import AjusteDiaModal from '../components/agenda/AjusteDiaModal.jsx'

// Fecha de hoy en formato AAAA-MM-DD usando la hora local (para «Hoy» y por
// defecto cuando la URL no trae semana).
function hoyISO() {
  const ahora = new Date()
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')
  return `${ahora.getFullYear()}-${mes}-${dia}`
}

// «AAAA-MM-DD» -> «D/M» para el encabezado de cada día.
function fechaCorta(fecha) {
  const [anio, mes, dia] = String(fecha).split('-')
  if (!anio || !mes || !dia) return fecha
  return `${Number(dia)}/${Number(mes)}`
}

// ¿La hora indicada es una franja del día? (filas de la rejilla de ese día).
function esFranja(dia, hora) {
  return (dia.franjas || []).some((franja) => franja.hora === hora)
}

// Minutos de la franja (capacidad de esa hora) o null si la hora no es franja.
function franjaMinutos(dia, hora) {
  const franja = (dia.franjas || []).find((f) => f.hora === hora)
  return franja ? franja.minutos : null
}

// Trabajos programados en una hora concreta de un día.
function trabajosEnCelda(dia, hora) {
  return (dia.trabajos || []).filter((trabajo) => trabajo.hora === hora)
}

// Trabajos del día cuyo id figura en fueraDeHorario (su hora ya no es franja).
function trabajosFuera(dia) {
  const ids = new Set(dia.fueraDeHorario || [])
  return (dia.trabajos || []).filter((trabajo) => ids.has(trabajo.id))
}

// Colores de la barra y el texto de ocupación (normal / casi / excedido).
const BARRA_OCUPACION = { normal: 'bg-emerald-500', casi: 'bg-naranja-500', excedido: 'bg-rose-500' }
const TEXTO_OCUPACION = { normal: 'text-emerald-300', casi: 'text-naranja-300', excedido: 'text-rose-300' }

// Modal para mover un trabajo sin ratón: elige día y hora entre las franjas
// válidas de la semana.
function ModalMover({ trabajo, dias, onMover, onCerrar }) {
  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-black/70 p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCerrar() }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="mover-trabajo-title" className="my-auto w-full max-w-md rounded-2xl border border-antracita-700 bg-antracita-800 p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="mover-trabajo-title" className="text-lg font-semibold">Mover trabajo</h2>
            <p className="mt-1 text-sm text-slate-400">{trabajo.descripcion}</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg px-3 py-2 text-slate-400 hover:bg-antracita-700 hover:text-white">×</button>
        </div>
        <div className="space-y-4">
          {dias.map((dia) => {
            const franjas = dia.franjas || []
            return (
              <div key={dia.fecha}>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{dia.nombre} · {fechaCorta(dia.fecha)}</p>
                {franjas.length === 0
                  ? <p className="mt-1 text-xs text-slate-600">Sin horario</p>
                  : (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {franjas.map((franja) => {
                        const actual = dia.fecha === trabajo.fecha && franja.hora === trabajo.hora
                        return (
                          <button
                            key={franja.hora}
                            type="button"
                            disabled={actual}
                            onClick={() => onMover(dia.fecha, franja.hora)}
                            title={actual ? 'Ya está en esta hora' : `Mover a ${dia.nombre} ${franja.hora}`}
                            className="rounded-md border border-antracita-600 px-2.5 py-1 text-sm text-slate-200 hover:bg-antracita-700 disabled:opacity-40"
                          >
                            {franja.hora}
                          </button>
                        )
                      })}
                    </div>
                  )}
              </div>
            )
          })}
        </div>
        <div className="mt-5 flex justify-end border-t border-antracita-700 pt-4">
          <button type="button" onClick={onCerrar} className="btn-ghost">Cancelar</button>
        </div>
      </section>
    </div>
  )
}

// Página Agenda: planificación semanal (lunes a viernes) de trabajos del
// catálogo, con navegación de semanas, ocupación por día y ajuste de días.
export default function Agenda() {
  const { token, user } = useAuth()
  const esAdmin = user?.rol === 'admin'
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const [selector, setSelector] = useState(null)
  const [arrastrando, setArrastrando] = useState(null)
  const [zonaDestino, setZonaDestino] = useState('')
  const [moviendo, setMoviendo] = useState(null)
  const [diaAjustando, setDiaAjustando] = useState(null)
  const [errorAjuste, setErrorAjuste] = useState('')
  const [errorAccion, setErrorAccion] = useState('')
  const anclaRef = useRef(null)

  const fechaParam = searchParams.get('semana') || hoyISO()

  const { data, isLoading, error } = useQuery(
    ['agenda', 'semana', fechaParam],
    () => apiGet(`/api/agenda/semana?fecha=${fechaParam}`, token),
    { enabled: Boolean(token) },
  )
  const invalidar = () => queryClient.invalidateQueries(['agenda', 'semana'])

  // Catálogo (solo cuando hay un selector abierto); comparte caché con la página
  // de Operaciones porque usa la misma clave.
  const { data: operaciones = [] } = useQuery(
    ['operaciones', false],
    () => apiGet('/api/operaciones', token),
    { enabled: Boolean(token) && Boolean(selector) },
  )

  const crear = useMutation((datos) => apiPost('/api/agenda/trabajos', token, datos), {
    onSuccess: invalidar, onError: (e) => setErrorAccion(e.message),
  })
  const actualizar = useMutation(({ id, datos }) => apiPut(`/api/agenda/trabajos/${id}`, token, datos), {
    onSuccess: invalidar, onError: (e) => setErrorAccion(e.message),
  })
  const eliminar = useMutation((id) => apiDelete(`/api/agenda/trabajos/${id}`, token), {
    onSuccess: invalidar, onError: (e) => setErrorAccion(e.message),
  })
  const guardarDia = useMutation(({ fecha, cuerpo }) => apiPut(`/api/agenda/dias/${fecha}`, token, cuerpo), {
    onSuccess: () => { invalidar(); setDiaAjustando(null); setErrorAjuste('') },
    onError: (e) => setErrorAjuste(e.message),
  })
  const resetDia = useMutation((fecha) => apiDelete(`/api/agenda/dias/${fecha}`, token), {
    onSuccess: () => { invalidar(); setDiaAjustando(null); setErrorAjuste('') },
    onError: (e) => setErrorAjuste(e.message),
  })

  const dias = data?.dias ?? []
  const config = data?.config ?? { tramos: [], horasMaximas: 0 }
  const horas = useMemo(() => horasUnion(dias), [dias])

  function irASemana(fecha) {
    setSearchParams({ semana: fecha })
  }
  function abrirSelector(fecha, hora, elemento) {
    anclaRef.current = elemento
    setErrorAccion('')
    setSelector({ fecha, hora })
  }
  function handleDragOver(fecha, hora) {
    return (event) => {
      if (!arrastrando) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      setZonaDestino(`${fecha}|${hora}`)
    }
  }
  function soltar(fecha, hora) {
    const trabajo = arrastrando
    setArrastrando(null)
    setZonaDestino('')
    if (!trabajo || (trabajo.fecha === fecha && trabajo.hora === hora)) return
    actualizar.mutate({ id: trabajo.id, datos: { fecha, hora } })
  }
  function moverATrabajo(fecha, hora) {
    const trabajo = moviendo
    setMoviendo(null)
    if (!trabajo) return
    actualizar.mutate({ id: trabajo.id, datos: { fecha, hora } })
  }
  function quitarTrabajo(trabajo) {
    if (!window.confirm(`¿Quitar «${trabajo.descripcion}» de la agenda?`)) return
    eliminar.mutate(trabajo.id)
  }

  // Encabezado de un día: nombre, fecha, ocupación y botón de ajuste (admin).
  function renderCabecera(dia) {
    const estado = estadoOcupacion(dia.ocupadoMin, dia.maximoMin)
    const pct = dia.maximoMin > 0 ? Math.min(100, Math.round((dia.ocupadoMin / dia.maximoMin) * 100)) : 0
    const deMas = Math.max(0, dia.ocupadoMin - dia.maximoMin)
    return (
      <div className={`rounded-lg border p-2.5 ${dia.esHoy ? 'border-azul-500 bg-azul-500/5' : 'border-antracita-700'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{dia.nombre}</p>
            <p className="text-xs text-slate-500">{fechaCorta(dia.fecha)}{dia.esHoy ? ' · hoy' : ''}</p>
          </div>
          {esAdmin && (
            <button type="button" onClick={() => { setErrorAjuste(''); setDiaAjustando(dia) }} className="btn-ghost shrink-0 px-2 py-1 text-xs">
              Ajustar día
            </button>
          )}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-antracita-700">
          <div className={`h-full rounded-full ${BARRA_OCUPACION[estado]}`} style={{ width: `${pct}%` }} />
        </div>
        <p className={`mt-1.5 text-xs ${TEXTO_OCUPACION[estado]}`} role="status">
          ocupado {formatearMinutos(dia.ocupadoMin)} de {formatearMinutos(dia.maximoMin)}
          {estado === 'excedido' && ` · +${formatearMinutos(deMas)} de más`}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {dia.tramosPersonalizados && <span className="badge border border-naranja-500/40 bg-naranja-500/10 text-naranja-300">Horario personalizado</span>}
          {dia.horasPersonalizadas && <span className="badge border border-naranja-500/40 bg-naranja-500/10 text-naranja-300">Horas personalizadas</span>}
        </div>
      </div>
    )
  }

  // Contenido de una celda: tarjetas de sus trabajos y el botón «+».
  function renderContenidoCelda(dia, hora) {
    return (
      <div className="flex flex-col gap-1.5">
        {trabajosEnCelda(dia, hora).map((trabajo) => (
          <TarjetaTrabajo
            key={trabajo.id}
            trabajo={trabajo}
            arrastrable
            seleccionado={arrastrando?.id === trabajo.id}
            onArrastrarInicio={() => setArrastrando(trabajo)}
            onArrastrarFin={() => { setArrastrando(null); setZonaDestino('') }}
            onCambiarMinutos={(tr, minutos) => actualizar.mutate({ id: tr.id, datos: { minutos } })}
            onPedirMover={(tr) => setMoviendo(tr)}
            onQuitar={quitarTrabajo}
          />
        ))}
        <button
          type="button"
          onClick={(event) => abrirSelector(dia.fecha, hora, event.currentTarget)}
          aria-label={`Añadir trabajo el ${dia.nombre} a las ${hora}`}
          className="rounded-md border border-dashed border-antracita-600 py-1 text-xs text-slate-500 hover:border-azul-500 hover:text-azul-300"
        >
          + Añadir
        </button>
      </div>
    )
  }

  // Celda de la rejilla: franja con trabajos, o zona sombreada «Fuera de horario».
  function renderCelda(dia, hora) {
    if (!esFranja(dia, hora)) {
      return <div className="h-full min-h-[3.25rem] rounded-lg border border-dashed border-antracita-800 bg-antracita-900/30" aria-hidden="true" />
    }
    const cap = franjaMinutos(dia, hora)
    const porFranja = dia.porFranja?.[hora] ?? 0
    const sobrecargada = cap != null && porFranja > cap
    const activa = zonaDestino === `${dia.fecha}|${hora}`
    return (
      <div
        onDragOver={handleDragOver(dia.fecha, hora)}
        onDrop={(event) => { event.preventDefault(); soltar(dia.fecha, hora) }}
        className={`h-full min-h-[3.25rem] rounded-lg border p-1.5 ${activa ? 'border-azul-400 bg-azul-500/10' : 'border-antracita-700'} ${sobrecargada ? 'border-naranja-500/70' : ''}`}
        title={sobrecargada ? 'Esta hora tiene más trabajo del que cabe' : undefined}
      >
        {renderContenidoCelda(dia, hora)}
      </div>
    )
  }

  // Caja «Fuera de horario» al pie de un día, con sus tarjetas.
  function renderFuera(dia) {
    const fuera = trabajosFuera(dia)
    if (fuera.length === 0) return null
    return (
      <div className="mt-3 rounded-lg border border-naranja-500/30 bg-naranja-500/5 p-2">
        <p className="px-1 text-xs font-medium text-naranja-300">Fuera de horario ({fuera.length})</p>
        <div className="mt-1.5 flex flex-col gap-1.5">
          {fuera.map((trabajo) => (
            <TarjetaTrabajo
              key={trabajo.id}
              trabajo={trabajo}
              arrastrable
              seleccionado={arrastrando?.id === trabajo.id}
              onArrastrarInicio={() => setArrastrando(trabajo)}
              onArrastrarFin={() => { setArrastrando(null); setZonaDestino('') }}
              onCambiarMinutos={(tr, minutos) => actualizar.mutate({ id: tr.id, datos: { minutos } })}
              onPedirMover={(tr) => setMoviendo(tr)}
              onQuitar={quitarTrabajo}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-azul-300">Planificación</p>
        <h1 className="mt-1 text-3xl font-bold">Agenda</h1>
        <p className="mt-2 text-slate-400">Programa los trabajos de la semana.</p>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => data && irASemana(data.anterior)} disabled={!data} aria-label="Semana anterior" className="btn-secondary px-3">‹</button>
        <span className="min-w-[14rem] text-center text-sm font-medium text-white">{data ? etiquetaSemana(data.lunes, data.viernes) : '—'}</span>
        <button type="button" onClick={() => data && irASemana(data.siguiente)} disabled={!data} aria-label="Semana siguiente" className="btn-secondary px-3">›</button>
        <button type="button" onClick={() => irASemana(hoyISO())} className="btn-ghost">Hoy</button>
      </div>

      {errorAccion && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorAccion}</p>}

      {isLoading && <p role="status" className="text-sm text-slate-400">Cargando agenda…</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error.message}</p>}

      {data && (
        <>
          {/* table-fixed + colgroup: los días se reparten el ancho a partes iguales y
              las descripciones largas se recortan en vez de ensanchar la página. */}
          <table className="hidden w-full table-fixed border-separate lg:table" style={{ borderSpacing: '0.5rem' }}>
            <colgroup>
              <col style={{ width: '3.5rem' }} />
              {dias.map((dia) => <col key={dia.fecha} />)}
            </colgroup>
            <thead>
              <tr>
                <td aria-hidden="true" />
                {dias.map((dia) => (
                  <th key={dia.fecha} scope="col" className="p-0 align-top text-left font-normal">{renderCabecera(dia)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {horas.map((hora) => (
                <tr key={hora}>
                  <th scope="row" className="w-16 pr-1 text-right align-top text-xs font-medium text-slate-500">{hora}</th>
                  {dias.map((dia) => (
                    <td key={`${dia.fecha}-${hora}`} className="p-0 align-top">{renderCelda(dia, hora)}</td>
                  ))}
                </tr>
              ))}
              {dias.some((dia) => (dia.fueraDeHorario || []).length > 0) && (
                <tr>
                  <th scope="row" className="align-top" aria-hidden="true" />
                  {dias.map((dia) => <td key={dia.fecha} className="p-0 align-top">{renderFuera(dia)}</td>)}
                </tr>
              )}
            </tbody>
          </table>

          <div className="space-y-5 lg:hidden">
            {dias.map((dia) => (
              <section key={dia.fecha} className="card p-3">
                {renderCabecera(dia)}
                <div className="mt-3 space-y-2">
                  {horas.filter((hora) => esFranja(dia, hora)).map((hora) => (
                    <div key={hora} className="flex gap-2">
                      <div className="w-12 shrink-0 pt-1 text-xs font-medium text-slate-500">{hora}</div>
                      <div
                        className="min-w-0 flex-1"
                        onDragOver={handleDragOver(dia.fecha, hora)}
                        onDrop={(event) => { event.preventDefault(); soltar(dia.fecha, hora) }}
                      >
                        {renderContenidoCelda(dia, hora)}
                      </div>
                    </div>
                  ))}
                </div>
                {renderFuera(dia)}
              </section>
            ))}
          </div>
        </>
      )}

      {selector && (
        <SelectorTrabajo
          anclaRef={anclaRef}
          operaciones={operaciones}
          programando={crear.isLoading}
          onElegir={(operacion, minutos) => {
            crear.mutate(
              { fecha: selector.fecha, hora: selector.hora, operacionId: operacion.id, minutos },
              { onSuccess: () => setSelector(null) },
            )
          }}
          onCerrar={() => setSelector(null)}
        />
      )}

      {moviendo && (
        <ModalMover trabajo={moviendo} dias={dias} onMover={moverATrabajo} onCerrar={() => setMoviendo(null)} />
      )}

      {diaAjustando && (
        <AjusteDiaModal
          dia={diaAjustando}
          config={config}
          guardando={guardarDia.isLoading || resetDia.isLoading}
          error={errorAjuste}
          onGuardar={({ tramos, horasMaximas }) => guardarDia.mutate({ fecha: diaAjustando.fecha, cuerpo: { tramos, horasMaximas } })}
          onVolverPredeterminado={() => resetDia.mutate(diaAjustando.fecha)}
          onCerrar={() => { setDiaAjustando(null); setErrorAjuste('') }}
        />
      )}
    </div>
  )
}


