import test from 'node:test'
import assert from 'node:assert/strict'
import { ESTADOS_ORDEN, ESTADOS_LEGADO, normalizarEstado, migrarEstados } from './estados.js'

// Prisma falso: guarda las órdenes en memoria, registra cada updateMany y aplica
// los cambios igual que el cliente real, para poder comprobar la idempotencia.
function prismaFalso(estados) {
  const ordenes = estados.map((estado) => ({ estado }))
  const llamadas = []
  return {
    ordenes,
    llamadas,
    ordenReparacion: {
      updateMany: async ({ where, data }) => {
        llamadas.push({ where, data })
        let count = 0
        for (const orden of ordenes) {
          if (orden.estado === where.estado) {
            orden.estado = data.estado
            count += 1
          }
        }
        return { count }
      },
    },
  }
}

test('ESTADOS_ORDEN es la lista nueva en el orden indicado', () => {
  assert.deepEqual(ESTADOS_ORDEN, ['Admision', 'EnReparacion', 'EnPausa', 'EsperandoMaterial', 'Finalizada', 'Entregada', 'Biomecanica'])
})

test('ESTADOS_LEGADO mapea los estados antiguos a los nuevos', () => {
  assert.deepEqual(ESTADOS_LEGADO, { Presupuesto: 'Admision', Pendiente: 'EnPausa' })
})

test('normalizarEstado migra los legados y respeta los válidos y desconocidos', () => {
  assert.equal(normalizarEstado('Presupuesto'), 'Admision')
  assert.equal(normalizarEstado('Pendiente'), 'EnPausa')
  assert.equal(normalizarEstado('EnReparacion'), 'EnReparacion')
  assert.equal(normalizarEstado('Biomecanica'), 'Biomecanica')
  assert.equal(normalizarEstado('Desconocido'), 'Desconocido')
})

test('migrarEstados pasa los legados a los nuevos estados', async () => {
  const prisma = prismaFalso(['Presupuesto', 'Presupuesto', 'Pendiente', 'Finalizada'])
  const migradas = await migrarEstados(prisma)
  assert.equal(migradas, 3)
  assert.deepEqual(prisma.ordenes.map((orden) => orden.estado), ['Admision', 'Admision', 'EnPausa', 'Finalizada'])
})

test('migrarEstados es idempotente: la segunda llamada no cambia nada', async () => {
  const prisma = prismaFalso(['Presupuesto', 'Pendiente'])
  assert.equal(await migrarEstados(prisma), 2)
  assert.equal(await migrarEstados(prisma), 0)
  assert.deepEqual(prisma.ordenes.map((orden) => orden.estado), ['Admision', 'EnPausa'])
})
