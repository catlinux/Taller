import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import prisma from '../server/db.js'
import { importarBicicletas } from '../server/lib/importar.js'

// Importa las bicicletas desde el registro exportado del ERP antiguo.
// Uso: node scripts/import-bicicletas.js [ruta.csv] [--dry-run]
// - Se puede pasar un CSV alternativo como primer argumento posicional.
// - Con --dry-run se muestra el resumen sin escribir en la base de datos.
// - El import es idempotente: si ya existe una bicicleta del mismo cliente con
//   el mismo número de serie (o, si no hay serie, la misma marca y modelo),
//   se actualiza en lugar de duplicarse.
// - Cabecera esperada: CLIENT;MARCA;MODEL;Nº SERIE ;CATEGORIA
// La lógica vive en server/lib/importar.js; este script solo lee el fichero y
// imprime el resumen.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RUTA_POR_DEFECTO = path.resolve(__dirname, '../../datos-importar/Registre de bicicletes.csv')

// Separa los argumentos de la línea de comandos: opciones y ruta posicional.
const argumentos = process.argv.slice(2)
const modoDryRun = argumentos.includes('--dry-run')
const rutaArg = argumentos.find((arg) => !arg.startsWith('--'))
const RUTA_CSV = rutaArg ? path.resolve(process.cwd(), rutaArg) : RUTA_POR_DEFECTO

async function importar() {
  const texto = fs.readFileSync(RUTA_CSV, 'utf8')
  const resumen = await importarBicicletas(prisma, texto, { simular: modoDryRun })

  const totalOmitidas = resumen.omitidos.reduce((suma, omision) => suma + omision.cantidad, 0)
  console.log(resumen.simulado ? 'Simulación (--dry-run) del import de bicicletas:' : 'Import de bicicletas completado:')
  console.log(`  Leídas:       ${resumen.leidos}`)
  console.log(`  Creadas:      ${resumen.creados}`)
  console.log(`  Actualizadas: ${resumen.actualizados}`)
  console.log(`  Omitidas:     ${totalOmitidas}`)
  for (const { motivo, cantidad, lineas } of resumen.omitidos) {
    console.log(`    - ${motivo}: ${cantidad} (líneas: ${lineas.join(', ')})`)
  }
  if (resumen.simulado) {
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
