// Generación del PDF del listado de órdenes de reparación con jsPDF +
// jspdf-autotable, en A4 horizontal.
//
// La librería de PDF (pesada) se importa de forma DINÁMICA dentro de la
// función: solo se descarga y carga cuando el usuario pulsa "Exportar > PDF".
// El consumidor importa además este módulo bajo demanda, igual que pdfOrden.js.
//
// El documento incluye: título, fecha de generación, la tabla con las mismas
// columnas que Excel/CSV, una fila final de totales y la paginación en el pie.

import { columnasExportacionOrdenes } from './columnasOrdenes.js'
import { formatearEuros, formatearFecha } from './ordenes.js'

// ── Cuadrícula A4 horizontal (mm) ─────────────────────────────
const ANCHO = 297
const ALTO = 210
const MARGEN = 10

// ── Paleta sobria del documento (igual que pdfOrden.js) ───────
const GRIS = [42, 47, 51] // #2A2F33
const AZUL = [61, 139, 255] // #3D8BFF
const TEXTO = [40, 40, 40]
const SUAVE = [110, 116, 122]
const BORDE = [227, 230, 234] // #E3E6EA
const FONDO = [243, 245, 247] // #F3F5F7
const FONDO_ALT = [250, 251, 252] // #FAFBFC
const BLANCO = [255, 255, 255]

// Ruta por defecto del logotipo de la aplicación.
const LOGO_POR_DEFECTO = '/icons/logo.png'

// Carga una imagen remota/local como dataURL y devuelve sus dimensiones.
// Prueba cada ruta en orden y devuelve null si todas fallan.
async function cargarLogo(...rutas) {
  for (const ruta of rutas) {
    if (!ruta) continue
    try {
      const respuesta = await fetch(ruta)
      if (!respuesta.ok) continue
      const blob = await respuesta.blob()
      const dataUrl = await new Promise((resolve, reject) => {
        const lector = new FileReader()
        lector.onload = () => resolve(lector.result)
        lector.onerror = reject
        lector.readAsDataURL(blob)
      })
      const dimensiones = await new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve({ ancho: img.naturalWidth, alto: img.naturalHeight })
        img.onerror = () => resolve(null)
        img.src = dataUrl
      })
      if (!dimensiones || !dimensiones.ancho || !dimensiones.alto) continue
      return { dataUrl, ancho: dimensiones.ancho, alto: dimensiones.alto }
    } catch {
      // Si algo falla, se continúa sin logotipo.
    }
  }
  return null
}

// Valor de una celda del PDF según el tipo de la columna.
function celdaPdf(columna, fila) {
  const valor = typeof columna.valor === 'function' ? columna.valor(fila) : fila[columna.clave]
  if (columna.tipo === 'fecha') return valor ? formatearFecha(valor) : ''
  if (columna.tipo === 'numero') return formatearEuros(valor)
  return String(valor ?? '')
}

// Suma el valor de una columna numérica sobre todas las filas.
function sumaColumna(filas, columna) {
  return filas.reduce((acumulado, fila) => {
    const valor = typeof columna.valor === 'function' ? columna.valor(fila) : fila[columna.clave]
    const numero = Number(valor)
    return acumulado + (Number.isFinite(numero) ? numero : 0)
  }, 0)
}

// Genera el PDF del listado de órdenes y devuelve el documento jsPDF.
export async function generarPdfListadoOrdenes(ordenes = [], opciones = {}) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const columnas = opciones.columnas || columnasExportacionOrdenes
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setFont('helvetica', 'normal')

  // ── Cabecera: logo + título + fecha de generación ───────────
  const logo = await cargarLogo(LOGO_POR_DEFECTO)
  let x = MARGEN
  const yTitulo = MARGEN + 7
  if (logo) {
    const alto = 12
    const ancho = Math.min(28, (logo.ancho / logo.alto) * alto)
    doc.addImage(logo.dataUrl, MARGEN, MARGEN, ancho, alto)
    x = MARGEN + ancho + 6
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...AZUL)
  doc.text('Listado de órdenes de reparación', x, yTitulo)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...SUAVE)
  const fechaGeneracion = new Date().toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  doc.text(`Generado el ${fechaGeneracion}`, x, yTitulo + 6)

  // ── Tabla ───────────────────────────────────────────────────
  const filas = ordenes.map((orden) => columnas.map((columna) => celdaPdf(columna, orden)))

  // Fila final de totales: 'TOTAL' y la suma de las columnas numéricas.
  const filaTotales = columnas.map((columna, indice) => {
    if (indice === 0) return 'TOTAL'
    if (columna.tipo === 'numero') return formatearEuros(sumaColumna(ordenes, columna))
    return ''
  })
  const cuerpo = [...filas, filaTotales]
  const indiceTotales = filas.length

  const columnStyles = {}
  columnas.forEach((columna, indice) => {
    if (columna.tipo === 'numero') columnStyles[indice] = { halign: 'right' }
  })

  autoTable(doc, {
    startY: MARGEN + 20,
    head: [columnas.map((columna) => columna.titulo)],
    body: cuerpo,
    margin: { left: MARGEN, right: MARGEN, top: MARGEN, bottom: 16 },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 1.5,
      textColor: TEXTO,
      lineColor: BORDE,
      lineWidth: 0.1,
      overflow: 'linebreak',
    },
    headStyles: { fillColor: GRIS, textColor: BLANCO, fontStyle: 'bold', halign: 'left' },
    alternateRowStyles: { fillColor: FONDO_ALT },
    columnStyles,
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === indiceTotales) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = FONDO
      }
    },
  })

  // ── Pie: numeración 'Página x de y' ─────────────────────────
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...SUAVE)
    doc.text(`Página ${i} de ${total}`, ANCHO - MARGEN, ALTO - 6, { align: 'right' })
  }
  doc.setPage(1)

  return doc
}
