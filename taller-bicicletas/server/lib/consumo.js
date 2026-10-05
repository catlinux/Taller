import { ESTADOS_ORDEN } from './estados.js'

// Cálculo del consumo de materiales/productos por periodo.
//
// El «consumo» de un artículo en un periodo es la suma de las cantidades de sus
// líneas de material (OrdenMaterial) pertenecientes a órdenes cuya fecha de
// entrada (OrdenReparacion.fechaEntrada) cae dentro del periodo.
//
// `agruparConsumo` es una función pura: recibe las líneas ya consultadas y los
// filtros de rango y agrupación, y devuelve las filas agregadas por artículo,
// los periodos presentes en los datos y los totales. La fecha se maneja en hora
// local (la semana empieza en lunes, como exige el estándar ISO 8601).

const MS_DIA = 24 * 60 * 60 * 1000

// Estados de orden válidos y estados incluidos en el consumo por defecto (todos).
export const ESTADOS_VALIDOS = ESTADOS_ORDEN
export const ESTADOS_CONSUMO_POR_DEFECTO = ESTADOS_VALIDOS

// Agrupaciones admitidas por el listado de consumo.
export const AGRUPACIONES = ['ninguno', 'dia', 'semana', 'mes', 'anio']

// Meses abreviados en español para las etiquetas de periodo.
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Convierte un valor en una fecha válida (Date o cadena ISO); null si no lo es.
export function aFecha(valor) {
  if (valor instanceof Date) return Number.isFinite(valor.getTime()) ? valor : null
  if (valor === null || valor === undefined || valor === '') return null
  const fecha = new Date(valor)
  return Number.isFinite(fecha.getTime()) ? fecha : null
}

// Convierte un valor en número finito; 0 si no lo es.
export function aNumero(valor) {
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : 0
}

// Redondeo exacto a 4 decimales (mismo criterio que server/lib/precios.js).
export function redondear4(valor) {
  const escalado = Number(`${Number(Number(valor).toFixed(8))}e4`)
  return (Number.isFinite(escalado) ? Math.round(escalado) : Math.round(Number(valor) * 10000)) / 10000
}

// Redondea a 4 decimales todos los valores de un objeto { clave: número }.
function redondearMapa(mapa) {
  const resultado = {}
  for (const clave of Object.keys(mapa)) resultado[clave] = redondear4(mapa[clave])
  return resultado
}
// Analiza 'AAAA-MM-DD' como fecha local a medianoche; null si no encaja.
export function parseFechaISO(texto) {
  const coincide = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto ?? '').trim())
  if (!coincide) return null
  const [, anio, mes, dia] = coincide
  const fecha = new Date(Number(anio), Number(mes) - 1, Number(dia))
  // Rechaza fechas desbordadas (p. ej. mes 13 o día 32) comprobando que los
  // componentes coinciden con los del texto original.
  if (fecha.getFullYear() !== Number(anio) || fecha.getMonth() !== Number(mes) - 1 || fecha.getDate() !== Number(dia)) {
    return null
  }
  return fecha
}

// Inicio del día (00:00:00.000) de una fecha.
export function inicioDeDia(fecha) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 0, 0, 0, 0)
}

// Final del día (23:59:59.999) de una fecha.
export function finDeDia(fecha) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 23, 59, 59, 999)
}

// Límites del rango a partir de los textos 'AAAA-MM-DD' (o vacíos): el inicio es
// el comienzo del día de `desde` y el fin, el final del día de `hasta`.
export function rangoDeFechas(desde, hasta) {
  const inicio = parseFechaISO(desde)
  const fin = parseFechaISO(hasta)
  return {
    desde: inicio === null ? null : inicioDeDia(inicio),
    hasta: fin === null ? null : finDeDia(fin),
  }
}

// Día de la semana ISO (1 = lunes … 7 = domingo).
function diaIso(fecha) {
  const dia = fecha.getDay()
  return dia === 0 ? 7 : dia
}

// Lunes de la semana ISO a la que pertenece la fecha.
export function lunesDeSemana(fecha) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() - (diaIso(fecha) - 1))
}

// Número de semana ISO 8601 y su año (el año es el del jueves de esa semana).
export function semanaIso(fecha) {
  const jueves = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + (4 - diaIso(fecha)))
  const inicioAnio = new Date(jueves.getFullYear(), 0, 1)
  const semana = Math.ceil((((jueves - inicioAnio) / MS_DIA) + 1) / 7)
  return { anio: jueves.getFullYear(), semana }
}

// Clave de periodo de una fecha según la agrupación
// ('dia'|'semana'|'mes'|'trimestre'|'anio'). El trimestre es natural (T1 ene-mar…).
export function clavePeriodo(fecha, agrupar) {
  if (agrupar === 'dia') return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`
  if (agrupar === 'semana') {
    const { anio, semana } = semanaIso(fecha)
    return `${anio}-S${dosDigitos(semana)}`
  }
  if (agrupar === 'mes') return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}`
  if (agrupar === 'trimestre') return `${fecha.getFullYear()}-T${Math.floor(fecha.getMonth() / 3) + 1}`
  if (agrupar === 'anio') return String(fecha.getFullYear())
  return null
}

// Etiqueta legible de un periodo de una fecha según la agrupación.
export function etiquetaPeriodo(fecha, agrupar) {
  if (agrupar === 'dia') return `${dosDigitos(fecha.getDate())}/${dosDigitos(fecha.getMonth() + 1)}/${fecha.getFullYear()}`
  if (agrupar === 'semana') {
    const lunes = lunesDeSemana(fecha)
    const { semana } = semanaIso(fecha)
    return `S${semana} · ${dosDigitos(lunes.getDate())}/${dosDigitos(lunes.getMonth() + 1)}`
  }
  if (agrupar === 'mes') return `${MESES_CORTOS[fecha.getMonth()]} ${fecha.getFullYear()}`
  if (agrupar === 'trimestre') return `T${Math.floor(fecha.getMonth() / 3) + 1} ${fecha.getFullYear()}`
  if (agrupar === 'anio') return String(fecha.getFullYear())
  return null
}

// Resuelve la lista de estados a incluir: si no se indica nada (o solo hay
// valores vacíos) se usan todos; si se indica una lista, solo se conservan los
// estados válidos.
export function resolverEstados(valor) {
  if (valor === undefined || valor === null) return [...ESTADOS_CONSUMO_POR_DEFECTO]
  const texto = Array.isArray(valor) ? valor.join(',') : String(valor)
  const lista = texto.split(',').map((estado) => estado.trim()).filter(Boolean)
  if (lista.length === 0) return [...ESTADOS_CONSUMO_POR_DEFECTO]
  return lista.filter((estado) => ESTADOS_VALIDOS.includes(estado))
}


// Dos dígitos con cero a la izquierda.
function dosDigitos(valor) {
  return String(valor).padStart(2, '0')
}

// Clave interna para agrupar líneas: por artículo si lo hay, o por la pareja
// referencia+descripción de la línea cuando el artículo falta o se ha borrado.
function claveDeArticulo(linea) {
  if (linea.articuloId !== null && linea.articuloId !== undefined) return `a:${linea.articuloId}`
  return `l:${JSON.stringify([String(linea.referencia ?? ''), String(linea.descripcion ?? '')])}`
}

// Agrupa las líneas de material y devuelve { periodos, filas, totales }.
//   - lineas: { articuloId|null, referencia, descripcion, cantidad, precioNeto,
//               fecha (Date), ordenId, familia, proveedor, precioCompra }
//   - opciones: { desde, hasta, agrupar } (desde/hasta como 'AAAA-MM-DD' o Date)
export function agruparConsumo(lineas = [], opciones = {}) {
  const agrupar = AGRUPACIONES.includes(opciones.agrupar) ? opciones.agrupar : 'ninguno'
  const { desde, hasta } = rangoDeFechas(opciones.desde, opciones.hasta)

  const mapa = new Map()
  const periodosMapa = new Map()
  const ordenesGlobal = new Set()
  const porPeriodoTotal = {}
  let cantidadTotal = 0
  let importeTotal = 0
  let costeTotal = 0

  for (const linea of lineas ?? []) {
    const fecha = aFecha(linea?.fecha)
    if (fecha === null) continue
    if (desde !== null && fecha < desde) continue
    if (hasta !== null && fecha > hasta) continue

    const cantidad = aNumero(linea.cantidad)
    const precioNeto = aNumero(linea.precioNeto)
    const coste = aNumero(linea.precioCompra) * cantidad
    const ordenId = linea.ordenId ?? null

    const clave = claveDeArticulo(linea)
    let fila = mapa.get(clave)
    if (!fila) {
      fila = {
        articuloId: linea.articuloId ?? null,
        referencia: linea.referencia ?? '',
        descripcion: linea.descripcion ?? '',
        familia: linea.familia ?? null,
        proveedor: linea.proveedor ?? null,
        cantidad: 0,
        ordenes: new Set(),
        importe: 0,
        coste: 0,
        porPeriodo: {},
      }
      mapa.set(clave, fila)
    }

    fila.cantidad += cantidad
    fila.importe += precioNeto
    fila.coste += coste
    if (ordenId !== null) fila.ordenes.add(ordenId)

    if (agrupar !== 'ninguno') {
      const clavePeriodoLinea = clavePeriodo(fecha, agrupar)
      fila.porPeriodo[clavePeriodoLinea] = (fila.porPeriodo[clavePeriodoLinea] ?? 0) + cantidad
      porPeriodoTotal[clavePeriodoLinea] = (porPeriodoTotal[clavePeriodoLinea] ?? 0) + cantidad
      if (!periodosMapa.has(clavePeriodoLinea)) {
        periodosMapa.set(clavePeriodoLinea, etiquetaPeriodo(fecha, agrupar))
      }
    }

    cantidadTotal += cantidad
    importeTotal += precioNeto
    costeTotal += coste
    if (ordenId !== null) ordenesGlobal.add(ordenId)
  }

  const periodos = [...periodosMapa.entries()]
    .map(([clave, etiqueta]) => ({ clave, etiqueta }))
    .sort((a, b) => a.clave.localeCompare(b.clave))

  const filas = [...mapa.values()].map((fila) => ({
    articuloId: fila.articuloId,
    referencia: fila.referencia,
    descripcion: fila.descripcion,
    familia: fila.familia,
    proveedor: fila.proveedor,
    cantidad: redondear4(fila.cantidad),
    ordenes: fila.ordenes.size,
    importe: redondear4(fila.importe),
    coste: redondear4(fila.coste),
    porPeriodo: redondearMapa(fila.porPeriodo),
  }))

  // Por defecto, mayor cantidad primero y, a igualdad, por referencia.
  filas.sort((a, b) => {
    if (b.cantidad !== a.cantidad) return b.cantidad - a.cantidad
    return String(a.referencia).localeCompare(String(b.referencia), 'es', { numeric: true, sensitivity: 'base' })
  })

  const totales = {
    cantidad: redondear4(cantidadTotal),
    ordenes: ordenesGlobal.size,
    articulos: filas.length,
    importe: redondear4(importeTotal),
    coste: redondear4(costeTotal),
    porPeriodo: redondearMapa(porPeriodoTotal),
  }

  return { periodos, filas, totales }
}

