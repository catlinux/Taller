// Normalización y comparación de texto para búsquedas que ignoran mayúsculas
// y diacríticos (acentos, diéresis, ñ, ç...).
//
// SQLite no dispone de una extensión «unaccent», así que las búsquedas por
// texto se resuelven en memoria con estas funciones: se normalizan tanto el
// valor como la consulta y luego se comparan por subcadena.

// Normaliza un valor a texto comparable: null/undefined -> ''; la cadena se
// descompone en NFD, se le quitan las marcas diacríticas (categoría Unicode
// \p{M}), se pasa a minúsculas y se colapsan los espacios sobrantes.
export function normalizarTexto(valor) {
  if (valor === null || valor === undefined) return ''
  const texto = String(valor).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  return texto.replace(/\s+/g, ' ').trim()
}

// Indica si todos los términos de `consulta` (separados por espacios) aparecen
// en el texto normalizado de alguno de los `valores` o en la concatenación de
// todos ellos. Sin consulta (vacía) devuelve true.
export function coincideTexto(valores, consulta) {
  const terminos = normalizarTexto(consulta).split(' ').filter(Boolean)
  if (terminos.length === 0) return true
  const lista = Array.isArray(valores) ? valores : [valores]
  const texto = lista.map(normalizarTexto).join(' ')
  return terminos.every((termino) => texto.includes(termino))
}
