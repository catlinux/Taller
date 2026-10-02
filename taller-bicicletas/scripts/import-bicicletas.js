import path from 'node:path'
import { fileURLToPath } from 'node:url'
import prisma from '../server/db.js'
import { leerLineasCsv, dividirCampos, textoONull } from './lib/csv.js'

// Importa las bicicletas desde el registro exportado del ERP antiguo.
// Uso: node scripts/import-bicicletas.js [ruta.csv] [--dry-run]
// - Se puede pasar un CSV alternativo como primer argumento posicional.
// - Con --dry-run se muestra el resumen sin escribir en la base de datos.
// - El import es idempotente: si ya existe una bicicleta del mismo cliente con
//   el mismo número de serie (o, si no hay serie, la misma marca y modelo),
//   se actualiza en lugar de duplicarse.
// - Cabecera esperada: CLIENT;MARCA;MODEL;Nº SERIE ;CATEGORIA

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RUTA_POR_DEFECTO = path.resolve(__dirname, '../../datos-importar/Registre de bicicletes.csv')
const TAMANO_LOTE = 200

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

// Localiza la línea de cabeceras (empieza por 'CLIENT;') del registro de bicicletas.
function indiceCabecera(lineas) {
  return lineas.findIndex((linea) => /^CLIENT;/i.test(linea))
}

// Clave interna para detectar duplicados en el CSV y bicicletas ya existentes.
// Se usa el número de serie si lo hay; si no, la marca y el modelo.
function claveBicicleta(clienteId, marca, modelo, numeroSerie) {
  if (numeroSerie) return `${clienteId}|serie|${numeroSerie.toLowerCase()}`
  return `${clienteId}|mm|${marca.toLowerCase()}|${(modelo ?? '').toLowerCase()}`
}


// Lee y clasifica las filas del CSV. Devuelve { filas, omitidos }.
// Cada fila válida: { linea, clienteNumero, marca, modelo, numeroSerie, tipo }.
// omitidos: Map de motivo -> array de números de línea (1-based).
function leerBicicletas() {
  const lineas = leerLineasCsv(RUTA_CSV)
  const cabecera = indiceCabecera(lineas)
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
async function importar() {
  const { filas, omitidos } = leerBicicletas()

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
  if (!modoDryRun) {
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

  const totalOmitidos = [...omitidos.values()].reduce((suma, lineas) => suma + lineas.length, 0)
  console.log(modoDryRun ? 'Simulación (--dry-run) del import de bicicletas:' : 'Import de bicicletas completado:')
  console.log(`  Leídas:       ${filas.length}`)
  console.log(`  Creadas:      ${aCrear.length}`)
  console.log(`  Actualizadas: ${aActualizar.length}`)
  console.log(`  Omitidas:     ${totalOmitidos}`)
  for (const [motivo, lineas] of omitidos) {
    if (lineas.length > 0) {
      console.log(`    - ${motivo}: ${lineas.length} (líneas: ${lineas.join(', ')})`)
    }
  }
  if (modoDryRun) {
    console.log('  (No se ha escrito nada en la base de datos.)')
  }
}

importar()
  .catch((error) => {
    console.error('Error al importar bicicletas:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

