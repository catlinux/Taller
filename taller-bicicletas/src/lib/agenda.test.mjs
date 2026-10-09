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
  segmentosVisuales,
  rangoHoras,
  horaDeClic,
  zonasFueraDeHorario,
  ESCALA_PX,
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

test('segmentosVisuales: un bloque sin pausas es un solo trozo y uno que cruza la pausa se parte', () => {
  const tramos = [{ inicio: '09:00', fin: '13:00' }, { inicio: '15:00', fin: '17:00' }]
  assert.deepEqual(segmentosVisuales(tramos, 540, 60), [{ desde: 540, hasta: 600 }])
  assert.deepEqual(segmentosVisuales(tramos, 750, 60), [{ desde: 750, hasta: 780 }, { desde: 900, hasta: 930 }])
  assert.deepEqual(segmentosVisuales(tramos, 780, 30), [{ desde: 900, hasta: 930 }])
  assert.deepEqual(segmentosVisuales([{ inicio: '09:00', fin: '10:00' }], 570, 60), [{ desde: 570, hasta: 600 }, { desde: 600, hasta: 630 }])
  assert.deepEqual(segmentosVisuales([], 540, 30), [{ desde: 540, hasta: 570 }])
})

test('rangoHoras une los horarios de la semana y los bloques', () => {
  const dias = [
    { tramos: [{ inicio: '09:00', fin: '13:30' }], bloques: [] },
    { tramos: [{ inicio: '10:00', fin: '17:00' }], bloques: [{ inicio: '08:30', fin: '09:15' }] },
  ]
  assert.deepEqual(rangoHoras(dias), { inicio: 480, fin: 1020 })
  assert.deepEqual(rangoHoras([]), { inicio: 540, fin: 1020 })
})

test('horaDeClic redondea a 15 minutos y devuelve null en pausas o fuera de horario', () => {
  const tramos = [{ inicio: '09:00', fin: '13:00' }, { inicio: '15:00', fin: '17:00' }]
  const y = (minuto) => (minuto - 540) * ESCALA_PX
  assert.equal(horaDeClic(tramos, 540, y(547)), 540)
  assert.equal(horaDeClic(tramos, 540, y(553)), 555)
  assert.equal(horaDeClic(tramos, 540, y(840)), null)
  assert.equal(horaDeClic(tramos, 540, y(1030)), null)
  assert.equal(horaDeClic(tramos, 540, y(779)), 765)
})

test('zonasFueraDeHorario devuelve los extremos y las pausas del eje', () => {
  const tramos = [{ inicio: '09:30', fin: '13:00' }, { inicio: '15:00', fin: '16:00' }]
  assert.deepEqual(zonasFueraDeHorario(tramos, 540, 1080), [
    { desde: 540, hasta: 570 }, { desde: 780, hasta: 900 }, { desde: 960, hasta: 1080 },
  ])
  assert.deepEqual(zonasFueraDeHorario([], 540, 600), [{ desde: 540, hasta: 600 }])
})
