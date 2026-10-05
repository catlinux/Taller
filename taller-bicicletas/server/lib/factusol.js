// Conversión de órdenes de reparación a los ficheros de importación de
// albaranes de Factusol: ALB.xlsx (una fila por albarán, cabeceras) y
// LAL.xlsx (una fila por línea de albarán).
//
// Módulo puro: no usa Prisma, ni Express, ni acceso a disco. Recibe las
// órdenes tal y como las devuelve Prisma, junto con la configuración de
// Factusol, y devuelve las filas de cada fichero y un Buffer .xlsx listo
// para descargar o guardar.
//
// Factusol importa desde dos Excel: fila 1 = cabeceras, datos desde la fila
// 2, sin filas vacías y una sola hoja llamada «Hoja1». La clave de un albarán
// es la columna A (tipo de documento = serie) más la columna B (número de
// documento). Si esa clave ya existe, Factusol la sobrescribe, así que los
// valores deben ser exactos y no puede haber números repetidos en un lote.

import XLSX from 'xlsx'

// Tipo de IVA que se aplica siempre a la mano de obra.
export const IVA_MANO_OBRA = 21

// Cabeceras literales de ALB.xlsx (112 columnas, A..DH). Se copian tal cual
// del Excel de ejemplo de Factusol, incluidas sus erratas (por ejemplo el
// espacio final de «Importe de financiación 1 »).
export const CABECERAS_ALB = [
  'Tipo de documento',
  'Número de documento',
  'Referencia',
  'Fecha',
  'Estado',
  'Almacén',
  'Agente',
  'Código del proveedor',
  'Código de cliente',
  'Nombre del cliente',
  'Domicilio del cliente',
  'Población',
  'Código postal',
  'Provincia',
  'N.I.F.',
  'Tipo de IVA',
  'Recargo de equivalencia',
  'Teléfono del cliente',
  'Importe neto 1',
  'Importe neto 2',
  'Importe neto 3',
  'Porcentaje de descuento 1',
  'Porcentaje de descuento 2',
  'Porcentaje de descuento 3',
  'Importe de descuento 1',
  'Importe de descuento 2',
  'Importe de descuento 3',
  'Porcentaje de pronto pago 1',
  'Porcentaje de pronto pago 2',
  'Porcentaje de pronto pago 3',
  'Importe pronto pago 1',
  'Importe pronto pago 2',
  'Importe pronto pago 3',
  'Porcentaje portes 1',
  'Porcentaje portes 2',
  'Porcentaje portes 3',
  'Importe portes 1',
  'Importe portes 2',
  'Importe portes 3',
  'Porcentaje de financiación 1',
  'Porcentaje de financiación 2',
  'Porcentaje de financiación 3',
  'Importe de financiación 1 ',
  'Importe de financiación 2',
  'Importe de financiación 3',
  'Base imponible 1',
  'Base imponible 2',
  'Base imponible 3',
  'Porcentaje IVA 1',
  'Porcentaje IVA 2',
  'Porcentaje IVA 3',
  'Importe IVA 1',
  'Importe IVA 2',
  'Importe IVA 3',
  'Porcentaje de recargo de equivalencia 1',
  'Porcentaje de recargo de equivalencia 2',
  'Porcentaje de recargo de equivalencia 3',
  'Importe de recargo de equivalencia 1',
  'Importe de recargo de equivalencia 2',
  'Importe de recargo de equivalencia 3',
  'Porcentaje de la retención',
  'Importe de la retención',
  'Total',
  'Forma de pago',
  'Portes',
  'Texto de portes',
  '1ª línea de observaciones',
  '2ª línea de observaciones',
  'Obra de entrega',
  'Remitido por',
  'Embalado por',
  'A la atención de',
  'Referencia',
  'Nº de su pedido',
  'Fecha de su pedido',
  'Cobrado',
  'Traspasado a contabilidad',
  'Impreso',
  'Transportista',
  'Número de expedición 1',
  'Número de expedición 2',
  'Anotaciones privadas',
  'Documentos externos asociados',
  'Banco del cliente',
  'Enviado a través del fichero',
  'Hora de creación',
  'Comentario después de las líneas de detalle',
  'Usuario que creó el documento',
  'Último usuario que modificó el documento',
  'Fax',
  'Importe neto exento',
  'Porcentaje de descuento exento',
  'Importe de descuento exento',
  'Porcentaje pronto pago exento',
  'Importe de pronto pago exento',
  'Porcentaje de portes exento',
  'Importe de portes 4',
  'Porcentaje de financiación exento',
  'Importe de financiación exento',
  'Base imponible exenta',
  'Enviado por mail',
  'Permisos y contraseña del documento',
  'Ticket, porcentaje de descuento',
  'Ticket, importe de descuento',
  'Caja en que se creó el documento',
  'IBAN del banco',
  'BIC del banco',
  'Nombre del banco',
  'Entidad de la cuenta del cliente',
  'Oficina de la cuenta del cliente',
  'Dígitos de control de la cuenta del cliente',
  'Número de la cuenta del cliente',
]

// Cabeceras literales de LAL.xlsx (31 columnas, A..AE), también con sus
// erratas («IVA inlcuido...», «Precio IVA inluido...»).
export const CABECERAS_LAL = [
  'Tipo de documento',
  'Número de documento',
  'Posición de la línea',
  'Artículo',
  'Descripción',
  'Cantidad',
  'Porcentaje descuento 1',
  'Porcentaje descuento 2',
  'Porcentaje descuento 3',
  'Precio del artículo',
  'Total',
  'Tipo de IVA',
  'Documento que creó el albarán',
  'Tipo de documento',
  'Código del documento',
  'Precio de costo',
  'Bultos',
  'Comisión del agente',
  'Campo uso interno',
  'Ejercicio del que proviene la validación',
  'Alto',
  'Ancho',
  'Fondo',
  'Campo uso interno',
  'Campo uso interno',
  'IVA inlcuido en la línea',
  'Precio IVA inluido en la línea',
  'Total IVA inlcuido en la línea',
  'Talla',
  'Color',
  'Imagen asociada',
]

// Índice 0-based de una columna a partir de su letra (A=0, B=1, ..., AA=26).
function indice(letra) {
  let numero = 0
  for (const caracter of letra) {
    numero = numero * 26 + (caracter.charCodeAt(0) - 64)
  }
  return numero - 1
}

// Columnas que se rellenan en ALB.xlsx.
const ALB = {
  A: indice('A'), B: indice('B'), C: indice('C'), D: indice('D'), E: indice('E'), F: indice('F'),
  I: indice('I'), J: indice('J'), K: indice('K'), L: indice('L'), M: indice('M'), N: indice('N'),
  O: indice('O'), P: indice('P'), Q: indice('Q'), R: indice('R'),
  S: indice('S'), V: indice('V'), Y: indice('Y'),
  AB: indice('AB'), AS: indice('AS'), AT: indice('AT'), AW: indice('AW'), AZ: indice('AZ'),
  BC: indice('BC'), BJ: indice('BJ'), BK: indice('BK'), BL: indice('BL'), BM: indice('BM'),
  BO: indice('BO'), BP: indice('BP'), BX: indice('BX'), BY: indice('BY'),
  CG: indice('CG'), CH: indice('CH'),
  CM: indice('CM'), CN: indice('CN'), CO: indice('CO'),
  CP: indice('CP'), CU: indice('CU'), CV: indice('CV'), CW: indice('CW'),
}

// Columnas que se rellenan en LAL.xlsx.
const LAL = {
  A: indice('A'), B: indice('B'), C: indice('C'), D: indice('D'), E: indice('E'), F: indice('F'),
  G: indice('G'), J: indice('J'), K: indice('K'), L: indice('L'), P: indice('P'), Z: indice('Z'),
}

const NUM_COLUMNAS_ALB = CABECERAS_ALB.length
const NUM_COLUMNAS_LAL = CABECERAS_LAL.length

// Estados de orden que se pueden facturar (el resto se bloquea).
const ESTADOS_FACTURABLES = ['Finalizada', 'Entregada']

// Redondeo a 2 decimales estable (misma lógica que server/routes/ordenes.js).
function redondear2(valor) {
  const escalado = Number(`${Number(Number(valor).toFixed(8))}e2`)
  return (Number.isFinite(escalado) ? Math.round(escalado) : Math.round(Number(valor) * 100)) / 100
}

// Convierte un valor a número finito; si no lo es, devuelve 0.
function numero(valor) {
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

// ¿Es un número finito y no negativo?
function esNumeroNoNegativo(valor) {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0
}

// Limpia un texto: quita saltos de línea y caracteres de control (los
// sustituye por un espacio), colapsa espacios y recorta al tamaño máximo.
// Devuelve null si el resultado queda vacío (celda vacía en el Excel).
function limpiarTexto(valor, max) {
  if (valor === null || valor === undefined) return null
  const texto = String(valor)
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (texto === '') return null
  if (max && texto.length > max) return texto.slice(0, max).trim()
  return texto
}

// Junta varios fragmentos de texto (ignorando los vacíos) y lo limpia.
function juntarTexto(fragmentos, max) {
  const unido = fragmentos
    .filter((f) => f !== null && f !== undefined && String(f).trim() !== '')
    .join(' ')
  return limpiarTexto(unido, max)
}

// Número de serie de fecha de Excel a partir del día/mes/año LOCAL, para que
// la fecha no cambie de día por la zona horaria.
function fechaExcel(fecha) {
  const dias = Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()) / 86400000
  return Math.round(dias) + 25569
}

// Hora del día como fracción de 24 h (0 = 00:00, 0.5 = 12:00).
function horaExcel(fecha) {
  return (fecha.getHours() * 3600 + fecha.getMinutes() * 60 + fecha.getSeconds()) / 86400
}

// Tramo de IVA de una línea: 0, 1 o 2 según la posición del porcentaje en
// config.tiposIva, o 3 si el porcentaje es 0 % (exento) o no está configurado.
function tramoIva(porcentaje, tiposIva) {
  if (porcentaje === 0) return 3
  const posicion = tiposIva.indexOf(porcentaje)
  return posicion === -1 ? 3 : posicion
}

// Texto de configuración con valor por defecto y recorte al tamaño máximo.
function textoConfig(valor, max, porDefecto) {
  const texto = valor === null || valor === undefined ? '' : String(valor).trim()
  if (texto === '') return porDefecto
  return texto.length > max ? texto.slice(0, max) : texto
}

// Valida y normaliza la configuración de Factusol. Devuelve { config } o
// { error } con el motivo en español.
export function normalizarConfig(entrada) {
  const datos = entrada || {}

  const serie = Number(datos.serie)
  if (!Number.isInteger(serie) || serie < 1 || serie > 9) {
    return { error: 'La serie debe ser un número entero entre 1 y 9' }
  }

  let tiposIva = datos.tiposIva
  if (tiposIva === undefined || tiposIva === null) {
    tiposIva = [21, 10, 4]
  }
  if (
    !Array.isArray(tiposIva) ||
    tiposIva.length !== 3 ||
    !tiposIva.every((t) => typeof t === 'number' && Number.isFinite(t))
  ) {
    return { error: 'Los tipos de IVA deben ser una lista de 3 números' }
  }

  return {
    config: {
      serie,
      almacen: textoConfig(datos.almacen, 3, 'GEN'),
      formaPago: textoConfig(datos.formaPago, 3, null),
      articuloManoObra: textoConfig(datos.articuloManoObra, 13, ''),
      tiposIva: tiposIva.map((t) => Number(t)),
    },
  }
}

// Número de albarán de Factusol (6 caracteres «AANNNN») a partir del número
// de orden «ORD-AAAA-NNNN». Devuelve null si no encaja en el formato.
export function numeroAlbaran(numeroOrden) {
  if (typeof numeroOrden !== 'string') return null
  const coincidencia = /^ORD-(\d{4})-(\d{4})$/.exec(numeroOrden)
  if (!coincidencia) return null
  const anio = Number(coincidencia[1])
  const numero = Number(coincidencia[2])
  if (anio < 2000 || anio > 2099 || numero < 1 || numero > 9999) return null
  return `${String(anio).slice(-2)}${String(numero).padStart(4, '0')}`
}

// Fecha del albarán: la de finalización y, si no hay, la de última modificación.
function fechaAlbaran(orden) {
  return orden.fechaFinalizacion || orden.updatedAt || new Date()
}

// «marca modelo» de la bicicleta y, si hay número de serie, « · Nº serie X».
function textoBicicleta(bicicleta) {
  if (!bicicleta) return null
  let texto = juntarTexto([bicicleta.marca, bicicleta.modelo], 0) || ''
  if (bicicleta.numeroSerie) {
    texto = texto ? `${texto} · Nº serie ${bicicleta.numeroSerie}` : `Nº serie ${bicicleta.numeroSerie}`
  }
  return limpiarTexto(texto, 100)
}

// Nombre y apellidos del cliente, sin espacios sobrantes, máximo 50.
function nombreCliente(cliente) {
  if (!cliente) return null
  return juntarTexto([cliente.nombre, cliente.apellidos], 50)
}

// Construye la fila de ALB.xlsx (112 posiciones) de un albarán.
function construirFilaAlb(orden, config, calculo, albaran, ahora) {
  const fila = new Array(NUM_COLUMNAS_ALB).fill(null)
  const cliente = orden.cliente || {}
  const descuentoGlobal = calculo.descuentoGlobal

  fila[ALB.A] = config.serie
  fila[ALB.B] = albaran
  fila[ALB.C] = limpiarTexto(orden.numeroOrden, 12) // referencia: máx. 12 en Factusol
  fila[ALB.D] = fechaExcel(fechaAlbaran(orden))
  fila[ALB.E] = 0
  fila[ALB.F] = limpiarTexto(config.almacen, 3)
  fila[ALB.I] = cliente.codigoFactusol === null || cliente.codigoFactusol === undefined
    ? null
    : cliente.codigoFactusol
  fila[ALB.J] = nombreCliente(cliente)
  fila[ALB.K] = limpiarTexto(cliente.direccion, 100)
  fila[ALB.L] = limpiarTexto(cliente.poblacion, 30)
  fila[ALB.M] = limpiarTexto(cliente.codigoPostal, 10)
  fila[ALB.N] = limpiarTexto(cliente.provincia, 40)
  fila[ALB.O] = limpiarTexto(cliente.dni, 18)
  fila[ALB.P] = 0
  fila[ALB.Q] = 0
  fila[ALB.R] = limpiarTexto(cliente.telefono, 20)

  for (let i = 0; i < 3; i++) {
    fila[ALB.S + i] = calculo.netos[i]
    fila[ALB.V + i] = descuentoGlobal
    fila[ALB.Y + i] = calculo.descuentos[i]
    fila[ALB.AT + i] = calculo.bases[i]
    fila[ALB.AW + i] = config.tiposIva[i]
    fila[ALB.AZ + i] = calculo.ivas[i]
  }

  // Pronto pago, portes, financiación, recargo de equivalencia y retención.
  for (let c = ALB.AB; c <= ALB.AS; c++) fila[c] = 0
  for (let c = ALB.BC; c <= ALB.BJ; c++) fila[c] = 0
  for (let c = ALB.CP; c <= ALB.CU; c++) fila[c] = 0

  fila[ALB.BK] = calculo.total
  fila[ALB.BL] = limpiarTexto(config.formaPago, 3)
  fila[ALB.BM] = 0
  fila[ALB.BO] = `Orden de reparación ${orden.numeroOrden}`
  fila[ALB.BP] = textoBicicleta(orden.bicicleta)
  fila[ALB.BX] = 0
  fila[ALB.BY] = 0
  fila[ALB.CG] = 0
  fila[ALB.CH] = horaExcel(ahora)
  fila[ALB.CM] = calculo.netoExento
  fila[ALB.CN] = descuentoGlobal
  fila[ALB.CO] = calculo.descuentoExento
  fila[ALB.CV] = calculo.baseExenta
  fila[ALB.CW] = 0

  return fila
}

// Construye una fila de LAL.xlsx (31 posiciones) para una línea.
function construirFilaLal(config, albaran, posicion, linea) {
  const fila = new Array(NUM_COLUMNAS_LAL).fill(null)
  fila[LAL.A] = config.serie
  fila[LAL.B] = albaran
  fila[LAL.C] = posicion
  fila[LAL.D] = limpiarTexto(linea.referencia, 13)
  fila[LAL.E] = limpiarTexto(linea.descripcion, 0)
  fila[LAL.F] = linea.cantidad
  fila[LAL.G] = linea.descuento
  fila[LAL.J] = linea.precio
  fila[LAL.K] = linea.total
  fila[LAL.L] = linea.tramo
  fila[LAL.P] = linea.precioCompra === null || linea.precioCompra === undefined
    ? null
    : linea.precioCompra
  fila[LAL.Z] = 0
  return fila
}

// Calcula los totales del albarán al estilo Factusol (base y IVA por tramo) y
// devuelve la fila de ALB, las filas de LAL, el total y los avisos.
function calcularOrden(orden, config, albaran, ahora) {
  const materiales = [...(orden.materiales || [])].sort((a, b) => a.id - b.id)
  const manoObra = [...(orden.manoObra || [])].sort((a, b) => a.id - b.id)
  const tiposIva = config.tiposIva
  const descuentoGlobal = numero(orden.descuentoGlobal)

  const netos = [0, 0, 0]
  let netoExento = 0
  const filasLal = []
  let posicion = 1

  for (const material of materiales) {
    const total = redondear2(numero(material.precioNeto))
    const tramo = tramoIva(numero(material.iva), tiposIva)
    if (tramo === 3) netoExento += total
    else netos[tramo] += total
    filasLal.push(construirFilaLal(config, albaran, posicion, {
      referencia: material.referencia,
      descripcion: material.descripcion,
      cantidad: material.cantidad,
      descuento: numero(material.descuento),
      precio: material.precioUnitario,
      total,
      tramo,
      precioCompra: material.articulo ? material.articulo.precioCompra : null,
    }))
    posicion++
  }

  for (const linea of manoObra) {
    const total = redondear2(numero(linea.importe))
    const tramo = tramoIva(IVA_MANO_OBRA, tiposIva)
    if (tramo === 3) netoExento += total
    else netos[tramo] += total
    filasLal.push(construirFilaLal(config, albaran, posicion, {
      referencia: config.articuloManoObra,
      descripcion: linea.descripcion,
      cantidad: linea.tiempo,
      descuento: 0,
      precio: linea.precioHora,
      total,
      tramo,
      precioCompra: null,
    }))
    posicion++
  }

  for (let i = 0; i < 3; i++) netos[i] = redondear2(netos[i])
  netoExento = redondear2(netoExento)

  const descuentos = [0, 0, 0]
  const bases = [0, 0, 0]
  const ivas = [0, 0, 0]
  let total = 0
  for (let i = 0; i < 3; i++) {
    descuentos[i] = redondear2((netos[i] * descuentoGlobal) / 100)
    bases[i] = redondear2(netos[i] - descuentos[i])
    ivas[i] = redondear2((bases[i] * tiposIva[i]) / 100)
    total += bases[i] + ivas[i]
  }
  const descuentoExento = redondear2((netoExento * descuentoGlobal) / 100)
  const baseExenta = redondear2(netoExento - descuentoExento)
  total = redondear2(total + baseExenta)

  const avisos = []
  const totalApp = numero(orden.total)
  if (Math.abs(redondear2(total - totalApp)) > 0.01) {
    avisos.push(
      `El total para Factusol (${total.toFixed(2)}) no coincide con el de la aplicación (${totalApp.toFixed(2)})`,
    )
  }

  const filaAlb = construirFilaAlb(orden, config, {
    descuentoGlobal,
    netos,
    descuentos,
    bases,
    ivas,
    total,
    netoExento,
    descuentoExento,
    baseExenta,
  }, albaran, ahora)

  return { filaAlb, filasLal, total, avisos }
}

// Motivos (en español) por los que una orden no se puede exportar.
function motivosBloqueo(orden, config, albaran, incluirExportadas) {
  const motivos = []

  if (!ESTADOS_FACTURABLES.includes(orden.estado)) {
    motivos.push('La orden no está finalizada ni entregada')
  }

  const cliente = orden.cliente
  if (!cliente || cliente.codigoFactusol === null || cliente.codigoFactusol === undefined) {
    motivos.push('El cliente no tiene código de Factusol')
  }

  if (!incluirExportadas && orden.exportadaFactusolEn) {
    motivos.push('La orden ya se exportó a Factusol')
  }

  const materiales = orden.materiales || []
  const manoObra = orden.manoObra || []
  if (materiales.length === 0 && manoObra.length === 0) {
    motivos.push('La orden no tiene líneas que exportar')
  }

  if (albaran === null) {
    motivos.push('El número de orden no tiene el formato esperado (ORD-AAAA-NNNN)')
  }

  for (const material of materiales) {
    const referencia = material.referencia === null || material.referencia === undefined
      ? ''
      : String(material.referencia)
    if (referencia.trim().length > 13) {
      motivos.push(`La referencia ${referencia} supera los 13 caracteres`)
    }
    if (material.iva !== 0 && !config.tiposIva.includes(material.iva)) {
      motivos.push(`El material ${referencia} tiene un IVA del ${material.iva}% que no está configurado`)
    }
    if (
      !esNumeroNoNegativo(material.cantidad) ||
      !esNumeroNoNegativo(material.precioUnitario) ||
      !esNumeroNoNegativo(material.precioNeto)
    ) {
      motivos.push(`La línea del material ${referencia} tiene cantidad, precio o importe no válidos`)
    }
  }

  for (const linea of manoObra) {
    if (
      !esNumeroNoNegativo(linea.tiempo) ||
      !esNumeroNoNegativo(linea.precioHora) ||
      !esNumeroNoNegativo(linea.importe)
    ) {
      motivos.push(`La línea de mano de obra ${linea.codigoOp || ''} tiene tiempo, precio o importe no válidos`)
    }
  }

  return motivos
}

// Completa una configuración ya normalizada con sus valores por defecto.
function completarConfig(config) {
  const datos = config || {}
  return {
    serie: datos.serie,
    almacen: datos.almacen === undefined || datos.almacen === null ? 'GEN' : datos.almacen,
    formaPago: datos.formaPago === undefined ? null : datos.formaPago,
    articuloManoObra: datos.articuloManoObra === undefined || datos.articuloManoObra === null
      ? ''
      : datos.articuloManoObra,
    tiposIva: Array.isArray(datos.tiposIva) && datos.tiposIva.length === 3
      ? datos.tiposIva
      : [21, 10, 4],
  }
}

// Prepara la exportación de un lote de órdenes: filas de ALB y LAL de las
// órdenes válidas, resumen de las incluidas (con sus avisos) y las bloqueadas
// con todos sus motivos. config debe venir de normalizarConfig.
export function prepararExportacion(ordenes, config, { incluirExportadas = false, ahora = new Date() } = {}) {
  const cfg = completarConfig(config)
  const lista = Array.isArray(ordenes) ? ordenes : []

  const albaranes = lista.map((orden) => numeroAlbaran(orden.numeroOrden))
  const repeticiones = new Map()
  for (const albaran of albaranes) {
    if (albaran) repeticiones.set(albaran, (repeticiones.get(albaran) || 0) + 1)
  }

  const incluidas = []
  const bloqueadas = []
  const filasAlb = []
  const filasLal = []

  for (let i = 0; i < lista.length; i++) {
    const orden = lista[i]
    const albaran = albaranes[i]
    const motivos = motivosBloqueo(orden, cfg, albaran, incluirExportadas)
    if (albaran && repeticiones.get(albaran) > 1) {
      motivos.push(`El albarán ${albaran} está repetido en el lote`)
    }

    if (motivos.length > 0) {
      bloqueadas.push({ ordenId: orden.id, numeroOrden: orden.numeroOrden, motivos })
      continue
    }

    const calculo = calcularOrden(orden, cfg, albaran, ahora)
    for (const fila of calculo.filasLal) filasLal.push(fila)
    filasAlb.push(calculo.filaAlb)
    incluidas.push({
      ordenId: orden.id,
      numeroOrden: orden.numeroOrden,
      albaran,
      total: calculo.total,
      avisos: calculo.avisos,
    })
  }

  return { incluidas, bloqueadas, filasAlb, filasLal }
}

// Columnas numéricas enteras (tipo N) de ALB y LAL: quedan con formato General,
// como en los Excel de ejemplo de Factusol; solo los importes llevan «0.00».
const CABECERAS_ENTERAS = new Set([
  'Tipo de documento', 'Estado', 'Agente', 'Código de cliente', 'Tipo de IVA',
  'Recargo de equivalencia', 'Portes', 'Obra de entrega', 'Cobrado',
  'Traspasado a contabilidad', 'Transportista', 'Banco del cliente',
  'Enviado a través del fichero', 'Usuario que creó el documento',
  'Último usuario que modificó el documento', 'Enviado por mail',
  'Caja en que se creó el documento', 'Posición de la línea', 'Bultos',
  'IVA inlcuido en la línea',
])

// Genera el Buffer .xlsx de una hoja «Hoja1» a partir de las cabeceras y las
// filas. Aplica los formatos que espera Factusol: número de documento y textos
// como texto («@»), la fecha como dd/mm/yyyy, la hora como hh:mm, los enteros
// en General y los importes con dos decimales («0.00»).
export function generarLibro(cabeceras, filas) {
  const hoja = XLSX.utils.aoa_to_sheet([cabeceras, ...filas])
  const rango = XLSX.utils.decode_range(hoja['!ref'])

  for (let r = 0; r <= rango.e.r; r++) {
    for (let c = 0; c <= rango.e.c; c++) {
      const celda = hoja[XLSX.utils.encode_cell({ r, c })]
      if (!celda) continue
      const cabecera = cabeceras[c]
      if (r === 0) {
        celda.z = '@'
      } else if (cabecera === 'Número de documento') {
        celda.z = '@'
      } else if (cabecera === 'Fecha') {
        celda.z = 'dd/mm/yyyy'
      } else if (cabecera === 'Hora de creación') {
        celda.z = 'hh:mm'
      } else if (typeof celda.v === 'string') {
        celda.z = '@'
      } else if (typeof celda.v === 'number' && !CABECERAS_ENTERAS.has(cabecera)) {
        celda.z = '0.00'
      }
    }
  }

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Hoja1')
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' })
}
