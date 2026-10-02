import test from 'node:test'
import assert from 'node:assert/strict'
import { FORMAS_PAGO, formaPagoUnificada } from './pagos.js'

// Pruebas de la unificación de la forma/estado de pago de las órdenes.

test('FORMAS_PAGO tiene exactamente las seis opciones acordadas', () => {
  assert.deepEqual(FORMAS_PAGO, ['Pendiente', 'Parcial', 'Efectivo', 'Tarjeta', 'Bizum', 'Transferencia'])
})

test('estadoPago Pendiente o Parcial manda sobre la forma de pago', () => {
  assert.equal(formaPagoUnificada('Efectivo', 'Pendiente'), 'Pendiente')
  assert.equal(formaPagoUnificada('Financiado', 'Pendiente'), 'Pendiente')
  assert.equal(formaPagoUnificada(null, 'Pendiente'), 'Pendiente')
  assert.equal(formaPagoUnificada('Efectivo', 'Parcial'), 'Parcial')
  assert.equal(formaPagoUnificada('Transferencia', 'Parcial'), 'Parcial')
})

test('estadoPago Pagado conserva la forma cobrada', () => {
  assert.equal(formaPagoUnificada('Efectivo', 'Pagado'), 'Efectivo')
  assert.equal(formaPagoUnificada('Tarjeta', 'Pagado'), 'Tarjeta')
  assert.equal(formaPagoUnificada('Transferencia', 'Pagado'), 'Transferencia')
  assert.equal(formaPagoUnificada('Bizum', 'Pagado'), 'Bizum')
})

test('estadoPago Pagado normaliza Financiado, desconocida y nula', () => {
  assert.equal(formaPagoUnificada('Financiado', 'Pagado'), 'Transferencia')
  assert.equal(formaPagoUnificada('Cripto', 'Pagado'), 'Transferencia')
  assert.equal(formaPagoUnificada(null, 'Pagado'), 'Efectivo')
  assert.equal(formaPagoUnificada('', 'Pagado'), 'Efectivo')
})

test('sin estadoPago se conserva la forma válida', () => {
  assert.equal(formaPagoUnificada('Efectivo', null), 'Efectivo')
  assert.equal(formaPagoUnificada('Bizum', null), 'Bizum')
  assert.equal(formaPagoUnificada('Pendiente', null), 'Pendiente')
  assert.equal(formaPagoUnificada('Parcial', ''), 'Parcial')
})

test('sin estadoPago se normalizan Financiado y las formas desconocidas', () => {
  assert.equal(formaPagoUnificada('Financiado', null), 'Transferencia')
  assert.equal(formaPagoUnificada('Cripto', null), 'Pendiente')
  assert.equal(formaPagoUnificada('  Financiado  ', null), 'Transferencia')
})

test('con ambos campos vacíos la forma de pago queda sin indicar', () => {
  assert.equal(formaPagoUnificada(null, null), null)
  assert.equal(formaPagoUnificada('', ''), null)
  assert.equal(formaPagoUnificada(undefined, undefined), null)
})
