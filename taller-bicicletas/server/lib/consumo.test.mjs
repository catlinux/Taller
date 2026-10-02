import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparConsumo,
  clavePeriodo,
  etiquetaPeriodo,
  semanaIso,
  resolverEstados,
  rangoDeFechas,
  parseFechaISO,
  ESTADOS_CONSUMO_POR_DEFECTO,
} from './consumo.js'

// Pruebas del cálculo de consumo de materiales por periodo.

// Construye una línea de material con valores por defecto razonables.
function linea(extra = {}) {
  return {
    articuloId: 1,
    referencia: 'REF-1',
    descripcion: 'Artículo 1',
    cantidad: 1,
    precioNeto: 10,
    fecha: new Date(2026, 9, 1),
    ordenId: 1,
    familia: null,
    proveedor: null,
    precioCompra: 5,
    ...extra,
  }
}

// Devuelve la fila cuyo referencia coincide.
function buscar(filas, referencia) {
  return filas.find((fila) => fila.referencia === referencia)
}

test('la clave y la etiqueta de periodo de día usan AAAA-MM-DD', () => {
  const fecha = new Date(2026, 9, 2)
  assert.equal(clavePeriodo(fecha, 'dia'), '2026-10-02')
  assert.equal(etiquetaPeriodo(fecha, 'dia'), '02/10/2026')
})

test('la clave y la etiqueta de periodo de mes en español', () => {
  const fecha = new Date(2026, 9, 15)
  assert.equal(clavePeriodo(fecha, 'mes'), '2026-10')
  assert.equal(etiquetaPeriodo(fecha, 'mes'), 'oct 2026')
})

test('la clave y la etiqueta de periodo de año', () => {
  const fecha = new Date(2026, 9, 15)
  assert.equal(clavePeriodo(fecha, 'anio'), '2026')
  assert.equal(etiquetaPeriodo(fecha, 'anio'), '2026')
})

test('la semana ISO empieza en lunes', () => {
  // El lunes 05/10/2026 abre la semana S41; el domingo anterior (04/10) es S40.
  assert.deepEqual(semanaIso(new Date(2026, 9, 5)), { anio: 2026, semana: 41 })
  assert.deepEqual(semanaIso(new Date(2026, 9, 4)), { anio: 2026, semana: 40 })
})

test('una semana que cruza de año usa el año ISO correcto', () => {
  // El lunes 30/12/2024 pertenece a la semana 1 de 2025.
  assert.deepEqual(semanaIso(new Date(2024, 11, 30)), { anio: 2025, semana: 1 })
  assert.equal(clavePeriodo(new Date(2024, 11, 30), 'semana'), '2025-S01')
  assert.equal(etiquetaPeriodo(new Date(2024, 11, 30), 'semana'), 'S1 · 30/12')
  // El viernes 03/01/2025 cae en la misma semana ISO (2025-S01).
  assert.equal(clavePeriodo(new Date(2025, 0, 3), 'semana'), '2025-S01')
  // El 01/01/2021 pertenece a la última semana ISO de 2020 (2020-S53).
  assert.equal(clavePeriodo(new Date(2021, 0, 1), 'semana'), '2020-S53')
})

test('por defecto se excluye el estado Presupuesto', () => {
  assert.deepEqual(resolverEstados(undefined), ESTADOS_CONSUMO_POR_DEFECTO)
  assert.ok(!resolverEstados(undefined).includes('Presupuesto'))
  assert.ok(!resolverEstados('').includes('Presupuesto'))
})

test('resolverEstados respeta una lista explícita y descarta valores no válidos', () => {
  assert.deepEqual(resolverEstados('Finalizada,Entregada'), ['Finalizada', 'Entregada'])
  assert.deepEqual(resolverEstados('Presupuesto,Basura'), ['Presupuesto'])
})

test('el rango de fechas es inclusivo en ambos extremos (fin del día)', () => {
  const { desde, hasta } = rangoDeFechas('2026-10-01', '2026-10-31')
  assert.equal(desde.getTime(), new Date(2026, 9, 1, 0, 0, 0, 0).getTime())
  assert.equal(hasta.getTime(), new Date(2026, 9, 31, 23, 59, 59, 999).getTime())
  assert.equal(parseFechaISO('2026-13-01'), null)
  assert.equal(parseFechaISO('nope'), null)
})

test('el rango es inclusivo: incluye el comienzo de desde y el final de hasta', () => {
  const lineas = [
    linea({ articuloId: 1, referencia: 'ANTES', cantidad: 1, fecha: new Date(2026, 8, 30) }),
    linea({ articuloId: 2, referencia: 'DESDE', cantidad: 2, fecha: new Date(2026, 9, 1, 0, 0, 0) }),
    linea({ articuloId: 3, referencia: 'HASTA', cantidad: 3, fecha: new Date(2026, 9, 31, 23, 59, 0) }),
    linea({ articuloId: 4, referencia: 'DESPUES', cantidad: 4, fecha: new Date(2026, 10, 1) }),
  ]
  const { filas } = agruparConsumo(lineas, { desde: '2026-10-01', hasta: '2026-10-31' })
  assert.deepEqual(filas.map((fila) => fila.referencia).sort(), ['DESDE', 'HASTA'])
})

test('suma cantidades, órdenes distintas e importes por artículo', () => {
  const lineas = [
    linea({ articuloId: 1, ordenId: 10, cantidad: 2, precioNeto: 20 }),
    linea({ articuloId: 1, ordenId: 10, cantidad: 3, precioNeto: 30 }),
    linea({ articuloId: 1, ordenId: 11, cantidad: 1, precioNeto: 10 }),
  ]
  const { filas } = agruparConsumo(lineas, {})
  assert.equal(filas.length, 1)
  assert.equal(filas[0].cantidad, 6)
  assert.equal(filas[0].ordenes, 2)
  assert.equal(filas[0].importe, 60)
})

test('el coste es la cantidad por el precio de compra actual (0 sin artículo)', () => {
  const lineas = [
    linea({ articuloId: 1, referencia: 'CON', cantidad: 4, precioCompra: 2.5 }),
    linea({ articuloId: null, referencia: 'LIBRE', descripcion: 'Sin artículo', cantidad: 3, precioCompra: undefined }),
  ]
  const { filas } = agruparConsumo(lineas, {})
  assert.equal(buscar(filas, 'CON').coste, 10)
  assert.equal(buscar(filas, 'LIBRE').coste, 0)
})

test('las líneas sin artículo se agrupan por referencia y descripción', () => {
  const lineas = [
    linea({ articuloId: null, referencia: 'X', descripcion: 'Pieza libre', cantidad: 2 }),
    linea({ articuloId: null, referencia: 'X', descripcion: 'Pieza libre', cantidad: 3 }),
    linea({ articuloId: null, referencia: 'X', descripcion: 'Otra cosa', cantidad: 5 }),
  ]
  const { filas } = agruparConsumo(lineas, {})
  assert.equal(filas.length, 2)
  const agrupada = filas.find((fila) => fila.descripcion === 'Pieza libre')
  assert.equal(agrupada.cantidad, 5)
  assert.equal(agrupada.articuloId, null)
})

test('calcula los totales: cantidad, órdenes distintas, artículos, importe y coste', () => {
  const lineas = [
    linea({ articuloId: 1, referencia: 'A', ordenId: 1, cantidad: 2, precioNeto: 20, precioCompra: 5 }),
    linea({ articuloId: 1, referencia: 'A', ordenId: 2, cantidad: 1, precioNeto: 10, precioCompra: 5 }),
    linea({ articuloId: 2, referencia: 'B', ordenId: 2, cantidad: 4, precioNeto: 40, precioCompra: 3 }),
  ]
  const { filas, totales } = agruparConsumo(lineas, {})
  assert.equal(filas.length, 2)
  assert.equal(totales.cantidad, 7)
  assert.equal(totales.ordenes, 2)
  assert.equal(totales.articulos, 2)
  assert.equal(totales.importe, 70)
  assert.equal(totales.coste, 2 * 5 + 1 * 5 + 4 * 3)
})

test('agrupa por mes y rellena porPeriodo y los totales por periodo', () => {
  const lineas = [
    linea({ articuloId: 1, referencia: 'A', cantidad: 2, fecha: new Date(2026, 9, 3) }),
    linea({ articuloId: 1, referencia: 'A', cantidad: 3, fecha: new Date(2026, 9, 20) }),
    linea({ articuloId: 1, referencia: 'A', cantidad: 5, fecha: new Date(2026, 10, 5) }),
  ]
  const { periodos, filas, totales } = agruparConsumo(lineas, { agrupar: 'mes' })
  assert.deepEqual(periodos.map((p) => p.clave), ['2026-10', '2026-11'])
  assert.deepEqual(periodos.map((p) => p.etiqueta), ['oct 2026', 'nov 2026'])
  assert.deepEqual(filas[0].porPeriodo, { '2026-10': 5, '2026-11': 5 })
  assert.deepEqual(totales.porPeriodo, { '2026-10': 5, '2026-11': 5 })
})

test('agrupa por semana y por día con sus claves', () => {
  const lineas = [
    linea({ articuloId: 1, referencia: 'A', cantidad: 1, fecha: new Date(2026, 9, 5) }),
    linea({ articuloId: 1, referencia: 'A', cantidad: 2, fecha: new Date(2026, 9, 6) }),
  ]
  const semana = agruparConsumo(lineas, { agrupar: 'semana' })
  assert.deepEqual(semana.periodos.map((p) => p.clave), ['2026-S41'])
  assert.equal(semana.periodos[0].etiqueta, 'S41 · 05/10')
  assert.deepEqual(semana.filas[0].porPeriodo, { '2026-S41': 3 })

  const dia = agruparConsumo(lineas, { agrupar: 'dia' })
  assert.deepEqual(dia.periodos.map((p) => p.clave), ['2026-10-05', '2026-10-06'])
  assert.deepEqual(dia.filas[0].porPeriodo, { '2026-10-05': 1, '2026-10-06': 2 })
})

test('sin agrupación no devuelve periodos ni porPeriodo', () => {
  const { periodos, filas, totales } = agruparConsumo([linea()], {})
  assert.deepEqual(periodos, [])
  assert.deepEqual(filas[0].porPeriodo, {})
  assert.deepEqual(totales.porPeriodo, {})
})

test('ordena las filas por cantidad descendente', () => {
  const lineas = [
    linea({ articuloId: 1, referencia: 'POCA', cantidad: 1 }),
    linea({ articuloId: 2, referencia: 'MUCHA', cantidad: 9 }),
  ]
  const { filas } = agruparConsumo(lineas, {})
  assert.deepEqual(filas.map((fila) => fila.referencia), ['MUCHA', 'POCA'])
})

