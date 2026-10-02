// Control de la fecha desde la que cada artículo está sin stock.
//
// Semántica: sinStockDesde guarda el momento en que el artículo pasó a tener
// stock <= 0 (el stock importado del ERP puede ser negativo; aquí el stock es
// solo informativo). Si el artículo tiene existencias (stock > 0) el campo es
// null.

// Calcula el nuevo valor de sinStockDesde a partir del stock resultante y el
// valor actual del artículo. Es una función pura.
// - stock > 0: hay existencias, se devuelve null.
// - stock <= 0: se conserva la fecha anterior si ya había una, o se pone la
//   fecha indicada (por defecto, ahora) si es la primera vez que se queda sin.
export function sinStockDesdeNuevo(stock, actual, ahora = new Date()) {
  if (Number(stock) > 0) return null
  return actual ?? ahora
}

// Al arrancar, rellena la fecha sinStockDesde de los artículos ya existentes:
// - los que están sin stock y no tienen fecha, la ponen a la fecha indicada;
// - los que tienen existencias pero conservan una fecha, la borran.
// Es idempotente: al repetirse no encuentra nada que cambiar. Devuelve cuántos
// artículos se han tocado en total.
export async function rellenarSinStock(prisma, ahora = new Date()) {
  const sinFecha = await prisma.articulo.updateMany({
    where: { stock: { lte: 0 }, sinStockDesde: null },
    data: { sinStockDesde: ahora },
  })
  const conFecha = await prisma.articulo.updateMany({
    where: { stock: { gt: 0 }, sinStockDesde: { not: null } },
    data: { sinStockDesde: null },
  })
  return sinFecha.count + conFecha.count
}
