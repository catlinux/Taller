import test from 'node:test'
import assert from 'node:assert/strict'
import { precioSinIva } from './precios.js'
import { calcularTotales } from '../routes/ordenes.js'

// Pruebas de los cálculos de precios y totales de las órdenes.

test('precioSinIva quita el IVA incluido y redondea a 4 decimales', () => {
  assert.equal(precioSinIva(13.25, 21), 10.9504)
  assert.equal(precioSinIva(121, 21), 100)
  assert.equal(precioSinIva(10, 0), 10)
})

test('calcularTotales suma materiales y mano de obra con su IVA', () => {
  const materiales = [{ precioNeto: 100, iva: 21 }]
  const manoObra = [{ importe: 30 }]
  const t = calcularTotales(materiales, manoObra, 0)
  assert.equal(t.subtotalMateriales, 100)
  assert.equal(t.subtotalManoObra, 30)
  assert.equal(t.baseImponible, 130)
  assert.equal(t.iva, 27.3)
  assert.equal(t.total, 157.3)
})

test('calcularTotales aplica el descuento global antes del IVA', () => {
  const t = calcularTotales([{ precioNeto: 100, iva: 21 }], [], 10)
  assert.equal(t.baseImponible, 90)
  assert.equal(t.iva, 18.9)
  assert.equal(t.total, 108.9)
})

test('calcularTotales con una orden vacía da todo cero', () => {
  const t = calcularTotales([], [], 0)
  assert.equal(t.total, 0)
})
