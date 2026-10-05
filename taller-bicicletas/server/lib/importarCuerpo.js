import { IMPORTACIONES } from './importar.js'

// Valida el cuerpo de una petición de importación SIN tocar la base de datos:
// comprueba que el tipo es conocido y que el contenido es un texto no vacío.
// Es una función pura (fácil de probar sin base de datos). Devuelve { error, status }
// cuando algo no cuadra, o { tipo, contenido, simular } con los valores comprobados.
export function validarCuerpo(tipo, cuerpo) {
  if (!Object.prototype.hasOwnProperty.call(IMPORTACIONES, tipo)) {
    return { error: 'Tipo de importación desconocido', status: 404 }
  }
  const contenido = cuerpo?.contenido
  if (typeof contenido !== 'string' || contenido.trim() === '') {
    return { error: 'Falta el contenido del fichero', status: 400 }
  }
  // `simular` solo se activa con el booleano true (se ignora cualquier otra cosa).
  return { tipo, contenido, simular: cuerpo?.simular === true }
}
