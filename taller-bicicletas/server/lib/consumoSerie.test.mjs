import test from 'node:test'
import assert from 'node:assert/strict'
import { serieConsumo, PERIODOS_POR_DEFECTO, AGRUPACIONES_SERIE } from './consumoSerie.js'

// Pruebas de la serie continua de consumo por periodo (gráfica de consumo).

// Construye una línea de material con valores por defecto razonables.
function linea(extra = {}) {
  return { cantidad: 1, precioNeto: 10, fecha: new Date(2026, 9, 1), ordenId: 1, ...extra }
}

// Claves de los puntos de una serie.
function claves(serie) {
  return serie.puntos.map((punto) => punto.clave)
}

test('las agrupaciones y los periodos por defecto son los esperados', () => {
  assert.deepEqual(AGRUPACIONES_SERIE, ['semana', 'mes', 'anio'])
  assert.deepEqual(PERIODOS_POR_DEFECTO, { semana: 12, mes: 12, anio: 5 })
})

test('lanza si la agrupación o el número de periodos no son válidos', () => {
  assert.throws(() => serieConsumo([], { agrupar: 'dia', periodos: 4 }))
  assert.throws(() => serieConsumo([], { agrupar: 'ninguno', periodos: 4 }))
  assert.throws(() => serieConsumo([], { agrupar: 'mes', periodos: 0 }))
  assert.throws(() => serieConsumo([], { agrupar: 'mes', periodos: 121 }))
  assert.throws(() => serieConsumo([], { agrupar: 'mes', periodos: 2.5 }))
  assert.throws(() => serieConsumo([], { agrupar: 'mes', periodos: '6' }))
})

test('serie mensual continua con ceros en los meses sin consumo', () => {
  const serie = serieConsumo(
    [
      linea({ cantidad: 5, precioNeto: 20, fecha: new Date(2026, 0, 20), ordenId: 1 }),
      linea({ cantidad: 3, precioNeto: 12, fecha: new Date(2026, 2, 5), ordenId: 2 }),
    ],
    { agrupar: 'mes', periodos: 4, hoy: new Date(2026, 2, 15) },
  )
  assert.equal(serie.agrupar, 'mes')
  assert.deepEqual(claves(serie), ['2025-12', '2026-01', '2026-02', '2026-03'])
  assert.deepEqual(serie.puntos.map((p) => p.cantidad), [0, 5, 0, 3])
  assert.deepEqual(serie.puntos.map((p) => p.importe), [0, 20, 0, 12])
  assert.equal(serie.desde, '2025-12-01')
  assert.equal(serie.hasta, '2026-03-31')
  assert.deepEqual(serie.totales, { cantidad: 8, importe: 32, ordenes: 2 })
})

test('las etiquetas de mes son legibles en español', () => {
  const serie = serieConsumo([], { agrupar: 'mes', periodos: 3, hoy: new Date(2026, 2, 15) })
  assert.deepEqual(serie.puntos.map((p) => p.etiqueta), ['ene 2026', 'feb 2026', 'mar 2026'])
})

test('la semana empieza en lunes y las semanas que cruzan el año usan el año ISO', () => {
  // El 6 de enero de 2021 (miércoles) está en la semana 1 de 2021; la anterior
  // (que empieza el 28/12/2020) es la semana 53 de 2020.
  const serie = serieConsumo([], { agrupar: 'semana', periodos: 2, hoy: new Date(2021, 0, 6) })
  assert.deepEqual(claves(serie), ['2020-S53', '2021-S01'])
  assert.equal(serie.desde, '2020-12-28')
  assert.equal(serie.hasta, '2021-01-10')
  assert.equal(serie.puntos[0].etiqueta, 'S53 · 28/12')
})

test('con la fecha de hoy en lunes o en domingo la semana es la misma', () => {
  const lunes = serieConsumo([], { agrupar: 'semana', periodos: 1, hoy: new Date(2026, 9, 5) })
  const domingo = serieConsumo([], { agrupar: 'semana', periodos: 1, hoy: new Date(2026, 9, 11) })
  assert.equal(lunes.puntos[0].clave, '2026-S41')
  assert.equal(domingo.puntos[0].clave, '2026-S41')
  assert.equal(lunes.puntos[0].desde, '2026-10-05')
  assert.equal(lunes.puntos[0].hasta, '2026-10-11')
  assert.deepEqual(domingo.puntos[0], lunes.puntos[0])
})

test('sin datos, todos los periodos quedan a cero', () => {
  const serie = serieConsumo([], { agrupar: 'mes', periodos: 5, hoy: new Date(2026, 9, 10) })
  assert.equal(serie.puntos.length, 5)
  assert.ok(serie.puntos.every((punto) => punto.cantidad === 0 && punto.importe === 0 && punto.ordenes === 0))
  assert.deepEqual(serie.totales, { cantidad: 0, importe: 0, ordenes: 0 })
})

test('las líneas fuera del rango se ignoran', () => {
  const serie = serieConsumo(
    [
      linea({ fecha: new Date(2020, 0, 1), cantidad: 100 }),
      linea({ fecha: new Date(2026, 9, 10), cantidad: 2, ordenId: 3 }),
    ],
    { agrupar: 'mes', periodos: 2, hoy: new Date(2026, 9, 15) },
  )
  assert.deepEqual(serie.puntos.map((p) => p.cantidad), [0, 2])
  assert.equal(serie.totales.cantidad, 2)
})

test('cuenta las órdenes distintas una sola vez', () => {
  const serie = serieConsumo(
    [
      linea({ fecha: new Date(2026, 8, 3), ordenId: 1 }),
      linea({ fecha: new Date(2026, 9, 4), ordenId: 7 }),
      linea({ fecha: new Date(2026, 9, 6), ordenId: 7 }),
      linea({ fecha: new Date(2026, 9, 20), ordenId: 8 }),
    ],
    { agrupar: 'mes', periodos: 2, hoy: new Date(2026, 9, 15) },
  )
  assert.equal(serie.puntos[0].ordenes, 1)
  assert.equal(serie.puntos[1].ordenes, 2)
  assert.equal(serie.totales.ordenes, 3)
  assert.equal(serie.totales.cantidad, 4)
})

test('las líneas de una misma orden cuentan una vez por periodo', () => {
  const serie = serieConsumo(
    [
      linea({ fecha: new Date(2026, 9, 3), ordenId: 5, cantidad: 2 }),
      linea({ fecha: new Date(2026, 9, 9), ordenId: 5, cantidad: 3 }),
    ],
    { agrupar: 'mes', periodos: 1, hoy: new Date(2026, 9, 15) },
  )
  assert.equal(serie.puntos[0].cantidad, 5)
  assert.equal(serie.puntos[0].ordenes, 1)
  assert.equal(serie.totales.ordenes, 1)
})

test('redondea cantidades e importes a 4 decimales', () => {
  const serie = serieConsumo(
    [
      linea({ fecha: new Date(2026, 9, 2), cantidad: 12.34567, precioNeto: 0.1 }),
      linea({ fecha: new Date(2026, 9, 3), cantidad: 0.33334, precioNeto: 0.2 }),
    ],
    { agrupar: 'mes', periodos: 1, hoy: new Date(2026, 9, 15) },
  )
  assert.equal(serie.puntos[0].cantidad, 12.679)
  assert.equal(serie.puntos[0].importe, 0.3)
  assert.equal(serie.totales.cantidad, 12.679)
  assert.equal(serie.totales.importe, 0.3)
})

test('serie por años naturales', () => {
  const serie = serieConsumo(
    [linea({ fecha: new Date(2025, 5, 1), cantidad: 4, precioNeto: 8, ordenId: 1 })],
    { agrupar: 'anio', periodos: 3, hoy: new Date(2026, 5, 10) },
  )
  assert.deepEqual(claves(serie), ['2024', '2025', '2026'])
  assert.deepEqual(serie.puntos.map((p) => p.cantidad), [0, 4, 0])
  assert.equal(serie.desde, '2024-01-01')
  assert.equal(serie.hasta, '2026-12-31')
  assert.deepEqual(serie.totales, { cantidad: 4, importe: 8, ordenes: 1 })
})

test('las fechas inválidas se ignoran sin romper la serie', () => {
  const serie = serieConsumo(
    [linea({ fecha: 'no-es-fecha' }), linea({ fecha: new Date(2026, 9, 10), cantidad: 2 })],
    { agrupar: 'mes', periodos: 1, hoy: new Date(2026, 9, 15) },
  )
  assert.equal(serie.puntos[0].cantidad, 2)
})
