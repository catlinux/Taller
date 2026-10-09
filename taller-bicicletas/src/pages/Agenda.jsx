import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api.js'
import { formatearMinutos } from '../lib/tiempos.js'
import { ESCALA_PX, estadoOcupacion, etiquetaSemana, horaDeMinutos, minutosDeHora, rangoHoras, redondear15 } from '../lib/agenda.js'
import SelectorTrabajo from '../components/agenda/SelectorTrabajo.jsx'
import ColumnaDia, { minutoDeEvento } from '../components/agenda/ColumnaDia.jsx'
import AjusteDiaModal from '../components/agenda/AjusteDiaModal.jsx'
import ModalDesborde from '../components/agenda/ModalDesborde.jsx'
import ModalTrabajo from '../components/agenda/ModalTrabajo.jsx'

// Fecha de hoy en formato AAAA-MM-DD usando la hora local (para «Hoy» y por
// defecto cuando la URL no trae semana).
function hoyISO() {
  const ahora = new Date()
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')
  return `${ahora.getFullYear()}-${mes}-${dia}`
}

// Minutos de reloj de la hora actual.
function minutoActual() {
  const ahora = new Date()
  return ahora.getHours() * 60 + ahora.getMinutes()
}

// «AAAA-MM-DD» -> «D/M» para el encabezado de cada día.
function fechaCorta(fecha) {
  const [anio, mes, dia] = String(fecha).split('-')
  if (!anio || !mes || !dia) return fecha
  return `${Number(dia)}/${Number(mes)}`
}

// Colores de la barra y el texto de ocupación (normal / casi / excedido).
const BARRA_OCUPACION = { normal: 'bg-emerald-500', casi: 'bg-naranja-500', excedido: 'bg-rose-500' }
const TEXTO_OCUPACION = { normal: 'text-emerald-300', casi: 'text-naranja-300', excedido: 'text-rose-300' }

// Página Agenda: planificación semanal (lunes a viernes) por mecánico en una
// línea de tiempo. Un clic en una zona libre añade un trabajo, un bloque se
// arrastra a otra hora u otro día y al pulsarlo se abre su detalle.
export default function Agenda() {
  const { token, user } = useAuth()
  const esAdmin = user?.rol === 'admin'
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const [selector, setSelector] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const [decision, setDecision] = useState(null)
  const [destino, setDestino] = useState(null)
  const [diaAjustando, setDiaAjustando] = useState(null)
  const [errorAjuste, setErrorAjuste] = useState('')
  const [errorAccion, setErrorAccion] = useState('')
  const [errorModal, setErrorModal] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ahora, setAhora] = useState(minutoActual)
  const anclaRef = useRef(null)
  const arrastre = useRef(null)

  const fechaParam = searchParams.get('semana') || hoyISO()

  const { data: mecanicos = [], isSuccess: mecanicosCargados } = useQuery(['mecanicos'], () => apiGet('/api/mecanicos', token), { enabled: Boolean(token) })
  const mecanicoParam = searchParams.get('mecanico')
  // «sin» = Sin asignar; sin parámetro, el primer mecánico (o Sin asignar si no hay).
  const mecanicoSel = mecanicoParam || (mecanicos.length > 0 ? String(mecanicos[0].id) : 'sin')
  const mecanicoId = mecanicoSel === 'sin' ? null : Number(mecanicoSel)

  const { data, isLoading, error } = useQuery(
    ['agenda', 'semana', fechaParam, mecanicoSel],
    () => apiGet(`/api/agenda/semana?fecha=${fechaParam}&mecanico=${mecanicoSel}`, token),
    { enabled: Boolean(token) && (Boolean(mecanicoParam) || mecanicosCargados), keepPreviousData: true },
  )
  const invalidar = () => queryClient.invalidateQueries(['agenda', 'semana'])

  // Catálogo (solo cuando hay un selector abierto); comparte caché con la página de Operaciones.
  const { data: operaciones = [] } = useQuery(
    ['operaciones', false],
    () => apiGet('/api/operaciones', token),
    { enabled: Boolean(token) && Boolean(selector) },
  )

  // Refresca la línea de «ahora» cada minuto.
  useEffect(() => {
    const temporizador = setInterval(() => setAhora(minutoActual()), 60 * 1000)
    return () => clearInterval(temporizador)
  }, [])

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
  const rango = useMemo(() => rangoHoras(dias), [dias])
  const horasEje = useMemo(() => {
    const horas = []
    for (let minuto = rango.inicio; minuto <= rango.fin; minuto += 60) horas.push(minuto)
    return horas
  }, [rango])
  const altoEje = (rango.fin - rango.inicio) * ESCALA_PX

  function actualizarUrl(cambios) {
    const siguiente = new URLSearchParams(searchParams)
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === null || valor === undefined) siguiente.delete(clave)
      else siguiente.set(clave, valor)
    }
    setSearchParams(siguiente)
  }
  const irASemana = (fecha) => actualizarUrl({ semana: fecha })
  const elegirMecanico = (valor) => actualizarUrl({ mecanico: valor })

  // Lanza una petición que puede pedir una decisión de desborde (409): si la pide,
  // abre el modal y la repite con el desborde elegido.
  async function lanzar(accion, alExito) {
    setEnviando(true)
    try {
      await accion(undefined)
      invalidar()
      setDecision(null)
      alExito?.()
    } catch (e) {
      if (e.status === 409 && e.data?.requiereDecision === true) {
        setDecision({ excesoMin: e.data.excesoMin, accion, alExito })
      } else if (abierto) {
        setErrorModal(e.message)
      } else {
        setErrorAccion(e.message)
        setDecision(null)
      }
    } finally {
      setEnviando(false)
    }
  }

  function crearTrabajo({ operacion, descripcion, minutos, cliente }) {
    const { dia, minuto } = selector
    const cuerpo = { mecanicoId, fecha: dia.fecha, inicio: horaDeMinutos(minuto), minutos, clienteId: cliente?.id }
    if (operacion) cuerpo.operacionId = operacion.id
    else cuerpo.descripcion = descripcion
    lanzar((desborde) => apiPost('/api/agenda/trabajos', token, { ...cuerpo, desborde }), () => setSelector(null))
  }

  function moverTrabajo(trabajoId, cambios, alExito) {
    lanzar((desborde) => apiPut(`/api/agenda/trabajos/${trabajoId}`, token, { ...cambios, desborde }), alExito)
  }

  function quitarTrabajo(bloque) {
    if (!window.confirm(`¿Quitar «${bloque.trabajo.descripcion}» de la agenda?`)) return
    lanzar(() => apiDelete(`/api/agenda/trabajos/${bloque.trabajoId}`, token), () => setAbierto(null))
  }

  function abrirSelector(dia, minuto, evento) {
    const x = evento?.clientX ?? 16
    const y = evento?.clientY ?? 120
    anclaRef.current = { getBoundingClientRect: () => ({ left: x, top: y, bottom: y }) }
    setErrorAccion('')
    setSelector({ dia, minuto })
  }

  // En móvil no hay clic sobre la línea de tiempo: «Añadir» entra al final del día.
  function añadirAlFinal(dia, evento) {
    const ultimo = dia.bloques.reduce((fin, b) => Math.max(fin, minutosDeHora(b.fin) ?? 0), 0)
    const primerTramo = dia.tramos[0] ? minutosDeHora(dia.tramos[0].inicio) : 9 * 60
    const minuto = ultimo > 0 ? Math.min(redondear15(ultimo + 7), 23 * 60 + 45) : primerTramo
    abrirSelector(dia, minuto, evento)
  }

  function alIniciarArrastre(bloque, event) {
    const columna = event.currentTarget.parentElement
    const agarre = minutoDeEvento(event, columna, rango.inicio)
    arrastre.current = { bloque, desfase: agarre - minutosDeHora(bloque.inicio) }
  }
  function alTerminarArrastre() {
    arrastre.current = null
    setDestino(null)
  }
  // Minuto (redondeado a 15) donde empezaría el bloque arrastrado si se soltara aquí.
  function minutoDeSoltado(event) {
    const actual = arrastre.current
    if (!actual) return null
    const minuto = minutoDeEvento(event, event.currentTarget, rango.inicio) - actual.desfase
    return Math.max(0, Math.min(23 * 60 + 45, redondear15(minuto)))
  }
  function alSobrevolar(dia, event) {
    if (!arrastre.current) return
    if (dia.cierre) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const minuto = minutoDeSoltado(event)
    setDestino((previo) => (previo?.fecha === dia.fecha && previo.minuto === minuto ? previo : { fecha: dia.fecha, minuto }))
  }
  function alSoltar(dia, event) {
    const actual = arrastre.current
    const minuto = minutoDeSoltado(event)
    alTerminarArrastre()
    if (!actual || minuto === null || dia.cierre) return
    const inicio = horaDeMinutos(minuto)
    if (dia.fecha === actual.bloque.fechaDia && inicio === actual.bloque.inicio) return
    moverTrabajo(actual.bloque.trabajoId, { fecha: dia.fecha, inicio })
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

  const abrirBloque = (dia) => (bloque) => {
    setErrorModal('')
    setAbierto({ bloque: { ...bloque, fechaDia: dia.fecha }, fecha: dia.fecha })
  }
  // Los bloques llevan su fecha para comparar al soltar sobre el mismo sitio.
  const diasConFecha = dias.map((dia) => ({ ...dia, bloques: dia.bloques.map((b) => ({ ...b, fechaDia: dia.fecha })) }))

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-azul-300">Planificación</p>
        <h1 className="mt-1 text-3xl font-bold">Agenda</h1>
        <p className="mt-2 text-slate-400">Programa los trabajos de la semana de cada mecánico.</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Agenda de">
        {mecanicos.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={mecanicoSel === String(m.id)} onClick={() => elegirMecanico(String(m.id))} className={mecanicoSel === String(m.id) ? 'btn-primary' : 'btn-secondary'}>
            {m.nombre}
          </button>
        ))}
        <button type="button" role="tab" aria-selected={mecanicoSel === 'sin'} onClick={() => elegirMecanico('sin')} className={mecanicoSel === 'sin' ? 'btn-primary' : 'btn-secondary'}>
          Sin asignar
        </button>
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
          <div className="hidden gap-2 lg:grid" style={{ gridTemplateColumns: '3rem repeat(5, minmax(0, 1fr))' }}>
            <div aria-hidden="true" />
            {diasConFecha.map((dia) => <div key={dia.fecha}>{renderCabecera(dia)}</div>)}

            <div className="relative" style={{ height: altoEje }} aria-hidden="true">
              {horasEje.map((minuto) => (
                <span key={minuto} style={{ top: (minuto - rango.inicio) * ESCALA_PX - 7 }} className="absolute right-1 text-xs font-medium text-slate-500">
                  {horaDeMinutos(minuto)}
                </span>
              ))}
            </div>
            {diasConFecha.map((dia) => (
              <ColumnaDia
                key={dia.fecha}
                dia={dia}
                inicioEje={rango.inicio}
                finEje={rango.fin}
                ahora={dia.esHoy ? ahora : null}
                destino={destino?.fecha === dia.fecha ? destino.minuto : null}
                onClicLibre={(d, minuto, evento) => abrirSelector(d, minuto, evento)}
                onSobrevolar={alSobrevolar}
                onSoltar={alSoltar}
                onAbrir={abrirBloque(dia)}
                onArrastrarInicio={alIniciarArrastre}
                onArrastrarFin={alTerminarArrastre}
              />
            ))}
          </div>

          <div className="space-y-5 lg:hidden">
            {diasConFecha.map((dia) => (
              <section key={dia.fecha} className="card p-3">
                {renderCabecera(dia)}
                <ul className="mt-3 space-y-2">
                  {dia.bloques.length === 0 && <li className="text-sm text-slate-500">Sin trabajos.</li>}
                  {dia.bloques.map((bloque) => (
                    <li key={bloque.id}>
                      <button
                        type="button"
                        onClick={() => abrirBloque(dia)(bloque)}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${bloque.trabajo.orden ? 'bg-azul-500/20' : 'bg-antracita-700/60'} ${bloque.forzado ? 'border-rose-500' : 'border-antracita-600'}`}
                      >
                        <span className="font-medium text-white">{bloque.inicio}–{bloque.fin}</span>
                        <span className="ml-2 text-slate-200">{bloque.trabajo.descripcion}</span>
                        {bloque.partes > 1 && <span className="ml-1 text-xs text-slate-400">{bloque.parte}/{bloque.partes}</span>}
                        <span className="block text-xs text-slate-400">
                          {formatearMinutos(bloque.minutos)}
                          {bloque.trabajo.cliente ? ` · ${bloque.trabajo.cliente.nombreCorto}` : ''}
                          {bloque.trabajo.orden ? ` · ${bloque.trabajo.orden.numeroOrden}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {!dia.cierre && (
                  <button type="button" onClick={(event) => añadirAlFinal(dia, event)} className="btn-secondary mt-3 w-full justify-center">+ Añadir trabajo</button>
                )}
              </section>
            ))}
          </div>
        </>
      )}

      {selector && (
        <SelectorTrabajo
          anclaRef={anclaRef}
          titulo={`${selector.dia.nombre} ${fechaCorta(selector.dia.fecha)} · ${horaDeMinutos(selector.minuto)}${data?.mecanico ? ` · ${data.mecanico.nombre}` : ' · Sin asignar'}`}
          operaciones={operaciones}
          token={token}
          programando={enviando}
          onElegir={crearTrabajo}
          onCerrar={() => setSelector(null)}
        />
      )}

      {abierto && (
        <ModalTrabajo
          bloque={abierto.bloque}
          fecha={abierto.fecha}
          mecanicos={mecanicos}
          token={token}
          guardando={enviando}
          error={errorModal}
          onGuardar={(cambios) => moverTrabajo(abierto.bloque.trabajoId, cambios, () => setAbierto(null))}
          onQuitar={() => quitarTrabajo(abierto.bloque)}
          onCerrar={() => setAbierto(null)}
        />
      )}

      {decision && (
        <ModalDesborde
          excesoMin={decision.excesoMin}
          enviando={enviando}
          onForzar={() => lanzar(() => decision.accion('forzar'), decision.alExito)}
          onSiguiente={() => lanzar(() => decision.accion('siguiente'), decision.alExito)}
          onCancelar={() => setDecision(null)}
        />
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
