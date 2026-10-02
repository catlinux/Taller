import path from 'node:path'
import { fileURLToPath } from 'node:url'
import prisma from '../server/db.js'
import { leerLineasCsv, dividirCampos, indiceCabecera, numeroEspanol, textoONull } from './lib/csv.js'

// Importa los artículos desde el listado exportado del ERP antiguo.
// Uso: node scripts/import-articulos.js [ruta.csv] [--dry-run]
// - Se puede pasar un CSV alternativo como primer argumento posicional.
// - Con --dry-run se muestra el resumen sin escribir en la base de datos.
// - El import es un "upsert": crea los nuevos y actualiza los que ya existen.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RUTA_POR_DEFECTO = path.resolve(__dirname, '../../datos-importar/Listado de artículos.csv')
const TAMANO_LOTE = 200

// Separa los argumentos de la línea de comandos: opciones y ruta posicional.
const argumentos = process.argv.slice(2)
const modoDryRun = argumentos.includes('--dry-run')
const rutaArg = argumentos.find((arg) => !arg.startsWith('--'))
const RUTA_CSV = rutaArg ? path.resolve(process.cwd(), rutaArg) : RUTA_POR_DEFECTO

// Trocea un array en lotes de tamaño fijo.
function enLotes(elementos, tamano) {
  const lotes = []
  for (let i = 0; i < elementos.length; i += tamano) {
    lotes.push(elementos.slice(i, i + tamano))
  }
  return lotes
}

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

function leerArticulos() {
  const lineas = leerLineasCsv(RUTA_CSV)
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

// Devuelve los datos a escribir en un update (sin la clave única).
function datosArticulo(articulo) {
  const { referencia, ...resto } = articulo
  return resto
}


async function importar() {
  const { articulos, omitidos } = leerArticulos()

  // Consulta previa única de las claves existentes (para contar y para el dry-run).
  const existentes = new Set()
  if (articulos.length > 0) {
    const claves = articulos.map((articulo) => articulo.referencia)
    const filas = await prisma.articulo.findMany({
      where: { referencia: { in: claves } },
      select: { referencia: true },
    })
    for (const fila of filas) existentes.add(fila.referencia)
  }

  let creados = 0
  let actualizados = 0
  for (const articulo of articulos) {
    if (existentes.has(articulo.referencia)) actualizados++
    else creados++
  }

  // Escritura real por lotes con transacciones (upsert).
  if (!modoDryRun) {
    for (const lote of enLotes(articulos, TAMANO_LOTE)) {
      await prisma.$transaction(
        lote.map((articulo) =>
          prisma.articulo.upsert({
            where: { referencia: articulo.referencia },
            update: datosArticulo(articulo),
            create: articulo,
          }),
        ),
      )
    }
  }

  // Familias distintas (sin contar "Sin familia", que es null).
  const familias = new Set(articulos.map((articulo) => articulo.familia).filter((familia) => familia != null))

  const totalOmitidos = Object.values(omitidos).reduce((suma, n) => suma + n, 0)
  console.log(modoDryRun ? 'Simulación (--dry-run) del import de artículos:' : 'Import de artículos completado:')
  console.log(`  Leídos:             ${articulos.length}`)
  console.log(`  Creados:            ${creados}`)
  console.log(`  Actualizados:       ${actualizados}`)
  console.log(`  Omitidos:           ${totalOmitidos}`)
  for (const [motivo, cantidad] of Object.entries(omitidos)) {
    if (cantidad > 0) console.log(`    - ${motivo}: ${cantidad}`)
  }
  console.log(`  Familias distintas: ${familias.size}`)
  if (modoDryRun) {
    console.log('  (No se ha escrito nada en la base de datos.)')
  }
}

importar()
  .catch((error) => {
    console.error('Error al importar artículos:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

