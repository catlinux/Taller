import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aDesplazamiento, aReloj, insertar, primerHueco, redimensionar, mover, quitar, vaciarDia,
} from './planificador.js'

const H = (h, m = 0) => h * 60 + m
const LUN = '2026-10-12'
const MAR = '2026-10-13'
const MIE = '2026-10-14'
const VIE = '2026-10-16'
const LUN2 = '2026-10-19'

// Horario 09:00–13:00 y 15:00–17:00 (L = 360), máximo 5 h (C = 300).
const TRAMOS = [{ inicio: '09:00', fin: '13:00' }, { inicio: '15:00', fin: '17:00' }]
const calendario = (extra = {}) => (fecha) => ({ tramos: TRAMOS, maxMin: 300, cerrado: null, ...(extra[fecha] ?? {}) })

let siguienteId = 1
const bloque = (trabajoId, inicio, minutos, extra = {}) => ({ id: siguienteId++, trabajoId, inicio, minutos, forzado: false, ...extra })
const relojDe = (r) => `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`

// Aplica un resultado a las colas (como haría la base de datos).
function aplicar(colas, r) {
  const todos = new Map()
  for (const [fecha, lista] of Object.entries(colas)) for (const b of lista) todos.set(b.id, { ...b, fecha })
  for (const id of r.borrar) todos.delete(id)
  for (const a of r.actualizar) todos.set(a.id, { ...todos.get(a.id), ...a })
  for (const c of r.crear) todos.set(`n${siguienteId++}`, { id: siguienteId, ...c })
  const salida = {}
  for (const b of todos.values()) (salida[b.fecha] ??= []).push({ id: b.id, trabajoId: b.trabajoId, inicio: b.inicio, minutos: b.minutos, forzado: b.forzado })
  for (const f of Object.keys(salida)) salida[f].sort((a, b) => a.inicio - b.inicio)
  return salida
}
const resumen = (colas, fecha) => (colas[fecha] ?? []).map((b) => `${b.trabajoId}@${relojDe(b.inicio)}+${b.minutos}${b.forzado ? '!' : ''}`)

test('conversiones: aDesplazamiento y aReloj saltan la pausa', () => {
  assert.equal(aDesplazamiento(TRAMOS, H(9)), 0)
  assert.equal(aDesplazamiento(TRAMOS, H(12, 30)), 210)
  assert.equal(aDesplazamiento(TRAMOS, H(14)), 240)
  assert.equal(aDesplazamiento(TRAMOS, H(15, 30)), 270)
  assert.equal(aDesplazamiento(TRAMOS, H(20)), 360)
  assert.equal(aDesplazamiento(TRAMOS, H(8)), 0)
  assert.equal(aReloj(TRAMOS, 240), H(15))
  assert.equal(aReloj(TRAMOS, 240, { fin: true }), H(13))
  assert.equal(aReloj(TRAMOS, 270, { fin: true }), H(15, 30))
})

test('caso 1: tres de 20 min, uno tras otro, a las 09:00, 09:20 y 09:40', () => {
  let colas = {}
  for (const [trabajo, x] of [[1, 0], [2, 20], [3, 40]]) {
    colas = aplicar(colas, insertar({ calendario: calendario(), colas, fecha: LUN, x, minutos: 20, trabajoId: trabajo }))
  }
  assert.deepEqual(resumen(colas, LUN), ['1@09:00+20', '2@09:20+20', '3@09:40+20'])
})

test('caso 2: un clic a las 09:10 entra a las 09:20 y empuja a los demás', () => {
  const colas = { [LUN]: [bloque(1, H(9), 20), bloque(2, H(9, 20), 20), bloque(3, H(9, 40), 20)] }
  const r = insertar({ calendario: calendario(), colas, fecha: LUN, x: 10, minutos: 20, trabajoId: 4 })
  assert.deepEqual(resumen(aplicar(colas, r), LUN), ['1@09:00+20', '4@09:20+20', '2@09:40+20', '3@10:00+20'])
})

test('caso 3: un trabajo de 60 min tras dos de 15 min es un solo bloque de 09:30 a 10:30', () => {
  const colas = { [LUN]: [bloque(1, H(9), 15), bloque(2, H(9, 15), 15)] }
  const r = insertar({ calendario: calendario(), colas, fecha: LUN, x: 30, minutos: 60, trabajoId: 3 })
  assert.equal(r.crear.length, 1)
  assert.equal(r.crear[0].inicio, H(9, 30))
  assert.equal(r.crear[0].minutos, 60)
  assert.equal(aReloj(TRAMOS, 30 + 60, { fin: true }), H(10, 30))
})

test('caso 4: 60 min a las 12:30 son un bloque que cruza la pausa y acaba a las 15:30', () => {
  const r = insertar({ calendario: calendario(), colas: {}, fecha: LUN, x: aDesplazamiento(TRAMOS, H(12, 30)), minutos: 60, trabajoId: 1 })
  assert.equal(r.crear.length, 1)
  assert.equal(r.crear[0].inicio, H(12, 30))
  assert.equal(aReloj(TRAMOS, 210 + 60, { fin: true }), H(15, 30))
})

const diaLleno = () => ({ [LUN]: [bloque(1, H(9), 270)] }) // 4 h 30 seguidas

test('caso 5: pasarse de la capacidad sin desborde pide decisión y no cambia nada', () => {
  const r = insertar({ calendario: calendario(), colas: diaLleno(), fecha: LUN, x: 270, minutos: 60, trabajoId: 2 })
  assert.deepEqual(r, { requiereDecision: true, excesoMin: 30, fecha: LUN })
})

test('caso 6: «siguiente» deja 30 min hoy y 30 min mañana a las 09:00 y desplaza la cola de mañana', () => {
  const colas = { ...diaLleno(), [MAR]: [bloque(9, H(9), 60)] }
  const r = insertar({ calendario: calendario(), colas, fecha: LUN, x: 270, minutos: 60, trabajoId: 2, desborde: 'siguiente' })
  const despues = aplicar(colas, r)
  assert.deepEqual(resumen(despues, LUN), ['1@09:00+270', '2@15:30+30'])
  assert.deepEqual(resumen(despues, MAR), ['2@09:00+30', '9@09:30+60'])
})

test('caso 7: en viernes la parte 2/2 cae el lunes', () => {
  const colas = { [VIE]: [bloque(1, H(9), 270)] }
  const r = insertar({ calendario: calendario(), colas, fecha: VIE, x: 270, minutos: 60, trabajoId: 2, desborde: 'siguiente' })
  const despues = aplicar(colas, r)
  assert.deepEqual(resumen(despues, VIE), ['1@09:00+270', '2@15:30+30'])
  assert.deepEqual(resumen(despues, LUN2), ['2@09:00+30'])
})

test('caso 8: «forzar» deja un bloque de 60 min con forzado', () => {
  const colas = diaLleno()
  const r = insertar({ calendario: calendario(), colas, fecha: LUN, x: 270, minutos: 60, trabajoId: 2, desborde: 'forzar' })
  assert.deepEqual(r.crear, [{ trabajoId: 2, fecha: LUN, inicio: H(15, 30), minutos: 60, forzado: true }])
})

test('caso 9: «forzar» pasado el horario manda lo que pasa de las 17:00 al día siguiente', () => {
  const colas = { [LUN]: [bloque(1, H(9), 300)] } // acaba a las 16:00
  const r = insertar({ calendario: calendario(), colas, fecha: LUN, x: 300, minutos: 90, trabajoId: 2, desborde: 'forzar' })
  const despues = aplicar(colas, r)
  assert.deepEqual(resumen(despues, LUN), ['1@09:00+300', '2@16:00+60!'])
  assert.deepEqual(resumen(despues, MAR), ['2@09:00+30'])
})

test('caso 10: cascada, si el día siguiente también está lleno lo sobrante sigue al tercer día', () => {
  const colas = { ...diaLleno(), [MAR]: [bloque(9, H(9), 300)] }
  const r = insertar({ calendario: calendario(), colas, fecha: LUN, x: 270, minutos: 60, trabajoId: 2, desborde: 'siguiente' })
  const despues = aplicar(colas, r)
  assert.deepEqual(resumen(despues, LUN), ['1@09:00+270', '2@15:30+30'])
  assert.deepEqual(resumen(despues, MAR), ['2@09:00+30', '9@09:30+270'])
  assert.deepEqual(resumen(despues, MIE), ['9@09:00+30'])
})

test('caso 11: primerHueco hoy a las 11:07 busca desde las 11:15', () => {
  const r = primerHueco({ calendario: calendario(), colas: {}, fecha: LUN, reloj: H(11, 7), minutos: 30, trabajoId: 1 })
  assert.deepEqual(r.crear, [{ trabajoId: 1, fecha: LUN, inicio: H(11, 15), minutos: 30, forzado: false }])
})

test('caso 12: primerHueco salta el hueco de 20 min y usa el siguiente donde cabe', () => {
  const colas = { [LUN]: [bloque(1, H(9), 60), bloque(2, H(10, 20), 60)] } // hueco 10:00-10:20
  const r = primerHueco({ calendario: calendario(), colas, fecha: LUN, minutos: 45, trabajoId: 3 })
  assert.deepEqual(r.crear, [{ trabajoId: 3, fecha: LUN, inicio: H(11, 20), minutos: 45, forzado: false }])
})

test('caso 12b: sin hueco donde quepa entero usa el final del día y parte lo que no cabe al día siguiente', () => {
  const colas = { [LUN]: [bloque(1, H(9), 60), bloque(2, H(10, 20), 60), bloque(4, H(11, 20), 120)] }
  // Ocupado 240 de C = 300 -> quedan 60 min de capacidad.
  const r = primerHueco({ calendario: calendario(), colas, fecha: LUN, minutos: 90, trabajoId: 3 })
  assert.equal(r.crear.length, 2)
  assert.deepEqual(r.crear[0], { trabajoId: 3, fecha: LUN, inicio: H(15, 20), minutos: 60, forzado: false })
  assert.deepEqual(r.crear[1], { trabajoId: 3, fecha: MAR, inicio: H(9), minutos: 30, forzado: false })
})

test('caso 13: redimensionar, crecer empuja y decrecer recorta y borra los que quedan a 0', () => {
  const colas = { [LUN]: [bloque(1, H(9), 30), bloque(2, H(9, 30), 30)] }
  const crece = redimensionar({ calendario: calendario(), colas, trabajoId: 1, minutos: 60 })
  assert.deepEqual(resumen(aplicar(colas, crece), LUN), ['1@09:00+60', '2@10:00+30'])

  const partido = { [LUN]: [bloque(1, H(9), 30)], [MAR]: [bloque(1, H(9), 20)] }
  const decrece = redimensionar({ calendario: calendario(), colas: partido, trabajoId: 1, minutos: 40 })
  const despues = aplicar(partido, decrece)
  assert.deepEqual(resumen(despues, LUN), ['1@09:00+30'])
  assert.deepEqual(resumen(despues, MAR), ['1@09:00+10'])

  const mucho = redimensionar({ calendario: calendario(), colas: partido, trabajoId: 1, minutos: 25 })
  assert.equal(mucho.borrar.length, 1)
  assert.deepEqual(resumen(aplicar(partido, mucho), LUN), ['1@09:00+25'])
})

test('caso 13b: crecer más allá del día pide decisión y con «siguiente» se parte', () => {
  const colas = { [LUN]: [bloque(1, H(9), 270)] }
  const pide = redimensionar({ calendario: calendario(), colas, trabajoId: 1, minutos: 330 })
  assert.deepEqual(pide, { requiereDecision: true, excesoMin: 30, fecha: LUN })
  const r = redimensionar({ calendario: calendario(), colas, trabajoId: 1, minutos: 330, desborde: 'siguiente' })
  const despues = aplicar(colas, r)
  assert.deepEqual(resumen(despues, LUN), ['1@09:00+300'])
  assert.deepEqual(resumen(despues, MAR), ['1@09:00+30'])
})

test('caso 14: un día con maxMin = 0 se salta en «siguiente» y en primerHueco', () => {
  const cal = calendario({ [MAR]: { maxMin: 0 } })
  const colas = diaLleno()
  const r = insertar({ calendario: cal, colas, fecha: LUN, x: 270, minutos: 60, trabajoId: 2, desborde: 'siguiente' })
  assert.deepEqual(resumen(aplicar(colas, r), MIE), ['2@09:00+30'])
  const h = primerHueco({ calendario: cal, colas: {}, fecha: MAR, minutos: 30, trabajoId: 1 })
  assert.equal(h.crear[0].fecha, MIE)
})

test('caso 15: un día cerrado se salta y no admite insertar', () => {
  const cal = calendario({ [MAR]: { cerrado: 'vacaciones' } })
  const r = insertar({ calendario: cal, colas: diaLleno(), fecha: LUN, x: 270, minutos: 60, trabajoId: 2, desborde: 'siguiente' })
  assert.equal(r.crear[0].fecha, LUN)
  assert.equal(r.crear[1].fecha, MIE)
  const h = primerHueco({ calendario: cal, colas: {}, fecha: MAR, minutos: 30, trabajoId: 1 })
  assert.equal(h.crear[0].fecha, MIE)
  const festivo = calendario({ [MAR]: { cerrado: 'festivo' } })
  assert.throws(() => insertar({ calendario: festivo, colas: {}, fecha: MAR, x: 0, minutos: 30, trabajoId: 1 }), /El día está cerrado: festivo/)
})

test('caso 16: vaciarDia pasa los bloques al principio del siguiente día abierto, en orden y en cascada', () => {
  const colas = {
    [LUN]: [bloque(1, H(9), 60), bloque(2, H(10), 120)],
    [MAR]: [bloque(9, H(9), 200)],
  }
  const cal = calendario({ [LUN]: { cerrado: 'festivo' } })
  const r = vaciarDia({ calendario: cal, colas, fecha: LUN })
  const despues = aplicar(colas, r)
  assert.deepEqual(resumen(despues, LUN), [])
  assert.deepEqual(resumen(despues, MAR), ['1@09:00+60', '2@10:00+120', '9@12:00+120'])
  assert.deepEqual(resumen(despues, MIE), ['9@09:00+80'])
})

test('mover: quita el trabajo y lo inserta en el destino; quitar borra sus bloques', () => {
  const colas = { [LUN]: [bloque(1, H(9), 30), bloque(2, H(9, 30), 60)] }
  const r = mover({ calendario: calendario(), colas, trabajoId: 2, fecha: MAR, x: 0 })
  const despues = aplicar(colas, r)
  assert.deepEqual(resumen(despues, LUN), ['1@09:00+30'])
  assert.deepEqual(resumen(despues, MAR), ['2@09:00+60'])
  assert.deepEqual(quitar({ colas, trabajoId: 1 }).borrar, [colas[LUN][0].id])
})

test('mover dentro del mismo día no se empuja a sí mismo', () => {
  const colas = { [LUN]: [bloque(1, H(9), 30), bloque(2, H(9, 30), 30)] }
  const r = mover({ calendario: calendario(), colas, trabajoId: 1, fecha: LUN, x: 60 })
  assert.deepEqual(resumen(aplicar(colas, r), LUN), ['2@09:30+30', '1@10:00+30'])
})

test('los trozos contiguos de un mismo trabajo en un día se fusionan', () => {
  const colas = { [LUN]: [bloque(1, H(9), 270)], [MAR]: [bloque(2, H(9), 30)] }
  // El trabajo 2 crece 30 min más: se parte hoy y la parte 2 se junta con la de mañana.
  const base = { [LUN]: [bloque(1, H(9), 270), bloque(2, H(15, 30), 30)], [MAR]: [bloque(2, H(9), 30)] }
  const r = redimensionar({ calendario: calendario(), colas: base, trabajoId: 2, minutos: 90, desborde: 'siguiente' })
  const despues = aplicar(base, r)
  assert.deepEqual(resumen(despues, LUN), ['1@09:00+270', '2@15:30+30'])
  assert.deepEqual(resumen(despues, MAR), ['2@09:00+60'])
  assert.ok(colas)
})

test('sin hueco en 260 días laborables da error', () => {
  const cal = () => ({ tramos: TRAMOS, maxMin: 0, cerrado: null })
  assert.throws(() => primerHueco({ calendario: cal, colas: {}, fecha: LUN, minutos: 30 }), /260/)
})
