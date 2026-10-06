// Utilidades de tiempos de mano de obra. Los tiempos del catálogo se guardan en
// MINUTOS enteros, pero se muestran y editan como «H:MM» (horas:minutos).

// Formatea un número de minutos como «H:MM» (p. ej. 20 -> '0:20', 200 -> '3:20').
// Devuelve '' si el valor no es un número de minutos válido.
export function formatearMinutos(min) {
  if (min === null || min === undefined || min === '') return ''
  const numero = Number(min)
  if (!Number.isFinite(numero) || numero < 0) return ''
  const total = Math.round(numero)
  const horas = Math.floor(total / 60)
  const minutos = total % 60
  return `${horas}:${String(minutos).padStart(2, '0')}`
}

// Interpreta un texto «H:MM» o «HH:MM» y devuelve los minutos (de 1 a 1440) o
// null si el formato o el rango no son válidos.
export function parsearTiempo(texto) {
  if (typeof texto !== 'string') return null
  const coincide = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(texto)
  if (!coincide) return null
  const total = Number(coincide[1]) * 60 + Number(coincide[2])
  if (total < 1 || total > 1440) return null
  return total
}

// Interpreta una duración escrita a mano y devuelve los minutos (de 1 a 1440) o
// null si no es válida. Admite «H:MM»/«HH:MM», solo minutos (p. ej. '45' = 0:45)
// y horas con «h» (p. ej. '1h' = 60, '1,5h' = 90, '0,5h' = 30).
export function parsearDuracionLibre(texto) {
  if (typeof texto !== 'string') return null
  const limpio = texto.trim()
  if (limpio === '') return null
  // Horas con «h»: '1h', '2 h', '1,5h' o '1.5h'.
  const coincideHoras = /^(\d{1,2}(?:[.,]\d+)?)\s*h$/i.exec(limpio)
  if (coincideHoras) {
    const total = Math.round(Number(coincideHoras[1].replace(',', '.')) * 60)
    return total >= 1 && total <= 1440 ? total : null
  }
  // Solo minutos: '45' = 0:45.
  if (/^\d{1,4}$/.test(limpio)) {
    const total = Number(limpio)
    return total >= 1 && total <= 1440 ? total : null
  }
  // «H:MM» o «HH:MM».
  return parsearTiempo(limpio)
}

// Convierte horas a minutos enteros (redondeado); null si no es un número.
export function horasAMinutos(horas) {
  const numero = Number(horas)
  if (!Number.isFinite(numero)) return null
  return Math.round(numero * 60)
}

// Convierte minutos a horas, redondeado a 4 decimales; null si no es un número.
export function minutosAHoras(minutos) {
  const numero = Number(minutos)
  if (!Number.isFinite(numero)) return null
  return Number((numero / 60).toFixed(4))
}
