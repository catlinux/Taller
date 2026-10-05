import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx'
import {
  CABECERAS_ALB,
  CABECERAS_LAL,
  normalizarConfig,
  numeroAlbaran,
  prepararExportacion,
  generarLibro,
} from './factusol.js'
import { calcularTotales } from '../routes/ordenes.js'

// Pruebas de la exportación a Factusol (ficheros de importación ALB y LAL).

// Orden de ejemplo con la forma que devuelve Prisma.
function crearOrden(overrides = {}) {
  return {
    id: 1,
    numeroOrden: 'ORD-2026-0012',
    estado: 'Finalizada',
    fechaFinalizacion: new Date(2026, 9, 5, 10, 0, 0),
    updatedAt: new Date(2026, 9, 5, 10, 0, 0),
    descuentoGlobal: 0,
    total: 0,
    exportadaFactusolEn: null,
    cliente: {
      numeroCliente: 10110,
      codigoFactusol: 10110,
      nombre: 'Rompecadenas',
      apellidos: 'S.L.',
      dni: 'B12345678',
      direccion: 'Calle Mayor 1',
      codigoPostal: '08001',
      poblacion: 'Barcelona',
      provincia: 'Barcelona',
      telefono: '931234567',
    },
    bicicleta: { marca: 'Orbea', modelo: 'Alma', numeroSerie: 'SN-123' },
    materiales: [],
    manoObra: [],
    ...overrides,
  }
}

// Orden con 2 materiales (uno con 10 % de descuento) + 1 línea de mano de obra
// y 5 % de descuento global, elegida para que el total de Factusol coincida con
// el de la aplicación.
function ordenEjemplo(overrides = {}) {
  const materiales = [
    {
      id: 1,
      referencia: 'CAM0001',
      descripcion: 'Cadena',
      cantidad: 2,
      precioUnitario: 50,
      descuento: 0,
      precioNeto: 100,
      iva: 21,
      articulo: { precioCompra: 30 },
    },
    {
      id: 2,
      referencia: 'CUB0002',
      descripcion: 'Cubierta',
      cantidad: 2,
      precioUnitario: 50,
      descuento: 10,
      precioNeto: 90,
      iva: 10,
      articulo: null,
    },
  ]
  const manoObra = [
    { id: 1, codigoOp: 'MO001', descripcion: 'Montaje', tiempo: 1, precioHora: 20, importe: 20 },
  ]
  const base = crearOrden({
    descuentoGlobal: 5,
    materiales,
    manoObra,
    ...overrides,
  })
  base.total = calcularTotales(materiales, manoObra, base.descuentoGlobal).total
  return base
}

const CONFIG = normalizarConfig({ serie: 1 }).config
const AHORA = new Date(2026, 9, 5, 10, 0, 0)

test('CABECERAS_ALB tiene 112 columnas con las cabeceras clave', () => {
  assert.equal(CABECERAS_ALB.length, 112)
  assert.equal(CABECERAS_ALB[0], 'Tipo de documento')
  assert.equal(CABECERAS_ALB[1], 'Número de documento')
  assert.equal(CABECERAS_ALB[2], 'Referencia')
  assert.equal(CABECERAS_ALB[3], 'Fecha')
  assert.equal(CABECERAS_ALB[42], 'Importe de financiación 1 ')
  assert.equal(CABECERAS_ALB[45], 'Base imponible 1')
  assert.equal(CABECERAS_ALB[62], 'Total')
  assert.equal(CABECERAS_ALB[90], 'Importe neto exento')
  assert.equal(CABECERAS_ALB[111], 'Número de la cuenta del cliente')
})

test('CABECERAS_LAL tiene 31 columnas con las cabeceras y erratas de Factusol', () => {
  assert.equal(CABECERAS_LAL.length, 31)
  assert.equal(CABECERAS_LAL[0], 'Tipo de documento')
  assert.equal(CABECERAS_LAL[3], 'Artículo')
  assert.equal(CABECERAS_LAL[9], 'Precio del artículo')
  assert.equal(CABECERAS_LAL[10], 'Total')
  assert.equal(CABECERAS_LAL[11], 'Tipo de IVA')
  assert.equal(CABECERAS_LAL[25], 'IVA inlcuido en la línea')
  assert.equal(CABECERAS_LAL[30], 'Imagen asociada')
})

test('normalizarConfig exige una serie entera entre 1 y 9', () => {
  assert.equal(normalizarConfig({}).error, 'La serie debe ser un número entero entre 1 y 9')
  assert.equal(normalizarConfig({ serie: 0 }).error, 'La serie debe ser un número entero entre 1 y 9')
  assert.equal(normalizarConfig({ serie: 10 }).error, 'La serie debe ser un número entero entre 1 y 9')
  assert.equal(normalizarConfig({ serie: 1.5 }).error, 'La serie debe ser un número entero entre 1 y 9')
  assert.equal(normalizarConfig({ serie: 3 }).config.serie, 3)
  assert.equal(normalizarConfig({ serie: '2' }).config.serie, 2)
})

test('normalizarConfig aplica los valores por defecto', () => {
  const { config } = normalizarConfig({ serie: 1 })
  assert.equal(config.almacen, 'GEN')
  assert.equal(config.formaPago, null)
  assert.equal(config.articuloManoObra, '')
  assert.deepEqual(config.tiposIva, [21, 10, 4])
})

test('normalizarConfig recorta los textos y valida los tipos de IVA', () => {
  const { config } = normalizarConfig({ serie: 1, almacen: 'GENERAL', formaPago: 'CONT', articuloManoObra: 'MO-1234567890123' })
  assert.equal(config.almacen, 'GEN')
  assert.equal(config.formaPago, 'CON')
  assert.equal(config.articuloManoObra, 'MO-1234567890')
  assert.equal(normalizarConfig({ serie: 1, tiposIva: [21, 10] }).error, 'Los tipos de IVA deben ser una lista de 3 números')
  assert.equal(normalizarConfig({ serie: 1, tiposIva: ['21', 10, 4] }).error, 'Los tipos de IVA deben ser una lista de 3 números')
  assert.deepEqual(normalizarConfig({ serie: 1, tiposIva: [16, 8, 0] }).config.tiposIva, [16, 8, 0])
})

test('normalizarConfig valida el cliente genérico (entero 0-99999 o vacío)', () => {
  const error = 'El cliente genérico debe ser un número entero entre 0 y 99999'
  assert.equal(normalizarConfig({ serie: 1 }).config.clienteGenerico, null)
  assert.equal(normalizarConfig({ serie: 1, clienteGenerico: null }).config.clienteGenerico, null)
  assert.equal(normalizarConfig({ serie: 1, clienteGenerico: '' }).config.clienteGenerico, null)
  assert.equal(normalizarConfig({ serie: 1, clienteGenerico: 0 }).config.clienteGenerico, 0)
  assert.equal(normalizarConfig({ serie: 1, clienteGenerico: 1 }).config.clienteGenerico, 1)
  assert.equal(normalizarConfig({ serie: 1, clienteGenerico: 99999 }).config.clienteGenerico, 99999)
  assert.equal(normalizarConfig({ serie: 1, clienteGenerico: 100000 }).error, error)
  assert.equal(normalizarConfig({ serie: 1, clienteGenerico: -1 }).error, error)
  assert.equal(normalizarConfig({ serie: 1, clienteGenerico: 2.5 }).error, error)
  assert.equal(normalizarConfig({ serie: 1, clienteGenerico: 'abc' }).error, error)
})

test('numeroAlbaran convierte los números de orden válidos', () => {
  assert.equal(numeroAlbaran('ORD-2026-0012'), '260012')
  assert.equal(numeroAlbaran('ORD-2000-0001'), '000001')
  assert.equal(numeroAlbaran('ORD-2099-9999'), '999999')
  assert.equal(numeroAlbaran('ORD-2026-9999'), '269999')
})

test('numeroAlbaran rechaza los números de orden no válidos', () => {
  assert.equal(numeroAlbaran('ORD-1999-0001'), null)
  assert.equal(numeroAlbaran('ORD-2100-0001'), null)
  assert.equal(numeroAlbaran('ORD-2026-0000'), null)
  assert.equal(numeroAlbaran('ORD-2026-10000'), null)
  assert.equal(numeroAlbaran('ORD-2026-12'), null)
  assert.equal(numeroAlbaran('ord-2026-0012'), null)
  assert.equal(numeroAlbaran('2026-0012'), null)
  assert.equal(numeroAlbaran(null), null)
})

test('prepararExportacion genera una fila de ALB con las columnas clave', () => {
  const { incluidas, bloqueadas, filasAlb } = prepararExportacion([ordenEjemplo()], CONFIG, { ahora: AHORA })
  assert.equal(bloqueadas.length, 0)
  assert.equal(incluidas.length, 1)
  assert.equal(filasAlb.length, 1)

  const fila = filasAlb[0]
  assert.equal(fila.length, 112)
  assert.equal(fila[0], 1) // A tipo de documento (serie)
  assert.equal(fila[1], '260012') // B número de documento
  assert.equal(fila[2], 'ORD26-0012') // referencia abreviada: cabe en 12 sin perder el número
  assert.equal(fila[3], 46300) // D fecha (5/10/2026)
  assert.equal(fila[4], 0) // E estado
  assert.equal(fila[5], 'GEN') // F almacén
  assert.equal(fila[8], 10110) // I código de cliente
  assert.equal(fila[9], 'Rompecadenas S.L.') // J nombre
  assert.equal(fila[10], 'Calle Mayor 1') // K domicilio
  assert.equal(fila[11], 'Barcelona') // L población
  assert.equal(fila[12], '08001') // M código postal (texto)
  assert.equal(fila[13], 'Barcelona') // N provincia
  assert.equal(fila[14], 'B12345678') // O N.I.F.
  assert.equal(fila[17], '931234567') // R teléfono (texto)
  assert.equal(fila[18], 120) // S importe neto 1
  assert.equal(fila[19], 90) // T importe neto 2
  assert.equal(fila[20], 0) // U importe neto 3
  assert.equal(fila[21], 5) // V descuento global 1
  assert.equal(fila[24], 6) // Y importe descuento 1
  assert.equal(fila[25], 4.5) // Z importe descuento 2
  assert.equal(fila[45], 114) // AT base imponible 1
  assert.equal(fila[46], 85.5) // AU base imponible 2
  assert.equal(fila[47], 0) // AV base imponible 3
  assert.equal(fila[48], 21) // AW porcentaje IVA 1
  assert.equal(fila[49], 10) // AX
  assert.equal(fila[50], 4) // AY
  assert.equal(fila[51], 23.94) // AZ importe IVA 1
  assert.equal(fila[52], 8.55) // BA importe IVA 2
  assert.equal(fila[53], 0) // BB importe IVA 3
  assert.equal(fila[62], 231.99) // BK total
  assert.equal(fila[63], null) // BL forma de pago
  assert.equal(fila[66], 'Orden de reparación ORD-2026-0012') // BO
  assert.equal(fila[67], 'Orbea Alma · Nº serie SN-123') // BP
  assert.equal(fila[75], 0) // BX cobrado
  assert.equal(fila[76], 0) // BY traspasado
  assert.equal(fila[84], 0) // CG enviado
  assert.equal(fila[85], 10 / 24) // CH hora de creación
  assert.equal(fila[90], 0) // CM importe neto exento
  assert.equal(fila[91], 5) // CN porcentaje descuento exento
  assert.equal(fila[92], 0) // CO importe descuento exento
  assert.equal(fila[99], 0) // CV base imponible exenta
  assert.equal(fila[100], 0) // CW enviado por mail
  for (let c = 27; c <= 44; c++) assert.equal(fila[c], 0) // AB..AS
  for (let c = 54; c <= 61; c++) assert.equal(fila[c], 0) // BC..BJ
  for (let c = 93; c <= 98; c++) assert.equal(fila[c], 0) // CP..CU
})

test('prepararExportacion genera las líneas de LAL ordenadas', () => {
  const { filasLal } = prepararExportacion([ordenEjemplo()], CONFIG, { ahora: AHORA })
  assert.equal(filasLal.length, 3)

  const [material1, material2, manoDeObra] = filasLal
  assert.equal(material1.length, 31)
  assert.equal(material1[0], 1) // A serie
  assert.equal(material1[1], '260012') // B número de documento
  assert.equal(material1[2], 1) // C posición
  assert.equal(material1[3], 'CAM0001') // D artículo
  assert.equal(material1[4], 'Cadena') // E descripción
  assert.equal(material1[5], 2) // F cantidad
  assert.equal(material1[6], 0) // G descuento
  assert.equal(material1[9], 50) // J precio
  assert.equal(material1[10], 100) // K total
  assert.equal(material1[11], 0) // L tramo IVA 21 %
  assert.equal(material1[15], 30) // P precio de costo
  assert.equal(material1[25], 0) // Z campo uso interno

  assert.equal(material2[2], 2)
  assert.equal(material2[3], 'CUB0002')
  assert.equal(material2[6], 10)
  assert.equal(material2[9], 50)
  assert.equal(material2[10], 90)
  assert.equal(material2[11], 1) // L tramo IVA 10 %
  assert.equal(material2[15], null)

  assert.equal(manoDeObra[2], 3)
  assert.equal(manoDeObra[3], null) // sin artículo de mano de obra
  assert.equal(manoDeObra[4], 'Montaje')
  assert.equal(manoDeObra[5], 1)
  assert.equal(manoDeObra[6], 0)
  assert.equal(manoDeObra[9], 20)
  assert.equal(manoDeObra[10], 20)
  assert.equal(manoDeObra[11], 0)
})

test('el total de Factusol (BK) coincide con calcularTotales', () => {
  const orden = ordenEjemplo()
  const { incluidas, filasAlb } = prepararExportacion([orden], CONFIG, { ahora: AHORA })
  const esperado = calcularTotales(orden.materiales, orden.manoObra, orden.descuentoGlobal)
  assert.equal(filasAlb[0][62], esperado.total)
  assert.equal(incluidas[0].total, esperado.total)
  assert.deepEqual(incluidas[0].avisos, [])
})

test('se bloquea una orden que no está finalizada ni entregada', () => {
  const { bloqueadas, filasAlb } = prepararExportacion([ordenEjemplo({ estado: 'EnReparacion' })], CONFIG, { ahora: AHORA })
  assert.equal(filasAlb.length, 0)
  assert.equal(bloqueadas.length, 1)
  assert.ok(bloqueadas[0].motivos.includes('La orden no está finalizada ni entregada'))
})

test('se bloquea una orden cuyo cliente no tiene código de Factusol', () => {
  const orden = ordenEjemplo()
  orden.cliente = { ...orden.cliente, codigoFactusol: null }
  const { bloqueadas } = prepararExportacion([orden], CONFIG, { ahora: AHORA })
  assert.ok(bloqueadas[0].motivos.includes('El cliente no tiene código de Factusol'))
})

test('con cliente genérico, una orden sin código se exporta con él y los datos reales', () => {
  const config = normalizarConfig({ serie: 1, clienteGenerico: 0 }).config
  const orden = ordenEjemplo()
  orden.cliente = { ...orden.cliente, codigoFactusol: null }
  const { incluidas, bloqueadas, filasAlb } = prepararExportacion([orden], config, { ahora: AHORA })

  assert.equal(bloqueadas.length, 0)
  assert.equal(incluidas.length, 1)
  assert.equal(incluidas[0].clienteGenerico, true)
  assert.ok(incluidas[0].avisos.some((aviso) => aviso.includes('se exporta con el cliente genérico 0')))

  const fila = filasAlb[0]
  assert.equal(fila[8], 0) // I código de cliente = cliente genérico
  assert.equal(fila[9], 'Rompecadenas S.L.') // J nombre real
  assert.equal(fila[14], 'B12345678') // O N.I.F. real
})

test('con cliente genérico, una orden con código propio usa el suyo y sin aviso', () => {
  const config = normalizarConfig({ serie: 1, clienteGenerico: 500 }).config
  const { incluidas, filasAlb } = prepararExportacion([ordenEjemplo()], config, { ahora: AHORA })
  assert.equal(incluidas[0].clienteGenerico, false)
  assert.deepEqual(incluidas[0].avisos, [])
  assert.equal(filasAlb[0][8], 10110) // I código propio del cliente
})

test('se bloquea una orden ya exportada, salvo si se incluyen las exportadas', () => {
  const orden = ordenEjemplo({ exportadaFactusolEn: new Date(2026, 8, 1) })
  const sinIncluir = prepararExportacion([orden], CONFIG, { ahora: AHORA })
  assert.equal(sinIncluir.filasAlb.length, 0)
  assert.ok(sinIncluir.bloqueadas[0].motivos.includes('La orden ya se exportó a Factusol'))

  const incluyendo = prepararExportacion([orden], CONFIG, { ahora: AHORA, incluirExportadas: true })
  assert.equal(incluyendo.bloqueadas.length, 0)
  assert.equal(incluyendo.filasAlb.length, 1)
})

test('se bloquea una orden sin líneas', () => {
  const { bloqueadas } = prepararExportacion(
    [ordenEjemplo({ materiales: [], manoObra: [] })],
    CONFIG,
    { ahora: AHORA },
  )
  assert.ok(bloqueadas[0].motivos.includes('La orden no tiene líneas que exportar'))
})

test('se bloquea una orden cuyo número no tiene el formato esperado', () => {
  const { bloqueadas, filasAlb } = prepararExportacion([ordenEjemplo({ numeroOrden: 'R-99' })], CONFIG, { ahora: AHORA })
  assert.equal(filasAlb.length, 0)
  assert.ok(bloqueadas[0].motivos.some((motivo) => motivo.includes('formato esperado')))
})

test('se bloquea un albarán repetido dentro del lote', () => {
  const primera = ordenEjemplo({ id: 1 })
  const segunda = ordenEjemplo({ id: 2 })
  const { bloqueadas, filasAlb } = prepararExportacion([primera, segunda], CONFIG, { ahora: AHORA })
  assert.equal(filasAlb.length, 0)
  assert.equal(bloqueadas.length, 2)
  assert.ok(bloqueadas[0].motivos.includes('El albarán 260012 está repetido en el lote'))
  assert.ok(bloqueadas[1].motivos.includes('El albarán 260012 está repetido en el lote'))
})

test('se bloquea un material con un IVA no configurado', () => {
  const materiales = [
    { id: 1, referencia: 'X1', descripcion: 'X', cantidad: 1, precioUnitario: 10, descuento: 0, precioNeto: 10, iva: 7, articulo: null },
  ]
  const { bloqueadas } = prepararExportacion([ordenEjemplo({ materiales, manoObra: [] })], CONFIG, { ahora: AHORA })
  assert.ok(bloqueadas[0].motivos.some((motivo) => motivo.includes('IVA del 7%')))
})

test('se bloquea una referencia de más de 13 caracteres', () => {
  const materiales = [
    { id: 1, referencia: 'REFERENCIA-LARGA', descripcion: 'X', cantidad: 1, precioUnitario: 10, descuento: 0, precioNeto: 10, iva: 21, articulo: null },
  ]
  const { bloqueadas } = prepararExportacion([ordenEjemplo({ materiales, manoObra: [] })], CONFIG, { ahora: AHORA })
  assert.ok(bloqueadas[0].motivos.some((motivo) => motivo.includes('supera los 13 caracteres')))
})

test('se bloquea una línea con cantidad o importe negativo', () => {
  const materiales = [
    { id: 1, referencia: 'X1', descripcion: 'X', cantidad: -1, precioUnitario: 10, descuento: 0, precioNeto: -10, iva: 21, articulo: null },
  ]
  const { bloqueadas } = prepararExportacion([ordenEjemplo({ materiales, manoObra: [] })], CONFIG, { ahora: AHORA })
  assert.ok(bloqueadas[0].motivos.some((motivo) => motivo.includes('no válidos')))
})

test('las órdenes bloqueadas no aparecen en las filas de ALB ni de LAL', () => {
  const buena = ordenEjemplo({ id: 1, numeroOrden: 'ORD-2026-0001' })
  const mala = ordenEjemplo({ id: 2, numeroOrden: 'ORD-2026-0002', estado: 'EnReparacion' })
  const { incluidas, bloqueadas, filasAlb, filasLal } = prepararExportacion([buena, mala], CONFIG, { ahora: AHORA })

  assert.equal(incluidas.length, 1)
  assert.equal(bloqueadas.length, 1)
  assert.equal(bloqueadas[0].ordenId, 2)
  assert.equal(filasAlb.length, 1)
  assert.equal(filasAlb[0][1], '260001')
  assert.equal(filasLal.length, 3)
  for (const fila of filasLal) assert.equal(fila[1], '260001')
})

test('las líneas con IVA 0 van al tramo exento', () => {
  const materiales = [
    { id: 1, referencia: 'LIB01', descripcion: 'Libro', cantidad: 1, precioUnitario: 100, descuento: 0, precioNeto: 100, iva: 0, articulo: null },
  ]
  const { filasAlb, filasLal, incluidas } = prepararExportacion(
    [ordenEjemplo({ materiales, manoObra: [] })],
    CONFIG,
    { ahora: AHORA },
  )
  assert.equal(filasLal[0][11], 3) // L tramo exento
  assert.equal(filasAlb[0][90], 100) // CM importe neto exento
  assert.equal(filasAlb[0][92], 5) // CO importe descuento exento (100 * 5 %)
  assert.equal(filasAlb[0][99], 95) // CV base imponible exenta
  assert.equal(incluidas[0].total, 95)
})

test('los tipos de IVA configurados determinan el orden de los tramos', () => {
  const config = normalizarConfig({ serie: 1, tiposIva: [10, 21, 4] }).config
  const { filasAlb, filasLal } = prepararExportacion([ordenEjemplo()], config, { ahora: AHORA })

  assert.equal(filasLal[0][11], 1) // material al 21 % -> tramo 1
  assert.equal(filasLal[1][11], 0) // material al 10 % -> tramo 0
  assert.equal(filasLal[2][11], 1) // mano de obra al 21 % -> tramo 1
  assert.equal(filasAlb[0][18], 90) // S neto tramo 0 (10 %)
  assert.equal(filasAlb[0][19], 120) // T neto tramo 1 (21 %): 100 + 20
})

test('se añade un aviso cuando el total para Factusol difiere del de la aplicación', () => {
  const orden = ordenEjemplo()
  orden.total += 1
  const { incluidas } = prepararExportacion([orden], CONFIG, { ahora: AHORA })
  assert.equal(incluidas[0].avisos.length, 1)
  assert.ok(incluidas[0].avisos[0].includes('no coincide'))
})

test('generarLibro produce un .xlsx con la hoja Hoja1 y los formatos esperados', () => {
  const { filasAlb, filasLal } = prepararExportacion([ordenEjemplo()], CONFIG, { ahora: AHORA })

  const libroAlb = XLSX.read(generarLibro(CABECERAS_ALB, filasAlb), { type: 'buffer', cellStyles: true })
  assert.deepEqual(libroAlb.SheetNames, ['Hoja1'])
  const hojaAlb = libroAlb.Sheets['Hoja1']
  assert.equal(hojaAlb['A1'].v, 'Tipo de documento')
  assert.equal(hojaAlb['B2'].t, 's') // número de documento como texto
  assert.equal(hojaAlb['B2'].v, '260012')
  assert.equal(hojaAlb['B2'].z, '@')
  assert.equal(hojaAlb['D2'].t, 'n') // fecha como número
  assert.equal(hojaAlb['D2'].v, 46300)
  assert.equal(hojaAlb['D2'].z, 'dd/mm/yyyy')
  assert.equal(hojaAlb['D2'].w, '05/10/2026')
  assert.equal(hojaAlb['BK2'].t, 'n')
  assert.equal(hojaAlb['BK2'].v, 231.99)
  assert.equal(hojaAlb['BK2'].z, '0.00')

  const libroLal = XLSX.read(generarLibro(CABECERAS_LAL, filasLal), { type: 'buffer', cellStyles: true })
  assert.deepEqual(libroLal.SheetNames, ['Hoja1'])
  const hojaLal = libroLal.Sheets['Hoja1']
  assert.equal(hojaLal['A1'].v, 'Tipo de documento')
  assert.equal(hojaLal['B2'].t, 's')
  assert.equal(hojaLal['B2'].v, '260012')
  assert.equal(hojaLal['B2'].z, '@')
  assert.equal(hojaLal['D2'].v, 'CAM0001')
  assert.equal(hojaLal['K2'].v, 100)
  assert.equal(hojaLal['K2'].z, '0.00')
})

test('generarLibro sin filas deja solo la fila de cabeceras', () => {
  const libro = XLSX.read(generarLibro(CABECERAS_LAL, []), { type: 'buffer' })
  const hoja = libro.Sheets['Hoja1']
  assert.equal(hoja['A1'].v, 'Tipo de documento')
  assert.equal(hoja['A2'], undefined)
})
