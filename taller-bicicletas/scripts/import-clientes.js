import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import prisma from '../server/db.js'
import { importarClientes } from '../server/lib/importar.js'

// Importa los clientes desde el listado exportado del ERP antiguo.
// Uso: node scripts/import-clientes.js [ruta.csv] [--dry-run]
// - Se puede pasar un CSV alternativo como primer argumento posicional.
// - Con --dry-run se muestra el resumen sin escribir en la base de datos.
// - El import es un "upsert": crea los nuevos y actualiza los que ya existen.
// La lógica vive en server/lib/importar.js; este script solo lee el fichero y
// imprime el resumen.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RUTA_POR_DEFECTO = path.resolve(__dirname, '../../datos-importar/Listado de clientes.csv')

// Separa los argumentos de la línea de comandos: opciones y ruta posicional.
const argumentos = process.argv.slice(2)
const modoDryRun = argumentos.includes('--dry-run')
const rutaArg = argumentos.find((arg) => !arg.startsWith('--'))
const RUTA_CSV = rutaArg ? path.resolve(process.cwd(), rutaArg) : RUTA_POR_DEFECTO

async function importar() {
  const texto = fs.readFileSync(RUTA_CSV, 'utf8')
  const resumen = await importarClientes(prisma, texto, { simular: modoDryRun })

  const totalOmitidos = resumen.omitidos.reduce((suma, omision) => suma + omision.cantidad, 0)
  console.log(resumen.simulado ? 'Simulación (--dry-run) del import de clientes:' : 'Import de clientes completado:')
  console.log(`  Leídos:       ${resumen.leidos}`)
  console.log(`  Creados:      ${resumen.creados}`)
  console.log(`  Actualizados: ${resumen.actualizados}`)
  console.log(`  Omitidos:     ${totalOmitidos}`)
  for (const { motivo, cantidad } of resumen.omitidos) {
    console.log(`    - ${motivo}: ${cantidad}`)
  }
  if (resumen.simulado) {
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
