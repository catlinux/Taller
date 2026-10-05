import test from 'node:test'
import assert from 'node:assert/strict'
import { rankingConsumo, AGRUPACIONES_RANKING, METRICAS_RANKING } from './consumoRanking.js'

// Pruebas del ranking de consumo por producto (gráfica comparativa de consumo).

// Construye una línea de material con valores por defecto razonables.
function linea(extra = {}) {
  return {
    referencia: 'A',
    descripcion: 'Producto A',
    familia: 'F1',
    cantidad: 1,
    precioNeto: 1,
    fecha: new Date(2026, 9, 10),
    ordenId: 1,
    ...extra,
  }
}

// Referencias de los ítems del ranking, en su orden.
function refs(ranking) {
  return ranking.items.map((item) => item.referencia)
}

const HOY = new Date(2026, 9, 15)

test('las agrupaciones y las métricas admitidas son las esperadas', () => {
  assert.deepEqual(AGRUPACIONES_RANKING, ['semana', 'mes', 'trimestre', 'anio'])
  assert.deepEqual(METRICAS_RANKING, ['unidades', 'importe', 'ordenes'])
})

test('las tres métricas ordenan distinto el mismo conjunto', () => {
  const base = { agrupar: 'mes', fecha: '2026-10-15', limite: 10, hoy: HOY }
  const lineas = [
    linea({ referencia: 'A', cantidad: 10, precioNeto: 1, ordenId: 1, fecha: new Date(2026, 9, 10) }),
    linea({ referencia: 'B', cantidad: 2, precioNeto: 50, ordenId: 2, fecha: new Date(2026, 9, 11) }),
    linea({ referencia: 'C', cantidad: 1, precioNeto: 1, ordenId: 3, fecha: new Date(2026, 9, 12) }),
    linea({ referencia: 'C', cantidad: 1, precioNeto: 1, ordenId: 4, fecha: new Date(2026, 9, 13) }),
    linea({ referencia: 'C', cantidad: 1, precioNeto: 1, ordenId: 5, fecha: new Date(2026, 9, 14) }),
  ]
  // Unidades: A(10) > C(3) > B(2).
  assert.deepEqual(refs(rankingConsumo(lineas, { ...base, metrica: 'unidades' })), ['A', 'C', 'B'])
  // Importe: B(50) > C(3) > A(1).
  assert.deepEqual(refs(rankingConsumo(lineas, { ...base, metrica: 'importe' })), ['B', 'C', 'A'])
  // Órdenes: C(3) y, a igualdad de 1, A por tener más cantidad que B.
  assert.deepEqual(refs(rankingConsumo(lineas, { ...base, metrica: 'ordenes' })), ['C', 'A', 'B'])
})

test('el límite recorta la lista pero los totales cuentan todo el periodo', () => {
  const lineas = [
    linea({ referencia: 'A', cantidad: 5, precioNeto: 5, ordenId: 1 }),
    linea({ referencia: 'B', cantidad: 4, precioNeto: 4, ordenId: 2 }),
    linea({ referencia: 'C', cantidad: 3, precioNeto: 3, ordenId: 3 }),
  ]
  const ranking = rankingConsumo(lineas, { agrupar: 'mes', fecha: '2026-10-15', metrica: 'unidades', limite: 2, hoy: HOY })
  assert.equal(ranking.items.length, 2)
  assert.deepEqual(refs(ranking), ['A', 'B'])
  assert.equal(ranking.totalArticulos, 3)
  assert.equal(ranking.valorTotal, 12)
  assert.deepEqual(ranking.totales, { cantidad: 12, importe: 12, ordenes: 3, articulos: 3 })
})

test('el límite por defecto es 10', () => {
  const muchas = []
  for (let i = 0; i < 12; i += 1) {
    muchas.push(linea({ referencia: `P${String(i).padStart(2, '0')}`, cantidad: i + 1, ordenId: i + 1 }))
  }
  const ranking = rankingConsumo(muchas, { agrupar: 'mes', fecha: '2026-10-15', metrica: 'unidades', hoy: HOY })
  assert.equal(ranking.limite, 10)
  assert.equal(ranking.items.length, 10)
  assert.equal(ranking.totalArticulos, 12)
})

test('un periodo vacío devuelve una lista vacía y totales a cero', () => {
  const ranking = rankingConsumo([], { agrupar: 'mes', fecha: '2026-10-15', metrica: 'unidades', limite: 10, hoy: HOY })
  assert.deepEqual(ranking.items, [])
  assert.deepEqual(ranking.totales, { cantidad: 0, importe: 0, ordenes: 0, articulos: 0 })
  assert.equal(ranking.totalArticulos, 0)
  assert.equal(ranking.valorTotal, 0)
})

test('la variación compara con el periodo anterior (sube, baja o sin dato)', () => {
  const lineas = [
    linea({ referencia: 'A', cantidad: 2, ordenId: 1, fecha: new Date(2026, 8, 10) }), // septiembre
    linea({ referencia: 'A', cantidad: 3, ordenId: 2, fecha: new Date(2026, 9, 10) }), // octubre
    linea({ referencia: 'B', cantidad: 4, ordenId: 3, fecha: new Date(2026, 8, 12) }),
    linea({ referencia: 'B', cantidad: 2, ordenId: 4, fecha: new Date(2026, 9, 12) }),
    linea({ referencia: 'C', cantidad: 1, ordenId: 5, fecha: new Date(2026, 9, 13) }),
  ]
  const ranking = rankingConsumo(lineas, { agrupar: 'mes', fecha: '2026-10-15', metrica: 'unidades', limite: 10, hoy: HOY })
  const porRef = Object.fromEntries(ranking.items.map((item) => [item.referencia, item]))
  assert.equal(porRef.A.valor, 3)
  assert.equal(porRef.A.anterior, 2)
  assert.equal(porRef.A.variacion, 50)
  assert.equal(porRef.B.valor, 2)
  assert.equal(porRef.B.anterior, 4)
  assert.equal(porRef.B.variacion, -50)
  assert.equal(porRef.C.valor, 1)
  assert.equal(porRef.C.anterior, 0)
  assert.equal(porRef.C.variacion, null)
})

test('las órdenes distintas se cuentan una sola vez por artículo', () => {
  const lineas = [
    linea({ referencia: 'A', cantidad: 1, ordenId: 7, fecha: new Date(2026, 9, 10) }),
    linea({ referencia: 'A', cantidad: 1, ordenId: 7, fecha: new Date(2026, 9, 11) }),
    linea({ referencia: 'A', cantidad: 1, ordenId: 8, fecha: new Date(2026, 9, 12) }),
  ]
  const ranking = rankingConsumo(lineas, { agrupar: 'mes', fecha: '2026-10-15', metrica: 'ordenes', limite: 10, hoy: HOY })
  assert.equal(ranking.items[0].ordenes, 2)
  assert.equal(ranking.items[0].valor, 2)
  assert.equal(ranking.totales.ordenes, 2)
})

test('meses, trimestres, semanas y años: límites, navegación y etiqueta', () => {
  // Mes que cruza el año hacia atrás (enero -> periodo anterior en diciembre).
  const meses = rankingConsumo([], { agrupar: 'mes', fecha: '2026-01-15', metrica: 'unidades', limite: 10, hoy: new Date(2026, 0, 20) })
  assert.equal(meses.etiqueta, 'enero 2026')
  assert.equal(meses.desde, '2026-01-01')
  assert.equal(meses.hasta, '2026-01-31')
  assert.equal(meses.anteriorDesde, '2025-12-01')
  assert.equal(meses.anteriorHasta, '2025-12-31')
  assert.equal(meses.fechaAnterior, '2025-12-01')
  assert.equal(meses.fechaSiguiente, '2026-02-01')

  // Trimestre natural.
  const trimestres = rankingConsumo([], { agrupar: 'trimestre', fecha: '2026-01-15', metrica: 'unidades', limite: 10, hoy: new Date(2026, 0, 20) })
  assert.equal(trimestres.etiqueta, 'T1 2026')
  assert.equal(trimestres.desde, '2026-01-01')
  assert.equal(trimestres.hasta, '2026-03-31')
  assert.equal(trimestres.anteriorDesde, '2025-10-01')
  assert.equal(trimestres.anteriorHasta, '2025-12-31')

  // Semana ISO que cruza el año: el 6/1/2021 (miércoles) es la semana 1 y la
  // anterior empieza el lunes 28/12/2020.
  const semanas = rankingConsumo([], { agrupar: 'semana', fecha: '2021-01-06', metrica: 'unidades', limite: 10, hoy: new Date(2021, 0, 8) })
  assert.equal(semanas.etiqueta, 'Semana 1 · 04/01 – 10/01/2021')
  assert.equal(semanas.desde, '2021-01-04')
  assert.equal(semanas.hasta, '2021-01-10')
  assert.equal(semanas.anteriorDesde, '2020-12-28')
  assert.equal(semanas.anteriorHasta, '2021-01-03')
  assert.equal(semanas.fechaAnterior, '2020-12-28')
  assert.equal(semanas.fechaSiguiente, '2021-01-11')

  // Año natural.
  const anios = rankingConsumo([], { agrupar: 'anio', fecha: '2026-06-15', metrica: 'unidades', limite: 10, hoy: new Date(2026, 5, 20) })
  assert.equal(anios.etiqueta, '2026')
  assert.equal(anios.desde, '2026-01-01')
  assert.equal(anios.hasta, '2026-12-31')
  assert.equal(anios.anteriorDesde, '2025-01-01')
  assert.equal(anios.fechaSiguiente, '2027-01-01')
})

test('esActual indica si el periodo mostrado es el de hoy', () => {
  // El periodo mostrado contiene a hoy (mismo mes).
  assert.equal(rankingConsumo([], { agrupar: 'mes', fecha: '2026-10-05', metrica: 'unidades', limite: 10, hoy: HOY }).esActual, true)
  // Sin fecha, se usa el periodo de hoy.
  assert.equal(rankingConsumo([], { agrupar: 'mes', metrica: 'unidades', limite: 10, hoy: HOY }).esActual, true)
  // Un periodo pasado no es el actual.
  assert.equal(rankingConsumo([], { agrupar: 'mes', fecha: '2026-09-05', metrica: 'unidades', limite: 10, hoy: HOY }).esActual, false)
})

test('a igualdad de métrica se ordena por cantidad y luego por referencia', () => {
  const lineas = [
    linea({ referencia: 'C', cantidad: 5, ordenId: 1 }),
    linea({ referencia: 'A', cantidad: 2, ordenId: 2 }),
    linea({ referencia: 'B', cantidad: 2, ordenId: 3 }),
  ]
  const ranking = rankingConsumo(lineas, { agrupar: 'mes', fecha: '2026-10-15', metrica: 'ordenes', limite: 10, hoy: HOY })
  // Todos con 1 orden: primero por cantidad desc (C), luego por referencia asc (A, B).
  assert.deepEqual(refs(ranking), ['C', 'A', 'B'])
})

test('usa la descripción y la familia de la línea más reciente y redondea a 4 decimales', () => {
  const lineas = [
    linea({ referencia: 'A', descripcion: 'Vieja', familia: 'F1', cantidad: 1.23456, precioNeto: 0.333333, ordenId: 1, fecha: new Date(2026, 9, 1) }),
    linea({ referencia: 'A', descripcion: 'Nueva', familia: 'F2', cantidad: 0.5, precioNeto: 0.111111, ordenId: 2, fecha: new Date(2026, 9, 20) }),
  ]
  const ranking = rankingConsumo(lineas, { agrupar: 'mes', fecha: '2026-10-15', metrica: 'unidades', limite: 10, hoy: HOY })
  assert.equal(ranking.items[0].descripcion, 'Nueva')
  assert.equal(ranking.items[0].familia, 'F2')
  assert.equal(ranking.items[0].cantidad, 1.7346)
  assert.equal(ranking.items[0].importe, 0.4444)
})

test('lanza error con parámetros inválidos', () => {
  const base = { agrupar: 'mes', metrica: 'unidades', limite: 10 }
  assert.throws(() => rankingConsumo([], { ...base, agrupar: 'dia' }))
  assert.throws(() => rankingConsumo([], { ...base, metrica: 'peso' }))
  assert.throws(() => rankingConsumo([], { ...base, limite: 0 }))
  assert.throws(() => rankingConsumo([], { ...base, limite: 51 }))
  assert.throws(() => rankingConsumo([], { ...base, limite: 2.5 }))
  assert.throws(() => rankingConsumo([], { ...base, limite: '10' }))
})


test('rankingConsumo incluye las líneas con hora del último día del periodo', () => {
  const lineas = [
    { referencia: 'A', cantidad: 3, precioNeto: 10, fecha: new Date(2026, 8, 30, 15, 30), ordenId: 1 },
    { referencia: 'A', cantidad: 1, precioNeto: 5, fecha: new Date(2026, 8, 1, 0, 0), ordenId: 2 },
    { referencia: 'B', cantidad: 2, precioNeto: 5, fecha: new Date(2026, 9, 1, 0, 5), ordenId: 3 },
  ]
  const r = rankingConsumo(lineas, { agrupar: 'mes', fecha: '2026-09-15', metrica: 'unidades', limite: 10, hoy: new Date(2026, 9, 5) })
  assert.equal(r.items.length, 1)
  assert.equal(r.items[0].cantidad, 4)
  assert.equal(r.totales.ordenes, 2)
})
