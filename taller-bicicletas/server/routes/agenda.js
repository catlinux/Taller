import { Router } from 'express'
import prisma from '../db.js'
import { authMiddleware, roleMiddleware } from './auth.js'
import {
  CONFIG_AGENDA_DEFECTO,
  validarTramos,
  validarHorasMaximas,
  franjasDeTramos,
  semanaLaborable,
  esLaborable,
  esFechaValida,
  hoyLocal,
  sumarDias,
  nombreDia,
  resumenDia,
} from '../lib/agenda.js'

const router = Router()
router.use(authMiddleware)

// Clave de la tabla Ajuste donde se guarda la configuración general de la agenda.
const CLAVE_AJUSTE = 'agenda'

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

// Prepara una fila de la agenda para la API: tiempos como array en lugar del JSON.
function conTiempos(trabajo) {
  return { ...trabajo, tiempos: parsearTiempos(trabajo.tiempos) }
}

// Configuración general efectiva: la guardada en Ajuste mezclada con los valores
// por defecto.
async function leerConfig() {
  const ajuste = await prisma.ajuste.findUnique({ where: { clave: CLAVE_AJUSTE } })
  let guardada = {}
  if (ajuste) {
    try {
      guardada = JSON.parse(ajuste.valor) ?? {}
    } catch {
      // Valor corrupto: se usan los valores por defecto.
    }
  }
  return {
    tramos: Array.isArray(guardada.tramos) ? guardada.tramos : CONFIG_AGENDA_DEFECTO.tramos,
    horasMaximas: typeof guardada.horasMaximas === 'number' ? guardada.horasMaximas : CONFIG_AGENDA_DEFECTO.horasMaximas,
  }
}

// Tramos efectivos de un día: los propios del día o, si no los tiene, los generales.
function tramosDelDia(config, filaDia) {
  if (filaDia?.tramos) {
    try {
      const tramos = JSON.parse(filaDia.tramos)
      if (Array.isArray(tramos) && tramos.length > 0) return tramos
    } catch {
      // Valor corrupto: se usan los generales.
    }
  }
  return config.tramos
}

// Construye el objeto de un día en el mismo formato que devuelve GET /semana.
function construirDia(config, fecha, filaDia, trabajos, hoy) {
  const tramosPersonalizados = Boolean(filaDia?.tramos)
  const horasPersonalizadas = filaDia?.horasMaximas !== null && filaDia?.horasMaximas !== undefined
  const tramos = tramosDelDia(config, filaDia)
  const horasMaximas = horasPersonalizadas ? filaDia.horasMaximas : config.horasMaximas
  const resumen = resumenDia({ trabajos, tramos, horasMaximas })
  return {
    fecha,
    nombre: nombreDia(fecha),
    esHoy: fecha === hoy,
    tramos,
    tramosPersonalizados,
    horasMaximas,
    horasPersonalizadas,
    franjas: franjasDeTramos(tramos),
    ...resumen,
    trabajos: trabajos
      .map(conTiempos)
      .sort((a, b) => a.hora.localeCompare(b.hora) || a.posicion - b.posicion || a.id - b.id),
  }
}

// GET /config -> configuración general efectiva (tramos y horas máximas).
router.get('/config', async (req, res, next) => {
  try {
    return res.json(await leerConfig())
  } catch (error) { return next(error) }
})

// PUT /config (admin) { tramos?, horasMaximas? } -> valida y guarda la
// configuración general. Los campos omitidos se conservan.
router.put('/config', roleMiddleware('admin'), async (req, res, next) => {
  try {
    const body = req.body ?? {}
    if (body.tramos === undefined && body.horasMaximas === undefined) {
      return res.status(400).json({ error: 'No se ha indicado ningún campo de configuración' })
    }
    const config = await leerConfig()
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
    const valor = JSON.stringify(config)
    await prisma.ajuste.upsert({
      where: { clave: CLAVE_AJUSTE },
      update: { valor },
      create: { clave: CLAVE_AJUSTE, valor },
    })
    return res.json(config)
  } catch (error) { return next(error) }
})

// GET /semana?fecha=AAAA-MM-DD -> los 5 días laborables de la semana (hoy por
// defecto), con configuración, tramos, franjas, trabajos y ocupación.
router.get('/semana', async (req, res, next) => {
  try {
    const hoy = hoyLocal()
    const fecha = req.query.fecha === undefined || req.query.fecha === '' ? hoy : req.query.fecha
    if (!esFechaValida(fecha)) {
      return res.status(400).json({ error: 'La fecha debe tener el formato AAAA-MM-DD' })
    }
    const dias = semanaLaborable(fecha)
    const lunes = dias[0]
    const config = await leerConfig()

    // Un solo findMany por tabla para los 5 días de la semana.
    const [filasDia, trabajos] = await Promise.all([
      prisma.agendaDia.findMany({ where: { fecha: { in: dias } } }),
      prisma.agendaTrabajo.findMany({ where: { fecha: { in: dias } } }),
    ])
    const filaPorFecha = new Map(filasDia.map((fila) => [fila.fecha, fila]))
    const trabajosPorFecha = new Map()
    for (const trabajo of trabajos) {
      if (!trabajosPorFecha.has(trabajo.fecha)) trabajosPorFecha.set(trabajo.fecha, [])
      trabajosPorFecha.get(trabajo.fecha).push(trabajo)
    }

    return res.json({
      lunes,
      viernes: dias[4],
      anterior: sumarDias(lunes, -7),
      siguiente: sumarDias(lunes, 7),
      config,
      dias: dias.map((dia) => construirDia(config, dia, filaPorFecha.get(dia), trabajosPorFecha.get(dia) ?? [], hoy)),
    })
  } catch (error) { return next(error) }
})

// POST /trabajos { fecha, hora, operacionId, minutos?, nota? } -> programa un
// trabajo del catálogo en una franja del día. Copia código, descripción,
// categoría y tiempos de la operación.
router.post('/trabajos', async (req, res, next) => {
  try {
    const body = req.body ?? {}
    if (!esLaborable(body.fecha)) {
      return res.status(400).json({ error: 'Solo se pueden programar trabajos de lunes a viernes' })
    }
    const operacionId = parseId(body.operacionId)
    if (operacionId === null) {
      return res.status(400).json({ error: 'Identificador de operación no válido' })
    }
    const operacion = await prisma.operacionManoObra.findUnique({ where: { id: operacionId } })
    if (!operacion) {
      return res.status(404).json({ error: 'Operación no encontrada' })
    }

    const config = await leerConfig()
    const filaDia = await prisma.agendaDia.findUnique({ where: { fecha: body.fecha } })
    const tramos = tramosDelDia(config, filaDia)
    const hora = typeof body.hora === 'string' ? body.hora.trim() : ''
    if (!franjasDeTramos(tramos).some((franja) => franja.hora === hora)) {
      return res.status(400).json({ error: 'Esa hora no está dentro del horario del día' })
    }

    // Duración: la indicada (entero 1-1440); si no, el primer tiempo de la
    // operación y, si no tiene tiempos, su tiempo por defecto en minutos (mín. 1).
    let minutos
    if (body.minutos !== undefined && body.minutos !== null) {
      minutos = enteroEntre(body.minutos, 1, 1440)
      if (minutos === null) {
        return res.status(400).json({ error: 'La duración debe ser un número entero entre 1 y 1440 minutos' })
      }
    } else {
      const tiempos = parsearTiempos(operacion.tiempos)
      minutos = tiempos.length > 0 ? tiempos[0] : Math.max(1, Math.round(operacion.tiempoDefecto * 60))
    }

    let nota = null
    if (body.nota !== undefined) {
      const resultado = normalizarNota(body.nota)
      if (resultado.error) return res.status(400).json({ error: resultado.error })
      nota = resultado.nota
    }

    const ultimo = await prisma.agendaTrabajo.aggregate({
      where: { fecha: body.fecha, hora },
      _max: { posicion: true },
    })
    const posicion = (ultimo._max.posicion ?? -1) + 1

    const trabajo = await prisma.agendaTrabajo.create({
      data: {
        fecha: body.fecha,
        hora,
        operacionId,
        codigo: operacion.codigo,
        descripcion: operacion.descripcion,
        categoria: operacion.categoria ?? null,
        tiempos: operacion.tiempos ?? null,
        minutos,
        nota,
        posicion,
      },
    })
    return res.status(201).json(conTiempos(trabajo))
  } catch (error) { return next(error) }
})

// PUT /trabajos/:id { fecha?, hora?, minutos?, nota?, posicion? } -> mueve el
// trabajo a otra fecha u hora (validando el horario del día de destino), cambia
// su duración, su nota o su posición.
router.put('/trabajos/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de trabajo no válido' })
    }
    const existente = await prisma.agendaTrabajo.findUnique({ where: { id } })
    if (!existente) {
      return res.status(404).json({ error: 'Trabajo no encontrado' })
    }

    const body = req.body ?? {}
    const datos = {}
    const cambiaFecha = body.fecha !== undefined
    const cambiaHora = body.hora !== undefined
    let fecha = existente.fecha
    let hora = existente.hora
    if (cambiaFecha) {
      if (!esLaborable(body.fecha)) {
        return res.status(400).json({ error: 'Solo se pueden programar trabajos de lunes a viernes' })
      }
      fecha = body.fecha
    }
    if (cambiaHora) hora = typeof body.hora === 'string' ? body.hora.trim() : ''
    if (cambiaFecha || cambiaHora) {
      const config = await leerConfig()
      const filaDia = await prisma.agendaDia.findUnique({ where: { fecha } })
      const tramos = tramosDelDia(config, filaDia)
      if (!franjasDeTramos(tramos).some((franja) => franja.hora === hora)) {
        return res.status(400).json({ error: 'Esa hora no está dentro del horario del día' })
      }
      if (cambiaFecha) datos.fecha = fecha
      if (cambiaHora) datos.hora = hora
    }

    if (body.minutos !== undefined) {
      const minutos = enteroEntre(body.minutos, 1, 1440)
      if (minutos === null) {
        return res.status(400).json({ error: 'La duración debe ser un número entero entre 1 y 1440 minutos' })
      }
      datos.minutos = minutos
    }
    if (body.nota !== undefined) {
      const resultado = normalizarNota(body.nota)
      if (resultado.error) return res.status(400).json({ error: resultado.error })
      datos.nota = resultado.nota
    }
    if (body.posicion !== undefined) {
      const posicion = enteroEntre(body.posicion, 0, 2147483647)
      if (posicion === null) {
        return res.status(400).json({ error: 'La posición debe ser un número entero mayor o igual que 0' })
      }
      datos.posicion = posicion
    }
    if (Object.keys(datos).length === 0) {
      return res.status(400).json({ error: 'No se han proporcionado campos para actualizar' })
    }

    const trabajo = await prisma.agendaTrabajo.update({ where: { id }, data: datos })
    return res.json(conTiempos(trabajo))
  } catch (error) { return next(error) }
})

// DELETE /trabajos/:id -> borra un trabajo programado (204).
router.delete('/trabajos/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de trabajo no válido' })
    }
    const existente = await prisma.agendaTrabajo.findUnique({ where: { id } })
    if (!existente) {
      return res.status(404).json({ error: 'Trabajo no encontrado' })
    }
    await prisma.agendaTrabajo.delete({ where: { id } })
    return res.status(204).end()
  } catch (error) { return next(error) }
})

// PUT /dias/:fecha (admin) { tramos?: array|null, horasMaximas?: número|null } ->
// personaliza el horario y las horas máximas de un día concreto. null en un
// campo vuelve a usar el valor general. Si ambos quedan null, borra la fila del
// día. Los trabajos ya programados NO se borran.
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

    let filaDia = null
    if (tramos === null && horasMaximas === null) {
      // Sin personalización: se borra la fila para volver a lo general.
      if (existente) await prisma.agendaDia.delete({ where: { fecha } })
    } else {
      const datos = {
        tramos: tramos ? JSON.stringify(tramos) : null,
        horasMaximas,
      }
      filaDia = await prisma.agendaDia.upsert({
        where: { fecha },
        update: datos,
        create: { fecha, ...datos },
      })
    }

    const trabajos = await prisma.agendaTrabajo.findMany({ where: { fecha } })
    const config = await leerConfig()
    return res.json(construirDia(config, fecha, filaDia, trabajos, hoyLocal()))
  } catch (error) { return next(error) }
})

// DELETE /dias/:fecha (admin) -> vuelve a lo predeterminado borrando la
// personalización del día. Los trabajos ya programados NO se borran.
router.delete('/dias/:fecha', roleMiddleware('admin'), async (req, res, next) => {
  try {
    const fecha = req.params.fecha
    if (!esLaborable(fecha)) {
      return res.status(400).json({ error: 'Solo se pueden configurar días de lunes a viernes' })
    }
    const existente = await prisma.agendaDia.findUnique({ where: { fecha } })
    if (existente) await prisma.agendaDia.delete({ where: { fecha } })
    const trabajos = await prisma.agendaTrabajo.findMany({ where: { fecha } })
    const config = await leerConfig()
    return res.json(construirDia(config, fecha, null, trabajos, hoyLocal()))
  } catch (error) { return next(error) }
})

export default router

