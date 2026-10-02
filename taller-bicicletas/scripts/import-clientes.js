import path from 'node:path'
import { fileURLToPath } from 'node:url'
import prisma from '../server/db.js'
import { leerLineasCsv, dividirCampos, indiceCabecera, textoONull } from './lib/csv.js'

// Importa los clientes desde el listado exportado del ERP antiguo.
// Uso: node scripts/import-clientes.js [ruta.csv] [--dry-run]
// - Se puede pasar un CSV alternativo como primer argumento posicional.
// - Con --dry-run se muestra el resumen sin escribir en la base de datos.
// - El import es un "upsert": crea los nuevos y actualiza los que ya existen.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RUTA_POR_DEFECTO = path.resolve(__dirname, '../../datos-importar/Listado de clientes.csv')
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

// Clasifica una fila del CSV: devuelve { cliente } o { motivo } de la omisión.
function clasificarCliente(campos) {
  const codigo = (campos[0] ?? '').trim()
  // El código debe ser un entero; se ignora cualquier otra cosa.
  if (!/^\d+$/.test(codigo)) return { motivo: 'sin código válido' }
  const nombre = (campos[1] ?? '').trim()
  if (nombre === '') return { motivo: 'sin nombre' }
  return {
    cliente: {
      numeroCliente: Number(codigo),
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

function leerClientes() {
  const lineas = leerLineasCsv(RUTA_CSV)
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

// Devuelve los datos a escribir en un update (sin la clave única).
function datosCliente(cliente) {
  const { numeroCliente, ...resto } = cliente
  return resto
}

async function importar() {
  const { clientes, omitidos } = leerClientes()

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
  if (!modoDryRun) {
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

  const totalOmitidos = Object.values(omitidos).reduce((suma, n) => suma + n, 0)
  console.log(modoDryRun ? 'Simulación (--dry-run) del import de clientes:' : 'Import de clientes completado:')
  console.log(`  Leídos:       ${clientes.length}`)
  console.log(`  Creados:      ${creados}`)
  console.log(`  Actualizados: ${actualizados}`)
  console.log(`  Omitidos:     ${totalOmitidos}`)
  for (const [motivo, cantidad] of Object.entries(omitidos)) {
    if (cantidad > 0) console.log(`    - ${motivo}: ${cantidad}`)
  }
  if (modoDryRun) {
    console.log('  (No se ha escrito nada en la base de datos.)')
  }
}

importar()
  .catch((error) => {
    console.error('Error al importar clientes:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
