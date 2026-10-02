import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dividirCampos, leerLineasCsv } from './csv.js'

// Pruebas del lector CSV: separador ';' con campos entrecomillados (RFC 4180).

test('campo normal se parte por el separador', () => {
  assert.deepEqual(dividirCampos('a;b;c'), ['a', 'b', 'c'])
})

test('los campos vacíos se conservan', () => {
  assert.deepEqual(dividirCampos('a;;c'), ['a', '', 'c'])
  assert.deepEqual(dividirCampos('430;;;;;;'), ['430', '', '', '', '', '', ''])
})

test('las comillas dobles escapadas se convierten en una comilla literal', () => {
  assert.deepEqual(dividirCampos('430;"Jose ""Gar""";x'), ['430', 'Jose "Gar"', 'x'])
})

test('un separador dentro de comillas es texto', () => {
  assert.deepEqual(
    dividirCampos('979;Rompecadenas Motors S.L.;"Pol. ""El Pedal"" parc. 7";99001'),
    ['979', 'Rompecadenas Motors S.L.', 'Pol. "El Pedal" parc. 7', '99001'],
  )
})

test('una comilla suelta dentro de un campo normal se deja tal cual', () => {
  assert.deepEqual(dividirCampos('abc"def;ghi'), ['abc"def', 'ghi'])
})

test('se recortan los espacios de los extremos', () => {
  assert.deepEqual(dividirCampos('  a  ;  b  '), ['a', 'b'])
  assert.deepEqual(dividirCampos('"  hola  "'), ['hola'])
})

test('se conservan los espacios interiores de un campo entrecomillado', () => {
  assert.deepEqual(dividirCampos('"a  b";c'), ['a  b', 'c'])
})

test('los ejemplos del ERP quedan con la forma esperada', () => {
  const fila = dividirCampos('430;"Pepa Mª Lopez ""Pepi""";;;;;;')
  assert.equal(fila[0], '430')
  assert.equal(fila[1], 'Pepa Mª Lopez "Pepi"')
  assert.equal(fila.length, 8)
})

test('leerLineasCsv une líneas físicas mientras haya comillas abiertas', () => {
  const ruta = path.join(os.tmpdir(), `csv-prueba-${process.pid}.csv`)
  // Campo entrecomillado que ocupa dos líneas físicas.
  fs.writeFileSync(ruta, 'a;"linea1\r\nlinea2";c\r\nd;e;f', 'utf8')
  try {
    const lineas = leerLineasCsv(ruta)
    assert.equal(lineas.length, 2)
    assert.deepEqual(dividirCampos(lineas[0]), ['a', 'linea1 linea2', 'c'])
    assert.deepEqual(dividirCampos(lineas[1]), ['d', 'e', 'f'])
  } finally {
    fs.rmSync(ruta, { force: true })
  }
})
