import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PrismaClient } from '@prisma/client'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(__dirname, '..')

// Dos bases SQLite independientes: la real (DATABASE_URL, prisma/dev.db) y una
// de prueba con datos ficticios (prisma/demo.db). El modo activo se guarda en
// data/modo.json y solo lo respeta el servidor; los scripts (seed, importadores)
// siguen trabajando siempre con DATABASE_URL.
const RUTA_REAL = path.join(RAIZ, 'prisma', 'dev.db')
const RUTA_DEMO = path.join(RAIZ, 'prisma', 'demo.db')
const DIR_DATOS = path.resolve(process.cwd(), process.env.DATA_DIR || './data')
const FICHERO_MODO = path.join(DIR_DATOS, 'modo.json')
const esServidor = /[\/]server[\/]index\.js$/.test(process.argv[1] ?? '')

function leerModo() {
  if (!esServidor) return 'real'
  try {
    return JSON.parse(fs.readFileSync(FICHERO_MODO, 'utf8')).modo === 'demo' ? 'demo' : 'real'
  } catch {
    return 'real'
  }
}

function crearCliente(modo) {
  const opciones = { log: ['warn', 'error'] }
  if (modo === 'demo') opciones.datasourceUrl = `file:${RUTA_DEMO}`
  return new PrismaClient(opciones)
}

let modoActivo = leerModo()
let cliente = crearCliente(modoActivo)

export const modoActual = () => modoActivo
export const demoExiste = () => fs.existsSync(RUTA_DEMO)
export const rutaBaseActiva = () => (modoActivo === 'demo' ? RUTA_DEMO : RUTA_REAL)
// Las copias de seguridad de cada modo van en carpetas distintas para no mezclarlas.
export const carpetaBackups = () => path.join(DIR_DATOS, modoActivo === 'demo' ? 'backups-demo' : 'backups')

// Crea prisma/demo.db (esquema + usuarios + datos ficticios) con procesos hijos.
async function crearBaseDemo() {
  const env = { ...process.env, DATABASE_URL: 'file:./demo.db' }
  const opciones = { cwd: RAIZ, env }
  const prismaCli = path.join(RAIZ, 'node_modules', 'prisma', 'build', 'index.js')
  await execFileAsync(process.execPath, [prismaCli, 'db', 'push', '--skip-generate'], opciones)
  await execFileAsync(process.execPath, ['scripts/seed.js'], opciones)
  await execFileAsync(process.execPath, ['scripts/seed-demo.js'], opciones)
}

// Pone la base de prueba al día con el esquema actual (solo cambios aditivos: si
// el esquema creció desde que se creó demo.db, p. ej. una columna nueva, la añade).
async function sincronizarEsquemaDemo() {
  const env = { ...process.env, DATABASE_URL: 'file:./demo.db' }
  const prismaCli = path.join(RAIZ, 'node_modules', 'prisma', 'build', 'index.js')
  await execFileAsync(process.execPath, [prismaCli, 'db', 'push', '--skip-generate'], { cwd: RAIZ, env })
}

// Cambia de base en caliente: crea la demo si falta, abre el cliente nuevo,
// cierra el anterior y guarda el modo para los próximos arranques.
export async function cambiarModo(modo) {
  if (modo !== 'real' && modo !== 'demo') throw new Error('Modo no válido')
  if (modo === modoActivo) return modoActivo
  if (modo === 'demo') {
    if (demoExiste()) await sincronizarEsquemaDemo()
    else await crearBaseDemo()
  }

  const anterior = cliente
  cliente = crearCliente(modo)
  modoActivo = modo
  fs.mkdirSync(DIR_DATOS, { recursive: true })
  fs.writeFileSync(FICHERO_MODO, JSON.stringify({ modo }))
  await anterior.$disconnect().catch(() => {})
  return modoActivo
}

// Las rutas importan `prisma` como siempre; este proxy reenvía al cliente activo.
const prisma = new Proxy(
  {},
  {
    get(_, propiedad) {
      const valor = cliente[propiedad]
      return typeof valor === 'function' ? valor.bind(cliente) : valor
    },
  },
)

export default prisma
