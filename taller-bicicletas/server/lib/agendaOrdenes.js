// Planificación automática de la agenda desde las órdenes: cada línea de mano de
// obra con tiempo se coloca sola en la agenda del mecánico de la orden (o «Sin
// asignar»), en el primer hueco desde la fecha de entrada. Las funciones reciben
// el cliente de Prisma (o la transacción). Nada de esto debe impedir guardar una
// orden: los envoltorios `seguro*` registran el error y la línea queda sin planificar.
import { primerHueco, redimensionar } from './planificador.js'
import { cargarCalendario, cargarColas, aplicarResultado, leerConfig, sincronizarMinutos } from './agendaDatos.js'
import { formatearFecha, horaDeMinutos, inicioPlanificacion } from './agenda.js'

// Estados de una orden en los que ya no se planifica trabajo nuevo.
const ESTADOS_TERMINADOS = ['Finalizada', 'Entregada']

// Minutos de agenda de una línea (el tiempo de la orden está en horas).
export function minutosDeLinea(linea) {
  return Math.max(1, Math.round((Number(linea.tiempo) || 0) * 60))
}

// Planifica una línea de mano de obra de la orden en el primer hueco de la cola
// del mecánico. Respeta `autoPlanificar`, la orden terminada y las líneas sin
// tiempo salvo con { forzar: true } (el botón «Planificar»). Devuelve el trabajo
// creado o null si no hay nada que planificar.
export async function planificarLinea(tx, linea, orden, { forzar = false, ahora = new Date() } = {}) {
  if (!forzar) {
    if (!(await leerConfig(tx)).autoPlanificar) return null
    if (ESTADOS_TERMINADOS.includes(orden.estado)) return null
  }
  if (!(Number(linea.tiempo) > 0)) return null
  if (await tx.agendaTrabajo.findFirst({ where: { ordenManoObraId: linea.id }, select: { id: true } })) return null

  const mecanicoId = orden.mecanicoId ?? null
  const { fecha, reloj } = inicioPlanificacion(orden.fechaEntrada, ahora)
  const { calendario } = await cargarCalendario(tx, mecanicoId, fecha)
  const colas = await cargarColas(tx, mecanicoId, fecha)
  const minutos = minutosDeLinea(linea)
  const plan = primerHueco({ calendario, colas, fecha, reloj, minutos })

  const operacion = linea.codigoOp ? await tx.operacionManoObra.findUnique({ where: { codigo: linea.codigoOp } }) : null
  const trabajo = await tx.agendaTrabajo.create({
    data: {
      descripcion: linea.descripcion,
      codigo: linea.codigoOp || null,
      categoria: operacion?.categoria ?? null,
      tiempos: operacion?.tiempos ?? null,
      operacionId: operacion?.id ?? null,
      minutos,
      mecanicoId,
      clienteId: orden.clienteId,
      ordenId: orden.id,
      ordenManoObraId: linea.id,
    },
  })
  await aplicarResultado(tx, plan, trabajo.id)
  return trabajo
}

// Tras editar una línea: copia descripción y código al trabajo y, si cambió el
// tiempo, lo redimensiona (con «siguiente» si se pasa del día). Si la línea no
// tenía trabajo, la planifica como un alta; con tiempo 0, quita el trabajo.
export async function sincronizarLinea(tx, linea, orden, { ahora = new Date() } = {}) {
  const trabajo = await tx.agendaTrabajo.findFirst({ where: { ordenManoObraId: linea.id }, include: { bloques: { orderBy: [{ fecha: 'asc' }, { inicio: 'asc' }] } } })
  if (!trabajo || trabajo.bloques.length === 0) {
    if (trabajo) await tx.agendaTrabajo.delete({ where: { id: trabajo.id } })
    return planificarLinea(tx, linea, orden, { ahora })
  }
  if (!(Number(linea.tiempo) > 0)) {
    await tx.agendaTrabajo.delete({ where: { id: trabajo.id } })
    return null
  }
  await tx.agendaTrabajo.update({ where: { id: trabajo.id }, data: { descripcion: linea.descripcion, codigo: linea.codigoOp || null } })
  const minutos = minutosDeLinea(linea)
  if (minutos !== trabajo.minutos) {
    const desde = trabajo.bloques[0].fecha
    const { calendario } = await cargarCalendario(tx, trabajo.mecanicoId, desde)
    const colas = await cargarColas(tx, trabajo.mecanicoId, desde)
    const plan = redimensionar({ calendario, colas, trabajoId: trabajo.id, minutos, desborde: 'siguiente' })
    await aplicarResultado(tx, plan, trabajo.id)
    await sincronizarMinutos(tx, trabajo.id)
  }
  return trabajo
}

// Planifica todas las líneas de una orden recién creada, duplicada o restaurada.
export async function planificarLineasOrden(tx, orden, lineas, opciones = {}) {
  for (const linea of lineas) {
    try {
      await planificarLinea(tx, linea, orden, opciones)
    } catch (error) {
      console.error(`No se pudo planificar la línea ${linea.id} de la orden ${orden.numeroOrden}:`, error?.message || error)
    }
  }
}

// Tras cambiar el mecánico de la orden: los trabajos con bloques desde hoy se
// quitan de la cola anterior y se vuelven a planificar en la del mecánico nuevo.
export async function replanificarOrden(tx, ordenId, { ahora = new Date() } = {}) {
  const orden = await tx.ordenReparacion.findUnique({ where: { id: ordenId } })
  if (!orden) return
  const hoy = formatearFecha(ahora)
  const trabajos = await tx.agendaTrabajo.findMany({
    where: { ordenId, ordenManoObraId: { not: null } },
    include: { bloques: true },
    orderBy: { id: 'asc' },
  })
  const mecanicoId = orden.mecanicoId ?? null
  for (const trabajo of trabajos) {
    if (!trabajo.bloques.some((b) => b.fecha >= hoy)) continue
    await tx.agendaBloque.deleteMany({ where: { trabajoId: trabajo.id } })
    await tx.agendaTrabajo.update({ where: { id: trabajo.id }, data: { mecanicoId } })
    const { fecha, reloj } = inicioPlanificacion(orden.fechaEntrada, ahora)
    const { calendario } = await cargarCalendario(tx, mecanicoId, fecha)
    const colas = await cargarColas(tx, mecanicoId, fecha)
    const plan = primerHueco({ calendario, colas, fecha, reloj, minutos: trabajo.minutos })
    await aplicarResultado(tx, plan, trabajo.id)
  }
}

// Planificación de cada línea de mano de obra de una orden, para mostrarla en la
// orden: [{ lineaId, planificado, trabajoId, fecha, inicio, mecanicoId }].
export async function planificacionDeOrden(db, ordenId) {
  const lineas = await db.ordenManoObra.findMany({ where: { ordenId }, orderBy: { id: 'asc' } })
  const trabajos = await db.agendaTrabajo.findMany({
    where: { ordenId, ordenManoObraId: { not: null } },
    include: { bloques: { orderBy: [{ fecha: 'asc' }, { inicio: 'asc' }] } },
  })
  return lineas.map((linea) => {
    const trabajo = trabajos.find((t) => t.ordenManoObraId === linea.id)
    const primero = trabajo?.bloques[0]
    return {
      lineaId: linea.id,
      planificado: Boolean(primero),
      trabajoId: trabajo?.id ?? null,
      fecha: primero?.fecha ?? null,
      inicio: primero ? horaDeMinutos(primero.inicio) : null,
      mecanicoId: trabajo?.mecanicoId ?? null,
    }
  })
}

// Ejecuta una acción de planificación sin que un fallo impida guardar la orden.
export async function seguro(prisma, descripcion, accion) {
  try {
    await prisma.$transaction(async (tx) => { await accion(tx) }, { timeout: 20000 })
  } catch (error) {
    console.error(`Agenda: ${descripcion}:`, error?.message || error)
  }
}
