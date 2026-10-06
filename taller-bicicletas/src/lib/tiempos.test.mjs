import test from 'node:test'
import assert from 'node:assert/strict'
import { formatearMinutos, parsearTiempo, parsearDuracionLibre, horasAMinutos, minutosAHoras } from './tiempos.js'

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

test('parsearDuracionLibre interpreta «H:MM», solo minutos y horas con «h»', () => {
  // «H:MM» / «HH:MM».
  assert.equal(parsearDuracionLibre('0:45'), 45)
  assert.equal(parsearDuracionLibre('00:45'), 45)
  assert.equal(parsearDuracionLibre('1:30'), 90)
  assert.equal(parsearDuracionLibre('24:00'), 1440)
  assert.equal(parsearDuracionLibre(' 1:05 '), 65)
  // Solo minutos.
  assert.equal(parsearDuracionLibre('45'), 45)
  assert.equal(parsearDuracionLibre('90'), 90)
  assert.equal(parsearDuracionLibre('1440'), 1440)
  // Horas con «h» (coma o punto decimal).
  assert.equal(parsearDuracionLibre('1h'), 60)
  assert.equal(parsearDuracionLibre('1h30'), null) // '1h30' no acaba en «h»: inválido
  assert.equal(parsearDuracionLibre('1,5h'), 90)
  assert.equal(parsearDuracionLibre('1.5h'), 90)
  assert.equal(parsearDuracionLibre('0,5h'), 30)
  assert.equal(parsearDuracionLibre('2 h'), 120)
})

test('parsearDuracionLibre devuelve null con valores inválidos o fuera de rango', () => {
  assert.equal(parsearDuracionLibre(''), null)
  assert.equal(parsearDuracionLibre('   '), null)
  assert.equal(parsearDuracionLibre('0'), null)
  assert.equal(parsearDuracionLibre('0h'), null)
  assert.equal(parsearDuracionLibre('0:00'), null)
  assert.equal(parsearDuracionLibre('25:00'), null)
  assert.equal(parsearDuracionLibre('1441'), null)
  assert.equal(parsearDuracionLibre('25h'), null)
  assert.equal(parsearDuracionLibre('abc'), null)
  assert.equal(parsearDuracionLibre(null), null)
  assert.equal(parsearDuracionLibre(45), null)
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
