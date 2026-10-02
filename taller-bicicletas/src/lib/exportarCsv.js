// Exportación de listados a CSV para abrir en Excel en español.
//
// Convenciones: separador ';', codificación UTF-8 con BOM, saltos de línea
// CRLF, importes con coma decimal y dos decimales y fechas dd/mm/aaaa. Los
// campos se entrecomillan cuando contienen ';', comillas o saltos de línea, y
// se protege contra la inyección de fórmulas (=, +, -, @).
//
// Ejemplo de uso:
//   exportarCsv('ordenes-2026-10-02.csv', columnasExportacionOrdenes, ordenes)

const FORMATO_IMPORTE = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// Formatea un importe con coma decimal y dos decimales.
export function formatearImporteCsv(valor) {
  const numero = Number(valor)
  return FORMATO_IMPORTE.format(Number.isFinite(numero) ? numero : 0)
}

// Formatea una fecha (Date o texto ISO) como dd/mm/aaaa.
export function formatearFechaCsv(valor) {
  if (valor === undefined || valor === null || valor === '') return ''
  const fecha = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(fecha.getTime())) return ''
  return fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Evita la inyección de fórmulas: antepone una comilla simple si el texto
// empieza por =, +, - o @.
export function protegerFormulaCsv(texto) {
  const cadena = String(texto ?? '')
  return /^[=+\-@]/.test(cadena) ? `'${cadena}` : cadena
}

// Entrecomilla un campo si contiene el separador, comillas dobles o saltos de
// línea, escapando las comillas dobles como "".
export function escaparCampoCsv(valor) {
  const texto = String(valor ?? '')
  if (/[;"\r\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`
  }
  return texto
}

// Convierte el valor de una columna en el texto que irá al CSV según su tipo.
function valorCsv(columna, fila) {
  const valor = typeof columna.valor === 'function' ? columna.valor(fila) : fila[columna.clave]
  if (columna.tipo === 'fecha') return formatearFechaCsv(valor)
  if (columna.tipo === 'numero') return formatearImporteCsv(valor)
  return escaparCampoCsv(protegerFormulaCsv(valor))
}

// Construye el contenido completo del CSV (UTF-8 con BOM y saltos CRLF).
export function construirCsv(columnas, filas) {
  const lineas = [columnas.map((columna) => escaparCampoCsv(protegerFormulaCsv(columna.titulo))).join(';')]
  for (const fila of filas || []) {
    lineas.push(columnas.map((columna) => valorCsv(columna, fila)).join(';'))
  }
  return `\uFEFF${lineas.join('\r\n')}\r\n`
}

// Genera el CSV y lanza su descarga con un enlace temporal (revoca la URL).
export function exportarCsv(nombreFichero, columnas, filas) {
  const contenido = construirCsv(columnas, filas)
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreFichero
  document.body.appendChild(enlace)
  enlace.click()
  document.body.removeChild(enlace)
  URL.revokeObjectURL(url)
}
