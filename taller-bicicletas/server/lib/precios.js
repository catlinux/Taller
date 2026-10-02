// Cálculos de precios compartidos entre las rutas y los scripts de mantenimiento.

// Redondeo decimal exacto a 4 decimales (mismo criterio que redondear2 de ordenes.js).
// Evita los errores de coma flotante del redondeo con EPSILON en importes grandes.
function redondear4(value) {
  const escalado = Number(`${Number(value.toFixed(8))}e4`)
  return (Number.isFinite(escalado) ? Math.round(escalado) : Math.round(value * 10000)) / 10000
}

// Devuelve el precio sin IVA a partir de un precio de venta que ya lleva el IVA
// incluido (como el del catálogo importado del ERP). Redondea a 4 decimales:
// 13,25 con IVA 21 % -> 10,9504.
export function precioSinIva(precioVenta, iva) {
  const base = Number(precioVenta)
  const tipo = Number(iva)
  if (!Number.isFinite(base) || !Number.isFinite(tipo)) return base
  const factor = 1 + tipo / 100
  if (factor === 0) return base
  return redondear4(base / factor)
}
