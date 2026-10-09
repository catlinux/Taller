// Acceso a datos de la agenda por mecánico: configuración, calendario efectivo
// (día > mecánico > taller), colas de bloques y aplicación de los resultados del
// planificador. Todas las funciones reciben el cliente de Prisma (o la
// transacción) para poder usarse dentro de prisma.$transaction.
import { CONFIG_AGENDA_DEFECTO } from './agenda.js'

// Clave de la tabla Ajuste donde se guarda la configuración general de la agenda.
const CLAVE_AJUSTE = 'agenda'

// Lectura tolerante de un JSON guardado como texto.
function parsearJson(texto, defecto) {
  if (typeof texto !== 'string' || texto === '') return defecto
  try {
    return JSON.parse(texto) ?? defecto
  } catch {
    return defecto
  }
}

// Configuración general efectiva: la guardada en Ajuste mezclada con los valores por defecto.
export async function leerConfig(db) {
  const ajuste = await db.ajuste.findUnique({ where: { clave: CLAVE_AJUSTE } })
  const guardada = ajuste ? parsearJson(ajuste.valor, {}) : {}
  return {
    tramos: Array.isArray(guardada.tramos) ? guardada.tramos : CONFIG_AGENDA_DEFECTO.tramos,
    horasMaximas: typeof guardada.horasMaximas === 'number' ? guardada.horasMaximas : CONFIG_AGENDA_DEFECTO.horasMaximas,
    autoPlanificar: guardada.autoPlanificar !== false,
  }
}

// Filtro de Prisma para los trabajos de una cola: un mecánico o «Sin asignar» (null).
export function filtroMecanico(mecanicoId) {
  return { mecanicoId: mecanicoId ?? null }
}

// Calendario efectivo para la cola de un mecánico: función síncrona
// fecha -> { tramos, maxMin, cerrado, ... } con la precedencia ajuste del día >
// valores del mecánico > configuración del taller. Precarga los ajustes de día
// desde `desde` en adelante (el planificador puede avanzar muchos días).
export async function cargarCalendario(db, mecanicoId, desde) {
  const [config, filasDia, mecanico] = await Promise.all([
    leerConfig(db),
    db.agendaDia.findMany({ where: { fecha: { gte: desde } } }),
    mecanicoId ? db.mecanico.findUnique({ where: { id: mecanicoId } }) : null,
  ])
  const filas = new Map(filasDia.map((fila) => [fila.fecha, fila]))
  const tramosMecanico = parsearJson(mecanico?.agendaTramos, null)
  const horasMecanico = mecanico?.agendaHorasMaximas ?? null
  const calendario = (fecha) => {
    const fila = filas.get(fecha)
    const tramosDia = parsearJson(fila?.tramos, null)
    const tramos = Array.isArray(tramosDia) && tramosDia.length > 0
      ? tramosDia
      : (Array.isArray(tramosMecanico) && tramosMecanico.length > 0 ? tramosMecanico : config.tramos)
    const horas = fila?.horasMaximas ?? horasMecanico ?? config.horasMaximas
    return {
      tramos,
      maxMin: Math.round(horas * 60),
      cerrado: fila?.cierre || null,
      motivo: fila?.motivo ?? null,
      tramosPersonalizados: Boolean(fila?.tramos),
      horasPersonalizadas: fila?.horasMaximas !== null && fila?.horasMaximas !== undefined,
    }
  }
  return { calendario, config, mecanico }
}

// Colas de bloques de un mecánico desde una fecha: { fecha: [{ id, trabajoId, inicio, minutos, forzado }] }.
export async function cargarColas(db, mecanicoId, desde) {
  const bloques = await db.agendaBloque.findMany({
    where: { fecha: { gte: desde }, trabajo: filtroMecanico(mecanicoId) },
    orderBy: [{ fecha: 'asc' }, { inicio: 'asc' }, { id: 'asc' }],
  })
  const colas = {}
  for (const b of bloques) {
    if (!colas[b.fecha]) colas[b.fecha] = []
    colas[b.fecha].push({ id: b.id, trabajoId: b.trabajoId, inicio: b.inicio, minutos: b.minutos, forzado: b.forzado })
  }
  return colas
}

// Aplica { crear, actualizar, borrar } del planificador. Los bloques por crear
// sin trabajo (trabajoId null) pertenecen a `trabajoIdNuevo`.
export async function aplicarResultado(db, resultado, trabajoIdNuevo = null) {
  if (resultado.borrar.length > 0) await db.agendaBloque.deleteMany({ where: { id: { in: resultado.borrar } } })
  for (const a of resultado.actualizar) {
    await db.agendaBloque.update({ where: { id: a.id }, data: { fecha: a.fecha, inicio: a.inicio, minutos: a.minutos, forzado: a.forzado } })
  }
  if (resultado.crear.length > 0) {
    await db.agendaBloque.createMany({
      data: resultado.crear.map((c) => ({
        trabajoId: c.trabajoId ?? trabajoIdNuevo,
        fecha: c.fecha,
        inicio: c.inicio,
        minutos: c.minutos,
        forzado: c.forzado,
      })),
    })
  }
}

// Pone en AgendaTrabajo.minutos la suma de sus bloques (duración total).
export async function sincronizarMinutos(db, trabajoId) {
  const suma = await db.agendaBloque.aggregate({ where: { trabajoId }, _sum: { minutos: true } })
  const total = suma._sum.minutos ?? 0
  if (total > 0) await db.agendaTrabajo.update({ where: { id: trabajoId }, data: { minutos: total } })
}

// «Nombre Primerapellido» de un cliente.
export function nombreCorto(cliente) {
  if (!cliente) return null
  const apellido = typeof cliente.apellidos === 'string' ? cliente.apellidos.trim().split(/\s+/)[0] : ''
  return [cliente.nombre, apellido].filter(Boolean).join(' ')
}
