import test from 'node:test'
import assert from 'node:assert/strict'
import { filtrarObsoletos } from './obsoletos.js'

// Pruebas del cálculo de artículos obsoletos (sin stock y/o sin movimientos).

// Fecha de referencia fija para que los cálculos de días sean deterministas.
const AHORA = new Date('2026-02-10T12:00:00Z')

// Construye un artículo con valores por defecto razonables.
function articulo(id, extra = {}) {
  return {
    id,
    referencia: `REF-${id}`,
    descripcion: `Artículo ${id}`,
    familia: null,
    proveedor: null,
    stock: 0,
    sinStockDesde: null,
    ...extra,
  }
}

// Construye una línea de material (movimiento) de una orden.
function movimiento(articuloId, fechaEntrada) {
  return { articuloId, orden: { fechaEntrada } }
}

// Devuelve solo los identificadores de las filas resultantes.
function ids(filas) {
  return filas.map((fila) => fila.id)
}

test('sin filtros devuelve todos los artículos ordenados por referencia', () => {
  const filas = filtrarObsoletos(
    [articulo(3, { referencia: 'C' }), articulo(1, { referencia: 'A' }), articulo(2, { referencia: 'B' })],
    [],
    {},
    AHORA,
  )
  assert.deepEqual(ids(filas), [1, 2, 3])
})

test('sinStockDias 0 incluye cualquier artículo con stock <= 0 aunque no tenga fecha', () => {
  const filas = filtrarObsoletos(
    [
      articulo(1, { stock: 0, sinStockDesde: '2026-02-09T00:00:00Z' }),
      articulo(2, { stock: -3, sinStockDesde: null }),
      articulo(3, { stock: 5, sinStockDesde: null }),
    ],
    [],
    { sinStockDias: 0 },
    AHORA,
  )
  assert.deepEqual(ids(filas), [1, 2])
})

test('sinStockDias solo incluye los que llevan sin stock al menos esos días', () => {
  // 90 días antes de AHORA = 2025-11-12T12:00:00Z
  const filas = filtrarObsoletos(
    [
      articulo(1, { stock: 0, sinStockDesde: '2025-06-01T00:00:00Z' }),
      articulo(2, { stock: 0, sinStockDesde: '2026-01-01T00:00:00Z' }),
      articulo(3, { stock: 0, sinStockDesde: null }),
      articulo(4, { stock: 5, sinStockDesde: '2024-01-01T00:00:00Z' }),
    ],
    [],
    { sinStockDias: 90 },
    AHORA,
  )
  assert.deepEqual(ids(filas), [1])
})

test('sinStockDias incluye justo en el límite y excluye un día después', () => {
  const filas = filtrarObsoletos(
    [
      articulo(1, { stock: 0, sinStockDesde: '2025-11-12T12:00:00Z' }), // justo en el corte
      articulo(2, { stock: 0, sinStockDesde: '2025-11-12T12:00:01Z' }), // un segundo después
    ],
    [],
    { sinStockDias: 90 },
    AHORA,
  )
  assert.deepEqual(ids(filas), [1])
})

test('sinMovimientosDias incluye los usados hace tiempo y, por defecto, los nunca usados', () => {
  // 30 días antes de AHORA = 2026-01-11T12:00:00Z
  const filas = filtrarObsoletos(
    [articulo(1), articulo(2), articulo(3), articulo(4)],
    [
      movimiento(1, '2025-12-01T00:00:00Z'), // antiguo -> incluido
      movimiento(2, '2026-02-01T00:00:00Z'), // reciente -> excluido
    ],
    { sinMovimientosDias: 30 },
    AHORA,
  )
  assert.deepEqual([...ids(filas)].sort((a, b) => a - b), [1, 3, 4])
})

test('sinMovimientosDias con incluirNuncaUsados false excluye los nunca usados', () => {
  const filas = filtrarObsoletos(
    [articulo(1), articulo(3)],
    [movimiento(1, '2025-12-01T00:00:00Z')],
    { sinMovimientosDias: 30, incluirNuncaUsados: false },
    AHORA,
  )
  assert.deepEqual(ids(filas), [1])
})

test('los dos filtros de tiempo se combinan (AND)', () => {
  const filas = filtrarObsoletos(
    [
      articulo(1, { stock: 0, sinStockDesde: '2025-01-01T00:00:00Z' }), // cumple stock
      articulo(2, { stock: 0, sinStockDesde: '2025-01-01T00:00:00Z' }), // cumple stock, movimiento reciente
      articulo(3, { stock: 7, sinStockDesde: null }), // movimiento antiguo, pero con stock
    ],
    [
      movimiento(1, '2025-01-01T00:00:00Z'), // antiguo
      movimiento(2, '2026-02-05T00:00:00Z'), // reciente
      movimiento(3, '2020-01-01T00:00:00Z'), // antiguo
    ],
    { sinStockDias: 60, sinMovimientosDias: 60 },
    AHORA,
  )
  assert.deepEqual(ids(filas), [1])
})

test('la búsqueda filtra por referencia o descripción', () => {
  const filas = filtrarObsoletos(
    [
      articulo(1, { referencia: 'CAD-123', descripcion: 'Cadena' }),
      articulo(2, { referencia: 'FRE-9', descripcion: 'Pastillas de freno' }),
    ],
    [],
    { q: 'freno' },
    AHORA,
  )
  assert.deepEqual(ids(filas), [2])
})

test('el filtro de familia usa coincidencia exacta', () => {
  const filas = filtrarObsoletos(
    [articulo(1, { familia: 'Transmisión' }), articulo(2, { familia: 'Frenos' })],
    [],
    { familia: 'Frenos' },
    AHORA,
  )
  assert.deepEqual(ids(filas), [2])
})

test('calcula usos y último movimiento, y ordena los nunca usados primero', () => {
  const filas = filtrarObsoletos(
    [articulo(1, { referencia: 'A' }), articulo(2, { referencia: 'B' }), articulo(3, { referencia: 'C' })],
    [
      movimiento(1, '2025-05-01T00:00:00Z'),
      movimiento(1, '2026-01-15T00:00:00Z'),
      movimiento(3, '2024-03-01T00:00:00Z'),
    ],
    {},
    AHORA,
  )
  // El artículo 2 nunca se ha usado: va primero (ultimoMovimiento null).
  assert.deepEqual(ids(filas), [2, 3, 1])
  const fila1 = filas.find((f) => f.id === 1)
  assert.equal(fila1.usos, 2)
  assert.equal(fila1.ultimoMovimiento, '2026-01-15T00:00:00.000Z')
  const fila2 = filas.find((f) => f.id === 2)
  assert.equal(fila2.usos, 0)
  assert.equal(fila2.ultimoMovimiento, null)
})

test('entre dos artículos con el mismo último movimiento ordena por referencia', () => {
  const filas = filtrarObsoletos(
    [articulo(1, { referencia: 'Z' }), articulo(2, { referencia: 'A' })],
    [movimiento(1, '2025-05-01T00:00:00Z'), movimiento(2, '2025-05-01T00:00:00Z')],
    {},
    AHORA,
  )
  assert.deepEqual(filas.map((f) => f.referencia), ['A', 'Z'])
})

test('el límite recorta el número de filas devueltas', () => {
  const articulos = [articulo(1), articulo(2), articulo(3)]
  assert.equal(filtrarObsoletos(articulos, [], { limite: 2 }, AHORA).length, 2)
  assert.equal(filtrarObsoletos(articulos, [], {}, AHORA).length, 3)
})

test('las filas devuelven solo los campos esperados', () => {
  const filas = filtrarObsoletos(
    [articulo(1, { familia: 'Frenos', proveedor: 'Proveedor X', stock: -2, sinStockDesde: '2025-01-01T00:00:00Z' })],
    [],
    {},
    AHORA,
  )
  assert.deepEqual(Object.keys(filas[0]).sort(), [
    'descripcion', 'familia', 'id', 'proveedor', 'referencia', 'sinStockDesde', 'stock', 'ultimoMovimiento', 'usos',
  ])
  assert.equal(filas[0].familia, 'Frenos')
  assert.equal(filas[0].proveedor, 'Proveedor X')
})

