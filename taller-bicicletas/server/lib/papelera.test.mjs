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

// --- Siguiente valor libre a partir del original ---
import { siguienteTextoLibre } from './papelera.js'

const ocupados = (...lista) => async (valor) => lista.includes(valor)

test('siguienteTextoLibre devuelve el original si está libre', async () => {
  assert.equal(await siguienteTextoLibre('CAM-0002', ocupados('CAM-0001')), 'CAM-0002')
})

test('siguienteTextoLibre sube el número final conservando los ceros', async () => {
  assert.equal(await siguienteTextoLibre('CAM-0002', ocupados('CAM-0002')), 'CAM-0003')
  assert.equal(await siguienteTextoLibre('CAM-0002', ocupados('CAM-0002', 'CAM-0003', 'CAM-0004')), 'CAM-0005')
  assert.equal(await siguienteTextoLibre('ORD-2026-0009', ocupados('ORD-2026-0009')), 'ORD-2026-0010')
  assert.equal(await siguienteTextoLibre('X-099', ocupados('X-099')), 'X-100')
})

test('siguienteTextoLibre añade sufijo si no acaba en número', async () => {
  assert.equal(await siguienteTextoLibre('REV-GEN', ocupados('REV-GEN')), 'REV-GEN-2')
  assert.equal(await siguienteTextoLibre('REV-GEN', ocupados('REV-GEN', 'REV-GEN-2')), 'REV-GEN-3')
  assert.equal(await siguienteTextoLibre('Ana', ocupados('Ana'), (b, n) => `${b} (${n})`), 'Ana (2)')
})

test('siguienteTextoLibre soporta números largos sin perder precisión', async () => {
  assert.equal(await siguienteTextoLibre('8412345678901234567890', ocupados('8412345678901234567890')), '8412345678901234567891')
})
