// Utilidades puras de la AGENDA de planificación semanal: unión de las horas de
// franja de varios días, etiqueta de la semana, validación de tramos en el
// cliente (mismas reglas que el servidor), estado de ocupación y agrupación del
// catálogo de operaciones por categoría. Módulo puro, con pruebas en
// agenda.test.mjs. No depende de React ni del servidor.
import { coincideTexto } from './texto.js'

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Convierte «HH:MM» a minutos desde medianoche (0-1440) o null si no es válido:
// horas 00-24 (24:00 solo con minutos 0) y minutos múltiplos de 15.
export function minutosDeHora(texto) {
  if (typeof texto !== 'string') return null
  const coincidencia = /^(\d{2}):(\d{2})$/.exec(texto.trim())
  if (!coincidencia) return null
  const horas = Number(coincidencia[1])
  const minutos = Number(coincidencia[2])
  if (horas > 24 || minutos > 59) return null
  if (horas === 24 && minutos !== 0) return null
  if (minutos % 15 !== 0) return null
  return horas * 60 + minutos
}

// Formatea minutos desde medianoche como «HH:MM» (1440 -> «24:00»).
export function horaDeMinutos(minutos) {
  const horas = Math.floor(minutos / 60)
  const min = minutos % 60
  return `${String(horas).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

// Descompone «AAAA-MM-DD» en { anio, mes (1-12), dia } o null si no es válida.
function partesFecha(fecha) {
  if (typeof fecha !== 'string') return null
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim())
  if (!coincidencia) return null
  const anio = Number(coincidencia[1])
  const mes = Number(coincidencia[2])
  const dia = Number(coincidencia[3])
  const comprobacion = new Date(anio, mes - 1, dia)
  if (comprobacion.getFullYear() !== anio || comprobacion.getMonth() !== mes - 1 || comprobacion.getDate() !== dia) return null
  return { anio, mes, dia }
}

// Número de semana ISO 8601 de una fecha «AAAA-MM-DD»; null si no es válida.
function numeroSemanaISO(fecha) {
  const partes = partesFecha(fecha)
  if (!partes) return null
  const dia = new Date(Date.UTC(partes.anio, partes.mes - 1, partes.dia))
  const diaSemana = dia.getUTCDay() || 7
  dia.setUTCDate(dia.getUTCDate() + 4 - diaSemana)
  const inicioAnio = Date.UTC(dia.getUTCFullYear(), 0, 1)
  return Math.ceil(((dia - inicioAnio) / 86400000 + 1) / 7)
}

// Unión ordenada de las horas de franja de varios días de la semana (cada día
// puede tener un horario distinto). Devuelve un array de «HH:MM» sin repetir,
// ordenado por hora. Recibe los días tal y como los devuelve GET /semana.
export function horasUnion(dias) {
  const minutos = new Set()
  for (const dia of Array.isArray(dias) ? dias : []) {
    for (const franja of dia?.franjas ?? []) {
      const valor = minutosDeHora(franja?.hora)
      if (valor !== null) minutos.add(valor)
    }
  }
  return [...minutos].sort((a, b) => a - b).map(horaDeMinutos)
}

// Etiqueta de la semana, p. ej. «Semana 41 · 5 – 9 oct 2026». Cuando la semana
// cruza de mes (o de año) se muestran los dos meses y, si cambia el año, los dos
// años. Devuelve '' si las fechas no son válidas.
export function etiquetaSemana(lunes, viernes) {
  const inicio = partesFecha(lunes)
  const fin = partesFecha(viernes)
  if (!inicio || !fin) return ''
  const semana = numeroSemanaISO(lunes)
  const prefijo = semana ? `Semana ${semana} · ` : ''
  if (inicio.anio === fin.anio && inicio.mes === fin.mes) {
    return `${prefijo}${inicio.dia} – ${fin.dia} ${MESES_CORTOS[inicio.mes - 1]} ${inicio.anio}`
  }
  if (inicio.anio === fin.anio) {
    return `${prefijo}${inicio.dia} ${MESES_CORTOS[inicio.mes - 1]} – ${fin.dia} ${MESES_CORTOS[fin.mes - 1]} ${inicio.anio}`
  }
  return `${prefijo}${inicio.dia} ${MESES_CORTOS[inicio.mes - 1]} ${inicio.anio} – ${fin.dia} ${MESES_CORTOS[fin.mes - 1]} ${fin.anio}`
}

// Valida y normaliza los tramos del horario en el cliente (mismas reglas que el
// servidor): array de 1 a 4 tramos «HH:MM» en cuartos de hora, sin solapes.
// Devuelve { tramos } ordenados por inicio o { error }.
export function validarTramosCliente(tramos) {
  if (!Array.isArray(tramos) || tramos.length < 1 || tramos.length > 4) {
    return { error: 'El horario debe tener entre 1 y 4 tramos' }
  }
  const normalizados = []
  for (const tramo of tramos) {
    if (!tramo || typeof tramo !== 'object') {
      return { error: 'Cada tramo debe indicar su hora de inicio y de fin' }
    }
    const inicio = minutosDeHora(tramo.inicio)
    const fin = minutosDeHora(tramo.fin)
    if (inicio === null || fin === null) {
      return { error: 'Las horas deben ser «HH:MM» en múltiplos de 15 minutos, entre 00:00 y 24:00' }
    }
    if (inicio >= fin) {
      return { error: 'El inicio de cada tramo debe ser anterior a su fin' }
    }
    normalizados.push({ inicio, fin })
  }
  normalizados.sort((a, b) => a.inicio - b.inicio)
  for (let i = 1; i < normalizados.length; i++) {
    if (normalizados[i].inicio < normalizados[i - 1].fin) {
      return { error: 'Los tramos del horario no pueden solaparse' }
    }
  }
  return { tramos: normalizados.map(({ inicio, fin }) => ({ inicio: horaDeMinutos(inicio), fin: horaDeMinutos(fin) })) }
}

// Total de minutos cubiertos por los tramos del horario.
export function minutosTramos(tramos) {
  let total = 0
  for (const tramo of Array.isArray(tramos) ? tramos : []) {
    const inicio = minutosDeHora(tramo?.inicio)
    const fin = minutosDeHora(tramo?.fin)
    if (inicio !== null && fin !== null && fin > inicio) total += fin - inicio
  }
  return total
}

// Estado de ocupación de un día respecto a sus horas máximas: 'excedido' si lo
// supera, 'casi' si pasa del 85 % del máximo y 'normal' en el resto.
export function estadoOcupacion(ocupadoMin, maximoMin) {
  const ocupado = Number(ocupadoMin) || 0
  const maximo = Number(maximoMin) || 0
  if (ocupado > maximo) return 'excedido'
  if (maximo > 0 && ocupado > maximo * 0.85) return 'casi'
  return 'normal'
}

// Agrupa el catálogo de operaciones por categoría y aplica el filtro de búsqueda
// (descripción, código o categoría, sin distinguir mayúsculas ni tildes). Las
// operaciones sin categoría van al final bajo «Otros». Devuelve un array de
// { categoria, operaciones }.
export function agruparCatalogo(operaciones, consulta = '') {
  const lista = Array.isArray(operaciones) ? operaciones : []
  const filtradas = lista.filter((op) => coincideTexto([op.descripcion, op.codigo, op.categoria], consulta))
  const grupos = new Map()
  for (const op of filtradas) {
    const categoria = String(op.categoria ?? '').trim() || 'Otros'
    if (!grupos.has(categoria)) grupos.set(categoria, [])
    grupos.get(categoria).push(op)
  }
  const nombres = [...grupos.keys()]
    .filter((nombre) => nombre !== 'Otros')
    .sort((a, b) => a.localeCompare(b, 'es'))
  if (grupos.has('Otros')) nombres.push('Otros')
  return nombres.map((categoria) => ({ categoria, operaciones: grupos.get(categoria) }))
}
