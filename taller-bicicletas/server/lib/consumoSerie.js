import {
  clavePeriodo,
  etiquetaPeriodo,
  lunesDeSemana,
  aFecha,
  aNumero,
  redondear4,
} from './consumo.js'

// Cálculo de la serie continua de consumo de un artículo por periodo, para la
// gráfica de «Artículos > Consumo». Reutiliza los helpers de consumo.js (semana
// ISO que empieza en lunes, meses y años naturales, todo en hora local).

// Agrupaciones admitidas por la serie (no hay desglose por día ni «sin desglose»).
export const AGRUPACIONES_SERIE = ['semana', 'mes', 'trimestre', 'anio']

// Número de periodos por defecto de la serie según la agrupación.
export const PERIODOS_POR_DEFECTO = { semana: 12, mes: 12, trimestre: 8, anio: 5 }

// Dos dígitos con cero a la izquierda.
function dosDigitos(valor) {
  return String(valor).padStart(2, '0')
}

// Formatea una fecha local como 'AAAA-MM-DD'.
function aIso(fecha) {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`
}

// Primer día del periodo (lunes de la semana, día 1 del mes, primer día del
// trimestre natural, 1 de enero).
function inicioDePeriodo(fecha, agrupar) {
  if (agrupar === 'semana') return lunesDeSemana(fecha)
  if (agrupar === 'mes') return new Date(fecha.getFullYear(), fecha.getMonth(), 1)
  if (agrupar === 'trimestre') return new Date(fecha.getFullYear(), Math.floor(fecha.getMonth() / 3) * 3, 1)
  return new Date(fecha.getFullYear(), 0, 1)
}

// Último día del periodo (domingo de la semana, último día del mes, último día
// del trimestre, 31 de diciembre).
function finDePeriodo(inicio, agrupar) {
  if (agrupar === 'semana') return new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 6)
  if (agrupar === 'mes') return new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0)
  if (agrupar === 'trimestre') return new Date(inicio.getFullYear(), inicio.getMonth() + 3, 0)
  return new Date(inicio.getFullYear(), 11, 31)
}

// Inicio del periodo inmediatamente anterior a uno dado.
function inicioAnterior(inicio, agrupar) {
  if (agrupar === 'semana') return new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() - 7)
  if (agrupar === 'mes') return new Date(inicio.getFullYear(), inicio.getMonth() - 1, 1)
  if (agrupar === 'trimestre') return new Date(inicio.getFullYear(), inicio.getMonth() - 3, 1)
  return new Date(inicio.getFullYear() - 1, 0, 1)
}

// Serie continua de los últimos `periodos` periodos que terminan en el periodo de
// `hoy` (incluido), con ceros en los periodos sin consumo.
//   - lineas: { cantidad, precioNeto, fecha (Date o ISO), ordenId, referencia? }
//   - opciones: { agrupar: 'semana'|'mes'|'trimestre'|'anio', periodos: entero 1-120, hoy }
// Devuelve { agrupar, desde, hasta, puntos, totales } con las fechas en 'AAAA-MM-DD'.
// Cada punto y el total incluyen `articulos` = número de referencias distintas
// con consumo (0 si las líneas no traen `referencia`).
export function serieConsumo(lineas = [], opciones = {}) {
  const agrupar = opciones.agrupar
  if (!AGRUPACIONES_SERIE.includes(agrupar)) {
    throw new Error('agrupar debe ser uno de: semana, mes, trimestre, anio')
  }
  const periodos = opciones.periodos
  if (!Number.isInteger(periodos) || periodos < 1 || periodos > 120) {
    throw new Error('periodos debe ser un entero entre 1 y 120')
  }
  const hoy = aFecha(opciones.hoy) ?? new Date()

  // Inicios de los periodos, del más antiguo al más reciente.
  const inicios = []
  let cursor = inicioDePeriodo(hoy, agrupar)
  for (let i = 0; i < periodos; i += 1) {
    inicios.push(cursor)
    cursor = inicioAnterior(cursor, agrupar)
  }
  inicios.reverse()

  // Cada punto arranca a cero; el índice por clave permite encontrar su periodo.
  const porClave = new Map()
  const puntos = inicios.map((inicio) => {
    const punto = {
      clave: clavePeriodo(inicio, agrupar),
      etiqueta: etiquetaPeriodo(inicio, agrupar),
      desde: aIso(inicio),
      hasta: aIso(finDePeriodo(inicio, agrupar)),
      cantidad: 0,
      importe: 0,
      ordenes: 0,
      articulos: 0,
    }
    porClave.set(punto.clave, { punto, ordenes: new Set(), referencias: new Set() })
    return punto
  })

  const ordenesGlobal = new Set()
  const referenciasGlobal = new Set()
  let cantidadTotal = 0
  let importeTotal = 0

  for (const linea of lineas ?? []) {
    const fecha = aFecha(linea?.fecha)
    if (fecha === null) continue

    const entrada = porClave.get(clavePeriodo(fecha, agrupar))
    if (!entrada) continue

    const cantidad = aNumero(linea.cantidad)
    const importe = aNumero(linea.precioNeto)
    entrada.punto.cantidad += cantidad
    entrada.punto.importe += importe
    if (linea.ordenId !== null && linea.ordenId !== undefined) {
      entrada.ordenes.add(linea.ordenId)
      ordenesGlobal.add(linea.ordenId)
    }
    // Solo cuenta artículos distintos si la línea trae referencia (modo «todos»).
    if (linea.referencia !== null && linea.referencia !== undefined && linea.referencia !== '') {
      const referencia = String(linea.referencia)
      entrada.referencias.add(referencia)
      referenciasGlobal.add(referencia)
    }
    cantidadTotal += cantidad
    importeTotal += importe
  }

  for (const { punto, ordenes, referencias } of porClave.values()) {
    punto.cantidad = redondear4(punto.cantidad)
    punto.importe = redondear4(punto.importe)
    punto.ordenes = ordenes.size
    punto.articulos = referencias.size
  }

  return {
    agrupar,
    desde: puntos[0].desde,
    hasta: puntos[puntos.length - 1].hasta,
    puntos,
    totales: {
      cantidad: redondear4(cantidadTotal),
      importe: redondear4(importeTotal),
      ordenes: ordenesGlobal.size,
      articulos: referenciasGlobal.size,
    },
  }
}
