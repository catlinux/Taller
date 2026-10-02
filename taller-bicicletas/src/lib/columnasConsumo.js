// Definición ÚNICA de las columnas del listado de «Artículos – Consumo» para las
// exportaciones (Excel y CSV). Cambiar aquí el formato afecta a las dos.
//
// Cada columna es: { clave, titulo, ancho (Excel, en caracteres), tipo, valor }.
//   - tipo 'texto'  → texto tal cual (los recuentos se muestran sin decimales).
//   - tipo 'numero' → importe/cantidad con dos decimales en el CSV.
//   - tipo 'fecha'  → fecha formateada en el CSV.
// Cuando hay desglose por periodo se añade una columna numérica por cada periodo
// (con su etiqueta como título).

const aNumero = (valor) => {
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : 0
}

// Columnas fijas del listado (independientes del desglose).
const COLUMNAS_BASE = [
  { clave: 'referencia', titulo: 'Referencia', ancho: 18, tipo: 'texto', valor: (fila) => fila.referencia ?? '' },
  { clave: 'descripcion', titulo: 'Descripción', ancho: 44, tipo: 'texto', valor: (fila) => fila.descripcion ?? '' },
  { clave: 'familia', titulo: 'Familia', ancho: 22, tipo: 'texto', valor: (fila) => fila.familia ?? '' },
  { clave: 'cantidad', titulo: 'Cantidad', ancho: 12, tipo: 'numero', valor: (fila) => aNumero(fila.cantidad) },
  // Recuento entero: en el CSV se escribe como texto para no añadir decimales.
  { clave: 'ordenes', titulo: 'Órdenes', ancho: 10, tipo: 'texto', valor: (fila) => aNumero(fila.ordenes) },
  { clave: 'importe', titulo: 'Importe sin IVA', ancho: 14, tipo: 'numero', valor: (fila) => aNumero(fila.importe) },
  { clave: 'coste', titulo: 'Coste estimado', ancho: 14, tipo: 'numero', valor: (fila) => aNumero(fila.coste) },
]

// Devuelve las columnas de exportación. `periodos` = [{ clave, etiqueta }]; cada
// periodo añade una columna numérica con la cantidad consumida en ese periodo.
export function columnasExportacionConsumo(periodos = []) {
  const columnasPeriodo = (periodos || []).map((periodo) => ({
    clave: `periodo:${periodo.clave}`,
    titulo: `Consumo ${periodo.etiqueta}`,
    ancho: 12,
    tipo: 'numero',
    valor: (fila) => aNumero(fila.porPeriodo?.[periodo.clave]),
  }))
  return [...COLUMNAS_BASE, ...columnasPeriodo]
}
