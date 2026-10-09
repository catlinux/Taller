// Planificador PURO de la agenda por mecánico (sin Prisma ni Express): decide
// dónde van los bloques de trabajo de una cola (un mecánico o «Sin asignar») y
// devuelve los cambios por aplicar { crear, actualizar, borrar }, o
// { requiereDecision: true, excesoMin, fecha } si hace falta preguntar.
// Pruebas en planificador.test.mjs.
//
// En cada día se trabaja en «desplazamiento laborable» (d): minutos de trabajo
// desde el inicio del primer tramo, saltando las pausas. L = minutos del horario
// y C = min(horas máximas, L) = capacidad. Un día cerrado tiene L = C = 0.
// Un bloque ocupa [d, d + minutos) y no se solapa con otro de la misma cola.
import { esLaborable, sumarDias, minutosDeHora } from './agenda.js'

const LIMITE_DIAS = 260
const PASO_REDONDEO = 15

// Tramos [{inicio, fin}] (texto «HH:MM» o minutos) -> [{ini, fin}] en minutos, ordenados.
function normalizarTramos(tramos) {
  return (tramos ?? [])
    .map((t) => ({
      ini: typeof t.inicio === 'string' ? minutosDeHora(t.inicio) : t.inicio,
      fin: typeof t.fin === 'string' ? minutosDeHora(t.fin) : t.fin,
    }))
    .sort((a, b) => a.ini - b.ini)
}

// Minutos de trabajo que hay en los tramos.
export function minutosDeTramos(tramos) {
  return normalizarTramos(tramos).reduce((total, t) => total + (t.fin - t.ini), 0)
}

// Reloj (minutos desde medianoche) -> desplazamiento laborable. Un reloj en una
// pausa equivale al inicio del tramo siguiente; pasado el final, a L.
export function aDesplazamiento(tramos, reloj) {
  let desplazamiento = 0
  for (const t of normalizarTramos(tramos)) {
    if (reloj < t.ini) return desplazamiento
    if (reloj < t.fin) return desplazamiento + (reloj - t.ini)
    desplazamiento += t.fin - t.ini
  }
  return desplazamiento
}

// Desplazamiento laborable -> reloj. Con { fin: true } un desplazamiento justo
// en el límite de un tramo devuelve el final de ese tramo (para el fin de un bloque).
export function aReloj(tramos, desplazamiento, { fin = false } = {}) {
  const lista = normalizarTramos(tramos)
  let resto = desplazamiento
  for (const t of lista) {
    const largo = t.fin - t.ini
    if (resto < largo || (fin && resto === largo && resto > 0)) return t.ini + resto
    resto -= largo
  }
  return lista.length > 0 ? lista[lista.length - 1].fin + resto : resto
}

// Calendario de un día con L y C ya calculados (cerrado => L = C = 0).
function crearContexto(calendario) {
  const cache = new Map()
  return {
    dia(fecha) {
      if (!cache.has(fecha)) {
        const cal = calendario(fecha) ?? {}
        const tramos = cal.tramos ?? []
        const cerrado = cal.cerrado || null
        const L = cerrado ? 0 : minutosDeTramos(tramos)
        const C = cerrado ? 0 : Math.max(0, Math.min(cal.maxMin ?? L, L))
        cache.set(fecha, { tramos, cerrado, L, C })
      }
      return cache.get(fecha)
    },
  }
}

const porInicio = (a, b) => a.d - b.d

// Carga las colas { fecha: [{id, trabajoId, inicio, minutos, forzado}] } en un
// estado de trabajo (Map fecha -> items ordenados) y apunta los ids originales.
function cargarEstado(colas, ctx) {
  const estado = new Map()
  const ids = new Set()
  const entradas = colas instanceof Map ? [...colas.entries()] : Object.entries(colas ?? {})
  for (const [fecha, bloques] of entradas) {
    const dia = ctx.dia(fecha)
    const items = (bloques ?? []).map((b) => {
      const d = aDesplazamiento(dia.tramos, b.inicio)
      ids.add(b.id)
      return {
        id: b.id,
        trabajoId: b.trabajoId,
        d,
        minutos: b.minutos,
        forzado: Boolean(b.forzado),
        orig: { fecha, d, minutos: b.minutos, forzado: Boolean(b.forzado) },
      }
    })
    estado.set(fecha, items.sort(porInicio))
  }
  return { estado, ids }
}

function itemsDe(estado, fecha) {
  if (!estado.has(fecha)) estado.set(fecha, [])
  return estado.get(fecha)
}

// Empuja en cascada los bloques que quedan tapados por el de la posición idx.
function cascada(items, idx) {
  let cursor = items[idx].d + items[idx].minutos
  for (let i = idx + 1; i < items.length; i++) {
    if (items[i].d < cursor) {
      items[i].d = cursor
      cursor = items[i].d + items[i].minutos
    } else break
  }
}

// Parte los items del día en los que se quedan y el sobrante (que pasa al día
// siguiente). Con modo 'siguiente' se respeta la capacidad C y el horario L; con
// 'forzar' solo el horario. Un bloque que cruza el límite se parte en dos.
function recortar(items, dia, modo) {
  const quedan = []
  const sobrante = []
  let acumulado = 0
  let cortado = false
  for (const item of items) {
    if (cortado) { sobrante.push(item); continue }
    const porPosicion = Math.max(0, dia.L - item.d)
    const porCapacidad = modo === 'forzar' ? Infinity : Math.max(0, dia.C - acumulado)
    const cabe = Math.min(item.minutos, porPosicion, porCapacidad)
    if (cabe === item.minutos) {
      quedan.push(item)
      acumulado += item.minutos
      continue
    }
    cortado = true
    if (cabe > 0) {
      sobrante.push({ id: null, trabajoId: item.trabajoId, d: 0, minutos: item.minutos - cabe, forzado: false, orig: null })
      item.minutos = cabe
      quedan.push(item)
      acumulado += cabe
    } else {
      sobrante.push(item)
    }
  }
  return { quedan, sobrante }
}

// Marca como forzados los bloques que acaban pasada la capacidad del día.
function marcarForzados(items, dia) {
  let acumulado = 0
  for (const item of items) {
    acumulado += item.minutos
    item.forzado = acumulado > dia.C
  }
}

// Funde los bloques contiguos de un mismo trabajo dentro del día.
function fusionar(items) {
  items.sort(porInicio)
  const resultado = []
  for (const item of items) {
    const anterior = resultado[resultado.length - 1]
    if (anterior && anterior.trabajoId === item.trabajoId && anterior.d + anterior.minutos === item.d) {
      anterior.minutos += item.minutos
      if (anterior.id == null && item.id != null) { anterior.id = item.id; anterior.orig = item.orig }
    } else {
      resultado.push(item)
    }
  }
  return resultado
}

// Deja un día en su forma final: fusionado, ordenado y con los forzados marcados.
function cerrarDia(estado, ctx, fecha, items) {
  const finales = fusionar(items)
  marcarForzados(finales, ctx.dia(fecha))
  estado.set(fecha, finales)
}

// Siguiente día laborable (lunes a viernes) abierto y con capacidad, o error
// pasados 260 días laborables.
function siguienteAbierto(fecha, ctx) {
  let actual = fecha
  let contados = 0
  while (contados < LIMITE_DIAS) {
    actual = sumarDias(actual, 1)
    if (!esLaborable(actual)) continue
    contados += 1
    const dia = ctx.dia(actual)
    if (!dia.cerrado && dia.C > 0) return actual
  }
  throw new Error(`No hay ningún día con capacidad en los próximos ${LIMITE_DIAS} días laborables`)
}

// Pasa los pendientes, en orden, al principio de los siguientes días abiertos,
// desplazando la cola de cada uno y repitiendo en cascada con 'siguiente'.
function llevarAlSiguiente(estado, ctx, fecha, pendientes) {
  let actual = fecha
  let lista = pendientes
  while (lista.length > 0) {
    actual = siguienteAbierto(actual, ctx)
    const dia = ctx.dia(actual)
    const existentes = [...itemsDe(estado, actual)].sort(porInicio)
    let cursor = 0
    for (const p of lista) {
      p.d = cursor
      p.forzado = false
      cursor += p.minutos
    }
    for (const e of existentes) {
      if (e.d < cursor) {
        e.d = cursor
        cursor = e.d + e.minutos
      } else break
    }
    const { quedan, sobrante } = recortar([...lista, ...existentes], dia, 'siguiente')
    cerrarDia(estado, ctx, actual, quedan)
    lista = sobrante
  }
}

// Con el día ya recolocado (items ordenados): decide el exceso y lo aplica.
// Devuelve { requiereDecision } si falta decidir, o null si todo quedó aplicado.
function resolverDia(estado, ctx, fecha, items, desborde) {
  const dia = ctx.dia(fecha)
  if (desborde === null || desborde === undefined) {
    const prueba = recortar(items.map((i) => ({ ...i })), dia, 'siguiente')
    const excesoMin = prueba.sobrante.reduce((total, i) => total + i.minutos, 0)
    if (excesoMin > 0) return { requiereDecision: true, excesoMin, fecha }
  }
  const { quedan, sobrante } = recortar(items, dia, desborde === 'forzar' ? 'forzar' : 'siguiente')
  cerrarDia(estado, ctx, fecha, quedan)
  if (sobrante.length > 0) llevarAlSiguiente(estado, ctx, fecha, sobrante)
  return null
}

// Convierte el estado final en { crear, actualizar, borrar} comparándolo con el original.
function resultado(estado, ids, ctx) {
  const crear = []
  const actualizar = []
  const finales = new Set()
  for (const [fecha, items] of estado) {
    const dia = ctx.dia(fecha)
    for (const item of [...items].sort(porInicio)) {
      const inicio = aReloj(dia.tramos, item.d)
      if (item.id == null) {
        crear.push({ trabajoId: item.trabajoId, fecha, inicio, minutos: item.minutos, forzado: item.forzado })
        continue
      }
      finales.add(item.id)
      const o = item.orig
      if (!o || o.fecha !== fecha || o.d !== item.d || o.minutos !== item.minutos || o.forzado !== item.forzado) {
        actualizar.push({ id: item.id, trabajoId: item.trabajoId, fecha, inicio, minutos: item.minutos, forzado: item.forzado })
      }
    }
  }
  const borrar = [...ids].filter((id) => !finales.has(id))
  const orden = (a, b) => a.fecha.localeCompare(b.fecha) || a.inicio - b.inicio
  return { crear: crear.sort(orden), actualizar: actualizar.sort(orden), borrar: borrar.sort((a, b) => a - b) }
}

function validarMinutos(minutos) {
  if (!Number.isInteger(minutos) || minutos < 1) throw new Error('La duración debe ser un número entero de minutos mayor que 0')
}

// Inserta un trabajo de `minutos` en (fecha, desplazamiento x): si x cae dentro de
// un bloque pasa a su final y los siguientes se empujan en cascada. `desborde`
// (null | 'forzar' | 'siguiente') decide qué hacer si el día se pasa.
export function insertar({ calendario, colas, fecha, x, minutos, trabajoId = null, desborde = null }) {
  validarMinutos(minutos)
  const ctx = crearContexto(calendario)
  const { estado, ids } = cargarEstado(colas, ctx)
  return insertarEnEstado(estado, ids, ctx, { fecha, x, minutos, trabajoId, desborde })
}

function insertarEnEstado(estado, ids, ctx, { fecha, x, minutos, trabajoId, desborde }) {
  const dia = ctx.dia(fecha)
  if (dia.cerrado) {
    throw new Error(`El día está cerrado: ${typeof dia.cerrado === 'string' ? dia.cerrado : 'cerrado'}`)
  }
  const items = [...itemsDe(estado, fecha)].sort(porInicio)
  let posicion = Math.max(0, x)
  for (const item of items) {
    if (item.d < posicion && posicion < item.d + item.minutos) posicion = item.d + item.minutos
  }
  const nuevo = { id: null, trabajoId, d: posicion, minutos, forzado: false, orig: null }
  const indice = items.findIndex((i) => i.d >= posicion)
  items.splice(indice === -1 ? items.length : indice, 0, nuevo)
  cascada(items, items.indexOf(nuevo))
  const decision = resolverDia(estado, ctx, fecha, items, desborde)
  if (decision) return decision
  return resultado(estado, ids, ctx)
}

// Primer hueco para un trabajo de `minutos` desde (fecha, reloj) (el reloj se
// redondea hacia arriba a 15 min; null = principio del día). Nunca fuerza: usa un
// hueco libre donde quepa entero o el último hueco del día, y lo que no cabe pasa
// al día siguiente, así que un trabajo solo se parte entre días.
export function primerHueco({ calendario, colas = {}, fecha, reloj = null, minutos, trabajoId = null }) {
  validarMinutos(minutos)
  const ctx = crearContexto(calendario)
  const { estado } = cargarEstado(colas, ctx)
  const crear = []
  let restante = minutos
  let actual = fecha
  let primero = true
  let contados = 0
  while (restante > 0) {
    if (!esLaborable(actual)) { actual = sumarDias(actual, 1); primero = false; continue }
    if (contados++ >= LIMITE_DIAS) throw new Error(`No hay hueco en los próximos ${LIMITE_DIAS} días laborables`)
    const dia = ctx.dia(actual)
    if (!dia.cerrado && dia.C > 0) {
      const desde = primero && reloj !== null
        ? aDesplazamiento(dia.tramos, Math.ceil(reloj / PASO_REDONDEO) * PASO_REDONDEO)
        : 0
      const colocado = colocarEnDia([...itemsDe(estado, actual)].sort(porInicio), dia, desde, restante)
      if (colocado) {
        crear.push({ trabajoId, fecha: actual, inicio: aReloj(dia.tramos, colocado.d), minutos: colocado.minutos, forzado: false })
        restante -= colocado.minutos
      }
    }
    primero = false
    actual = sumarDias(actual, 1)
  }
  return { crear, actualizar: [], borrar: [] }
}

// Busca dónde poner `restante` minutos en un día desde el desplazamiento `desde`:
// el primer hueco donde cabe entero o, si no, el último hueco (hasta L), siempre
// dentro de la capacidad que queda. Devuelve { d, minutos } o null.
function colocarEnDia(items, dia, desde, restante) {
  const capacidadLibre = dia.C - items.reduce((total, i) => total + i.minutos, 0)
  if (capacidadLibre <= 0) return null
  const huecos = []
  let cursor = desde
  for (const item of items) {
    const fin = item.d + item.minutos
    if (fin <= cursor) continue
    if (item.d > cursor) huecos.push([cursor, item.d])
    cursor = Math.max(cursor, fin)
  }
  if (cursor < dia.L) huecos.push([cursor, dia.L])
  for (let i = 0; i < huecos.length; i++) {
    const [inicio, fin] = huecos[i]
    const permitido = Math.min(fin - inicio, capacidadLibre)
    if (permitido >= restante) return { d: inicio, minutos: restante }
    if (i === huecos.length - 1 && fin === dia.L && permitido > 0) return { d: inicio, minutos: permitido }
  }
  return null
}

// Cambia la duración total de un trabajo. Si crece, alarga su último bloque y
// empuja a los siguientes (mismo protocolo de `desborde` que insertar). Si
// decrece, recorta desde los últimos bloques y borra los que quedan a 0.
export function redimensionar({ calendario, colas, trabajoId, minutos, desborde = null }) {
  validarMinutos(minutos)
  const ctx = crearContexto(calendario)
  const { estado, ids } = cargarEstado(colas, ctx)
  const propios = []
  for (const [fecha, items] of estado) {
    for (const item of items) if (item.trabajoId === trabajoId) propios.push({ fecha, item })
  }
  if (propios.length === 0) throw new Error('El trabajo no tiene bloques en la agenda')
  propios.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.item.d - b.item.d)
  const total = propios.reduce((suma, p) => suma + p.item.minutos, 0)
  const diferencia = minutos - total
  if (diferencia === 0) return { crear: [], actualizar: [], borrar: [] }

  if (diferencia < 0) {
    let quitar = -diferencia
    const tocadas = new Set()
    for (let i = propios.length - 1; i >= 0 && quitar > 0; i--) {
      const { fecha, item } = propios[i]
      const resta = Math.min(item.minutos, quitar)
      item.minutos -= resta
      quitar -= resta
      tocadas.add(fecha)
      if (item.minutos === 0) estado.set(fecha, itemsDe(estado, fecha).filter((o) => o !== item))
    }
    for (const fecha of tocadas) cerrarDia(estado, ctx, fecha, itemsDe(estado, fecha))
    return resultado(estado, ids, ctx)
  }

  const { fecha, item } = propios[propios.length - 1]
  item.minutos += diferencia
  const items = [...itemsDe(estado, fecha)].sort(porInicio)
  cascada(items, items.indexOf(item))
  const decision = resolverDia(estado, ctx, fecha, items, desborde)
  if (decision) return decision
  return resultado(estado, ids, ctx)
}

// Mueve un trabajo: quita todos sus bloques y lo vuelve a insertar en
// (fecha, x) con su duración total. Mismo protocolo de `desborde` que insertar.
export function mover({ calendario, colas, trabajoId, fecha, x, desborde = null }) {
  const ctx = crearContexto(calendario)
  const { estado, ids } = cargarEstado(colas, ctx)
  let total = 0
  for (const [dia, items] of estado) {
    const resto = items.filter((i) => i.trabajoId !== trabajoId)
    if (resto.length === items.length) continue
    total += items.reduce((suma, i) => (i.trabajoId === trabajoId ? suma + i.minutos : suma), 0)
    cerrarDia(estado, ctx, dia, resto)
  }
  if (total === 0) throw new Error('El trabajo no tiene bloques en la agenda')
  return insertarEnEstado(estado, ids, ctx, { fecha, x, minutos: total, trabajoId, desborde })
}

// Quita un trabajo: borra sus bloques sin compactar el resto.
export function quitar({ colas, trabajoId }) {
  const borrar = []
  const entradas = colas instanceof Map ? [...colas.values()] : Object.values(colas ?? {})
  for (const bloques of entradas) {
    for (const b of bloques) if (b.trabajoId === trabajoId) borrar.push(b.id)
  }
  return { crear: [], actualizar: [], borrar: borrar.sort((a, b) => a - b) }
}

// Vacía un día (para cerrarlo): sus bloques pasan, en orden, al principio del
// siguiente día abierto con 'siguiente' y en cascada.
export function vaciarDia({ calendario, colas, fecha }) {
  const ctx = crearContexto(calendario)
  const { estado, ids } = cargarEstado(colas, ctx)
  const items = [...itemsDe(estado, fecha)].sort(porInicio)
  estado.set(fecha, [])
  if (items.length > 0) llevarAlSiguiente(estado, ctx, fecha, items)
  return resultado(estado, ids, ctx)
}
