import { Router } from 'express'
import prisma from '../db.js'
import { authMiddleware, roleMiddleware } from './auth.js'
import {
  validarTramos,
  validarHorasMaximas,
  semanaLaborable,
  esLaborable,
  esFechaValida,
  hoyLocal,
  sumarDias,
  nombreDia,
  minutosDeHora,
  horaDeMinutos,
} from '../lib/agenda.js'
import { insertar, mover, redimensionar, aDesplazamiento, aReloj, minutosDeTramos } from '../lib/planificador.js'
import {
  leerConfig,
  cargarCalendario,
  cargarColas,
  aplicarResultado,
  sincronizarMinutos,
  nombreCorto,
} from '../lib/agendaDatos.js'

const router = Router()
router.use(authMiddleware)

// Clave de la tabla Ajuste donde se guarda la configuración general de la agenda.
const CLAVE_AJUSTE = 'agenda'

// Se lanza dentro de una transacción para deshacerla cuando el planificador
// pide una decisión al usuario (se responde 409 con el cuerpo indicado).
class PideDecision extends Error {
  constructor(cuerpo) {
    super('Se requiere una decisión')
    this.cuerpo = cuerpo
  }
}

// Error del usuario (400) lanzado dentro de las transacciones.
class ErrorDatos extends Error {}

// Identificador entero positivo (o null si no es válido).
function parseId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

// Entero dentro de un rango (acepta número o texto numérico); null si no vale.
function enteroEntre(value, min, max) {
  if (value === null || value === '' || typeof value === 'boolean' || Array.isArray(value) || typeof value === 'object') return null
  const numero = typeof value === 'string' ? Number(value.trim()) : value
  if (!Number.isInteger(numero) || numero < min || numero > max) return null
  return numero
}

// Nota opcional: texto recortado (vacío -> null) o null. Devuelve { nota } o { error }.
function normalizarNota(value) {
  if (value === null) return { nota: null }
  if (typeof value === 'string') return { nota: value.trim() || null }
  return { error: 'La nota debe ser una cadena de texto o null' }
}

// Convierte el campo tiempos (JSON) en un array de minutos; [] si no hay o es inválido.
function parsearTiempos(valor) {
  if (typeof valor !== 'string' || valor.trim() === '') return []
  try {
    const lista = JSON.parse(valor)
    return Array.isArray(lista) ? lista.filter((n) => Number.isInteger(n)) : []
  } catch {
    return []
  }
}

// «mecanico» de la consulta: «sin» o vacío = Sin asignar; si no, un id. undefined si no es válido.
function parseMecanico(valor) {
  if (valor === undefined || valor === null || valor === '' || valor === 'sin') return null
  return parseId(valor) ?? undefined
}

// Trabajo tal y como lo devuelve la API: tiempos como array, cliente corto y orden.
function trabajoParaApi(trabajo) {
  return {
    id: trabajo.id,
    codigo: trabajo.codigo,
    descripcion: trabajo.descripcion,
    categoria: trabajo.categoria,
    tiempos: parsearTiempos(trabajo.tiempos),
    minutos: trabajo.minutos,
    nota: trabajo.nota,
    mecanicoId: trabajo.mecanicoId,
    cliente: trabajo.cliente ? { id: trabajo.cliente.id, nombreCorto: nombreCorto(trabajo.cliente) } : null,
    orden: trabajo.orden ? { id: trabajo.orden.id, numeroOrden: trabajo.orden.numeroOrden } : null,
  }
}

const INCLUIR_TRABAJO = {
  cliente: { select: { id: true, nombre: true, apellidos: true } },
  orden: { select: { id: true, numeroOrden: true } },
}

// GET /config -> configuración general efectiva (tramos, horas máximas y planificación automática).
router.get('/config', async (req, res, next) => {
  try {
    return res.json(await leerConfig(prisma))
  } catch (error) { return next(error) }
})

// PUT /config (admin) { tramos?, horasMaximas?, autoPlanificar? } -> valida y
// guarda la configuración general. Los campos omitidos se conservan.
router.put('/config', roleMiddleware('admin'), async (req, res, next) => {
  try {
    const body = req.body ?? {}
    if (body.tramos === undefined && body.horasMaximas === undefined && body.autoPlanificar === undefined) {
      return res.status(400).json({ error: 'No se ha indicado ningún campo de configuración' })
    }
    const config = await leerConfig(prisma)
    if (body.tramos !== undefined) {
      const { tramos, error } = validarTramos(body.tramos)
      if (error) return res.status(400).json({ error })
      config.tramos = tramos
    }
    if (body.horasMaximas !== undefined) {
      const { horasMaximas, error } = validarHorasMaximas(body.horasMaximas)
      if (error) return res.status(400).json({ error })
      config.horasMaximas = horasMaximas
    }
    if (body.autoPlanificar !== undefined) {
      if (typeof body.autoPlanificar !== 'boolean') return res.status(400).json({ error: 'autoPlanificar debe ser verdadero o falso' })
      config.autoPlanificar = body.autoPlanificar
    }
    const valor = JSON.stringify(config)
    await prisma.ajuste.upsert({
      where: { clave: CLAVE_AJUSTE },
      update: { valor },
      create: { clave: CLAVE_AJUSTE, valor },
    })
    return res.json(config)
  } catch (error) { return next(error) }
})

// GET /semana?fecha=AAAA-MM-DD&mecanico=<id|sin> -> los 5 días laborables de la
// semana (hoy por defecto) de la agenda de un mecánico, con calendario, ocupación y bloques.
router.get('/semana', async (req, res, next) => {
  try {
    const hoy = hoyLocal()
    const fecha = req.query.fecha === undefined || req.query.fecha === '' ? hoy : req.query.fecha
    if (!esFechaValida(fecha)) {
      return res.status(400).json({ error: 'La fecha debe tener el formato AAAA-MM-DD' })
    }
    const mecanicoId = parseMecanico(req.query.mecanico)
    if (mecanicoId === undefined) return res.status(400).json({ error: 'Mecánico no válido' })

    const dias = semanaLaborable(fecha)
    const lunes = dias[0]
    const { calendario, config, mecanico } = await cargarCalendario(prisma, mecanicoId, lunes)
    if (mecanicoId !== null && !mecanico) return res.status(404).json({ error: 'Mecánico no encontrado' })

    const bloques = await prisma.agendaBloque.findMany({
      where: { fecha: { in: dias }, trabajo: { mecanicoId } },
      include: { trabajo: { include: INCLUIR_TRABAJO } },
      orderBy: [{ fecha: 'asc' }, { inicio: 'asc' }, { id: 'asc' }],
    })
    // Todos los bloques de esos trabajos (también de otras semanas) para numerar las partes «1/2».
    const idsTrabajo = [...new Set(bloques.map((b) => b.trabajoId))]
    const hermanos = idsTrabajo.length === 0 ? [] : await prisma.agendaBloque.findMany({
      where: { trabajoId: { in: idsTrabajo } },
      select: { id: true, trabajoId: true, fecha: true, inicio: true },
    })
    const ordenPorTrabajo = new Map()
    for (const b of hermanos) {
      if (!ordenPorTrabajo.has(b.trabajoId)) ordenPorTrabajo.set(b.trabajoId, [])
      ordenPorTrabajo.get(b.trabajoId).push(b)
    }
    for (const lista of ordenPorTrabajo.values()) lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.inicio - b.inicio || a.id - b.id)

    const bloquesPorFecha = new Map()
    for (const b of bloques) {
      if (!bloquesPorFecha.has(b.fecha)) bloquesPorFecha.set(b.fecha, [])
      bloquesPorFecha.get(b.fecha).push(b)
    }

    const respuestaDias = dias.map((dia) => {
      const cal = calendario(dia)
      const laborablesMin = minutosDeTramos(cal.tramos)
      const lista = bloquesPorFecha.get(dia) ?? []
      const ocupadoMin = lista.reduce((total, b) => total + b.minutos, 0)
      const maximoMin = cal.cerrado ? 0 : Math.min(cal.maxMin, laborablesMin)
      // «Forzado» se deriva de la capacidad actual: así no queda desfasado si se quita
      // un trabajo o cambia el horario del día.
      let acumulado = 0
      return {
        fecha: dia,
        nombre: nombreDia(dia),
        esHoy: dia === hoy,
        tramos: cal.tramos,
        laborablesMin,
        maximoMin,
        horasMaximas: cal.maxMin / 60,
        ocupadoMin,
        excedido: ocupadoMin > maximoMin,
        tramosPersonalizados: cal.tramosPersonalizados,
        horasPersonalizadas: cal.horasPersonalizadas,
        cierre: cal.cerrado,
        motivo: cal.motivo,
        bloques: lista.map((b) => {
          acumulado += b.minutos
          const orden = ordenPorTrabajo.get(b.trabajoId) ?? []
          const desplazamiento = aDesplazamiento(cal.tramos, b.inicio)
          return {
            id: b.id,
            trabajoId: b.trabajoId,
            inicio: horaDeMinutos(b.inicio),
            fin: horaDeMinutos(aReloj(cal.tramos, desplazamiento + b.minutos, { fin: true })),
            minutos: b.minutos,
            parte: Math.max(1, orden.findIndex((o) => o.id === b.id) + 1),
            partes: Math.max(1, orden.length),
            forzado: acumulado > maximoMin,
            trabajo: trabajoParaApi(b.trabajo),
          }
        }),
      }
    })

    return res.json({
      lunes,
      viernes: dias[4],
      anterior: sumarDias(lunes, -7),
      siguiente: sumarDias(lunes, 7),
      config,
      mecanico: mecanico ? { id: mecanico.id, nombre: mecanico.nombre } : null,
      dias: respuestaDias,
    })
  } catch (error) { return next(error) }
})

// Valida la fecha y la hora de inicio «HH:MM» de una petición; lanza ErrorDatos si no valen.
function leerFechaInicio(fecha, inicio) {
  if (!esLaborable(fecha)) throw new ErrorDatos('Solo se pueden programar trabajos de lunes a viernes')
  const reloj = minutosDeHora(inicio)
  if (reloj === null) throw new ErrorDatos('La hora de inicio debe ser «HH:MM» en múltiplos de 15 minutos')
  return reloj
}

// Valida el valor de desborde de una petición.
function leerDesborde(valor) {
  if (valor === undefined || valor === null) return null
  if (valor === 'forzar' || valor === 'siguiente') return valor
  throw new ErrorDatos('El desborde debe ser «forzar» o «siguiente»')
}

// Comprueba que existe el mecánico (null = Sin asignar) y devuelve su id.
async function leerMecanico(db, valor) {
  if (valor === null) return null
  const id = parseId(valor)
  if (id === null || !(await db.mecanico.findUnique({ where: { id } }))) throw new ErrorDatos('Mecánico no encontrado')
  return id
}

// Comprueba que existe el cliente (null = ninguno) y devuelve su id.
async function leerCliente(db, valor) {
  if (valor === null) return null
  const id = parseId(valor)
  if (id === null || !(await db.cliente.findUnique({ where: { id } }))) throw new ErrorDatos('Cliente no encontrado')
  return id
}

// Ejecuta una transacción y traduce PideDecision (409) y ErrorDatos (400).
async function enTransaccion(res, trabajo) {
  try {
    return await prisma.$transaction(trabajo, { timeout: 20000 })
  } catch (error) {
    if (error instanceof PideDecision) { res.status(409).json(error.cuerpo); return undefined }
    if (error instanceof ErrorDatos) { res.status(400).json({ error: error.message }); return undefined }
    if (/^El día está cerrado|^No hay (ningún día|hueco)/.test(error?.message ?? '')) { res.status(400).json({ error: error.message }); return undefined }
    throw error
  }
}

// POST /trabajos { mecanicoId|null, fecha, inicio:'HH:MM', operacionId?, descripcion?,
// minutos?, nota?, clienteId?, desborde? } -> programa un trabajo (del catálogo o
// libre) en la cola del mecánico. 409 con { requiereDecision, excesoMin, fecha }
// si se pasa del día y falta `desborde`.
router.post('/trabajos', async (req, res, next) => {
  try {
    const body = req.body ?? {}
    const trabajo = await enTransaccion(res, async (db) => {
      const reloj = leerFechaInicio(body.fecha, body.inicio)
      const desborde = leerDesborde(body.desborde)
      const mecanicoId = await leerMecanico(db, body.mecanicoId ?? null)
      const clienteId = body.clienteId === undefined ? null : await leerCliente(db, body.clienteId)

      let datos
      if (body.operacionId !== undefined && body.operacionId !== null) {
        const operacionId = parseId(body.operacionId)
        const operacion = operacionId === null ? null : await db.operacionManoObra.findUnique({ where: { id: operacionId } })
        if (!operacion) throw new ErrorDatos('Operación no encontrada')
        datos = {
          operacionId,
          codigo: operacion.codigo,
          descripcion: operacion.descripcion,
          categoria: operacion.categoria ?? null,
          tiempos: operacion.tiempos ?? null,
        }
        if (body.minutos === undefined || body.minutos === null) {
          const tiempos = parsearTiempos(operacion.tiempos)
          datos.minutos = tiempos.length > 0 ? tiempos[0] : Math.max(1, Math.round(operacion.tiempoDefecto * 60))
        }
      } else {
        const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : ''
        if (!descripcion || descripcion.length > 200) throw new ErrorDatos('Indica un trabajo del catálogo o una descripción (hasta 200 caracteres)')
        datos = { descripcion }
      }
      if (body.minutos !== undefined && body.minutos !== null) {
        const minutos = enteroEntre(body.minutos, 1, 1440)
        if (minutos === null) throw new ErrorDatos('La duración debe ser un número entero entre 1 y 1440 minutos')
        datos.minutos = minutos
      }
      if (datos.minutos === undefined) datos.minutos = 60

      let nota = null
      if (body.nota !== undefined) {
        const resultado = normalizarNota(body.nota)
        if (resultado.error) throw new ErrorDatos(resultado.error)
        nota = resultado.nota
      }

      const { calendario } = await cargarCalendario(db, mecanicoId, body.fecha)
      const colas = await cargarColas(db, mecanicoId, body.fecha)
      const plan = insertar({
        calendario,
        colas,
        fecha: body.fecha,
        x: aDesplazamiento(calendario(body.fecha).tramos, reloj),
        minutos: datos.minutos,
        desborde,
      })
      if (plan.requiereDecision) throw new PideDecision(plan)

      const creado = await db.agendaTrabajo.create({ data: { ...datos, nota, mecanicoId, clienteId } })
      await aplicarResultado(db, plan, creado.id)
      return db.agendaTrabajo.findUnique({ where: { id: creado.id }, include: INCLUIR_TRABAJO })
    })
    if (trabajo) res.status(201).json(trabajoParaApi(trabajo))
    return undefined
  } catch (error) { return next(error) }
})

// PUT /trabajos/:id { fecha?, inicio?, mecanicoId?, minutos?, nota?, clienteId?, desborde? }
// -> mover, cambiar de mecánico, redimensionar o editar la nota y el cliente, con
// el mismo protocolo 409 de desborde.
router.put('/trabajos/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Identificador de trabajo no válido' })
    const body = req.body ?? {}
    const trabajo = await enTransaccion(res, async (db) => {
      const existente = await db.agendaTrabajo.findUnique({ where: { id } })
      if (!existente) return null
      const desborde = leerDesborde(body.desborde)
      const datos = {}
      if (body.nota !== undefined) {
        const resultado = normalizarNota(body.nota)
        if (resultado.error) throw new ErrorDatos(resultado.error)
        datos.nota = resultado.nota
      }
      if (body.clienteId !== undefined) datos.clienteId = await leerCliente(db, body.clienteId)
      let minutosNuevos = null
      if (body.minutos !== undefined) {
        minutosNuevos = enteroEntre(body.minutos, 1, 1440)
        if (minutosNuevos === null) throw new ErrorDatos('La duración debe ser un número entero entre 1 y 1440 minutos')
      }
      const cambiaMecanico = body.mecanicoId !== undefined && (body.mecanicoId ?? null) !== existente.mecanicoId
      const nuevoMecanico = cambiaMecanico ? await leerMecanico(db, body.mecanicoId ?? null) : existente.mecanicoId
      const cambiaSitio = body.fecha !== undefined || body.inicio !== undefined || cambiaMecanico
      if (!cambiaSitio && minutosNuevos === null && Object.keys(datos).length === 0) {
        throw new ErrorDatos('No se han proporcionado campos para actualizar')
      }

      const propios = await db.agendaBloque.findMany({ where: { trabajoId: id }, orderBy: [{ fecha: 'asc' }, { inicio: 'asc' }] })
      if (propios.length === 0 && (cambiaSitio || minutosNuevos !== null)) throw new ErrorDatos('El trabajo no tiene bloques en la agenda')
      const primero = propios[0]

      // 1) Redimensionar en su cola actual.
      if (minutosNuevos !== null && minutosNuevos !== existente.minutos) {
        const { calendario } = await cargarCalendario(db, existente.mecanicoId, primero.fecha)
        const colas = await cargarColas(db, existente.mecanicoId, primero.fecha)
        const plan = redimensionar({ calendario, colas, trabajoId: id, minutos: minutosNuevos, desborde })
        if (plan.requiereDecision) throw new PideDecision(plan)
        await aplicarResultado(db, plan, id)
        datos.minutos = minutosNuevos
      }

      // 2) Mover de sitio o de mecánico.
      if (cambiaSitio) {
        const bloquesActuales = await db.agendaBloque.findMany({ where: { trabajoId: id }, orderBy: [{ fecha: 'asc' }, { inicio: 'asc' }] })
        const origen = bloquesActuales[0]
        const fecha = body.fecha !== undefined ? body.fecha : origen.fecha
        const reloj = body.inicio !== undefined ? leerFechaInicio(fecha, body.inicio) : (body.fecha !== undefined ? 0 : origen.inicio)
        if (!esLaborable(fecha)) throw new ErrorDatos('Solo se pueden programar trabajos de lunes a viernes')
        const desde = fecha < origen.fecha ? fecha : origen.fecha
        const { calendario } = await cargarCalendario(db, nuevoMecanico, desde)
        const x = aDesplazamiento(calendario(fecha).tramos, reloj)
        let plan
        if (cambiaMecanico) {
          const total = bloquesActuales.reduce((suma, b) => suma + b.minutos, 0)
          const colas = await cargarColas(db, nuevoMecanico, fecha)
          plan = insertar({ calendario, colas, fecha, x, minutos: total, trabajoId: id, desborde })
          if (!plan.requiereDecision) plan.borrar = [...plan.borrar, ...bloquesActuales.map((b) => b.id)]
        } else {
          const colas = await cargarColas(db, nuevoMecanico, desde)
          plan = mover({ calendario, colas, trabajoId: id, fecha, x, desborde })
        }
        if (plan.requiereDecision) throw new PideDecision(plan)
        await aplicarResultado(db, plan, id)
        datos.mecanicoId = nuevoMecanico
      }

      if (Object.keys(datos).length > 0) await db.agendaTrabajo.update({ where: { id }, data: datos })
      await sincronizarMinutos(db, id)
      return db.agendaTrabajo.findUnique({ where: { id }, include: INCLUIR_TRABAJO })
    })
    if (trabajo === null) return res.status(404).json({ error: 'Trabajo no encontrado' })
    if (trabajo) res.json(trabajoParaApi(trabajo))
    return undefined
  } catch (error) { return next(error) }
})

// DELETE /trabajos/:id -> quita el trabajo entero (sus bloques caen en cascada) (204).
router.delete('/trabajos/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Identificador de trabajo no válido' })
    const existente = await prisma.agendaTrabajo.findUnique({ where: { id } })
    if (!existente) return res.status(404).json({ error: 'Trabajo no encontrado' })
    await prisma.agendaTrabajo.delete({ where: { id } })
    return res.status(204).end()
  } catch (error) { return next(error) }
})

// Fila del día en la forma que devuelven PUT y DELETE /dias/:fecha.
async function respuestaDia(fecha) {
  const fila = await prisma.agendaDia.findUnique({ where: { fecha } })
  const config = await leerConfig(prisma)
  let tramos = config.tramos
  if (fila?.tramos) {
    try { tramos = JSON.parse(fila.tramos) } catch { /* se usan los generales */ }
  }
  return {
    fecha,
    tramos,
    horasMaximas: fila?.horasMaximas ?? config.horasMaximas,
    tramosPersonalizados: Boolean(fila?.tramos),
    horasPersonalizadas: fila?.horasMaximas !== null && fila?.horasMaximas !== undefined,
    cierre: fila?.cierre ?? null,
    motivo: fila?.motivo ?? null,
  }
}

// Guarda o borra la fila de un día: se borra solo si no queda tramos, horas ni cierre.
async function guardarFilaDia(fecha, { tramos, horasMaximas, cierre, motivo }) {
  if (tramos === null && horasMaximas === null && !cierre) {
    await prisma.agendaDia.deleteMany({ where: { fecha } })
    return
  }
  const datos = { tramos: tramos ? JSON.stringify(tramos) : null, horasMaximas, cierre: cierre ?? null, motivo: cierre ? (motivo ?? null) : null }
  await prisma.agendaDia.upsert({ where: { fecha }, update: datos, create: { fecha, ...datos } })
}

// PUT /dias/:fecha (admin) { tramos?: array|null, horasMaximas?: número|null } ->
// personaliza el horario y las horas máximas de un día (común a todos los
// mecánicos). null vuelve al valor general. Los trabajos ya programados NO se mueven.
router.put('/dias/:fecha', roleMiddleware('admin'), async (req, res, next) => {
  try {
    const fecha = req.params.fecha
    if (!esLaborable(fecha)) {
      return res.status(400).json({ error: 'Solo se pueden configurar días de lunes a viernes' })
    }
    const body = req.body ?? {}
    if (body.tramos === undefined && body.horasMaximas === undefined) {
      return res.status(400).json({ error: 'No se ha indicado ningún campo para el día' })
    }
    const existente = await prisma.agendaDia.findUnique({ where: { fecha } })
    let tramos = existente?.tramos ? JSON.parse(existente.tramos) : null
    let horasMaximas = existente?.horasMaximas ?? null

    if (body.tramos !== undefined) {
      if (body.tramos === null) {
        tramos = null
      } else {
        const { tramos: normalizados, error } = validarTramos(body.tramos)
        if (error) return res.status(400).json({ error })
        tramos = normalizados
      }
    }
    if (body.horasMaximas !== undefined) {
      if (body.horasMaximas === null) {
        horasMaximas = null
      } else {
        const { horasMaximas: normalizadas, error } = validarHorasMaximas(body.horasMaximas)
        if (error) return res.status(400).json({ error })
        horasMaximas = normalizadas
      }
    }
    await guardarFilaDia(fecha, { tramos, horasMaximas, cierre: existente?.cierre, motivo: existente?.motivo })
    return res.json(await respuestaDia(fecha))
  } catch (error) { return next(error) }
})

// DELETE /dias/:fecha (admin) -> vuelve a lo predeterminado borrando el horario y
// las horas propios del día (un cierre se conserva). Los trabajos NO se mueven.
router.delete('/dias/:fecha', roleMiddleware('admin'), async (req, res, next) => {
  try {
    const fecha = req.params.fecha
    if (!esLaborable(fecha)) {
      return res.status(400).json({ error: 'Solo se pueden configurar días de lunes a viernes' })
    }
    const existente = await prisma.agendaDia.findUnique({ where: { fecha } })
    if (existente) await guardarFilaDia(fecha, { tramos: null, horasMaximas: null, cierre: existente.cierre, motivo: existente.motivo })
    return res.json(await respuestaDia(fecha))
  } catch (error) { return next(error) }
})

export default router
