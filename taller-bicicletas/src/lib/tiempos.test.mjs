import test from 'node:test'
import assert from 'node:assert/strict'
import { formatearMinutos, parsearTiempo, horasAMinutos, minutosAHoras } from './tiempos.js'

// Pruebas de las utilidades de tiempos (minutos <-> «H:MM»).

test('formatearMinutos compone «H:MM»', () => {
  assert.equal(formatearMinutos(0), '0:00')
  assert.equal(formatearMinutos(20), '0:20')
  assert.equal(formatearMinutos(60), '1:00')
  assert.equal(formatearMinutos(200), '3:20')
  assert.equal(formatearMinutos(1440), '24:00')
})

test('formatearMinutos devuelve cadena vacía con valores no válidos', () => {
  assert.equal(formatearMinutos(null), '')
  assert.equal(formatearMinutos(undefined), '')
  assert.equal(formatearMinutos('nope'), '')
  assert.equal(formatearMinutos(-5), '')
})

test('parsearTiempo interpreta «H:MM» y «HH:MM»', () => {
  assert.equal(parsearTiempo('0:20'), 20)
  assert.equal(parsearTiempo('3:20'), 200)
  assert.equal(parsearTiempo('00:45'), 45)
  assert.equal(parsearTiempo('24:00'), 1440)
  assert.equal(parsearTiempo(' 1:05 '), 65)
})

test('parsearTiempo devuelve null con formato o rango inválido', () => {
  assert.equal(parsearTiempo(''), null)
  assert.equal(parsearTiempo('0:00'), null)
  assert.equal(parsearTiempo('0:60'), null)
  assert.equal(parsearTiempo('24:30'), null)
  assert.equal(parsearTiempo('1:5'), null)
  assert.equal(parsearTiempo('1h'), null)
  assert.equal(parsearTiempo(20), null)
})

test('horasAMinutos y minutosAHoras son inversas y redondean', () => {
  assert.equal(horasAMinutos(0.5), 30)
  assert.equal(horasAMinutos(1), 60)
  assert.equal(horasAMinutos(3.333), 200)
  assert.equal(minutosAHoras(20), 0.3333)
  assert.equal(minutosAHoras(30), 0.5)
  assert.equal(minutosAHoras(200), 3.3333)
  assert.equal(minutosAHoras(45), 0.75)
})
