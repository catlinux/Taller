// Forma de pago de una orden de reparación (campo único tras unificar los
// antiguos formaPago y estadoPago).

// Valores válidos del campo formaPago de una orden.
export const FORMAS_PAGO = ['Pendiente', 'Parcial', 'Efectivo', 'Tarjeta', 'Bizum', 'Transferencia']

// Formas de pago "de verdad" (cobrado): las que se conservan tal cual.
const FORMAS_PAGO_COBRADAS = ['Efectivo', 'Tarjeta', 'Transferencia', 'Bizum']

// Normaliza un valor de texto: recorta espacios y convierte la cadena vacía en null.
function normalizar(valor) {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim()
  return limpio === '' ? null : limpio
}

// Combina la antigua forma de pago y el antiguo estado de pago en un único valor
// de formaPago. Es una función pura (no toca la base de datos).
export function formaPagoUnificada(formaPago, estadoPago) {
  const forma = normalizar(formaPago)
  const estado = normalizar(estadoPago)

  if (estado === 'Pendiente') return 'Pendiente'
  if (estado === 'Parcial') return 'Parcial'
  if (estado === 'Pagado') {
    if (FORMAS_PAGO_COBRADAS.includes(forma)) return forma
    if (forma === 'Financiado') return 'Transferencia'
    if (forma === null) return 'Efectivo'
    return 'Transferencia'
  }

  // Sin estado de pago antiguo: se conserva la forma si ya es válida.
  if (FORMAS_PAGO.includes(forma)) return forma
  // Y se normalizan las formas antiguas o desconocidas.
  if (forma === 'Financiado') return 'Transferencia'
  if (forma !== null) return 'Pendiente'
  // Ambos campos vacíos: la orden se queda sin indicar.
  return null
}

// Migra las órdenes antiguas al nuevo campo único formaPago. Es idempotente:
// las órdenes ya migradas no se vuelven a tocar.
export async function migrarPagos(prisma) {
  // 1) Órdenes con estado de pago antiguo: se unifica en formaPago y se anula estadoPago.
  const conEstado = await prisma.ordenReparacion.findMany({
    where: { estadoPago: { not: null } },
    select: { id: true, formaPago: true, estadoPago: true },
  })
  for (const orden of conEstado) {
    const formaPago = formaPagoUnificada(orden.formaPago, orden.estadoPago)
    await prisma.ordenReparacion.update({
      where: { id: orden.id },
      data: { formaPago, estadoPago: null },
    })
  }

  // 2) Órdenes sin estado de pago pero con una forma antigua o desconocida:
  // se normalizan a 'Transferencia'.
  const conFormaInvalida = await prisma.ordenReparacion.findMany({
    where: { estadoPago: null, formaPago: { not: null, notIn: FORMAS_PAGO } },
    select: { id: true },
  })
  for (const orden of conFormaInvalida) {
    await prisma.ordenReparacion.update({
      where: { id: orden.id },
      data: { formaPago: 'Transferencia' },
    })
  }

  return conEstado.length + conFormaInvalida.length
}
