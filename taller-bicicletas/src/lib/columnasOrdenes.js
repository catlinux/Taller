// Definición ÚNICA de las columnas del listado de órdenes para las tres
// exportaciones (Excel, CSV y PDF). Cambiar aquí el formato afecta a todas.
//
// Versión PROVISIONAL: el formato definitivo de CSV/XLS/PDF lo fijará el
// cliente más adelante; por eso la definición vive en un solo fichero.
//
// Cada columna es: { clave, titulo, ancho (Excel, en caracteres), tipo, valor }.
// `tipo` es 'texto' | 'fecha' | 'numero'. `valor(fila)` devuelve el valor bruto
// (texto, fecha ISO o número); cada exportador lo presenta según su tipo.

import { etiquetaEstado, etiquetaTipo } from './ordenes.js'

export const columnasExportacionOrdenes = [
  { clave: 'numeroOrden', titulo: 'Nº orden', ancho: 14, tipo: 'texto', valor: (o) => o.numeroOrden ?? '' },
  { clave: 'fechaEntrada', titulo: 'Fecha entrada', ancho: 14, tipo: 'fecha', valor: (o) => o.fechaEntrada ?? '' },
  { clave: 'fechaPrevista', titulo: 'Fecha prevista', ancho: 14, tipo: 'fecha', valor: (o) => o.fechaPrevista ?? '' },
  { clave: 'estado', titulo: 'Estado', ancho: 18, tipo: 'texto', valor: (o) => etiquetaEstado(o.estado) },
  { clave: 'formaPago', titulo: 'Pago', ancho: 14, tipo: 'texto', valor: (o) => o.formaPago ?? '' },
  { clave: 'tipoReparacion', titulo: 'Tipo', ancho: 26, tipo: 'texto', valor: (o) => etiquetaTipo(o.tipoReparacion) },
  { clave: 'garantia', titulo: 'Garantía', ancho: 10, tipo: 'texto', valor: (o) => (o.garantia ? 'Sí' : 'No') },
  { clave: 'numeroCliente', titulo: 'Nº cliente', ancho: 11, tipo: 'texto', valor: (o) => o.cliente?.numeroCliente ?? '' },
  { clave: 'cliente', titulo: 'Cliente', ancho: 26, tipo: 'texto', valor: (o) => [o.cliente?.nombre, o.cliente?.apellidos].filter(Boolean).join(' ') },
  { clave: 'telefono', titulo: 'Teléfono', ancho: 16, tipo: 'texto', valor: (o) => o.cliente?.telefono ?? '' },
  { clave: 'bici', titulo: 'Bici', ancho: 22, tipo: 'texto', valor: (o) => (o.bicicleta ? [o.bicicleta.marca, o.bicicleta.modelo].filter(Boolean).join(' ') : '') },
  { clave: 'numeroSerie', titulo: 'Nº serie', ancho: 18, tipo: 'texto', valor: (o) => o.bicicleta?.numeroSerie ?? '' },
  { clave: 'mecanico', titulo: 'Mecánico', ancho: 20, tipo: 'texto', valor: (o) => o.mecanico?.nombre ?? '' },
  { clave: 'total', titulo: 'Total', ancho: 12, tipo: 'numero', valor: (o) => (Number.isFinite(Number(o.total)) ? Number(o.total) : 0) },
]
