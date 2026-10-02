// Constantes y utilidades compartidas para las órdenes de reparación.

// Estados de una orden: valor interno, etiqueta visible y clases de la "pastilla".
// Colores: Presupuesto gris, Pendiente azul, EnReparacion azul intenso,
// EsperandoMaterial naranja, Finalizada verde, Entregada gris apagado.
export const ESTADOS = [
  { valor: 'Presupuesto', etiqueta: 'Presupuesto', clase: 'bg-slate-500/10 text-slate-300' },
  { valor: 'Pendiente', etiqueta: 'Pendiente', clase: 'bg-azul-500/10 text-azul-300' },
  { valor: 'EnReparacion', etiqueta: 'En reparación', clase: 'bg-azul-500 text-white' },
  { valor: 'EsperandoMaterial', etiqueta: 'Esperando material', clase: 'bg-naranja-500/10 text-naranja-300' },
  { valor: 'Finalizada', etiqueta: 'Finalizada', clase: 'bg-emerald-500/10 text-emerald-300' },
  { valor: 'Entregada', etiqueta: 'Entregada', clase: 'bg-slate-600/20 text-slate-400' },
]

// Tipos de reparación: valor interno y etiqueta visible.
export const TIPOS_REPARACION = [
  { valor: 'Preferente', etiqueta: 'Preferente (viajeros/corredores)' },
  { valor: 'Programada', etiqueta: 'Programada' },
  { valor: 'Urgente', etiqueta: 'Urgente' },
  { valor: 'NoProgramada', etiqueta: 'No programada' },
]

// Formas de pago permitidas en una orden.
export const FORMAS_PAGO = ['Efectivo', 'Tarjeta', 'Transferencia', 'Financiado']

// Estados de pago permitidos en una orden.
export const ESTADOS_PAGO = ['Pagado', 'Pendiente', 'Parcial']

// Devuelve la información (valor, etiqueta y clase) de un estado de orden.
export function estadoInfo(valor) {
  return ESTADOS.find((estado) => estado.valor === valor) || { valor, etiqueta: valor || '—', clase: 'bg-slate-500/10 text-slate-300' }
}

// Devuelve la etiqueta visible de un estado de orden.
export function etiquetaEstado(valor) {
  return estadoInfo(valor).etiqueta
}

// Devuelve la etiqueta visible de un tipo de reparación.
export function etiquetaTipo(valor) {
  if (!valor) return '—'
  return TIPOS_REPARACION.find((tipo) => tipo.valor === valor)?.etiqueta || valor
}

// Etiquetas cortas de los tipos de reparación (para espacios reducidos, como las tarjetas del tablero).
export function etiquetaTipoCorta(valor) {
  const cortas = {
    Preferente: 'Preferente',
    Programada: 'Programada',
    Urgente: 'Urgente',
    NoProgramada: 'No programada',
  }
  if (!valor) return '—'
  return cortas[valor] || valor
}

const FORMATO_EUROS = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

// Formatea un número como importe en euros (es-ES).
export function formatearEuros(valor) {
  const numero = Number(valor)
  return FORMATO_EUROS.format(Number.isFinite(numero) ? numero : 0)
}

// Convierte el texto de un campo numérico en un número (admite coma decimal).
// Devuelve null si el texto está vacío o no es un número válido.
export function aNumero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  const texto = String(valor ?? '').trim().replace(',', '.')
  if (texto === '') return null
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : null
}

// Formatea una fecha ISO como fecha corta en es-ES.
export function formatearFecha(iso) {
  if (!iso) return '—'
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return '—'
  return fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Formatea una fecha ISO como fecha y hora en es-ES.
export function formatearFechaHora(iso) {
  if (!iso) return '—'
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return '—'
  return fecha.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
