import test from 'node:test'
import assert from 'node:assert/strict'
import { sinStockDesdeNuevo, rellenarSinStock } from './stock.js'

// Pruebas del cálculo de la fecha desde la que un artículo está sin stock.

test('un stock positivo deja sinStockDesde a null', () => {
  assert.equal(sinStockDesdeNuevo(5, new Date('2020-01-01')), null)
  assert.equal(sinStockDesdeNuevo(0.5, null), null)
})

test('un stock de cero sin fecha previa usa la fecha indicada', () => {
  const ahora = new Date('2026-02-10T09:00:00Z')
  assert.equal(sinStockDesdeNuevo(0, null, ahora), ahora)
})

test('un stock negativo sin fecha previa usa la fecha indicada', () => {
  const ahora = new Date('2026-02-10T09:00:00Z')
  assert.equal(sinStockDesdeNuevo(-313.683, null, ahora), ahora)
})

test('un artículo ya sin stock conserva su fecha anterior', () => {
  const anterior = new Date('2025-06-01T00:00:00Z')
  const ahora = new Date('2026-02-10T09:00:00Z')
  assert.equal(sinStockDesdeNuevo(0, anterior, ahora), anterior)
  assert.equal(sinStockDesdeNuevo(-2, anterior, ahora), anterior)
})

test('sin argumento de fecha, se usa la fecha actual', () => {
  const antes = Date.now()
  const resultado = sinStockDesdeNuevo(0, null)
  assert.ok(resultado instanceof Date)
  assert.ok(resultado.getTime() >= antes && resultado.getTime() <= Date.now())
})

// Prisma de mentira que solo registra las llamadas a updateMany y devuelve un
// número de afectados fijo, para comprobar el recuento de rellenarSinStock.
function prismaFalso(cuentas) {
  const llamadas = []
  return {
    llamadas,
    articulo: {
      updateMany: async (args) => {
        llamadas.push(args)
        return { count: cuentas[llamadas.length - 1] ?? 0 }
      },
    },
  }
}

test('rellenarSinStock pone fecha a los que están sin stock y quita la de los que la tienen', async () => {
  const prisma = prismaFalso([3, 1])
  const ahora = new Date('2026-02-10T09:00:00Z')
  const total = await rellenarSinStock(prisma, ahora)

  assert.equal(total, 4)
  assert.equal(prisma.llamadas.length, 2)
  assert.deepEqual(prisma.llamadas[0], {
    where: { stock: { lte: 0 }, sinStockDesde: null },
    data: { sinStockDesde: ahora },
  })
  assert.deepEqual(prisma.llamadas[1], {
    where: { stock: { gt: 0 }, sinStockDesde: { not: null } },
    data: { sinStockDesde: null },
  })
})

test('rellenarSinStock es idempotente cuando no hay nada que cambiar', async () => {
  const prisma = prismaFalso([0, 0])
  assert.equal(await rellenarSinStock(prisma), 0)
})
