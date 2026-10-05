// Generación del PDF imprimible de una orden de reparación
// (Parte de taller) con jsPDF + jspdf-autotable.
//
// El documento NUNCA incluye datos internos: forma de pago, estado de pago,
// observaciones internas, seguimiento ni "cliente avisado".

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatearEuros, formatearFecha, formatearFechaHora, etiquetaTipo } from './ordenes.js'

// ── Cuadrícula A4 (mm) ────────────────────────────────────────
const ANCHO = 210
const ALTO = 297
const MARGEN = 15 // margen lateral (x)
const MARGEN_Y = 12 // margen superior e inferior (y)
const DERECHA = ANCHO - MARGEN
const ANCHO_CONTENIDO = ANCHO - MARGEN * 2 // 180
const ESPACIO = 3 // separación vertical constante entre bloques
const ESPACIO_TEXTO = 3 // separación entre secciones de texto libre
const LIMITE_CONTENIDO = ALTO - 18 // deja hueco para el pie de página

// ── Paleta sobria del documento ───────────────────────────────
const GRIS = [42, 47, 51] // #2A2F33
const AZUL = [61, 139, 255] // #3D8BFF
const AZUL_OSCURO = [29, 78, 216] // #1D4ED8
const NARANJA = [255, 122, 47] // #FF7A2F
const TEXTO = [40, 40, 40]
const SUAVE = [110, 116, 122]
const BORDE = [227, 230, 234] // #E3E6EA
const FONDO = [243, 245, 247] // #F3F5F7
const FONDO_ALT = [250, 251, 252] // #FAFBFC
const BLANCO = [255, 255, 255]

// Ruta por defecto del logotipo de la aplicación
const LOGO_POR_DEFECTO = '/icons/logo.png'

const FORMATO_CANTIDAD = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 })
const FORMATO_PORCENTAJE = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })

// Etiquetas legibles de los tipos de bicicleta.
const ETIQUETAS_BICI = {
  BiciInfantil: 'Bici infantil',
  XC: 'XC',
  Trail: 'Trail',
  Enduro: 'Enduro',
  Descens: 'Descenso',
  Passeig: 'Paseo',
  Gravel: 'Gravel',
  Carretera: 'Carretera',
  Triatlo: 'Triatlón',
  EBikePasseig: 'E-Bike paseo',
  EBikeXC: 'E-Bike XC',
  EBikeEnduro: 'E-Bike enduro',
  EBikeGravel: 'E-Bike gravel',
  EBikeCarretera: 'E-Bike carretera',
}

// Formatea una cantidad en es-ES (sin símbolo).
function fCantidad(valor) {
  const numero = Number(valor)
  return FORMATO_CANTIDAD.format(Number.isFinite(numero) ? numero : 0)
}

// Formatea un porcentaje en es-ES (sin símbolo).
function fPorcentaje(valor) {
  const numero = Number(valor)
  return FORMATO_PORCENTAJE.format(Number.isFinite(numero) ? numero : 0)
}

// Etiqueta legible del tipo de una bicicleta.
function etiquetaTipoBici(valor) {
  if (!valor) return ''
  return ETIQUETAS_BICI[valor] || valor
}

// Caracteres que la fuente helvetica estándar (WinAnsi/CP1252) sí puede
// representar además del rango Latin-1 básico.
// eslint-disable-next-line no-control-regex
const CARACTERES_NO_REPRESENTABLES =
  /[^\u0000-\u00FF\u20AC\u201A\u0192\u201E\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2022\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/g

// Normaliza un texto para poder escribirlo con helvetica estándar: compone las
// tildes en forma descompuesta (NFC) y sustituye o elimina los caracteres que
// WinAnsi no puede representar (comillas tipográficas, guiones largos, etc.).
function normalizarTexto(t) {
  return String(t ?? '')
    .normalize('NFC')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2039\u203A]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(CARACTERES_NO_REPRESENTABLES, '')
}

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

// ── Utilidades de maquetación ─────────────────────────────────

// Salta de página si el bloque de altura `alto` no cabe en lo que queda.
function asegurarBloque(doc, y, alto) {
  if (y + alto > LIMITE_CONTENIDO) {
    doc.addPage()
    return MARGEN_Y
  }
  return y
}

// Altura del texto por encima de su línea base para helvetica 9 pt (mm). Sirve
// para situar la primera línea de un párrafo justo 2 mm por debajo del filete.
const ASCENSO_9PT = 9 * 0.3528 * 0.72 // ≈ 2,29 mm

// Título de sección: texto a la izquierda en azul oscuro 9 pt negrita con un
// filete fino 1,2 mm por debajo. Solo dibuja (los saltos de página los decide
// el llamador). Devuelve la Y del borde superior del contenido siguiente, que
// queda 2 mm por debajo del filete: el contenido va siempre por debajo de la
// línea, nunca encima.
function dibujarTituloSeccion(doc, texto, y) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...AZUL_OSCURO)
  doc.text(normalizarTexto(texto), MARGEN, y)
  const yFilete = y + 1.2
  doc.setDrawColor(...BORDE)
  doc.setLineWidth(0.3)
  doc.line(MARGEN, yFilete, DERECHA, yFilete)
  return yFilete + 2
}

// Bloque de texto libre (título de sección + párrafo ajustado al ancho).
function dibujarSeccionTexto(doc, titulo, contenido, y) {
  const lh = 4.6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const lineas = doc.splitTextToSize(normalizarTexto(contenido), ANCHO_CONTENIDO)

  // Evita títulos huérfanos: exige sitio para el título y las primeras líneas.
  if (y + 3.2 + ASCENSO_9PT + lh * 2 > LIMITE_CONTENIDO) {
    doc.addPage()
    y = MARGEN_Y
  }
  // El título devuelve el borde superior del contenido (2 mm bajo el filete);
  // la primera línea de texto empieza justo debajo, sumando el ascenso.
  y = dibujarTituloSeccion(doc, titulo, y) + ASCENSO_9PT
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...TEXTO)
  for (const linea of lineas) {
    if (y + lh > LIMITE_CONTENIDO) {
      doc.addPage()
      y = MARGEN_Y
    }
    doc.text(linea, MARGEN, y)
    y += lh
  }
  return y + ESPACIO_TEXTO
}

// Recuadro de texto con fondo claro y padding de 2 mm (p. ej. "Problema").
function dibujarRecuadroTexto(doc, titulo, contenido, y) {
  const lh = 4.6
  const padX = 2
  const padY = 2
  const anchoTexto = ANCHO_CONTENIDO - padX * 2
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const lineas = doc.splitTextToSize(normalizarTexto(contenido), anchoTexto)

  // ¿Cabe el recuadro entero en la página (con su título)?
  const altoTotal = padY * 2 + lineas.length * lh
  if (y + 3.2 + altoTotal <= LIMITE_CONTENIDO) {
    y = dibujarTituloSeccion(doc, titulo, y)
    doc.setFillColor(...FONDO)
    doc.roundedRect(MARGEN, y, ANCHO_CONTENIDO, altoTotal, 1.5, 1.5, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...TEXTO)
    let ty = y + padY + 3.4
    for (const linea of lineas) {
      doc.text(linea, MARGEN + padX, ty)
      ty += lh
    }
    return y + altoTotal + ESPACIO
  }

  // Si no cabe (texto muy largo), trocea el recuadro en varias páginas.
  if (y + 3.2 + Math.min(altoTotal, 20) > LIMITE_CONTENIDO) {
    doc.addPage()
    y = MARGEN_Y
  }
  y = dibujarTituloSeccion(doc, titulo, y)
  let idx = 0
  while (idx < lineas.length) {
    const disponibles = Math.max(1, Math.floor((LIMITE_CONTENIDO - (y + padY)) / lh))
    const trozo = lineas.slice(idx, idx + disponibles)
    const alto = padY * 2 + trozo.length * lh
    doc.setFillColor(...FONDO)
    doc.rect(MARGEN, y, ANCHO_CONTENIDO, alto, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...TEXTO)
    let ty = y + padY + 3.4
    for (const linea of trozo) {
      doc.text(linea, MARGEN + padX, ty)
      ty += lh
    }
    idx += trozo.length
    if (idx < lineas.length) {
      doc.addPage()
      y = MARGEN_Y
    } else {
      y += alto
    }
  }
  return y + ESPACIO
}


const CAJA_TITULO = 6 // alto de la banda de título de las cajas
const CAJA_PAD = 2 // padding superior e izquierdo del contenido
const CAJA_PAD_DER = 3 // padding interior derecho: el valor nunca toca el borde
const CAJA_LABEL_COL = 22 // ancho de la columna de etiquetas
const CAJA_LH = 4 // interlineado del valor (8,5 pt)
const CAJA_ROW = 4.6 // separación vertical entre filas etiqueta/valor
const CAJA_VALOR = 8.5 // tamaño del valor en las cajas

// Construye las filas etiqueta/valor del cliente (omite las vacías).
function construirFilasCliente(cliente) {
  const filas = []
  if (cliente.numeroCliente != null && cliente.numeroCliente !== '') {
    filas.push({ etiqueta: 'N.º', valor: String(cliente.numeroCliente) })
  }
  const nombre = [cliente.nombre, cliente.apellidos].filter(Boolean).join(' ').trim()
  if (nombre) filas.push({ etiqueta: 'Nombre', valor: nombre })
  if (cliente.dni) filas.push({ etiqueta: 'DNI/NIF', valor: cliente.dni })
  if (cliente.telefono) filas.push({ etiqueta: 'Teléfono', valor: cliente.telefono })
  if (cliente.email) filas.push({ etiqueta: 'Correo', valor: cliente.email })
  const cpPoblacion = [cliente.codigoPostal, cliente.poblacion].filter(Boolean).join(' ').trim()
  const direccion = [cliente.direccion, cpPoblacion, cliente.provincia].filter(Boolean).join(', ')
  if (direccion) filas.push({ etiqueta: 'Dirección', valor: direccion })
  return filas
}

// Construye las filas etiqueta/valor de la bicicleta (omite las vacías).
function construirFilasBici(bici) {
  const filas = []
  if (bici.marca) filas.push({ etiqueta: 'Marca', valor: bici.marca })
  if (bici.modelo) filas.push({ etiqueta: 'Modelo', valor: bici.modelo })
  if (bici.tipo) filas.push({ etiqueta: 'Tipo', valor: etiquetaTipoBici(bici.tipo) })
  if (bici.numeroSerie) filas.push({ etiqueta: 'N.º serie', valor: bici.numeroSerie })
  return filas
}

// Alto que necesita una caja con cabecera y filas etiqueta/valor.
function altoCaja(doc, filas, ancho) {
  if (!filas.length) return CAJA_TITULO + CAJA_PAD * 2 + 4.5
  const anchoValor = ancho - CAJA_PAD - CAJA_PAD_DER - CAJA_LABEL_COL
  let interior = 0
  for (const fila of filas) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(CAJA_VALOR)
    const n = Math.max(1, doc.splitTextToSize(normalizarTexto(fila.valor), anchoValor).length)
    interior += CAJA_ROW + (n - 1) * CAJA_LH
  }
  return CAJA_TITULO + CAJA_PAD + interior
}

// Dibuja una caja con cabecera oscura y filas etiqueta/valor.
function dibujarCaja(doc, titulo, filas, x, y, ancho, alto) {
  doc.setDrawColor(...BORDE)
  doc.setLineWidth(0.2)
  doc.roundedRect(x, y, ancho, alto, 1.5, 1.5, 'S')

  doc.setFillColor(...GRIS)
  doc.roundedRect(x, y, ancho, CAJA_TITULO, 1.5, 1.5, 'F')
  doc.rect(x, y + CAJA_TITULO - 2, ancho, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...BLANCO)
  doc.text(normalizarTexto(titulo).toUpperCase(), x + CAJA_PAD, y + CAJA_TITULO - 2.2)

  const valorX = x + CAJA_PAD + CAJA_LABEL_COL
  const anchoValor = x + ancho - CAJA_PAD_DER - valorX

  if (!filas.length) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(CAJA_VALOR)
    doc.setTextColor(...SUAVE)
    doc.text(normalizarTexto('Sin bicicleta asignada'), x + CAJA_PAD, y + CAJA_TITULO + CAJA_PAD + 3)
    return
  }

  let fy = y + CAJA_TITULO + CAJA_PAD
  for (const fila of filas) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...SUAVE)
    doc.text(normalizarTexto(fila.etiqueta), x + CAJA_PAD, fy + 3)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(CAJA_VALOR)
    doc.setTextColor(...TEXTO)
    const lineas = doc.splitTextToSize(normalizarTexto(fila.valor), anchoValor)
    lineas.forEach((linea, i) => doc.text(linea, valorX, fy + 3 + i * CAJA_LH))
    fy += CAJA_ROW + (lineas.length - 1) * CAJA_LH
  }
}


// ── Cabecera en dos columnas ─────────────────────────────────

// Dibuja la cabecera (logo + empresa a la izquierda, título y nº a la derecha)
// y la línea separadora. Devuelve el cursor Y del bloque siguiente.
function dibujarCabecera(doc, orden, empresa, logo) {
  const xDer = 125
  const anchoDer = DERECHA - xDer // 70
  const anchoIzq = 105 // hasta x = 120

  // Columna derecha: título azul y, muy cerca (2 mm), el recuadro del número
  // de orden. La columna izquierda se alinea arriba con el título.
  const titulo = 'PARTE DE TALLER'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...AZUL)
  const tituloY = MARGEN_Y + 7
  const tituloLineas = doc.splitTextToSize(normalizarTexto(titulo), anchoDer)
  tituloLineas.forEach((linea, i) => doc.text(linea, DERECHA, tituloY + i * 8, { align: 'right' }))

  const boxH = 9
  const boxY = tituloY + (tituloLineas.length - 1) * 8 + 2
  doc.setFillColor(...FONDO)
  doc.roundedRect(xDer, boxY, anchoDer, boxH, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...GRIS)
  const numero = doc.splitTextToSize(normalizarTexto(orden.numeroOrden || '—'), anchoDer - 6)[0]
  doc.text(numero, xDer + anchoDer / 2, boxY + boxH / 2 + 1.6, { align: 'center' })
  const yDer = boxY + boxH

  // Columna izquierda: logo y datos de la empresa, alineados arriba con el
  // título (arrancan en el margen superior).
  let yIzq = MARGEN_Y
  if (logo) {
    const maxAncho = 90
    const maxAlto = 12
    const aspecto = logo.ancho / logo.alto
    let logoAncho = maxAncho
    let logoAlto = logoAncho / aspecto
    if (logoAlto > maxAlto) {
      logoAlto = maxAlto
      logoAncho = logoAlto * aspecto
    }
    try {
      doc.addImage(logo.dataUrl, 'PNG', MARGEN, MARGEN_Y, logoAncho, logoAlto)
      yIzq = MARGEN_Y + logoAlto + 2.5
    } catch {
      yIzq = MARGEN_Y
    }
  }

  // Nombre de la empresa: 10 pt si cabe en una línea; si no, 9 pt.
  const nombre = normalizarTexto(empresa?.nombre || 'Taller')
  let tamNombre = 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(tamNombre)
  if (doc.getTextWidth(nombre) > anchoIzq) {
    tamNombre = 9
    doc.setFontSize(tamNombre)
  }
  doc.setTextColor(...GRIS)
  const lhNombre = tamNombre * 0.45
  const nombreLineas = doc.splitTextToSize(nombre, anchoIzq)
  nombreLineas.forEach((linea, i) => doc.text(linea, MARGEN, yIzq + i * lhNombre))
  yIzq += nombreLineas.length * lhNombre + 0.5

  const datos = []
  if (empresa?.direccion) datos.push(empresa.direccion)
  const cpCiudad = [empresa?.codigoPostal, empresa?.ciudad].filter(Boolean).join(' ').trim()
  if (cpCiudad || empresa?.provincia) {
    datos.push(`${cpCiudad}${empresa?.provincia ? ` (${empresa.provincia})` : ''}`.trim())
  }
  if (empresa?.telefono) datos.push(`Tel.: ${empresa.telefono}`)
  if (empresa?.email) datos.push(empresa.email)
  if (empresa?.web) datos.push(empresa.web)
  if (empresa?.cif) datos.push(`CIF: ${empresa.cif}`)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...SUAVE)
  for (const dato of datos) {
    const lineas = doc.splitTextToSize(normalizarTexto(dato), anchoIzq)
    lineas.forEach((linea, i) => doc.text(linea, MARGEN, yIzq + i * 3.4))
    yIzq += lineas.length * 3.4
  }

  // Línea fina separadora de la cabecera.
  const yCab = Math.max(yIzq, yDer) + 2
  doc.setDrawColor(...BORDE)
  doc.setLineWidth(0.3)
  doc.line(MARGEN, yCab, DERECHA, yCab)
  return yCab + ESPACIO
}

// ── Franja de datos ──────────────────────────────────────────

function dibujarFranjaDatos(doc, orden, y) {
  const hayGarantia = Boolean(orden.garantia)
  const anchoPill = hayGarantia ? 36 : 0
  const anchoFranja = ANCHO_CONTENIDO - anchoPill
  const anchoCelda = anchoFranja / 4
  const padX = 3
  const padY = 2
  const lhLabel = 3
  const lhValor = 4.2

  const celdas = [
    { etiqueta: 'Entrada', valor: orden.fechaEntrada ? formatearFechaHora(orden.fechaEntrada) : '—' },
    { etiqueta: 'Prevista', valor: orden.fechaPrevista ? formatearFecha(orden.fechaPrevista) : 'Sin definir' },
    { etiqueta: 'Tipo de reparación', valor: etiquetaTipo(orden.tipoReparacion) || '—' },
    { etiqueta: 'Mecánico', valor: orden.mecanico?.nombre || 'Sin asignar' },
  ]

  let altoContenido = 0
  const medidas = celdas.map((celda) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    const lab = doc.splitTextToSize(normalizarTexto(celda.etiqueta.toUpperCase()), anchoCelda - padX * 2)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    const val = doc.splitTextToSize(normalizarTexto(celda.valor), anchoCelda - padX * 2)
    altoContenido = Math.max(altoContenido, lab.length * lhLabel + 1.5 + val.length * lhValor)
    return { lab, val }
  })
  const alto = padY * 2 + altoContenido

  y = asegurarBloque(doc, y, alto)

  doc.setFillColor(...FONDO)
  doc.roundedRect(MARGEN, y, ANCHO_CONTENIDO, alto, 1.5, 1.5, 'F')

  doc.setDrawColor(...BORDE)
  doc.setLineWidth(0.2)
  for (let i = 1; i < 4; i += 1) {
    const xsep = MARGEN + anchoCelda * i
    doc.line(xsep, y + 2, xsep, y + alto - 2)
  }

  celdas.forEach((celda, i) => {
    const x = MARGEN + anchoCelda * i
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...SUAVE)
    let ty = y + padY + lhLabel - 0.2
    medidas[i].lab.forEach((linea) => {
      doc.text(linea, x + padX, ty)
      ty += lhLabel
    })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(...TEXTO)
    ty += 1.2
    medidas[i].val.forEach((linea) => {
      doc.text(linea, x + padX, ty)
      ty += lhValor
    })
  })

  if (hayGarantia) {
    const pillW = 30
    const pillH = 7
    const pillX = DERECHA - pillW - 2
    const pillY = y + (alto - pillH) / 2
    doc.setFillColor(...NARANJA)
    doc.roundedRect(pillX, pillY, pillW, pillH, 3, 3, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...BLANCO)
    doc.text('EN GARANTÍA', pillX + pillW / 2, pillY + pillH / 2 + 1.2, { align: 'center' })
  }

  return y + alto + ESPACIO
}


// ── Cliente y bicicleta lado a lado ──────────────────────────

function dibujarCajas(doc, orden, y) {
  const anchoCaja = 87
  const gap = ANCHO_CONTENIDO - anchoCaja * 2 // 6
  const filasCliente = construirFilasCliente(orden.cliente || {})
  const filasBici = construirFilasBici(orden.bicicleta || {})
  const alto = Math.max(altoCaja(doc, filasCliente, anchoCaja), altoCaja(doc, filasBici, anchoCaja))

  y = asegurarBloque(doc, y, alto)
  dibujarCaja(doc, 'Cliente', filasCliente, MARGEN, y, anchoCaja, alto)
  dibujarCaja(doc, 'Bicicleta', filasBici, MARGEN + anchoCaja + gap, y, anchoCaja, alto)
  return y + alto + ESPACIO
}

// ── Tablas de materiales y mano de obra ──────────────────────

// Opciones comunes de las tablas (colores, tipografía y márgenes).
function baseAutoTable() {
  return {
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: { top: 1.4, right: 2, bottom: 1.4, left: 2 },
      textColor: TEXTO,
      lineColor: BORDE,
      lineWidth: 0.2,
      overflow: 'linebreak',
    },
    headStyles: { fillColor: GRIS, textColor: BLANCO, fontStyle: 'bold', fontSize: 8, halign: 'left' },
    alternateRowStyles: { fillColor: FONDO_ALT },
    footStyles: { fillColor: BLANCO, textColor: GRIS, fontStyle: 'bold', fontSize: 8 },
    showFoot: 'never',
    margin: { left: MARGEN, right: MARGEN, top: MARGEN_Y, bottom: 18 },
  }
}

// Decide dónde empezar una tabla. Si la tabla cabe entera en una página pero
// no en el espacio que queda, salta de página antes de dibujar su título (así
// nunca queda un título huérfano ni se parte una tabla que entraría entera).
// Solo se permite partir una tabla cuando por sí sola supera una página.
function prepararTabla(doc, opciones, y) {
  const tmp = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  autoTable(tmp, { ...opciones, startY: MARGEN_Y })
  const altoTabla = tmp.lastAutoTable.finalY - MARGEN_Y
  const cabeEnUnaPagina = tmp.getNumberOfPages() === 1
  if (cabeEnUnaPagina && y + 3.2 + altoTabla > LIMITE_CONTENIDO) {
    doc.addPage()
    return MARGEN_Y
  }
  return asegurarBloque(doc, y, 28)
}

// Tabla de materiales (omitida si no hay líneas).
function tablaMateriales(doc, orden, y) {
  const materiales = orden.materiales || []
  if (!materiales.length) return y

  const opciones = {
    ...baseAutoTable(),
    head: [['Referencia', 'Descripción', 'Cant.', 'Precio', 'Dto %', 'IVA %', 'Importe']],
    body: materiales.map((linea) => [
      normalizarTexto(linea.referencia || ''),
      normalizarTexto(linea.descripcion || ''),
      normalizarTexto(fCantidad(linea.cantidad)),
      normalizarTexto(formatearEuros(linea.precioUnitario)),
      normalizarTexto(`${fPorcentaje(linea.descuento)} %`),
      normalizarTexto(`${fPorcentaje(linea.iva)} %`),
      normalizarTexto(formatearEuros(linea.precioNeto)),
    ]),
    columnStyles: {
      0: { cellWidth: 30 },
      2: { cellWidth: 14, halign: 'right' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 14, halign: 'right' },
      5: { cellWidth: 14, halign: 'right' },
      6: { cellWidth: 24, halign: 'right' },
    },
  }
  y = prepararTabla(doc, opciones, y)
  y = dibujarTituloSeccion(doc, 'Materiales', y)
  autoTable(doc, { ...opciones, startY: y })
  return doc.lastAutoTable.finalY + ESPACIO
}

// Tabla de mano de obra (omitida si no hay líneas).
function tablaManoObra(doc, orden, y) {
  const manoObra = orden.manoObra || []
  if (!manoObra.length) return y

  const opciones = {
    ...baseAutoTable(),
    head: [['Código', 'Descripción', 'Tiempo (h)', 'Precio/h', 'Importe']],
    body: manoObra.map((linea) => [
      normalizarTexto(linea.codigoOp || ''),
      normalizarTexto(linea.descripcion || ''),
      normalizarTexto(fCantidad(linea.tiempo)),
      normalizarTexto(formatearEuros(linea.precioHora)),
      normalizarTexto(formatearEuros(linea.importe)),
    ]),
    columnStyles: {
      0: { cellWidth: 28 },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
    },
  }
  y = prepararTabla(doc, opciones, y)
  y = dibujarTituloSeccion(doc, 'Mano de obra', y)
  autoTable(doc, { ...opciones, startY: y })
  return doc.lastAutoTable.finalY + ESPACIO
}


// ── Totales ──────────────────────────────────────────────────

// Altura de cada fila del bloque de totales y de la banda TOTAL. El recuadro
// "Conforme cliente" comparte fila y altura con el bloque de totales.
const ALTURA_FILA_TOTAL = 5.5
const ALTO_BANDA_TOTAL = 10

// Alto reservado bajo la banda TOTAL para la nota de validez del presupuesto.
const ALTO_NOTA_VALIDEZ = 6

// Días de validez de un presupuesto si no hay ajuste configurado.
const DIAS_VALIDEZ_POR_DEFECTO = 15

// Días de validez de un presupuesto (entero >= 1); por defecto 15.
function diasValidez(ajustes) {
  const dias = Number(ajustes?.diasValidezPresupuesto)
  return Number.isFinite(dias) && dias >= 1 ? Math.round(dias) : DIAS_VALIDEZ_POR_DEFECTO
}

// Nota que se imprime bajo los totales del documento.
function textoValidez(ajustes) {
  return normalizarTexto(`Presupuesto sin compromiso. Validez ${diasValidez(ajustes)} días.`)
}

// Filas (etiqueta, valor) del bloque de totales.
function filasTotales(orden) {
  const filas = [
    ['Subtotal materiales', formatearEuros(orden.subtotalMateriales)],
    ['Subtotal mano de obra', formatearEuros(orden.subtotalManoObra)],
  ]
  const descuento = Number(orden.descuentoGlobal) || 0
  if (descuento > 0) {
    const base = (Number(orden.subtotalMateriales) || 0) + (Number(orden.subtotalManoObra) || 0)
    filas.push([`Descuento global (${fPorcentaje(descuento)} %)`, `- ${formatearEuros(base * (descuento / 100))}`])
  }
  filas.push(['Base imponible', formatearEuros(orden.baseImponible)])
  const baseImponible = Number(orden.baseImponible) || 0
  const ivaValor = Number(orden.iva) || 0
  const tipoIva = baseImponible > 0 ? Math.round((ivaValor / baseImponible) * 100) : 21
  filas.push([`IVA ${tipoIva} %`, formatearEuros(orden.iva)])
  return filas
}

// Alto total del bloque de totales (filas + banda + nota de validez).
function altoBloqueTotales(orden) {
  return 2 + filasTotales(orden).length * ALTURA_FILA_TOTAL + 2 + ALTO_BANDA_TOTAL + ALTO_NOTA_VALIDEZ
}

// Dibuja el bloque de totales (a la derecha, 80 mm) y, en la misma fila, el
// recuadro "Conforme cliente" (a la izquierda, 95 mm) con la misma altura. El
// llamador decide el salto de página para que nunca se separen.
function dibujarTotalesYConforme(doc, orden, y, alto, ajustes = {}) {
  const anchoTotales = 80
  const anchoConforme = 95
  const x0 = DERECHA - anchoTotales

  const filas = filasTotales(orden)
  const alturaFila = ALTURA_FILA_TOTAL
  const altoBanda = ALTO_BANDA_TOTAL
  const altoFilas = filas.length * alturaFila

  // Totales a la derecha.
  let fy = y + 2 + alturaFila - 1.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...TEXTO)
  for (const [etiqueta, valor] of filas) {
    doc.text(normalizarTexto(etiqueta), x0, fy)
    doc.text(normalizarTexto(valor), DERECHA, fy, { align: 'right' })
    fy += alturaFila
  }

  const yBanda = y + 2 + altoFilas + 2
  doc.setFillColor(...NARANJA)
  doc.roundedRect(x0, yBanda, anchoTotales, altoBanda, 1.5, 1.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...BLANCO)
  doc.text('TOTAL', x0 + 4, yBanda + 7)
  doc.text(normalizarTexto(formatearEuros(orden.total)), DERECHA - 4, yBanda + 7, { align: 'right' })

  // Nota de validez del presupuesto bajo la banda TOTAL.
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...SUAVE)
  doc.text(textoValidez(ajustes), DERECHA, yBanda + altoBanda + 4.5, { align: 'right' })

  // Recuadro "Conforme cliente" a la izquierda.
  dibujarConforme(doc, MARGEN, y, anchoConforme, alto)
}

// ── Conforme cliente ─────────────────────────────────────────

// Recuadro "Conforme cliente" a la izquierda: título arriba y Firma y Fecha en
// dos líneas apiladas. Su altura coincide con la del bloque de totales.
function dibujarConforme(doc, x, y, ancho, alto) {
  doc.setDrawColor(...BORDE)
  doc.setLineWidth(0.2)
  doc.roundedRect(x, y, ancho, alto, 1.5, 1.5, 'S')

  doc.setFillColor(...GRIS)
  doc.roundedRect(x, y, ancho, 6, 1.5, 1.5, 'F')
  doc.rect(x, y + 4, ancho, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...BLANCO)
  doc.text('CONFORME CLIENTE', x + 3, y + 4.2)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...SUAVE)
  doc.setDrawColor(...BORDE)

  const yFecha = y + alto - 8
  const yFirma = yFecha - 11
  doc.text('Firma:', x + 3, yFirma)
  doc.line(x + 20, yFirma + 1, x + ancho - 3, yFirma + 1)
  doc.text('Fecha:', x + 3, yFecha)
  doc.line(x + 20, yFecha + 1, x + ancho - 3, yFecha + 1)
}

// ── Pie en todas las páginas ─────────────────────────────────

// Cláusula RGPD por defecto. {empresa} y {email} se sustituyen por los datos
// de la empresa configurados en el taller.
const CLAUSULA_RGPD_POR_DEFECTO =
  'Sus datos personales se tratan conforme al Reglamento (UE) 2016/679 (RGPD) para gestionar la reparación. ' +
  'Puede ejercer sus derechos dirigiéndose a {empresa} ({email}).'

// Prepara el texto de la cláusula RGPD: usa la configurada en el taller (o la
// de por defecto) y sustituye los marcadores {empresa} y {email}.
function textoClausula(ajustes, empresa) {
  const configurada = typeof ajustes?.clausulaRgpd === 'string' ? ajustes.clausulaRgpd.trim() : ''
  const texto = (configurada || CLAUSULA_RGPD_POR_DEFECTO)
    .replace(/\{empresa\}/g, empresa?.nombre || 'la empresa')
    .replace(/\{email\}/g, empresa?.email ? normalizarTexto(empresa.email) : '')
  // Limpia los restos que deja una plantilla sin email: "()" y espacios sueltos.
  return normalizarTexto(texto.replace(/\(\s*\)/g, '').replace(/\s+([.,])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim())
}

// Pie en todas las páginas: cláusula RGPD (6 pt) y "Página X de Y".
function dibujarPies(doc, empresa, ajustes = {}) {
  const total = doc.getNumberOfPages()
  const clausula = textoClausula(ajustes, empresa)

  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i)
    doc.setDrawColor(...BORDE)
    doc.setLineWidth(0.2)
    doc.line(MARGEN, ALTO - 14, DERECHA, ALTO - 14)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(...SUAVE)
    const lineas = doc.splitTextToSize(clausula, ANCHO_CONTENIDO - 32)
    doc.text(lineas, MARGEN, ALTO - 10.5)

    doc.setFontSize(7.5)
    doc.setTextColor(...TEXTO)
    doc.text(`Página ${i} de ${total}`, DERECHA, ALTO - 10.5, { align: 'right' })
  }
}


// ── Generación del documento ─────────────────────────────────

// Genera el PDF imprimible de una orden y devuelve el documento jsPDF.
export async function generarPdfOrden(orden, empresa = {}, ajustes = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.setFont('helvetica', 'normal')

  const logo = await cargarLogo(empresa?.logoUrl, LOGO_POR_DEFECTO)

  let y = dibujarCabecera(doc, orden, empresa, logo)
  y = dibujarFranjaDatos(doc, orden, y)
  y = dibujarCajas(doc, orden, y)

  if (orden.problema) {
    y = dibujarRecuadroTexto(doc, 'Problema indicado por el cliente', orden.problema, y)
  }

  y = tablaMateriales(doc, orden, y)
  y = tablaManoObra(doc, orden, y)

  if (orden.descripcion) y = dibujarSeccionTexto(doc, 'Trabajos realizados', orden.descripcion, y)
  if (orden.diagnostico) y = dibujarSeccionTexto(doc, 'Diagnóstico', orden.diagnostico, y)
  if (orden.recomendaciones) y = dibujarSeccionTexto(doc, 'Recomendaciones', orden.recomendaciones, y)

  // TOTALES y CONFORME CLIENTE van siempre juntos, en la misma fila y en la
  // misma página: si no caben, pasan juntos a la página siguiente.
  const altoTotales = altoBloqueTotales(orden)
  if (y + altoTotales > LIMITE_CONTENIDO) {
    doc.addPage()
    y = MARGEN_Y
  }
  dibujarTotalesYConforme(doc, orden, y, altoTotales, ajustes)

  dibujarPies(doc, empresa, ajustes)
  doc.setPage(1)

  return doc
}

// Nombre de archivo del PDF de una orden (p. ej. "ORD-2026-0001.pdf").
export function nombrePdfOrden(orden) {
  const base = String(orden?.numeroOrden || 'orden').trim() || 'orden'
  const limpio = base.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${limpio || 'orden'}.pdf`
}

