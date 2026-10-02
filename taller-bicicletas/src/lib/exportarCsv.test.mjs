import test from 'node:test'
import assert from 'node:assert/strict'
import {
  construirCsv,
  escaparCampoCsv,
  formatearImporteCsv,
  formatearFechaCsv,
  protegerFormulaCsv,
} from './exportarCsv.js'

// Pruebas del generador CSV: separador ';', BOM, CRLF, coma decimal, fechas
// dd/mm/aaaa, entrecomillado y protección contra inyección de fórmulas.

test('los importes usan coma decimal y dos decimales', () => {
  assert.equal(formatearImporteCsv(12.5), '12,50')
  assert.equal(formatearImporteCsv(0), '0,00')
  assert.equal(formatearImporteCsv('1234.5'), '1234,50')
  assert.equal(formatearImporteCsv(1234567.891), '1.234.567,89')
})

test('las fechas se formatean como dd/mm/aaaa', () => {
  assert.equal(formatearFechaCsv(new Date(2026, 9, 2)), '02/10/2026')
  assert.equal(formatearFechaCsv(''), '')
  assert.equal(formatearFechaCsv(null), '')
  assert.equal(formatearFechaCsv('no-es-fecha'), '')
})

test('los textos que empiezan por = + - @ se protegen', () => {
  assert.equal(protegerFormulaCsv('=1+1'), "'=1+1")
  assert.equal(protegerFormulaCsv('+34 600'), "'+34 600")
  assert.equal(protegerFormulaCsv('-5'), "'-5")
  assert.equal(protegerFormulaCsv('@usuario'), "'@usuario")
  assert.equal(protegerFormulaCsv('Rompecadenas'), 'Rompecadenas')
})

test('los campos con separador, comillas o saltos se entrecomillan', () => {
  assert.equal(escaparCampoCsv('normal'), 'normal')
  assert.equal(escaparCampoCsv('a;b'), '"a;b"')
  assert.equal(escaparCampoCsv('con "comillas"'), '"con ""comillas"""')
  assert.equal(escaparCampoCsv('linea1\nlinea2'), '"linea1\nlinea2"')
})

test('construirCsv genera cabecera, BOM, CRLF y filas formateadas', () => {
  const columnas = [
    { clave: 'numeroOrden', titulo: 'Nº orden', tipo: 'texto', valor: (o) => o.numeroOrden },
    { clave: 'fechaEntrada', titulo: 'Fecha entrada', tipo: 'fecha', valor: (o) => o.fechaEntrada },
    { clave: 'cliente', titulo: 'Cliente', tipo: 'texto', valor: (o) => o.cliente },
    { clave: 'total', titulo: 'Total', tipo: 'numero', valor: (o) => o.total },
  ]
  const filas = [
    { numeroOrden: 'ORD-2026-0001', fechaEntrada: new Date(2026, 9, 2), cliente: 'Pepa Ejemplo', total: 1234.5 },
  ]

  const csv = construirCsv(columnas, filas)

  assert.ok(csv.startsWith('\uFEFF'), 'debe empezar por BOM')
  assert.ok(csv.includes('\r\n'), 'debe usar saltos CRLF')
  const lineas = csv.slice(1).split('\r\n')
  assert.equal(lineas[0], 'Nº orden;Fecha entrada;Cliente;Total')
  assert.equal(lineas[1], 'ORD-2026-0001;02/10/2026;Pepa Ejemplo;1234,50')
})

test('construirCsv neutraliza la inyección de fórmulas en textos', () => {
  const columnas = [{ clave: 'cliente', titulo: 'Cliente', tipo: 'texto', valor: (o) => o.cliente }]
  const csv = construirCsv(columnas, [{ cliente: '=HYPERLINK("http://x")' }])
  assert.equal(csv.slice(1).split('\r\n')[1], "\"'=HYPERLINK(\"\"http://x\"\")\"")
})
