import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizarTexto, coincideTexto } from './texto.js'

// Pruebas de la normalización de texto usada por las búsquedas (mayúsculas y
// acentos indiferentes).

test('normalizarTexto pasa a minúsculas y quita diacríticos', () => {
  assert.equal(normalizarTexto('Cámara'), 'camara')
  assert.equal(normalizarTexto('NÚRIA'), 'nuria')
  assert.equal(normalizarTexto('Niño'), 'nino')
  assert.equal(normalizarTexto('Çadiz'), 'cadiz')
  assert.equal(normalizarTexto('ÁÉÍÓÚÜ'), 'aeiouu')
})

test('normalizarTexto trata null, undefined y números', () => {
  assert.equal(normalizarTexto(null), '')
  assert.equal(normalizarTexto(undefined), '')
  assert.equal(normalizarTexto(0), '0')
  assert.equal(normalizarTexto(1234), '1234')
})

test('normalizarTexto recorta y colapsa espacios', () => {
  assert.equal(normalizarTexto('  Ana   García  '), 'ana garcia')
})

test('coincideTexto ignora mayúsculas y acentos', () => {
  assert.equal(coincideTexto(['Cámara'], 'cama'), true)
  assert.equal(coincideTexto(['Núria'], 'nuria'), true)
  assert.equal(coincideTexto(['nuria'], 'NÚRIA'), true)
  assert.equal(coincideTexto(['Niño'], 'ñ'), true)
  assert.equal(coincideTexto(['Cámara'], 'CÁMARA'), true)
})

test('coincideTexto exige que aparezcan todas las palabras', () => {
  assert.equal(coincideTexto(['Ana', 'García Pons'], 'ana garcia'), true)
  assert.equal(coincideTexto(['Ana', 'García Pons'], 'garcia ana'), true)
  assert.equal(coincideTexto(['Ana', 'García Pons'], 'ana lopez'), false)
  assert.equal(coincideTexto(['Ana', 'García Pons'], 'nuria'), false)
})

test('coincideTexto revisa todos los valores y admite nulos', () => {
  assert.equal(coincideTexto(['Bici', 'Rueda'], 'rueda'), true)
  assert.equal(coincideTexto([null, undefined, 'García'], 'garcia'), true)
  assert.equal(coincideTexto([null, undefined], 'algo'), false)
})

test('coincideTexto sin consulta siempre coincide', () => {
  assert.equal(coincideTexto(['lo que sea'], ''), true)
  assert.equal(coincideTexto(['lo que sea'], '   '), true)
})
