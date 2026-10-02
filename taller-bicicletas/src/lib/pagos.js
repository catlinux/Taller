// Formas de pago de una orden: valor interno, etiqueta visible y clases de la
// insignia. Los colores siguen las clases semánticas de la app (funcionan en
// modo claro y oscuro porque index.css las ajusta).
export const FORMAS_PAGO = [
  { valor: 'Pendiente', etiqueta: 'Pendiente', clase: 'bg-naranja-500/10 text-naranja-300' },
  { valor: 'Parcial', etiqueta: 'Parcial', clase: 'bg-amber-500/10 text-amber-300' },
  { valor: 'Efectivo', etiqueta: 'Efectivo', clase: 'bg-emerald-500/10 text-emerald-300' },
  { valor: 'Tarjeta', etiqueta: 'Tarjeta', clase: 'bg-emerald-500/10 text-emerald-300' },
  { valor: 'Bizum', etiqueta: 'Bizum', clase: 'bg-emerald-500/10 text-emerald-300' },
  { valor: 'Transferencia', etiqueta: 'Transferencia', clase: 'bg-emerald-500/10 text-emerald-300' },
]

// Devuelve la información (valor, etiqueta y clase) de una forma de pago.
export function formaPagoInfo(valor) {
  return FORMAS_PAGO.find((forma) => forma.valor === valor) || { valor, etiqueta: valor || '—', clase: 'bg-slate-500/10 text-slate-300' }
}
