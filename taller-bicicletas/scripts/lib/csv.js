import fs from 'node:fs'

// Lector CSV sencillo para los listados exportados del ERP antiguo.
// Formato esperado: UTF-8 con BOM, separador ';' y saltos CRLF, con campos que
// pueden ir entrecomillados (RFC 4180): comilla de apertura, comilla de cierre y
// comillas escapadas como "".
// No se usan dependencias externas.

// Cuenta las comillas dobles de un texto (para saber si quedan campos abiertos).
function contarComillas(texto) {
  let total = 0
  for (const caracter of texto) {
    if (caracter === '"') total++
  }
  return total
}

// Devuelve las líneas lógicas de un CSV que ya está en memoria (sin BOM).
// Un campo entrecomillado puede contener saltos de línea físicos: si al acumular
// líneas el número de comillas es impar seguimos uniendo; las líneas físicas se
// unen con un espacio.
export function leerLineasCsvTexto(contenido) {
  // Elimina el BOM inicial si existe.
  const sinBom = contenido.charCodeAt(0) === 0xfeff ? contenido.slice(1) : contenido
  const fisicas = sinBom.split(/\r?\n/)

  const lineas = []
  let acumulada = null
  for (const fisica of fisicas) {
    acumulada = acumulada === null ? fisica : `${acumulada} ${fisica}`
    // Si el número de comillas es par, no hay ningún campo entrecomillado abierto.
    if (contarComillas(acumulada) % 2 === 0) {
      lineas.push(acumulada)
      acumulada = null
    }
  }
  // Si el fichero acaba dentro de unas comillas, no perdemos el último contenido.
  if (acumulada !== null) lineas.push(acumulada)
  return lineas
}

// Lee un fichero y devuelve sus líneas lógicas (sin BOM).
export function leerLineasCsv(ruta) {
  return leerLineasCsvTexto(fs.readFileSync(ruta, 'utf8'))
}

// Divide una línea en sus campos (separador ';', campos entrecomillados con "").
// - Un campo que empieza (tras espacios opcionales) por comilla se lee hasta la
//   comilla de cierre; dentro, "" es una comilla literal y ';' es texto.
// - El resto se parte por ';' respetando una comilla suelta como texto normal.
// - Los campos se recortan con trim() por los extremos, conservando los espacios
//   interiores de un campo entrecomillado.
// - Los campos vacíos se mantienen para no desplazar columnas.
export function dividirCampos(linea) {
  const campos = []
  const n = linea.length
  let i = 0

  while (i <= n) {
    // Saltamos los espacios iniciales para decidir si el campo está entrecomillado.
    let j = i
    while (j < n && (linea[j] === ' ' || linea[j] === '\t')) j++

    if (linea[j] === '"') {
      // Campo entrecomillado: se lee hasta la comilla de cierre.
      let valor = ''
      j++ // salta la comilla de apertura
      while (j < n) {
        if (linea[j] === '"') {
          if (linea[j + 1] === '"') {
            valor += '"' // comilla escapada
            j += 2
          } else {
            j++ // comilla de cierre
            break
          }
        } else {
          valor += linea[j]
          j++
        }
      }
      campos.push(valor.trim())
      // Ignoramos cualquier resto hasta el siguiente separador.
      while (j < n && linea[j] !== ';') j++
    } else {
      // Campo normal: se lee hasta el siguiente ';' (una comilla suelta es texto).
      const inicio = i
      while (j < n && linea[j] !== ';') j++
      campos.push(linea.slice(inicio, j).trim())
    }

    if (j < n && linea[j] === ';') {
      i = j + 1 // continúa con el siguiente campo
    } else {
      i = n + 1 // fin de la línea
    }
  }

  return campos
}

// Localiza el índice de la línea de cabeceras de columnas del listado.
// Empieza por 'Cód;' (clientes) o 'Código;' (artículos).
export function indiceCabecera(lineas) {
  return lineas.findIndex((linea) => /^C[óo]d(igo)?;/i.test(linea))
}

// Convierte un número en formato español a Number.
// Miles con '.', decimales con ',', espacios sobrantes. Vacío o inválido -> 0.
export function numeroEspanol(valor) {
  if (valor == null) return 0
  let texto = String(valor).trim()
  if (texto === '') return 0
  texto = texto.replace(/\./g, '').replace(',', '.')
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : 0
}

// Recorta un texto y devuelve null si queda vacío.
export function textoONull(valor) {
  if (valor == null) return null
  const texto = String(valor).trim()
  return texto === '' ? null : texto
}
