import test from 'node:test'
import assert from 'node:assert/strict'
import { validarCuerpo } from './importarCuerpo.js'

// Pruebas de la validación del cuerpo de una importación. No usan base de datos:
// solo comprueban cómo se interpreta lo que llega en la petición.

test('validarCuerpo acepta un tipo conocido con contenido', () => {
  const contenido = 'Cód;Nombre\n1;Ana'
  const resultado = validarCuerpo('clientes', { contenido })
  assert.equal(resultado.error, undefined)
  assert.equal(resultado.status, undefined)
  assert.equal(resultado.tipo, 'clientes')
  assert.equal(resultado.contenido, contenido)
  assert.equal(resultado.simular, false)
})

test('validarCuerpo marca simular solo cuando es el booleano true', () => {
  assert.equal(validarCuerpo('articulos', { contenido: 'x', simular: true }).simular, true)
  assert.equal(validarCuerpo('articulos', { contenido: 'x', simular: false }).simular, false)
  assert.equal(validarCuerpo('articulos', { contenido: 'x', simular: 1 }).simular, false)
  assert.equal(validarCuerpo('articulos', { contenido: 'x', simular: 'true' }).simular, false)
})

test('validarCuerpo rechaza tipos desconocidos con 404', () => {
  for (const tipo of ['proveedores', 'clientes2', 'constructor', '__proto__', undefined]) {
    const resultado = validarCuerpo(tipo, { contenido: 'x' })
    assert.equal(resultado.status, 404)
    assert.equal(resultado.error, 'Tipo de importación desconocido')
  }
})

test('validarCuerpo rechaza contenido vacío o que no es texto con 400', () => {
  for (const contenido of [undefined, null, '', '   ', 123, {}, []]) {
    const resultado = validarCuerpo('bicicletas', { contenido })
    assert.equal(resultado.status, 400)
    assert.equal(resultado.error, 'Falta el contenido del fichero')
  }
})

test('validarCuerpo admite un cuerpo ausente', () => {
  const resultado = validarCuerpo('clientes', undefined)
  assert.equal(resultado.status, 400)
  assert.equal(resultado.error, 'Falta el contenido del fichero')
})
