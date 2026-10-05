import test from 'node:test'
import assert from 'node:assert/strict'
import { debeMostrarBarraEspejo } from '../lib/dataTableScroll.js'

// Pruebas de la lógica que decide si se muestra la barra de scroll horizontal
// «espejo» de las tablas anchas.

test('muestra la barra espejo solo cuando la tabla desborda a lo ancho', () => {
  assert.equal(debeMostrarBarraEspejo({ scrollWidth: 1200, clientWidth: 800 }), true)
  assert.equal(debeMostrarBarraEspejo({ scrollWidth: 800, clientWidth: 800 }), false)
  assert.equal(debeMostrarBarraEspejo({ scrollWidth: 700, clientWidth: 800 }), false)
})

test('no muestra la barra espejo en el modo con scroll interno', () => {
  assert.equal(debeMostrarBarraEspejo({ scrollInterno: true, scrollWidth: 1200, clientWidth: 800 }), false)
})

test('ignora las diferencias dentro del margen de redondeo', () => {
  assert.equal(debeMostrarBarraEspejo({ scrollWidth: 801, clientWidth: 800 }), false)
  assert.equal(debeMostrarBarraEspejo({ scrollWidth: 802, clientWidth: 800 }), true)
  assert.equal(debeMostrarBarraEspejo({ scrollWidth: 805, clientWidth: 800, margen: 8 }), false)
})

test('sin medidas no muestra la barra espejo', () => {
  assert.equal(debeMostrarBarraEspejo(), false)
})
