import test from 'node:test'
import assert from 'node:assert/strict'
import {
  serializarDatos,
  deserializarDatos,
  descripcionCliente,
  descripcionBicicleta,
  descripcionArticulo,
  descripcionOrden,
  descripcionLineaMaterial,
  descripcionLineaManoObra,
  descripcionOperacion,
  descripcionMecanico,
} from './papelera.js'

// Pruebas de las utilidades puras de la papelera (serialización de instantáneas
// y descripciones legibles). La restauración contra la base de datos no se
// cubre aquí porque necesita Prisma.

test('serializarDatos y deserializarDatos conservan los valores', () => {
  const datos = { cliente: { id: 1, nombre: 'Ana' }, bicicletas: [{ id: 2 }, { id: 3 }] }
  const texto = serializarDatos(datos)
  assert.equal(typeof texto, 'string')
  assert.deepEqual(deserializarDatos(texto), datos)
})

test('deserializarDatos revive los campos de fecha a objetos Date', () => {
  const iso = '2026-01-02T03:04:05.000Z'
  const texto = serializarDatos({
    articulo: { id: 1, createdAt: iso, sinStockDesde: iso },
    lineas: [{ id: 5, updatedAt: iso }],
  })
  const datos = deserializarDatos(texto)
  assert.ok(datos.articulo.createdAt instanceof Date)
  assert.ok(datos.articulo.sinStockDesde instanceof Date)
  assert.ok(datos.lineas[0].updatedAt instanceof Date)
  assert.equal(datos.articulo.createdAt.toISOString(), iso)
})

test('deserializarDatos deja null las fechas inválidas y respeta campos normales', () => {
  const texto = JSON.stringify({ orden: { id: 1, fechaEntrada: 'no-es-fecha', numeroOrden: 'ORD-1' } })
  const datos = deserializarDatos(texto)
  assert.equal(datos.orden.fechaEntrada, null)
  assert.equal(datos.orden.numeroOrden, 'ORD-1')
})

test('descripcionCliente junta número, nombre y apellidos', () => {
  assert.equal(descripcionCliente({ numeroCliente: 12, nombre: 'Ana', apellidos: 'García' }), 'Cliente #12 Ana García')
  assert.equal(descripcionCliente({ numeroCliente: 7, nombre: 'Ana' }), 'Cliente #7 Ana')
})

test('descripciones de bicicleta y artículo', () => {
  assert.equal(descripcionBicicleta({ marca: 'BH', modelo: 'Atom' }), 'Bicicleta BH Atom')
  assert.equal(descripcionBicicleta({ marca: 'BH' }), 'Bicicleta BH')
  assert.equal(descripcionArticulo({ referencia: 'REF-1', descripcion: 'Cámara 26' }), 'Artículo REF-1 Cámara 26')
})

test('descripcionOrden usa el número de orden', () => {
  assert.equal(descripcionOrden({ numeroOrden: 'ORD-0001' }), 'Orden ORD-0001')
})

test('descripciones de líneas incluyen el número de orden cuando existe', () => {
  assert.equal(
    descripcionLineaMaterial({ descripcion: 'Cámara 26' }, 'ORD-1'),
    'Línea de material: Cámara 26 (ORD-1)',
  )
  assert.equal(
    descripcionLineaManoObra({ descripcion: 'Cambio de rueda' }, 'ORD-1'),
    'Línea de mano de obra: Cambio de rueda (ORD-1)',
  )
  assert.equal(descripcionLineaMaterial({ descripcion: 'Cámara 26' }), 'Línea de material: Cámara 26')
})

test('descripciones de operación y mecánico', () => {
  assert.equal(descripcionOperacion({ codigo: 'MO', descripcion: 'Ajuste' }), 'Operación MO Ajuste')
  assert.equal(descripcionMecanico({ nombre: 'Luis' }), 'Mecánico Luis')
})
