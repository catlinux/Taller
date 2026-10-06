import test from 'node:test'
import assert from 'node:assert/strict'
import {
  minutosDeHora,
  horaDeMinutos,
  horasUnion,
  etiquetaSemana,
  validarTramosCliente,
  minutosTramos,
  estadoOcupacion,
  agruparCatalogo,
} from './agenda.js'

// Pruebas de las utilidades puras de la agenda (unión de horas, etiqueta de la
// semana, validación de tramos, ocupación y catálogo agrupado).

test('minutosDeHora convierte «HH:MM» a minutos y rechaza lo inválido', () => {
  assert.equal(minutosDeHora('00:00'), 0)
  assert.equal(minutosDeHora('09:00'), 540)
  assert.equal(minutosDeHora('09:45'), 585)
  assert.equal(minutosDeHora('24:00'), 1440)
  assert.equal(minutosDeHora('9:00'), null)
  assert.equal(minutosDeHora('09:10'), null)
  assert.equal(minutosDeHora('24:30'), null)
  assert.equal(minutosDeHora('25:00'), null)
  assert.equal(minutosDeHora(null), null)
})

test('horaDeMinutos compone «HH:MM» (1440 -> 24:00)', () => {
  assert.equal(horaDeMinutos(0), '00:00')
  assert.equal(horaDeMinutos(540), '09:00')
  assert.equal(horaDeMinutos(585), '09:45')
  assert.equal(horaDeMinutos(1440), '24:00')
})

test('horasUnion une, quita repetidas y ordena las franjas de varios días', () => {
  const dias = [
    { franjas: [{ hora: '11:00' }, { hora: '09:00' }] },
    { franjas: [{ hora: '09:00' }, { hora: '10:00' }] },
    { franjas: [] },
  ]
  assert.deepEqual(horasUnion(dias), ['09:00', '10:00', '11:00'])
  assert.deepEqual(horasUnion([]), [])
  assert.deepEqual(horasUnion(undefined), [])
})

test('etiquetaSemana muestra semana ISO y rango, también al cruzar mes y año', () => {
  assert.equal(etiquetaSemana('2026-10-05', '2026-10-09'), 'Semana 41 · 5 – 9 oct 2026')
  assert.equal(etiquetaSemana('2026-09-28', '2026-10-02'), 'Semana 40 · 28 sep – 2 oct 2026')
  assert.equal(etiquetaSemana('2026-12-28', '2027-01-01'), 'Semana 53 · 28 dic 2026 – 1 ene 2027')
})

test('etiquetaSemana devuelve cadena vacía con fechas inválidas', () => {
  assert.equal(etiquetaSemana('nope', '2026-10-09'), '')
  assert.equal(etiquetaSemana('2026-10-05', ''), '')
})

test('validarTramosCliente normaliza y ordena los tramos válidos', () => {
  const { tramos } = validarTramosCliente([
    { inicio: '15:00', fin: '17:00' },
    { inicio: '09:00', fin: '13:00' },
  ])
  assert.deepEqual(tramos, [
    { inicio: '09:00', fin: '13:00' },
    { inicio: '15:00', fin: '17:00' },
  ])
})

test('validarTramosCliente rechaza tramos inválidos', () => {
  assert.ok(validarTramosCliente([]).error)
  assert.ok(validarTramosCliente([1, 2, 3, 4, 5].map(() => ({ inicio: '09:00', fin: '10:00' }))).error)
  assert.ok(validarTramosCliente([{ inicio: '09:00', fin: '09:00' }]).error)
  assert.ok(validarTramosCliente([{ inicio: '09:00', fin: '11:00' }, { inicio: '10:00', fin: '12:00' }]).error)
  assert.ok(validarTramosCliente([{ inicio: '9:00', fin: '11:00' }]).error)
  assert.ok(validarTramosCliente([null]).error)
})

test('minutosTramos suma la duración de todos los tramos', () => {
  assert.equal(minutosTramos([{ inicio: '09:00', fin: '13:00' }, { inicio: '15:00', fin: '17:00' }]), 360)
  assert.equal(minutosTramos([]), 0)
})

test('estadoOcupacion clasifica normal, casi y excedido', () => {
  assert.equal(estadoOcupacion(100, 300), 'normal')
  assert.equal(estadoOcupacion(255, 300), 'normal')
  assert.equal(estadoOcupacion(256, 300), 'casi')
  assert.equal(estadoOcupacion(300, 300), 'casi')
  assert.equal(estadoOcupacion(301, 300), 'excedido')
  assert.equal(estadoOcupacion(0, 0), 'normal')
})

test('agruparCatalogo agrupa por categoría con «Otros» al final', () => {
  const catalogo = [
    { codigo: 'FRE-01', descripcion: 'Freno delantero', categoria: 'Frenos' },
    { codigo: 'X', descripcion: 'Sin categoria' },
    { codigo: 'TRA-01', descripcion: 'Transmisión', categoria: 'Transmisión' },
    { codigo: 'DIR-02', descripcion: 'Direccion', categoria: 'Dirección' },
  ]
  const grupos = agruparCatalogo(catalogo, '')
  assert.deepEqual(grupos.map((g) => g.categoria), ['Dirección', 'Frenos', 'Transmisión', 'Otros'])
  assert.equal(grupos.at(-1).operaciones[0].codigo, 'X')
})

test('agruparCatalogo filtra sin distinguir mayúsculas ni tildes', () => {
  const catalogo = [
    { codigo: 'FRE-01', descripcion: 'Freno delantero', categoria: 'Frenos' },
    { codigo: 'TRA-01', descripcion: 'Transmisión', categoria: 'Transmisión' },
    { codigo: 'DIR-01', descripcion: 'Ajuste de direccion', categoria: 'Dirección' },
  ]
  const porNombre = agruparCatalogo(catalogo, 'DIRECCION')
  assert.deepEqual(porNombre.flatMap((g) => g.operaciones).map((o) => o.codigo), ['DIR-01'])
  const porCodigo = agruparCatalogo(catalogo, 'tra-01')
  assert.deepEqual(porCodigo.flatMap((g) => g.operaciones).map((o) => o.codigo), ['TRA-01'])
})
