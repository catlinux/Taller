// Estados de las órdenes de reparación y utilidades de normalización.

// Estados válidos de una orden (valor interno), en el orden del flujo de trabajo.
export const ESTADOS_ORDEN = [
  'Admision',
  'EnReparacion',
  'EnPausa',
  'EsperandoMaterial',
  'Finalizada',
  'Entregada',
  'Biomecanica',
]

// Estados antiguos que hay que convertir al valor nuevo equivalente.
export const ESTADOS_LEGADO = {
  Presupuesto: 'Admision',
  Pendiente: 'EnPausa',
}

// Normaliza un estado: los legados pasan a su valor nuevo, y el resto (válidos o
// desconocidos) se devuelven tal cual.
export function normalizarEstado(valor) {
  return Object.prototype.hasOwnProperty.call(ESTADOS_LEGADO, valor) ? ESTADOS_LEGADO[valor] : valor
}

// Migra al arrancar (y tras cambiar de base o restaurar una copia) los estados
// antiguos de las órdenes existentes. Es idempotente: devuelve cuántas filas
// cambió y solo avisa por consola si ha cambiado alguna.
export async function migrarEstados(prisma) {
  const aAdmision = await prisma.ordenReparacion.updateMany({
    where: { estado: 'Presupuesto' },
    data: { estado: 'Admision' },
  })
  const aEnPausa = await prisma.ordenReparacion.updateMany({
    where: { estado: 'Pendiente' },
    data: { estado: 'EnPausa' },
  })
  const total = aAdmision.count + aEnPausa.count
  if (total > 0) console.log(`Órdenes migradas a los nuevos estados: ${total}`)
  return total
}
