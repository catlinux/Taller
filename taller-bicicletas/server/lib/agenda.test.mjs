import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONFIG_AGENDA_DEFECTO,
  validarTramos,
  validarHorasMaximas,
  franjasDeTramos,
  minutosLaborables,
  semanaLaborable,
  esLaborable,
  nombreDia,
  resumenDia,
  inicioPlanificacion,
} from './agenda.js'

// Pruebas de la lógica pura de la agenda: tramos, franjas, semana laborable y
// resumen de ocupación. Todo con fechas y horarios fijos (sin base de datos).

test('CONFIG_AGENDA_DEFECTO es el horario y las horas máximas por defecto', () => {
  assert.deepEqual(CONFIG_AGENDA_DEFECTO, {
    tramos: [{ inicio: '09:00', fin: '17:00' }],
    horasMaximas: 5,
  })
})

test('validarTramos acepta, normaliza y ordena tramos correctos', () => {
  assert.deepEqual(validarTramos([{ inicio: '09:00', fin: '17:00' }]), {
    tramos: [{ inicio: '09:00', fin: '17:00' }],
  })
  // Desordenados: se devuelven ordenados por inicio.
  assert.deepEqual(
    validarTramos([{ inicio: '15:00', fin: '19:00' }, { inicio: '10:00', fin: '13:00' }]),
    { tramos: [{ inicio: '10:00', fin: '13:00' }, { inicio: '15:00', fin: '19:00' }] },
  )
  // Cuatro tramos en punto (el máximo permitido).
  assert.deepEqual(
    validarTramos([
      { inicio: '08:00', fin: '09:00' },
      { inicio: '10:00', fin: '11:00' },
      { inicio: '12:00', fin: '13:00' },
      { inicio: '14:00', fin: '15:00' },
    ]).tramos.length,
    4,
  )
  // 24:00 es un fin válido.
  assert.deepEqual(validarTramos([{ inicio: '23:00', fin: '24:00' }]), {
    tramos: [{ inicio: '23:00', fin: '24:00' }],
  })
  // Tramos contiguos (13:00 justo al acabar el anterior) no se solapan.
  assert.ok(!validarTramos([{ inicio: '09:00', fin: '13:00' }, { inicio: '13:00', fin: '17:00' }]).error)
})

test('validarTramos rechaza horarios inválidos', () => {
  assert.ok(validarTramos([]).error) // vacío
  assert.ok(validarTramos('09:00-17:00').error) // no es un array
  assert.ok(validarTramos([null]).error) // tramo sin horas
  // Más de 4 tramos.
  assert.ok(
    validarTramos([
      { inicio: '08:00', fin: '09:00' },
      { inicio: '10:00', fin: '11:00' },
      { inicio: '12:00', fin: '13:00' },
      { inicio: '14:00', fin: '15:00' },
      { inicio: '16:00', fin: '17:00' },
    ]).error,
  )
  // Solape (aunque vengan desordenados).
  assert.ok(validarTramos([{ inicio: '12:00', fin: '17:00' }, { inicio: '09:00', fin: '13:00' }]).error)
  // Inicio >= fin.
  assert.ok(validarTramos([{ inicio: '17:00', fin: '09:00' }]).error)
  assert.ok(validarTramos([{ inicio: '09:00', fin: '09:00' }]).error)
  // Minutos que no son múltiplos de 15.
  assert.ok(validarTramos([{ inicio: '09:10', fin: '17:00' }]).error)
  // Fuera de rango y formato incorrecto.
  assert.ok(validarTramos([{ inicio: '25:00', fin: '26:00' }]).error)
  assert.ok(validarTramos([{ inicio: '09:00', fin: '24:15' }]).error)
  assert.ok(validarTramos([{ inicio: '9:00', fin: '17:00' }]).error)
  assert.ok(validarTramos([{ inicio: 'nueve', fin: '17:00' }]).error)
})

test('validarHorasMaximas acepta 0-24 y rechaza el resto', () => {
  assert.deepEqual(validarHorasMaximas(5), { horasMaximas: 5 })
  assert.deepEqual(validarHorasMaximas(0), { horasMaximas: 0 })
  assert.deepEqual(validarHorasMaximas(7.5), { horasMaximas: 7.5 })
  assert.deepEqual(validarHorasMaximas(7.25), { horasMaximas: 7.25 })
  assert.deepEqual(validarHorasMaximas(24), { horasMaximas: 24 })
  assert.ok(validarHorasMaximas(-1).error)
  assert.ok(validarHorasMaximas(25).error)
  assert.ok(validarHorasMaximas('5').error)
  assert.ok(validarHorasMaximas(NaN).error)
  assert.ok(validarHorasMaximas(null).error)
})

test('franjasDeTramos genera filas de 60 minutos y acorta la última', () => {
  assert.deepEqual(franjasDeTramos([{ inicio: '09:00', fin: '11:00' }]), [
    { hora: '09:00', minutos: 60 },
    { hora: '10:00', minutos: 60 },
  ])
  // Tramo partido (mañana y tarde) y fracción final de media hora.
  assert.deepEqual(franjasDeTramos([{ inicio: '10:00', fin: '13:00' }, { inicio: '15:00', fin: '19:00' }]), [
    { hora: '10:00', minutos: 60 },
    { hora: '11:00', minutos: 60 },
    { hora: '12:00', minutos: 60 },
    { hora: '15:00', minutos: 60 },
    { hora: '16:00', minutos: 60 },
    { hora: '17:00', minutos: 60 },
    { hora: '18:00', minutos: 60 },
  ])
  // La última fila no llega a 60: se acorta a 30.
  assert.deepEqual(franjasDeTramos([{ inicio: '12:00', fin: '13:30' }]), [
    { hora: '12:00', minutos: 60 },
    { hora: '13:00', minutos: 30 },
  ])
})

test('minutosLaborables suma los minutos de todos los tramos', () => {
  assert.equal(minutosLaborables([{ inicio: '09:00', fin: '17:00' }]), 480)
  assert.equal(minutosLaborables([{ inicio: '10:00', fin: '13:00' }, { inicio: '15:00', fin: '19:00' }]), 420)
  assert.equal(minutosLaborables([{ inicio: '12:00', fin: '13:30' }]), 90)
})

test('semanaLaborable devuelve de lunes a viernes la semana de la fecha', () => {
  const semana = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06']
  // Miércoles.
  assert.deepEqual(semanaLaborable('2026-03-04'), semana)
  // Sábado y domingo: la semana sigue empezando el lunes anterior.
  assert.deepEqual(semanaLaborable('2026-03-07'), semana)
  assert.deepEqual(semanaLaborable('2026-03-08'), semana)
  // Acepta un Date.
  assert.deepEqual(semanaLaborable(new Date(2026, 2, 4)), semana)
  // Cruzando el cambio de mes.
  assert.deepEqual(semanaLaborable('2026-04-01'), ['2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02', '2026-04-03'])
  // Cruzando el cambio de año.
  assert.deepEqual(semanaLaborable('2027-01-01'), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01'])
  // Fecha inválida.
  assert.equal(semanaLaborable('2026-02-30'), null)
})

test('esLaborable distingue los días de diario del fin de semana', () => {
  assert.equal(esLaborable('2026-03-02'), true) // lunes
  assert.equal(esLaborable('2026-03-06'), true) // viernes
  assert.equal(esLaborable('2026-03-07'), false) // sábado
  assert.equal(esLaborable('2026-03-08'), false) // domingo
  assert.equal(esLaborable('2026-02-30'), false) // fecha inexistente
})

test('nombreDia devuelve el nombre del día', () => {
  assert.equal(nombreDia('2026-03-02'), 'Lunes')
  assert.equal(nombreDia('2026-03-06'), 'Viernes')
  assert.equal(nombreDia('2026-03-08'), 'Domingo')
  assert.equal(nombreDia('2026-02-30'), null)
})

test('resumenDia calcula ocupación, exceso y minutos por franja', () => {
  const tramos = [{ inicio: '09:00', fin: '12:00' }] // 180 minutos laborables
  const trabajos = [
    { id: 1, hora: '09:00', minutos: 60 },
    { id: 2, hora: '09:00', minutos: 30 },
    { id: 3, hora: '11:00', minutos: 45 },
  ]
  const resumen = resumenDia({ trabajos, tramos, horasMaximas: 2 }) // máximo 120 minutos
  assert.equal(resumen.laborablesMin, 180)
  assert.equal(resumen.maximoMin, 120)
  assert.equal(resumen.ocupadoMin, 135)
  assert.equal(resumen.libreMin, -15)
  assert.equal(resumen.excedido, true)
  assert.deepEqual(resumen.porFranja, { '09:00': 90, '10:00': 0, '11:00': 45 })
  assert.deepEqual(resumen.fueraDeHorario, [])
})

test('resumenDia sin trabajos y con trabajos fuera de horario', () => {
  const tramos = [{ inicio: '09:00', fin: '11:00' }]
  const vacio = resumenDia({ trabajos: [], tramos, horasMaximas: 5 })
  assert.equal(vacio.ocupadoMin, 0)
  assert.equal(vacio.maximoMin, 300)
  assert.equal(vacio.libreMin, 300)
  assert.equal(vacio.excedido, false)
  assert.deepEqual(vacio.porFranja, { '09:00': 0, '10:00': 0 })
  assert.deepEqual(vacio.fueraDeHorario, [])

  // Un trabajo cuya hora no es ninguna franja del día.
  const conFuera = resumenDia({ trabajos: [{ id: 7, hora: '13:00', minutos: 30 }], tramos, horasMaximas: 5 })
  assert.equal(conFuera.ocupadoMin, 30)
  assert.deepEqual(conFuera.porFranja, { '09:00': 0, '10:00': 0 })
  assert.deepEqual(conFuera.fueraDeHorario, [7])
})


test('inicioPlanificacion: entrada futura, entrada de hoy y entrada pasada', () => {
  const ahora = new Date(2026, 9, 9, 17, 5)
  assert.deepEqual(inicioPlanificacion(new Date(2026, 9, 14, 10, 0), ahora), { fecha: '2026-10-14', reloj: null })
  assert.deepEqual(inicioPlanificacion(new Date(2026, 9, 9, 8, 0), ahora), { fecha: '2026-10-09', reloj: 17 * 60 + 5 })
  assert.deepEqual(inicioPlanificacion(new Date(2026, 9, 1, 8, 0), ahora), { fecha: '2026-10-09', reloj: 17 * 60 + 5 })
  assert.deepEqual(inicioPlanificacion(null, ahora), { fecha: '2026-10-09', reloj: 17 * 60 + 5 })
})
