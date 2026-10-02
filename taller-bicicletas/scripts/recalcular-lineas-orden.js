import prisma from '../server/db.js'
import { precioSinIva } from '../server/lib/precios.js'
import { redondear2, calcularTotales } from '../server/routes/ordenes.js'

// Corrige las líneas de material de las órdenes que se crearon con el error de
// precio: el catálogo importado guarda `Articulo.precioVenta` CON el IVA incluido,
// pero las líneas de orden trabajan con el precio SIN IVA. Se detectan las líneas
// cuyo `precioUnitario` es igual al `precioVenta` actual de su artículo (señal de
// que se aplicó el precio con IVA) y se corrigen al precio sin IVA, recalculando
// sus importes y los totales de cada orden afectada.
//
// Uso: node scripts/recalcular-lineas-orden.js [--dry-run]
//   - Con --dry-run solo se informa de lo que se corregiría, sin escribir nada.

const modoDryRun = process.argv.slice(2).includes('--dry-run')

// Compara dos precios considerando que son iguales si su diferencia es despreciable.
function mismoPrecio(a, b) {
  return Math.abs(Number(a) - Number(b)) < 1e-6
}

// Importes de una línea de material con la misma fórmula que el servidor.
function calcularLinea(linea, precioUnitario) {
  const precioNeto = redondear2(linea.cantidad * precioUnitario * (1 - linea.descuento / 100))
  const importeTotal = redondear2(precioNeto * (1 + linea.iva / 100))
  return { precioNeto, importeTotal }
}

async function recalcular() {
  // Líneas de material con artículo asociado, junto con el artículo y la orden.
  const lineas = await prisma.ordenMaterial.findMany({
    where: { articuloId: { not: null } },
    include: { articulo: true },
    orderBy: { id: 'asc' },
  })

  const correcciones = []
  for (const linea of lineas) {
    if (!linea.articulo) continue
    // Solo se corrigen las líneas cuyo precio unitario es igual al precio de venta
    // con IVA del artículo (huella del error).
    if (!mismoPrecio(linea.precioUnitario, linea.articulo.precioVenta)) continue

    const precioUnitario = precioSinIva(linea.articulo.precioVenta, linea.iva)
    if (mismoPrecio(precioUnitario, linea.precioUnitario)) continue

    const { precioNeto, importeTotal } = calcularLinea(linea, precioUnitario)
    correcciones.push({ linea, precioUnitario, precioNeto, importeTotal })
  }

  const ordenesAfectadas = new Set(correcciones.map((c) => c.linea.ordenId))

  console.log(modoDryRun ? 'Simulación (--dry-run) del recálculo de líneas de orden:' : 'Recálculo de líneas de orden:')
  console.log(`  Líneas a corregir:  ${correcciones.length}`)
  console.log(`  Órdenes afectadas:  ${ordenesAfectadas.size}`)

  if (modoDryRun) {
    for (const c of correcciones) {
      console.log(`    - línea ${c.linea.id} (orden ${c.linea.ordenId}): ${c.linea.precioUnitario} -> ${c.precioUnitario}`)
    }
    console.log('  (No se ha escrito nada en la base de datos.)')
    return
  }

  if (correcciones.length === 0) {
    console.log('  No hay nada que corregir.')
    return
  }

  // Actualiza las líneas y recalcula los totales de cada orden afectada.
  for (const c of correcciones) {
    await prisma.ordenMaterial.update({
      where: { id: c.linea.id },
      data: { precioUnitario: c.precioUnitario, precioNeto: c.precioNeto, importeTotal: c.importeTotal },
    })
  }

  for (const ordenId of ordenesAfectadas) {
    const orden = await prisma.ordenReparacion.findUnique({
      where: { id: ordenId },
      include: { materiales: true, manoObra: true },
    })
    if (!orden) continue
    const totales = calcularTotales(orden.materiales, orden.manoObra, orden.descuentoGlobal)
    await prisma.ordenReparacion.update({ where: { id: ordenId }, data: totales })
  }

  console.log(`  Líneas corregidas:  ${correcciones.length}`)
  console.log(`  Órdenes corregidas: ${ordenesAfectadas.size}`)
}

recalcular()
  .catch((error) => {
    console.error('Error al recalcular las líneas de orden:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
