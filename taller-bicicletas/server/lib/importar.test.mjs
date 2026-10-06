import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx'
import {
  importarClientes,
  importarArticulos,
  importarBicicletas,
  importarTrabajos,
  IMPORTACIONES,
} from './importar.js'

// Pruebas de la importación de clientes, artículos y bicicletas desde el TEXTO
// de un CSV (y de trabajos desde un .xlsx) con un Prisma falso en memoria (sin
// base de datos real).

// --- Prisma falso ---------------------------------------------------------

// Devuelve solo las claves pedidas en `select` (o copia el objeto si no hay).
function proyectar(objeto, select) {
  if (!select) return { ...objeto }
  const salida = {}
  for (const clave of Object.keys(select)) {
    if (select[clave]) salida[clave] = objeto[clave]
  }
  return salida
}

// Crea un Prisma de mentira en memoria que solo implementa lo que usan las
// importaciones. Lleva un contador de escrituras para comprobar el modo simular.
function crearPrismaFalso({
  clientes = [],
  articulos = [],
  bicicletas = [],
  operaciones = [],
  ajuste = null,
} = {}) {
  const clientesMap = new Map(clientes.map((c) => [c.numeroCliente, { ...c }]))
  const articulosMap = new Map(articulos.map((a) => [a.referencia, { ...a }]))
  const bicicletasMap = new Map(bicicletas.map((b) => [b.id, { ...b }]))
  const operacionesMap = new Map(operaciones.map((o) => [o.id, { ...o }]))
  let siguienteIdBicicleta = bicicletas.length + 1
  let siguienteIdOperacion = operaciones.length + 1
  const llamadas = { upsert: 0, create: 0, update: 0, transaction: 0 }

  return {
    clientesMap,
    articulosMap,
    bicicletasMap,
    operacionesMap,
    llamadas,
    cliente: {
      async findMany({ where, select }) {
        return where.numeroCliente.in
          .filter((numero) => clientesMap.has(numero))
          .map((numero) => proyectar(clientesMap.get(numero), select))
      },
      async upsert({ where, update, create }) {
        llamadas.upsert++
        const clave = where.numeroCliente
        const valor = clientesMap.has(clave)
          ? { ...clientesMap.get(clave), ...update }
          : { ...create }
        clientesMap.set(clave, valor)
        return valor
      },
    },
    articulo: {
      async findMany({ where, select }) {
        return where.referencia.in
          .filter((referencia) => articulosMap.has(referencia))
          .map((referencia) => proyectar(articulosMap.get(referencia), select))
      },
      async upsert({ where, update, create }) {
        llamadas.upsert++
        const clave = where.referencia
        const valor = articulosMap.has(clave)
          ? { ...articulosMap.get(clave), ...update }
          : { ...create }
        articulosMap.set(clave, valor)
        return valor
      },
    },
    bicicleta: {
      async findMany({ where, select }) {
        const ids = where.clienteId.in
        return [...bicicletasMap.values()]
          .filter((bici) => ids.includes(bici.clienteId))
          .map((bici) => proyectar(bici, select))
      },
      async create({ data }) {
        llamadas.create++
        const bici = { id: siguienteIdBicicleta++, ...data }
        bicicletasMap.set(bici.id, bici)
        return bici
      },
      async update({ where, data }) {
        llamadas.update++
        const bici = { ...bicicletasMap.get(where.id), ...data }
        bicicletasMap.set(where.id, bici)
        return bici
      },
    },
    operacionManoObra: {
      async findMany({ select } = {}) {
        return [...operacionesMap.values()].map((operacion) => proyectar(operacion, select))
      },
      async create({ data }) {
        llamadas.create++
        const operacion = { id: siguienteIdOperacion++, activo: true, ...data }
        operacionesMap.set(operacion.id, operacion)
        return operacion
      },
      async update({ where, data }) {
        llamadas.update++
        const operacion = { ...operacionesMap.get(where.id), ...data }
        operacionesMap.set(where.id, operacion)
        return operacion
      },
    },
    ajuste: {
      async findUnique({ where }) {
        return ajuste && ajuste.clave === where.clave ? { ...ajuste } : null
      },
    },
    async $transaction(operaciones) {
      llamadas.transaction++
      return Promise.all(operaciones)
    },
  }
}

// --- CSV de ejemplo (datos inventados de "Rompecadenas") -------------------

const CSV_CLIENTES = [
  'Cód;Nombre;Dirección;C.Postal;Población;Provincia;Teléfono;NIF',
  '1;Ana Inventada;Carrer Falsa 1;08001;Barcelona;Barcelona;600000001;11111111H',
  '2;Bruno Inventado;Carrer Falsa 2;08002;Girona;Girona;600000002;22222222J',
  ';Sin código;;;;;;',
  '3;;Carrer Falsa 3;08003;Lleida;Lleida;600000003;33333333K',
  '2;Bruno Duplicado;;;;;;;;;',
  ';;;Totales:;;;;;',
].join('\n')

// --- Clientes -------------------------------------------------------------

test('importarClientes crea, actualiza y omite duplicados y filas inválidas', async () => {
  const prisma = crearPrismaFalso({
    clientes: [{ numeroCliente: 1, nombre: 'Antiguo', apellidos: null }],
  })
  const resumen = await importarClientes(prisma, CSV_CLIENTES)

  assert.equal(resumen.tipo, 'clientes')
  assert.equal(resumen.leidos, 2)
  assert.equal(resumen.creados, 1)
  assert.equal(resumen.actualizados, 1)
  assert.equal(resumen.simulado, false)
  assert.deepEqual(resumen.omitidos, [
    { motivo: 'sin código válido', cantidad: 1 },
    { motivo: 'sin nombre', cantidad: 1 },
    { motivo: 'duplicado en el CSV', cantidad: 1 },
    { motivo: 'fila de totales o vacía', cantidad: 1 },
  ])

  assert.equal(prisma.clientesMap.get(1).nombre, 'Ana Inventada')
  assert.equal(prisma.clientesMap.get(2).nombre, 'Bruno Inventado')
})

test('importarClientes guarda codigoFactusol igual a numeroCliente en cada fila', async () => {
  const prisma = crearPrismaFalso()
  await importarClientes(prisma, CSV_CLIENTES)

  assert.equal(prisma.clientesMap.size, 2)
  for (const cliente of prisma.clientesMap.values()) {
    assert.equal(cliente.codigoFactusol, cliente.numeroCliente)
  }
})

test('importarClientes con simular no escribe nada', async () => {
  const prisma = crearPrismaFalso({
    clientes: [{ numeroCliente: 1, nombre: 'Antiguo' }],
  })
  const resumen = await importarClientes(prisma, CSV_CLIENTES, { simular: true })

  assert.equal(resumen.simulado, true)
  assert.equal(resumen.creados, 1)
  assert.equal(resumen.actualizados, 1)
  assert.equal(prisma.llamadas.upsert, 0)
  assert.equal(prisma.llamadas.transaction, 0)
  // El cliente existente no se ha tocado y el nuevo no se ha creado.
  assert.equal(prisma.clientesMap.size, 1)
  assert.equal(prisma.clientesMap.get(1).nombre, 'Antiguo')
})


// --- Artículos ------------------------------------------------------------

const CSV_ARTICULOS = [
  'Código;Descripción;Referencia;Proveedor;P.Compra;P.Venta;Stock',
  'Familia: 1 - Componentes',
  'ABC;Cadena;;;10,00;20,00;-2',
  'DEF;Cubo;;;3,50;7,00;0',
  'ABC;Cadena repetida;;;1,00;2,00;1',
  'Código;Cabecera repetida;;;;;;',
  'Sin familia',
  'GHI;;GHI-REF;Prov2;2,00;4,00;5',
  ';;;Totales:;;;',
].join('\n')

test('importarArticulos crea, actualiza, omite y cuenta las familias', async () => {
  const fechaAnterior = new Date('2023-05-01T00:00:00Z')
  const prisma = crearPrismaFalso({
    articulos: [{ referencia: 'ABC', stock: -1, sinStockDesde: fechaAnterior }],
  })
  const resumen = await importarArticulos(prisma, CSV_ARTICULOS)

  assert.equal(resumen.tipo, 'articulos')
  assert.equal(resumen.leidos, 3)
  assert.equal(resumen.creados, 2)
  assert.equal(resumen.actualizados, 1)
  assert.equal(resumen.familias, 1)
  assert.equal(resumen.simulado, false)
  assert.deepEqual(resumen.omitidos, [
    { motivo: 'sin código válido', cantidad: 1 },
    { motivo: 'duplicado en el CSV', cantidad: 1 },
    { motivo: 'fila de totales o vacía', cantidad: 1 },
  ])

  // ABC sigue sin stock: conserva su fecha anterior de sinStockDesde.
  assert.equal(prisma.articulosMap.get('ABC').sinStockDesde, fechaAnterior)
  // DEF (stock 0) se crea sin existencias, con fecha; GHI (stock 5) sin fecha.
  assert.ok(prisma.articulosMap.get('DEF').sinStockDesde instanceof Date)
  assert.equal(prisma.articulosMap.get('GHI').sinStockDesde, null)
  // La familia solo se aplica dentro del bloque "Familia: ...".
  assert.equal(prisma.articulosMap.get('ABC').familia, 'Componentes')
  assert.equal(prisma.articulosMap.get('GHI').familia, null)
})

test('importarArticulos con simular no escribe nada', async () => {
  const prisma = crearPrismaFalso({
    articulos: [{ referencia: 'ABC', stock: -1, sinStockDesde: null }],
  })
  const resumen = await importarArticulos(prisma, CSV_ARTICULOS, { simular: true })

  assert.equal(resumen.simulado, true)
  assert.equal(resumen.creados, 2)
  assert.equal(resumen.actualizados, 1)
  assert.equal(prisma.llamadas.upsert, 0)
  assert.equal(prisma.llamadas.transaction, 0)
  assert.equal(prisma.articulosMap.size, 1)
})


// --- Bicicletas -----------------------------------------------------------

const CSV_BICICLETAS = [
  'CLIENT;MARCA;MODEL;Nº SERIE ;CATEGORIA',
  '100;Orbea;Alma;;XC',
  '100;Trek;Marlin;SN-1;Trail',
  '999;Orbea;Alma;;XC',
  '100;Orbea;Alma;;XC',
  '100;Orbea;Alma;;Rareza',
  '100;;Marlin;;XC',
  'abc;Orbea;Alma;;XC',
].join('\n')

test('importarBicicletas crea, actualiza, deduplica y omite por motivo', async () => {
  const prisma = crearPrismaFalso({
    clientes: [
      { id: 10, numeroCliente: 100 },
      { id: 11, numeroCliente: 200 },
    ],
    bicicletas: [{ id: 1, clienteId: 10, marca: 'Orbea', modelo: 'Alma', numeroSerie: null }],
  })
  const resumen = await importarBicicletas(prisma, CSV_BICICLETAS)

  assert.equal(resumen.tipo, 'bicicletas')
  assert.equal(resumen.leidos, 4)
  assert.equal(resumen.creados, 1)
  assert.equal(resumen.actualizados, 1)
  assert.equal(resumen.simulado, false)
  assert.deepEqual(resumen.omitidos, [
    { motivo: 'categoría no válida', cantidad: 1, lineas: [6] },
    { motivo: 'sin marca', cantidad: 1, lineas: [7] },
    { motivo: 'cliente no válido', cantidad: 1, lineas: [8] },
    { motivo: 'cliente no encontrado', cantidad: 1, lineas: [4] },
    { motivo: 'duplicado en el CSV', cantidad: 1, lineas: [5] },
  ])

  assert.equal(prisma.bicicletasMap.size, 2)
})

test('importarBicicletas con simular no escribe nada', async () => {
  const prisma = crearPrismaFalso({
    clientes: [{ id: 10, numeroCliente: 100 }],
    bicicletas: [{ id: 1, clienteId: 10, marca: 'Orbea', modelo: 'Alma', numeroSerie: null }],
  })
  const resumen = await importarBicicletas(prisma, CSV_BICICLETAS, { simular: true })

  assert.equal(resumen.simulado, true)
  assert.equal(resumen.creados, 1)
  assert.equal(resumen.actualizados, 1)
  assert.equal(prisma.llamadas.create, 0)
  assert.equal(prisma.llamadas.update, 0)
  assert.equal(prisma.llamadas.transaction, 0)
  assert.equal(prisma.bicicletasMap.size, 1)
})

// --- Trabajos (Excel «Tiempos sexagesimales») -----------------------------

// Construye un .xlsx en base64 a partir de una matriz de celdas, con xlsx.
function excelBase64(filas) {
  const hoja = XLSX.utils.aoa_to_sheet(filas)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Hoja1')
  return XLSX.write(libro, { type: 'base64', bookType: 'xlsx' })
}

const FILAS_TRABAJOS = [
  ['Tiempos sexagesimales'],
  [],
  ['Dirección', 'Ajuste', 'Sustitución'],
  [null, '00:10', '00:20'],
  [],
  ['Freno trasero', 'Purgar'],
  [null, '00:20'],
  [null, '00:30'],
]

test('importarTrabajos crea las operaciones nuevas y actualiza las existentes por categoría+descripción', async () => {
  const prisma = crearPrismaFalso({
    operaciones: [
      // Existente con la descripción sin tilde: debe emparejar con «Dirección/Ajuste».
      { id: 50, codigo: 'DIR-99', categoria: 'Direccion', descripcion: 'Ajuste', tiempoDefecto: 1, precioHoraDefecto: 45, tiempos: null, ordenCatalogo: 9 },
    ],
    ajuste: { clave: 'precioHora', valor: '40' },
  })
  const resumen = await importarTrabajos(prisma, excelBase64(FILAS_TRABAJOS))

  assert.equal(resumen.tipo, 'trabajos')
  assert.equal(resumen.leidos, 3)
  assert.equal(resumen.creados, 2)
  assert.equal(resumen.actualizados, 1)
  assert.equal(resumen.categorias, 2)
  assert.equal(resumen.simulado, false)
  assert.equal(resumen.formato, 'bloques')

  // La existente se actualiza sin tocar el código ni su precio/hora.
  const existente = prisma.operacionesMap.get(50)
  assert.equal(existente.codigo, 'DIR-99')
  assert.equal(existente.precioHoraDefecto, 45)
  assert.equal(existente.categoria, 'Dirección')
  assert.equal(existente.tiempos, '[10]')
  assert.equal(existente.tiempoDefecto, Number((10 / 60).toFixed(4)))
  assert.equal(existente.ordenCatalogo, 0)
  assert.equal(existente.activo, true)

  // Las nuevas usan el prefijo de su categoría y el precio/hora del ajuste.
  const creadas = [...prisma.operacionesMap.values()].filter((o) => o.id !== 50)
  const sustitucion = creadas.find((o) => o.descripcion === 'Sustitución')
  assert.equal(sustitucion.codigo, 'DIR-01')
  assert.equal(sustitucion.categoria, 'Dirección')
  assert.equal(sustitucion.tiempos, '[20]')
  assert.equal(sustitucion.precioHoraDefecto, 40)
  const purgar = creadas.find((o) => o.descripcion === 'Purgar')
  assert.equal(purgar.codigo, 'FTR-01')
  assert.equal(purgar.tiempos, '[20,30]')
  assert.equal(purgar.tiempoDefecto, Number((20 / 60).toFixed(4)))
})

test('importarTrabajos importa un Excel en formato de tabla y lo indica en el resumen', async () => {
  // Formato de tabla: A categoría, B descripción y C/D/E tiempos (con fila de títulos).
  const filasTabla = [
    ['Categoría', 'Descripción', 'Tiempo', 'Tiempo 2', 'Tiempo 3'],
    ['Dirección', 'Ajuste', 0.006944444444444444, null, null],
    ['Freno trasero', 'Sustitución', '00:20', '00:45', null],
  ]
  const prisma = crearPrismaFalso({ ajuste: { clave: 'precioHora', valor: '40' } })
  const resumen = await importarTrabajos(prisma, excelBase64(filasTabla))

  assert.equal(resumen.formato, 'tabla')
  assert.equal(resumen.leidos, 2)
  assert.equal(resumen.creados, 2)

  const sustitucion = [...prisma.operacionesMap.values()].find((o) => o.descripcion === 'Sustitución')
  assert.equal(sustitucion.codigo, 'FTR-01')
  assert.equal(sustitucion.tiempos, '[20,45]')
  assert.equal(sustitucion.tiempoDefecto, Number((20 / 60).toFixed(4)))
})

test('importarTrabajos es idempotente: la segunda importación no crea nada y actualiza todo', async () => {
  const prisma = crearPrismaFalso({ ajuste: { clave: 'precioHora', valor: '40' } })
  const excel = excelBase64(FILAS_TRABAJOS)

  const primera = await importarTrabajos(prisma, excel)
  assert.equal(primera.creados, 3)
  assert.equal(primera.actualizados, 0)

  const segunda = await importarTrabajos(prisma, excel)
  assert.equal(segunda.leidos, 3)
  assert.equal(segunda.creados, 0)
  assert.equal(segunda.actualizados, 3)
  assert.equal(prisma.operacionesMap.size, 3)
})

test('importarTrabajos usa 30 €/h por defecto si no hay ajuste de precio/hora', async () => {
  const prisma = crearPrismaFalso()
  await importarTrabajos(prisma, excelBase64(FILAS_TRABAJOS))
  for (const operacion of prisma.operacionesMap.values()) {
    assert.equal(operacion.precioHoraDefecto, 30)
  }
})

test('importarTrabajos con simular no escribe nada', async () => {
  const prisma = crearPrismaFalso()
  const resumen = await importarTrabajos(prisma, excelBase64(FILAS_TRABAJOS), { simular: true })

  assert.equal(resumen.simulado, true)
  assert.equal(resumen.creados, 3)
  assert.equal(prisma.llamadas.create, 0)
  assert.equal(prisma.llamadas.update, 0)
  assert.equal(prisma.llamadas.transaction, 0)
  assert.equal(prisma.operacionesMap.size, 0)
})

// --- Errores y exportaciones ----------------------------------------------

test('las importaciones lanzan error si el texto está vacío o no es un string', async () => {
  const prisma = crearPrismaFalso()
  await assert.rejects(importarClientes(prisma, ''), /El fichero está vacío/)
  await assert.rejects(importarClientes(prisma, undefined), /El fichero está vacío/)
  await assert.rejects(importarArticulos(prisma, '   '), /El fichero está vacío/)
  await assert.rejects(importarBicicletas(prisma, null), /El fichero está vacío/)
  await assert.rejects(importarTrabajos(prisma, ''), /El fichero está vacío/)
  await assert.rejects(importarTrabajos(prisma, undefined), /El fichero está vacío/)
})

test('importarTrabajos lanza error si el contenido no es un Excel válido', async () => {
  const prisma = crearPrismaFalso()
  const noExcel = Buffer.from('esto no es una hoja de cálculo').toString('base64')
  await assert.rejects(importarTrabajos(prisma, noExcel), /no es un Excel válido/)
})

test('las importaciones lanzan error si no hay línea de cabeceras', async () => {
  const prisma = crearPrismaFalso()
  const sinCabecera = 'Foo;Bar\n1;2'
  await assert.rejects(importarClientes(prisma, sinCabecera), /listado de clientes/)
  await assert.rejects(importarArticulos(prisma, sinCabecera), /listado de artículos/)
  await assert.rejects(importarBicicletas(prisma, sinCabecera), /registro de bicicletas/)
})

test('IMPORTACIONES permite elegir la importación por nombre', () => {
  assert.equal(IMPORTACIONES.clientes, importarClientes)
  assert.equal(IMPORTACIONES.articulos, importarArticulos)
  assert.equal(IMPORTACIONES.bicicletas, importarBicicletas)
  assert.equal(IMPORTACIONES.trabajos, importarTrabajos)
})

