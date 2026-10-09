import test from 'node:test'
import assert from 'node:assert/strict'
import { bloquesDeTrabajosAntiguos, migrarAgenda } from './agendaMigracion.js'

const t = (id, fecha, hora, minutos, posicion = 0) => ({ id, fecha, hora, minutos, posicion })

test('los trabajos de una misma hora se encadenan por posición', () => {
  const r = bloquesDeTrabajosAntiguos([t(2, '2026-10-12', '09:00', 30, 1), t(1, '2026-10-12', '09:00', 20, 0)])
  assert.deepEqual(r.map((b) => [b.trabajoId, b.inicio, b.minutos]), [[1, 540, 20], [2, 560, 30]])
})

test('si lo acumulado de una hora tapa a la siguiente se empuja en cascada', () => {
  const r = bloquesDeTrabajosAntiguos([t(1, '2026-10-12', '09:00', 90), t(2, '2026-10-12', '10:00', 30), t(3, '2026-10-12', '11:00', 30)])
  assert.deepEqual(r.map((b) => [b.trabajoId, b.inicio]), [[1, 540], [2, 630], [3, 660]])
})

test('los días se tratan por separado y no pasan al día siguiente', () => {
  const r = bloquesDeTrabajosAntiguos([t(1, '2026-10-12', '16:00', 300), t(2, '2026-10-13', '09:00', 30)])
  assert.deepEqual(r.map((b) => [b.trabajoId, b.fecha, b.inicio]), [[1, '2026-10-12', 960], [2, '2026-10-13', 540]])
})

test('se ignoran los trabajos sin fecha u hora válidas', () => {
  assert.deepEqual(bloquesDeTrabajosAntiguos([t(1, '', '09:00', 30), t(2, '2026-10-12', 'xx', 30)]), [])
})

test('migrarAgenda es idempotente: solo crea bloques para los trabajos sin ellos', async () => {
  const trabajos = [t(1, '2026-10-12', '09:00', 30), t(2, '2026-10-12', '09:00', 30, 1)]
  const bloques = []
  const prisma = {
    agendaTrabajo: { findMany: async () => trabajos.filter((x) => !bloques.some((b) => b.trabajoId === x.id)) },
    agendaBloque: { createMany: async ({ data }) => { bloques.push(...data) } },
  }
  assert.equal(await migrarAgenda(prisma), 2)
  assert.equal(await migrarAgenda(prisma), 0)
  assert.equal(bloques.length, 2)
})
