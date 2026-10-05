import test from 'node:test'
import assert from 'node:assert/strict'
import { parseFechaLocal, rangoFechas, validarOrdenIds } from './factusolRango.js'

// Pruebas de las utilidades puras de las rutas de Factusol (rango de fechas en
// hora local y validación de identificadores de orden). No necesitan base de
// datos.

test('parseFechaLocal interpreta AAAA-MM-DD en hora local', () => {
  const inicio = parseFechaLocal('2026-03-05', false)
  assert.equal(inicio.getFullYear(), 2026)
  assert.equal(inicio.getMonth(), 2)
  assert.equal(inicio.getDate(), 5)
  assert.equal(inicio.getHours(), 0)
  assert.equal(inicio.getMinutes(), 0)
  assert.equal(inicio.getSeconds(), 0)
  assert.equal(inicio.getMilliseconds(), 0)

  const fin = parseFechaLocal('2026-03-05', true)
  assert.equal(fin.getDate(), 5)
  assert.equal(fin.getHours(), 23)
  assert.equal(fin.getMinutes(), 59)
  assert.equal(fin.getSeconds(), 59)
  assert.equal(fin.getMilliseconds(), 999)
})

test('parseFechaLocal rechaza formatos y fechas no válidas', () => {
  assert.equal(parseFechaLocal('05/03/2026'), null)
  assert.equal(parseFechaLocal('2026-3-5'), null)
  assert.equal(parseFechaLocal('2026-02-30'), null)
  assert.equal(parseFechaLocal(''), null)
  assert.equal(parseFechaLocal(undefined), null)
  assert.equal(parseFechaLocal(null), null)
})

test('rangoFechas devuelve el día completo de cada extremo', () => {
  const rango = rangoFechas('2026-01-10', '2026-01-20')
  assert.equal(rango.error, undefined)
  assert.equal(rango.desde.getHours(), 0)
  assert.equal(rango.desde.getDate(), 10)
  assert.equal(rango.hasta.getHours(), 23)
  assert.equal(rango.hasta.getDate(), 20)
  assert.equal(rango.hasta.getMilliseconds(), 999)
})

test('rangoFechas admite el mismo día en ambos extremos', () => {
  const rango = rangoFechas('2026-01-10', '2026-01-10')
  assert.equal(rango.error, undefined)
  assert.ok(rango.desde.getTime() <= rango.hasta.getTime())
})

test('rangoFechas exige fechas válidas', () => {
  assert.ok(rangoFechas(undefined, '2026-01-20').error)
  assert.ok(rangoFechas('2026-01-10', undefined).error)
  assert.ok(rangoFechas('10-01-2026', '2026-01-20').error)
})

test('rangoFechas rechaza desde posterior a hasta', () => {
  assert.ok(rangoFechas('2026-02-01', '2026-01-31').error)
})

test('validarOrdenIds acepta una lista de enteros positivos', () => {
  const { ordenIds, error } = validarOrdenIds([1, 2, 3])
  assert.equal(error, undefined)
  assert.deepEqual(ordenIds, [1, 2, 3])
})

test('validarOrdenIds rechaza listas vacías o que no son arrays', () => {
  assert.ok(validarOrdenIds([]).error)
  assert.ok(validarOrdenIds('1').error)
  assert.ok(validarOrdenIds(undefined).error)
  assert.ok(validarOrdenIds({ 0: 1 }).error)
})

test('validarOrdenIds rechaza valores que no son enteros positivos', () => {
  assert.ok(validarOrdenIds([1, 0]).error)
  assert.ok(validarOrdenIds([1, -2]).error)
  assert.ok(validarOrdenIds([1, 1.5]).error)
  assert.ok(validarOrdenIds([1, '2']).error)
  assert.ok(validarOrdenIds([1, null]).error)
})
