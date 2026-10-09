// Migración de la agenda v1.13 (trabajos con fecha, hora y posición) al modelo
// de bloques con hora de inicio. Idempotente: solo toca los trabajos sin bloques.
import { minutosDeHora } from './agenda.js'

// Calcula los bloques de los trabajos antiguos: en cada (fecha, hora), por
// posición, el inicio es la hora más los minutos de los anteriores; después, en
// cada día, los que se solapan se empujan en cascada (sin pasar al día siguiente).
export function bloquesDeTrabajosAntiguos(trabajos) {
  const porDia = new Map()
  for (const t of trabajos) {
    const base = minutosDeHora(t.hora)
    if (base === null || !t.fecha || !(t.minutos > 0)) continue
    if (!porDia.has(t.fecha)) porDia.set(t.fecha, [])
    porDia.get(t.fecha).push({ trabajoId: t.id, base, posicion: t.posicion ?? 0, minutos: t.minutos })
  }
  const bloques = []
  for (const [fecha, lista] of porDia) {
    lista.sort((a, b) => a.base - b.base || a.posicion - b.posicion || a.trabajoId - b.trabajoId)
    let cursor = 0
    let horaActual = null
    let acumulado = 0
    const colocados = []
    for (const t of lista) {
      if (t.base !== horaActual) { horaActual = t.base; acumulado = 0 }
      colocados.push({ trabajoId: t.trabajoId, inicio: t.base + acumulado, minutos: t.minutos })
      acumulado += t.minutos
    }
    colocados.sort((a, b) => a.inicio - b.inicio)
    for (const b of colocados) {
      if (b.inicio < cursor) b.inicio = cursor
      cursor = b.inicio + b.minutos
      bloques.push({ ...b, fecha, forzado: false })
    }
  }
  return bloques
}

// Crea un bloque para cada trabajo antiguo sin bloques; devuelve cuántos creó.
export async function migrarAgenda(prisma) {
  const trabajos = await prisma.agendaTrabajo.findMany({
    where: { bloques: { none: {} }, NOT: { fecha: '' } },
    select: { id: true, fecha: true, hora: true, posicion: true, minutos: true },
  })
  const bloques = bloquesDeTrabajosAntiguos(trabajos)
  if (bloques.length === 0) return 0
  await prisma.agendaBloque.createMany({ data: bloques })
  return bloques.length
}
