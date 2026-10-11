import test from 'node:test'
import assert from 'node:assert/strict'
import { elegirUsuarioAutomatico } from './accesoAutomatico.js'

test('devuelve null si la lista está vacía', () => {
  assert.equal(elegirUsuarioAutomatico([]), null)
})

test('devuelve null si solo hay mecánicos', () => {
  assert.equal(elegirUsuarioAutomatico([
    { id: 1, rol: 'mecanico', activo: true },
  ]), null)
})

test('devuelve null si el administrador está inactivo', () => {
  assert.equal(elegirUsuarioAutomatico([
    { id: 1, rol: 'admin', activo: false },
  ]), null)
})

test('elige el administrador activo con menor id aunque estén desordenados', () => {
  const usuarios = [
    { id: 8, rol: 'admin', activo: true },
    { id: 3, rol: 'admin', activo: true },
    { id: 1, rol: 'mecanico', activo: true },
    { id: 2, rol: 'admin', activo: false },
  ]

  assert.equal(elegirUsuarioAutomatico(usuarios), usuarios[1])
})
