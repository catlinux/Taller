import {
  leerLineasCsvTexto,
  dividirCampos,
  indiceCabecera,
  numeroEspanol,
  textoONull,
} from '../../scripts/lib/csv.js'
import { sinStockDesdeNuevo } from './stock.js'
import { leerExcelTiempos, prefijoCategoria } from './tiemposTrabajos.js'
import { normalizarTexto } from './texto.js'

// Importaciones masivas desde los listados exportados del ERP antiguo.
//
// Reciben el TEXTO del CSV (no una ruta), para poder lanzarlas también desde la
// web. No conocen Prisma: reciben un cliente `prisma` por parámetro (así se
// pueden probar con uno falso). Cada función devuelve un resumen en lugar de
// imprimir, y con { simular: true } no escribe nada en la base de datos.

const TAMANO_LOTE = 200

// Trocea un array en lotes de tamaño fijo.
function enLotes(elementos, tamano) {
  const lotes = []
  for (let i = 0; i < elementos.length; i += tamano) {
    lotes.push(elementos.slice(i, i + tamano))
  }
  return lotes
}

// Comprueba que el texto recibido es un CSV con contenido.
function validarTexto(texto) {
  if (typeof texto !== 'string' || texto.trim() === '') {
    throw new Error('El fichero está vacío')
  }
}

// Convierte el objeto de recuentos { motivo: cantidad } en la lista del resumen,
// dejando solo los motivos con alguna omisión.
function resumenOmitidos(omitidos) {
  return Object.entries(omitidos)
    .filter(([, cantidad]) => cantidad > 0)
    .map(([motivo, cantidad]) => ({ motivo, cantidad }))
}

// --- Clientes -------------------------------------------------------------

// Clasifica una fila del CSV de clientes: { cliente } o { motivo } de la omisión.
function clasificarCliente(campos) {
  const codigo = (campos[0] ?? '').trim()
  // El código debe ser un entero; se ignora cualquier otra cosa.
  if (!/^\d+$/.test(codigo)) return { motivo: 'sin código válido' }
  const nombre = (campos[1] ?? '').trim()
  if (nombre === '') return { motivo: 'sin nombre' }
  return {
    cliente: {
      numeroCliente: Number(codigo),
      // Los clientes del listado del ERP son de Factusol: su código coincide con el nº de cliente.
      codigoFactusol: Number(codigo),
      nombre,
      apellidos: null,
      direccion: textoONull(campos[2]),
      codigoPostal: textoONull(campos[3]),
      poblacion: textoONull(campos[4]),
      provincia: textoONull(campos[5]),
      telefono: textoONull(campos[6]),
      dni: textoONull(campos[7]),
    },
  }
}

// Lee y clasifica las líneas del listado de clientes.
function leerClientes(lineas) {
  const cabecera = indiceCabecera(lineas)
  if (cabecera === -1) {
    throw new Error('No se encontró la línea de cabeceras (Cód;) en el listado de clientes.')
  }
  const vistos = new Set()
  const clientes = []
  const omitidos = {
    'sin código válido': 0,
    'sin nombre': 0,
    'duplicado en el CSV': 0,
    'fila de totales o vacía': 0,
  }

  for (let i = cabecera + 1; i < lineas.length; i++) {
    const campos = dividirCampos(lineas[i])
    // Línea vacía o línea de totales ('...;Totales:;...').
    if (lineas[i].trim() === '' || campos.some((campo) => campo === 'Totales:')) {
      omitidos['fila de totales o vacía']++
      continue
    }
    const resultado = clasificarCliente(campos)
    if (resultado.motivo) {
      omitidos[resultado.motivo]++
      continue
    }
    if (vistos.has(resultado.cliente.numeroCliente)) {
      omitidos['duplicado en el CSV']++
      continue
    }
    vistos.add(resultado.cliente.numeroCliente)
    clientes.push(resultado.cliente)
  }
  return { clientes, omitidos }
}

// Devuelve los datos a escribir en un update de cliente (sin la clave única).
function datosCliente(cliente) {
  const { numeroCliente, ...resto } = cliente
  return resto
}

export async function importarClientes(prisma, texto, { simular = false } = {}) {
  validarTexto(texto)
  const { clientes, omitidos } = leerClientes(leerLineasCsvTexto(texto))

  // Consulta previa única de las claves existentes (para contar y para el dry-run).
  const existentes = new Set()
  if (clientes.length > 0) {
    const claves = clientes.map((cliente) => cliente.numeroCliente)
    const filas = await prisma.cliente.findMany({
      where: { numeroCliente: { in: claves } },
      select: { numeroCliente: true },
    })
    for (const fila of filas) existentes.add(fila.numeroCliente)
  }

  let creados = 0
  let actualizados = 0
  for (const cliente of clientes) {
    if (existentes.has(cliente.numeroCliente)) actualizados++
    else creados++
  }

  // Escritura real por lotes con transacciones (upsert).
  if (!simular) {
    for (const lote of enLotes(clientes, TAMANO_LOTE)) {
      await prisma.$transaction(
        lote.map((cliente) =>
          prisma.cliente.upsert({
            where: { numeroCliente: cliente.numeroCliente },
            update: datosCliente(cliente),
            create: cliente,
          }),
        ),
      )
    }
  }

  return {
    tipo: 'clientes',
    leidos: clientes.length,
    creados,
    actualizados,
    omitidos: resumenOmitidos(omitidos),
    simulado: simular,
  }
}

// --- Artículos ------------------------------------------------------------

// Clasifica una fila de artículo (no de grupo): devuelve { articulo } o { motivo }.
function clasificarArticulo(campos, familia) {
  const referencia = (campos[0] ?? '').trim()
  // Se ignoran filas sin código y la repetición de la cabecera ('Código').
  if (referencia === '' || referencia === 'Código') return { motivo: 'sin código válido' }
  const descripcionCampo = (campos[1] ?? '').trim()
  const referenciaTexto = (campos[2] ?? '').trim()
  const descripcion = descripcionCampo || referenciaTexto || referencia
  const proveedorTexto = (campos[3] ?? '').trim()
  return {
    articulo: {
      referencia,
      descripcion,
      precioCompra: numeroEspanol(campos[4]),
      precioVenta: numeroEspanol(campos[5]),
      stock: numeroEspanol(campos[6]),
      familia,
      proveedor: proveedorTexto === '' || proveedorTexto === '0' ? null : proveedorTexto,
    },
  }
}

// Lee y clasifica las líneas del listado de artículos.
function leerArticulos(lineas) {
  const cabecera = indiceCabecera(lineas)
  if (cabecera === -1) {
    throw new Error('No se encontró la línea de cabeceras (Código;) en el listado de artículos.')
  }
  let familiaActual = null
  const articulos = new Map()
  const omitidos = {
    'sin código válido': 0,
    'duplicado en el CSV': 0,
    'fila de totales o vacía': 0,
  }

  for (let i = cabecera + 1; i < lineas.length; i++) {
    const campos = dividirCampos(lineas[i])
    const primera = (campos[0] ?? '').trim()

    // Línea vacía o línea de totales (';;;Totales:;...') o sin primera columna.
    if (lineas[i].trim() === '' || campos.some((campo) => campo === 'Totales:') || primera === '') {
      omitidos['fila de totales o vacía']++
      continue
    }

    // Línea de grupo: solo la primera columna tiene contenido.
    const soloPrimera = campos.slice(1).every((campo) => campo === '')
    if (soloPrimera) {
      if (/^Sin familia/i.test(primera)) {
        familiaActual = null
      } else if (/^Familia:/i.test(primera)) {
        const separador = primera.indexOf(' - ')
        familiaActual = separador >= 0 ? primera.slice(separador + 3).trim() : null
      }
      // Las líneas de grupo no cuentan como omitidas ni como artículos.
      continue
    }

    const resultado = clasificarArticulo(campos, familiaActual)
    if (resultado.motivo) {
      omitidos[resultado.motivo]++
      continue
    }
    if (articulos.has(resultado.articulo.referencia)) {
      omitidos['duplicado en el CSV']++
      continue
    }
    articulos.set(resultado.articulo.referencia, resultado.articulo)
  }

  return { articulos: [...articulos.values()], omitidos }
}

// Devuelve los datos a escribir en un update (sin la clave única). Conserva la
// fecha sin stock anterior si el artículo sigue sin existencias y la pone o la
// borra según el stock importado.
function datosArticulo(articulo, sinStockDesdeActual) {
  const { referencia, ...resto } = articulo
  return { ...resto, sinStockDesde: sinStockDesdeNuevo(articulo.stock, sinStockDesdeActual) }
}

export async function importarArticulos(prisma, texto, { simular = false } = {}) {
  validarTexto(texto)
  const { articulos, omitidos } = leerArticulos(leerLineasCsvTexto(texto))

  // Consulta previa única de las claves existentes (para contar, para el dry-run
  // y para conservar su fecha sin stock en los updates).
  const existentes = new Map()
  if (articulos.length > 0) {
    const claves = articulos.map((articulo) => articulo.referencia)
    const filas = await prisma.articulo.findMany({
      where: { referencia: { in: claves } },
      select: { referencia: true, sinStockDesde: true },
    })
    for (const fila of filas) existentes.set(fila.referencia, fila.sinStockDesde)
  }

  let creados = 0
  let actualizados = 0
  for (const articulo of articulos) {
    if (existentes.has(articulo.referencia)) actualizados++
    else creados++
  }

  // Escritura real por lotes con transacciones (upsert).
  if (!simular) {
    for (const lote of enLotes(articulos, TAMANO_LOTE)) {
      await prisma.$transaction(
        lote.map((articulo) =>
          prisma.articulo.upsert({
            where: { referencia: articulo.referencia },
            update: datosArticulo(articulo, existentes.get(articulo.referencia)),
            create: { ...articulo, sinStockDesde: sinStockDesdeNuevo(articulo.stock, null) },
          }),
        ),
      )
    }
  }

  // Familias distintas (sin contar "Sin familia", que es null).
  const familias = new Set(articulos.map((articulo) => articulo.familia).filter((familia) => familia != null))

  return {
    tipo: 'articulos',
    leidos: articulos.length,
    creados,
    actualizados,
    omitidos: resumenOmitidos(omitidos),
    familias: familias.size,
    simulado: simular,
  }
}

// --- Bicicletas -----------------------------------------------------------

// Valores canónicos admitidos en la columna CATEGORIA del modelo Bicicleta.
const TIPOS_VALIDOS = [
  'BiciInfantil',
  'XC',
  'Trail',
  'Enduro',
  'Descens',
  'Passeig',
  'Gravel',
  'Carretera',
  'Triatlo',
  'EBikePasseig',
  'EBikeXC',
  'EBikeEnduro',
  'EBikeGravel',
  'EBikeCarretera',
]
// Mapa (en minúsculas) hacia el valor canónico para comparar sin distinguir mayúsculas.
const TIPOS_POR_CLAVE = new Map(TIPOS_VALIDOS.map((tipo) => [tipo.toLowerCase(), tipo]))

// Localiza la línea de cabeceras (empieza por 'CLIENT;') del registro de bicicletas.
function indiceCabeceraBicicletas(lineas) {
  return lineas.findIndex((linea) => /^CLIENT;/i.test(linea))
}

// Clave interna para detectar duplicados en el CSV y bicicletas ya existentes.
// Se usa el número de serie si lo hay; si no, la marca y el modelo.
function claveBicicleta(clienteId, marca, modelo, numeroSerie) {
  if (numeroSerie) return `${clienteId}|serie|${numeroSerie.toLowerCase()}`
  return `${clienteId}|mm|${marca.toLowerCase()}|${(modelo ?? '').toLowerCase()}`
}

// Lee y clasifica las líneas del registro de bicicletas.
// Devuelve { filas, omitidos }. Cada fila válida:
// { linea, clienteNumero, marca, modelo, numeroSerie, tipo }.
// omitidos: Map de motivo -> array de números de línea (1-based).
function leerBicicletas(lineas) {
  const cabecera = indiceCabeceraBicicletas(lineas)
  if (cabecera === -1) {
    throw new Error('No se encontró la línea de cabeceras (CLIENT;) en el registro de bicicletas.')
  }

  const filas = []
  const omitidos = new Map()
  const omitir = (motivo, linea) => {
    if (!omitidos.has(motivo)) omitidos.set(motivo, [])
    omitidos.get(motivo).push(linea)
  }

  for (let i = cabecera + 1; i < lineas.length; i++) {
    const numeroLinea = i + 1
    // Línea vacía: se ignora sin contarla como omitida.
    if (lineas[i].trim() === '') continue

    const campos = dividirCampos(lineas[i])
    const clienteTexto = (campos[0] ?? '').trim()
    const clienteNumero = /^\d+$/.test(clienteTexto) ? Number(clienteTexto) : null
    const marca = (campos[1] ?? '').trim()
    const categoriaTexto = (campos[4] ?? '').trim()

    // La categoría debe ser uno de los 14 valores admitidos (sin distinguir mayúsculas).
    const tipo = TIPOS_POR_CLAVE.get(categoriaTexto.toLowerCase())
    if (tipo === undefined) {
      omitir('categoría no válida', numeroLinea)
      continue
    }
    // La marca es obligatoria.
    if (marca === '') {
      omitir('sin marca', numeroLinea)
      continue
    }
    // El cliente debe poder identificarse por un número entero válido.
    if (clienteNumero === null) {
      omitir('cliente no válido', numeroLinea)
      continue
    }

    filas.push({
      linea: numeroLinea,
      clienteNumero,
      marca,
      modelo: textoONull(campos[2]),
      numeroSerie: textoONull(campos[3]),
      tipo,
    })
  }

  return { filas, omitidos }
}

export async function importarBicicletas(prisma, texto, { simular = false } = {}) {
  validarTexto(texto)
  const { filas, omitidos } = leerBicicletas(leerLineasCsvTexto(texto))

  // Resuelve los clientes por numeroCliente para obtener su id.
  const numerosCliente = [...new Set(filas.map((fila) => fila.clienteNumero))]
  const idPorNumero = new Map()
  if (numerosCliente.length > 0) {
    const clientes = await prisma.cliente.findMany({
      where: { numeroCliente: { in: numerosCliente } },
      select: { id: true, numeroCliente: true },
    })
    for (const cliente of clientes) idPorNumero.set(cliente.numeroCliente, cliente.id)
  }

  // Comprueba que todos los clientes existen; los que no, se omiten.
  const bicicletas = []
  for (const fila of filas) {
    const clienteId = idPorNumero.get(fila.clienteNumero)
    if (clienteId === undefined) {
      if (!omitidos.has('cliente no encontrado')) omitidos.set('cliente no encontrado', [])
      omitidos.get('cliente no encontrado').push(fila.linea)
      continue
    }
    bicicletas.push({ ...fila, clienteId })
  }

  // Consulta las bicicletas ya existentes de estos clientes para el "upsert" manual.
  const idsCliente = [...new Set(bicicletas.map((bici) => bici.clienteId))]
  const existentesPorClave = new Map()
  if (idsCliente.length > 0) {
    const existentes = await prisma.bicicleta.findMany({
      where: { clienteId: { in: idsCliente } },
      select: { id: true, clienteId: true, marca: true, modelo: true, numeroSerie: true },
    })
    for (const bici of existentes) {
      existentesPorClave.set(
        claveBicicleta(bici.clienteId, bici.marca, bici.modelo, bici.numeroSerie),
        bici.id,
      )
    }
  }

  // Deduplica dentro del propio CSV y decide crear/actualizar cada bicicleta.
  const clavesEnCsv = new Set()
  const aCrear = []
  const aActualizar = []
  for (const bici of bicicletas) {
    const clave = claveBicicleta(bici.clienteId, bici.marca, bici.modelo, bici.numeroSerie)
    if (clavesEnCsv.has(clave)) {
      if (!omitidos.has('duplicado en el CSV')) omitidos.set('duplicado en el CSV', [])
      omitidos.get('duplicado en el CSV').push(bici.linea)
      continue
    }
    clavesEnCsv.add(clave)
    const idExistente = existentesPorClave.get(clave)
    if (idExistente !== undefined) aActualizar.push({ id: idExistente, bici })
    else aCrear.push(bici)
  }

  // Escritura real por lotes con transacciones.
  if (!simular) {
    for (const lote of enLotes(aCrear, TAMANO_LOTE)) {
      await prisma.$transaction(
        lote.map((bici) =>
          prisma.bicicleta.create({
            data: {
              clienteId: bici.clienteId,
              marca: bici.marca,
              modelo: bici.modelo,
              numeroSerie: bici.numeroSerie,
              tipo: bici.tipo,
            },
          }),
        ),
      )
    }
    for (const lote of enLotes(aActualizar, TAMANO_LOTE)) {
      await prisma.$transaction(
        lote.map(({ id, bici }) =>
          prisma.bicicleta.update({
            where: { id },
            data: {
              marca: bici.marca,
              modelo: bici.modelo,
              numeroSerie: bici.numeroSerie,
              tipo: bici.tipo,
            },
          }),
        ),
      )
    }
  }

  return {
    tipo: 'bicicletas',
    leidos: filas.length,
    creados: aCrear.length,
    actualizados: aActualizar.length,
    omitidos: [...omitidos.entries()].map(([motivo, lineas]) => ({
      motivo,
      cantidad: lineas.length,
      lineas: lineas.slice(0, 20),
    })),
    simulado: simular,
  }
}

// --- Trabajos (tiempos del Excel «Tiempos sexagesimales») -----------------

// Clave de emparejamiento: categoría + descripción, sin mayúsculas ni tildes.
function claveTrabajo(categoria, descripcion) {
  return `${normalizarTexto(categoria)}||${normalizarTexto(descripcion)}`
}

// Convierte minutos a horas (redondeadas a 4 decimales) para tiempoDefecto.
function horasDeMinutos(minutos) {
  return Number((minutos / 60).toFixed(4))
}

// Primer código libre con el prefijo dado (prefijo-01, prefijo-02, ...).
function siguienteCodigoTrabajo(prefijo, codigosUsados) {
  let numero = 1
  let codigo = `${prefijo}-${String(numero).padStart(2, '0')}`
  while (codigosUsados.has(codigo)) {
    numero++
    codigo = `${prefijo}-${String(numero).padStart(2, '0')}`
  }
  return codigo
}

// Lee el precio/hora por defecto del ajuste 'precioHora' (30 si no hay).
async function leerPrecioHora(prisma) {
  try {
    const fila = await prisma.ajuste.findUnique({ where: { clave: 'precioHora' } })
    if (!fila) return 30
    const valor = JSON.parse(fila.valor)
    return typeof valor === 'number' && Number.isFinite(valor) ? valor : 30
  } catch {
    return 30
  }
}

// Importa el Excel de tiempos de trabajos al catálogo de operaciones de mano de
// obra. `contenido` es el .xlsx en base64. Crea las operaciones que faltan y
// actualiza las que ya existen (misma categoría y descripción normalizada); no
// borra ni desactiva nada.
export async function importarTrabajos(prisma, contenido, { simular = false } = {}) {
  if (typeof contenido !== 'string' || contenido.trim() === '') {
    throw new Error('El fichero está vacío')
  }

  let parseado
  try {
    parseado = leerExcelTiempos(Buffer.from(contenido, 'base64'))
  } catch {
    throw new Error('El fichero no es un Excel válido')
  }
  const { trabajos, avisos } = parseado

  const precioHora = await leerPrecioHora(prisma)

  // Operaciones existentes: para emparejar y para saber qué códigos están libres.
  const existentes = await prisma.operacionManoObra.findMany({
    where: {},
    select: { id: true, codigo: true, categoria: true, descripcion: true },
  })
  const porClave = new Map()
  const codigosUsados = new Set()
  for (const operacion of existentes) {
    codigosUsados.add(operacion.codigo)
    porClave.set(claveTrabajo(operacion.categoria, operacion.descripcion), operacion)
  }

  const aCrear = []
  const aActualizar = []
  for (const trabajo of trabajos) {
    const tiempos = JSON.stringify(trabajo.tiempos)
    const tiempoDefecto = horasDeMinutos(trabajo.tiempos[0])
    const existente = porClave.get(claveTrabajo(trabajo.categoria, trabajo.nombre))
    if (existente) {
      // No se tocan el código ni el precio/hora de lo que ya existe.
      aActualizar.push({
        id: existente.id,
        data: { categoria: trabajo.categoria, tiempos, tiempoDefecto, ordenCatalogo: trabajo.orden, activo: true },
      })
    } else {
      const codigo = siguienteCodigoTrabajo(prefijoCategoria(trabajo.categoria), codigosUsados)
      codigosUsados.add(codigo)
      aCrear.push({
        codigo,
        descripcion: trabajo.nombre,
        categoria: trabajo.categoria,
        tiempos,
        tiempoDefecto,
        ordenCatalogo: trabajo.orden,
        precioHoraDefecto: precioHora,
      })
    }
  }

  if (!simular && (aCrear.length > 0 || aActualizar.length > 0)) {
    await prisma.$transaction([
      ...aCrear.map((data) => prisma.operacionManoObra.create({ data })),
      ...aActualizar.map(({ id, data }) => prisma.operacionManoObra.update({ where: { id }, data })),
    ])
  }

  // Resumen de omisiones a partir de los avisos del parser.
  const conteo = new Map()
  for (const aviso of avisos) {
    const motivo = aviso.motivo ?? String(aviso)
    conteo.set(motivo, (conteo.get(motivo) ?? 0) + 1)
  }

  return {
    tipo: 'trabajos',
    leidos: trabajos.length,
    creados: aCrear.length,
    actualizados: aActualizar.length,
    omitidos: [...conteo.entries()].map(([motivo, cantidad]) => ({ motivo, cantidad })),
    categorias: new Set(trabajos.map((trabajo) => trabajo.categoria)).size,
    simulado: simular,
  }
}

// Permite elegir la importación por nombre.
export const IMPORTACIONES = {
  clientes: importarClientes,
  articulos: importarArticulos,
  bicicletas: importarBicicletas,
  trabajos: importarTrabajos,
}

