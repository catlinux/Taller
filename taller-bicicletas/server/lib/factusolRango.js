// Cálculo del rango de fechas y validación de identificadores de orden para las
// rutas de exportación a Factusol. Módulo puro: no usa Prisma ni Express, así
// que se puede probar sin base de datos (ver factusolRango.test.mjs).

// Convierte una fecha «AAAA-MM-DD» al Date local del inicio del día
// (00:00:00.000) o del final del día (23:59:59.999) cuando finDelDia es true.
// Devuelve null si el formato no es válido o la fecha no existe.
export function parseFechaLocal(texto, finDelDia = false) {
  if (typeof texto !== 'string') return null
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto.trim())
  if (!coincidencia) return null

  const anio = Number(coincidencia[1])
  const mes = Number(coincidencia[2])
  const dia = Number(coincidencia[3])
  const fecha = finDelDia
    ? new Date(anio, mes - 1, dia, 23, 59, 59, 999)
    : new Date(anio, mes - 1, dia, 0, 0, 0, 0)

  // Si el día no existe (por ejemplo 2026-02-30), Date lo desplaza a otro mes
  // o año; lo detectamos comparando el resultado con lo pedido.
  if (
    fecha.getFullYear() !== anio ||
    fecha.getMonth() !== mes - 1 ||
    fecha.getDate() !== dia
  ) {
    return null
  }
  return fecha
}

// Calcula el rango [desde, hasta] en hora local a partir de dos fechas
// «AAAA-MM-DD», ambos días incluidos. Devuelve { desde, hasta } o { error }.
export function rangoFechas(desde, hasta) {
  const inicio = parseFechaLocal(desde, false)
  const fin = parseFechaLocal(hasta, true)
  if (!inicio || !fin) {
    return { error: 'Indica las fechas desde y hasta en formato AAAA-MM-DD' }
  }
  if (inicio.getTime() > fin.getTime()) {
    return { error: 'La fecha desde no puede ser posterior a la fecha hasta' }
  }
  return { desde: inicio, hasta: fin }
}

// Valida una lista de identificadores de orden: array no vacío de enteros
// positivos. Devuelve { ordenIds } (copia) o { error } con el motivo.
export function validarOrdenIds(valor) {
  if (!Array.isArray(valor) || valor.length === 0) {
    return { error: 'Debes indicar al menos una orden' }
  }
  for (const id of valor) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      return { error: 'Los identificadores de orden deben ser enteros positivos' }
    }
  }
  return { ordenIds: valor.slice() }
}
