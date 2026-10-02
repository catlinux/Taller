// Exportación de listados a Excel (.xlsx) mediante SheetJS.
//
// La librería xlsx es pesada (~1 MB), así que se importa de forma DINÁMICA:
// solo se descarga y carga cuando el usuario pulsa un botón de exportación.
//
// Ejemplo de uso:
//   await exportarExcel('ordenes-2026-10-02.xlsx', [
//     {
//       nombre: 'Órdenes',
//       columnas: [{ titulo: 'Nº orden', valor: (fila) => fila.numeroOrden, ancho: 14 }],
//       filas: ordenes,
//     },
//   ])
//
// Cada columna define: `titulo` (cabecera), `valor(fila)` (devuelve Date para
// fechas y Number para importes) y `ancho` opcional (en caracteres).

// Devuelve la fecha de hoy como "AAAA-MM-DD" para nombrar el fichero.
export function fechaFichero() {
  const hoy = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`
}

// Construye una hoja de cálculo a partir de las columnas y filas indicadas.
function construirHoja(XLSX, hoja) {
  const columnas = hoja.columnas || []
  const filas = hoja.filas || []
  // La primera fila son las cabeceras; el resto, los valores de cada columna.
  const datos = [columnas.map((columna) => columna.titulo)]
  for (const fila of filas) {
    datos.push(columnas.map((columna) => {
      const valor = columna.valor(fila)
      return valor === undefined || valor === null ? '' : valor
    }))
  }
  const worksheet = XLSX.utils.aoa_to_sheet(datos)
  // Anchos de columna (!cols).
  worksheet['!cols'] = columnas.map((columna) => ({ wch: columna.ancho || 14 }))
  return worksheet
}

// Exporta uno o varios listados a un libro de Excel y lanza la descarga.
// `hojas` = [{ nombre, columnas: [{ titulo, valor, ancho }], filas: [] }].
export async function exportarExcel(nombreFichero, hojas) {
  const XLSX = await import('xlsx').then((modulo) => modulo.default || modulo)
  const libro = XLSX.utils.book_new()
  for (const hoja of hojas) {
    // El nombre de una hoja de Excel no puede superar 31 caracteres.
    XLSX.utils.book_append_sheet(libro, construirHoja(XLSX, hoja), String(hoja.nombre).slice(0, 31))
  }
  XLSX.writeFile(libro, nombreFichero)
}
